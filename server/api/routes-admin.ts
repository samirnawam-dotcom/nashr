import { NotFound, type RouteFn } from './app.js'
import { audit } from '../core/audit.js'
import { changeSetting } from '../core/settings.js'
import { MarketError } from '../marketplace/market.js'
import { approveAccess, decideAccess } from '../auth/access.js'
import { decideDispute } from '../payments/payments.js'

const STAFF: ['admin'] = ['admin'] // founders pass every admin check (app.ts)
// Financial settings are the founder's (brief section 2).
const FOUNDER_ONLY = /^(commission:|default_commission_bp|nashr_vat|media_vat_bp|processing_fee|cancel_fee_bp)/

export function adminRoutes(route: RouteFn) {
  route('GET', '/api/admin/access-requests', STAFF, async ({ db }) =>
    (await db.query(`select * from access_requests order by (status = 'pending') desc, created_at desc`)).rows)

  route('POST', '/api/admin/access-requests/:id/approve', STAFF, async ({ db, at, me }, req) => {
    const r = await approveAccess(db, req.params.id, `admin:${me.userId}`, at)
    return { companyId: r.companyId, inviteLink: `/invite#${r.inviteToken}` } // emailed to the applicant (D: email delivery)
  })

  route('POST', '/api/admin/access-requests/:id/decide', STAFF, async ({ db, at, me }, req) => {
    await decideAccess(db, req.params.id, req.body.decision, req.body.reason, `admin:${me.userId}`, at)
    return { ok: true }
  }, { type: 'object', required: ['decision', 'reason'], properties: { decision: { enum: ['rejected', 'info'] }, reason: { type: 'string', maxLength: 1000 } } })

  route('GET', '/api/admin/deals', STAFF, async ({ db }) => (await db.query(
    `select d.id, d.ref, d.status, d.amount, d.currency, d.commission_bp, d.next_deadline_at, bc.name buyer, sc.name seller
     from deals d join companies bc on bc.id = d.buyer_id join companies sc on sc.id = d.seller_id order by d.created_at desc limit 500`)).rows)

  route('POST', '/api/admin/deals/:id/dispute', STAFF, async ({ db, at, me }, req) => {
    const d = await decideDispute(db, req.params.id, req.body.outcome, `admin:${me.userId}`, at, req.body.amount)
    return { status: d.status }
  }, { type: 'object', required: ['outcome'], properties: { outcome: { enum: ['release', 'refund', 'partial_refund', 'make_good'] }, amount: { type: 'integer', minimum: 1 } } })

  route('PUT', '/api/admin/settings/:key', STAFF, async ({ db, at, me }, req, reply) => {
    if (FOUNDER_ONLY.test(req.params.key) && me.role !== 'founder') return reply.code(403).send({ error: 'Only the founder can change financial settings.' })
    const known = await db.query(`select 1 from settings where key = $1 limit 1`, [req.params.key])
    if (!known.rowCount && !req.params.key.startsWith('commission:')) throw new MarketError('Unknown setting.')
    await changeSetting(db, req.params.key, req.body.value, `${me.role}:${me.userId}`, at)
    return { ok: true }
  }, { type: 'object', required: ['value'], properties: { value: {} } })

  route('GET', '/api/admin/audit', STAFF, async ({ db }, req) => (await db.query(
    `select at, actor, action, entity, entity_id, detail from audit_log where ($1::text is null or entity_id = $1) order by id desc limit 500`,
    [req.query.entityId ?? null])).rows)

  // View any publisher or buyer account, read-only; every page viewed is logged (SPEC 12.1).
  route('POST', '/api/admin/view-as/:companyId', STAFF, async ({ db, at, me }, req) => {
    const c = (await db.query(`select id, name, type from companies where id = $1 and type in ('buyer', 'publisher')`, [req.params.companyId])).rows[0]
    if (!c) throw new NotFound()
    await db.query(`update sessions set view_as_company_id = $2 where token_hash = $1`, [me.tokenHash, c.id])
    await audit(db, `admin:${me.userId}`, 'view_as.started', 'company', c.id, { name: c.name }, at)
    return { viewing: c.name, viewOnly: true }
  })

  route('DELETE', '/api/admin/view-as', STAFF, async ({ db, at, me }) => {
    await db.query(`update sessions set view_as_company_id = null where token_hash = $1`, [me.tokenHash])
    if (me.viewAs) await audit(db, `admin:${me.userId}`, 'view_as.ended', 'company', me.viewAs.companyId, null, at)
    return { ok: true }
  })
}
