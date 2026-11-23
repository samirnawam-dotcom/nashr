import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { money, slotWhen } from '../format'
import { navigate } from '../nav'
import { useGuest } from '../guest'
import { t } from '../i18n'
import { CHANNEL_NAME, CHANNELS } from '../media'
import { INDUSTRIES } from '../industries'
import { DAYPARTS, type Daypart, type SlotFilter } from '../../../server/shared/slot-filter'
import { Popover, SaleIcon, saleLabel, useNarrow, SALE_TYPES } from '../calendar/CalendarPage'
import { BidDrawer } from '../calendar/BidDrawer'
import { CampaignDrawer, setCurrentCampaign, useCampaigns, useCurrentCampaign } from '../calendar/CampaignDrawer'
import { MyBids } from '../calendar/MyBids'
import { SavedSearches } from '../calendar/SavedSearches'
import { AddToCampaign } from '../campaigns/AddToCampaign'
import { OutletMark } from '../LogoPicker'

/*
 * The Directory as the shop (owner's "Buying moves to the Directory"): find outlets and products, filter, and buy from here.
 * Outlets view starts with the brand; Products view is for buyers who know what they want ("a radio spot in the morning").
 * One bar for search, one row of filters on show (Media type, Sale type, Price), the rest under More filters, and every filter
 * in use as a chip with an ×. The state lives in the address, so a saved-filter alert or a campaign's "+ Add products" opens
 * the Directory already filtered.
 */

export type ShopFilter = { q: string; channel: string; sale: string[]; min: string; max: string; sectors: string[]; dateFrom: string; dateTo: string
  reachMin: string; reachMax: string; reachOnly: boolean; dp: string[]; saved: boolean; nashr: boolean; market: 'AE' | 'SA' }
export type ShopSort = 'popular' | 'price_asc' | 'price_desc' | 'closing' | 'newest'
export type ProductCard = { placementId: string; title: string; product: string | null; brand: string; brandKey: string; slug: string; logoUrl: string | null
  channel: string; channelOther: string | null; saleType: string; price: number; buyNowPrice: number | null; onSale: number; nextAt: string; nextClosesAt: string
  reach: number | null; reachUnit: string | null; reachMatch: 'in' | 'close' | 'none' | null; saved: boolean }

export const EMPTY: ShopFilter = { q: '', channel: '', sale: [], min: '', max: '', sectors: [], dateFrom: '', dateTo: '', reachMin: '', reachMax: '', reachOnly: false,
  dp: [], saved: false, nashr: false, market: 'AE' }
const list = (v: string | null) => v ? v.split(',').filter(Boolean) : []
const toFils = (v: string) => v.trim() === '' ? undefined : Math.round(Number(v.replace(/,/g, '')) * 100)
const toNum = (v: string) => v.trim() === '' ? undefined : Math.round(Number(v.replace(/,/g, '')))

