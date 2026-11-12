import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel } from '../format'
import { dubai } from '../calendar/layout'
import { t } from '../i18n'
import { ICON } from '../media'
import { OutletMark } from '../LogoPicker'
import { family } from '../../../server/shared/media'
import { mediaName, productTitle, type Media, type Product } from './Listing'
import './portal.css'
import './products.css'

/*
 * Products (owner's fixes round 2): one card for each outlet (the brand) with its logo, how many products it has and its top three
 * with what is on sale. Opening a card shows the outlet's page, where its products are listed, edited and put on sale.
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const daysText = (d: number[]) => d.length === 7 ? t('Every day') : d.join() === '1,2,3,4,5' ? t('Mon–Fri') : d.join() === '6,7' ? t('Weekend') : d.map(x => t(DAYS[x - 1])).join(', ')
export const Ic = ({ d, size = 18 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
/** What a product (one media type of an outlet) has on sale now, over its programmes or its own unit. */
export const onSale = (m: Media) => { const open = m.sellable.reduce((n, s) => n + s.openSlots, 0), next = m.sellable.map(s => s.nextAt).filter(Boolean).sort()[0] ?? null
  return { open, next, text: open ? `${t('{n} on sale', { n: open.toLocaleString('en-US') })}${next ? ` · ${t('next {date}', { date: dayLabel(dubai(next).date, { day: 'numeric', month: 'short' }) })}` : ''}` : t('Not listed') } }

export function ProductsPage() {
  const [list, setList] = useState<Product[] | null>(null), [error, setError] = useState('')
  useEffect(() => { api<Product[]>('/seller/products').then(setList, e => setError(e.message)) }, [])
  if (!list) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const media = list.flatMap(p => p.media), sell = media.flatMap(m => m.sellable)
  return <main className="pd">
    <div className="pt-head">
      <div><h1>{t('Products')}</h1><p className="muted">{t('Each outlet with its products, programmes and what is on sale. Add the details once; list them for the dates you choose.')}</p></div>
      <div className="pt-filters"><a className="btn" href="/listings/import">{t('Import a rate card file')}</a><a className="btn primary" href="/listings/new">+ {t('Add outlet')}</a></div>
    </div>
    {list.length > 0 && <section className="pd-sum">
      <div><b className="num">{list.length}</b><span>{t(list.length === 1 ? 'outlet' : 'outlets')}</span></div><div><b className="num">{media.length}</b><span>{t(media.length === 1 ? 'product' : 'products')}</span></div>
      <div><b className="num">{sell.filter(s => s.openSlots > 0).length}</b><span>{t('listed now')}</span></div><div><b className="num">{sell.reduce((n, s) => n + s.openSlots, 0).toLocaleString('en-US')}</b><span>{t('slots on sale')}</span></div>
    </section>}
    {!list.length && <section className="card pad pd-empty"><h2>{t('Add your first outlet')}</h2>
      <p className="muted">{t('An outlet is your brand, for example Skyline FM. Under it, add each product it sells (its radio station, its website, its newsletter…) and, for radio, TV and podcasts, its programmes. Then list them for the dates you choose.')}</p>
      <a className="btn primary" href="/listings/new">+ {t('Add outlet')}</a></section>}

    <div className="pd-grid">{list.map(p => { const top = [...p.media].sort((a, b) => onSale(b).open - onSale(a).open).slice(0, 3)
      return <a key={p.id} className="card pd-out" href={`/listings/p/${p.id}`} aria-label={p.name}>
        <span className="pd-oh"><OutletMark name={p.name} url={p.logoUrl} size={48} />
          <span className="pd-ot"><b>{p.name}</b>{p.description && <span className="small muted">{p.description}</span>}</span>
          <i className="pd-go" aria-hidden><Ic d="M9 6l6 6-6 6" size={16} /></i></span>
        <span className="pd-count"><Ic d="M12 3 3 8l9 5 9-5zM3 13l9 5 9-5" size={18} /><span><small>{t('Products')}</small><b className="num">{p.media.length}</b></span></span>
        {top.length > 0 ? <><span className="pd-topl small">{t('Top products')}</span>
          <span className="pd-top">{top.map(m => { const s = onSale(m)
            return <span key={m.id} className={`pd-tr f-${family(m.channel)}`}>
              {m.coverUrl ? <img src={m.coverUrl} alt="" width={56} height={36} loading="lazy" /> : <i className="pd-mic" aria-hidden><Ic d={ICON[m.channel] ?? ICON.other} size={16} /></i>}
              <span className="pd-tn"><b dir="auto">{productTitle(p, m)}</b><small>{mediaName(m)}</small></span>
              <span className={`pt-pill ${s.open ? 'good' : 'mute'}`}>{s.open ? t('{n} on sale', { n: s.open.toLocaleString('en-US') }) : t('Not listed')}</span></span> })}</span></>
          : <span className="pd-none small muted">{t('No products yet. Open the outlet to add the first one.')}</span>}
      </a> })}</div>
  </main>
}
