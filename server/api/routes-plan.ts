import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { MarketError } from '../marketplace/market.js'
import { containsContactDetails } from '../core/contact.js'
import { notify } from '../core/notify.js'
import { audit } from '../core/audit.js'
import { buyerStatus } from './shapes.js'
import { coverUrl, logoUrl } from './routes-covers.js'
import { outletRating } from './routes-ratings.js'

const BUYER: ['buyer'] = ['buyer']
const OPEN = `(select value from settings where key = 'open_markets' order by valid_from desc limit 1)`

const DONE = `('released', 'paid_out')`
const BOOKED = `('awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out')`

/*
 * Directory prices come in three levels and the label always says which (brief section 7):
 *   typical   "Typical on Nashr"       from at least 3 completed sales on Nashr
 *   rate      "Publisher's rate"        the outlet is on Nashr and set its own starting prices
 *   estimate  "Estimate, unconfirmed"   the outlet is not on Nashr; Nashr entered a range
 */
const OUTLET_SQL = `
  select o.*, c.payouts_enabled and ${OPEN} ? o.market bookable, not (${OPEN} ? o.market) coming_soon,
    (select min(p.starting_price) from placements p where p.outlet_id = o.id and not p.archived) rate_low,
    (select max(coalesce(p.package_price, p.starting_price)) from placements p where p.outlet_id = o.id and not p.archived) rate_high,
    t.n sales, t.low typical_low, t.high typical_high,
    (select round(avg(x.score)::numeric, 1)::float from ratings x where x.outlet_id = o.id and not x.hidden) rating_avg,
    (select count(*)::int from ratings x where x.outlet_id = o.id and not x.hidden) rating_n
  from outlets o left join companies c on c.id = o.company_id
  left join lateral (select count(*)::int n, percentile_disc(0.25) within group (order by d.amount) low, percentile_disc(0.75) within group (order by d.amount) high
    from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id where p.outlet_id = o.id and d.status in ${DONE}) t on true
  where true`

function price(r: any) {
  if (r.bookable && r.sales >= 3) return { level: 'typical', label: 'Typical on Nashr', from: r.typical_low, to: r.typical_high, currency: 'AED' }
  if (r.coming_soon && r.rate_low != null) return { level: 'rate', label: "Publisher's rate", from: r.rate_low, to: r.rate_high, currency: r.est_currency }
  if (r.bookable && r.rate_low != null) return { level: 'rate', label: "Publisher's rate", from: r.rate_low, to: r.rate_high, currency: 'AED' }
  if (r.est_low != null) return { level: 'estimate', label: 'Estimate, unconfirmed', from: r.est_low, to: r.est_high ?? r.est_low, currency: r.est_currency }
  return null
}

// The outlet's public address segment: "Gulf News" → /directory/gulf-news (same rule as the web app's outletSlug).
export const SLUG_SQL = `lower(trim(both '-' from regexp_replace(o.name, '[^a-zA-Z0-9]+', '-', 'g')))`
const slugOf = (name: string, id: string) => name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || id

const outletCard = (r: any) => ({ id: r.id, slug: slugOf(r.name, r.id), name: r.name, nameAr: r.name_ar, channel: r.channel, sectors: r.sectors, logoUrl: logoUrl(r) ?? r.logo_url, coverUrl: coverUrl(r),
  tier: r.tier, audience: r.audience, market: r.market, comingSoon: r.coming_soon, onNashr: !!r.bookable, price: price(r),
  rating: { average: r.rating_n ? r.rating_avg : null, count: r.rating_n ?? 0 } })