export function readFilter(p: URLSearchParams): ShopFilter {
  return { q: p.get('q') ?? '', channel: p.get('channel') ?? p.get('ch') ?? '', sale: list(p.get('sale')), min: p.get('min') ?? '', max: p.get('max') ?? '',
    sectors: list(p.get('sectors')), dateFrom: p.get('df') ?? '', dateTo: p.get('dt') ?? '', reachMin: p.get('rmin') ?? '', reachMax: p.get('rmax') ?? '',
    reachOnly: p.get('ronly') === '1', dp: list(p.get('dp')), saved: p.get('saved') === '1', nashr: p.get('nashr') === '1', market: p.get('market') === 'SA' ? 'SA' : 'AE' }
}
function writeFilter(f: ShopFilter, extra: Record<string, string>) {
  const p = new URLSearchParams()
  const set = (k: string, v: string | boolean | string[]) => { const s = Array.isArray(v) ? v.join(',') : v === true ? '1' : v === false ? '' : v; if (s) p.set(k, s) }
  set('q', f.q); set('channel', f.channel); set('sale', f.sale); set('min', f.min); set('max', f.max); set('sectors', f.sectors); set('df', f.dateFrom); set('dt', f.dateTo)
  set('rmin', f.reachMin); set('rmax', f.reachMax); set('ronly', f.reachOnly); set('dp', f.dp); set('saved', f.saved); set('nashr', f.nashr); if (f.market === 'SA') p.set('market', 'SA')
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
  const qs = p.toString(); history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}`)
}
/** The Directory's filters as a saved filter (Saved filters, and their alerts) and back. */
export function toSlotFilter(f: ShopFilter): SlotFilter {
  const o: SlotFilter = {}
  if (f.channel) o.channels = [f.channel]
  if (f.sale.length) o.saleTypes = f.sale
  if (f.sectors.length) o.sectors = f.sectors
  if (toFils(f.min) != null) o.minPrice = toFils(f.min); if (toFils(f.max) != null) o.maxPrice = toFils(f.max)
  if (f.dp.length) o.dayparts = f.dp as Daypart[]
  if (f.q.trim()) o.q = f.q.trim()
  if (f.dateFrom) o.dateFrom = f.dateFrom; if (f.dateTo) o.dateTo = f.dateTo
  if (toNum(f.reachMin) != null) o.reachMin = toNum(f.reachMin); if (toNum(f.reachMax) != null) o.reachMax = toNum(f.reachMax)
  if (f.reachOnly) o.reachOnly = true
  return o
}
function fromSlotFilter(s: SlotFilter, base: ShopFilter): ShopFilter {
  return { ...base, q: s.q ?? '', channel: s.channels?.[0] ?? '', sale: s.saleTypes ?? [], sectors: s.sectors ?? (s.sector ? [s.sector] : []),
    min: s.minPrice != null ? String(s.minPrice / 100) : '', max: s.maxPrice != null ? String(s.maxPrice / 100) : '', dp: s.dayparts ?? [],
    dateFrom: s.dateFrom ?? '', dateTo: s.dateTo ?? '', reachMin: s.reachMin != null ? String(s.reachMin) : '', reachMax: s.reachMax != null ? String(s.reachMax) : '', reachOnly: !!s.reachOnly }
}
/** The query string for /api/directory/products. */
export function productQuery(f: ShopFilter, sort: ShopSort, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams()
  const set = (k: string, v: unknown) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length) && v !== false) p.set(k, Array.isArray(v) ? v.join(',') : v === true ? '1' : String(v)) }
  set('q', f.q.trim()); set('ch', f.channel); set('sale', f.sale); set('min', toFils(f.min)); set('max', toFils(f.max)); set('sectors', f.sectors)
  set('dateFrom', f.dateFrom); set('dateTo', f.dateTo); set('reachMin', toNum(f.reachMin)); set('reachMax', toNum(f.reachMax)); set('reachOnly', f.reachOnly)
  set('dp', f.dp); set('saved', f.saved); set('market', f.market); set('sort', sort)
  for (const [k, v] of Object.entries(extra)) set(k, v)
  return p.toString()
}
/** Filters that only products carry (the outlet cards cannot tell on their own): when one is set, the Outlets view asks the server. */
export const shopping = (f: ShopFilter) => !!(f.sale.length || f.sectors.length || f.dateFrom || f.dateTo || f.reachMin || f.reachMax || f.reachOnly || f.dp.length)

/** The button says what will happen (owner's doc): Bid (auction), Buy (fixed price), Make an offer (quick sale). */
export const verb = (saleType: string) => saleType === 'auction' ? t('Bid') : saleType === 'fixed' ? t('Buy') : t('Make an offer')

// ---- the top of the page ----------------------------------------------------------------------------------------------------
export function ShopFilters({ f, set, guest, view }: { f: ShopFilter; set: (p: Partial<ShopFilter>) => void; guest: boolean; view: 'outlets' | 'products' }) {
  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  const more = (f.sectors.length ? 1 : 0) + (f.dateFrom || f.dateTo ? 1 : 0) + (f.reachMin || f.reachMax || f.reachOnly ? 1 : 0) + (f.dp.length ? 1 : 0)
  return <>
    <div className="dir-row"><span className="dir-label">{t('Media type:')}</span>
      <div className="seg" role="group" aria-label={t('Media type')}>
        <button className={!f.channel ? 'on' : ''} onClick={() => set({ channel: '' })}>{t('All')}</button>
        {CHANNELS.map(c => <button key={c} className={f.channel === c ? 'on' : ''} onClick={() => set({ channel: c })}>{CHANNEL_NAME[c]}</button>)}</div></div>
    <div className="dir-row">
      <span className="dir-label">{t('Sale type:')}</span>
      <span className="row-flex sale-chips" role="group" aria-label={t('Sale type')}>{SALE_TYPES.map(k =>
        <button key={k} type="button" className={`chipf ${f.sale.includes(k) ? 'on' : ''}`} aria-pressed={f.sale.includes(k)} onClick={() => set({ sale: toggle(f.sale, k) })}>
          <SaleIcon k={k} />{saleLabel(k)}</button>)}</span>
      <span className="dir-label">{t('Price:')}</span>
      <span className="dir-range"><input className="search" inputMode="decimal" aria-label={t('AED from')} placeholder={t('AED from')} value={f.min} onChange={e => set({ min: e.target.value.replace(/[^\d.,]/g, '') })} />
        <span aria-hidden>–</span><input className="search" inputMode="decimal" aria-label={t('to')} placeholder={t('to')} value={f.max} onChange={e => set({ max: e.target.value.replace(/[^\d.,]/g, '') })} /></span>
      <Popover label={<>{t('More filters')}{more > 0 && <span className="count">{more}</span>}</>} on={more > 0} wide align="end">
        <MoreFilters f={f} set={set} guest={guest} />
      </Popover>
      {!guest && <label className="check"><input type="checkbox" checked={f.saved} onChange={e => set({ saved: e.target.checked })} /> {t('Saved outlets')}</label>}
      {view === 'outlets' && <label className="check"><input type="checkbox" checked={f.nashr} onChange={e => set({ nashr: e.target.checked })} /> {t('On Nashr only')}</label>}
      <div className="seg" role="group" aria-label={t('Market')}><button className={f.market === 'AE' ? 'on' : ''} onClick={() => set({ market: 'AE' })}>{t('UAE')}</button>
        <button className={f.market === 'SA' ? 'on' : ''} onClick={() => set({ market: 'SA' })}>{t('KSA · coming soon')}</button></div>
    </div>
    <Chips f={f} set={set} />
  </>
}

function MoreFilters({ f, set, guest }: { f: ShopFilter; set: (p: Partial<ShopFilter>) => void; guest: boolean }) {
  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  return <div className="more-filters">
    <fieldset><legend>{t('Sectors')}</legend>
      <p className="small muted">{t('Products that take ads from any of these. Products open to all sectors always show.')}</p>
      <div className="cv-checks two">{INDUSTRIES.filter(x => x !== 'Other').map(s => <label key={s} className="check"><input type="checkbox" checked={f.sectors.includes(s)} onChange={() => set({ sectors: toggle(f.sectors, s) })} />{t(s)}</label>)}</div>
    </fieldset>
    <fieldset><legend>{t('Dates')}</legend>
      <p className="small muted">{t('On sale between')}</p>
      <span className="dir-range"><input className="search" type="date" aria-label={t('From date')} value={f.dateFrom} onChange={e => set({ dateFrom: e.target.value })} />
        <span aria-hidden>–</span><input className="search" type="date" aria-label={t('To date')} value={f.dateTo} min={f.dateFrom || undefined} onChange={e => set({ dateTo: e.target.value })} /></span>
    </fieldset>
    <fieldset><legend>{t('Reach')}</legend>
      <span className="dir-range"><input className="search" inputMode="numeric" aria-label={t('Reach from')} placeholder={t('Reach from')} value={f.reachMin} onChange={e => set({ reachMin: e.target.value.replace(/[^\d,]/g, '') })} />
        <span aria-hidden>–</span><input className="search" inputMode="numeric" aria-label={t('Reach to')} placeholder={t('to')} value={f.reachMax} onChange={e => set({ reachMax: e.target.value.replace(/[^\d,]/g, '') })} /></span>
      <label className="check"><input type="checkbox" checked={f.reachOnly} onChange={e => set({ reachOnly: e.target.checked })} />{t('Only show products with reach')}</label>
      <p className="small muted">{t('Also shows close matches: within 2,000 or 2% of the number you type.')}</p>
    </fieldset>
    <fieldset><legend>{t('Time of day')}</legend><p className="small muted">{t('Radio and TV only.')}</p>
      <div className="cv-checks">{DAYPARTS.filter(([v]) => v !== 'allday').map(([v, l]) => <label key={v} className="check"><input type="checkbox" checked={f.dp.includes(v)} onChange={() => set({ dp: toggle(f.dp, v) })} />{t(l)}</label>)}</div>
    </fieldset>
    {!guest && <SavedSearches filter={toSlotFilter(f)} active={Object.keys(toSlotFilter(f)).length} names={CHANNEL_NAME} onApply={s => set(fromSlotFilter(s, f))} />}
  </div>
}

/** Every filter in use, as a small chip with an × to remove it, and Clear all. */
function Chips({ f, set }: { f: ShopFilter; set: (p: Partial<ShopFilter>) => void }) {
  const chips: [string, Partial<ShopFilter>][] = []
  if (f.channel) chips.push([`${t('Media type')}: ${CHANNEL_NAME[f.channel] ?? f.channel}`, { channel: '' }])
  if (f.sale.length) chips.push([`${t('Sale type')}: ${f.sale.map(saleLabel).join(', ')}`, { sale: [] }])
  if (f.min || f.max) chips.push([`${t('Price')}: ${f.min ? `AED ${f.min}` : '…'} – ${f.max ? `AED ${f.max}` : '…'}`, { min: '', max: '' }])
  for (const s of f.sectors) chips.push([`${t('Sector')}: ${t(s)}`, { sectors: f.sectors.filter(x => x !== s) }])
  if (f.dateFrom || f.dateTo) chips.push([`${t('Dates')}: ${f.dateFrom || '…'} – ${f.dateTo || '…'}`, { dateFrom: '', dateTo: '' }])
  if (f.reachMin || f.reachMax) chips.push([`${t('Reach')}: ${f.reachMin || '…'} – ${f.reachMax || '…'}`, { reachMin: '', reachMax: '' }])
  if (f.reachOnly) chips.push([t('Only with reach'), { reachOnly: false }])
  for (const d of f.dp) chips.push([t((DAYPARTS.find(x => x[0] === d) ?? [d, d])[1]), { dp: f.dp.filter(x => x !== d) }])
  if (f.saved) chips.push([t('Saved outlets'), { saved: false }])
  if (f.nashr) chips.push([t('On Nashr only'), { nashr: false }])
  if (!chips.length) return null
  return <div className="filter-chips" aria-label={t('Filters in use')}>
    {chips.map(([label, clear]) => <span key={label} className="fchip">{label}<button type="button" aria-label={t('Remove {name}', { name: label })} onClick={() => set(clear)}>×</button></span>)}
    <button type="button" className="text-link small" onClick={() => set({ ...EMPTY, q: f.q, market: f.market })}>{t('Clear all')}</button>
  </div>
}

// ---- Products view ----------------------------------------------------------------------------------------------------------
export function ProductCardView({ p, onBuy, guest, onSaved, layout }: { p: ProductCard; onBuy: (p: ProductCard) => void; guest: boolean; onSaved?: (key: string, v: boolean) => void; layout: 'grid' | 'list' }) {
  const priceLabel = p.saleType === 'fixed' ? t('Price') : t('Starting price')
  const next = slotWhen(p.nextAt, p.channel)
  const reachTag = p.reachMatch === 'close' ? <span className="badge">{t('Close match')}</span> : p.reachMatch === 'none' ? <span className="badge muted">{t('Reach not given')}</span> : null
  const media = p.channel === 'other' && p.channelOther ? p.channelOther : CHANNEL_NAME[p.channel] ?? p.channel
  const actions = <span className="prod-acts">
    <button type="button" className="btn sm primary" onClick={() => onBuy(p)}>{verb(p.saleType)}</button>
    {!guest && <AddToCampaign placementId={p.placementId} small />}</span>
  if (layout === 'list') return <tr>
    <td><span className="row-flex"><OutletMark name={p.brand} url={p.logoUrl} size={28} /><span><b dir="auto">{p.title}</b><span className="small muted d-block">{media}</span></span></span></td>
    <td><span className="tag"><SaleIcon k={p.saleType} />{saleLabel(p.saleType)}</span></td>
    <td className="r num">{money(p.price)}</td><td className="small">{t('{n} on sale', { n: p.onSale })} · {next}{reachTag && <> {reachTag}</>}</td><td>{actions}</td></tr>
  return <article className="card prod-card">
    <div className="row-flex pc-head"><OutletMark name={p.brand} url={p.logoUrl} size={40} />
      <div className="pc-name"><a href={`/directory/${p.slug}`}><b dir="auto">{p.title}</b></a><span className="small muted">{media} · <bdi>{p.brand}</bdi></span></div>
      {!guest && onSaved && <ShopStar brandKey={p.brandKey} name={p.brand} saved={p.saved} onChange={v => onSaved(p.brandKey, v)} />}</div>
    <div className="row-flex pc-tags"><span className="tag"><SaleIcon k={p.saleType} />{saleLabel(p.saleType)}</span>
      {p.buyNowPrice != null && <span className="tag">{t('Buy now {amount}', { amount: money(p.buyNowPrice) })}</span>}{reachTag}</div>
    <div className="pc-price"><span className="small muted">{priceLabel}</span><b className="num">{money(p.price)}</b></div>
    <span className="small muted">{t('{n} on sale', { n: p.onSale })} · {t('next: {when}', { when: next })}</span>
    {actions}
  </article>
}

/** The star saves the outlet (Saved outlets), wherever it shows. */
export function ShopStar({ brandKey, name, saved, onChange }: { brandKey: string; name: string; saved: boolean; onChange: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  return <button type="button" className={`star-btn ${saved ? 'on' : ''}`} aria-pressed={saved} disabled={busy}
    aria-label={saved ? t('Remove {name} from saved', { name }) : t('Save {name}', { name })} title={saved ? t('Saved') : t('Save')}
    onClick={async e => { e.preventDefault(); e.stopPropagation(); setBusy(true)
      try { const r = await api<{ saved: boolean }>(`/directory/${brandKey}/saved`, { method: saved ? 'DELETE' : 'PUT' }); onChange(r.saved) } finally { setBusy(false) } }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
  </button>
}

type DateLine = { id: string; label: string | null; kind: string; saleType: string; startsAt: string; endsAt: string | null; closesAt: string; price: number; buyNowPrice: number | null; timed: boolean }
/** The dates on sale for one product: pick a date, then the bid drawer opens for that listing. */
export function DatesPanel({ placementId, title, onPick, onClose }: { placementId: string; title: string; onPick: (slotId: string) => void; onClose: () => void }) {
  const [lines, setLines] = useState<DateLine[] | null>(null), [error, setError] = useState('')
  useEffect(() => { api<DateLine[]>(`/directory/products/${placementId}/dates`).then(setLines, e => setError(e.message)) }, [placementId])
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc) }, [])
  const closes = (iso: string) => { const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000)); return h < 48 ? t('Closes in {h}h', { h }) : null }
  return <div className="scrim" onClick={onClose}><section className="card dates-panel" role="dialog" aria-label={t('Dates on sale')} onClick={e => e.stopPropagation()}>
    <header className="drawer-h"><div><h2>{t('Pick a date')}</h2><p className="small muted" dir="auto">{title}</p></div><button className="btn" onClick={onClose} aria-label={t('Close')}>✕</button></header>
    {error && <p className="error">{error}</p>}
    {!lines && !error && <p className="muted">{t('Loading…')}</p>}
    {lines && !lines.length && <p className="muted">{t('Nothing on sale for this product right now.')}</p>}
    {lines && lines.length > 0 && <ul className="date-lines">{lines.map(l => <li key={l.id}><button type="button" onClick={() => onPick(l.id)}>
      <b>{slotWhen(l.startsAt, l.timed ? 'radio' : 'digital')}</b>{l.label && <span className="small muted">{l.label}</span>}
      <span className="num">{money(l.price)}</span><span className="tag"><SaleIcon k={l.saleType} />{saleLabel(l.saleType)}</span>
      {closes(l.closesAt) && <span className="badge warn">{closes(l.closesAt)}</span>}</button></li>)}</ul>}
  </section></div>
}

// ---- the page ---------------------------------------------------------------------------------------------------------------
export function useShop() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const [f, setF] = useState<ShopFilter>(() => readFilter(params))
  const [view, setView] = useState<'outlets' | 'products'>(() => params.get('view') === 'products' ? 'products' : 'outlets')
  const [sort, setSort] = useState<ShopSort>(() => (['popular', 'price_asc', 'price_desc', 'closing', 'newest'] as ShopSort[]).find(x => x === params.get('sort')) ?? 'popular')
  const [layout, setLayout] = useState<'grid' | 'list'>(() => { try { return (localStorage.getItem('nashr:dir-view') as any) || 'grid' } catch { return 'grid' } })
  useEffect(() => { try { localStorage.setItem('nashr:dir-view', layout) } catch { /* fine */ } }, [layout])
  useEffect(() => { writeFilter(f, { view: view === 'products' ? 'products' : '', sort: sort === 'popular' ? '' : sort, campaign: params.get('campaign') ?? '', search: params.get('search') ?? '' }) }, [f, view, sort])
  const set = (p: Partial<ShopFilter>) => setF(x => ({ ...x, ...p }))
  return { f, set, view, setView, sort, setSort, layout, setLayout, params }
}

/** Products, filtered and sorted on the server, a page at a time; and the outlets with a matching product. */
export function useProducts(f: ShopFilter, sort: ShopSort, enabled: boolean, reload: number) {
  const [items, setItems] = useState<ProductCard[] | null>(null), [total, setTotal] = useState(0), [brands, setBrands] = useState<Set<string> | null>(null)
  const [more, setMore] = useState(0), seq = useRef(0)
  const qs = productQuery(f, sort)
  useEffect(() => { setMore(0) }, [qs])
  useEffect(() => {
    if (!enabled) return
    const n = ++seq.current
    const timer = setTimeout(() => api<{ total: number; brands: string[]; items: ProductCard[] }>(`/directory/products?${productQuery(f, sort, { limit: 60 * (more + 1) })}`).then(r => {
      if (n !== seq.current) return
      setItems(r.items); setTotal(r.total); setBrands(new Set(r.brands))
    }, () => { if (n === seq.current) { setItems([]); setTotal(0); setBrands(new Set()) } }), 200) // typing: wait for a pause
    return () => clearTimeout(timer)
  }, [qs, more, enabled, reload])
  const setSaved = (key: string, v: boolean) => setItems(l => l && l.map(x => x.brandKey === key ? { ...x, saved: v } : x))
  return { items, total, brands, loadMore: () => setMore(m => m + 1), setSaved }
}

/** Buying from the shop: the dates panel, then the bid drawer; the Campaign drawer; and My bids beside the results. */
export function useBuying() {
  const guest = useGuest(), narrow = useNarrow()
  const [pick, setPick] = useState<{ placementId: string; title: string } | null>(null), [slot, setSlot] = useState<string | null>(null)
  const [campaignOpen, setCampaignOpen] = useState(false), [reload, setReload] = useState(0)
  const ui = <>
    {pick && <DatesPanel placementId={pick.placementId} title={pick.title} onClose={() => setPick(null)} onPick={id => { setPick(null); setSlot(id) }} />}
    {slot && <BidDrawer slotId={slot} onClose={() => setSlot(null)} onDone={() => setReload(r => r + 1)} />}
    {campaignOpen && <CampaignDrawer onClose={() => setCampaignOpen(false)} onSeeDates={(placementId, title) => { setCampaignOpen(false); setPick({ placementId, title }) }} />}
  </>
  const myBids = guest ? null : <MyBids folded narrow={narrow} reload={reload} onOpen={setSlot} />
  return { guest, ui, myBids, reload, buy: (p: { placementId: string; title: string }) => setPick(p), openSlot: setSlot, openCampaign: () => setCampaignOpen(true) }
}

/** The Campaign button: the campaign being shopped for (what's added, estimated total, budget left) opens in the Campaign drawer. */
export function CampaignButton({ onOpen }: { onOpen: () => void }) {
  const [id] = useCurrentCampaign(), { list } = useCampaigns(true), c = list.find(x => x.id === id)
  return <button type="button" className="btn" onClick={onOpen} title={c ? c.name : undefined}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 22V4M4 4h12l-2 4 2 4H4" /></svg>
    {c ? <bdi className="cb-name">{c.name}</bdi> : t('Campaign')}</button>
}

export { setCurrentCampaign, navigate }
