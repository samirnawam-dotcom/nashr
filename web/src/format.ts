import { dubai } from './calendar/layout'
import { isAr, locale, t } from './i18n'

const CURRENCY_AR: Record<string, string> = { AED: 'درهم', SAR: 'ريال' }
/** AED 3,500 in English; 3,500 درهم in Arabic. Digits stay Latin in both. */
export const money = (fils: number | null | undefined, currency = 'AED') => {
  if (fils == null) return '—'
  const n = (fils / 100).toLocaleString('en-US', { maximumFractionDigits: fils % 100 ? 2 : 0, minimumFractionDigits: fils % 100 ? 2 : 0 })
  return isAr ? `${n} ${CURRENCY_AR[currency] ?? currency}` : `${currency} ${n}`
}

export const time = (iso: string) => { const m = dubai(iso).minutes; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

export const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(date + 'T12:00:00Z').toLocaleDateString(locale, { ...opts, timeZone: 'UTC' })

export function closesIn(iso: string, now = Date.now()) {
  const min = Math.floor((new Date(iso).getTime() - now) / 60_000)
  return min < 0 ? t('Bidding closed') : min < 60 ? t('Closes in {n}m', { n: min }) : min < 48 * 60 ? t('Closes in {n}h', { n: Math.floor(min / 60) }) : null
}