export function planRoutes(route: RouteFn) {
  // The directory is for buyers, visitors browsing before they sign in, and Nashr; signed-in sellers cannot see it (brief section 6).
  route('GET', '/api/directory', [...BUYER, 'admin', 'guest'], async ({ db }) =>
    (await db.query(`${OUTLET_SQL} order by c.payouts_enabled is not true, o.name`)).rows.map(outletCard))

  route('GET', '/api/outlets/:id', [...BUYER, 'admin', 'guest'], async ({ db, at }, req) => {
    // By readable address (/directory/gulf-news) or by id (older links).
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(req.params.id)
    const r = (await db.query(`${OUTLET_SQL} and ${byId ? 'o.id = $1::uuid' : `${SLUG_SQL} = $1`} order by o.id limit 1`, [req.params.id])).rows[0]
    if (!r) throw new NotFound()
    const placements = r.bookable ? (await db.query(
      `select p.id, p.name, p.sale_type, p.days, p.starts_at_local::text starts, p.ends_at_local::text ends, p.breaks, p.starting_price, p.any_break_price, p.package_price, p.buy_now_price,
         (select count(*)::int from slots s where s.placement_id = p.id and s.status = 'open' and s.starts_at > $2) open_slots,
         (select min(s.starts_at) from slots s where s.placement_id = p.id and s.status = 'open' and s.starts_at > $2) next_slot
       from placements p where p.outlet_id = $1 and not p.archived order by p.name`, [r.id, at])).rows : []
    return { ...outletCard(r), rating: await outletRating(db, r.id), website: r.website, description: r.description, completedSales: r.bookable ? r.sales : 0,
      placements: placements.map(p => ({ id: p.id, name: p.name, saleType: p.sale_type, days: p.days, startsAt: p.starts, endsAt: p.ends,
        breaks: p.breaks.length, startingPrice: p.starting_price, anyBreakPrice: p.any_break_price, packagePrice: p.package_price,
        buyNowPrice: p.buy_now_price, openSlots: p.open_slots, nextSlotAt: p.next_slot })) }
  })

  // For search engines: every public page and every outlet, at the site's own address.
  route('GET', '/api/sitemap.xml', 'public', async ({ db }, req, reply) => {
    const origin = (process.env.SITE_URL ?? `${req.protocol}://${req.headers.host}`).replace(/\/$/, '')
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const outlets = (await db.query(`select o.id, o.name from outlets o order by o.name`)).rows
    const urls = [['/', 'daily', '1.0'], ['/calendar', 'hourly', '0.9'], ['/directory', 'daily', '0.9'], ['/request-access', 'monthly', '0.6'],
      ...outlets.map(o => [`/directory/${slugOf(o.name, o.id)}`, 'weekly', '0.7']), ['/terms', 'yearly', '0.2'], ['/privacy', 'yearly', '0.2'], ['/refunds', 'yearly', '0.2']]
    reply.type('application/xml').header('cache-control', 'public, max-age=3600')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      urls.map(([p, f, pr]) => `  <url><loc>${esc(origin + p)}</loc><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`
  })

  // Outlets not on Nashr: the buyer asks, Nashr's team gets the quote (no contact details either way).
  route('POST', '/api/outlets/:id/quote', BUYER, async ({ db, at, me }, req) => {
    const o = (await db.query(`select id, name from outlets where id = $1`, [req.params.id])).rows[0]
    if (!o) throw new NotFound()
    if (containsContactDetails(req.body.message)) throw new MarketError('Emails and phone numbers are not allowed. Talk through Nashr.')
    const q = (await db.query(`insert into quote_requests (outlet_id, buyer_id, message, created_at) values ($1, $2, $3, $4) returning id`,
      [o.id, me.actAs.companyId, req.body.message, at])).rows[0]
    for (const a of (await db.query(`select distinct company_id from users where role in ('admin', 'founder')`)).rows)
      await notify(db, a.company_id, 'quote.requested', null, { outlet: o.name, quoteId: q.id }, at)
    await audit(db, `buyer:${me.actAs.companyId}`, 'quote.requested', 'outlet', o.id, null, at)
    return { id: q.id }
  }, { type: 'object', required: ['message'], properties: { message: { type: 'string', minLength: 1, maxLength: 2000 } } })

  // "Tell me when it opens" for KSA and Athena (brief sections 14 and 21).
  route('GET', '/api/waitlist', ['buyer', 'seller'], async ({ db, me }) =>
    (await db.query(`select topic from waitlist where company_id = $1`, [me.actAs.companyId])).rows.map(r => r.topic))

  route('POST', '/api/waitlist', ['buyer', 'seller'], async ({ db, at, me }, req) => {
    await db.query(`insert into waitlist (company_id, topic, user_id, created_at) values ($1, $2, $3, $4) on conflict do nothing`,
      [me.actAs.companyId, req.body.topic, me.userId, at])
    return { ok: true }
  }, { type: 'object', required: ['topic'], properties: { topic: { enum: ['KSA', 'Athena'] } } })

  // Campaigns: a budget and a plan of outlets; bookings tagged to the campaign count against it.
  const totals = `select c.*, c.launch_date::text launch_text,
      coalesce((select sum(d.amount) from deals d where d.campaign_id = c.id and d.status in ${BOOKED}), 0)::bigint committed,
      coalesce((select sum(d.amount) from deals d where d.campaign_id = c.id and d.status = 'awaiting_seller'), 0)::bigint pending,
      coalesce((select sum(i.planned_amount) from campaign_items i where i.campaign_id = c.id), 0)::bigint planned
    from campaigns c where c.buyer_id = $1`
  const card = (c: any) => ({ id: c.id, name: c.name, budget: c.budget, launchDate: c.launch_text, objective: c.objective, audience: c.audience,
    message: c.message, status: c.status, committed: c.committed, pending: c.pending, planned: c.planned, remaining: c.budget - c.committed })
  const campaignBody = { type: 'object', additionalProperties: false, properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 }, budget: { type: 'integer', minimum: 1 }, launchDate: { type: 'string', format: 'date' },
    objective: { type: 'string', maxLength: 500 }, audience: { type: 'string', maxLength: 500 }, message: { type: 'string', maxLength: 2000 },
    status: { enum: ['active', 'completed'] } } }

  route('GET', '/api/campaigns', BUYER, async ({ db, me }) =>
    (await db.query(`${totals} order by c.status, c.created_at desc`, [me.actAs.companyId])).rows.map(card))

  route('POST', '/api/campaigns', BUYER, async ({ db, at, me }, req) => {
    const b = req.body
    const c = (await db.query(`insert into campaigns (buyer_id, name, budget, launch_date, objective, audience, message, created_at)
                               values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [me.actAs.companyId, b.name, b.budget, b.launchDate ?? null, b.objective ?? null, b.audience ?? null, b.message ?? null, at])).rows[0]
    return { id: c.id }
  }, { ...campaignBody, required: ['name', 'budget'] })

  route('PUT', '/api/campaigns/:id', BUYER, async ({ db, me }, req) => {
    const b = req.body, cols = { name: 'name', budget: 'budget', launchDate: 'launch_date', objective: 'objective', audience: 'audience', message: 'message', status: 'status' }
    const set = Object.entries(cols).filter(([k]) => k in b)
    if (!set.length) throw new MarketError('Nothing to change.')
    const r = await db.query(`update campaigns set ${set.map(([, c], i) => `${c} = $${i + 3}`).join(', ')} where id = $1 and buyer_id = $2`,
      [req.params.id, me.actAs.companyId, ...set.map(([k]) => b[k])])
    if (!r.rowCount) throw new NotFound()
    return { ok: true }
  }, campaignBody)

  route('GET', '/api/campaigns/:id', BUYER, async ({ db, me }, req) => {
    const c = (await db.query(`${totals} and c.id = $2`, [me.actAs.companyId, req.params.id])).rows[0]
    if (!c) throw new NotFound()
    const items = (await db.query(
      `select i.outlet_id, i.planned_amount, o.name, o.channel,
         coalesce((select sum(d.amount) from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id
                   where d.campaign_id = $1 and p.outlet_id = o.id and d.status in ${BOOKED}), 0)::bigint committed
       from campaign_items i join outlets o on o.id = i.outlet_id where i.campaign_id = $1 order by o.name`, [c.id])).rows
    const deals = (await db.query(
      `select d.id, d.ref, d.status, d.amount, s.label, s.starts_at, o.name outlet from deals d join slots s on s.id = d.slot_id
       join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where d.campaign_id = $1 order by s.starts_at`, [c.id])).rows
    return { ...card(c),
      items: items.map(i => ({ outletId: i.outlet_id, outlet: i.name, channel: i.channel, planned: i.planned_amount, committed: i.committed })),
      bookings: deals.map(d => ({ id: d.id, ref: d.ref, status: buyerStatus[d.status] ?? d.status, price: d.amount, label: d.label, startsAt: d.starts_at, outlet: d.outlet })) }
  })

  // The plan is replaced as a whole: the screen sends every outlet it shows.
  route('PUT', '/api/campaigns/:id/items', BUYER, async ({ db, me }, req) => {
    const c = (await db.query(`select id from campaigns where id = $1 and buyer_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!c) throw new NotFound()
    await db.query(`delete from campaign_items where campaign_id = $1`, [c.id])
    for (const i of req.body.items)
      await db.query(`insert into campaign_items (campaign_id, outlet_id, planned_amount) select $1, id, $3 from outlets where id = $2`, // Saudi outlets can be planned, not booked (brief section 6)
        [c.id, i.outletId, i.planned ?? 0])
    return { ok: true }
  }, { type: 'object', required: ['items'], properties: { items: { type: 'array', maxItems: 200, items: { type: 'object', required: ['outletId'],
       properties: { outletId: { type: 'string', format: 'uuid' }, planned: { type: 'integer', minimum: 0 } } } } } })
}
