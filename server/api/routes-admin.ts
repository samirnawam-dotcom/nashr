import { NotFound, type RouteFn } from './app.js'
import { audit } from '../core/audit.js'
import { changeSetting } from '../core/settings.js'
import { MarketError, voidBid } from '../marketplace/market.js'
import { sendCsv } from './csv.js'
import { approveAccess, decideAccess, reissueAccessInvite } from '../auth/access.js'
import { decideDispute, intervene } from '../payments/payments.js'

const STAFF: ['admin'] = ['admin'] // founders pass every admin check (app.ts)
// Financial settings are the founder's (brief section 2).
export const FOUNDER_ONLY = /^(commission:|default_commission_bp|nashr_vat|nashr_trn|nashr_legal_name|media_vat_bp|processing_fee|cancel_fee_bp|free_cancel_hours|review_working_days|proof_due_working_days|media_invoice_timing|open_markets)/

export function adminRoutes(route: RouteFn) {
  route('GET', '/api/admin/access-requests', STAFF, async ({ db }) =>
    (await db.query(`select r.*, exists (select 1 from users u where lower(u.email) = lower(r.email) and u.status = 'invited') invite_pending
                     from access_requests r order by (r.status = 'pending') desc, r.created_at desc`)).rows)

  route('POST', '/api/admin/access-requests/:id/invite', STAFF, async ({ db, at, me }, req) =>
    ({ inviteLink: `/invite#${await reissueAccessInvite(db, req.params.id, `admin:${me.userId}`, at)}` }))

  route('POST', '/api/admin/access-requests/:id/approve', STAFF, async ({ db, at, me }, req) => {
    const r = await approveAccess(db, req.params.id, `admin:${me.userId}`, at)
    return { companyId: r.companyId, inviteLink: `/invite#${r.inviteToken}` } // emailed to the applicant (D: email delivery)
  })

  route('POST', '/api/admin/access-requests/:id/decide', STAFF, async ({ db, at, me }, req) => {
    await decideAccess(db, req.params.id, req.body.decision, req.body.reason, `admin:${me.userId}`, at)
    return { ok: true }
  }, { type: 'object', required: ['decision', 'reason'], properties: { decision: { enum: ['rejected', 'info'] }, reason: { type: 'string', maxLength: 1000 } } })

  // Every deal, filtered and paged on the server; the same filters download as CSV (format=csv) for finance and the founder.
  route('GET', '/api/admin/deals', STAFF, async ({ db }, req, reply) => {
    const q = req.query, params: unknown[] = [], add = (v: unknown) => { params.push(v); return `$${params.length}` }
    const w: string[] = ['true']
    if (q.status) w.push(`d.status = any(${add(String(q.status).split(','))}::text[])`)
    if (q.kind) w.push(`d.kind = ${add(q.kind)}`)
    if (q.channel) w.push(`o.channel = ${add(q.channel)}`)
    if (q.from) w.push(`s.starts_at >= ${add(q.from)}::date`)
    if (q.to) w.push(`s.starts_at < ${add(q.to)}::date + 1`)
    if (q.q) { const p = add(`%${q.q}%`); w.push(`(d.ref ilike ${p} or bc.name ilike ${p} or sc.name ilike ${p} or o.name ilike ${p})`) }
    const base = `from deals d join companies bc on bc.id = d.buyer_id join companies sc on sc.id = d.seller_id join slots s on s.id = d.slot_id
      join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where ${w.join(' and ')}`
    const cols = `d.id, d.ref, d.status, d.kind, d.amount, d.currency, d.commission_bp, d.next_deadline_at, d.created_at, d.accepted_at, bc.name buyer, sc.name seller,
      o.name outlet, o.channel, s.label, s.starts_at`
    if (q.format === 'csv') {
      const rows = (await db.query(`select ${cols} ${base} order by d.created_at desc limit 20000`, params)).rows
      return sendCsv(reply, 'nashr-deals', ['Order', 'Status', 'Kind', 'Buyer', 'Publisher', 'Outlet', 'Channel', 'Slot', 'Airs', 'Price (AED, excl. VAT)', 'Commission %', 'Created', 'Accepted'],
        rows.map(r => [r.ref, r.status, r.kind, r.buyer, r.seller, r.outlet, r.channel, r.label, r.starts_at, (Number(r.amount) / 100).toFixed(2),
          r.commission_bp != null ? r.commission_bp / 100 : '', r.created_at, r.accepted_at]))
    }
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50) || 50)), offset = Math.max(0, Number(q.offset ?? 0) || 0)
    const [{ total, value }] = (await db.query(`select count(*)::int total, coalesce(sum(d.amount), 0)::bigint value ${base}`, params)).rows
    const items = (await db.query(`select ${cols} ${base} order by d.created_at desc limit ${limit} offset ${offset}`, params)).rows
    return { total, value: Number(value), items }
  })

  route('POST', '/api/admin/deals/:id/dispute', STAFF, async ({ db, at, me }, req) => {
    // the written reason goes on the deal's record and to both sides with the decision
    const d = await decideDispute(db, req.params.id, req.body.outcome, `admin:${me.userId}`, at, req.body.amount, req.body.reason)
    return { status: d.status }
  }, { type: 'object', required: ['outcome'], properties: { outcome: { enum: ['release', 'refund', 'partial_refund', 'make_good'] }, amount: { type: 'integer', minimum: 1 },
    reason: { type: 'string', maxLength: 1000 } } })

  // Step in on any live deal: cancel before payment, refund (full or part), or release to the publisher, with a reason both sides see.
  route('POST', '/api/admin/deals/:id/intervene', STAFF, async ({ db, at, me }, req) => {
    const d = await intervene(db, { dealId: req.params.id, ...req.body, actor: `${me.role}:${me.userId}` }, at)
    return { status: d.status }
  }, { type: 'object', required: ['action', 'reason'], additionalProperties: false, properties: { action: { enum: ['cancel', 'refund', 'release', 'partial_refund'] },
    reason: { type: 'string', minLength: 1, maxLength: 1000 }, amount: { type: 'integer', minimum: 1 }, cost: { enum: ['buyer', 'seller', 'nashr'] } } })

  // One slot with every bid on it, for Nashr to void a bid (SPEC G11).
  route('GET', '/api/admin/slots/:id', STAFF, async ({ db }, req) => {
    const s = (await db.query(`select s.*, p.name placement, o.name outlet, o.channel, c.name company from slots s join placements p on p.id = s.placement_id
      join outlets o on o.id = p.outlet_id join companies c on c.id = o.company_id where s.id = $1`, [req.params.id])).rows[0]
    if (!s) throw new NotFound()
    const bids = (await db.query(`select b.id, b.kind, b.amount, b.max_amount, b.status, b.seq, b.created_at, c.name buyer from bids b join companies c on c.id = b.buyer_id
      where b.slot_id = $1 order by b.seq desc`, [s.id])).rows
    const deals = (await db.query(`select id, ref, status, amount from deals where slot_id = $1 order by created_at desc`, [s.id])).rows
    return { id: s.id, outlet: s.outlet, company: s.company, channel: s.channel, placement: s.placement, label: s.label, startsAt: s.starts_at, closesAt: s.closes_at,
      saleType: s.sale_type, status: s.status, startingPrice: s.starting_price, reservePrice: s.reserve_price, topAmount: s.top_amount, topMax: s.top_max,
      bids: bids.map(b => ({ id: b.id, kind: b.kind, amount: b.amount, max: b.max_amount, status: b.status, at: b.created_at, buyer: b.buyer })), deals }
  })
  route('POST', '/api/admin/bids/:id/void', STAFF, async ({ db, at, me }, req) => {
    await voidBid(db, req.params.id, req.body.reason, `${me.role}:${me.userId}`, at)
    return { ok: true }
  }, { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string', minLength: 1, maxLength: 1000 } } })

  route('PUT', '/api/admin/settings/:key', STAFF, async ({ db, at, me }, req, reply) => {
    if (FOUNDER_ONLY.test(req.params.key) && me.role !== 'founder') return reply.code(403).send({ error: 'Only the founder can change financial settings.' })
    const known = (await db.query(`select value from settings where key = $1 order by valid_from desc limit 1`, [req.params.key])).rows[0]
    if (!known && !req.params.key.startsWith('commission:')) throw new MarketError('Unknown setting.')
    // The new value keeps the old one's type (a number stays a number, a list stays a list); commission is basis points.
    const kind = (v: unknown) => Array.isArray(v) ? 'list' : v === null ? 'null' : typeof v
    const expected = known ? kind(known.value) : 'number'
    if (expected !== 'null' && kind(req.body.value) !== expected) throw new MarketError(`This setting takes a ${expected}.`)
    if (typeof req.body.value === 'number' && (!Number.isInteger(req.body.value) || req.body.value < 0)) throw new MarketError('Use a whole number, zero or more.')
    await changeSetting(db, req.params.key, req.body.value, `${me.role}:${me.userId}`, at)
    return { ok: true }
  }, { type: 'object', required: ['value'], properties: { value: {} } })

  // The audit log, searchable by who, what and when (the sweeper's once-a-minute heartbeat is for monitoring, so it is left out).
  route('GET', '/api/admin/audit', STAFF, async ({ db }, req, reply) => {
    const q = req.query
    const rows = (await db.query(`select at, actor, action, entity, entity_id, detail from audit_log
      where ($1::text is null or entity_id = $1) and action <> 'sweeper.heartbeat'
        and ($2::text is null or actor ilike '%' || $2 || '%') and ($3::text is null or action ilike $3 || '%')
        and ($4::date is null or at >= $4::date) and ($5::date is null or at < $5::date + 1)
      order by id desc limit ${q.format === 'csv' ? 50000 : 500}`, [q.entityId ?? null, q.actor || null, q.action || null, q.from || null, q.to || null])).rows
    if (q.format === 'csv') return sendCsv(reply, 'nashr-audit', ['At', 'Actor', 'Action', 'Entity', 'Entity id', 'Detail'],
      rows.map(r => [r.at, r.actor, r.action, r.entity, r.entity_id, r.detail ? JSON.stringify(r.detail) : '']))
    return rows
  })

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
