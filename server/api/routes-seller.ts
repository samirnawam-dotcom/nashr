import type pg from 'pg'
import { NotFound, type RouteFn } from './app.js'
import { sellerDeal, sellerSlot } from './shapes.js'
import { accept, acceptInterest, chooseBid, decline, MarketError } from '../marketplace/market.js'
import { cancelBySeller, creativeMissed } from '../payments/payments.js'
import { submitProof } from '../fulfilment/proof.js'
import { reviewCreative } from '../fulfilment/creative.js'
import { offerFix } from '../fulfilment/issues.js'
import { createPlacement, generateSlots, overlapWarnings, updatePlacement } from '../catalog/placements.js'
import { dealRating } from './routes-ratings.js'
import { byDay, listSlots, scopedQuery } from '../marketplace/search.js'

const SELLER: ['seller'] = ['seller']
const price = { type: 'integer', minimum: 100, maximum: 100_000_000_00 } // at least AED 1, in fils
const time = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }
const PLACEMENT = { type: 'object', additionalProperties: false, required: ['outletId', 'name', 'saleType', 'days', 'startingPrice', 'creativeLeadHours', 'closeLeadHours'],
  properties: { outletId: { type: 'string', format: 'uuid' }, name: { type: 'string', minLength: 1, maxLength: 200 }, saleType: { enum: ['auction', 'quick_sale'] },
    days: { type: 'array', minItems: 1, maxItems: 7, uniqueItems: true, items: { type: 'integer', minimum: 1, maximum: 7 } }, startsAt: time, endsAt: time,
    breaks: { type: 'array', maxItems: 24, items: { type: 'object', additionalProperties: false, required: ['label'],
      properties: { label: { type: 'string', minLength: 1, maxLength: 60 }, at: time, seconds: { type: 'integer', minimum: 1, maximum: 3600 } } } },
    startingPrice: price, anyBreakPrice: price, packagePrice: price, buyNowPrice: price, reservePrice: price, autoAccept: { type: 'boolean' },
    creativeLeadHours: { type: 'integer', minimum: 0, maximum: 2000 }, closeLeadHours: { type: 'integer', minimum: 1, maximum: 4000 },
    listFrom: { type: 'string', format: 'date' }, listDays: { type: 'integer', minimum: 1, maximum: 120 } } }
const reason = { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 1, maxLength: 1000 } } }

// Before acceptance the money preview uses the rates that acceptance would freeze: the publisher's own rate or the default.
const DEAL_SQL = `select d.*, d.status = 'awaiting_payment' and exists (select 1 from money_ops m where m.deal_id = d.id and m.kind = 'charge' and m.status = 'failed')
    and not exists (select 1 from money_ops m where m.deal_id = d.id and m.kind = 'charge' and m.status in ('pending', 'requires_action', 'succeeded')) payment_failed,
  s.label, s.starts_at, s.reserve_price, o.channel, o.sectors, bc.name buyer_name, b.brief, coalesce(d.media_vat_bp, case when sc.vat_registered then (select (value)::int from settings where key = 'media_vat_bp' order by valid_from desc limit 1) else 0 end) vat_bp,
    coalesce((select (value)::int from settings where key = 'commission:' || d.seller_id order by valid_from desc limit 1),
             (select (value)::int from settings where key = 'default_commission_bp' order by valid_from desc limit 1)) default_commission_bp
  from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
  join companies bc on bc.id = d.buyer_id join companies sc on sc.id = d.seller_id join bids b on b.id = d.bid_id`

async function ownDeal(db: pg.PoolClient, id: string, sellerId: string) {
  const d = (await db.query(`${DEAL_SQL} where d.id = $1 and d.seller_id = $2`, [id, sellerId])).rows[0]
  if (!d) throw new NotFound()
  return d
}
async function ownSlot(db: pg.PoolClient, id: string, sellerId: string) {
  const s = (await db.query(`select s.id from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
                             where s.id = $1 and o.company_id = $2`, [id, sellerId])).rows[0]
  if (!s) throw new NotFound()
}
const otherBids = async (db: pg.PoolClient, d: any) => (await db.query(
  `select b.id, b.amount, c.name buyer_name from bids b join companies c on c.id = b.buyer_id
   where b.slot_id = $1 and b.id <> $2 and b.status in ('active', 'outbid') and b.kind in ('bid', 'auto') order by b.amount desc`, [d.slot_id, d.bid_id])).rows

