import { AUDIENCE_KEYS } from '../shared/audiences.js'
import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { MarketError } from '../marketplace/market.js'
import { containsContactDetails } from '../core/contact.js'
import { notify } from '../core/notify.js'
import { audit } from '../core/audit.js'
import { buyerStatus } from './shapes.js'
import { brandLogoUrl, coverUrl, logoUrl } from './routes-covers.js'
import { briefProblems } from '../fulfilment/brief.js'
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
// Public pages the web app serves (web/src/public): industry pages and Insights articles, listed here for the sitemap.
const PUBLIC_INDUSTRIES = ['banking', 'real-estate', 'retail', 'automotive', 'technology', 'hospitality', 'health', 'education']
const ARTICLE_SLUGS = ['auction-fixed-price-or-quick-sale', 'how-payment-protection-works', 'planning-a-ramadan-campaign']

export const SLUG_SQL = `lower(trim(both '-' from regexp_replace(o.name, '[^a-zA-Z0-9]+', '-', 'g')))`
const slugOf = (name: string, id: string) => name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || id

const outletCard = (r: any) => ({ id: r.id, slug: slugOf(r.name, r.id), name: r.name, nameAr: r.name_ar, channel: r.channel, sectors: r.sectors, logoUrl: logoUrl(r) ?? r.logo_url, coverUrl: coverUrl(r),
  tier: r.tier, audience: r.audience, audiences: r.audiences ?? [], market: r.market, comingSoon: r.coming_soon, onNashr: !!r.bookable, price: price(r),
  rating: { average: r.rating_n ? r.rating_avg : null, count: r.rating_n ?? 0 } })

