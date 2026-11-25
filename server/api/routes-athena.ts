import type pg from 'pg'
import { NotFound, type RouteFn } from './app.js'
import { minNextBid } from '../core/money.js'
import { setting } from '../core/settings.js'

/*
 * Athena's own reads (rules and Nashr's records only, no outside AI):
 *  - bid advice: what slots like this one actually sold for lately, and a bid that would have won most of those sales;
 *  - what Athena noticed for this person: bids to answer, products priced above the market, dates about to close unsold,
 *    and for Nashr's team the queues that wait on them.
 * Athena only ever reports what happened on Nashr; it never invents a price, and says so when it has too few sales to go on.
 */
const SOLD = `d.status not in ('declined', 'lapsed', 'cancelled', 'refunded')`
const DAYS = 90, ENOUGH = 3

/** Sorted prices (fils) of auction sales over the last 90 days that match `where`. */
async function sales(db: pg.PoolClient, where: string, params: unknown[], at: Date) {
  return (await db.query(`select d.amount::bigint a from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
    where d.kind = 'auction' and ${SOLD} and d.created_at > $1::timestamptz - interval '${DAYS} days' and ${where} order by d.amount`, [at, ...params])).rows.map(r => Number(r.a))
}
const at = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(q * xs.length) - 1))]
const roundUp = (fils: number) => Math.ceil(fils / 10_000) * 10_000 // to the next AED 100

export function athenaRoutes(route: RouteFn) {
  // Bid advice for one auction slot: the closest group with enough sales (this product, then this outlet, then this media type).
  route('GET', '/api/slots/:id/advice', ['buyer', 'admin'], async ({ db, at: now }, req) => {
    const s = (await db.query(`select s.id, s.sale_type, s.starting_price, s.top_amount, s.placement_id, p.outlet_id, o.channel, brand_name(o) outlet, p.name placement
      from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where s.id = $1`, [req.params.id])).rows[0]
    if (!s) throw new NotFound()
    if (s.sale_type !== 'auction') return { advice: null }
    const levels: [string, string, unknown[]][] = [['product', 'p.id = $2', [s.placement_id]], ['outlet', 'o.id = $2', [s.outlet_id]], ['media', 'o.channel = $2', [s.channel]]]
    let level = '', xs: number[] = []
    for (const [name, where, params] of levels) { xs = await sales(db, where, params, now); if (xs.length >= ENOUGH) { level = name; break } }
    const next = s.top_amount ? minNextBid(Number(s.top_amount), await setting(db, 'min_step_bp', now)) : Number(s.starting_price)
    if (!level) return { advice: { enough: false, n: xs.length, nextBid: next } }
    const p70 = roundUp(at(xs, .7)), suggest = Math.max(p70, next)
    return { advice: { enough: true, level, outlet: s.outlet, channel: s.channel, n: xs.length, days: DAYS, low: at(xs, .1), high: at(xs, .9), median: at(xs, .5),
      suggest, wins: xs.filter(x => x <= suggest).length, nextBid: next, aboveMarket: next > p70 } }
  })

  // Price check for a publisher setting a price: what similar products sold for on Nashr over 90 days (any sale type),
  // the same media type at the same time of day when there are enough sales, else the same media type; plus how this
  // product has been selling. Prices are excl. VAT, in fils.
  route('GET', '/api/seller/price-check', ['seller'], async ({ db, at: now, me }, req) => {
    const q = req.query as { channel?: string; price?: string; placement?: string; start?: string }
    const channel = String(q.channel ?? '').slice(0, 40), price = Math.max(0, Math.round(Number(q.price) || 0))
    if (!channel) return { check: null }
    const mine = q.placement && /^[0-9a-f-]{36}$/.test(q.placement) ? (await db.query(`select p.id, p.starts_at_local::text start,
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
    }
    if (me.actAs.role === 'seller') {
      // booking requests waiting for an answer
      const waiting = (await db.query(`select count(*)::int n, min(d.next_deadline_at) by from deals d where d.seller_id = $1 and d.status = 'awaiting_seller'`, [company])).rows[0]
      if (waiting.n) items.push({ key: `requests:${waiting.n}`, kind: 'requests', data: { n: waiting.n }, href: '/inbox', at: waiting.by })
      // dates closing within two days with no bids yet
      for (const r of (await db.query(`select p.id, p.name placement, brand_name(o) outlet, count(*)::int n, min(s.closes_at) closes
          from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
          where o.company_id = $1 and s.status = 'open' and s.closes_at between $2 and $2::timestamptz + interval '2 days'
            and not exists (select 1 from bids b where b.slot_id = s.id) group by p.id, o.id order by min(s.closes_at) limit 10`, [company, now])).rows)
        items.push({ key: `unsold:${r.id}:${r.n}`, kind: 'unsold', data: { outlet: r.outlet, placement: r.placement, n: r.n, closes: r.closes }, href: '/schedule', at: r.closes })
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
    }
    return { items }
  })
}
