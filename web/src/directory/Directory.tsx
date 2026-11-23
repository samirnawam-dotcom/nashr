import { navigate } from '../nav'
import { PAGES, breadcrumb, siteUrl, useMeta } from '../seo'
import { useEffect, useRef, useState } from 'react'
import { api, type Price } from '../api'
import { money } from '../format'
import './directory.css'
import { SignInPrompt, rememberPlace, useGuest } from '../guest'
import { PhotoBand } from '../PhotoBand'
import { Stars } from '../Stars'
import { isAr, locale, sep, t } from '../i18n'
import { art, CHANNELS, CHANNEL_NAME, ICON } from '../media'
import { OutletMark } from '../LogoPicker'
import { ProductSummary, daysText, mediaName, type SummaryProduct } from '../products/Summary'
import { AddToCampaign } from '../campaigns/AddToCampaign'
import { setCurrentCampaign, useCampaigns, useCurrentCampaign } from '../calendar/CampaignDrawer'
import { OutletCalendar, saleLabel, SaleIcon, useNarrow } from '../calendar/CalendarPage'
import { AskBar, AthenaLine, CampaignButton, EMPTY, ProductCardView, ShopFilters, shopping, toSlotFilter, useBuying, useProducts, useShop, type ShopSort } from './Shop'

/*
 * The Directory (owner's buyer-side fixes): the same structure as the publisher's Products page, outlets first, then their
 * products. Sort by popularity, price or newest; filter by media type, price range, "fits my budget" and saved outlets.
 */
export const Logo = ({ o, size = 44 }: { o: { name: string; logoUrl: string | null }; size?: number }) => <OutletMark name={o.name} url={o.logoUrl} size={size} />

/** The label always says where a price comes from (brief section 7). Kept for pages that still show a range. */
export const PriceTag = ({ p }: { p: Price }) => !p ? <span className="small muted">{t("Price on request")}</span> : (
  <span className="price-tag"><b className="num">{p.from === p.to ? money(p.from, p.currency) : isAr ? `${(p.from / 100).toLocaleString('en-US')}–${money(p.to, p.currency)}` : `${money(p.from, p.currency)}–${(p.to / 100).toLocaleString('en-US')}`}</b>
    <span className={`level ${p.level}`}>{t(p.label)}</span></span>)

/** "Tell me when it opens" for KSA and Athena (brief sections 14, 21). */
export function Waitlist({ topic, label }: { topic: 'KSA' | 'Athena'; label: string }) {
  const guest = useGuest()
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => { if (guest) return void setOn(false); api<string[]>('/waitlist').then(t => setOn(t.includes(topic)), () => setOn(false)) }, [topic])
  if (on === null) return null
  if (guest) return <a className="btn" href="/sign-in" onClick={rememberPlace}>{label}</a>
  return on ? <span className="small ok">{t("You're on the list. We'll tell you when it opens.")}</span>
    : <button className="btn" onClick={() => api('/waitlist', { method: 'POST', body: { topic } }).then(() => setOn(true))}>{label}</button>
}

export type Brand = { id: string; slug: string; name: string; nameAr: string | null; logoUrl: string | null; coverUrl: string | null; channels: string[]; sectors: string[]
  audiences: string[]; audience: string | null; market: string; comingSoon: boolean; onNashr: boolean; fromPrice: number | null; currency: string; onSale: number; products: number
  rating: { average: number | null; count: number }; saved: boolean; popularRank: number; newestRank: number }
const toFils = (v: string) => v.trim() === '' ? null : Math.round(Number(v.replace(/,/g, '')) * 100)
const channelsText = (cs: string[]) => cs.map(c => CHANNEL_NAME[c] ?? c).join(' · ')

