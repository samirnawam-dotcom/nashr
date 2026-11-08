import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { setting } from '../core/settings.js'
import { atLocal, type Market } from '../core/market.js'
import { MarketError } from '../marketplace/market.js'

export type Break = { label: string; at?: string; seconds?: number }
export type PlacementInput = {
  outletId: string; name: string; saleType: 'auction' | 'quick_sale'; days: number[]
  startsAt?: string; endsAt?: string; breaks?: Break[]
  startingPrice: number; anyBreakPrice?: number; packagePrice?: number; buyNowPrice?: number; reservePrice?: number; autoAccept?: boolean
  creativeLeadHours: number; closeLeadHours: number
}

/**
 * Deadlines must fit (owner feedback, SPEC 12.1): after bidding closes there must be time for the
 * seller's decision and the buyer's payment before the creative is due.
 */
export async function checkDeadlines(db: Db, p: Pick<PlacementInput, 'creativeLeadHours' | 'closeLeadHours'>, at: Date) {
  const need = p.creativeLeadHours + await setting<number>(db, 'seller_window_hours', at) + await setting<number>(db, 'payment_window_hours', at)
  if (p.closeLeadHours < need)
    throw new MarketError(`Bidding must close at least ${need / 24} days before air so there is time to accept, pay and deliver the creative.`)
}

const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
/** An end time before the start is overnight only when it plainly is: starts in the evening, ends by the morning (brief section 7). */
export function checkTimes(p: Pick<PlacementInput, 'startsAt' | 'endsAt'>) {
  if (!p.startsAt || !p.endsAt) return
  const s = mins(p.startsAt), e = mins(p.endsAt)
  if (e === s || (e < s && !(s >= 18 * 60 && e <= 6 * 60))) throw new MarketError('The end time must be after the start time.')
}

/** The [start, end) minutes of a programme on its own day; overnight ones run past 24:00. */
const span = (startsAt?: string | null, endsAt?: string | null) => {
  const s = startsAt ? mins(startsAt.slice(0, 5)) : 0, e = endsAt ? mins(endsAt.slice(0, 5)) : startsAt ? s + 1 : 24 * 60
  return [s, e <= s ? e + 24 * 60 : e]
}

/** Warn (never block) when a new programme overlaps another placement of the same outlet on a shared day (brief section 7). */
export async function overlapWarnings(db: Db, p: PlacementInput) {
  const others = (await db.query(`select name, days, starts_at_local::text s, ends_at_local::text e from placements where outlet_id = $1 and not archived`, [p.outletId])).rows
  const [a0, a1] = span(p.startsAt, p.endsAt)
  return others.filter(o => o.days.some((d: number) => p.days.includes(d)) && (() => { const [b0, b1] = span(o.s, o.e); return a0 < b1 && b0 < a1 })())
    .map(o => `This overlaps ${o.name} on ${o.days.filter((d: number) => p.days.includes(d)).length} of the same days.`)
}

export async function createPlacement(db: Db, p: PlacementInput, actor: string, at: Date): Promise<string> {
  checkTimes(p)
  await checkDeadlines(db, p, at)
  const row = await one(db,
    `insert into placements (outlet_id, name, sale_type, days, starts_at_local, ends_at_local, breaks, starting_price, any_break_price,
       package_price, buy_now_price, reserve_price, auto_accept, creative_lead_hours, close_lead_hours, currency)
     select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, case o.market when 'SA' then 'SAR' else 'AED' end
     from outlets o where o.id = $1 returning id`,
    [p.outletId, p.name, p.saleType, p.days, p.startsAt ?? null, p.endsAt ?? null, JSON.stringify(p.breaks ?? []), p.startingPrice,
     p.anyBreakPrice ?? null, p.packagePrice ?? null, p.buyNowPrice ?? null, p.reservePrice ?? null, p.autoAccept ?? false,
     p.creativeLeadHours, p.closeLeadHours])
  await audit(db, actor, 'placement.created', 'placement', row.id, { name: p.name }, at)
  return row.id
}

const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
const isoWeekday = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay() || 7
const hours = (t: Date, h: number) => new Date(t.getTime() - h * 3_600_000)

