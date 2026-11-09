import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { MarketError } from '../marketplace/market.js'
import { containsContactDetails } from '../core/contact.js'
import { audit } from '../core/audit.js'
import { buyerStatus } from './shapes.js'
import { sendCsv } from './csv.js'
import { split } from '../core/money.js'

const BUYER: ['buyer'] = ['buyer']
const BOOKED = `('awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out')`
const PAID = `('secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out')`

/*
 * Clients, for agencies (and any buyer booking for more than one brand): each booking can name the client it is for. A client
 * has its own industry (checked against brand safety like the brief's), an optional budget (shown, or enforced when the
 * agency chooses), and its own list of bookings, receipts and a report to send on.
 */
const TOTALS = `select c.*,
    coalesce((select sum(d.amount) from deals d where d.client_id = c.id and d.status in ${BOOKED}), 0)::bigint committed,
    coalesce((select sum(d.amount) from deals d where d.client_id = c.id and d.status = 'awaiting_seller'), 0)::bigint pending,
    coalesce((select sum(d.amount) from deals d where d.client_id = c.id and d.status in ${PAID}), 0)::bigint paid,
    (select count(*) from deals d where d.client_id = c.id and d.status in ${BOOKED})::int bookings
  from clients c where c.buyer_id = $1`

const card = (c: any) => ({ id: c.id, name: c.name, industry: c.industry, trn: c.trn, address: c.address, budget: c.budget == null ? null : Number(c.budget),
  budgetStop: c.budget_stop, status: c.status, committed: Number(c.committed), pending: Number(c.pending), paid: Number(c.paid), bookings: c.bookings,
  remaining: c.budget == null ? null : Number(c.budget) - Number(c.committed) - Number(c.pending) })

const body = { type: 'object', additionalProperties: false, properties: {
  name: { type: 'string', minLength: 1, maxLength: 200 }, industry: { type: 'string', maxLength: 100 }, trn: { type: 'string', maxLength: 30 },
  address: { type: 'string', maxLength: 500 }, budget: { type: ['integer', 'null'], minimum: 1 }, budgetStop: { type: 'boolean' },
  status: { enum: ['active', 'archived'] } } }

const COLS: Record<string, string> = { name: 'name', industry: 'industry', trn: 'trn', address: 'address', budget: 'budget', budgetStop: 'budget_stop', status: 'status' }

function check(b: any) {
  if (b.name != null && !b.name.trim()) throw new MarketError('Add the client\'s name.')
  if (b.trn && !/^\d{15}$/.test(b.trn.replace(/\s/g, ''))) throw new MarketError('A UAE TRN has 15 digits.')
  if (containsContactDetails(b.name) || containsContactDetails(b.address)) throw new MarketError('Leave out email addresses and phone numbers.')
  if (b.trn) b.trn = b.trn.replace(/\s/g, '')
}

const nameTaken = (e: any) => { if (e?.code === '23505') throw new MarketError('You already have a client with this name.'); throw e }

