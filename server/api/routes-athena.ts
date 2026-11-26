import type pg from 'pg'
import { NotFound, type RouteFn } from './app.js'
import { minNextBid } from '../core/money.js'
import { setting } from '../core/settings.js'
import { arNorm, slips } from '../shared/spell.js'
import { audit } from '../core/audit.js'
import { lastMonth, reportEmail, reportFor } from '../core/report.js'
import { SEASONS, dubaiDay, seasonsOn, seasonsSoon } from '../shared/seasons.js'
import { MarketError } from '../marketplace/market.js'

/*
 * Athena's own reads (rules and Nashr's records only, no outside AI):
 *  - bid advice: what slots like this one actually sold for lately, and a bid that would have won most of those sales;
 *  - what Athena noticed for this person: bids to answer, products priced above the market, dates about to close unsold,
 *    and for Nashr's team the queues that wait on them.
 * Athena only ever reports what happened on Nashr; it never invents a price, and says so when it has too few sales to go on.
 */
const SOLD = `d.status not in ('declined', 'lapsed', 'cancelled', 'refunded')`
const DAYS = 90, ENOUGH = 3
const slugOf = (name: string, id: string) => name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || id

/** Sorted prices (fils) of auction sales over the last 90 days that match `where`. */
async function sales(db: pg.PoolClient, where: string, params: unknown[], at: Date) {
  return (await db.query(`select d.amount::bigint a from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
    where d.kind = 'auction' and ${SOLD} and d.created_at > $1::timestamptz - interval '${DAYS} days' and ${where} order by d.amount`, [at, ...params])).rows.map(r => Number(r.a))
}
const at = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1))]
const roundUp = (fils: number) => Math.ceil(fils / 10_000) * 10_000 // to the next AED 100

/*
 * Where an auction usually ends: over the last year of auctions of this media type that ended in a booking, the final price as a
 * multiple of the starting price (the middle one), and, when the slot falls in a UAE season (Ramadan, National Day, DSF…), how much
 * higher auctions in that season ended than outside it. Also how much of the bidding comes in the last day before closing.
 */
async function forecastFor(db: pg.PoolClient, s: { channel: string; starting_price: string | number; top_amount: string | number | null; starts_at: Date; closes_at: Date }, now: Date) {
  const rows = (await db.query(`select d.amount::float / nullif(sl.starting_price, 0) ratio, sl.starts_at,
      (select count(*) filter (where b.created_at > sl.closes_at - interval '1 day')::float / nullif(count(*), 0) from bids b where b.slot_id = sl.id) late
    from deals d join slots sl on sl.id = d.slot_id join placements p on p.id = sl.placement_id join outlets o on o.id = p.outlet_id
    where d.kind = 'auction' and ${SOLD} and o.channel = $1 and d.created_at > $2::timestamptz - interval '365 days' and sl.starting_price > 0`, [s.channel, now])).rows
  if (rows.length < 5) return null
  const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : 0 }
  const day = dubaiDay(s.starts_at), season = seasonsOn(day)[0] ?? null
  let ratio = med(rows.map(r => Number(r.ratio))), uplift: number | null = null
  if (season) {
    const inS = rows.filter(r => seasonsOn(dubaiDay(r.starts_at)).some(x => x.key === season.key)).map(r => Number(r.ratio))
    const outS = rows.filter(r => !seasonsOn(dubaiDay(r.starts_at)).length).map(r => Number(r.ratio))
    if (inS.length >= 3 && outS.length >= 3) { uplift = med(inS) / med(outS); ratio = med(inS) }
  }
  const late = med(rows.map(r => Number(r.late ?? 0)))
  const expected = Math.max(Number(s.top_amount ?? 0), roundUp(Number(s.starting_price) * Math.max(1, ratio)))
  return { n: rows.length, ratio: Math.round(ratio * 100) / 100, expected, late: Math.round(late * 100) / 100,
    season: season ? { key: season.key, name: season.name, nameAr: season.nameAr } : null, uplift: uplift ? Math.round(uplift * 100) / 100 : null }
}

/*
 * Athena's guard for Nashr's team (rules only): things worth a second look, each with the page to check it on. It accuses no one:
 *  - linked bidding: two buyer companies signing in from the same address in the last 30 days, both bidding on one slot; or a
 *    buyer bidding on a slot of a publisher that signs in from the same address (pushing its own price up);
 *  - prices that look wrong: open slots asking over 5 times, or under a fifth of, the middle sale of their media type;
 *  - early proofs: proof sent before the ad was due to run;
 *  - new accounts moving fast: companies under 7 days old with over AED 50,000 in bids, or more than 15 bids in a day.
 */
