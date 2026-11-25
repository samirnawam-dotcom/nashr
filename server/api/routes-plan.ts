import { AUDIENCE_KEYS } from '../shared/audiences.js'
import { prelaunch } from './launch.js'
import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { MarketError, ownFile } from '../marketplace/market.js'
import { containsContactDetails } from '../core/contact.js'
import { notify } from '../core/notify.js'
import { audit } from '../core/audit.js'
import { buyerStatus } from './shapes.js'
import { brandLogoUrl, clientLogoUrl, coverUrl, logoUrl } from './routes-covers.js'
import { briefProblems } from '../fulfilment/brief.js'
import { outletRating } from './routes-ratings.js'
import { parseQuery, where } from '../marketplace/search.js'
import { reachMatch, reachWindow } from '../shared/slot-filter.js'
import { estimate, planBudget, readRequest, score, type Candidate, type PlanCandidate } from '../shared/athena.js'

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

  // ---- Products view (owner's "Buying moves to the Directory") ----------------------------------------------------------
  // One card per product (a placement: the media type's own unit, or one of its programmes) with something on sale, filtered by
  // every shopping filter and sorted like the outlets. `brands` lists every outlet with a matching product, so the Outlets view can
  // show "an outlet if any of its products match". All in SQL: 1000+ outlets stay cheap.
  route('GET', '/api/directory/products', [...BUYER, 'admin', 'guest'], async ({ db, at, me }, req) => {
    const r = req.query as Record<string, string | undefined>
    const buyer = me?.role === 'buyer' ? me.actAs.companyId : null
    const day = (v?: string) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined
    const dateFrom = day(r.dateFrom), dateTo = day(r.dateTo)
    // "on sale between": listings airing on those Dubai dates (both included); otherwise everything on sale in the next 90 days
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00+04:00`) : at
    const to = dateTo ? new Date(new Date(`${dateTo}T00:00:00+04:00`).getTime() + 86_400_000) : new Date(at.getTime() + 90 * 86_400_000)
    const q = { ...parseQuery({ ...r, from: undefined, to: undefined }, buyer, (from > at ? from : at).toISOString(), to.toISOString()), open: true }
    q.to = to.toISOString() // the window the buyer typed, not the calendar's 62-day screen limit
    const num = (v?: string) => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined
    const reach = { reachMin: num(r.reachMin), reachMax: num(r.reachMax) }, reachOnly = r.reachOnly === '1', win = reachWindow(reach)
    const w = where(q, at)
    const extra: string[] = []
    if (r.market) extra.push(`o.market = ${w.add(r.market)}`)
    if (r.saved === '1') extra.push(buyer ? `exists (select 1 from saved_outlets so where so.company_id = ${w.add(buyer)} and so.brand_key = coalesce(o.product_id, o.id))` : 'false')
    const reachSet = reach.reachMin != null || reach.reachMax != null
    if (reachSet) {
      const inRange = [win.lo != null ? `o.reach >= ${w.add(win.lo)}` : '', win.hi != null ? `o.reach <= ${w.add(win.hi)}` : ''].filter(Boolean).join(' and ')
      extra.push(reachOnly ? `(${inRange})` : `(o.reach is null or (${inRange}))`)
    }
    const cond = [w.where.replace(/^where /, ''), ...extra].join(' and '), condParams = w.params.length // the outlets query below uses only these
    const sort = (['popular', 'price_asc', 'price_desc', 'closing', 'newest'] as const).find(x => x === r.sort) ?? 'popular'
    // products with no reach given come last when the buyer filters by reach
    const order = [reachSet ? '(o.reach is null)' : '', sort === 'price_asc' ? 'from_price' : sort === 'price_desc' ? 'from_price desc' : sort === 'closing' ? 'next_closes'
      : sort === 'newest' ? 'joined desc nulls last' : 'popular desc', 'title'].filter(Boolean).join(', ')
    const limit = Math.min(Math.max(Number(r.limit) || 60, 1), 200), offset = Math.max(Number(r.offset) || 0, 0)
    // Athena (rules only): rank by fit to what the buyer asked (who to reach, language, time of day, their words, reach for the price)
    const athena = r.rank === 'athena', words = (v?: string) => (v ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).slice(0, 20)
    const ask = { audiences: words(r.aaud), languages: words(r.alang), dayparts: words(r.adp), words: words(r.awords), sectors: q.sectors ?? [] }
    const rows = (await db.query(`select p.id placement_id, p.kind, p.name placement, p.sale_type, p.buy_now_price placement_buy_now, o.id outlet_id, o.product_id, o.channel,
        p.audiences p_aud, o.audiences o_aud, o.audience aud_text, concat_ws(' ', p.description, o.description, pr.description) about, coalesce(p.language, o.language) lang,
        o.sectors, p.starts_at_local::text starts_local,
        o.channel_other, o.reach, o.reach_unit, o.logo_key, o.logo_url, pr.logo_key brand_logo_key, brand_name(o) brand, coalesce(o.product_id, o.id) brand_key,
        case when p.kind = 'main' then brand_name(o) || ' · ' || o.name else brand_name(o) || ' · ' || p.name end title,
        count(*)::int on_sale, min(coalesce(s.top_amount, s.starting_price)) from_price, min(s.buy_now_price) buy_now, min(s.starts_at) next_at, min(s.closes_at) next_closes,
        count(distinct s.sale_type)::int sale_types, min(s.sale_type) one_sale_type,
        max(coalesce(pr.created_at, c.created_at)) joined,
        ((select count(*) from bids b2 join slots s2 on s2.id = b2.slot_id where s2.placement_id = p.id and b2.created_at > now() - interval '90 days')
          + (select count(*) from deals d2 join slots s2 on s2.id = d2.slot_id where s2.placement_id = p.id and d2.created_at > now() - interval '90 days')) popular,
        ${buyer ? `exists (select 1 from saved_outlets so where so.company_id = ${w.add(buyer)} and so.brand_key = coalesce(o.product_id, o.id))` : 'false'} saved,
        count(*) over ()::int total
      ${w.from} where ${cond} and not p.archived
      group by p.id, o.id, pr.id order by ${order} limit ${athena ? 300 : limit} offset ${athena ? 0 : offset}`, w.params)).rows
    if (athena) {
      const part = (t: string | null) => { const h = t ? Number(t.slice(0, 2)) : NaN; return Number.isNaN(h) ? [] : h >= 5 && h < 12 ? ['morning'] : h < 17 && h >= 12 ? ['afternoon'] : h >= 17 ? ['evening'] : [] }
      for (const x of rows as any[]) {
        const c: Candidate = { channel: x.channel, placement: x.placement, brand: x.brand, kind: x.kind, audiences: (x.p_aud?.length ? x.p_aud : x.o_aud) ?? [], audienceText: x.aud_text,
          text: x.about ?? '', language: x.lang, reach: x.reach, price: Number(x.from_price), onSale: x.on_sale, popular: Number(x.popular), sectors: x.sectors ?? [], blocked: [],
          dayparts: part(x.starts_local) }
        const sc = score(c, ask)
        x.athena = { score: sc.score, why: { audiences: sc.audiences, sectors: ask.sectors.filter(y => !(x.sectors ?? []).length || (x.sectors ?? []).map((z: string) => z.toLowerCase()).includes(y.toLowerCase())),
          dayparts: ask.dayparts.filter(d => c.dayparts!.includes(d)), language: ask.languages.length && x.lang ? x.lang : null, onSale: x.on_sale, inDates: !!dateFrom } }
      }
      rows.sort((a: any, b: any) => b.athena.score - a.athena.score)
      rows.splice(0, offset); rows.splice(limit)
      // the Get started line "Ask Athena something in the search bar"
      if (buyer && !(await db.query(`select 1 from audit_log where action = 'athena.asked' and entity_id = $1 limit 1`, [buyer])).rowCount)
        await audit(db, `user:${me!.userId}`, 'athena.asked', 'company', buyer, null, at)
    }
    const brands = (await db.query(`select distinct coalesce(o.product_id, o.id) k ${w.from} where ${cond} and not p.archived`, w.params.slice(0, condParams))).rows.map((x: any) => x.k)
    const slug = (n: string, k: string) => n.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || k
    return { total: rows[0]?.total ?? 0, brands, items: rows.map((x: any) => ({
      placementId: x.placement_id, title: x.title, product: x.kind === 'main' ? null : x.placement, brand: x.brand, brandKey: x.brand_key, slug: slug(x.brand, x.brand_key),
      logoUrl: brandLogoUrl(x.product_id, x.brand_logo_key) ?? logoUrl({ id: x.outlet_id, logo_key: x.logo_key }) ?? x.logo_url ?? null,
      channel: x.channel, channelOther: x.channel_other,
      // the sale type of what is on sale (a programme sells one way; if its listings differ, the placement's own)
      saleType: x.sale_types === 1 ? x.one_sale_type : x.sale_type, price: x.from_price, buyNowPrice: x.buy_now,
      onSale: x.on_sale, nextAt: x.next_at, nextClosesAt: x.next_closes, reach: x.reach, reachUnit: x.reach_unit,
      reachMatch: reachSet ? reachMatch(x.reach, reach) : null, saved: x.saved, why: x.athena?.why ?? null,
    })) }
  })

  // Dates on sale for one product (the panel a product card opens before the bid drawer): one line per listing, soonest first.
  route('GET', '/api/directory/products/:placement/dates', [...BUYER, 'admin', 'guest'], async ({ db, at, me }, req) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(req.params.placement)) throw new NotFound()
    const buyer = me?.role === 'buyer' ? me.actAs.companyId : null
    const q = { ...parseQuery({}, buyer, at.toISOString(), new Date(at.getTime() + 90 * 86_400_000).toISOString()), open: true, placement: req.params.placement }
    q.to = new Date(at.getTime() + 90 * 86_400_000).toISOString()
    const w = where(q, at)
    return (await db.query(`select s.id, s.label, s.kind, s.sale_type, s.starts_at, s.ends_at, s.closes_at, coalesce(s.top_amount, s.starting_price) price, s.buy_now_price,
        o.channel ${w.from} ${w.where} order by s.starts_at, s.id limit 120`, w.params)).rows.map((x: any) => ({
      id: x.id, label: x.label, kind: x.kind, saleType: x.sale_type, startsAt: x.starts_at, endsAt: x.ends_at, closesAt: x.closes_at, price: x.price, buyNowPrice: x.buy_now_price,
      // times matter for radio and TV only
      timed: x.channel === 'radio' || x.channel === 'tv' }))
  })

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
    if (prelaunch()) return reply.code(404).send({ error: 'Not found.' }) // nothing to index before release
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
      coalesce((select sum(coalesce((select coalesce(s.top_amount, s.starting_price) from slots s where s.id = l.slot_id), p.default_price, o.default_price, p.starting_price))
        from campaign_lines l join placements p on p.id = l.placement_id
        join outlets o on o.id = p.outlet_id where l.campaign_id = c.id), 0)::bigint estimated,
      (select count(*)::int from campaign_lines l where l.campaign_id = c.id) lines,
      (select name from clients where id = c.client_id) client, (select logo_key from clients where id = c.client_id) client_logo_key,
      -- where things are: products planned with nothing bid yet, open bids and requests, accepted to pay, paid, ran
      (select count(*)::int from campaign_lines l join placements p on p.id = l.placement_id where l.campaign_id = c.id
         and not exists (select 1 from bids b join slots s on s.id = b.slot_id where b.campaign_id = c.id and b.status in ('active', 'outbid', 'selected')
           and (case when l.slot_id is not null then b.slot_id = l.slot_id else s.placement_id = p.id end))
         and not exists (select 1 from deals d join slots s on s.id = d.slot_id where d.campaign_id = c.id and d.status not in ('declined', 'lapsed', 'cancelled', 'refunded')
           and (case when l.slot_id is not null then d.slot_id = l.slot_id else s.placement_id = p.id end))) n_added,
      ((select count(distinct b.slot_id)::int from bids b join slots s on s.id = b.slot_id where b.campaign_id = c.id and b.status in ('active', 'outbid') and s.status = 'open')
        + (select count(*)::int from deals d where d.campaign_id = c.id and d.status = 'awaiting_seller')) n_bids,
      (select count(*)::int from deals d where d.campaign_id = c.id and d.status = 'awaiting_payment') n_pay,
      (select count(*)::int from deals d where d.campaign_id = c.id and d.status = 'secured') n_paid,
      (select count(*)::int from deals d where d.campaign_id = c.id and d.status in ${RAN}) n_ran
    from campaigns c where c.buyer_id = $1`
  const num = (v: any) => v == null ? null : Number(v)
  const card = (c: any) => ({ id: c.id, name: c.name, budget: num(c.budget), startDate: c.start_text, endDate: c.end_text, objective: c.objective,
    brief: c.brief ?? null, status: c.status, clientId: c.client_id, client: c.client, clientLogoUrl: clientLogoUrl(c.client_id, c.client_logo_key), lines: c.lines,
    counts: { added: c.n_added, bids: c.n_bids, pay: c.n_pay, paid: c.n_paid, ran: c.n_ran },
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

  // The next thing to do on each campaign, most urgent first: pay an accepted booking, a bid about to close, a proof to check
  const nextSteps = async (db: any, buyer: string, at: Date, one?: string) => new Map((await db.query(`select distinct on (campaign_id) campaign_id, kind, outlet, due from (
      select d.campaign_id, 'pay' kind, brand_name(o) outlet, d.next_deadline_at due, 1 rank from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id
        join outlets o on o.id = p.outlet_id where d.buyer_id = $1 and d.status = 'awaiting_payment'
      union all
      select b.campaign_id, 'closes', brand_name(o), s.closes_at, 2 from bids b join slots s on s.id = b.slot_id join placements p on p.id = s.placement_id
        join outlets o on o.id = p.outlet_id where b.buyer_id = $1 and b.status in ('active', 'outbid') and s.status = 'open' and s.closes_at > $2
      union all
      select d.campaign_id, 'proof', brand_name(o), d.next_deadline_at, 3 from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id
        join outlets o on o.id = p.outlet_id where d.buyer_id = $1 and d.status = 'in_review'
    ) x where campaign_id is not null and ($3::uuid is null or campaign_id = $3) order by campaign_id, rank, due nulls last`, [buyer, at, one ?? null])).rows
    .map((r: any) => [r.campaign_id, { kind: r.kind, outlet: r.outlet, due: r.due }]))

  route('GET', '/api/campaigns', BUYER, async ({ db, me, at }) => {
    const next = await nextSteps(db, me.actAs.companyId, at)
    return (await db.query(`${totals} order by c.start_date desc nulls last, c.created_at desc`, [me.actAs.companyId])).rows.map(c => ({ ...card(c), next: next.get(c.id) ?? null }))
  })

  route('POST', '/api/campaigns', BUYER, async ({ db, at, me }, req) => {
    const b = req.body; check(b); if (b.brief) await ownFile(db, b.brief.draftFileKey, me.actAs.companyId)
    await ownClient(db, b.clientId, me.actAs.companyId)
    const c = (await db.query(`insert into campaigns (buyer_id, name, budget, start_date, end_date, launch_date, objective, brief, created_at, client_id)
                               values ($1, $2, $3, $4, $5, $4, $6, $7, $8, $9) returning id`,
      [me.actAs.companyId, b.name.trim(), b.budget ?? null, b.startDate, b.endDate, b.objective?.trim() || null, JSON.stringify(b.brief), at, b.clientId ?? null])).rows[0]
    await audit(db, `user:${me.userId}`, 'campaign.created', 'campaign', c.id, { name: b.name }, at)
    return { id: c.id }
  }, { ...campaignBody, required: ['name', 'startDate', 'endDate', 'brief'] })

  route('PUT', '/api/campaigns/:id', BUYER, async ({ db, me }, req) => {
    const b = req.body; check(b); if (b.brief) await ownFile(db, b.brief.draftFileKey, me.actAs.companyId)
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
    const next = (await nextSteps(db, me.actAs.companyId, at, c.id)).get(c.id) ?? null
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
    const once = new Set<string>(), products = lines.filter((l: any) => !once.has(l.placement_id) && once.add(l.placement_id))
    return { ...card(c), next,
      plan: products.map(l => ({ placementId: l.placement_id, productId: l.outlet_id, brandId: l.brand_id, title: `${l.brand ?? ''} · ${l.name}`.replace(/^ · /, ''),
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
    // added from one listing (the bid drawer): that date is the one planned
    const slot = req.body.slotId ? (await db.query(`select id from slots where id = $1 and placement_id = $2`, [req.body.slotId, p.id])).rows[0]?.id ?? null : null
    // a date for a product already planned without one fills that line; otherwise each date is its own line
    const filled = slot ? (await db.query(`update campaign_lines set slot_id = $3 where campaign_id = $1 and placement_id = $2 and slot_id is null
        and not exists (select 1 from campaign_lines l2 where l2.campaign_id = $1 and l2.slot_id = $3)`, [c.id, p.id, slot])).rowCount : 0
    if (!filled) await db.query(`insert into campaign_lines (campaign_id, placement_id, added_at, slot_id) values ($1, $2, $3, $4)
        on conflict (campaign_id, placement_id, (coalesce(slot_id, '00000000-0000-0000-0000-000000000000'::uuid))) do nothing`, [c.id, p.id, at, slot])
    return { ok: true }
  }, { type: 'object', required: ['placementId'], additionalProperties: false, properties: { placementId: { type: 'string', format: 'uuid' }, slotId: { type: 'string', format: 'uuid' } } })

  route('DELETE', '/api/campaigns/:id/lines/:placement', BUYER, async ({ db, me }, req) => {
    const r = await db.query(`delete from campaign_lines l using campaigns c where c.id = l.campaign_id and c.id = $1 and c.buyer_id = $2 and l.placement_id = $3`,
      [req.params.id, me.actAs.companyId, req.params.placement])
    if (!r.rowCount) throw new NotFound()
    return { ok: true }
  })

  // The buyer's Calendar (owner's "Buying moves to the Directory"): only the buyer's own items, each with its price, status and next
  // deadline. Added (planned in a campaign) · You lead / Outbid · Waiting for seller · Accepted, pay now · Paid · Ran, check proof · Completed.
  route('GET', '/api/buyer/tracker', BUYER, async ({ db, me, at }, req) => {
    const b = me.actAs.companyId, r = req.query as Record<string, string | undefined>
    const iso = (v?: string) => v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null
    const from = iso(r.from) ?? new Date(at.getTime() - 7 * 86_400_000), to = iso(r.to) ?? new Date(at.getTime() + 62 * 86_400_000)
    const uuid = (v?: string) => v && /^[0-9a-f-]{36}$/i.test(v) ? v : null
    const campaign = uuid(r.campaign), client = uuid(r.client)
    const cols = `p.id placement_id, p.name placement, p.kind, o.id outlet_id, o.channel, o.logo_key, pr.id brand_id, pr.logo_key brand_logo_key,
      brand_name(o) brand, coalesce(o.product_id, o.id) brand_key`
    const joins = `join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id left join products pr on pr.id = o.product_id`
    // bookings: every deal still going or done (declined, lapsed, cancelled and refunded ones are not on the plan any more)
    const deals = (await db.query(`select d.id deal_id, d.status, d.amount, d.next_deadline_at, d.campaign_id, d.client_id, s.id slot_id, s.starts_at, s.label, ${cols}
        from deals d join slots s on s.id = d.slot_id ${joins}
        where d.buyer_id = $1 and d.status not in ('declined', 'lapsed', 'cancelled', 'refunded') and s.starts_at >= $2 and s.starts_at < $3
          and ($4::uuid is null or d.campaign_id = $4) and ($5::uuid is null or d.client_id = $5)`, [b, from, to, campaign, client])).rows
    // open bids and offers with no deal yet: the buyer's own highest on each listing
    const bids = (await db.query(`select distinct on (s.id) s.id slot_id, s.sale_type, s.top_buyer_id, s.closes_at, s.starts_at, s.label, bd.kind, bd.amount, bd.campaign_id, bd.client_id, ${cols}
        from bids bd join slots s on s.id = bd.slot_id ${joins}
        where bd.buyer_id = $1 and bd.status in ('active', 'outbid') and bd.kind in ('bid', 'auto', 'interest') and s.status = 'open' and s.closes_at > $6
          and s.starts_at >= $2 and s.starts_at < $3 and ($4::uuid is null or bd.campaign_id = $4) and ($5::uuid is null or bd.client_id = $5)
          and not exists (select 1 from deals d where d.slot_id = s.id and d.buyer_id = $1)
        order by s.id, bd.amount desc`, [b, from, to, campaign, client, at])).rows
    // planned: products in a campaign with nothing bid or booked on them yet in that campaign, on the date chosen or the next one on sale
    const planned = (await db.query(`select l.campaign_id, k.client_id, k.start_date::text start_text, ns.id slot_id, ns.starts_at, ns.closes_at, ns.label,
          coalesce(ns.top_amount, ns.starting_price, p.default_price, o.default_price, p.starting_price) amount, ${cols}
        from campaign_lines l join campaigns k on k.id = l.campaign_id join placements p on p.id = l.placement_id join outlets o on o.id = p.outlet_id
        left join products pr on pr.id = o.product_id
        left join lateral (select s.* from slots s where (l.slot_id is not null and s.id = l.slot_id)
            or (l.slot_id is null and s.placement_id = p.id and s.status = 'open' and s.closes_at > $6
                and s.starts_at >= greatest($6, coalesce(k.start_date::timestamp at time zone 'Asia/Dubai', $6))
                and (k.end_date is null or s.starts_at < (k.end_date + 1)::timestamp at time zone 'Asia/Dubai'))
            order by (s.id = l.slot_id) desc nulls last, s.starts_at limit 1) ns on true
        where k.buyer_id = $1 and k.status = 'active' and ($4::uuid is null or k.id = $4) and ($5::uuid is null or k.client_id = $5)
          -- planned and not yet bid on: a dated line, nothing on that date; an undated one, nothing on that product in this campaign
          and not exists (select 1 from bids bd join slots s2 on s2.id = bd.slot_id where bd.buyer_id = $1 and bd.campaign_id = k.id
                          and (case when l.slot_id is not null then bd.slot_id = l.slot_id else s2.placement_id = p.id end) and bd.status in ('active', 'outbid', 'selected'))
          and not exists (select 1 from deals d join slots s2 on s2.id = d.slot_id where d.buyer_id = $1 and d.campaign_id = k.id
                          and (case when l.slot_id is not null then d.slot_id = l.slot_id else s2.placement_id = p.id end) and d.status not in ('declined', 'lapsed', 'cancelled', 'refunded'))
          and coalesce(ns.starts_at, k.start_date::timestamp at time zone 'Asia/Dubai') >= $2
          and coalesce(ns.starts_at, k.start_date::timestamp at time zone 'Asia/Dubai') < $3`, [b, from, to, campaign, client, at])).rows
    const DEAL: Record<string, string> = { awaiting_seller: 'waiting', awaiting_payment: 'pay', secured: 'paid', in_review: 'ran', issue_open: 'ran', disputed: 'ran',
      released: 'completed', paid_out: 'completed' }
    const base = (x: any) => ({ placementId: x.placement_id, product: x.kind === 'main' ? x.brand : x.placement, brand: x.brand, brandKey: x.brand_key, channel: x.channel,
      logoUrl: brandLogoUrl(x.brand_id, x.brand_logo_key) ?? logoUrl({ id: x.outlet_id, logo_key: x.logo_key }), label: x.label ?? null, campaignId: x.campaign_id ?? null })
    let items = [
      ...deals.map(x => ({ ...base(x), status: DEAL[x.status] ?? 'waiting', at: x.starts_at, price: Number(x.amount), deadline: x.status === 'released' || x.status === 'paid_out' ? null : x.next_deadline_at,
        slotId: x.slot_id, dealId: x.deal_id, clientId: x.client_id })),
      ...bids.map(x => ({ ...base(x), status: x.kind === 'interest' ? 'waiting' : x.top_buyer_id === b ? 'lead' : 'outbid', at: x.starts_at, price: Number(x.amount),
        deadline: x.closes_at, slotId: x.slot_id, dealId: null, clientId: x.client_id })),
      ...planned.map(x => ({ ...base(x), status: 'added', at: x.starts_at ?? (x.start_text ? new Date(`${x.start_text}T12:00:00+04:00`) : at),
        price: x.amount == null ? null : Number(x.amount), deadline: x.closes_at ?? null, slotId: x.slot_id ?? null, dealId: null, clientId: x.client_id })),
    ]
    const statuses = (r.status ?? '').split(',').filter(Boolean)
    if (statuses.length) items = items.filter(i => statuses.includes(i.status))
    const words = (r.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length) items = items.filter(i => words.every(w => `${i.brand} ${i.product}`.toLowerCase().includes(w)))
    items.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime())
    return { items }
  })

  // The "Get started" list on the Dashboard (owner's guided onboarding): which steps this company has done.
  route('GET', '/api/me/get-started', ['buyer', 'seller'], async ({ db, me }) => {
    const c = me.actAs.companyId
    const co = (await db.query(`select logo_key, trn, address, payouts_enabled from companies where id = $1`, [c])).rows[0] ?? {}
    const company = !!co.logo_key && !!(co.trn || co.address)
    if (me.role === 'buyer') {
      const r = (await db.query(`select exists (select 1 from campaigns where buyer_id = $1) campaign,
          exists (select 1 from audit_log where action = 'athena.asked' and entity_id = $1::text) athena,
          exists (select 1 from bids where buyer_id = $1) or exists (select 1 from deals where buyer_id = $1) bid`, [c])).rows[0]
      return { steps: [{ key: 'company', done: company }, { key: 'athena', done: r.athena }, { key: 'campaign', done: r.campaign }, { key: 'bid', done: r.bid }] }
    }
    const r = (await db.query(`select exists (select 1 from products where company_id = $1) outlet,
        exists (select 1 from placements p join outlets o on o.id = p.outlet_id where o.company_id = $1 and not p.archived) product,
        exists (select 1 from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where o.company_id = $1) on_sale`, [c])).rows[0]
    return { steps: [{ key: 'company', done: company }, { key: 'outlet', done: r.outlet }, { key: 'product', done: r.product },
      { key: 'onSale', done: r.on_sale }, { key: 'payouts', done: !!co.payouts_enabled }] }
  })

  // Athena plans a campaign (owner's doc, rules only): reads the campaign's dates, budget, industry and brief plus what the buyer
  // typed, suggests a split by media type and the best products for each part, within the budget. It never bids or adds by itself.
  route('POST', '/api/athena/plan', BUYER, async ({ db, at, me }, req) => {
    const b = req.body as { text?: string; campaignId?: string; shares?: Record<string, number> }, buyer = me.actAs.companyId
    const today = new Date(at.getTime() + 4 * 3_600_000).toISOString().slice(0, 10)
    const c = b.campaignId ? (await db.query(`select start_date::text start_text, end_date::text end_text, budget, brief, objective, audience from campaigns
        where id = $1 and buyer_id = $2`, [b.campaignId, buyer])).rows[0] : null
    if (b.campaignId && !c) throw new NotFound()
    const r = readRequest(b.text ?? '', today), about = readRequest(`${b.text ?? ''} ${c?.audience ?? ''} ${c?.objective ?? ''} ${c?.brief?.message ?? ''}`, today)
    const from = r.dateFrom ?? c?.start_text, to = r.dateTo ?? c?.end_text, budget = r.amount ?? (c?.budget != null ? Number(c.budget) : undefined)
    const sectors = r.sectors.length ? r.sectors : c?.brief?.industry && c.brief.industry !== 'Other' ? [c.brief.industry] : []
    const languages = r.languages.length ? r.languages : c?.brief?.language && c.brief.language !== 'other' ? [c.brief.language === 'bilingual' ? 'english' : c.brief.language] : []
    const read = { channels: r.channels, sectors, dateFrom: from ?? null, dateTo: to ?? null, budget: budget ?? null, audiences: about.audiences, languages, fixes: r.fixes }
    // one short question when something important is missing
    if (!from || !to) return { read, question: 'dates', parts: [], total: 0 }
    if (!budget) return { read, question: 'amount', parts: [], total: 0 }
    await audit(db, `user:${me.userId}`, 'athena.asked', 'company', buyer, { plan: true }, at)
    // what is on sale in those dates, for that industry (its sectors accepted), in the open market
    const start = new Date(`${from}T00:00:00+04:00`), end = new Date(new Date(`${to}T00:00:00+04:00`).getTime() + 86_400_000)
    const q = { ...parseQuery({ sectors: sectors.join(','), market: 'AE' }, buyer, (start > at ? start : at).toISOString(), end.toISOString()), open: true }
    q.to = end.toISOString()
    const w = where(q, at)
    const rows = (await db.query(`select p.id placement_id, p.kind, p.name placement, o.id outlet_id, o.product_id, o.channel, o.reach, o.logo_key, o.logo_url, pr.logo_key brand_logo_key,
        brand_name(o) brand, coalesce(o.product_id, o.id) brand_key, p.audiences p_aud, o.audiences o_aud, o.audience aud_text,
        concat_ws(' ', p.description, o.description, pr.description) about, coalesce(p.language, o.language) lang, o.sectors, p.starts_at_local::text starts_local,
        count(*)::int on_sale, (array_agg(s.id order by s.starts_at))[1:20] slot_ids, (array_agg(s.starts_at order by s.starts_at))[1:20] slot_ats,
        (array_agg(s.sale_type order by s.starts_at))[1:20] slot_sales, (array_agg(coalesce(s.top_amount, s.starting_price) order by s.starts_at))[1:20] slot_prices,
        (select count(*) from bids b2 join slots s2 on s2.id = b2.slot_id where s2.placement_id = p.id and b2.created_at > now() - interval '90 days') popular
      ${w.from} ${w.where} and o.market = 'AE' and not p.archived group by p.id, o.id, pr.id limit 500`, w.params)).rows
    const part = (t: string | null) => { const h = t ? Number(t.slice(0, 2)) : NaN; return Number.isNaN(h) ? [] : h >= 5 && h < 12 ? ['morning'] : h >= 12 && h < 17 ? ['afternoon'] : h >= 17 ? ['evening'] : [] }
    const ask = { audiences: about.audiences, languages, dayparts: r.dayparts, words: about.words, sectors }
    // a product can run on several dates: its listings in the dates, spread out (up to 6), each one a choice
    const cands: PlanCandidate[] = rows.flatMap((x: any) => {
      const n = x.slot_ids.length, idx = [...new Set(Array.from({ length: Math.min(6, n) }, (_, i) => Math.floor(i * n / Math.min(6, n))))]
      const price = Math.min(...x.slot_prices.map(Number))
      const base: Candidate = { channel: x.channel, placement: x.placement, brand: x.brand, kind: x.kind, audiences: (x.p_aud?.length ? x.p_aud : x.o_aud) ?? [], audienceText: x.aud_text,
        text: x.about ?? '', language: x.lang, reach: x.reach, price, onSale: x.on_sale, popular: Number(x.popular), sectors: x.sectors ?? [], blocked: [], dayparts: part(x.starts_local) }
      const sc = score(base, ask)
      const why = [...sc.audiences.map(a => `aud:${a}`), ...base.dayparts!.filter(d => r.dayparts.includes(d)).map(d => `dp:${d}`),
        ...sectors.filter(y => !(x.sectors ?? []).length || (x.sectors ?? []).includes(y)).map(y => `sector:${y}`), `onSale:${x.on_sale}`, ...(x.reach ? [`reach:${x.reach}`] : [])]
      const logo = brandLogoUrl(x.product_id, x.brand_logo_key) ?? logoUrl({ id: x.outlet_id, logo_key: x.logo_key }) ?? x.logo_url ?? null
      // later dates of the same product rank a little lower, so other products come in first
      return idx.map((k, j) => ({ ...base, price: Number(x.slot_prices[k]), placementId: x.placement_id, brandKey: x.brand_key, slotId: x.slot_ids[k], slotAt: new Date(x.slot_ats[k]).toISOString(),
        saleType: x.slot_sales[k], fit: sc.score - j * 0.5, why, logoUrl: logo }) as PlanCandidate)
    })
    const shares = b.shares && Object.keys(b.shares).length ? b.shares : undefined
    const plan = planBudget(cands, budget, { channels: r.channels, shares })
    const line = (x: PlanCandidate) => ({ placementId: x.placementId, slotId: x.slotId, title: x.kind === 'main' ? x.brand : `${x.brand} · ${x.placement}`, brand: x.brand,
      channel: x.channel, logoUrl: (x as any).logoUrl, saleType: x.saleType, price: x.price, estimate: estimate(x), at: x.slotAt, onSale: x.onSale, why: x.why })
    const parts = plan.map(p => ({ channel: p.channel, share: p.share, amount: p.amount, count: p.count, picks: p.picks.map(line), spare: p.spare.map(line) }))
    return { read, question: null, parts, total: parts.reduce((n, p) => n + p.picks.reduce((m, x) => m + x.estimate, 0), 0) }
  }, { type: 'object', additionalProperties: false, properties: {
    text: { type: 'string', maxLength: 500 }, campaignId: { type: 'string', format: 'uuid' },
    shares: { type: 'object', additionalProperties: { type: 'integer', minimum: 0, maximum: 100 }, maxProperties: 9 } } })
}

