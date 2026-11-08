import { useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../format'
import { saleLabel } from '../calendar/CalendarPage'
import { t } from '../i18n'

type I = { totals: { slots: number; sold: number; sellThrough: number | null; revenue: number; unsold: number; unsoldValue: number; uplift: number | null }
  placements: { id: string; name: string; outlet: string; saleType: string; slots: number; sold: number; sellThrough: number | null; revenue: number; averagePrice: number | null }[] }

/** How the publisher's airtime is selling over the last 90 days: what sold, at what price against the starting price, and what went unsold. */
export function SalesInsights() {
  const [d, setD] = useState<I | null>(null)
  useEffect(() => { api<I>('/seller/insights').then(setD, () => {}) }, [])
  if (!d || !d.totals.slots) return null
  return <section className="section">
    <h2 className="sec-h">{t('Sales insights')} <span className="small muted">{t('last 90 days, slots whose sale has closed')}</span></h2>
    <dl className="kpis">
      <div className="card"><dt>{t('Sell-through')}</dt><dd className="num">{d.totals.sellThrough}%</dd><span className="small muted">{t('{sold} of {slots} slots sold', { sold: d.totals.sold, slots: d.totals.slots })}</span></div>
      <div className="card"><dt>{t('Sold')}</dt><dd className="num">{money(d.totals.revenue)}</dd><span className="small muted">{t('excl. VAT, before commission')}</span></div>
      <div className="card"><dt>{t('Above starting price')}</dt><dd className="num">{d.totals.uplift != null ? `${d.totals.uplift > 0 ? '+' : ''}${d.totals.uplift}%` : '—'}</dd><span className="small muted">{t('What bidding added on average')}</span></div>
      <div className="card"><dt>{t('Unsold airtime')}</dt><dd className="num">{d.totals.unsold}</dd><span className="small muted">{t('worth {value} at starting prices', { value: money(d.totals.unsoldValue) })}</span></div>
    </dl>
    <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Placement')}</th><th>{t('Sold as')}</th><th className="r">{t('Slots')}</th><th className="r">{t('Sell-through')}</th>
      <th className="r">{t('Average price')}</th><th className="r">{t('Sold')}</th></tr></thead>
      <tbody>{d.placements.map(p => <tr key={p.id}><td><b>{p.name}</b><div className="small muted">{p.outlet}</div></td><td className="small">{saleLabel(p.saleType)}</td>
        <td className="r num">{p.slots}</td><td className="r num">{p.sellThrough != null ? `${p.sellThrough}%` : '—'}</td>
        <td className="r num">{p.averagePrice != null ? money(p.averagePrice) : '—'}</td><td className="r num">{money(p.revenue)}</td></tr>)}</tbody></table></div>
  </section>
}
