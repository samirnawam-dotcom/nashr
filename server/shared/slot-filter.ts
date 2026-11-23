/**
 * What a buyer can search the calendar by. One definition for the calendar screen and for saved-search alerts on the
 * server, so an alert fires for exactly the slots the buyer would have seen. Pure: no Node or browser APIs.
 */
import { audienceLabel } from './audiences.js'
export type Daypart = 'morning' | 'afternoon' | 'evening' | 'allday'
export type SlotFilter = {
  channels?: string[]        // empty or missing: every channel
  saleTypes?: string[]       // 'auction' | 'quick_sale' | 'fixed'
  sector?: string            // the product accepts this advertiser sector: listed under Sectors accepted, or set to all sectors; never one it lists as not accepted
  sectors?: string[]         // several (owner's "Buying moves to the Directory"): accepts any of them, or all sectors; hidden if it lists a picked one as not accepted
  maxPrice?: number          // fils, excluding VAT, compared with the current price (top bid, else starting price)
  minPrice?: number          // the same price, from this amount (owner's buyer-side fixes: "AED from … to …")
  dayparts?: Daypart[]       // Dubai time of day
  q?: string                 // outlet, programme or sector contains this text
  closingWithinHours?: number
  audiences?: string[]       // reaches any of these (a placement's own audiences, else its outlet's)
  // the Directory's own (owner's "Buying moves to the Directory")
  dateFrom?: string          // on sale between these two dates (Dubai, YYYY-MM-DD, both included)
  dateTo?: string
  reachMin?: number          // the reach the seller gave on the product, with a close-match margin (reachWindow)
  reachMax?: number
  reachOnly?: boolean        // leave out products with no reach given (otherwise they come last, marked "Reach not given")
}
export type FilterableSlot = {
  outlet: string; placement?: string; channel: string; saleType: string; sectors?: string[]; blocked?: string[]; audience?: string | null; audiences?: string[]
  startsAt: string; endsAt: string | null; closesAt: string; startingPrice: number; topBid: number | null; reach?: number | null
}

/**
 * Reach typed by the buyer, with the margin the owner asked for: results also include products just outside the range, by 2,000 or
 * 2% of the number typed, whichever is bigger, on each side (so 98,000 still shows for "from 100,000"). Those are a "Close match".
 */
export const reachMargin = (n: number) => Math.max(2000, Math.round(n * 0.02))
export function reachWindow(f: Pick<SlotFilter, 'reachMin' | 'reachMax'>) {
  return { lo: f.reachMin != null ? Math.max(0, f.reachMin - reachMargin(f.reachMin)) : null, hi: f.reachMax != null ? f.reachMax + reachMargin(f.reachMax) : null }
}
/** 'in' the range typed, a 'close' match (inside the margin), 'out', or 'none' (the seller gave no reach). */
export function reachMatch(reach: number | null | undefined, f: Pick<SlotFilter, 'reachMin' | 'reachMax'>): 'in' | 'close' | 'out' | 'none' {
  if (f.reachMin == null && f.reachMax == null) return 'in'
  if (reach == null) return 'none'
  const { lo, hi } = reachWindow(f)
  if ((lo != null && reach < lo) || (hi != null && reach > hi)) return 'out'
  return (f.reachMin != null && reach < f.reachMin) || (f.reachMax != null && reach > f.reachMax) ? 'close' : 'in'
}
/** A Dubai calendar date (YYYY-MM-DD) for an instant: Dubai is UTC+4 all year. */
export const dubaiDate = (iso: string) => new Date(new Date(iso).getTime() + 4 * 3_600_000).toISOString().slice(0, 10)

export const DAYPARTS: [Daypart, string][] = [['morning', 'Morning (5–12)'], ['afternoon', 'Afternoon (12–17)'], ['evening', 'Evening (17–24)'], ['allday', 'All day (pages, takeovers)']]
export const currentPrice = (s: FilterableSlot) => s.topBid ?? s.startingPrice

/** Dubai is UTC+4 all year (no daylight saving). */
const dubaiMinutes = (iso: string) => { const d = new Date(new Date(iso).getTime() + 4 * 3_600_000); return d.getUTCHours() * 60 + d.getUTCMinutes() }

export function daypart(s: FilterableSlot): Daypart {
  const m = dubaiMinutes(s.startsAt)
  // whole-day items (print editions) and anything a day or longer (a week's banner) are all-day, as on the calendar
  if (s.endsAt ? new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime() >= 86_400_000 : m === 0) return 'allday'
  return m < 5 * 60 ? 'evening' : m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'afternoon' : 'evening'
}

