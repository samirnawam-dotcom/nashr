import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel } from '../format'
import { dubai } from '../calendar/layout'
import { money } from './common'
import { t } from '../i18n'
import { tm } from '../i18n-server'
import { ICON, art } from '../media'
import { family } from '../../../server/shared/media'
import { HAS_PROGRAMMES } from '../../../server/shared/products'
import { ListingPanel, mediaName, type Product, type Sellable } from './Listing'
import './portal.css'
import './products.css'

/*
 * Products (owner's rules): each product (the brand) with its media types and programmes, what each sells for by default and what
 * is on sale now. "List" puts one of them on sale for chosen dates; Edit opens the product with its media types and programmes.
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const daysText = (d: number[]) => d.length === 7 ? t('Every day') : d.join() === '1,2,3,4,5' ? t('Mon–Fri') : d.join() === '6,7' ? t('Weekend') : d.map(x => t(DAYS[x - 1])).join(', ')
const when = (s: Sellable) => [s.days?.length ? daysText(s.days) : '', s.startsAt ? `${s.startsAt}–${s.endsAt ?? ''}` : '', s.breaks?.length ? t(s.breaks.length === 1 ? '1 break' : '{n} breaks', { n: s.breaks.length }) : ''].filter(Boolean).join(' · ')
const Ic = ({ d, size = 18 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>

export function ProductsPage() {
  const [list, setList] = useState<Product[] | null>(null), [error, setError] = useState(''), [listing, setListing] = useState<{ product: string; placement: string } | null>(null)
  const load = () => api<Product[]>('/seller/products').then(setList, e => setError(e.message))
  useEffect(() => { load() }, [])
  async function remove(p: Product) {
    if (!confirm(t('Delete {name}? What is not yet sold stops being sold; bookings already made carry on.', { name: p.name }))) return
    try { await api(`/seller/products/${p.id}/delete`, { method: 'POST', body: {} }); await load() } catch (e: any) { setError(tm(e.message)) }
  }
  if (!list) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const media = list.flatMap(p => p.media), sell = media.flatMap(m => m.sellable)
  return <main className="pd">
    <div className="pt-head">
      <div><h1>{t('Products')}</h1><p className="muted">{t('Each product with its media types, programmes and what is on sale. Add the details once; list them for the dates you choose.')}</p></div>
      <div className="pt-filters"><a className="btn" href="/listings/import">{t('Import a rate card file')}</a><a className="btn primary" href="/listings/new">+ {t('Add product')}</a></div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {list.length > 0 && <section className="pd-sum">
      <div><b className="num">{list.length}</b><span>{t('products')}</span></div><div><b className="num">{media.length}</b><span>{t('media types')}</span></div>
      <div><b className="num">{sell.filter(s => s.openSlots > 0).length}</b><span>{t('listed now')}</span></div><div><b className="num">{sell.reduce((n, s) => n + s.openSlots, 0).toLocaleString('en-US')}</b><span>{t('slots on sale')}</span></div>
    </section>}
    {!list.length && <section className="card pad pd-empty"><h2>{t('Add your first product')}</h2>
      <p className="muted">{t('A product is your brand, for example Skyline FM. Under it, add each media type it has (radio, website, newsletter…) and, for radio, TV and podcasts, its programmes. Then list them for the dates you choose.')}</p>
      <a className="btn primary" href="/listings/new">+ {t('Add product')}</a></section>}

    {list.map(p => <section key={p.id} className="card pd-prod">
      <header className="pd-ph">
        {p.logoUrl ? <img className="pd-logo" src={p.logoUrl} alt="" width={52} height={52} /> : <span className="pd-logo" aria-hidden>{p.name.slice(0, 2).toUpperCase()}</span>}
        <div className="pd-pt"><h2>{p.name}</h2>{p.description && <p className="muted small">{p.description}</p>}</div>
        <a className="btn" href={`/listings/p/${p.id}`}><Ic d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" size={16} />{t('Edit')}</a>
        <button type="button" className="btn" onClick={() => remove(p)}>{t('Delete')}</button>
      </header>
      {listing?.product === p.id && <div className="pd-list"><ListingPanel products={[p]} placementId={listing.placement} onClose={() => setListing(null)} onDone={load} /></div>}
      {!p.media.length ? <p className="pd-none muted">{t('No media types yet.')} <a href={`/listings/p/${p.id}?add=1`}>{t('Add a media type')}</a></p>
        : p.media.map(m => <div key={m.id} className={`pd-media f-${family(m.channel)}`}>
          <div className="pd-mh">
            <span className="pd-mic" aria-hidden><Ic d={ICON[m.channel] ?? ICON.digital} /></span>
            <div className="pd-mt"><b>{mediaName(m)}</b><span className="small muted">{m.name}{m.defaultPrice ? ` · ${t('default {amount}', { amount: money(m.defaultPrice) })}` : ''}{m.closeDays != null ? ` · ${t('bidding closes {n} days before', { n: m.closeDays })}` : ''}</span></div>
            <a className="pd-edit" href={`/listings/p/${p.id}?media=${m.id}`}>{t('Edit')}</a>
          </div>
          {!m.sellable.length ? <p className="pd-none small muted">{HAS_PROGRAMMES.includes(m.channel) && m.details.programmes ? <>{t('Sold by programme, but no programme added yet.')} <a href={`/listings/p/${p.id}?media=${m.id}`}>{t('Add a programme')}</a></> : t('Nothing to list yet.')}</p>
            : <ul className="pd-rows">{m.sellable.map(s => <li key={s.id}>
              <img className="pd-thumb" src={art(m.channel, 'card')} alt="" width={72} height={46} loading="lazy" />
              <span className="pd-what"><b>{s.kind === 'programme' ? s.name : s.name}</b><span className="small muted">{s.kind === 'programme' ? t('Programme') : t('Sold as one')}{when(s) ? ` · ${when(s)}` : ''}</span></span>
              <span className="pd-state">{s.openSlots > 0 ? <span className="pt-pill good">{t('{n} on sale', { n: s.openSlots })}{s.nextAt ? ` · ${t('next {date}', { date: dayLabel(dubai(s.nextAt).date, { day: 'numeric', month: 'short' }) })}` : ''}</span>
                : <span className="pt-pill mute">{t('Not listed')}</span>}{s.listing === 'rolling' && <span className="pt-pill info">{t('Kept on sale')}</span>}</span>
              <span className="pd-price num">{money(s.defaultPrice ?? s.startingPrice)}<span className="small muted">{t('default')}</span></span>
              <span className="pd-act"><a className="btn" href={`/schedule?view=week&q=${encodeURIComponent(p.name)}`}>{t('Calendar')}</a>
                <button type="button" className="btn primary" onClick={() => setListing({ product: p.id, placement: s.id })}>{t('List')}</button></span>
            </li>)}</ul>}
        </div>)}
      <footer className="pd-pf"><a href={`/listings/p/${p.id}?add=1`}>+ {t('Add a media type')}</a></footer>
    </section>)}
  </main>
}
