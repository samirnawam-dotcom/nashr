import { NotFound, type RouteFn } from './app.js'
import { archiveProduct, bulkSlots, ensureProducts, listIt, repeatWeek, saveMedia, saveProduct, saveProgramme } from '../catalog/products.js'
import { MEDIA } from '../shared/media.js'
import { AUDIENCE_KEYS } from '../shared/audiences.js'
import { brandLogoUrl } from './routes-covers.js'

/*
 * Products, media types, programmes and listings for the publisher (owner's rules, 10 Nov 2026).
 */
const SELLER: ['seller'] = ['seller']
const text = (n: number) => ({ type: 'string', maxLength: n })
const money = { type: 'integer', minimum: 100, maximum: 100_000_000_00 }
const days = { type: 'integer', minimum: 0, maximum: 120 }
const strs = (n: number) => ({ type: 'array', maxItems: n, items: { type: 'string', minLength: 1, maxLength: 80 } })
const DETAILS = { type: 'object', additionalProperties: false, properties: {
  programmes: { type: 'boolean' }, days: { type: 'array', uniqueItems: true, maxItems: 7, items: { type: 'integer', minimum: 1, maximum: 7 } },
  airStart: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, airEnd: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
  breaks: { type: 'array', maxItems: 24, items: { type: 'object', additionalProperties: false, required: ['at'], properties: { at: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, label: text(40) } } },
  format: text(60), adLength: text(40), frequency: text(60), section: text(60), size: text(40), runs: text(40), platform: text(40),
} }
const PRODUCT = { type: 'object', additionalProperties: false, required: ['name', 'description'], properties: { name: text(80), description: text(1000), notes: text(500) } }
const MEDIA_BODY = { type: 'object', additionalProperties: false,
  required: ['channel', 'name', 'description', 'language', 'audience', 'markets', 'sectors', 'blocked', 'defaultPrice', 'creativeDays', 'closeDays', 'specType', 'details'],
  properties: { channel: { enum: [...MEDIA] }, channelOther: text(60), name: text(80), description: text(1000), language: text(40), audience: text(300), markets: strs(8),
    reach: { type: ['integer', 'null'], minimum: 1, maximum: 1_000_000_000 }, reachUnit: { type: ['string', 'null'], maxLength: 40 }, sectors: strs(30), blocked: strs(30),
    defaultPrice: money, creativeDays: days, closeDays: days, specType: text(60), specDetail: text(120), notes: text(500), details: DETAILS,
    audiences: { type: 'array', maxItems: 12, uniqueItems: true, items: { enum: AUDIENCE_KEYS } },
    blockedAdvertisers: { type: 'array', maxItems: 30, uniqueItems: true, items: { type: 'string', minLength: 2, maxLength: 80 } } } }
const PROGRAMME = { type: 'object', additionalProperties: false, required: ['name', 'details'], properties: {
  name: text(80), notes: text(500), defaultPrice: { anyOf: [money, { type: 'null' }] }, creativeDays: { anyOf: [days, { type: 'null' }] }, closeDays: { anyOf: [days, { type: 'null' }] }, details: DETAILS } }
const LISTING = { type: 'object', additionalProperties: false, required: ['placementId', 'from', 'length', 'saleType', 'startingPrice'], properties: {
  placementId: { type: 'string', format: 'uuid' }, from: { type: 'string', format: 'date' }, length: { enum: ['once', 'weeks', 'rolling'] }, weeks: { type: 'integer', minimum: 1, maximum: 26 },
  saleType: { enum: ['auction', 'fixed', 'quick_sale'] }, startingPrice: money, buyNowPrice: { anyOf: [money, { type: 'null' }] }, reservePrice: { anyOf: [money, { type: 'null' }] },
  anyBreakPrice: { anyOf: [money, { type: 'null' }] }, packagePrice: { anyOf: [money, { type: 'null' }] } } }