async function guard(db: pg.PoolClient, now: Date) {
  const out: { key: string; kind: string; data: Record<string, unknown>; href: string; at: string | null }[] = []
  const ipOf = `select distinct u.company_id, l.ip from login_events l join users u on u.id = l.user_id where l.success and l.ip is not null and l.at > $1::timestamptz - interval '30 days'`
  for (const r of (await db.query(`with ips as (${ipOf})
      select distinct on (s.id) s.id slot, brand_name(o) outlet, ca.name a, cb.name b, ca.id a_id
      from bids x join bids y on y.slot_id = x.slot_id and y.buyer_id > x.buyer_id join slots s on s.id = x.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
        join companies ca on ca.id = x.buyer_id join companies cb on cb.id = y.buyer_id
      where x.created_at > $1::timestamptz - interval '30 days'
        and exists (select 1 from ips i1 join ips i2 on i2.ip = i1.ip where i1.company_id = x.buyer_id and i2.company_id = y.buyer_id) limit 5`, [now])).rows)
    out.push({ key: `guard:linked:${r.slot}`, kind: 'guard_linked', data: { outlet: r.outlet, a: r.a, b: r.b }, href: `/accounts/${r.a_id}`, at: null })
  for (const r of (await db.query(`with ips as (${ipOf})
      select distinct on (x.buyer_id, o.company_id) cb.name buyer, cs.name seller, cb.id buyer_id
      from bids x join slots s on s.id = x.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
        join companies cb on cb.id = x.buyer_id join companies cs on cs.id = o.company_id
      where x.created_at > $1::timestamptz - interval '30 days'
        and exists (select 1 from ips i1 join ips i2 on i2.ip = i1.ip where i1.company_id = x.buyer_id and i2.company_id = o.company_id) limit 5`, [now])).rows)
    out.push({ key: `guard:shill:${r.buyer_id}:${r.seller}`, kind: 'guard_shill', data: { buyer: r.buyer, seller: r.seller }, href: `/accounts/${r.buyer_id}`, at: null })
  for (const r of (await db.query(`with med as (select o.channel, percentile_cont(0.5) within group (order by d.amount) m, count(*) n
        from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
        where ${SOLD} and d.created_at > $1::timestamptz - interval '180 days' group by o.channel having count(*) >= 5)
      select distinct on (p.id) p.id, brand_name(o) outlet, p.name placement, s.starting_price::bigint price, med.m::bigint median, o.company_id
      from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id join med on med.channel = o.channel
      where s.status = 'open' and s.closes_at > $1 and (s.starting_price > med.m * 5 or s.starting_price * 5 < med.m) limit 5`, [now])).rows)
    out.push({ key: `guard:price:${r.id}:${r.price}`, kind: 'guard_price', data: { outlet: r.outlet, placement: r.placement, price: Number(r.price), median: Number(r.median) }, href: `/accounts/${r.company_id}`, at: null })
  for (const r of (await db.query(`select distinct on (d.id) d.id, d.ref, pf.submitted_at, s.starts_at from proofs pf join deals d on d.id = pf.deal_id join slots s on s.id = d.slot_id
      where pf.submitted_at < s.starts_at and pf.submitted_at > $1::timestamptz - interval '60 days' limit 5`, [now])).rows)
    out.push({ key: `guard:proof:${r.id}`, kind: 'guard_proof', data: { ref: r.ref, sent: r.submitted_at, due: r.starts_at }, href: `/deals/${r.id}`, at: null })
  for (const r of (await db.query(`select c.id, c.name, coalesce(sum(b.amount), 0)::bigint total, max(n.per_day)::int per_day from companies c join bids b on b.buyer_id = c.id
      left join lateral (select count(*) per_day from bids b2 where b2.buyer_id = c.id group by date_trunc('day', b2.created_at) order by 1 desc limit 1) n on true
      where c.created_at > $1::timestamptz - interval '7 days' group by c.id having sum(b.amount) > 5000000 or max(n.per_day) > 15 limit 5`, [now])).rows)
    out.push({ key: `guard:new:${r.id}`, kind: 'guard_new', data: { name: r.name, total: Number(r.total), perDay: r.per_day }, href: `/accounts/${r.id}`, at: null })
  return out
}

