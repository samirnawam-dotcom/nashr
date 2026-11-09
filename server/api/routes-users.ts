import type { RouteFn } from './app.js'
import { queueInviteEmail } from '../core/mail.js'
import { NotFound } from './app.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { MarketError } from '../marketplace/market.js'
import { endSignInAs, issueInvite, termsVersion } from '../auth/access.js'
import { containsContactDetails } from '../core/contact.js'
import { sendCsv } from './csv.js'

/*
 * Nashr's team manages every user here: find anyone, see what they did and from where, and act (sign them out everywhere,
 * add a colleague to a company, resend an invite). Suspend, reset links, two-step resets and "sign in as" live on the same
 * page and keep their own rules. Every action is in the audit log under the staff member's name.
 */
const STAFF: ['admin'] = ['admin']
const isStaff = (role: string) => role === 'admin' || role === 'founder'

export function userRoutes(route: RouteFn) {
  route('GET', '/api/admin/users', STAFF, async ({ db, at }, req, reply) => {
    const q = req.query
    const w: string[] = [], args: unknown[] = [at]
    const add = (v: unknown) => { args.push(v); return `$${args.length}` }
    if (q.q) { const p = add(`%${String(q.q).trim()}%`); w.push(`(u.name ilike ${p} or u.email ilike ${p} or c.name ilike ${p})`) }
    if (q.role) w.push(`u.role = any(${add(String(q.role).split(','))})`)
    if (q.status) w.push(`u.status = ${add(q.status)}`)
    if (q.twoStep === 'on' || q.twoStep === 'off') w.push(`u.totp_enabled = ${q.twoStep === 'on'}`)
    if (q.flag === 'failed') w.push(`exists (select 1 from login_events l where l.user_id = u.id and not l.success and l.reason in ('password', 'code') and l.at > $1::timestamptz - interval '24 hours')`)
    if (q.flag === 'never') w.push(`not exists (select 1 from login_events l where l.user_id = u.id and l.success)`)
    if (q.flag === 'terms') w.push(`u.role in ('buyer', 'seller') and u.terms_version is distinct from ${add(await termsVersion(db, at))}`)
    const where = w.length ? `where ${w.join(' and ')}` : ''
    const sort = ({ name: 'u.name', company: 'c.name, u.name', last: 'last_seen desc nulls last', created: 'u.created_at desc' } as Record<string, string>)[q.sort] ?? 'last_seen desc nulls last'
    const csv = q.format === 'csv', limit = csv ? 20000 : Math.min(Number(q.limit) || 50, 200), offset = csv ? 0 : Number(q.offset) || 0
    const rows = (await db.query(`select u.id, u.name, u.email, u.role, u.status, u.totp_enabled, u.created_at, u.terms_version, c.id company_id, c.name company, c.type company_type,
        (select max(l.at) from login_events l where l.user_id = u.id and l.success) last_sign_in,
        (select max(s.last_seen_at) from sessions s where s.user_id = u.id) last_seen,
        (select count(*)::int from sessions s where s.user_id = u.id and s.expires_at > $1) sessions,
        (select count(*)::int from login_events l where l.user_id = u.id and not l.success and l.reason in ('password', 'code') and l.at > $1::timestamptz - interval '24 hours') failed_24h,
        count(*) over ()::int total
      from users u join companies c on c.id = u.company_id ${where} order by ${sort} limit ${limit} offset ${offset}`, args)).rows
    if (csv) return sendCsv(reply, 'nashr-users', ['Name', 'Email', 'Company', 'Role', 'Status', 'Two-step', 'Last sign-in', 'Last seen', 'Failed sign-ins (24 h)', 'Joined'],
      rows.map(r => [r.name, r.email, r.company, r.role, r.status, r.totp_enabled ? 'on' : 'off', r.last_sign_in, r.last_seen, r.failed_24h, r.created_at]))
    return { total: rows[0]?.total ?? 0, items: rows.map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, twoStep: r.totp_enabled,
      company: { id: r.company_id, name: r.company, type: r.company_type }, lastSignIn: r.last_sign_in, lastSeen: r.last_seen, sessions: r.sessions,
      failed24h: r.failed_24h, createdAt: r.created_at })) }
  })

  // One person: who they are, where they are signed in, how they signed in, and what they did.
  route('GET', '/api/admin/users/:id', STAFF, async ({ db, at }, req) => {
    const u = (await db.query(`select u.*, c.name company, c.type company_type from users u join companies c on c.id = u.company_id where u.id = $1`, [req.params.id])).rows[0]
    if (!u) throw new NotFound()
    const sessions = (await db.query(`select s.created_at, s.last_seen_at, s.expires_at, s.ip, s.user_agent, s.act_as_until, t.name acting_as
        from sessions s left join users t on t.id = s.act_as_user_id where s.user_id = $1 and s.expires_at > $2 order by s.created_at desc`, [u.id, at])).rows
    const helping = (await db.query(`select s.act_as_until, s.act_as_reason, st.name staff from sessions s join users st on st.id = s.user_id
        where s.act_as_user_id = $1 and s.act_as_until > $2`, [u.id, at])).rows
    const signIns = (await db.query(`select at, ip, user_agent, success, reason from login_events where user_id = $1 or lower(email) = lower($2)
        order by at desc limit 50`, [u.id, u.email])).rows
    const actors = isStaff(u.role) ? [`admin:${u.id}`, `user:${u.id}`] : [`user:${u.id}`, `${u.role}:${u.company_id}`]
    const activity = (await db.query(`select at, actor, action, entity, entity_id, detail from audit_log
        where (actor = any($1) or entity_id = $2) and action <> 'view_as.page' order by id desc limit 100`, [actors, u.id])).rows
    const reset = (await db.query(`select requested_at, issued_at from password_resets where user_id = $1 and used_at is null order by requested_at desc limit 1`, [u.id])).rows[0]
    return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, twoStep: u.totp_enabled, createdAt: u.created_at,
      company: { id: u.company_id, name: u.company, type: u.company_type },
      terms: { version: u.terms_version, acceptedAt: u.terms_accepted_at, current: u.terms_version === await termsVersion(db, at) },
      resetRequested: !!reset && !reset.issued_at,
      sessions: sessions.map(s => ({ createdAt: s.created_at, lastSeen: s.last_seen_at, expiresAt: s.expires_at, ip: s.ip, device: s.user_agent,
        actingAs: s.acting_as && s.act_as_until > at ? s.acting_as : null })),
      helping: helping.map(h => ({ staff: h.staff, until: h.act_as_until, reason: h.act_as_reason })),
      signIns: signIns.map(l => ({ at: l.at, ip: l.ip, device: l.user_agent, success: l.success, reason: l.reason })),
      activity: activity.map(a => ({ at: a.at, actor: a.actor, action: a.action, entity: a.entity, entityId: a.entity_id, detail: a.detail })) }
  })

  // Sign someone out everywhere (a lost laptop, a person leaving): every session ends; staff accounts only by the founder.
  route('POST', '/api/admin/users/:id/sign-out', STAFF, async ({ db, at, me }, req) => {
    const u = (await db.query(`select id, name, role, company_id from users where id = $1`, [req.params.id])).rows[0]
    if (!u) throw new NotFound()
    if (isStaff(u.role) && me.role !== 'founder') throw new MarketError('Only the founder can sign a staff member out.')
    const reason = String(req.body.reason ?? '').trim()
    if (reason.length < 5) throw new MarketError('Write why this person is being signed out.')
    const n = (await db.query(`delete from sessions where user_id = $1 and token_hash <> $2`, [u.id, me.tokenHash])).rowCount
    await endSignInAs(db, u.id)
    await audit(db, `admin:${me.userId}`, 'user.signed_out', 'user', u.id, { reason, sessions: n }, at)
    if (!isStaff(u.role)) await notify(db, u.company_id, 'access.signed_out', null, { user: u.name, reason }, at)
    return { sessions: n }
  }, { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string', maxLength: 500 } } })

  // Add a colleague to a buyer or publisher company: an invite link for them to set a password (and accept the terms).
  route('POST', '/api/admin/companies/:id/users', STAFF, async ({ db, at, me }, req) => {
    const c = (await db.query(`select id, name, type from companies where id = $1 and type in ('buyer', 'publisher')`, [req.params.id])).rows[0]
    if (!c) throw new NotFound()
    const b = req.body, email = String(b.email).trim().toLowerCase()
    if (containsContactDetails(b.name)) throw new MarketError('Write just the name.')
    if ((await db.query(`select 1 from users where lower(email) = $1`, [email])).rowCount) throw new MarketError('Someone already uses this email on Nashr.')
    const user = (await db.query(`insert into users (company_id, email, name, phone, role, created_at) values ($1, $2, $3, $4, $5, $6) returning id`,
      [c.id, email, String(b.name).trim(), b.phone?.trim() || null, c.type === 'publisher' ? 'seller' : 'buyer', at])).rows[0]
    const token = await issueInvite(db, user.id, at)
    await audit(db, `admin:${me.userId}`, 'user.invited', 'user', user.id, { company: c.name, email }, at)
    const emailed = await queueInviteEmail(db, { userId: user.id, to: email, name: String(b.name).trim(), company: c.name, link: `/invite#${token}` }, at)
    return { userId: user.id, inviteLink: `/invite#${token}`, emailed }
  }, { type: 'object', required: ['name', 'email'], additionalProperties: false, properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 }, email: { type: 'string', format: 'email', maxLength: 200 }, phone: { type: 'string', maxLength: 40 } } })

  // A new invite link for someone who has not joined yet (the old one stops working).
  route('POST', '/api/admin/users/:id/invite', STAFF, async ({ db, at, me }, req) => {
    const u = (await db.query(`select id, role from users where id = $1 and status = 'invited'`, [req.params.id])).rows[0]
    if (!u) throw new MarketError('This person has already joined.')
    if (isStaff(u.role) && me.role !== 'founder') throw new MarketError('Only the founder can invite staff.')
    await db.query(`update invites set used_at = $2 where user_id = $1 and used_at is null`, [u.id, at])
    const token = await issueInvite(db, u.id, at)
    await audit(db, `admin:${me.userId}`, 'user.invite_reissued', 'user', u.id, null, at)
    return { inviteLink: `/invite#${token}` }
  })

  // Security at a glance: sign-ins today, failures, locked accounts, busy addresses, who is signed in, who is being helped.
  route('GET', '/api/admin/security', STAFF, async ({ db, at }) => {
    const k = (await db.query(`select
        (select count(*)::int from login_events where success and at > $1::timestamptz - interval '24 hours') signins_24h,
        (select count(*)::int from login_events where not success and reason in ('password', 'code') and at > $1::timestamptz - interval '24 hours') failed_24h,
        (select count(distinct user_id)::int from sessions where expires_at > $1 and last_seen_at > $1::timestamptz - interval '15 minutes') active_now,
        (select count(*)::int from sessions s join users u on u.id = s.user_id where s.act_as_until > $1) helping_now,
        (select count(*)::int from users where status = 'suspended') suspended,
        (select count(*)::int from users where role in ('buyer', 'seller') and status = 'active' and not totp_enabled) without_two_step`, [at])).rows[0]
    const locked = (await db.query(`select lower(email) email, count(*)::int failures, max(at) last from login_events where not success and reason in ('password', 'code')
        and at > $1::timestamptz - interval '15 minutes' group by lower(email) having count(*) >= 10 order by last desc`, [at])).rows
    const addresses = (await db.query(`select ip, count(*)::int failures, count(distinct lower(email))::int accounts, max(at) last from login_events
        where not success and reason in ('password', 'code') and at > $1::timestamptz - interval '24 hours' and ip is not null group by ip order by failures desc limit 10`, [at])).rows
    const recent = (await db.query(`select l.at, l.email, l.ip, l.success, l.reason, u.name, u.id user_id from login_events l left join users u on u.id = l.user_id
        order by l.at desc limit 30`)).rows
    return { ...k, locked, addresses, recent: recent.map(r => ({ at: r.at, email: r.email, ip: r.ip, success: r.success, reason: r.reason, name: r.name, userId: r.user_id })) }
  })
}
