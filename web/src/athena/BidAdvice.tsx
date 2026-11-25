import { useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../format'
import { isAr, t } from '../i18n'
import { CHANNEL_NAME } from '../media'
import { AthenaPanel } from './Owl'

/*
 * Athena's bid advice in the bid drawer: what slots like this one sold for on Nashr lately (this product first, then this
 * outlet, then this media type, whichever has enough sales), and a bid that would have won most of them. One tap puts it in
 * the bid box; Athena never bids by itself. With too few sales, it says so instead of guessing.
 */
type Advice = { enough: boolean; n: number; nextBid: number; level?: 'product' | 'outlet' | 'media'; outlet?: string; channel?: string; days?: number
  low?: number; high?: number; median?: number; suggest?: number; wins?: number; aboveMarket?: boolean
  forecast?: { n: number; ratio: number; expected: number; late: number; uplift: number | null; season: { key: string; name: string; nameAr: string } | null } | null }

export function BidAdvice({ slotId, top, onUse, onAuto }: { slotId: string; top: number | null; onUse: (aed: string) => void; onAuto?: (aed: string) => void }) {
  const [a, setA] = useState<Advice | null | undefined>(undefined), [why, setWhy] = useState(false)
  useEffect(() => { setA(undefined); api<{ advice: Advice | null }>(`/slots/${slotId}/advice`).then(r => setA(r.advice), () => setA(null)) }, [slotId, top])
  if (a === null) return null
  if (a === undefined) return <AthenaPanel label={t('bid advice')} busy say="loading"><p className="small">{t('Looking at what similar slots sold for…')}</p></AthenaPanel>
  // the forecast never reads lower than this product's own middle sale or the suggested bid
  const f = a.forecast && { ...a.forecast, expected: Math.max(a.forecast.expected, a.median ?? 0, a.suggest ?? 0) }
  const fc = f && <div className="bid-forecast">
    <p className="small"><b>{t('Forecast')}:</b> {t('auctions like this usually end near {amount} ({x}× the starting price).', { amount: money(f.expected), x: f.ratio.toFixed(2) })}
      {f.season && ' ' + (f.uplift && f.uplift > 1.02 ? t('It runs during {season}, when prices end about {pct}% higher.', { season: isAr ? f.season.nameAr : t(f.season.name), pct: Math.round((f.uplift - 1) * 100) })
        : t('It runs during {season}, when demand usually rises.', { season: isAr ? f.season.nameAr : t(f.season.name) }))}
      {f.late >= 0.4 && ' ' + t('Most bids come in the last day, so a maximum (auto-bid) protects you better than a single bid.')}</p>
    {onAuto && <button type="button" className="btn sm" onClick={() => onAuto(String(f.expected / 100))}>{t('Auto-bid up to {amount}', { amount: money(f.expected) })}</button>}
  </div>
  if (!a.enough) return <AthenaPanel label={t('bid advice')} say={`few:${slotId}`}><p className="small">{t('Not enough sales like this one on Nashr yet for me to suggest a bid. The next bid is {next}.', { next: money(a.nextBid) })}</p>{fc}</AthenaPanel>
  const like = a.level === 'product' ? t('This product') : a.level === 'outlet' ? t('Products on {outlet}', { outlet: a.outlet ?? '' }) : t('{media} products', { media: t(CHANNEL_NAME[a.channel ?? ''] ?? a.channel ?? '') })
  return <AthenaPanel label={t('bid advice')} say={`${slotId}:${a.suggest}:${top}`} className="bid-advice">
    <p>{t('{like} sold for {low}–{high} over the last {days} days ({n} sales).', { like, low: money(a.low!), high: money(a.high!), days: a.days!, n: a.n })}{' '}
      {a.aboveMarket ? t('Bidding here is already above most of those sales: the next bid is {next}.', { next: money(a.nextBid) })
        : t('A bid of {amount} would have won {wins} of them.', { amount: money(a.suggest!), wins: a.wins! })}</p>
    <div className="ath-act">
      <button type="button" className="btn sm primary" onClick={() => onUse(String(a.suggest! / 100))}>{t('Use {amount}', { amount: money(a.suggest!) })}</button>
      <button type="button" className="btn sm" aria-expanded={why} onClick={() => setWhy(!why)}>{t('Why?')}</button></div>
    {fc}
    {why && <p className="small muted">{t('Athena looks at auctions that ended in a booking on Nashr: this product first, then the same outlet, then the same media type, using the first group with at least 3 sales. The middle sale was {median}. The suggestion beats 7 in 10 of them, rounded up to the next AED 100, and is never below the next allowed bid.', { median: money(a.median!) })}</p>}
  </AthenaPanel>
}
