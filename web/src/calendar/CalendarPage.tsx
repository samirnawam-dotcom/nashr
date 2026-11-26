import { useEffect, useRef, useState } from 'react'
import { usePop } from '../Pop'
import { Modal } from '../Modal'
import { api, type Slot } from '../api'
import { closesIn, dayLabel, hasTime, money, time } from '../format'
import { OutletMark } from '../LogoPicker'
import { addDays, dubai, monthGrid, todayInDubai, weekOf } from './layout'
import { BidDrawer } from './BidDrawer'
import { useLive } from '../live'
import { useGuest } from '../guest'
import { type SlotFilter } from '../../../server/shared/slot-filter'
import { sep, t } from '../i18n'
import { tm } from '../i18n-server'
import './calendar.css'
import './tracker.css'
import { CHANNELS, CHANNEL_NAME, ICON } from '../media'
import { MyBids } from './MyBids'
export { CHANNELS, CHANNEL_NAME }

/*
 * The buyer-side calendar pieces. Shopping moved to the Directory (owner's "Buying moves to the Directory"): what is left here is an
 * outlet's Calendar tab (OutletCalendar: the seller's layout, one outlet), the shared sale-type words and icons, and small helpers.
 * The buyer's own Calendar page is the tracker (Tracker.tsx).
 */

type View = 'list' | 'day' | 'week' | 'month' | 'outlets'
type Sort = 'time' | 'price_asc' | 'price_desc' | 'closing' | 'bids' | 'popular'
type OSort = 'popular' | 'price' | 'price_desc' | 'closing' | 'name' | 'slots'
type DayTotal = { date: string; slots: number; outlets: number; fromPrice: number; channels: string[] }
// product and campaign narrow the calendar to one product or one campaign's products ("Check availability")
type State = { view: View; date: string; f: SlotFilter; mine: boolean; all: boolean; sort: Sort; osort: OSort; product?: string; item?: string; productName?: string; campaign?: string; fit?: number }

// owner's buyer-side fixes, round 2: Day, Week and Month, one layout (outlet rows with their products); Week is the default
const VIEWS: [View, string, string][] = [['day', t('Day'), 'd'], ['week', t('Week'), 'w'], ['month', t('Month'), 'm']]
const SORTS: [Sort, string][] = [['time', t('Air time')], ['closing', t('Closing soonest')], ['price_asc', t('Price: low to high')], ['price_desc', t('Price: high to low')], ['bids', t('Most bids')]]
const LIST_DAYS = 28, PAGE = 50, ROW_PAGE = 30

export const Gavel = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8" /></svg>
export const Bolt = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
export const Tag = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01" /></svg>
/** The clock time of a slot, for media that have one (radio, TV); nothing for the rest, which are sold by the date alone. */
export const clock = (r: { channel: string; startsAt: string; endsAt: string | null }) => !hasTime(r.channel) ? '' : r.endsAt || dubai(r.startsAt).minutes ? time(r.startsAt) : t('All day')
/** The three ways a slot is sold, with one label and one icon each, used everywhere (SPEC 12.1). */
export const SALE_TYPES = ['auction', 'quick_sale', 'fixed'] as const
export const SaleIcon = ({ k }: { k: string }) => k === 'auction' ? <Gavel /> : k === 'fixed' ? <Tag /> : <Bolt />
export const saleLabel = (k: string) => k === 'auction' ? t('Auction') : k === 'fixed' ? t('Fixed price') : t('Quick sale')
export const SaleType = ({ t: kind }: { t: Slot['saleType'] }) => <span className="tag"><SaleIcon k={kind} />{saleLabel(kind)}</span>
/** The channel's colour and icon: colour helps the eye, the icon and the name carry the meaning (never colour alone). */
export const ChannelMark = ({ c, label }: { c: string; label?: boolean }) => <span className={`ch ch-${c}`}>
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d={ICON[c] ?? ICON.digital} /></svg>
  {label ? CHANNEL_NAME[c] ?? c : <span className="visually-hidden">{CHANNEL_NAME[c] ?? c}</span>}</span>