/** The star on every outlet card and outlet page: tap to save, tap again to remove (no campaign needed). */
function SaveStar({ b, onChange }: { b: { id: string; name: string; saved: boolean }; onChange: (saved: boolean) => void }) {
  const guest = useGuest(), [busy, setBusy] = useState(false)
  if (guest) return null
  return <button type="button" className={`star-btn ${b.saved ? 'on' : ''}`} aria-pressed={b.saved} disabled={busy}
    aria-label={b.saved ? t('Remove {name} from saved', { name: b.name }) : t('Save {name}', { name: b.name })} title={b.saved ? t('Saved') : t('Save')}
    onClick={async e => { e.preventDefault(); e.stopPropagation(); setBusy(true)
      try { const r = await api<{ saved: boolean }>(`/directory/${b.id}/saved`, { method: b.saved ? 'DELETE' : 'PUT' }); onChange(r.saved) } finally { setBusy(false) } }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill={b.saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
  </button>
}

const SORTS: [ShopSort, string][] = [['fit', 'Best fit (Athena)'], ['popular', 'Most popular'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['closing', 'Closing soonest'], ['newest', 'Newest on Nashr']]

export function DirectoryPage() {
  useMeta({ ...PAGES['/directory'], jsonLd: [breadcrumb([['Nashr', '/'], [t("Directory"), '/directory']])] })
  const { f, set, view, setView, sort, setSort, layout, setLayout, params } = useShop()
  const buying = useBuying(), guest = buying.guest
  const [list, setList] = useState<Brand[] | null>(null), [error, setError] = useState('')
  // arriving from a campaign's "+ Add products": that campaign is the one products are added to
  useEffect(() => { const c = params.get('campaign'); if (c && !guest) setCurrentCampaign(c) }, [])
  useEffect(() => { api<Brand[]>('/directory').then(setList, e => setError(e.message)) }, [])
  useMeta(list && { ...PAGES['/directory'], jsonLd: [breadcrumb([['Nashr', '/'], [t("Directory"), '/directory']]), { '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'UAE media outlets on Nashr', itemListElement: list.filter(o => o.market === 'AE').map((o, k) => ({ '@type': 'ListItem', position: k + 1, name: o.name, url: `${siteUrl()}/directory/${o.slug}` })) }] }, [list])
  // "Closing soonest" is a Products-view sort; the Outlets view falls back to Most popular
  const outletSort: ShopSort = sort === 'closing' || sort === 'fit' ? 'popular' : sort
  const askRef = useRef<HTMLInputElement>(null)
  const needServer = view === 'products' || shopping(f)
  const prods = useProducts(f, sort, needServer, buying.reload)
  const lo = toFils(f.min), hi = toFils(f.max)
  const shown = (list ?? []).filter(o => o.market === f.market && (!f.channel || f.channel.split(',').some(c => o.channels.includes(c))) && (!f.nashr || o.onNashr) && (!f.saved || o.saved)
    && (lo == null || (o.fromPrice != null && o.fromPrice >= lo)) && (hi == null || (o.fromPrice != null && o.fromPrice <= hi))
    && (!shopping(f) || !prods.brands || prods.brands.has(o.id))
    && (!f.q || `${o.name} ${o.nameAr ?? ''} ${o.sectors.join(' ')} ${o.audience ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
  // price sorts put outlets not on Nashr ("Request a quote") last
  const price = (o: Brand) => o.onNashr ? o.fromPrice ?? null : null
  shown.sort((a, b) => outletSort === 'popular' ? a.popularRank - b.popularRank : outletSort === 'newest' ? a.newestRank - b.newestRank
    : price(a) == null ? (price(b) == null ? 0 : 1) : price(b) == null ? -1 : outletSort === 'price_asc' ? price(a)! - price(b)! : price(b)! - price(a)!)
  const setOne = (id: string, v: boolean) => { setList(l => l && l.map(x => x.id === id ? { ...x, saved: v } : x)); prods.setSaved(id, v) }
  const availability = (o: Brand) => `/directory/${o.slug}?tab=calendar`
  const filtered = Object.keys(toSlotFilter(f)).length > 0 || f.saved || f.nashr
  const activeFilters = Object.keys(toSlotFilter(f)).filter(k => k !== 'q').length + (f.saved ? 1 : 0) + (f.nashr ? 1 : 0)
  const narrow = useNarrow(), [sheet, setSheet] = useState(false)
  return (
    <main>
      <PhotoBand img="/brand/skyline.jpg" title={t("Directory")} sub={t("UAE radio, TV, print, digital and podcasts. Find an outlet or a product, then bid, buy or make an offer.")} />
      <div className="dir-bar">
        <AskBar f={f} set={set} inputRef={askRef} onAsk={() => { setView('products'); setSort('fit') }} />
        {!guest && <CampaignButton onOpen={buying.openCampaign} />}
        <div className="seg" role="group" aria-label={t("Show")}>
          <button className={view === 'outlets' ? 'on' : ''} onClick={() => setView('outlets')}>{t("Outlets")}</button>
          <button className={view === 'products' ? 'on' : ''} onClick={() => setView('products')}>{t("Products")}</button></div>
        <div className="seg" role="group" aria-label={t("View")}>
          <button className={layout === 'grid' ? 'on' : ''} onClick={() => setLayout('grid')}>{t("Grid")}</button>
          <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}>{t("List")}</button></div>
        <label className="dir-sort"><span>{t('Sort by:')}</span><select value={view === 'outlets' ? outletSort : sort} onChange={e => setSort(e.target.value as ShopSort)}>
          {SORTS.filter(([k]) => (view === 'products' || (k !== 'closing' && k !== 'fit')) && (k !== 'fit' || !!f.ask)).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></label>
      </div>
      {narrow ? <div className="row-flex dir-mfilters">
          <button className={`btn ${activeFilters ? 'primary' : ''}`} onClick={() => setSheet(true)}>{activeFilters ? t('Filters ({n})', { n: activeFilters }) : t('Filters')}</button>
          {activeFilters > 0 && <button className="text-link small" onClick={() => set({ ...EMPTY, q: f.q, market: f.market })}>{t('Clear all')}</button>}</div>
        : <ShopFilters f={f} set={set} guest={guest} view={view} />}
      <AthenaLine f={f} set={set} />
      {/* phones: the filters open full screen from a Filters button (owner's "Buying moves to the Directory") */}
      {narrow && sheet && <div className="scrim" onClick={() => setSheet(false)}><div className="cv-sheet dir-sheet" role="dialog" aria-label={t('Filters')} onClick={e => e.stopPropagation()}>
        <header className="drawer-h"><h2>{t('Filters')}</h2><button className="btn" onClick={() => setSheet(false)} aria-label={t('Close')}>✕</button></header>
        <ShopFilters f={f} set={set} guest={guest} view={view} />
        <footer className="drawer-f"><button className="btn primary" onClick={() => setSheet(false)}>{t('Show results')}</button></footer>
      </div></div>}
      {f.market === 'SA' && <p className="warn row-flex">{t('Saudi Arabia opens soon. You can add Saudi outlets to a campaign plan now; booking opens with the market.')} <Waitlist topic="KSA" label={t("Tell me when KSA opens")} /></p>}
      {error && <p className="error">{error}</p>}
      <div className={`shop ${buying.myBids ? 'with-bids' : ''}`}>
        <div className="shop-main">
          {view === 'outlets' ? <>
            {list && !shown.length && <div className="empty"><p className="muted">{f.saved ? t('No saved outlets match. Tap the star on an outlet to save it.') : t('Nothing matches these filters.')}</p>
              {filtered && <button className="btn" onClick={() => set({ ...EMPTY, market: f.market })}>{t('Clear filters')}</button>}
              <button className="btn" onClick={() => askRef.current?.focus()}>{t('Ask Athena')}</button></div>}
            {layout === 'grid'
              ? <div className="outlet-grid">{shown.map(o => <article key={o.id} className="card outlet-card" onClick={() => navigate(`/directory/${o.slug}`)}>
                  <img className="outlet-cover" src={o.coverUrl ?? art(o.channels[0], 'card')} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = `/brand/${o.channels[0]}-card.jpg` }} width={800} height={250} alt="" loading="lazy" decoding="async" />
                  <div className="row-flex oc-head"><Logo o={o} /><div className="oc-name"><a href={`/directory/${o.slug}`} onClick={e => e.stopPropagation()}><b>{o.name}</b></a>{o.nameAr && <div className="small muted" lang="ar" dir="rtl">{o.nameAr}</div>}</div>
                    <SaveStar b={o} onChange={v => setOne(o.id, v)} /></div>
                  <div className="small muted">{channelsText(o.channels)}{o.sectors.length ? ` · ${o.sectors.slice(0, 3).map(x => t(x)).join(', ')}` : ''}</div>
                  {o.comingSoon ? <span className="badge">{t("Coming soon")}</span>
                    : o.fromPrice != null && o.onNashr ? <span className="oc-price"><span className="small muted">{t('From')}</span> <b className="num">{money(o.fromPrice, o.currency)}</b></span>
                    : null}
                  {o.rating.count > 0 && <Stars value={o.rating.average!} count={o.rating.count} />}
                  {o.comingSoon ? null : o.onNashr ? <a className="badge on" href={availability(o)} onClick={e => { e.stopPropagation(); e.preventDefault(); navigate(availability(o)) }}>{t('Check availability')}</a>
                    : <a className="badge" href={`/directory/${o.slug}`} onClick={e => e.stopPropagation()}>{t("Request a quote")}</a>}
                </article>)}</div>
              : shown.length > 0 && <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Outlet")}</th><th>{t("Media type")}</th><th>{t("Sectors")}</th><th className="r">{t("Starting price")}</th><th /></tr></thead>
                  <tbody>{shown.map(o => <tr key={o.id} onClick={() => navigate(`/directory/${o.slug}`)}>
                    <td><div className="row-flex"><Logo o={o} size={28} /><b>{o.name}</b><SaveStar b={o} onChange={v => setOne(o.id, v)} /></div></td><td className="small">{channelsText(o.channels)}</td>
                    <td className="small">{o.sectors.map(x => t(x)).join(', ')}</td><td className="r num">{o.fromPrice != null && o.onNashr ? t('From {amount}', { amount: money(o.fromPrice, o.currency) }) : '—'}</td>
                    <td className="small">{o.comingSoon ? t("Coming soon") : o.onNashr ? <a href={availability(o)} onClick={e => { e.stopPropagation(); e.preventDefault(); navigate(availability(o)) }}>{t('Check availability')}</a> : t("Request a quote")}</td></tr>)}</tbody></table></div>}
          </> : <>
            {prods.items == null && <p className="muted">{t('Loading…')}</p>}
            {prods.items && <p className="small muted">{t('{n} products', { n: prods.total })}</p>}
            {prods.items && !prods.items.length && <div className="empty"><p className="muted">{filtered ? t('Nothing matches these filters.') : t('Nothing on sale right now.')}</p>
              {filtered && <button className="btn" onClick={() => set({ ...EMPTY, market: f.market })}>{t('Clear filters')}</button>}
              <button className="btn" onClick={() => askRef.current?.focus()}>{t('Ask Athena')}</button></div>}
            {prods.items && prods.items.length > 0 && (layout === 'grid'
              ? <div className="prod-grid">{prods.items.map(p => <ProductCardView key={p.placementId} p={p} layout="grid" guest={guest} onBuy={buying.buy} onSaved={setOne} />)}</div>
              : <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Product')}</th><th>{t('Sale type')}</th><th className="r">{t('Starting price')}</th><th>{t('On sale')}</th><th /></tr></thead>
                  <tbody>{prods.items.map(p => <ProductCardView key={p.placementId} p={p} layout="list" guest={guest} onBuy={buying.buy} />)}</tbody></table></div>)}
            {prods.items && prods.items.length < prods.total && <p className="center"><button className="btn" onClick={prods.loadMore}>{t('Show more')}</button></p>}
          </>}
        </div>
        {buying.myBids}
      </div>
      {buying.ui}
      <CompareBar />
    </main>
  )
}

// ---- Compare: tick 2 or 3 products, from any outlet ----------------------------------------------------------------------
export type CompareItem = { placementId: string; outlet: string; logoUrl: string | null; product: string; channel: string; saleType: string; price: number
  creativeDays: number | null; audience: string | null; sectors?: string[]; reach: number | null; reachUnit: string | null }
const CMP = 'nashr:compare', MAX_COMPARE = 3
let compared: CompareItem[] = (() => { try { return JSON.parse(sessionStorage.getItem(CMP) ?? '[]') } catch { return [] } })()
const cmpSubs = new Set<() => void>()
const setCompared = (next: CompareItem[]) => { compared = next; try { sessionStorage.setItem(CMP, JSON.stringify(next)) } catch { /* fine */ } cmpSubs.forEach(f => f()) }
function useCompare() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n => n + 1); cmpSubs.add(f); return () => { cmpSubs.delete(f) } }, [])
  return compared
}
function CompareTick({ item }: { item: CompareItem }) {
  const list = useCompare(), on = list.some(x => x.placementId === item.placementId), [full, setFull] = useState(false)
  return <span className="cmp-tick"><label className="check small"><input type="checkbox" checked={on} onChange={() => {
    if (on) { setCompared(list.filter(x => x.placementId !== item.placementId)); setFull(false) }
    else if (list.length >= MAX_COMPARE) setFull(true)
    else setCompared([...list, item]) }} /> {t('Compare')}</label>
    {full && <span className="small error" role="alert">{t('You can compare up to 3.')}</span>}</span>
}
function CompareBar() {
  const list = useCompare(), guest = useGuest(), [open, setOpen] = useState(false)
  if (list.length < 1) return null
  return <>
    <div className="cmp-bar" role="region" aria-label={t('Compare')}>
      <span className="small">{list.map(x => x.product).join(' · ')}</span><span className="spacer" />
      <button className="btn" onClick={() => setCompared([])}>{t('Clear')}</button>
      <button className="btn primary" disabled={list.length < 2} onClick={() => setOpen(true)}>{t('Compare ({n})', { n: list.length })}</button></div>
    {open && <div className="scrim" onClick={() => setOpen(false)}><section className="cmp-modal card" role="dialog" aria-label={t('Compare')} onClick={e => e.stopPropagation()}>
      <header className="drawer-h"><h2>{t('Compare')}</h2><button className="btn" onClick={() => setOpen(false)} aria-label={t('Close')}>✕</button></header>
      <div className="table-wrap"><table className="table cmp-table"><tbody>
        <tr><th scope="row">{t('Outlet')}</th>{list.map(x => <td key={x.placementId}><span className="row-flex"><OutletMark name={x.outlet} url={x.logoUrl} size={30} /><b>{x.outlet}</b></span></td>)}</tr>
        <tr><th scope="row">{t('Product')}</th>{list.map(x => <td key={x.placementId}>{x.product}</td>)}</tr>
        <tr><th scope="row">{t('Media type')}</th>{list.map(x => <td key={x.placementId}>{CHANNEL_NAME[x.channel] ?? x.channel}</td>)}</tr>
        <tr><th scope="row">{t('Sale type')}</th>{list.map(x => <td key={x.placementId}><span className="tag"><SaleIcon k={x.saleType} />{saleLabel(x.saleType)}</span></td>)}</tr>
        <tr><th scope="row">{t('Starting price')}</th>{list.map(x => <td key={x.placementId} className="num">{money(x.price)}</td>)}</tr>
        <tr><th scope="row">{t('Creative due')}</th>{list.map(x => <td key={x.placementId}>{x.creativeDays != null ? t('{n} days before it runs', { n: x.creativeDays }) : '—'}</td>)}</tr>
        <tr><th scope="row">{t('Target audience')}</th>{list.map(x => <td key={x.placementId} dir="auto">{x.audience ?? '—'}</td>)}</tr>
        <tr><th scope="row">{t('Sectors accepted')}</th>{list.map(x => <td key={x.placementId}>{x.sectors?.length ? x.sectors.map(v => t(v)).join(sep) : t('All sectors')}</td>)}</tr>
        <tr><th scope="row">{t('Reach')}</th>{list.map(x => <td key={x.placementId} className="num">{x.reach ? x.reach.toLocaleString('en-US') + (x.reachUnit ? ` ${t(x.reachUnit)}` : '') : '—'}</td>)}</tr>
        {!guest && <tr><th scope="row"><span className="sr-only">{t('Add to campaign')}</span></th>{list.map(x => <td key={x.placementId}><AddToCampaign placementId={x.placementId} small /></td>)}</tr>}
      </tbody></table></div>
    </section></div>}
  </>
}

// ---- One outlet: its products grouped by media type ----------------------------------------------------------------------
type Sell = { id: string; kind: string; name: string; days: number[]; saleType: string; startsAt: string | null; endsAt: string | null; price: number; startingPrice: number
  creativeDays: number; openSlots: number; nextAt: string | null; description: string | null }
type BuyerProduct = Omit<SummaryProduct, 'sellable'> & { id: string; description: string | null; coverUrl: string | null; onSale: number; sellable: Sell[] }
type Profile = Brand & { description: string | null; website: string | null; recent: { score: number; comment: string; at: string }[]; products: BuyerProduct[] }

type Tab = 'about' | 'products' | 'calendar'

export function OutletPage({ id }: { id: string }) {
  const guest = useGuest()
  const [o, setO] = useState<Profile | null>(null), [error, setError] = useState('')
  const [message, setMessage] = useState(''), [sent, setSent] = useState(''), [busy, setBusy] = useState(false), [open, setOpen] = useState<string | null>(null)
  // About · Products · Calendar (owner's "Buying moves to the Directory"); the tab and the product picked live in the address
  const [tab, setTabRaw] = useState<Tab>(() => { const v = new URLSearchParams(location.search).get('tab'); return v === 'products' || v === 'calendar' ? v : 'about' })
  const [calProduct, setCalProductRaw] = useState<string | undefined>(() => new URLSearchParams(location.search).get('item') ?? undefined)
  const keep = (k: string, v?: string) => { const q = new URLSearchParams(location.search); v ? q.set(k, v) : q.delete(k); history.replaceState(history.state, '', `${location.pathname}${q.size ? `?${q}` : ''}`) }
  const setTab = (v: Tab) => { setTabRaw(v); keep('tab', v === 'about' ? undefined : v) }
  const setCalProduct = (v?: string) => { setCalProductRaw(v); keep('item', v) }
  const availability = (placement?: string) => { setCalProduct(placement); setTab('calendar'); scrollTo({ top: 0, behavior: 'smooth' }) }
  useEffect(() => { api<Profile>(`/directory/${id}`).then(setO, e => setError(e.message)) }, [id])
  async function quote() {
    setBusy(true); setError('')
    try { await api(`/outlets/${o!.products[0].id}/quote`, { method: 'POST', body: { message } }); setSent(t("Sent. Nashr will come back to you with a quote.")); setMessage('') }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  useMeta(o && {
    title: `${o.name} advertising: ${channelsText(o.channels).toLowerCase()} rates and booking in the UAE | Nashr`,
    description: `Advertise with ${o.name}${o.nameAr ? ` (${o.nameAr})` : ''} in the UAE${o.audience ? `, reaching ${o.audience}` : ''}.${o.fromPrice != null ? ` From ${money(o.fromPrice, o.currency)}.` : ''} ${o.onNashr ? 'See open dates and book online on Nashr.' : 'Request a quote through Nashr.'}`.slice(0, 300),
    path: `/directory/${o.slug}`,
    jsonLd: [breadcrumb([['Nashr', '/'], [t("Directory"), '/directory'], [o.name, `/directory/${o.slug}`]]),
      { '@context': 'https://schema.org', '@type': 'Organization', name: o.name, ...(o.nameAr ? { alternateName: o.nameAr } : {}), ...(o.website ? { url: o.website } : {}), ...(o.description ? { description: o.description } : {}) }],
  }, [o])
  if (!o) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const groups = [...new Set(o.products.map(p => p.channel))]
  const cmp = (p: BuyerProduct, s: Sell): CompareItem => ({ placementId: s.id, outlet: o.name, logoUrl: o.logoUrl, product: s.kind === 'main' ? p.name : `${p.name} · ${s.name}`, channel: p.channel,
    saleType: s.saleType, price: s.price, creativeDays: s.creativeDays, audience: p.audience, sectors: p.sectors ?? [], reach: p.reach, reachUnit: p.reachUnit })
  const quoteOnly = !o.onNashr && !o.comingSoon
  const shown: Tab = quoteOnly ? 'about' : tab
  const sellable = o.products.flatMap(p => p.sellable.map(x => ({ id: x.id, name: x.kind === 'main' ? p.name : `${p.name} · ${x.name}` })))
  const TABS: [Tab, string][] = [['about', t('About')], ['products', t('Products')], ['calendar', t('Calendar')]]
  return (
    <main className="narrow wide">
      <p className="small"><a href="/directory">{t("Directory")}</a> {isAr ? '‹' : '›'} {o.name}</p>
      <div className="profile-cover" aria-hidden><img src={o.coverUrl ?? art(o.channels[0])} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = `/brand/${o.channels[0]}-wide.jpg` }} width={1600} height={500} alt="" decoding="async" /></div>
      <div className="profile-h">
        <Logo o={o} size={64} />
        <div><h1>{o.name}</h1>{o.nameAr && <p className="profile-ar" lang="ar" dir="rtl">{o.nameAr}</p>}
          <p className="muted">{channelsText(o.channels)}{o.sectors.length ? ` · ${o.sectors.slice(0, 4).map(x => t(x)).join(', ')}` : ''}</p>
          {o.rating.count > 0 && <Stars value={o.rating.average!} count={o.rating.count} size={16} />}</div>
        <div className="spacer" />
        <SaveStar b={o} onChange={v => setO({ ...o, saved: v })} />
        {o.comingSoon && <Waitlist topic="KSA" label={t("Tell me when KSA opens")} />}
      </div>
      {o.comingSoon && <p className="warn">{t("Coming soon: this market is not open yet. You can plan it in a campaign; booking opens with the market.")}</p>}
      {!quoteOnly && <div className="tabs profile-tabs" role="tablist" aria-label={o.name}>{TABS.map(([k, l]) =>
        <button key={k} type="button" role="tab" aria-selected={shown === k} className={shown === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}

      {shown === 'about' && <>
      {!(o.description || o.website || quoteOnly) && <p className="muted">{t('{name} has not added a description yet.', { name: o.name })}</p>}
      {(o.description || o.website || quoteOnly) && <div className="cols">
        {(o.description || o.website) && <section className="card pad">
          {o.description && <p dir="auto">{o.description}</p>}
          {o.website && <p className="small"><a href={o.website} target="_blank" rel="noreferrer noopener">{o.website.replace(/^https?:\/\//, '')}</a></p>}
        </section>}
        {quoteOnly && <section className="card pad form">
          <h3>{t('Request a quote')}</h3>
          <p className="small muted">{t("This outlet isn't on Nashr yet. Tell us what you need and Nashr's team will get you a price.")}</p>
          {guest ? <SignInPrompt to="request a quote" compact /> : <>
          <div className="field"><label htmlFor="q">{t("What you'd like to book")}</label><textarea id="q" rows={4} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder={t("Dates, formats, budget")} /></div>
          <span className="small muted">{t("Emails and phone numbers are not allowed.")}</span>
          {error && <p className="error" role="alert">{error}</p>}
          {sent && <p className="ok" role="status">{sent}</p>}
          <button className="btn primary" disabled={busy || !message.trim()} onClick={quote}>{t("Send request")}</button></>}
        </section>}
      </div>}

      {o.recent.length > 0 && <section className="section reviews"><h2 className="sec-h">{t("What buyers say")}</h2>
        <ul className="review-list">{o.recent.map((r, i) => <li key={i} className="card pad"><Stars value={r.score} /><p>“{r.comment}”</p>
          <span className="small muted">{t('Verified booking')} · {new Date(r.at).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}</span></li>)}</ul></section>}
      </>}

      {shown === 'products' && <>
        {groups.map(c => <section key={c} className="pr-group">
          <h3 className="pr-gh"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[c] ?? ICON.digital} /></svg>{CHANNEL_NAME[c] ?? c}</h3>
          {o.products.filter(p => p.channel === c).map(p => { const one = p.sellable.length === 1 ? p.sellable[0] : undefined, isOpen = open === p.id
            return <article key={p.id} className={`card dp-row ${isOpen ? 'open' : ''}`}>
              <div className="dp-main">
                <button type="button" className="dp-open" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                  <img className="dp-cover" src={p.coverUrl ?? art(p.channel, 'card')} alt="" width={96} height={60} loading="lazy" />
                  <span className="dp-what"><b dir="auto">{p.name}</b>{p.description && <span className="small muted dp-desc" dir="auto">{p.description}</span>}
                    <span className="small muted">{mediaName(p)}{p.onSale > 0 ? ` · ${t('{n} on sale', { n: p.onSale })}` : ` · ${t('Nothing on sale now')}`}</span></span></button>
                <span className="dp-price num">{p.defaultPrice != null ? money(p.defaultPrice) : '—'}<small>{t('Starting price')}</small></span>
                <span className="dp-acts">
                  {one && !guest && <AddToCampaign placementId={one.id} small />}
                  {p.onSale > 0 && <button type="button" className="btn sm" onClick={() => availability(one?.id)}>{t('Check availability')}</button>}
                  {one && <CompareTick item={cmp(p, one)} />}</span>
              </div>
              {!one && p.sellable.length > 0 && <ul className="dp-items">{p.sellable.map(s => <li key={s.id}>
                <span><b dir="auto">{s.name}</b><span className="small muted">{[s.days?.length ? daysText(s.days) : '', s.startsAt ? `${s.startsAt}–${s.endsAt ?? ''}` : '', saleLabel(s.saleType), s.openSlots ? t('{n} on sale', { n: s.openSlots }) : ''].filter(Boolean).join(' · ')}</span></span>
                <span className="num">{money(s.price)}</span>
                <span className="dp-acts">{!guest && <AddToCampaign placementId={s.id} small />}{s.openSlots > 0 && <button type="button" className="btn sm" onClick={() => availability(s.id)}>{t('Check availability')}</button>}<CompareTick item={cmp(p, s)} /></span>
              </li>)}</ul>}
              {isOpen && <ProductSummary m={p} buyer />}
            </article> })}
        </section>)}
      </>}

      {shown === 'calendar' && <OutletCalendar outlet={o.id} products={sellable} product={calProduct} onProduct={setCalProduct} />}
      <CompareBar />
    </main>
  )
}
