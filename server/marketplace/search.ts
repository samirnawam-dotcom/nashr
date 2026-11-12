import type { Db } from '../core/db.js'
import type { SlotFilter } from '../shared/slot-filter.js'
import { MarketError } from './market.js'

/*
 * Calendar search at scale (1000+ outlets): every filter, sort, page and summary runs in SQL, so the screen receives only
 * what it shows. The filters mean exactly what `matches` in shared/slot-filter.ts means (saved-search alerts use that one);
 * search.test.ts checks that the two agree.
 */

export type Query = SlotFilter & { from: string; to: string; me: string | null; open?: boolean; mine?: boolean; placement?: string; date?: string; outlet?: string
  tmin?: number; tmax?: number
  // who is looking: buyers see the open market; a publisher sees its own outlets in every status; Nashr sees everything
  scope?: 'buyer' | 'seller' | 'admin'; company?: string; statuses?: string[] } // a window of Dubai minutes in the day (a folded block in the grid)

const OPEN_MARKET = `(select value from settings where key = 'open_markets' order by valid_from desc limit 1) ? o.market`
const DUBAI = `(s.starts_at at time zone 'Asia/Dubai')`
const MINUTE = `(extract(hour from ${DUBAI}) * 60 + extract(minute from ${DUBAI}))`
const ALL_DAY = `(case when s.ends_at is null then ${MINUTE} = 0 else s.ends_at - s.starts_at >= interval '1 day' end)`
const PRICE = `coalesce(s.top_amount, s.starting_price)`
/** Who a slot reaches: its placement's audiences, else its outlet's. */
export const AUDIENCES_SQL = `(case when cardinality(p.audiences) > 0 then p.audiences else o.audiences end)`
const DAYPART: Record<string, string> = {
  allday: ALL_DAY,
  morning: `(not ${ALL_DAY} and ${MINUTE} >= 300 and ${MINUTE} < 720)`,
  afternoon: `(not ${ALL_DAY} and ${MINUTE} >= 720 and ${MINUTE} < 1020)`,
  evening: `(not ${ALL_DAY} and (${MINUTE} >= 1020 or ${MINUTE} < 300))`,
}

/** The FROM and WHERE every calendar query shares, with its parameters; `add` appends one more parameter. */
export function where(q: Query, now: Date) {
  const params: unknown[] = [q.from, q.to], add = (v: unknown) => { params.push(v); return `$${params.length}` }
  const scope = q.scope ?? 'buyer'
  const w = [`s.starts_at >= $1`, `s.starts_at < $2`]
  if (scope === 'buyer') w.push(`s.status <> 'blocked'`, OPEN_MARKET)
  if (scope === 'seller') w.push(`o.company_id = ${add(q.company)}`)
  if (q.statuses?.length) w.push(`s.status = any(${add(q.statuses)}::text[])`)
  if (q.open) w.push(`s.status = 'open'`, `s.closes_at > ${add(now)}`)
  if (q.channels?.length) w.push(`o.channel = any(${add(q.channels)}::text[])`)
  if (q.saleTypes?.length) w.push(`s.sale_type = any(${add(q.saleTypes)}::text[])`)
  if (q.sector) w.push(`exists (select 1 from unnest(o.sectors) x where lower(x) = lower(${add(q.sector)}))`)
  if (q.maxPrice != null && Number.isFinite(q.maxPrice)) w.push(`${PRICE} <= ${add(q.maxPrice)}`)
  if (q.dayparts?.length) w.push(`(${q.dayparts.map(d => Object.hasOwn(DAYPART, d) ? DAYPART[d] : 'false').join(' or ')})`)
  for (const word of (q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean))
    w.push(`strpos(lower(o.name || ' ' || p.name || ' ' || coalesce(o.audience, '') || ' ' || coalesce(c.name, '')), ${add(word)}) > 0`)
  if (q.closingWithinHours != null && Number.isFinite(q.closingWithinHours)) w.push(`s.closes_at <= ${add(new Date(now.getTime() + q.closingWithinHours * 3_600_000))}`)
  if (q.audiences?.length) w.push(`${AUDIENCES_SQL} && ${add(q.audiences)}::text[]`)
  if (q.mine && q.me) w.push(`exists (select 1 from bids b where b.slot_id = s.id and b.buyer_id = ${add(q.me)})`)
  if (q.placement) w.push(`p.id = ${add(q.placement)}`)
  if (q.outlet) w.push(`o.id = ${add(q.outlet)}`)
  if (q.date) w.push(`${DUBAI}::date = ${add(q.date)}::date`)
  if (q.tmin != null && Number.isFinite(q.tmin)) w.push(`${MINUTE} >= ${add(q.tmin)}`, `not ${ALL_DAY}`)
  if (q.tmax != null && Number.isFinite(q.tmax)) w.push(`${MINUTE} < ${add(q.tmax)}`)
  return { from: `from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id left join products pr on pr.id = o.product_id left join companies c on c.id = o.company_id`, where: `where ${w.join(' and ')}`, params, add }
}