export function athenaRoutes(route: RouteFn) {
  // Bid advice for one auction slot: the closest group with enough sales (this product, then this outlet, then this media type).
  route('GET', '/api/slots/:id/advice', ['buyer', 'admin'], async ({ db, at: now }, req) => {
    const s = (await db.query(`select s.id, s.sale_type, s.starting_price, s.top_amount, s.placement_id, s.starts_at, s.closes_at, p.outlet_id, o.channel, brand_name(o) outlet, p.name placement
      from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where s.id = $1`, [req.params.id])).rows[0]
    if (!s) throw new NotFound()
    if (s.sale_type !== 'auction') return { advice: null }
    const forecast = await forecastFor(db, s, now)
    const levels: [string, string, unknown[]][] = [['product', 'p.id = $2', [s.placement_id]], ['outlet', 'o.id = $2', [s.outlet_id]], ['media', 'o.channel = $2', [s.channel]]]
    let level = '', xs: number[] = []
    for (const [name, where, params] of levels) { xs = await sales(db, where, params, now); if (xs.length >= ENOUGH) { level = name; break } }
    const next = s.top_amount ? minNextBid(Number(s.top_amount), await setting(db, 'min_step_bp', now)) : Number(s.starting_price)
    if (!level) return { advice: { enough: false, n: xs.length, nextBid: next, forecast } }
    const p70 = roundUp(at(xs, .7)), suggest = Math.max(p70, next)
    return { advice: { enough: true, level, outlet: s.outlet, channel: s.channel, n: xs.length, days: DAYS, low: at(xs, .1), high: at(xs, .9), median: at(xs, .5),
      suggest, wins: xs.filter(x => x <= suggest).length, nextBid: next, aboveMarket: next > p70, forecast } }
  })

  // Price check for a publisher setting a price: what similar products sold for on Nashr over 90 days (any sale type),
  // the same media type at the same time of day when there are enough sales, else the same media type; plus how this
  // product has been selling. Prices are excl. VAT, in fils.
  route('GET', '/api/seller/price-check', ['seller'], async ({ db, at: now, me }, req) => {
    const q = req.query as { channel?: string; price?: string; placement?: string; start?: string }
    const channel = String(q.channel ?? '').slice(0, 40), price = Math.max(0, Math.round(Number(q.price) || 0))
    if (!channel) return { check: null }
    const mine = q.placement && /^[0-9a-f-]{36}$/.test(q.placement) ? (await db.query(`select p.id, p.starts_at_local::text as start,
        (select count(*)::int from deals d join slots s on s.id = d.slot_id where s.placement_id = p.id and ${SOLD} and d.created_at > $3::timestamptz - interval '${DAYS} days') sales,
        (select count(*)::int from bids b join slots s on s.id = b.slot_id where s.placement_id = p.id and b.created_at > $3::timestamptz - interval '21 days') bids
        from placements p join outlets o on o.id = p.outlet_id where p.id = $1 and o.company_id = $2`, [q.placement, me.actAs.companyId, now])).rows[0] ?? null : null
    const start = (mine?.start ?? q.start ?? '').slice(0, 5), hour = /^\d\d:\d\d/.test(start) ? Number(start.slice(0, 2)) : null
    const part = hour == null ? null : hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening'
    const all = (where: string, params: unknown[]) => db.query(`select d.amount::bigint a from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      where ${SOLD} and d.created_at > $1::timestamptz - interval '${DAYS} days' and ${where} order by d.amount`, [now, ...params]).then(r => r.rows.map(x => Number(x.a)))
    let level = 'media', xs: number[] = []
    if (part) {
      const band = part === 'morning' ? [5, 12] : part === 'afternoon' ? [12, 17] : [17, 29]
      xs = await all(`o.channel = $2 and p.starts_at_local is not null and (extract(hour from p.starts_at_local) + case when extract(hour from p.starts_at_local) < 5 then 24 else 0 end) >= $3
        and (extract(hour from p.starts_at_local) + case when extract(hour from p.starts_at_local) < 5 then 24 else 0 end) < $4`, [channel, band[0], band[1]])
      if (xs.length >= 5) level = 'daypart'
    }
    if (level === 'media') xs = await all('o.channel = $2', [channel])
    const own = mine ? { sales: mine.sales, bids: mine.bids } : null
    if (xs.length < ENOUGH) return { check: { enough: false, n: xs.length, own } }
    return { check: { enough: true, level, daypart: level === 'daypart' ? part : null, n: xs.length, days: DAYS, low: at(xs, .25), high: at(xs, .75), median: at(xs, .5),
      min: xs[0], max: xs[xs.length - 1], below: price ? xs.filter(x => x < price).length : null, own } }
  })

  // "Did you mean…?" for a name typed with a slip ("skylin fm", "gulf nwes", "سكاي لاين"): the closest outlet or product name on Nashr.
  route('GET', '/api/athena/did-you-mean', ['buyer', 'seller', 'admin', 'guest'], async ({ db }, req) => {
    const raw = String((req.query as any).q ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80), q = arNorm(raw)
    if (q.length < 3) return { suggest: null }
    const names = (await db.query(`select distinct name from (select brand_name(o) as name from outlets o union select o.name_ar from outlets o where o.name_ar is not null
      union select pr.name from products pr) n where name is not null limit 3000`)).rows.map(r => String(r.name))
    const words = (s: string) => arNorm(s.toLowerCase()).split(/[^a-z0-9\u0600-\u06FF]+/).filter(Boolean)
    const asked = words(q)
    let best: { name: string; d: number } | null = null
    for (const name of names) {
      const ws = words(name)
      if (name.toLowerCase().includes(raw)) return { suggest: null } // it already matches as typed
      if (arNorm(name.toLowerCase()).includes(q)) { best = { name, d: 0 }; continue } // same name, other Arabic spelling ("سكاى" for "سكاي")
      // every word asked is close to a word of the name (or starts it); slips allowed grow with the word
      let d = 0, ok = true
      for (const a of asked) {
        const m = Math.min(...ws.map(w => w.startsWith(a) && a.length >= 3 ? 0 : slips(a, w, 2)))
        if (m > (a.length >= 7 ? 2 : a.length >= 4 || (a.length === 3 && /[\u0600-\u06FF]/.test(a)) ? 1 : 0)) { ok = false; break } d += m
      }
      if (ok && (!best || d < best.d)) best = { name, d }
    }
    return { suggest: best?.name ?? null }
  })

  // One-tap swap from what Athena noticed: the lost product out of the campaign's plan, Athena's replacement in, on that date.
  route('POST', '/api/athena/swap', ['buyer'], async ({ db, at: now, me }, req) => {
    const b = req.body as { campaignId: string; fromPlacement: string; fromSlot?: string | null; toPlacement: string; toSlot: string }
    const c = (await db.query(`select id from campaigns where id = $1 and buyer_id = $2`, [b.campaignId, me.actAs.companyId])).rows[0]
    if (!c) throw new NotFound()
    const ok = (await db.query(`select 1 from slots s join placements p on p.id = s.placement_id where s.id = $1 and p.id = $2 and s.status = 'open' and s.closes_at > $3 and not p.archived`,
      [b.toSlot, b.toPlacement, now])).rowCount
    if (!ok) throw new MarketError('This replacement is no longer on sale. Open Athena again for another.')
    await db.query(`delete from campaign_lines where campaign_id = $1 and placement_id = $2 and ($3::uuid is null or slot_id = $3 or slot_id is null)`, [c.id, b.fromPlacement, b.fromSlot ?? null])
    await db.query(`insert into campaign_lines (campaign_id, placement_id, added_at, slot_id) values ($1, $2, $3, $4)
      on conflict (campaign_id, placement_id, (coalesce(slot_id, '00000000-0000-0000-0000-000000000000'::uuid))) do nothing`, [c.id, b.toPlacement, now, b.toSlot])
    await audit(db, `user:${me.userId}`, 'athena.swap', 'campaign', c.id, { from: b.fromPlacement, to: b.toPlacement }, now)
    return { ok: true }
  }, { type: 'object', required: ['campaignId', 'fromPlacement', 'toPlacement', 'toSlot'], additionalProperties: false, properties: {
    campaignId: { type: 'string', format: 'uuid' }, fromPlacement: { type: 'string', format: 'uuid' }, fromSlot: { type: ['string', 'null'], format: 'uuid' },
    toPlacement: { type: 'string', format: 'uuid' }, toSlot: { type: 'string', format: 'uuid' } } })

  // Nashr's team: what a company's monthly report says this month (the same words the email uses, in English).
  route('GET', '/api/admin/athena-report/:companyId', ['admin'], async ({ db, at: now }, req) => {
    const c = (await db.query(`select id, type from companies where id = $1`, [req.params.companyId])).rows[0]
    if (!c) throw new NotFound()
    const r = await reportFor(db, c.id, c.type, now)
    if (!r) return { report: null }
    const { month } = lastMonth(now), { html, text } = reportEmail('en', r, month)
    return { report: { month, html, text } }
  })

  // The fact rows under a campaign Athena read: what is on sale in those dates, how auctions of those media types usually end,
  // and the UAE seasons in the dates.
  route('GET', '/api/athena/summary', ['buyer', 'admin'], async ({ db, at: now }, req) => {
    const q = req.query as Record<string, string | undefined>
    const channels = (q.channel ?? '').split(',').filter(Boolean).slice(0, 9), sectors = (q.sectors ?? '').split(',').filter(Boolean).slice(0, 9)
    const df = /^\d{4}-\d{2}-\d{2}$/.test(q.df ?? '') ? q.df! : null, dt = /^\d{4}-\d{2}-\d{2}$/.test(q.dt ?? '') ? q.dt! : null
    const max = Number(q.max) > 0 ? Math.round(Number(q.max) * 100) : null
    const onSale = (await db.query(`select count(distinct p.id)::int products, count(*)::int dates from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      where s.status = 'open' and s.closes_at > $1 and not p.archived and (cardinality($2::text[]) = 0 or o.channel = any($2))
        and (cardinality($3::text[]) = 0 or cardinality(o.sectors) = 0 or o.sectors && $3) and ($4::date is null or s.starts_at >= $4::date::timestamp at time zone 'Asia/Dubai')
        and ($5::date is null or s.starts_at < ($5::date + 1)::timestamp at time zone 'Asia/Dubai') and ($6::bigint is null or coalesce(s.top_amount, s.starting_price) <= $6)`,
      [now, channels, sectors, df, dt, max])).rows[0]
    const xs = channels.length ? await sales(db, 'o.channel = any($2)', [channels], now) : []
    const seasons = df && dt ? SEASONS.filter(x => x.from <= dt && x.to >= df).map(x => ({ key: x.key, name: x.name, nameAr: x.nameAr })) : []
    return { products: onSale.products, dates: onSale.dates, n: xs.length, low: xs.length >= ENOUGH ? at(xs, .25) : null, high: xs.length >= ENOUGH ? at(xs, .75) : null,
      seasons: seasons.filter((x, i, a) => a.findIndex(y => y.key === x.key) === i), days: DAYS }
  })

  // "Ask Athena about this" on a product: what it sold for, where its next auction usually ends, what is on sale, the season.
  route('GET', '/api/athena/product/:id', ['buyer', 'admin', 'seller'], async ({ db, at: now }, req) => {
    const p = (await db.query(`select p.id, p.name, p.kind, p.sale_type, brand_name(o) brand, o.channel, o.id outlet_id, o.name outlet_name from placements p join outlets o on o.id = p.outlet_id
      where p.id = $1 and not p.archived`, [req.params.id])).rows[0]
    if (!p) throw new NotFound()
    const next = (await db.query(`select s.id, s.starts_at, s.closes_at, s.sale_type, s.starting_price, s.top_amount, count(*) over ()::int n from slots s
      where s.placement_id = $1 and s.status = 'open' and s.closes_at > $2 order by s.starts_at limit 1`, [p.id, now])).rows[0]
    const xs = await sales(db, 'p.id = $2', [p.id], now), media = xs.length >= ENOUGH ? null : await sales(db, 'o.channel = $2', [p.channel], now)
    const forecast = next && next.sale_type === 'auction' ? await forecastFor(db, { ...next, channel: p.channel }, now) : null
    return { title: p.kind === 'main' ? p.brand : `${p.brand} · ${p.name}`, channel: p.channel, saleType: next?.sale_type ?? p.sale_type, slug: slugOf(p.outlet_name, p.outlet_id),
      onSale: next?.n ?? 0, next: next ? { at: next.starts_at, closes: next.closes_at, price: Number(next.top_amount ?? next.starting_price) } : null,
      sold: xs.length >= ENOUGH ? { n: xs.length, low: at(xs, .25), high: at(xs, .75), median: at(xs, .5) } : null,
      media: media && media.length >= ENOUGH ? { n: media.length, low: at(media, .25), high: at(media, .75) } : null,
      forecast, season: next ? seasonsOn(dubaiDay(next.starts_at))[0] ?? null : null, days: DAYS }
  })

  // ⌘K: find anything by name, forgiving slips: outlets and products for everyone; the person's own bookings and campaigns;
  // companies for Nashr's team.
  route('GET', '/api/athena/find', ['buyer', 'seller', 'admin'], async ({ db, me }, req) => {
    const raw = String((req.query as any).q ?? '').trim().slice(0, 80), q = arNorm(raw.toLowerCase())
    if (q.length < 2) return { outlets: [], products: [], bookings: [], campaigns: [], companies: [] }
    const words = q.split(/\s+/).filter(Boolean)
    const close = (name: string) => { const n = arNorm(name.toLowerCase()); if (n.includes(q)) return 0
      const ws = n.split(/[^a-z0-9\u0600-\u06FF]+/).filter(Boolean); let d = 0
      for (const a of words) { const m = Math.min(...ws.map(w => w.startsWith(a) ? 0 : slips(a, w, 2))); if (m > (a.length >= 7 ? 2 : a.length >= 4 ? 1 : 0)) return 9; d += m }
      return d + 1 }
    const pick = <T extends { name: string }>(rows: T[], n: number) => rows.map(r => ({ r, d: close(r.name) })).filter(x => x.d < 9).sort((a, b) => a.d - b.d).slice(0, n).map(x => x.r)
    const outlets = pick((await db.query(`select o.id, brand_name(o) as name, o.name outlet_name, o.name_ar, o.channel, (select count(*)::int from placements p where p.outlet_id = o.id and not p.archived) products
      from outlets o limit 3000`)).rows.flatMap((r: any) => [r, ...(r.name_ar ? [{ ...r, name: r.name_ar }] : [])]), 4)
      .map((r: any) => ({ name: r.name, slug: slugOf(r.outlet_name, r.id), channel: r.channel, products: r.products }))
    const products = pick((await db.query(`select p.id, case when p.kind = 'main' then brand_name(o) else brand_name(o) || ' · ' || p.name end as name, o.name outlet_name, o.id outlet_id,
        (select min(coalesce(s.top_amount, s.starting_price)) from slots s where s.placement_id = p.id and s.status = 'open') price
      from placements p join outlets o on o.id = p.outlet_id where not p.archived limit 5000`)).rows, 4)
      .map((r: any) => ({ id: r.id, name: r.name, slug: slugOf(r.outlet_name, r.outlet_id), price: r.price == null ? null : Number(r.price) }))
    const role = me.actAs.role, company = me.actAs.companyId
    const deals = role === 'buyer' || role === 'seller' ? (await db.query(`select d.id, d.ref, d.status, brand_name(o) || ' · ' || s.label as name from deals d join slots s on s.id = d.slot_id
        join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where ${role === 'buyer' ? 'd.buyer_id' : 'd.seller_id'} = $1 order by d.created_at desc limit 500`, [company])).rows
      .map((r: any) => ({ ...r, name: `${r.ref} ${r.name}` })) : []
    const bookings = pick(deals, 3).map((r: any) => ({ id: r.id, ref: r.ref, name: r.name.slice(r.ref.length + 1), status: r.status, href: role === 'buyer' ? `/bookings/${r.id}` : `/deals/${r.id}` }))
    const campaigns = role === 'buyer' ? pick((await db.query(`select id, name from campaigns where buyer_id = $1 limit 500`, [company])).rows, 3) : []
    const companies = role === 'admin' || role === 'founder' ? pick((await db.query(`select id, name, type from companies where type <> 'nashr' limit 3000`)).rows, 3) : []
    return { outlets, products, bookings, campaigns, companies }
  })

  // 👍 / 👎 on an answer, and the questions Athena could not answer (logged by the screen), for Nashr's team.
  route('POST', '/api/athena/feedback', ['buyer', 'seller', 'admin'], async ({ db, at: now, me }, req) => {
    const b = req.body as { question: string; answer?: string; helpful?: boolean; unknown?: boolean }
    await db.query(`insert into athena_feedback (company_id, user_id, question, answer, helpful, unknown, created_at) values ($1, $2, $3, $4, $5, $6, $7)`,
      [me.actAs.companyId, me.userId, b.question.slice(0, 400), b.answer?.slice(0, 1000) ?? null, b.helpful ?? null, !!b.unknown, now])
    return { ok: true }
  }, { type: 'object', required: ['question'], additionalProperties: false, properties: { question: { type: 'string', minLength: 1, maxLength: 400 },
    answer: { type: 'string', maxLength: 2000 }, helpful: { type: 'boolean' }, unknown: { type: 'boolean' } } })

  // What Athena noticed for this person, most pressing first. Each item is a kind with its details; the screen words it.
  route('GET', '/api/athena/noticed', ['buyer', 'seller', 'admin'], async ({ db, at: now, me }) => {
    const items: { key: string; kind: string; data: Record<string, unknown>; href: string; at: string | null }[] = []
    const company = me.actAs.companyId
    if (me.actAs.role === 'buyer') {
      // outbid on slots still open, with no live bid of theirs left on them
      for (const r of (await db.query(`select distinct on (s.id) s.id, s.closes_at, s.label, brand_name(o) outlet, p.name placement
          from bids b join slots s on s.id = b.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
          where b.buyer_id = $1 and b.status = 'outbid' and s.status = 'open' and s.closes_at > $2
            and not exists (select 1 from bids b2 where b2.slot_id = s.id and b2.buyer_id = $1 and b2.status = 'active')
          order by s.id, s.closes_at limit 20`, [company, now])).rows)
        items.push({ key: `outbid:${r.id}`, kind: 'outbid', data: { outlet: r.outlet, placement: r.placement, label: r.label, closes: r.closes_at }, href: `/calendar?slot=${r.id}`, at: r.closes_at })
      // Athena watches each running campaign: a planned product that can no longer be had in the campaign's dates (its date went
      // to someone else or closed, or nothing of it is left on sale) gets the closest replacement, ready to swap in one tap.
      const lost = (await db.query(`select c.id campaign_id, c.name campaign, c.start_date::text start_d, c.end_date::text end_d, c.brief->>'industry' industry,
          l.placement_id, l.slot_id, p.name placement, brand_name(o) outlet, o.channel, coalesce(p.default_price, o.default_price, p.starting_price)::bigint estimate
        from campaign_lines l join campaigns c on c.id = l.campaign_id join placements p on p.id = l.placement_id join outlets o on o.id = p.outlet_id
        where c.buyer_id = $1 and c.status = 'active' and c.end_date >= ($2::timestamptz at time zone 'Asia/Dubai')::date
          and not exists (select 1 from deals d join slots s on s.id = d.slot_id where d.buyer_id = $1 and s.placement_id = l.placement_id
                          and (l.slot_id is null or d.slot_id = l.slot_id) and d.status not in ('declined', 'lapsed', 'cancelled', 'refunded'))
          and (case when l.slot_id is not null then exists (select 1 from slots s where s.id = l.slot_id and (s.status <> 'open' or s.closes_at <= $2))
               else not exists (select 1 from slots s where s.placement_id = l.placement_id and s.status = 'open' and s.closes_at > $2
                                and s.starts_at >= c.start_date::timestamp at time zone 'Asia/Dubai' and s.starts_at < (c.end_date + 1)::timestamp at time zone 'Asia/Dubai') end)
        limit 8`, [company, now])).rows
      for (const r of lost) {
        const alt = (await db.query(`select p.id placement_id, s.id slot_id, p.name placement, brand_name(o) outlet, coalesce(s.top_amount, s.starting_price)::bigint price, s.starts_at
          from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
          where o.channel = $1 and s.status = 'open' and s.closes_at > $2 and not p.archived
            and s.starts_at >= $3::date::timestamp at time zone 'Asia/Dubai' and s.starts_at < ($4::date + 1)::timestamp at time zone 'Asia/Dubai'
            and not exists (select 1 from campaign_lines l2 where l2.campaign_id = $5 and l2.placement_id = p.id)
            and ($6::text is null or cardinality(o.sectors) = 0 or $6 = any(o.sectors)) and ($6::text is null or not ($6 = any(coalesce(o.blocked_industries, '{}'))))
            and coalesce(s.top_amount, s.starting_price) <= $7::bigint * 5 / 4
          order by (select count(*) from bids b where b.slot_id in (select id from slots where placement_id = p.id) and b.created_at > $2::timestamptz - interval '90 days') desc,
                   coalesce(s.top_amount, s.starting_price), s.starts_at limit 1`,
          [r.channel, now, r.start_d, r.end_d, r.campaign_id, r.industry || null, r.estimate])).rows[0]
        items.push({ key: `swap:${r.campaign_id}:${r.placement_id}:${r.slot_id ?? ''}:${alt?.slot_id ?? ''}`, kind: alt ? 'swap' : 'lost', at: null, href: `/campaigns/${r.campaign_id}`,
          data: { campaign: r.campaign, campaignId: r.campaign_id, outlet: r.outlet, placement: r.placement, from: { placementId: r.placement_id, slotId: r.slot_id },
            to: alt ? { placementId: alt.placement_id, slotId: alt.slot_id, outlet: alt.outlet, placement: alt.placement, price: Number(alt.price), at: alt.starts_at } : null } })
      }
    }
    if (me.actAs.role === 'seller') {
      // booking requests waiting for an answer
      const waiting = (await db.query(`select count(*)::int n, min(d.next_deadline_at) as by from deals d where d.seller_id = $1 and d.status = 'awaiting_seller'`, [company])).rows[0]
      if (waiting.n) items.push({ key: `requests:${waiting.n}`, kind: 'requests', data: { n: waiting.n }, href: '/inbox', at: waiting.by })
      // dates closing within two days with no bids yet
      for (const r of (await db.query(`select p.id, p.name placement, brand_name(o) outlet, count(*)::int n, min(s.closes_at) closes
          from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
          where o.company_id = $1 and s.status = 'open' and s.closes_at between $2 and $2::timestamptz + interval '2 days'
            and not exists (select 1 from bids b where b.slot_id = s.id) group by p.id, o.id order by min(s.closes_at) limit 10`, [company, now])).rows)
        items.push({ key: `unsold:${r.id}:${r.n}`, kind: 'unsold', data: { outlet: r.outlet, placement: r.placement, n: r.n, closes: r.closes }, href: '/schedule', at: r.closes })
      // a UAE season coming within 45 days, and this publisher has dates on sale in it: how such dates sold before, and a nudge to review prices
      for (const season of seasonsSoon(dubaiDay(now), 45).slice(0, 3)) {
        const mine = (await db.query(`select count(*)::int n, min(o.channel) channel from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
          where o.company_id = $1 and s.status = 'open' and s.closes_at > $2 and s.starts_at >= $3::date::timestamp at time zone 'Asia/Dubai'
            and s.starts_at < ($4::date + 1)::timestamp at time zone 'Asia/Dubai'`, [company, now, season.from, season.to])).rows[0]
        if (!mine.n) continue
        const r = (await db.query(`select percentile_cont(0.5) within group (order by d.amount::float / nullif(sl.starting_price, 0)) filter (where sl.starts_at >= $2::date::timestamp at time zone 'Asia/Dubai' and sl.starts_at < ($3::date + 1)::timestamp at time zone 'Asia/Dubai') inside,
            percentile_cont(0.5) within group (order by d.amount::float / nullif(sl.starting_price, 0)) outside_all, count(*) filter (where sl.starts_at >= $2::date::timestamp at time zone 'Asia/Dubai' and sl.starts_at < ($3::date + 1)::timestamp at time zone 'Asia/Dubai')::int n_in
          from deals d join slots sl on sl.id = d.slot_id join placements p on p.id = sl.placement_id join outlets o on o.id = p.outlet_id
          where d.kind = 'auction' and ${SOLD} and o.channel = $1 and sl.starting_price > 0 and d.created_at > $4::timestamptz - interval '400 days'`,
          [mine.channel, season.from, season.to, now])).rows[0]
        const uplift = r.n_in >= 3 && r.inside && r.outside_all ? Math.round((Number(r.inside) / Number(r.outside_all) - 1) * 100) : null
        items.push({ key: `season:${season.key}:${season.from}`, kind: 'season', data: { season: { name: season.name, nameAr: season.nameAr }, from: season.from, to: season.to, n: mine.n, uplift }, href: '/schedule', at: null })
      }
      // the best way to sell each product, from how it has sold: auctions with hardly any competition, or fixed prices that sell out
      for (const r of (await db.query(`select p.id, p.name placement, brand_name(o) outlet, p.sale_type,
          count(*) filter (where s.closes_at < $2)::int closed, count(*) filter (where s.closes_at < $2 and s.status = 'booked')::int sold,
          avg((select count(distinct b.buyer_id) from bids b where b.slot_id = s.id)) filter (where s.closes_at < $2 and s.sale_type = 'auction') bidders
        from placements p join outlets o on o.id = p.outlet_id join slots s on s.placement_id = p.id
        where o.company_id = $1 and not p.archived and s.closes_at > $2::timestamptz - interval '90 days' group by p.id, o.id`, [company, now])).rows) {
        if (r.closed < 5) continue
        const bidders = Number(r.bidders ?? 0), sellThrough = r.sold / r.closed
        if (r.sale_type === 'auction' && bidders < 1.3 && sellThrough < 0.6)
          items.push({ key: `saletype:${r.id}:fixed`, kind: 'sale_type', data: { outlet: r.outlet, placement: r.placement, to: 'fixed', bidders: Math.round(bidders * 10) / 10, sold: r.sold, closed: r.closed }, href: '/listings', at: null })
        else if (r.sale_type !== 'auction' && sellThrough >= 0.9)
          items.push({ key: `saletype:${r.id}:auction`, kind: 'sale_type', data: { outlet: r.outlet, placement: r.placement, to: 'auction', sold: r.sold, closed: r.closed }, href: '/listings', at: null })
      }
      // dates likely to go unsold: no bids yet, and fewer days left than similar dates that sold usually took to get their first bid
      const lead = (await db.query(`select percentile_cont(0.5) within group (order by extract(epoch from s.closes_at - fb.first) / 86400) days, min(o.channel) channel
        from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
          join lateral (select min(b.created_at) as first from bids b where b.slot_id = s.id) fb on fb.first is not null
        where s.status = 'booked' and s.sale_type = 'auction' and s.closes_at > $1::timestamptz - interval '180 days'
          and o.channel in (select o2.channel from outlets o2 where o2.company_id = $2)`, [now, company])).rows[0]
      if (lead?.days != null) {
        const days = Number(lead.days)
        for (const r of (await db.query(`select p.id, p.name placement, brand_name(o) outlet, count(*)::int n, min(s.closes_at) closes from slots s join placements p on p.id = s.placement_id
            join outlets o on o.id = p.outlet_id where o.company_id = $1 and s.status = 'open' and s.sale_type = 'auction'
              and s.closes_at between $2::timestamptz + interval '2 days' and $2::timestamptz + make_interval(secs => $3::float8 * 86400)
              and not exists (select 1 from bids b where b.slot_id = s.id) group by p.id, o.id order by min(s.closes_at) limit 5`, [company, now, Math.max(2.5, days)])).rows)
          items.push({ key: `atrisk:${r.id}:${r.n}`, kind: 'at_risk', data: { outlet: r.outlet, placement: r.placement, n: r.n, closes: r.closes, days: Math.round(days * 10) / 10 }, href: '/schedule', at: r.closes })
      }
      // products asking well above what similar products sold for, and not selling
      for (const r of (await db.query(`select p.id, p.name placement, brand_name(o) outlet, o.channel, min(s.starting_price)::bigint price
          from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
          where o.company_id = $1 and s.status = 'open' and s.sale_type = 'auction' and s.closes_at > $2 and not p.archived
            and not exists (select 1 from bids b join slots s2 on s2.id = b.slot_id where s2.placement_id = p.id and b.created_at > $2::timestamptz - interval '21 days')
          group by p.id, o.id limit 30`, [company, now])).rows) {
        const xs = await sales(db, 'o.channel = $2 and o.company_id <> $3', [r.channel, company], now)
        if (xs.length < ENOUGH || Number(r.price) <= at(xs, .75)) continue
        items.push({ key: `price:${r.id}:${r.price}`, kind: 'price_high', data: { outlet: r.outlet, placement: r.placement, channel: r.channel, price: Number(r.price), low: at(xs, .25), high: at(xs, .75), n: xs.length, above: xs.filter(x => x < Number(r.price)).length }, href: '/listings', at: null })
      }
    }
    if (me.actAs.role === 'admin' || me.actAs.role === 'founder') {
      const q = (sql: string) => db.query(sql, [now]).then(r => Number(r.rows[0]?.n ?? 0))
      const counts: [string, number, string][] = [
        ['access', await q(`select count(*) n from access_requests where status = 'pending' and $1::timestamptz is not null`), '/access'],
        ['registrations', await q(`select count(*) n from registrations where created_at > $1::timestamptz - interval '1 day'`), '/registrations'],
        ['disputes', await q(`select count(*) n from deals where status = 'disputed' and $1::timestamptz is not null`), '/disputes'],
        ['emails_failed', await q(`select count(*) n from outbox where status = 'failed' and created_at > $1::timestamptz - interval '7 days'`), '/emails'],
      ]
      for (const [kind, n, href] of counts) if (n) items.push({ key: `${kind}:${n}`, kind, data: { n }, href, at: null })
      for (const g of await guard(db, now)) items.push(g)
      const qs = (await db.query(`select question, unknown, helpful from athena_feedback where created_at > $1::timestamptz - interval '7 days' and (unknown or helpful = false)
        order by created_at desc limit 50`, [now])).rows
      if (qs.length) items.push({ key: `questions:${qs.length}`, kind: 'questions', data: { n: qs.length, samples: [...new Set(qs.map((q: any) => q.question))].slice(0, 3) }, href: '/admin', at: null })
    }
    return { items }
  })
}