/** One status line per slot: you lead, outbid, closing soon, or the bid count. */
export function status(s: Slot) {
  if (!s.available) return <span className="muted">{t('Not available')}</span>
  if (s.youLead) return <span className="dot lead">{t('You lead')}</span>
  if (s.youBid && s.saleType === 'quick_sale') return <span className="dot soon">{t('Interest sent')}</span>
  if (s.saleType === 'fixed') return <span className="muted">{t('Book now')}</span>
  if (s.youBid && s.topBid) return <span className="dot outbid">{t('Outbid')}</span>
  const soon = s.saleType === 'auction' && closesIn(s.closesAt)
  if (soon) return <span className="on-air">{soon}</span>
  return <span className="muted">{s.saleType === 'quick_sale' ? (s.bids ? t('{n} interested', { n: s.bids }) : t('Open to offers')) : s.bids ? t('{n} bids', { n: s.bids }) : t('Starting price')}</span>
}

/** The query string the server's calendar search reads (marketplace/search.ts parseQuery). */
function query(s: State, from: string, to: string, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams({ from: `${from}T00:00:00+04:00`, to: `${to}T00:00:00+04:00` })
  const f = s.f
  if (f.channels?.length) p.set('ch', f.channels.join(',')); if (f.saleTypes?.length) p.set('sale', f.saleTypes.join(','))
  if (f.sector) p.set('sector', f.sector); if (f.minPrice != null) p.set('min', String(f.minPrice))
  // "Fits my budget": nothing priced above what is left in the chosen campaign
  const max = f.maxPrice != null && s.fit != null ? Math.min(f.maxPrice, s.fit) : f.maxPrice ?? s.fit
  if (max != null) p.set('max', String(max)); if (f.dayparts?.length) p.set('dp', f.dayparts.join(','))
  if (f.q?.trim()) p.set('q', f.q.trim()); if (f.closingWithinHours != null) p.set('soon', String(f.closingWithinHours)); if (f.audiences?.length) p.set('aud', f.audiences.join(','))
  if (s.mine) p.set('mine', '1'); if (!s.all) p.set('open', '1')
  if (s.product) p.set('outlet', s.product); if (s.item) p.set('placement', s.item); if (s.campaign) p.set('campaign', s.campaign)
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v))
  return p.toString()
}
/** The days a view covers. */
function span(view: View, date: string, narrow: boolean): [string, string] {
  if (view === 'day') return [date, addDays(date, 1)]
  if (view === 'week' || view === 'outlets') { const w = weekOf(date); return [w[0], addDays(w[6], 1)] }
  if (view === 'month') { const g = monthGrid(date); return [g[0][0], addDays(g.at(-1)![6], 1)] }
  return [date, addDays(date, LIST_DAYS)]
}

