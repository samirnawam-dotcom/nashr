/**
 * What a buyer can search the calendar by. One definition for the calendar screen and for saved-search alerts on the
 * server, so an alert fires for exactly the slots the buyer would have seen. Pure: no Node or browser APIs.
 */
export type Daypart = 'morning' | 'afternoon' | 'evening' | 'allday'
export type SlotFilter = {
  channels?: string[]        // empty or missing: every channel
  saleTypes?: string[]       // 'auction' | 'quick_sale'
  sector?: string            // the outlet accepts this sector (case-insensitive)
  maxPrice?: number          // fils, excluding VAT, compared with the current price (top bid, else starting price)
  dayparts?: Daypart[]       // Dubai time of day
  q?: string                 // outlet, programme or audience contains this text
  closingWithinHours?: number
}
export type FilterableSlot = {
  outlet: string; placement?: string; channel: string; saleType: string; sectors?: string[]; audience?: string | null
  startsAt: string; endsAt: string | null; closesAt: string; startingPrice: number; topBid: number | null
}

export const DAYPARTS: [Daypart, string][] = [['morning', 'Morning (5–12)'], ['afternoon', 'Afternoon (12–17)'], ['evening', 'Evening (17–24)'], ['allday', 'All day (pages, takeovers)']]
export const currentPrice = (s: FilterableSlot) => s.topBid ?? s.startingPrice

/** Dubai is UTC+4 all year (no daylight saving). */
const dubaiMinutes = (iso: string) => { const d = new Date(new Date(iso).getTime() + 4 * 3_600_000); return d.getUTCHours() * 60 + d.getUTCMinutes() }

export function daypart(s: FilterableSlot): Daypart {
  const m = dubaiMinutes(s.startsAt)
  if (!s.endsAt && m === 0) return 'allday'
  return m < 5 * 60 ? 'evening' : m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'afternoon' : 'evening'
}

export function matches(f: SlotFilter, s: FilterableSlot, now = Date.now()): boolean {
  if (f.channels?.length && !f.channels.includes(s.channel)) return false
  if (f.saleTypes?.length && !f.saleTypes.includes(s.saleType)) return false
  if (f.sector && !(s.sectors ?? []).some(x => x.toLowerCase() === f.sector!.toLowerCase())) return false
  if (f.maxPrice != null && currentPrice(s) > f.maxPrice) return false
  if (f.dayparts?.length && !f.dayparts.includes(daypart(s))) return false
  if (f.q?.trim()) {
    const hay = `${s.outlet} ${s.placement ?? ''} ${s.audience ?? ''}`.toLowerCase()
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return false
  }
  if (f.closingWithinHours != null && new Date(s.closesAt).getTime() - now > f.closingWithinHours * 3_600_000) return false
  return true
}

/** How many filters narrow the calendar beyond "everything", for the "Clear filters (3)" button. */
export const activeCount = (f: SlotFilter, all: { channels: number; saleTypes: number }) =>
  [f.channels && f.channels.length < all.channels, f.saleTypes && f.saleTypes.length < all.saleTypes, !!f.sector, f.maxPrice != null,
    !!f.dayparts?.length, !!f.q?.trim(), f.closingWithinHours != null].filter(Boolean).length

/** A short sentence for a saved search: "Radio · Banking · under AED 5,000 · morning". */
export function describe(f: SlotFilter, names: Record<string, string> = {}, tr: (s: string) => string = s => s,
  price: (fils: number) => string = fils => `AED ${(fils / 100).toLocaleString('en-US')}`): string {
  const part = (s: string) => tr(s)
  const parts = [
    f.channels?.length ? f.channels.map(c => names[c] ?? c).join(tr(', ')) : part('All channels'),
    f.sector, f.q?.trim() && `“${f.q.trim()}”`,
    f.maxPrice != null && part('under {price}').replace('{price}', price(f.maxPrice)),
    f.dayparts?.length && f.dayparts.map(d => part(d === 'allday' ? 'all day' : d)).join(tr(', ')),
    f.saleTypes?.length === 1 && part(f.saleTypes[0] === 'auction' ? 'auctions' : 'quick sales'),
  ]
  return parts.filter(Boolean).join(' · ')
}
