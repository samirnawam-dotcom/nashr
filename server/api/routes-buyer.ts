import type pg from 'pg'
import { NotFound, type RouteFn } from './app.js'
import { buyerDeal, buyerSlot } from './shapes.js'
import { placeBid, requestBuyNow, showInterest } from '../marketplace/market.js'
import { approve, cancelByBuyer, confirmPayment } from '../payments/payments.js'
import { reportIssue, respondToOffer } from '../fulfilment/issues.js'
import { uploadCreative } from '../fulfilment/creative.js'

const BUYER: ['buyer'] = ['buyer']
const money = { type: 'integer', minimum: 1 }
const brief = { type: 'object', additionalProperties: false, properties: {
  advertiser: { type: 'string', maxLength: 200 }, industry: { type: 'string', maxLength: 100 }, message: { type: 'string', maxLength: 2000 },
  language: { enum: ['arabic', 'english', 'bilingual'] }, landingUrl: { type: 'string', maxLength: 500 }, draftFileKey: { type: 'string', maxLength: 300 },
  creativeToFollow: { type: 'boolean' }, notes: { type: 'string', maxLength: 2000 } } }

// Before acceptance, VAT is previewed from the publisher's VAT status; acceptance freezes it on the deal.
const DEAL_SQL = `select d.*, s.label, s.starts_at, o.name outlet, coalesce(d.media_vat_bp, case when sc.vat_registered then (select (value)::int from settings where key = 'media_vat_bp' order by valid_from desc limit 1) else 0 end) vat_bp from deals d join slots s on s.id = d.slot_id
                  join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id join companies sc on sc.id = d.seller_id`

/** The buyer's own deal, or not found. */
export async function ownDeal(db: pg.PoolClient, id: string, buyerId: string) {
  const d = (await db.query(`${DEAL_SQL} where d.id = $1 and d.buyer_id = $2`, [id, buyerId])).rows[0]
  if (!d) throw new NotFound()
  return d
}

export function buyerRoutes(route: RouteFn) {
  // The calendar: every bookable slot from every outlet (brief section 5). Sellers use their own calendar instead.
  route('GET', '/api/slots', [...BUYER, 'admin'], async ({ db, me }, req) => {
    const from = req.query.from ?? new Date().toISOString(), to = req.query.to ?? new Date(Date.now() + 35 * 86_400_000).toISOString()
    const { rows } = await db.query(
      `select s.*, p.name placement, o.name outlet, o.channel, (select count(*)::int from bids b where b.slot_id = s.id) bids
       from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
       where s.starts_at >= $1 and s.starts_at < $2 and s.status <> 'blocked' and o.market = 'AE' order by s.starts_at`, [from, to])
    return rows.map(r => buyerSlot(r, me.actAs.companyId))
  })

  route('POST', '/api/slots/:id/bids', BUYER, async ({ db, at, me }, req) =>
    placeBid(db, { slotId: req.params.id, buyerId: me.actAs.companyId, amount: req.body.amount, maxAmount: req.body.maxAmount, brief: req.body.brief }, at),
    { type: 'object', required: ['amount'], additionalProperties: false, properties: { amount: money, maxAmount: money, brief } })

  route('POST', '/api/slots/:id/buy-now', BUYER, async ({ db, at, me }, req) =>
    buyerDeal(await requestBuyNow(db, { slotId: req.params.id, buyerId: me.actAs.companyId, brief: req.body?.brief }, at)),
    { type: 'object', additionalProperties: false, properties: { brief } })

  route('POST', '/api/slots/:id/interest', BUYER, async ({ db, at, me }, req) => {
    const b = await showInterest(db, { slotId: req.params.id, buyerId: me.actAs.companyId, amount: req.body?.amount, brief: req.body?.brief }, at)
    return { id: b.id, amount: b.amount }
  }, { type: 'object', additionalProperties: false, properties: { amount: money, brief } })

  route('GET', '/api/deals', BUYER, async ({ db, me }) =>
    (await db.query(`${DEAL_SQL} where d.buyer_id = $1 order by d.created_at desc`, [me.actAs.companyId])).rows.map(buyerDeal))

  route('GET', '/api/deals/:id', BUYER, async ({ db, me }, req) => buyerDeal(await ownDeal(db, req.params.id, me.actAs.companyId)))

  route('POST', '/api/deals/:id/pay', BUYER, async ({ db, at, me, provider }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    return confirmPayment(provider, { dealId: req.params.id, buyerId: me.actAs.companyId, paymentMethod: req.body.paymentMethod }, at)
  }, { type: 'object', required: ['paymentMethod'], properties: { paymentMethod: { type: 'string', maxLength: 100 } } })

  route('POST', '/api/deals/:id/creative', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    const c = await uploadCreative(db, { dealId: req.params.id, buyerId: me.actAs.companyId, ...req.body }, at)
    return { version: c.version, status: c.status, reason: c.reason }
  }, { type: 'object', required: ['fileKey', 'fileType', 'fileSize'], properties: {
    fileKey: { type: 'string', maxLength: 300 }, fileType: { type: 'string', maxLength: 100 }, fileSize: { type: 'integer', minimum: 1 } } })

  route('POST', '/api/deals/:id/approve', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await approve(db, req.params.id, `buyer:${me.actAs.companyId}`, at)
    return buyerDeal(await ownDeal(db, req.params.id, me.actAs.companyId))
  })

  route('POST', '/api/deals/:id/cancel', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await cancelByBuyer(db, req.params.id, me.actAs.companyId, at)
    return buyerDeal(await ownDeal(db, req.params.id, me.actAs.companyId))
  })

  route('POST', '/api/deals/:id/issues', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await reportIssue(db, { dealId: req.params.id, buyerId: me.actAs.companyId, ...req.body }, at)
    return { ok: true }
  }, { type: 'object', required: ['reason', 'note'], properties: { reason: { type: 'string' }, note: { type: 'string', maxLength: 2000 }, evidence: {} } })

  route('POST', '/api/deals/:id/issues/respond', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await respondToOffer(db, { dealId: req.params.id, buyerId: me.actAs.companyId, accept: req.body.accept }, at)
    return { ok: true }
  }, { type: 'object', required: ['accept'], properties: { accept: { type: 'boolean' } } })

  // The directory is for buyers and Nashr only; sellers cannot see it (brief section 6).
  route('GET', '/api/directory', [...BUYER, 'admin'], async ({ db }) => {
    const { rows } = await db.query(
      `select o.id, o.name, o.name_ar, o.channel, o.sectors, o.logo_url, min(p.starting_price) from_price, max(p.starting_price) to_price, min(p.currency) currency
       from outlets o join companies c on c.id = o.company_id left join placements p on p.outlet_id = o.id and not p.archived
       where o.market = 'AE' and c.payouts_enabled group by o.id order by o.name`)
    return rows.map(r => ({ id: r.id, name: r.name, nameAr: r.name_ar, channel: r.channel, sectors: r.sectors, logoUrl: r.logo_url,
      priceRange: r.from_price == null ? null : { from: r.from_price, to: r.to_price, currency: r.currency, label: "Publisher's rate" } }))
  })
}