export function matches(f: SlotFilter, s: FilterableSlot, now = Date.now()): boolean {
  if (f.channels?.length && !f.channels.includes(s.channel)) return false
  if (f.saleTypes?.length && !f.saleTypes.includes(s.saleType)) return false
  if (f.sector) {
    const is = (x: string) => x.toLowerCase() === f.sector!.toLowerCase()
    if ((s.blocked ?? []).some(is) || ((s.sectors ?? []).length > 0 && !(s.sectors ?? []).some(is))) return false // no list = all sectors
  }
  if (f.sectors?.length) {
    const picked = new Set(f.sectors.map(x => x.toLowerCase())), isPicked = (x: string) => picked.has(x.toLowerCase())
    if ((s.blocked ?? []).some(isPicked) || ((s.sectors ?? []).length > 0 && !(s.sectors ?? []).some(isPicked))) return false
  }
  if (f.maxPrice != null && currentPrice(s) > f.maxPrice) return false
  if (f.minPrice != null && currentPrice(s) < f.minPrice) return false
  if (f.dayparts?.length && !f.dayparts.includes(daypart(s))) return false
  if (f.q?.trim()) {
    const hay = `${s.outlet} ${s.placement ?? ''} ${(s.sectors ?? []).join(' ')}`.toLowerCase()
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false
  }
  if (f.closingWithinHours != null && new Date(s.closesAt).getTime() - now > f.closingWithinHours * 3_600_000) return false
  if (f.audiences?.length && !(s.audiences ?? []).some(a => f.audiences!.includes(a))) return false
  if (f.dateFrom && dubaiDate(s.startsAt) < f.dateFrom) return false
  if (f.dateTo && dubaiDate(s.startsAt) > f.dateTo) return false
  const reach = reachMatch(s.reach, f)
  if (reach === 'out' || (reach === 'none' && f.reachOnly)) return false
  return true
}

/** How many filters narrow the calendar beyond "everything", for the "Clear filters (3)" button. */
export const activeCount = (f: SlotFilter, all: { channels: number; saleTypes: number }) =>
  [f.channels && f.channels.length < all.channels, f.saleTypes && f.saleTypes.length < all.saleTypes, !!f.sector || !!f.sectors?.length, f.maxPrice != null || f.minPrice != null,
    !!f.dayparts?.length, !!f.q?.trim(), f.closingWithinHours != null, !!f.audiences?.length, !!(f.dateFrom || f.dateTo), f.reachMin != null || f.reachMax != null].filter(Boolean).length

/** A short sentence for a saved search: "Radio · Banking · under AED 5,000 · morning". */
export function describe(f: SlotFilter, names: Record<string, string> = {}, tr: (s: string) => string = s => s,
  price: (fils: number) => string = fils => `AED ${(fils / 100).toLocaleString('en-US')}`): string {
  const part = (s: string) => tr(s)
  const parts = [
    f.channels?.length ? f.channels.map(c => names[c] ?? c).join(tr(', ')) : part('All channels'),
    f.sector, f.sectors?.length && f.sectors.join(tr(', ')), f.q?.trim() && `“${f.q.trim()}”`,
    f.minPrice != null && part('from {price}').replace('{price}', price(f.minPrice)),
    f.maxPrice != null && part('under {price}').replace('{price}', price(f.maxPrice)),
    f.dayparts?.length && f.dayparts.map(d => part(d === 'allday' ? 'all day' : d)).join(tr(', ')),
    f.saleTypes?.length === 1 && part(f.saleTypes[0] === 'auction' ? 'auctions' : f.saleTypes[0] === 'fixed' ? 'fixed price' : 'quick sales'),
    f.audiences?.length && f.audiences.map(a => part(audienceLabel(a))).join(tr(', ')),
    (f.dateFrom || f.dateTo) && part('on sale {from} – {to}').replace('{from}', f.dateFrom ?? '…').replace('{to}', f.dateTo ?? '…'),
    (f.reachMin != null || f.reachMax != null) && part('reach {from} – {to}').replace('{from}', f.reachMin != null ? f.reachMin.toLocaleString('en-US') : '…')
      .replace('{to}', f.reachMax != null ? f.reachMax.toLocaleString('en-US') : '…'),
  ]
  return parts.filter(Boolean).join(' · ')
}