/** A slot row with its bid count and whether this buyer has bid, in one pass rather than a query per row. */
const SLOT_COLUMNS = `s.*, p.name placement, o.id outlet_id, brand_name(o) outlet, o.channel, o.sectors, o.audience, ${AUDIENCES_SQL} audiences, o.logo_key, pr.id brand_id, pr.name brand, pr.logo_key brand_logo_key, c.name company, coalesce(bc.n, 0)::int bids, coalesce(bc.mine, false) mine,
  (select d.id from deals d where d.slot_id = s.id order by d.created_at desc limit 1) deal_id`
const BID_COUNTS = (me: string) => `left join lateral (select count(*) n, bool_or(b.buyer_id = ${me}) mine from bids b where b.slot_id = s.id and b.status <> 'withdrawn') bc on true`

/** Matching slots in air-time order (the panel of one programme, and the old range read). */
export async function slots(db: Db, q: Query, now: Date, limit = 5000) {
  const w = where(q, now), me = w.add(q.me)
  return (await db.query(`select ${SLOT_COLUMNS} ${w.from} ${BID_COUNTS(me)} ${w.where} order by s.starts_at, s.id limit ${limit}`, w.params)).rows
}

export type Sort = 'time' | 'price_asc' | 'price_desc' | 'closing' | 'bids'
const ORDER: Record<Sort, string> = { time: 's.starts_at, o.name, s.id', price_asc: `${PRICE}, s.starts_at, s.id`, price_desc: `${PRICE} desc, s.starts_at, s.id`,
  closing: 's.closes_at, s.starts_at, s.id', bids: 'bids desc, s.starts_at, s.id' }
const page = (offset: number, limit: number) => `offset ${Math.max(0, Math.floor(offset) || 0)} limit ${Math.min(100, Math.max(1, Math.floor(limit) || 50))}`

/** One page of matching slots, and how many match in all (the list view). */
export async function listSlots(db: Db, q: Query, sort: Sort, offset: number, limit: number, now: Date) {
  const c = where(q, now)
  const total = (await db.query(`select count(*)::int n ${c.from} ${c.where}`, c.params)).rows[0].n as number
  const w = where(q, now), me = w.add(q.me)
  const rows = (await db.query(`select ${SLOT_COLUMNS} ${w.from} ${BID_COUNTS(me)} ${w.where} order by ${Object.hasOwn(ORDER, sort) ? ORDER[sort] : ORDER.time} ${page(offset, limit)}`, w.params)).rows
  return { total, rows }
}

/** Each programme on each day as one block for the week and day grids: when it runs, how many slots, from what price. */
export async function programmes(db: Db, q: Query, now: Date) {
  const w = where(q, now), me = w.add(q.me), at = w.add(now)
  return (await db.query(`select o.id outlet_id, brand_name(o) outlet, o.channel, p.id placement_id, p.name placement, ${DUBAI}::date::text date,
      min(s.starts_at) starts_at, max(coalesce(s.ends_at, s.starts_at)) ends_at, bool_and(${ALL_DAY}) all_day, count(*)::int slots,
      count(*) filter (where s.status = 'open' and s.closes_at > ${at})::int open, min(${PRICE}) from_price, sum(coalesce(bc.n, 0))::int bids,
      coalesce(bool_or(s.top_buyer_id = ${me}), false) leads, coalesce(bool_or(bc.mine), false) mine,
      min(s.closes_at) filter (where s.status = 'open' and s.closes_at > ${at}) closes_at, array_agg(distinct s.sale_type) sale_types
    ${w.from} ${BID_COUNTS(me)} ${w.where}
    group by o.id, o.name, o.channel, p.id, p.name, ${DUBAI}::date order by min(s.starts_at), o.name`, w.params)).rows
    .map(r => ({ outletId: r.outlet_id, outlet: r.outlet, channel: r.channel, placementId: r.placement_id, placement: r.placement, date: r.date,
      startsAt: r.starts_at, endsAt: r.ends_at, allDay: r.all_day, slots: r.slots, open: r.open, fromPrice: Number(r.from_price), bids: r.bids,
      youLead: r.leads, youBid: r.mine, closesAt: r.closes_at, saleTypes: r.sale_types as string[] }))
}