export function productRoutes(route: RouteFn) {
  route('GET', '/api/seller/products', SELLER, async ({ db, me, at }) => {
    const c = me.actAs.companyId
    await ensureProducts(db, c)
    const products = (await db.query(`select * from products where company_id = $1 and not archived order by created_at, name`, [c])).rows
    const media = (await db.query(`select * from outlets where company_id = $1 and not archived order by name`, [c])).rows
    const places = (await db.query(`select p.*, (select count(*)::int from slots s where s.placement_id = p.id and s.status = 'open' and s.closes_at > $2) open_slots,
        (select min(s.starts_at) from slots s where s.placement_id = p.id and s.status = 'open' and s.closes_at > $2) next_at,
        (select count(*)::int from deals d join slots s on s.id = d.slot_id where s.placement_id = p.id and d.status in ('secured', 'in_review', 'released', 'paid_out')) sold
      from placements p join outlets o on o.id = p.outlet_id where o.company_id = $1 and not p.archived order by p.kind, p.name`, [c, at])).rows
    const place = (p: any) => ({ id: p.id, kind: p.kind, name: p.name, days: p.days, startsAt: p.starts_at_local?.slice(0, 5) ?? null, endsAt: p.ends_at_local?.slice(0, 5) ?? null,
      breaks: p.breaks, format: p.format, saleType: p.sale_type, startingPrice: Number(p.starting_price), defaultPrice: p.default_price ? Number(p.default_price) : null,
      buyNowPrice: p.buy_now_price, reservePrice: p.reserve_price, anyBreakPrice: p.any_break_price, packagePrice: p.package_price, listing: p.listing, horizonWeeks: p.horizon_weeks,
      creativeDays: Math.round(p.creative_lead_hours / 24), closeDays: Math.round(p.close_lead_hours / 24), details: p.details ?? {}, openSlots: p.open_slots, nextAt: p.next_at, sold: p.sold })
    return products.map(p => ({ id: p.id, name: p.name, description: p.description, notes: p.notes, logoUrl: brandLogoUrl(p.id, p.logo_key),
      media: media.filter(m => m.product_id === p.id).map(m => ({ id: m.id, channel: m.channel, channelOther: m.channel_other, name: m.name, description: m.description, language: m.language,
        audience: m.audience, audiences: m.audiences ?? [], blockedAdvertisers: m.blocked_advertisers ?? [], markets: m.markets, reach: m.reach, reachUnit: m.reach_unit, sectors: m.sectors, blocked: m.blocked_industries, defaultPrice: m.default_price ? Number(m.default_price) : null,
        creativeDays: m.creative_days, closeDays: m.close_days, specType: m.spec_type, specDetail: m.spec_detail, notes: m.notes, details: m.details ?? {}, coverUrl: m.cover_key ? `/api/outlets/${m.id}/cover` : null,
        sellable: places.filter(x => x.outlet_id === m.id).map(place) })) }))
  })

  route('POST', '/api/seller/products', SELLER, async ({ db, at, me }, req) => ({ id: await saveProduct(db, { companyId: me.actAs.companyId, ...req.body }, `seller:${me.actAs.companyId}`, at) }), PRODUCT)
  route('PUT', '/api/seller/products/:id', SELLER, async ({ db, at, me }, req) => ({ id: await saveProduct(db, { id: req.params.id, companyId: me.actAs.companyId, ...req.body }, `seller:${me.actAs.companyId}`, at) }), PRODUCT)
  route('POST', '/api/seller/products/:id/delete', SELLER, async ({ db, at, me }, req) => { await archiveProduct(db, req.params.id, me.actAs.companyId, `seller:${me.actAs.companyId}`, at); return { ok: true } })

  route('POST', '/api/seller/products/:id/media', SELLER, async ({ db, at, me }, req) =>
    ({ id: await saveMedia(db, { productId: req.params.id, companyId: me.actAs.companyId, m: req.body }, `seller:${me.actAs.companyId}`, at) }), MEDIA_BODY)
  route('PUT', '/api/seller/media/:id', SELLER, async ({ db, at, me }, req) => {
    const o = (await db.query(`select product_id from outlets where id = $1 and company_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!o) throw new NotFound()
    return { id: await saveMedia(db, { id: req.params.id, productId: o.product_id, companyId: me.actAs.companyId, m: req.body }, `seller:${me.actAs.companyId}`, at) }
  }, MEDIA_BODY)

  route('POST', '/api/seller/media/:id/programmes', SELLER, async ({ db, at, me }, req) =>
    ({ id: await saveProgramme(db, { outletId: req.params.id, companyId: me.actAs.companyId, p: req.body }, `seller:${me.actAs.companyId}`, at) }), PROGRAMME)
  route('PUT', '/api/seller/programmes/:id', SELLER, async ({ db, at, me }, req) => {
    const p = (await db.query(`select p.outlet_id from placements p join outlets o on o.id = p.outlet_id where p.id = $1 and o.company_id = $2 and p.kind = 'programme'`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!p) throw new NotFound()
    return { id: await saveProgramme(db, { id: req.params.id, outletId: p.outlet_id, companyId: me.actAs.companyId, p: req.body }, `seller:${me.actAs.companyId}`, at) }
  }, PROGRAMME)

  route('POST', '/api/seller/listings', SELLER, async ({ db, at, me }, req) => listIt(db, me.actAs.companyId, req.body, `seller:${me.actAs.companyId}`, at), LISTING)
  route('POST', '/api/seller/listings/repeat', SELLER, async ({ db, at, me }, req) => repeatWeek(db, me.actAs.companyId, req.body.from, req.body.weeks, `seller:${me.actAs.companyId}`, at),
    { type: 'object', additionalProperties: false, required: ['from', 'weeks'], properties: { from: { type: 'string', format: 'date' }, weeks: { type: 'integer', minimum: 1, maximum: 12 } } })
  route('POST', '/api/seller/slots/bulk', SELLER, async ({ db, at, me }, req) => bulkSlots(db, me.actAs.companyId, req.body, `seller:${me.actAs.companyId}`, at),
    { type: 'object', additionalProperties: false, required: ['ids', 'action'], properties: { ids: { type: 'array', minItems: 1, maxItems: 300, uniqueItems: true, items: { type: 'string', format: 'uuid' } },
      action: { enum: ['block', 'unblock', 'price'] }, startingPrice: money } })
}