export function planRoutes(route: RouteFn) {
  // The directory is for buyers, visitors browsing before they sign in, and Nashr; signed-in sellers cannot see it (brief section 6).
  // ---- The Directory (owner's buyer-side fixes): outlets first, then their products --------------------------------------
  // An outlet is the brand: its products row when the publisher has one, else the single outlets row (older outlets, and outlets
  // not on Nashr that take a quote request). Its products are the outlets rows under it, each with what it sells.
  async function brands(db: any, at: Date, me: string | null, key?: string) {
    const rows = (await db.query(`select o.*, coalesce(o.product_id, o.id) brand_key, brand_name(o) brand, pr.logo_key brand_logo_key, pr.description brand_description,
        c.payouts_enabled and ${OPEN} ? o.market bookable, not (${OPEN} ? o.market) coming_soon, coalesce(pr.created_at, c.created_at) joined,
        coalesce(o.default_price, (select min(p.starting_price) from placements p where p.outlet_id = o.id and not p.archived)) price,
        (select count(*)::int from slots s join placements p on p.id = s.placement_id where p.outlet_id = o.id and s.status = 'open' and s.closes_at > $1) on_sale,
        -- popularity, worked out by Nashr: each booking and each bid in the last 90 days, counted once (buyers see the order only)
        (select count(*)::int from bids b join slots s on s.id = b.slot_id join placements p on p.id = s.placement_id where p.outlet_id = o.id and b.created_at > $1::timestamptz - interval '90 days')
          + (select count(*)::int from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id where p.outlet_id = o.id and d.created_at > $1::timestamptz - interval '90 days') popular,
        (select round(avg(x.score)::numeric, 1)::float from ratings x where x.outlet_id = o.id and not x.hidden) rating_avg,
        (select count(*)::int from ratings x where x.outlet_id = o.id and not x.hidden) rating_n
      from outlets o left join companies c on c.id = o.company_id left join products pr on pr.id = o.product_id
      where not o.archived and not coalesce(pr.archived, false) and (o.company_id is null or exists (select 1 from placements p where p.outlet_id = o.id and not p.archived) or o.default_price is not null)
        ${key ? `and coalesce(o.product_id, o.id) = $2` : ''}
      order by brand_name(o), o.name`, key ? [at, key] : [at])).rows
    const saved = me ? new Set((await db.query(`select brand_key from saved_outlets where company_id = $1`, [me])).rows.map((r: any) => r.brand_key)) : new Set()
    const by = new Map<string, any[]>()
    for (const r of rows) by.set(r.brand_key, [...(by.get(r.brand_key) ?? []), r])
    const list = [...by.entries()].map(([k, rs]) => {
      const f = rs[0], prices = rs.map(r => r.price).filter((x: any) => x != null).map(Number), rated = rs.filter(r => r.rating_n > 0)
      const n = rated.reduce((a, r) => a + r.rating_n, 0)
      return { key: k, rows: rs, card: { popularRank: 0, newestRank: 0,
        id: k, slug: slugOf(f.brand, k), name: f.brand, nameAr: rs.find(r => r.name_ar)?.name_ar ?? null,
        logoUrl: brandLogoUrl(f.product_id, f.brand_logo_key) ?? logoUrl(rs.find(r => r.logo_key) ?? f) ?? f.logo_url ?? null,
        coverUrl: coverUrl(rs.find(r => r.cover_key) ?? f), channels: [...new Set(rs.map(r => r.channel))],
        sectors: [...new Set(rs.flatMap(r => r.sectors ?? []))], audiences: [...new Set(rs.flatMap(r => r.audiences ?? []))],
        audience: rs.map(r => r.audience).filter(Boolean)[0] ?? null, market: f.market, comingSoon: rs.some(r => r.coming_soon), onNashr: rs.some(r => r.bookable),
        // "From AED 2,000": the lowest default price of its products; outlets not on Nashr keep "Request a quote"
        fromPrice: f.company_id && prices.length ? Math.min(...prices) : null, currency: f.company_id ? 'AED' : f.est_currency,
        onSale: rs.reduce((a, r) => a + r.on_sale, 0), products: rs.length,
        rating: { average: n ? Math.round(rated.reduce((a, r) => a + r.rating_avg * r.rating_n, 0) / n * 10) / 10 : null, count: n },
        saved: saved.has(k) } , popular: rs.reduce((a, r) => a + r.popular, 0), joined: Math.min(...rs.map(r => r.joined ? new Date(r.joined).getTime() : 0)) }
    })
    // the orders the buyer can sort by (they see the order, never the counts behind it)
    const rank = (cmp: (a: any, b: any) => number) => new Map([...list].sort(cmp).map((x, i) => [x.key, i]))
    const popular = rank((a, b) => (b.popular - a.popular) || a.card.name.localeCompare(b.card.name))
    const newest = rank((a, b) => (b.joined - a.joined) || a.card.name.localeCompare(b.card.name))
    for (const x of list) Object.assign(x.card, { popularRank: popular.get(x.key), newestRank: newest.get(x.key) })
    return list
  }

  route('GET', '/api/directory', [...BUYER, 'admin', 'guest'], async ({ db, at, me }) =>
    (await brands(db, at, me?.role === 'buyer' ? me.actAs.companyId : null)).sort((a, b) => a.card.popularRank - b.card.popularRank).map(x => x.card))

  // One outlet: its products grouped by media type, each with the same summary the publisher sees, and what it sells.
  route('GET', '/api/directory/:key', [...BUYER, 'admin', 'guest'], async ({ db, at, me }, req) => {
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(req.params.key)
    // by the outlet's readable address, by its id, or by one of its products' ids (older links)
    const key = isId ? (await db.query(`select coalesce(o.product_id, o.id) k from outlets o where o.id = $1 or o.product_id = $1 limit 1`, [req.params.key])).rows[0]?.k
      : (await db.query(`select coalesce(o.product_id, o.id) k from outlets o where not o.archived and lower(trim(both '-' from regexp_replace(brand_name(o), '[^a-zA-Z0-9]+', '-', 'g'))) = $1
          order by o.company_id is null, o.id limit 1`, [req.params.key])).rows[0]?.k
    const b = key && (await brands(db, at, me?.role === 'buyer' ? me.actAs.companyId : null, key))[0]
    if (!b) throw new NotFound()
    const places = (await db.query(`select p.*, (select count(*)::int from slots s where s.placement_id = p.id and s.status = 'open' and s.closes_at > $2) open_slots,
        (select min(s.starts_at) from slots s where s.placement_id = p.id and s.status = 'open' and s.closes_at > $2) next_at
      from placements p where p.outlet_id = any($1::uuid[]) and not p.archived order by p.kind, p.name`, [b.rows.map((r: any) => r.id), at])).rows
    const ratings = await Promise.all(b.rows.map((r: any) => outletRating(db, r.id)))
    const f = b.rows[0]
    return { ...b.card, description: f.brand_description ?? f.description, website: b.rows.find((r: any) => r.website)?.website ?? null,
      recent: ratings.flatMap(r => r.recent).sort((x, y) => +new Date(y.at) - +new Date(x.at)).slice(0, 5),
      products: b.rows.map((m: any) => ({ id: m.id, name: m.name, channel: m.channel, channelOther: m.channel_other, description: m.description, nameAr: m.name_ar, website: m.website,
        language: m.language, audience: m.audience, audiences: m.audiences ?? [], markets: m.markets ?? [], reach: m.reach, reachUnit: m.reach_unit, sectors: m.sectors ?? [],
        blocked: m.blocked_industries ?? [], specType: m.spec_type, specDetail: m.spec_detail, notes: m.notes, details: m.details ?? {},
        creativeDays: m.creative_days, closeDays: m.close_days, defaultPrice: m.price == null ? null : Number(m.price), coverUrl: coverUrl(m), onSale: m.on_sale,
        sellable: places.filter((p: any) => p.outlet_id === m.id).map((p: any) => ({ id: p.id, kind: p.kind, name: p.name, days: p.days, saleType: p.sale_type,
          startsAt: p.starts_at_local?.slice(0, 5) ?? null, endsAt: p.ends_at_local?.slice(0, 5) ?? null,
          price: Number(p.default_price ?? m.price ?? p.starting_price), startingPrice: Number(p.starting_price), creativeDays: Math.round(p.creative_lead_hours / 24),
          openSlots: p.open_slots, nextAt: p.next_at, description: p.description })) })) }
  })

  // Saved outlets: a star on every outlet card and outlet page (no campaign needed)
  route('PUT', '/api/directory/:key/saved', BUYER, async ({ db, at, me }, req) => {
    if (!(await db.query(`select 1 from outlets where coalesce(product_id, id) = $1`, [req.params.key])).rowCount) throw new NotFound()
    await db.query(`insert into saved_outlets (company_id, brand_key, created_at) values ($1, $2, $3) on conflict do nothing`, [me.actAs.companyId, req.params.key, at])
    return { saved: true }
  })
  route('DELETE', '/api/directory/:key/saved', BUYER, async ({ db, me }, req) => {
    await db.query(`delete from saved_outlets where company_id = $1 and brand_key = $2`, [me.actAs.companyId, req.params.key])
    return { saved: false }
  })

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

  // Live proof for the landing page, from real records only. A figure appears once it is big enough to mean something
  // (owner rule: hide data we don't have); below that it is null and the page simply leaves it out.
  let cached: { at: number; body: unknown } | null = null
  route('GET', '/api/public/stats', [...BUYER, 'seller', 'admin', 'guest'], async ({ db, at }) => {
    if (cached && at.getTime() - cached.at < 5 * 60_000 && at.getTime() >= cached.at) return cached.body
    const r = (await db.query(`select
        (select count(distinct c.id)::int from companies c join outlets o on o.company_id = c.id where c.type = 'publisher' and c.payouts_enabled) publishers,
        (select count(*)::int from outlets o join companies c on c.id = o.company_id where c.payouts_enabled and ${OPEN} ? o.market) outlets,
        (select count(distinct o.channel)::int from outlets o join companies c on c.id = o.company_id where c.payouts_enabled) channels,
        (select count(*)::int from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
          where s.status = 'open' and s.closes_at > $1 and s.starts_at < $1::timestamptz + interval '30 days' and ${OPEN} ? o.market) open_slots,
        (select count(*)::int from deals where status in ('released', 'paid_out')) completed,
        (select coalesce(sum(amount), 0)::bigint from deals where status in ('secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out', 'refunded')) booked`, [at])).rows[0]
    const show = (v: number, min: number) => v >= min ? v : null
    const body = { publishers: show(r.publishers, 3), outlets: show(r.outlets, 5), channels: show(r.channels, 3), openSlots: show(r.open_slots, 50),
      completed: show(r.completed, 10), booked: show(Number(r.booked), 5_000_000) /* AED 50,000 */ }
    cached = { at: at.getTime(), body }
    return body
  })

  // For search engines: every public page and every outlet, at the site's own address.
  route('GET', '/api/sitemap.xml', 'public', async ({ db }, req, reply) => {
    const origin = (process.env.SITE_URL ?? `${req.protocol}://${req.headers.host}`).replace(/\/$/, '')
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const outlets = (await db.query(`select o.id, o.name from outlets o order by o.name`)).rows
    const urls = [['/', 'daily', '1.0'], ['/calendar', 'hourly', '0.9'], ['/directory', 'daily', '0.9'], ['/request-access', 'monthly', '0.6'],
      ...outlets.map(o => [`/directory/${slugOf(o.name, o.id)}`, 'weekly', '0.7']),
      ['/audiences', 'weekly', '0.8'], ...AUDIENCE_KEYS.map(k => [`/audiences/${k}`, 'daily', '0.7']), ...PUBLIC_INDUSTRIES.map(k => [`/advertise/${k}`, 'daily', '0.7']),
      ['/insights', 'weekly', '0.6'], ...ARTICLE_SLUGS.map(k => [`/insights/${k}`, 'monthly', '0.5']), ['/terms', 'yearly', '0.2'], ['/privacy', 'yearly', '0.2'], ['/refunds', 'yearly', '0.2']]
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

  // Campaigns (owner's buyer-side fixes): the campaign is the plan. Dates, an optional budget, one brief sent with every bid
  // tagged to it, and a plan of products (a product's own unit or a programme), each costed at its default price.
  const LIVE = `('awaiting_seller')`, RAN = `('in_review', 'issue_open', 'disputed', 'released', 'paid_out')`
  const totals = `select c.*, c.start_date::text start_text, c.end_date::text end_text,
      coalesce((select sum(d.amount) from deals d where d.campaign_id = c.id and d.status in ${BOOKED}), 0)::bigint committed,
      coalesce((select sum(d.amount) from deals d where d.campaign_id = c.id and d.status in ${LIVE}), 0)::bigint pending,
      coalesce((select sum(coalesce(p.default_price, o.default_price, p.starting_price)) from campaign_lines l join placements p on p.id = l.placement_id
        join outlets o on o.id = p.outlet_id where l.campaign_id = c.id), 0)::bigint estimated,
      (select count(*)::int from campaign_lines l where l.campaign_id = c.id) lines,
      (select name from clients where id = c.client_id) client
    from campaigns c where c.buyer_id = $1`
  const num = (v: any) => v == null ? null : Number(v)
  const card = (c: any) => ({ id: c.id, name: c.name, budget: num(c.budget), startDate: c.start_text, endDate: c.end_text, objective: c.objective,
    brief: c.brief ?? null, status: c.status, clientId: c.client_id, client: c.client, lines: c.lines,
    estimated: Number(c.estimated), committed: Number(c.committed), pending: Number(c.pending),
    // what is left to spend: the budget less what publishers accepted and what is waiting for them
    remaining: c.budget == null ? null : Number(c.budget) - Number(c.committed) - Number(c.pending) })
  const briefSchema = { type: 'object', additionalProperties: false, properties: {
    advertiser: { type: 'string', maxLength: 200 }, industry: { type: 'string', maxLength: 100 }, message: { type: 'string', maxLength: 280 },
    language: { enum: ['arabic', 'english', 'bilingual', 'other'] }, languageOther: { type: 'string', maxLength: 60 }, draftFileKey: { type: 'string', maxLength: 300 },
    creativeToFollow: { type: 'boolean' }, disclaimer: { type: 'string', maxLength: 500 }, landingUrl: { type: 'string', maxLength: 500 } } }
  const campaignBody = { type: 'object', additionalProperties: false, properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 }, budget: { type: ['integer', 'null'], minimum: 1 },
    startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' },
    objective: { type: ['string', 'null'], maxLength: 500 }, brief: briefSchema,
    status: { enum: ['active', 'completed'] }, clientId: { type: ['string', 'null'], format: 'uuid' } } }
  const ownClient = async (db: any, id: string | null | undefined, buyerId: string) => {
    if (id && !(await db.query(`select 1 from clients where id = $1 and buyer_id = $2`, [id, buyerId])).rowCount) throw new MarketError('Choose one of your clients.')
  }
  function check(b: any) {
    if (b.name != null && !b.name.trim()) throw new MarketError('Add the campaign name.')
    if (b.startDate && b.endDate && b.endDate < b.startDate) throw new MarketError('The end date must be on or after the start date.')
    if (b.brief) {
      const problem = briefProblems(b.brief, 'campaign')[0]
      if (problem) throw new MarketError(problem === 'A booking brief is required with your first bid.' ? 'Fill in the campaign brief.' : problem)
      if (b.brief.landingUrl === '') delete b.brief.landingUrl
    }
  }

  route('GET', '/api/campaigns', BUYER, async ({ db, me }) =>
    (await db.query(`${totals} order by c.status, c.created_at desc`, [me.actAs.companyId])).rows.map(card))

  route('POST', '/api/campaigns', BUYER, async ({ db, at, me }, req) => {
    const b = req.body; check(b)
    await ownClient(db, b.clientId, me.actAs.companyId)
    const c = (await db.query(`insert into campaigns (buyer_id, name, budget, start_date, end_date, launch_date, objective, brief, created_at, client_id)
                               values ($1, $2, $3, $4, $5, $4, $6, $7, $8, $9) returning id`,
      [me.actAs.companyId, b.name.trim(), b.budget ?? null, b.startDate, b.endDate, b.objective?.trim() || null, JSON.stringify(b.brief), at, b.clientId ?? null])).rows[0]
    await audit(db, `user:${me.userId}`, 'campaign.created', 'campaign', c.id, { name: b.name }, at)
    return { id: c.id }
  }, { ...campaignBody, required: ['name', 'startDate', 'endDate', 'brief'] })

  route('PUT', '/api/campaigns/:id', BUYER, async ({ db, me }, req) => {
    const b = req.body; check(b)
    const cols: Record<string, string> = { name: 'name', budget: 'budget', startDate: 'start_date', endDate: 'end_date', objective: 'objective', brief: 'brief', status: 'status', clientId: 'client_id' }
    await ownClient(db, b.clientId, me.actAs.companyId)
    const set = Object.entries(cols).filter(([k]) => k in b)
    if (!set.length) throw new MarketError('Nothing to change.')
    const val = (k: string) => k === 'brief' ? JSON.stringify(b.brief) : typeof b[k] === 'string' && k !== 'status' ? b[k].trim() || null : b[k]
    const r = await db.query(`update campaigns set ${set.map(([, c], i) => `${c} = $${i + 3}`).join(', ')} where id = $1 and buyer_id = $2 returning id`,
      [req.params.id, me.actAs.companyId, ...set.map(([k]) => val(k))])
    if (!r.rowCount) throw new NotFound()
    const d = (await db.query(`select start_date, end_date from campaigns where id = $1`, [req.params.id])).rows[0]
    if (d.start_date && d.end_date && d.end_date < d.start_date) throw new MarketError('The end date must be on or after the start date.')
    return { ok: true }
  }, campaignBody)

  route('GET', '/api/campaigns/:id', BUYER, async ({ db, me, at }, req) => {
    const c = (await db.query(`${totals} and c.id = $2`, [me.actAs.companyId, req.params.id])).rows[0]
    if (!c) throw new NotFound()
    // each product in the plan: its estimated cost, and how far it has got (Added, Bid placed, Accepted, Paid, Ran)
    const lines = (await db.query(
      `select p.id placement_id, p.kind, p.name, o.id outlet_id, o.channel, o.default_price, p.default_price p_default, p.starting_price,
         pr.id brand_id, brand_name(o) brand, coalesce(pr.logo_key, null) brand_logo_key, o.logo_key outlet_logo_key, l.added_at,
         (select count(*)::int from slots s where s.placement_id = p.id and s.status = 'open' and s.closes_at > $2) open_slots,
         coalesce((select sum(d.amount) from deals d join slots s on s.id = d.slot_id where s.placement_id = p.id and d.campaign_id = $1 and d.status in ${BOOKED}), 0)::bigint committed,
         case when exists (select 1 from deals d join slots s on s.id = d.slot_id where s.placement_id = p.id and d.campaign_id = $1 and d.status in ${RAN}) then 'ran'
              when exists (select 1 from deals d join slots s on s.id = d.slot_id where s.placement_id = p.id and d.campaign_id = $1 and d.status = 'secured') then 'paid'
              when exists (select 1 from deals d join slots s on s.id = d.slot_id where s.placement_id = p.id and d.campaign_id = $1 and d.status = 'awaiting_payment') then 'accepted'
              when exists (select 1 from bids b join slots s on s.id = b.slot_id where s.placement_id = p.id and b.campaign_id = $1 and b.status in ('active', 'selected'))
                or exists (select 1 from deals d join slots s on s.id = d.slot_id where s.placement_id = p.id and d.campaign_id = $1 and d.status = 'awaiting_seller') then 'bid'
              else 'added' end stage
       from campaign_lines l join placements p on p.id = l.placement_id join outlets o on o.id = p.outlet_id left join products pr on pr.id = o.product_id
       where l.campaign_id = $1 order by brand_name(o), p.name`, [c.id, at])).rows
    const deals = (await db.query(
      `select d.id, d.ref, d.status, d.amount, s.label, s.starts_at, brand_name(o) outlet, o.channel, p.name placement from deals d join slots s on s.id = d.slot_id
       join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where d.campaign_id = $1 order by s.starts_at`, [c.id])).rows
    return { ...card(c),
      plan: lines.map(l => ({ placementId: l.placement_id, productId: l.outlet_id, brandId: l.brand_id, title: `${l.brand ?? ''} · ${l.name}`.replace(/^ · /, ''),
        brand: l.brand, name: l.name, kind: l.kind, channel: l.channel, logoUrl: brandLogoUrl(l.brand_id, l.brand_logo_key) ?? logoUrl({ id: l.outlet_id, logo_key: l.outlet_logo_key }),
        estimated: Number(l.p_default ?? l.default_price ?? l.starting_price), committed: Number(l.committed), stage: l.stage, openSlots: l.open_slots })),
      bookings: deals.map(d => ({ id: d.id, ref: d.ref, status: buyerStatus[d.status] ?? d.status, price: Number(d.amount), label: d.label, startsAt: d.starts_at,
        outlet: d.outlet, channel: d.channel, placement: d.placement })) }
  })

  // Add a product (its own unit or a programme) to the plan, or take it out. Products of a market not open yet can be planned.
  route('POST', '/api/campaigns/:id/lines', BUYER, async ({ db, at, me }, req) => {
    const c = (await db.query(`select id from campaigns where id = $1 and buyer_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!c) throw new NotFound()
    const p = (await db.query(`select p.id from placements p where p.id = $1 and not p.archived`, [req.body.placementId])).rows[0]
    if (!p) throw new MarketError('This product is no longer on sale.')
    await db.query(`insert into campaign_lines (campaign_id, placement_id, added_at) values ($1, $2, $3) on conflict do nothing`, [c.id, p.id, at])
    return { ok: true }
  }, { type: 'object', required: ['placementId'], additionalProperties: false, properties: { placementId: { type: 'string', format: 'uuid' } } })

  route('DELETE', '/api/campaigns/:id/lines/:placement', BUYER, async ({ db, me }, req) => {
    const r = await db.query(`delete from campaign_lines l using campaigns c where c.id = l.campaign_id and c.id = $1 and c.buyer_id = $2 and l.placement_id = $3`,
      [req.params.id, me.actAs.companyId, req.params.placement])
    if (!r.rowCount) throw new NotFound()
    return { ok: true }
  })
}
