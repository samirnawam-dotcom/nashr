import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { setting } from '../core/settings.js'
import { atLocal, type Market } from '../core/market.js'

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
    throw new Error(`Bidding must close at least ${need / 24} days before air so there is time to accept, pay and deliver the creative.`)
}

export async function createPlacement(db: Db, p: PlacementInput, actor: string, at: Date): Promise<string> {
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
  const p = await one(db, `select p.*, o.market from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [placementId])
  const m = p.market as Market
  const breaks: Break[] = p.breaks
  let made = 0
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i)
    if (!p.days.includes(isoWeekday(date))) continue
    const start = atLocal(date, p.starts_at_local?.slice(0, 5) ?? '00:00', m)
    const end = p.ends_at_local ? atLocal(date, p.ends_at_local.slice(0, 5), m) : null
    const slots: { kind: string; label: string; startsAt: Date; endsAt: Date | null; price: number }[] =
      breaks.length === 0
        ? [{ kind: 'single', label: p.name, startsAt: start, endsAt: end, price: p.starting_price }]
        : breaks.map(b => {
            const s = b.at ? atLocal(date, b.at, m) : start
            return { kind: 'single', label: b.label, startsAt: s, endsAt: b.seconds ? new Date(s.getTime() + b.seconds * 1000) : null, price: p.starting_price }
          })
    if (breaks.length && p.any_break_price) slots.push({ kind: 'any', label: 'Any break', startsAt: start, endsAt: end, price: p.any_break_price })
    if (breaks.length && p.package_price) slots.push({ kind: 'package', label: `All ${breaks.length} breaks`, startsAt: start, endsAt: end, price: p.package_price })
    for (const s of slots) {
      const closes = hours(s.startsAt, p.close_lead_hours)
      if (closes <= at) continue
      const r = await db.query(
        `insert into slots (placement_id, air_date, kind, label, starts_at, ends_at, sale_type, starting_price, buy_now_price, reserve_price,
           auto_accept, currency, closes_at, creative_due_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) on conflict do nothing`,
        [p.id, date, s.kind, s.label, s.startsAt, s.endsAt, p.sale_type, s.price, s.kind === 'single' ? p.buy_now_price : null,
         s.kind === 'single' ? p.reserve_price : null, p.auto_accept, p.currency, closes, hours(s.startsAt, p.creative_lead_hours)])
      made += r.rowCount ?? 0
    }
  }
  return made
}