export function sellerRoutes(route: RouteFn) {
  route('GET', '/api/seller/slots', SELLER, async ({ db, me }, req) => (await db.query(
    `select s.*, p.name placement, o.name outlet, o.channel, (select count(*)::int from bids b where b.slot_id = s.id) bids from slots s
     join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
     where o.company_id = $1 and ($2::timestamptz is null or s.starts_at >= $2) and ($3::timestamptz is null or s.starts_at < $3) order by s.starts_at`,
    [me.actAs.companyId, req.query.from ?? null, req.query.to ?? null])).rows.map(sellerSlot))

  // The publisher's calendar at any size: a sorted, paged list and daily totals by status (marketplace/search.ts, seller scope).
  route('GET', '/api/seller/slots/list', SELLER, async ({ db, me, at }, req) => {
    const { total, rows } = await listSlots(db, scopedQuery(req.query, 'seller', me.actAs.companyId), req.query.sort ?? 'time', Number(req.query.offset ?? 0), Number(req.query.limit ?? 50), at)
    return { total, items: rows.map(sellerSlot) }
  })
  route('GET', '/api/seller/slots/days', SELLER, async ({ db, me, at }, req) => byDay(db, scopedQuery(req.query, 'seller', me.actAs.companyId), at))

  route('GET', '/api/seller/deals', SELLER, async ({ db, me }) =>
    (await db.query(`${DEAL_SQL} where d.seller_id = $1 order by d.created_at desc`, [me.actAs.companyId])).rows.map(d => sellerDeal(d)))

  route('GET', '/api/seller/deals/:id', SELLER, async ({ db, me }, req) => {
    const d = await ownDeal(db, req.params.id, me.actAs.companyId)
    return { ...sellerDeal(d, await otherBids(db, d)), rating: await dealRating(db, d.id) }
  })

  route('POST', '/api/seller/deals/:id/accept', SELLER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await accept(db, req.params.id, `seller:${me.actAs.companyId}`, at)
    return sellerDeal(await ownDeal(db, req.params.id, me.actAs.companyId))
  })

  route('POST', '/api/seller/deals/:id/decline', SELLER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await decline(db, req.params.id, req.body.reason, `seller:${me.actAs.companyId}`, at)
    return { ok: true }
  }, reason)

  route('POST', '/api/seller/slots/:id/choose', SELLER, async ({ db, at, me }, req) => {
    await ownSlot(db, req.params.id, me.actAs.companyId)
    return sellerDeal(await ownDeal(db, (await chooseBid(db, req.params.id, req.body.bidId, `seller:${me.actAs.companyId}`, at)).id, me.actAs.companyId))
  }, { type: 'object', required: ['bidId'], properties: { bidId: { type: 'string', format: 'uuid' } } })

  // Quick sale: the publisher accepts one buyer's interest; that opens the booking already accepted, the buyer pays next.
  route('POST', '/api/seller/slots/:id/accept-interest', SELLER, async ({ db, at, me }, req) => {
    await ownSlot(db, req.params.id, me.actAs.companyId)
    const bid = (await db.query(`select id from bids where id = $1 and slot_id = $2`, [req.body.bidId, req.params.id])).rows[0]
    if (!bid) throw new MarketError('This interest can no longer be accepted.')
    return sellerDeal(await ownDeal(db, (await acceptInterest(db, bid.id, `seller:${me.actAs.companyId}`, at)).id, me.actAs.companyId))
  }, { type: 'object', required: ['bidId'], properties: { bidId: { type: 'string', format: 'uuid' } } })

  route('POST', '/api/seller/deals/:id/creative-review', SELLER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    return { status: await reviewCreative(db, { decision: req.body.decision, reason: req.body.reason, dealId: req.params.id, sellerId: me.actAs.companyId }, at) }
  }, { type: 'object', required: ['decision'], additionalProperties: false, properties: { decision: { enum: ['approve', 'changes', 'technical', 'reject'] }, reason: { type: 'string', maxLength: 1000 } } })

  route('POST', '/api/seller/deals/:id/creative-missed', SELLER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await creativeMissed(db, req.params.id, me.actAs.companyId, req.body.choice, at)
    return { ok: true }
  }, { type: 'object', required: ['choice'], properties: { choice: { enum: ['placeholder', 'release'] } } })

  route('POST', '/api/seller/deals/:id/proof', SELLER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await submitProof(db, { dealId: req.params.id, sellerId: me.actAs.companyId, items: req.body.items, note: req.body.note }, at)
    return { ok: true }
  }, { type: 'object', required: ['items'], properties: { items: { type: 'object' }, note: { type: 'string', maxLength: 2000 } } })

  route('POST', '/api/seller/deals/:id/issues/offer', SELLER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    const o = req.body
    await offerFix(db, { dealId: req.params.id, sellerId: me.actAs.companyId, offer: o.type === 'make_good' ? { ...o, runAt: new Date(o.runAt) } : o }, at)
    return { ok: true }
  }, { type: 'object', required: ['type'], properties: { type: { enum: ['corrected_proof', 'make_good', 'partial_refund'] }, items: { type: 'object' },
       runAt: { type: 'string', format: 'date-time' }, amount: { type: 'integer', minimum: 1 } } })

  route('POST', '/api/seller/deals/:id/cancel', SELLER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await cancelBySeller(db, req.params.id, me.actAs.companyId, req.body.reason, at)
    return { ok: true }
  }, reason)

  route('POST', '/api/seller/placements', SELLER, async ({ db, at, me }, req) => {
    const outlet = (await db.query(`select id from outlets where id = $1 and company_id = $2`, [req.body.outletId, me.actAs.companyId])).rows[0]
    if (!outlet) throw new NotFound()
    const warnings = await overlapWarnings(db, req.body)
    const id = await createPlacement(db, req.body, `seller:${me.actAs.companyId}`, at)
    return { id, warnings, slots: req.body.listDays ? await generateSlots(db, id, req.body.listFrom, req.body.listDays, at) : 0 }
  }, PLACEMENT)

  route('PUT', '/api/seller/placements/:id', SELLER, async ({ db, at, me }, req) =>
    updatePlacement(db, req.params.id, me.actAs.companyId, req.body, `seller:${me.actAs.companyId}`, at),
  { type: 'object', additionalProperties: false, required: ['name', 'startingPrice', 'creativeLeadHours', 'closeLeadHours'],
    properties: { name: PLACEMENT.properties.name, startingPrice: price, anyBreakPrice: price, packagePrice: price, buyNowPrice: price, reservePrice: price,
      autoAccept: { type: 'boolean' }, creativeLeadHours: PLACEMENT.properties.creativeLeadHours, closeLeadHours: PLACEMENT.properties.closeLeadHours } })
}
