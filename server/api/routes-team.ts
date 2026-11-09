import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { MarketError } from '../marketplace/market.js'
import { containsContactDetails } from '../core/contact.js'
import { endSignInAs, issueInvite } from '../auth/access.js'
import { queueInviteEmail } from '../core/mail.js'

/*
 * Self-serve teams: a company's team managers invite colleagues, choose what each may do, and remove people who leave,
 * without asking Nashr. The rights are checked on the server for every step they cover (app.ts NEEDS). A company always
 * keeps at least one active team manager.
 */
const TEAM = ['buyer', 'seller'] as ('buyer' | 'seller')[]
const perms = { canPay: { type: 'boolean' }, canDecide: { type: 'boolean' }, canManage: { type: 'boolean' } }

async function member(db: any, companyId: string, id: string) {
  const u = (await db.query(`select * from users where id = $1 and company_id = $2 for update`, [id, companyId])).rows[0]
  if (!u) throw new NotFound()
  return u
}
async function keepAManager(db: any, companyId: string, exceptId: string) {
  const { n } = (await db.query(`select count(*)::int n from users where company_id = $1 and id <> $2 and status = 'active' and can_manage`, [companyId, exceptId])).rows[0]
  if (!n) throw new MarketError('Your company needs at least one active team manager. Make someone else a manager first.')
}

export function teamRoutes(route: RouteFn) {
  route('GET', '/api/team', TEAM, async ({ db, me }) => {
    const rows = (await db.query(`select u.id, u.name, u.email, u.status, u.can_pay, u.can_decide, u.can_manage, u.totp_enabled, u.created_at,
        (select max(s.last_seen_at) from sessions s where s.user_id = u.id) last_seen
      from users u where u.company_id = $1 order by (u.status = 'suspended'), u.created_at`, [me.actAs.companyId])).rows
    const you = rows.find(r => r.id === me.userId)
    return { youManage: !!you?.can_manage, members: rows.map(r => ({ id: r.id, name: r.name, email: r.email, status: r.status, canPay: r.can_pay, canDecide: r.can_decide,
      canManage: r.can_manage, twoStep: r.totp_enabled, lastSeen: r.last_seen, since: r.created_at, you: r.id === me.userId })) }
  })

  route('POST', '/api/team', TEAM, async ({ db, at, me }, req) => {
    const b = req.body, email = String(b.email).trim().toLowerCase(), name = String(b.name).trim()
    if (containsContactDetails(name)) throw new MarketError('Write just the name.')
    const company = (await db.query(`select id, name, type from companies where id = $1`, [me.actAs.companyId])).rows[0]
    // a colleague works for the same business: the email's domain must match the person inviting them (ponytail: a domain list per company later)
    const mine = (await db.query(`select email from users where id = $1`, [me.userId])).rows[0].email.split('@')[1]
    if (email.split('@')[1] !== mine) throw new MarketError(`Invite colleagues with a work email at ${mine}. For anyone else, ask Nashr.`)
    if ((await db.query(`select 1 from users where lower(email) = $1`, [email])).rowCount) throw new MarketError('Someone already uses this email on Nashr.')
    const u = (await db.query(`insert into users (company_id, email, name, role, created_at, can_pay, can_decide, can_manage) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [company.id, email, name, company.type === 'publisher' ? 'seller' : 'buyer', at, !!b.canPay, !!b.canDecide, !!b.canManage])).rows[0]
    const token = await issueInvite(db, u.id, at)
    await audit(db, `user:${me.userId}`, 'team.invited', 'user', u.id, { email, canPay: !!b.canPay, canDecide: !!b.canDecide, canManage: !!b.canManage }, at)
    const emailed = await queueInviteEmail(db, { userId: u.id, to: email, name, company: company.name, link: `/invite#${token}` }, at)
    return { id: u.id, inviteLink: `/invite#${token}`, emailed }
  }, { type: 'object', required: ['name', 'email'], additionalProperties: false, properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 }, email: { type: 'string', format: 'email', maxLength: 200 }, ...perms } })

  route('PUT', '/api/team/:id', TEAM, async ({ db, at, me }, req) => {
    const u = await member(db, me.actAs.companyId, req.params.id), b = req.body
    if (u.can_manage && b.canManage === false) await keepAManager(db, me.actAs.companyId, u.id)
    await db.query(`update users set can_pay = coalesce($2, can_pay), can_decide = coalesce($3, can_decide), can_manage = coalesce($4, can_manage) where id = $1`,
      [u.id, b.canPay ?? null, b.canDecide ?? null, b.canManage ?? null])
    await audit(db, `user:${me.userId}`, 'team.rights_changed', 'user', u.id, b, at)
    return { ok: true }
  }, { type: 'object', additionalProperties: false, properties: perms })

  // Someone leaves: they are signed out at once and cannot sign in again; their past bookings stay with the company.
  route('POST', '/api/team/:id/remove', TEAM, async ({ db, at, me }, req) => {
    const u = await member(db, me.actAs.companyId, req.params.id)
    if (u.id === me.userId) throw new MarketError('You cannot remove yourself. Ask another team manager.')
    if (u.can_manage) await keepAManager(db, me.actAs.companyId, u.id)
    await db.query(`update users set status = 'suspended' where id = $1`, [u.id])
    await db.query(`update invites set used_at = $2 where user_id = $1 and used_at is null`, [u.id, at])
    await db.query(`delete from sessions where user_id = $1`, [u.id])
    await endSignInAs(db, u.id)
    await audit(db, `user:${me.userId}`, 'team.removed', 'user', u.id, null, at)
    await notify(db, me.actAs.companyId, 'team.removed', null, { user: u.name }, at)
    return { ok: true }
  })

  route('POST', '/api/team/:id/restore', TEAM, async ({ db, at, me }, req) => {
    const u = await member(db, me.actAs.companyId, req.params.id)
    if (u.status !== 'suspended') throw new MarketError('This person is not removed.')
    if (!u.password_hash) throw new MarketError('This person never joined. Send them a new invite instead.')
    await db.query(`update users set status = 'active' where id = $1`, [u.id])
    await audit(db, `user:${me.userId}`, 'team.restored', 'user', u.id, null, at)
    return { ok: true }
  })

  route('POST', '/api/team/:id/invite', TEAM, async ({ db, at, me }, req) => {
    const u = await member(db, me.actAs.companyId, req.params.id)
    if (u.status !== 'invited') throw new MarketError('This person has already joined.')
    await db.query(`update invites set used_at = $2 where user_id = $1 and used_at is null`, [u.id, at])
    const token = await issueInvite(db, u.id, at)
    const company = (await db.query(`select name from companies where id = $1`, [me.actAs.companyId])).rows[0].name
    const emailed = await queueInviteEmail(db, { userId: u.id, to: u.email, name: u.name, company, link: `/invite#${token}` }, at)
    await audit(db, `user:${me.userId}`, 'team.invite_reissued', 'user', u.id, null, at)
    return { inviteLink: `/invite#${token}`, emailed }
  })
}