export function useNarrow(px = 760) {
  const q = `(max-width: ${px}px)`
  const [narrow, set] = useState(() => matchMedia(q).matches)
  useEffect(() => { const m = matchMedia(q), f = () => set(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [q])
  return narrow
}
/** Fetch for the latest request only: a slow answer for a view you already left never overwrites the one on screen. */
export function useLatest() {
  const n = useRef(0)
  return <T,>(p: Promise<T>, done: (v: T) => void, fail?: (e: any) => void) => { const k = ++n.current; p.then(v => k === n.current && done(v), e => k === n.current && fail?.(e)) }
}

export const Chevron = ({ dir }: { dir: 'back' | 'fwd' }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden
  className="flip-rtl"><path d={dir === 'back' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>

/** The "Closes in 16h" tag: bidding closes within the next 24 hours (the bid drawer's wording). */
const soon = (iso: string) => { const ms = new Date(iso).getTime() - Date.now(); return ms > 0 && ms <= 24 * 3_600_000 }

// ---- filters ----------------------------------------------------------------------------------------------------------
export function Popover({ label, children, on, align, wide }: { label: React.ReactNode; children: React.ReactNode; on?: boolean; align?: 'end'; wide?: boolean }) {
  const pop = usePop({ align })
  return <div className="pop">
    <button type="button" className={`chipf ${on ? 'on' : ''}`} {...pop.button}>{label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M6 9l6 6 6-6" /></svg></button>
    <div className={`pop-panel pp ${wide ? 'wide' : ''}`} role="dialog" aria-label={typeof label === 'string' ? label : undefined} {...pop.panel}>{pop.open && children}</div>
  </div>
}

/** The listings behind a cell, to pick one: a product over one day (or a week, in the Month view). */
type Panel = { title: string; sub: string; query?: Record<string, string>; list?: Record<string, string>; from?: string; days?: number }

// ---- the rows: outlets with their products under them (owner's buyer-side fixes, round 2) ------------------------------
type Cell = { col: string; slots: number; onSale: number; price: number | null; bids: number; closesAt: string | null; youLead: boolean; outbid: boolean
  items?: { id: string; startsAt: string; endsAt: string | null; price: number; saleType: Slot['saleType']; label: string; kind: string }[] }
type ProductRow = { placementId: string; placement: string; channel: string; onSale: number; fromPrice: number | null; saleTypes: string[]; cells: Cell[] }
type OutletRows = { key: string; outlet: string; channels: string[]; logoUrl: string | null; onSale: number; fromPrice: number | null; products: ProductRow[] }

/** A cell's price: the number only, exact (the table says once that prices are in AED before VAT), so it fits a narrow column in any language. */
const cellPrice = (fils: number) => (fils / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })

/** One short status per cell, in the owner's words: You lead · Outbid · Closes in 16h · 4 bids · 3 on sale · Closed. */
function cellStatus(c: Cell) {
  if (!c.onSale) return <span className="muted">{t('Closed')}</span>
  if (c.youLead) return <span className="dot lead">{t('You lead')}</span>
  if (c.outbid) return <span className="dot outbid">{t('Outbid')}</span>
  if (c.closesAt && soon(c.closesAt)) return <span className="cv-closing">{closesIn(c.closesAt)}</span>
  if (c.bids) return <span className="muted">{c.bids === 1 ? t('1 bid') : t('{n} bids', { n: c.bids })}</span>
  return <span className="muted">{t('{n} on sale', { n: c.onSale })}</span>
}

/**
 * Day, Week and Month share one layout: an outlet row (logo, name, media type, an arrow to fold it; no prices), then one row per
 * product with its sale type and "from" price. Only the columns change: Day = one day, Week = 7 days, Month = one column per week.
 * A cell is one product in one column; clicking it opens the bid drawer, or a short list to pick from when several are on sale.
 */
function RowsView({ s, view, from, to, reload, live, onOpen, onPick, single }: { s: State; view: View; from: string; to: string; reload: number; live: number
  onOpen: (id: string) => void; onPick: (p: Panel) => void; single?: boolean }) {
  const [data, setData] = useState<{ total: number; outlets: OutletRows[] } | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState('')
  const [folded, setFolded] = useState<Set<string>>(() => new Set())
  const latest = useLatest(), grain = view === 'month' ? 'week' : 'day'
  useEffect(() => { setOffset(0) }, [from, to, s.f, s.mine, s.osort, view])
  // every listing, closed ones included, so a cell can say "Closed"; the server keeps buyers to the open market
  useEffect(() => { latest(api<{ total: number; outlets: OutletRows[] }>(`/slots/rows?${query({ ...s, all: true }, from, to, { grain, sort: s.osort, offset, limit: ROW_PAGE })}`),
    d => { setData(d); setError('') }, e => setError(e.message)) }, [from, to, s.f, s.mine, s.osort, s.product, s.item, s.campaign, s.fit, offset, reload, live, grain])
  const today = todayInDubai()
  const cols = view === 'day' ? [from] : view === 'week' ? weekOf(from) : monthGrid(s.date).map(w => w[0])
  const colLabel = (c: string) => view === 'month'
    ? t('{from} – {to}', { from: dayLabel(c, { day: 'numeric', month: 'short' }), to: dayLabel(addDays(c, 6), { day: 'numeric', month: 'short' }) })
    : dayLabel(c, view === 'day' ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric' })
  const isNow = (c: string) => view === 'month' ? today >= c && today < addDays(c, 7) : c === today
  const fold = (k: string) => setFolded(f => { const n = new Set(f); n.has(k) ? n.delete(k) : n.add(k); return n })
  const pages = data ? Math.ceil(data.total / ROW_PAGE) : 0, pageNo = Math.floor(offset / ROW_PAGE) + 1
  const total = false as boolean // the right-hand "N on sale · from AED" column: removed at the owner's request (each day cell already shows it)
  const pick = (o: OutletRows, p: ProductRow, c: Cell) => {
    if (!c.onSale) return
    if (c.items?.length === 1) return onOpen(c.items[0].id)
    onPick({ title: `${o.outlet} · ${p.placement}`, sub: colLabel(c.col), query: { placement: p.placementId }, from: c.col, days: view === 'month' ? 7 : 1 })
  }
  return (
    <section className={`card cv-rows rv-${view}`}>
      <div className="cv-list-bar">
        <span className="small muted" role="status">{!data ? t('Loading…') : single ? '' : data.total === 1 ? t('1 outlet') : t('{n} outlets', { n: data.total.toLocaleString('en-US') })}</span>
        <span className="spacer" /><span className="small muted">{t('Prices in AED, before VAT')}</span>
      </div>
      {error && <p className="error pad">{error}</p>}
      <div className="table-wrap"><table className="table cv-rtable" style={{ minWidth: (view === 'day' ? 260 + 320 : 176 + cols.length * 76) + (total ? 100 : 0) }}>
        <colgroup><col className="c-p" />{cols.map(c => <col key={c} className="c-d" />)}{total && <col className="c-t" />}</colgroup>
        <thead><tr><th className="cv-pcol">{single ? t('Product') : t('Outlet')}</th>
          {cols.map(c => <th key={c} className={`num ${isNow(c) ? 'today' : ''}`}>{colLabel(c)}</th>)}
          {total && <th className="r cv-tot">{view === 'month' ? t('Month') : t('Week')}</th>}</tr></thead>
        {(data?.outlets ?? []).map(o => { const open = !folded.has(o.key)
          return <tbody key={o.key} className="cv-outlet-group">
            {!single && <tr className="cv-orow"><th scope="rowgroup" colSpan={cols.length + 1 + (total ? 1 : 0)}>
              <button type="button" className="cv-fold" aria-expanded={open} onClick={() => fold(o.key)}>
                <svg className={`cv-arrow ${open ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
                <OutletMark name={o.outlet} url={o.logoUrl} size={30} />
                <span className="cv-oname"><b dir="auto">{o.outlet}</b><span className="small muted">{o.channels.map(c => CHANNEL_NAME[c] ?? c).join(sep)}</span></span>
                {!open && <span className="small muted">{o.products.length === 1 ? t('1 product') : t('{n} products', { n: o.products.length })}</span>}
              </button></th></tr>}
            {open && o.products.map(p => <tr key={p.placementId} className="cv-prow">
              <th scope="row" className="cv-pcol"><span className="cv-pname"><b dir="auto">{single ? p.placement : `${o.outlet} · ${p.placement}`}</b>
                <span className="small muted">{p.saleTypes.map(saleLabel).join(sep)}{p.fromPrice != null && <>{p.saleTypes.length ? ' · ' : ''}{t('from {price}', { price: money(p.fromPrice) })}</>}</span></span></th>
              {cols.map(c => { const x = p.cells.find(y => y.col === c), past = view !== 'month' && c < today
                if (!x) return <td key={c} className={`cv-rcell empty ${past ? 'past' : ''}`}><span className="muted">—</span></td>
                return <td key={c} className={`cv-rcell ${past ? 'past' : ''}`}>
                  {view === 'day' && x.items?.length ? <ul className="cv-items">{x.items.map(i => <li key={i.id}><button type="button" onClick={() => onOpen(i.id)}>
                    {hasTime(p.channel) && i.kind === 'single' && <span className="num">{time(i.startsAt)} · </span>}
                    {i.kind !== 'single' && <span>{tm(i.label)} · </span>}<b className="num">{money(i.price)}</b> · {saleLabel(i.saleType)}</button></li>)}
                    <li className="cv-istat">{cellStatus(x)}</li></ul>
                  : <button type="button" className={`cv-cell ${x.onSale ? '' : 'closed'} ${x.outbid ? 'outbid' : x.youLead ? 'lead' : ''}`} disabled={!x.onSale} onClick={() => pick(o, p, x)}>
                    {x.price != null ? <b className="num" title={money(x.price)}>{cellPrice(x.price)}</b> : <b className="muted">—</b>}{cellStatus(x)}</button>}</td> })}
              {total && <td className="r num small cv-tot">{p.onSale ? <><b>{t('{n} on sale', { n: p.onSale })}</b>{p.fromPrice != null && <div className="muted">{t('from {price}', { price: money(p.fromPrice) })}</div>}</>
                : <span className="muted">{t('Closed')}</span>}</td>}
            </tr>)}
          </tbody> })}
      </table></div>
      {data && !data.outlets.length && <p className="muted pad">{t('Nothing here in this period.')}</p>}
      {pages > 1 && <nav className="cv-pager" aria-label={t('Pages')}>
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(offset - ROW_PAGE)}><Chevron dir="back" /> {t('Previous')}</button>
        <span className="small muted">{t('Page {n} of {total}', { n: pageNo, total: pages })}</span>
        <button className="btn" disabled={pageNo >= pages} onClick={() => setOffset(offset + ROW_PAGE)}>{t('Next')} <Chevron dir="fwd" /></button></nav>}
    </section>
  )
}

// ---- side panel: the slots behind a block, a cell or a "+N more" ---------------------------------------------------------
function SlotsPanel({ p, s, onClose, onOpen }: { p: Panel; s: State; onClose: () => void; onOpen: (id: string) => void; onPanel: (p: Panel) => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null), [total, setTotal] = useState(0), [sort, setSort] = useState<Sort>('price_asc'), [busy, setBusy] = useState(false)
  const latest = useLatest()
  // One programme or an outlet's day: every slot, taken ones included. A folded time: the matching open slots, sorted and paged.
  const load = (offset: number) => {
    if (p.query) { const d = p.from ?? p.query.date; return latest(api<Slot[]>(`/slots?${query({ ...s, all: true }, d, addDays(d, p.days ?? 1), p.query)}`), x => { setSlots(x); setTotal(x.length) }, () => setSlots([])) }
    if (!p.list) return
    const d = p.list.date; setBusy(true)
    latest(api<{ total: number; items: Slot[] }>(`/slots/list?${query(s, d, addDays(d, 1), { ...p.list, sort, offset, limit: PAGE })}`),
      r => { setSlots(cur => offset ? [...(cur ?? []), ...r.items] : r.items); setTotal(r.total); setBusy(false) }, () => { setSlots([]); setBusy(false) })
  }
  useEffect(() => { setSlots(null); load(0) }, [p, sort])
  const order = { single: 0, any: 1, package: 2 }
  const shown = !slots ? null : p.list ? slots : [...slots].sort((a, b) => Number(b.available) - Number(a.available) || order[a.kind] - order[b.kind] || a.startsAt.localeCompare(b.startsAt))
  return (
    <Modal onClose={onClose} label={p.title}>
      <aside className="drawer">
        <header className="drawer-h"><div><h2>{p.title}</h2><p className="muted small">{p.sub}</p></div>
          <button className="btn" onClick={onClose} aria-label={t('Close')}>✕</button></header>
        {p.list && <div className="cv-panel-bar"><span className="small muted">{slots ? t('{n} slots', { n: total.toLocaleString('en-US') }) : t('Loading…')}</span><span className="spacer" />
          <select className="cal-input cv-sort" aria-label={t('Sort by')} value={sort} onChange={e => setSort(e.target.value as Sort)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
        {!shown ? <p className="muted">{t('Loading…')}</p>
        : <ul className="list">{shown.map(x =>
            <li key={x.id}><button className="row" onClick={() => onOpen(x.id)} disabled={!x.available}>
              <span>{p.list ? <><span className="cv-outlet"><OutletMark name={x.brand ?? x.outlet} url={x.logoUrl} size={22} /><b>{x.brand ?? x.outlet}</b></span><br />
                <span className="small muted">{x.placement}{x.label !== x.placement ? ` · ${tm(x.label)}` : ''}{clock(x) ? <span className="num"> · {clock(x)}</span> : null}</span></>
                : <><b>{tm(x.label)}</b>{x.kind === 'single' && clock(x) ? <span className="muted num"> · {clock(x)}</span> : null}
                  {p.query?.outlet && <span className="small muted"> · {x.placement}</span>}</>}
                <br /><SaleType t={x.saleType} /></span>
              <span className="right"><b className="num">{money(x.topBid ?? x.startingPrice)}</b><br /><span className="small">{status(x)}</span></span>
            </button></li>)}</ul>}
        {shown && !shown.length && <p className="muted">{t('Nothing here any more.')}</p>}
        {p.list && shown && shown.length < total && <button className="btn" disabled={busy} onClick={() => load(shown.length)}>{busy ? t('Loading…') : t('Show {n} more', { n: Math.min(PAGE, total - shown.length) })}</button>}
      </aside>
    </Modal>
  )
}


// ---- an outlet's Calendar tab (owner's "Buying moves to the Directory") -----------------------------------------------------
/**
 * The seller's calendar layout for one outlet, for buyers: Day / Week / Month (Week first), a row per product or programme, and in
 * each cell the price and one status. Clicking a cell opens the bid drawer, or a short list to pick from when several are on sale.
 * Filters: Sale type and Product. My bids sits beside it, folded.
 */
export function OutletCalendar({ outlet, products, product, onProduct }: { outlet: string; products: { id: string; name: string }[]
  product?: string; onProduct: (id: string | undefined) => void }) {
  const guest = useGuest(), narrow = useNarrow()
  const [view, setView] = useState<View>('week'), [date, setDate] = useState(todayInDubai()), [sale, setSale] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null), [panel, setPanel] = useState<Panel | null>(null), [reload, setReload] = useState(0), [live, setLive] = useState(0)
  useLive('slot', () => setLive(n => n + 1), 1500)
  const s: State = { view, date, f: { saleTypes: sale.length ? sale : undefined }, mine: false, all: false, sort: 'time', osort: 'popular', product: outlet, item: product }
  const [from, to] = span(view, date, narrow)
  // first visit: open on the first week with something on sale
  useEffect(() => { api<DayTotal[]>(`/slots/days?${query(s, todayInDubai(), addDays(todayInDubai(), 120))}`).then(d => { const f = d[0]?.date; if (f && f >= to) setDate(f) }, () => {}) }, [outlet])
  const step = (n: number) => {
    if (view === 'month') { const d = new Date(date + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); return setDate(d.toISOString().slice(0, 10)) }
    setDate(addDays(date, n * (view === 'day' ? 1 : 7)))
  }
  const title = view === 'month' ? dayLabel(date, { month: 'long', year: 'numeric' }) : view === 'day' ? dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })
    : t('{from} – {to}', { from: dayLabel(from, { day: 'numeric', month: 'short' }), to: dayLabel(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' }) })
  const toggle = (k: string) => setSale(x => x.includes(k) ? x.filter(y => y !== k) : [...x, k])
  return <div className="oc-cal">
    <div className="oc-cal-bar">
      <b className="oc-cal-title">{title}</b>
      <div className="cv-nav" role="group" aria-label={t('Dates')}>
        <button className="btn" onClick={() => setDate(todayInDubai())}>{t('Today')}</button>
        <button className="btn icon" aria-label={t('Previous')} onClick={() => step(-1)}><Chevron dir="back" /></button>
        <button className="btn icon" aria-label={t('Next')} onClick={() => step(1)}><Chevron dir="fwd" /></button>
      </div>
      <span className="spacer" />
      <div className="seg" role="tablist" aria-label={t('View')}>{VIEWS.map(([v, l]) =>
        <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>)}</div>
    </div>
    <div className="oc-cal-bar">
      <span className="dir-label">{t('Sale type:')}</span>
      <span className="row-flex sale-chips">{SALE_TYPES.map(k => <button key={k} type="button" className={`chipf ${sale.includes(k) ? 'on' : ''}`} aria-pressed={sale.includes(k)} onClick={() => toggle(k)}>
        <SaleIcon k={k} />{saleLabel(k)}</button>)}</span>
      {products.length > 1 && <label className="cv-sortby"><span>{t('Product:')}</span><select className="cal-input" value={product ?? ''} onChange={e => onProduct(e.target.value || undefined)}>
        <option value="">{t('All products')}</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    </div>
    <div className={`cv-body ${guest ? '' : 'with-bids'}`}>
      {!guest && narrow && <MyBids folded onOpen={setOpen} reload={reload} narrow />}
      {narrow ? <OutletDays s={s} from={from} to={to} reload={reload + live} onOpen={setOpen} />
        : <RowsView single s={s} view={view} from={from} to={to} reload={reload} live={live} onOpen={setOpen} onPick={setPanel} />}
      {!guest && !narrow && <MyBids folded onOpen={setOpen} reload={reload} narrow={false} />}
    </div>
    <p className="small muted">{t('Dubai time. Prices exclude VAT. You pay only once the publisher accepts, and the money is held until the ad has run.')}</p>
    {panel && <SlotsPanel p={panel} s={s} onClose={() => setPanel(null)} onOpen={id => { setPanel(null); setOpen(id) }} onPanel={setPanel} />}
    {open && <BidDrawer slotId={open} onClose={() => setOpen(null)} onDone={() => setReload(n => n + 1)} />}
  </div>
}

/** On a phone an outlet's calendar is a list by date: each date, then the listings on sale that day. Tap one for the bid drawer. */
function OutletDays({ s, from, to, reload, onOpen }: { s: State; from: string; to: string; reload: number; onOpen: (id: string) => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null), latest = useLatest()
  useEffect(() => { latest(api<Slot[]>(`/slots?${query(s, from, to)}`), setSlots, () => setSlots([])) }, [from, to, s.item, s.f.saleTypes?.join(), reload])
  if (!slots) return <p className="muted">{t('Loading…')}</p>
  const open = slots.filter(x => x.available).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  if (!open.length) return <p className="card pad muted">{t('Nothing on sale in this period. Use the arrows to see other dates.')}</p>
  const days = [...new Set(open.map(x => dubai(x.startsAt).date))]
  return <div className="tk-days">{days.map(d => <section key={d} className="tk-day">
    <h3>{dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    <ul className="list">{open.filter(x => dubai(x.startsAt).date === d).map(x => <li key={x.id}><button className="row" onClick={() => onOpen(x.id)}>
      <span><b dir="auto">{x.placement}</b>{clock(x) ? <span className="muted num"> · {clock(x)}</span> : null}{x.kind !== 'single' && <span className="muted"> · {tm(x.label)}</span>}<br /><SaleType t={x.saleType} /></span>
      <span className="right"><b className="num">{money(x.topBid ?? x.startingPrice)}</b><br /><span className="small">{status(x)}</span></span></button></li>)}</ul>
  </section>)}</div>
}