export type Programme = Awaited<ReturnType<typeof programmes>>[number]
export type Fold = { date: string; channel: string | null; allDay: boolean; startsAt: string; endsAt: string; startMin: number; endMin: number
  programmes: number; slots: number; fromPrice: number; channels: string[] }

/**
 * What the week and day grids draw, folded on the server so the answer stays small with any number of outlets: per column
 * (a day, or a day and a channel), programmes that overlap at most one other are sent as they are; a busier run of overlapping
 * programmes is sent as one summary (how many, when, from what price, which channels), and the screen lists it on request.
 * All-day items: the two cheapest per column, then a summary of the rest.
 */
export async function grid(db: Db, q: Query, by: 'day' | 'channel', now: Date, maxSide = 2) {
  const rows = await programmes(db, q, now)
  const minuteOf = (iso: Date | string) => { const d = new Date(new Date(iso).getTime() + 4 * 3_600_000); return d.getUTCHours() * 60 + d.getUTCMinutes() }
  const endOf = (g: Programme) => minuteOf(g.startsAt) + Math.max(30, (new Date(g.endsAt).getTime() - new Date(g.startsAt).getTime()) / 60_000)
  const columns = new Map<string, Programme[]>()
  for (const g of rows) { const k = by === 'day' ? g.date : `${g.date}|${g.channel}`; columns.set(k, [...(columns.get(k) ?? []), g]) }
  const blocks: Programme[] = [], folds: Fold[] = []
  const fold = (list: Programme[], allDay: boolean): Fold => ({ date: list[0].date, channel: by === 'channel' ? list[0].channel : null, allDay,
    startsAt: list.reduce((a, g) => g.startsAt < a ? g.startsAt : a, list[0].startsAt), endsAt: list.reduce((a, g) => g.endsAt > a ? g.endsAt : a, list[0].endsAt),
    startMin: allDay ? 0 : Math.min(...list.map(g => minuteOf(g.startsAt))), endMin: allDay ? 1440 : Math.max(...list.map(endOf)),
    programmes: list.length, slots: list.reduce((n, g) => n + g.slots, 0), fromPrice: Math.min(...list.map(g => g.fromPrice)), channels: [...new Set(list.map(g => g.channel))] })
  for (const list of columns.values()) {
    const allDay = list.filter(g => g.allDay).sort((a, b) => a.fromPrice - b.fromPrice), timed = list.filter(g => !g.allDay).sort((a, b) => minuteOf(a.startsAt) - minuteOf(b.startsAt))
    if (allDay.length <= maxSide) blocks.push(...allDay); else { blocks.push(...allDay.slice(0, maxSide)); folds.push(fold(allDay.slice(maxSide), true)) }
    // Runs of overlapping programmes; a run wider than `maxSide` becomes one summary.
    let run: Programme[] = [], runEnd = -1
    const flush = () => { if (!run.length) return
      // the widest point of the run: how many programmes air at the same moment
      const edges = run.flatMap(g => [[minuteOf(g.startsAt), 1], [endOf(g), -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
      let cur = 0, wide = 0; for (const [, d] of edges) { cur += d; wide = Math.max(wide, cur) }
      if (wide <= maxSide) blocks.push(...run); else folds.push(fold(run, false))
      run = [] }
    for (const g of timed) { const st = minuteOf(g.startsAt); if (st >= runEnd) { flush(); runEnd = -1 } run.push(g); runEnd = Math.max(runEnd, endOf(g)) }
    flush()
  }
  return { blocks, folds }
}

/** Per day: how many slots and outlets, the lowest price and which channels (the month view). */
export async function byDay(db: Db, q: Query, now: Date) {
  const w = where(q, now)
  return (await db.query(`select ${DUBAI}::date::text date, count(*)::int slots, count(distinct o.id)::int outlets, min(${PRICE}) from_price,
      array_agg(distinct o.channel) channels, count(*) filter (where s.status = 'open')::int on_sale,
      count(*) filter (where s.status in ('awaiting_seller', 'awaiting_choice'))::int waiting, count(*) filter (where s.status = 'booked')::int booked
    ${w.from} ${w.where} group by ${DUBAI}::date order by 1`, w.params)).rows
    .map(r => ({ date: r.date, slots: r.slots, outlets: r.outlets, fromPrice: Number(r.from_price), channels: r.channels as string[],
      onSale: r.on_sale, waiting: r.waiting, booked: r.booked, off: r.slots - r.on_sale - r.waiting - r.booked }))
}

export type OutletSort = 'name' | 'price' | 'slots'
/** Outlets across a range of days (the "By outlet" view): a page of outlets, each with its count and lowest price per day. */
export async function byOutlet(db: Db, q: Query, sort: OutletSort, offset: number, limit: number, now: Date) {
  const w = where(q, now)
  const daily = `select o.id outlet_id, brand_name(o) outlet, o.channel, o.logo_key, pr.id brand_id, pr.logo_key brand_logo_key, ${DUBAI}::date::text date, count(*)::int slots, min(${PRICE}) from_price
    ${w.from} ${w.where} group by o.id, o.name, o.channel, o.logo_key, pr.id, pr.logo_key, ${DUBAI}::date`
  const order = sort === 'price' ? 'from_price, outlet' : sort === 'slots' ? 'slots desc, outlet' : 'outlet'
  const rows = (await db.query(`with d as (${daily}),
      o as (select outlet_id, outlet, channel, logo_key, brand_id, brand_logo_key, sum(slots)::int slots, min(from_price) from_price,
        json_agg(json_build_object('date', date, 'slots', slots, 'fromPrice', from_price) order by date) days, count(*) over ()::int total
        from d group by outlet_id, outlet, channel, logo_key, brand_id, brand_logo_key)
    select * from o order by ${order} ${page(offset, limit)}`, w.params)).rows
  return { total: (rows[0]?.total as number) ?? 0, rows }
}

/** Per audience: open slots, outlets, the lowest current price and the channels that reach it (the public Audiences pages). */
export async function byAudience(db: Db, q: Query, now: Date) {
  const w = where({ ...q, audiences: undefined }, now)
  return (await db.query(`select a audience, count(*)::int slots, count(distinct o.id)::int outlets, min(${PRICE}) from_price,
      array_agg(distinct o.channel order by o.channel) channels
    ${w.from} cross join lateral unnest(${AUDIENCES_SQL}) a ${w.where} group by a`, w.params)).rows
}

/** Calendar filters from a query string: ?ch=radio,tv&sale=auction&sector=…&max=500000&dp=morning&q=…&soon=24&mine=1&open=1 */
/** The longest period one calendar request may cover (a month view with its edge weeks is 42 days); public routes must stay cheap. */
const MAX_RANGE_DAYS = 62
function clampRange(from: string, to: string) {
  const a = Date.parse(from), b = Date.parse(to)
  if (Number.isNaN(a) || Number.isNaN(b)) throw new MarketError('Choose a valid date range.')
  return b - a > MAX_RANGE_DAYS * 86_400_000 ? new Date(a + MAX_RANGE_DAYS * 86_400_000).toISOString() : to
}

export function parseQuery(r: Record<string, string | undefined>, me: string | null, from: string, rawTo: string): Query {
  const to = clampRange(from, rawTo)
  const list = (v?: string) => v ? v.split(',').map(x => x.trim()).filter(Boolean) : undefined
  const num = (v?: string) => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined
  return { from, to, me, channels: list(r.ch), saleTypes: list(r.sale), sector: r.sector || undefined, maxPrice: num(r.max),
    dayparts: list(r.dp) as SlotFilter['dayparts'], q: r.q || undefined, closingWithinHours: num(r.soon), audiences: list(r.aud),
    mine: r.mine === '1', open: r.open === '1', placement: r.placement || undefined, date: r.date || undefined, outlet: r.outlet || undefined,
    tmin: num(r.tmin), tmax: num(r.tmax), statuses: list(r.st) }
}

/** The calendar query from a request, for one scope. The scope and company come from the session, never from the address. */
export function scopedQuery(r: Record<string, string | undefined>, scope: 'seller' | 'admin', company: string | null): Query {
  const from = r.from ?? new Date().toISOString(), to = r.to ?? new Date(Date.now() + 35 * 86_400_000).toISOString()
  return { ...parseQuery(r, null, from, to), open: false, scope, company: company ?? undefined }
}