export function clientRoutes(route: RouteFn) {
  route('GET', '/api/clients', BUYER, async ({ db, me }) =>
    (await db.query(`${TOTALS} order by c.status, lower(c.name)`, [me.actAs.companyId])).rows.map(card))

  route('POST', '/api/clients', BUYER, async ({ db, at, me }, req) => {
    const b = req.body; check(b)
    const c = (await db.query(`insert into clients (buyer_id, name, industry, trn, address, budget, budget_stop, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [me.actAs.companyId, b.name.trim(), b.industry || null, b.trn || null, b.address || null, b.budget ?? null, b.budgetStop ?? false, at]).catch(nameTaken)).rows[0]
    await audit(db, `user:${me.userId}`, 'client.added', 'client', c.id, { name: b.name }, at)
    return { id: c.id }
  }, { ...body, required: ['name'] })

  route('PUT', '/api/clients/:id', BUYER, async ({ db, at, me }, req) => {
    const b = req.body; check(b)
    const set = Object.entries(COLS).filter(([k]) => k in b)
    if (!set.length) throw new MarketError('Nothing to change.')
    const vals = set.map(([k]) => (typeof b[k] === 'string' && k !== 'status' ? b[k].trim() || null : b[k]))
    const r = await db.query(`update clients set ${set.map(([, c], i) => `${c} = $${i + 3}`).join(', ')} where id = $1 and buyer_id = $2`,
      [req.params.id, me.actAs.companyId, ...vals]).catch(nameTaken)
    if (!r.rowCount) throw new NotFound()
    await audit(db, `user:${me.userId}`, 'client.changed', 'client', req.params.id, b, at)
    return { ok: true }
  }, body)

  /** One client: totals, campaigns, every booking and the documents Nashr issued for them. */
  route('GET', '/api/clients/:id', BUYER, async ({ db, me }, req) => {
    const c = (await db.query(`${TOTALS} and c.id = $2`, [me.actAs.companyId, req.params.id])).rows[0]
    if (!c) throw new NotFound()
    const [deals, docs, campaigns] = await Promise.all([
      db.query(`select d.id, d.ref, d.status, d.amount, d.currency, s.label, s.starts_at, o.name outlet, o.channel from deals d join slots s on s.id = d.slot_id
                join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where d.client_id = $1 order by s.starts_at desc`, [c.id]),
      db.query(`select x.id, x.type, x.number, x.total, x.currency, x.issued_at, d.ref from documents x join deals d on d.id = x.deal_id
                where d.client_id = $1 and x.recipient_id = $2 order by x.issued_at desc`, [c.id, me.actAs.companyId]),
      db.query(`select id, name, budget, status from campaigns where client_id = $1 order by created_at desc`, [c.id]),
    ])
    return { ...card(c),
      bookingsList: deals.rows.map(d => ({ id: d.id, ref: d.ref, status: buyerStatus[d.status] ?? d.status, price: Number(d.amount), currency: d.currency,
        label: d.label, startsAt: d.starts_at, outlet: d.outlet, channel: d.channel })),
      documents: docs.rows.map(x => ({ id: x.id, type: x.type, number: x.number, total: Number(x.total), currency: x.currency, issuedAt: x.issued_at, dealRef: x.ref })),
      campaigns: campaigns.rows.map(x => ({ id: x.id, name: x.name, budget: Number(x.budget), status: x.status })) }
  })

  /** The client's bookings as a spreadsheet to send on: what ran where, the price, VAT and the documents for each. */
  route('GET', '/api/clients/:id/report', BUYER, async ({ db, me }, req, reply) => {
    const c = (await db.query(`select * from clients where id = $1 and buyer_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!c) throw new NotFound()
    const rows = (await db.query(
      `select d.ref, d.status, d.amount, d.currency, s.label, s.starts_at, o.name outlet, o.channel, p.name placement, cmp.name campaign,
         coalesce(d.media_vat_bp, case when sc.vat_registered then (select (value)::int from settings where key = 'media_vat_bp' order by valid_from desc limit 1) else 0 end) vat_bp,
         (select string_agg(x.number, ' ' order by x.issued_at) from documents x where x.deal_id = d.id and x.recipient_id = d.buyer_id) docs
       from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
       join companies sc on sc.id = d.seller_id left join campaigns cmp on cmp.id = d.campaign_id
       where d.client_id = $1 and d.status in ${BOOKED} order by s.starts_at`, [c.id])).rows
    const slug = c.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'client'
    return sendCsv(reply, `nashr-${slug}`, ['Order', 'Runs (Dubai)', 'Outlet', 'Channel', 'Placement', 'Slot', 'Campaign', 'Status', 'Price', 'VAT', 'Total', 'Currency', 'Documents'],
      rows.map(r => { const runs = new Date(new Date(r.starts_at).getTime() + 4 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ') // Dubai time
        const s = split(Number(r.amount), { commissionBp: 0, mediaVatBp: r.vat_bp, feeVatBp: 0 })
        return [r.ref, runs, r.outlet, r.channel, r.placement, r.label, r.campaign, buyerStatus[r.status] ?? r.status,
          (Number(r.amount) / 100).toFixed(2), (s.mediaVat / 100).toFixed(2), (s.buyerPays / 100).toFixed(2), r.currency, r.docs] }))
  })

  /** Put a booking under a client afterwards (documents already issued keep what they say; later ones name the client). */
  route('PUT', '/api/deals/:id/client', BUYER, async ({ db, at, me }, req) => {
    const id = req.body.clientId
    if (id && !(await db.query(`select 1 from clients where id = $1 and buyer_id = $2 and status = 'active'`, [id, me.actAs.companyId])).rowCount)
      throw new MarketError('Choose one of your active clients.')
    const r = await db.query(`update deals set client_id = $3 where id = $1 and buyer_id = $2`, [req.params.id, me.actAs.companyId, id])
    if (!r.rowCount) throw new NotFound()
    await audit(db, `user:${me.userId}`, 'deal.client', 'deal', req.params.id, { clientId: id }, at)
    return { ok: true }
  }, { type: 'object', required: ['clientId'], additionalProperties: false, properties: { clientId: { type: ['string', 'null'], format: 'uuid' } } })
}