/** Create the bookable slots for `days` days from `fromDate` (local). Idempotent; skips airings already too late to sell. */
export async function generateSlots(db: Db, placementId: string, fromDate: string, days: number, at: Date): Promise<number> {
  const p = await one(db, `select p.*, o.market, c.payouts_enabled from placements p join outlets o on o.id = p.outlet_id
                           join companies c on c.id = o.company_id where p.id = $1`, [placementId])
  if (!p.payouts_enabled) throw new MarketError('Slots can go live once your payout account is verified.') // brief section 11
  const m = p.market as Market
  const breaks: Break[] = p.breaks
  let made = 0
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i)
    if (!p.days.includes(isoWeekday(date))) continue
    const start = atLocal(date, p.starts_at_local?.slice(0, 5) ?? '00:00', m)
    // overnight: an end (or a break) earlier in the clock than the start belongs to the next day
    const later = (t: string) => t < (p.starts_at_local?.slice(0, 5) ?? '00:00') ? atLocal(addDays(date, 1), t, m) : atLocal(date, t, m)
    const end = p.ends_at_local ? later(p.ends_at_local.slice(0, 5)) : null
    const slots: { kind: string; label: string; startsAt: Date; endsAt: Date | null; price: number }[] =
      breaks.length === 0
        ? [{ kind: 'single', label: p.name, startsAt: start, endsAt: end, price: p.starting_price }]
        : breaks.map(b => {
            const s = b.at ? later(b.at) : start
            return { kind: 'single', label: b.label, startsAt: s, endsAt: b.seconds ? new Date(s.getTime() + b.seconds * 1000) : null, price: p.starting_price }
          })
    if (breaks.length && p.any_break_price) slots.push({ kind: 'any', label: 'Any break', startsAt: start, endsAt: end, price: p.any_break_price })
    if (breaks.length && p.package_price) slots.push({ kind: 'package', label: `All ${breaks.length} breaks`, startsAt: start, endsAt: end, price: p.package_price })
    for (const s of slots) {
      const closes = hours(s.startsAt, p.close_lead_hours)
      if (closes <= at) continue
      const r = await db.query(
        `insert into slots (placement_id, air_date, kind, label, starts_at, ends_at, sale_type, starting_price, buy_now_price, reserve_price,
           auto_accept, currency, closes_at, creative_due_at, listed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) on conflict do nothing`,
        [p.id, date, s.kind, s.label, s.startsAt, s.endsAt, p.sale_type, s.price, s.kind === 'single' ? p.buy_now_price : null,
         s.kind === 'single' ? p.reserve_price : null, p.auto_accept, p.currency, closes, hours(s.startsAt, p.creative_lead_hours), at])
      made += r.rowCount ?? 0
    }
  }
  return made
}

export type PlacementEdit = Pick<PlacementInput, 'name' | 'startingPrice' | 'anyBreakPrice' | 'packagePrice' | 'buyNowPrice' | 'reservePrice' | 'autoAccept'
  | 'creativeLeadHours' | 'closeLeadHours'>

/**
 * Change a placement's name, prices, auto-accept and deadlines. Future slots nobody has bid on take the new terms at once;
 * a slot with a bid keeps the terms the buyer bid on (brief section 15). Days, times and breaks stay as they are: those make new slots.
 */
export async function updatePlacement(db: Db, placementId: string, sellerId: string, e: PlacementEdit, actor: string, at: Date) {
  const p = (await db.query(`select p.* from placements p join outlets o on o.id = p.outlet_id where p.id = $1 and o.company_id = $2 for update`, [placementId, sellerId])).rows[0]
  if (!p) throw new MarketError('This placement is not yours.')
  await checkDeadlines(db, e, at)
  if (e.reservePrice && e.buyNowPrice && e.reservePrice > e.buyNowPrice) throw new MarketError('The reserve cannot be above the buy-now price.')
  if (e.autoAccept && !e.reservePrice) throw new MarketError('Set a reserve price to accept bids automatically.')
  await db.query(`update placements set name = $2, starting_price = $3, any_break_price = $4, package_price = $5, buy_now_price = $6, reserve_price = $7,
      auto_accept = $8, creative_lead_hours = $9, close_lead_hours = $10 where id = $1`,
    [p.id, e.name, e.startingPrice, e.anyBreakPrice ?? null, e.packagePrice ?? null, e.buyNowPrice ?? null, e.reservePrice ?? null, e.autoAccept ?? false,
     e.creativeLeadHours, e.closeLeadHours])
  // Only open, unbid, future slots change; their closing time must still be ahead of now.
  const r = await db.query(`update slots s set
      starting_price = case s.kind when 'any' then coalesce($2::bigint, s.starting_price) when 'package' then coalesce($3::bigint, s.starting_price) else $4::bigint end,
      buy_now_price = case when s.kind = 'single' then $5::bigint end, reserve_price = case when s.kind = 'single' then $6::bigint end,
      auto_accept = $7::boolean, closes_at = s.starts_at - make_interval(hours => $8::int), creative_due_at = s.starts_at - make_interval(hours => $9::int),
      label = case when s.kind = 'single' and jsonb_array_length($11::jsonb) = 0 then $12::text else s.label end
    where s.placement_id = $1 and s.status = 'open' and s.starts_at - make_interval(hours => $8::int) > $10::timestamptz
      and not exists (select 1 from bids b where b.slot_id = s.id)`,
    [p.id, e.anyBreakPrice ?? null, e.packagePrice ?? null, e.startingPrice, e.buyNowPrice ?? null, e.reservePrice ?? null, e.autoAccept ?? false,
     e.closeLeadHours, e.creativeLeadHours, at, JSON.stringify(p.breaks ?? []), e.name])
  await audit(db, actor, 'placement.updated', 'placement', p.id, { ...e, slotsUpdated: r.rowCount }, at)
  return { slotsUpdated: r.rowCount ?? 0 }
}
