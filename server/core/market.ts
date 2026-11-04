import type { Db } from './db.js'
import { setting } from './settings.js'

// ponytail: fixed UTC offsets (UAE +4, KSA +3, neither has DST). Swap for a tz library if a DST market is added.
export const MARKETS = {
  AE: { offset: '+04:00', currency: 'AED', weekend: [6, 7] }, // Saturday, Sunday
  SA: { offset: '+03:00', currency: 'SAR', weekend: [5, 6] }, // Friday, Saturday
} as const
export type Market = keyof typeof MARKETS

const offsetMs = (m: Market) => { const [h, min] = MARKETS[m].offset.slice(1).split(':').map(Number); return (h * 60 + min) * 60_000 }

/** Local calendar date (YYYY-MM-DD) and ISO weekday of an instant in a market. */
export function localDay(at: Date, m: Market) {
  const local = new Date(at.getTime() + offsetMs(m))
  return { date: local.toISOString().slice(0, 10), weekday: local.getUTCDay() || 7 }
}

/** Instant for a local date + time (HH:MM) in a market. */
export const atLocal = (date: string, time: string, m: Market) => new Date(`${date}T${time}:00${MARKETS[m].offset}`)

/** Add working days (skipping the market's weekend and holidays), keeping the time of day. */
export async function addWorkingDays(db: Db, from: Date, days: number, m: Market): Promise<Date> {
  const holidays = new Set<string>(await setting(db, `holidays_${m}`, from).catch(() => []))
  let t = from
  for (let left = days; left > 0;) {
    t = new Date(t.getTime() + 86_400_000)
    const d = localDay(t, m)
    if (!(MARKETS[m].weekend as readonly number[]).includes(d.weekday) && !holidays.has(d.date)) left--
  }
  return t
}
