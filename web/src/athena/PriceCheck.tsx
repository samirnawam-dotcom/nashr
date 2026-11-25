import { useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../format'
import { t } from '../i18n'
import { CHANNEL_NAME } from '../media'
import { AthenaPanel } from './Owl'

/*
 * Athena's price check, under the price a publisher is setting: what similar products sold for on Nashr over the last 90 days
 * (same media type at the same time of day when there are enough sales, else the same media type), where this price sits in
 * that range, and how this product itself has been selling. Only what happened on Nashr; with too few sales it says so.
 */
type Check = { enough: boolean; n: number; own: { sales: number; bids: number } | null; level?: 'daypart' | 'media'; daypart?: 'morning' | 'afternoon' | 'evening' | null
  days?: number; low?: number; high?: number; median?: number; min?: number; max?: number; below?: number | null }

export function PriceCheck({ channel, priceAed, placementId, start, saleType }: { channel: string; priceAed: string; placementId?: string; start?: string | null; saleType?: string }) {
  const price = Math.round(Number(String(priceAed).replace(/,/g, '')) * 100) || 0
  const [c, setC] = useState<Check | null | undefined>(undefined)
  // asks again a moment after the price stops changing
  useEffect(() => {
    if (!channel) { setC(null); return }
    const k = setTimeout(() => {
      const q = new URLSearchParams({ channel, price: String(price) }); if (placementId) q.set('placement', placementId); if (start) q.set('start', start)
      api<{ check: Check | null }>(`/seller/price-check?${q}`).then(r => setC(r.check), () => setC(null))
    }, 400)
    return () => clearTimeout(k)
  }, [channel, price, placementId, start])
  if (c === null) return null
  if (c === undefined) return <AthenaPanel label={t('price check')} busy say="loading" className="price-check"><p className="small">{t('Comparing with what similar products sold for…')}</p></AthenaPanel>
  const media = t(CHANNEL_NAME[channel] ?? channel).toLowerCase()
  const like = c.level === 'daypart' ? (c.daypart === 'morning' ? t('Morning {media} products', { media }) : c.daypart === 'afternoon' ? t('Afternoon {media} products', { media }) : t('Evening {media} products', { media }))
    : t('Similar {media} products', { media })
  const own = c.own && (c.own.sales || c.own.bids)
    ? t('This product: {sales} sales in 90 days, {bids} bids in the last 3 weeks.', { sales: c.own.sales, bids: c.own.bids })
    : c.own ? t('This product has had no bids in the last 3 weeks.') : ''
  if (!c.enough) return <AthenaPanel label={t('price check')} say={`few:${channel}`} className="price-check">
    <p className="small">{t('Not enough sales of {media} products on Nashr yet to compare your price. {own}', { media, own })}</p></AthenaPanel>
  const tenths = price && c.below != null ? Math.round(c.below / c.n * 10) : null
  const where = !price ? t('Enter a price to see where it sits.')
    : price < c.low! ? (saleType === 'auction' ? t('Below most sales: a low starting price draws bids, and the auction can take it higher.') : t('Below most sales: you may be leaving money on the table.'))
    : price > c.high! ? (c.below === c.n ? t('Above every one of these sales. Expect fewer buyers at this price.') : t('Above {n} in 10 of these sales. Expect fewer buyers at this price.', { n: Math.min(9, tenths ?? 9) }))
    : t('Within the usual range.')
  // the range bar: the middle half of sales shaded, this price marked
  const lo = c.min!, hi = Math.max(c.max!, price), span = Math.max(1, hi - lo), pos = (v: number) => `${Math.min(100, Math.max(0, (v - lo) / span * 100))}%`
  const band = price < c.low! || price > c.high! ? 'out' : 'in'
  return <AthenaPanel label={t('price check')} say={`${channel}:${band}`} className="price-check">
    <p className="small">{t('{like} sold for {low}–{high} over the last {days} days (middle half of {n} sales; middle sale {median}).', { like, low: money(c.low!), high: money(c.high!), days: c.days!, n: c.n, median: money(c.median!) })}</p>
    <div className="pc-range" aria-hidden="true">
      <span className="pc-band" style={{ insetInlineStart: pos(c.low!), width: `calc(${pos(c.high!)} - ${pos(c.low!)})` }} />
      {price > 0 && <span className={`pc-mark ${band}`} style={{ insetInlineStart: pos(price) }} />}
    </div>
    <div className="pc-ends small muted"><span>{money(lo)}</span><span>{money(hi)}</span></div>
    <p className="small"><b>{where}</b>{own ? ` ${own}` : ''}</p>
  </AthenaPanel>
}
