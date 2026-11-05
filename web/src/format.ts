import { dubai } from './calendar/layout'

export const money = (fils: number | null | undefined, currency = 'AED') =>
  fils == null ? '—' : `${currency} ${(fils / 100).toLocaleString('en-US', { maximumFractionDigits: fils % 100 ? 2 : 0, minimumFractionDigits: fils % 100 ? 2 : 0 })}`

export const time = (iso: string) => { const m = dubai(iso).minutes; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

export const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })

export function closesIn(iso: string, now = Date.now()) {
  const min = Math.floor((new Date(iso).getTime() - now) / 60_000)
  return min < 0 ? 'Bidding closed' : min < 60 ? `Closes in ${min}m` : min < 48 * 60 ? `Closes in ${Math.floor(min / 60)}h` : null
}
