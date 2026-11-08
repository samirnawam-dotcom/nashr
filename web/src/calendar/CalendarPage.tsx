import { useEffect, useRef, useState } from 'react'
import { api, type Slot } from '../api'
import { closesIn, dayLabel, money, time } from '../format'
import { addDays, dubai, layoutDay, monthGrid, todayInDubai, weekOf } from './layout'
import { BidDrawer, INDUSTRIES } from './BidDrawer'
import { SignInPrompt, useGuest } from '../guest'
import { PAGES, useMeta } from '../seo'
import { SavedSearches } from './SavedSearches'
import { activeCount, DAYPARTS, type Daypart, type SlotFilter } from '../../../server/shared/slot-filter'
import { AUDIENCES } from '../../../server/shared/audiences'
import { isAr, ltr, t } from '../i18n'
import { tm } from '../i18n-server'
import './calendar.css'

/*
 * The calendar, built for a marketplace of 1000+ outlets. The server filters, sorts, pages and summarises (marketplace/search.ts);
 * this screen asks only for what it shows. Five ways to look: a sortable list, a day by channel, a week, a month of daily totals,
 * and outlets across the week. The view, the date and every filter live in the address, so links, Back and refresh keep them.
 */

type View = 'list' | 'day' | 'week' | 'month' | 'outlets'
type Sort = 'time' | 'price_asc' | 'price_desc' | 'closing' | 'bids'
type OSort = 'name' | 'price' | 'slots'
export type Prog = { outletId: string; outlet: string; channel: string; placementId: string; placement: string; date: string; startsAt: string; endsAt: string
  allDay: boolean; slots: number; open: number; fromPrice: number; bids: number; youLead: boolean; youBid: boolean; closesAt: string | null; saleTypes: string[] }
type DayTotal = { date: string; slots: number; outlets: number; fromPrice: number; channels: string[] }
type OutletRow = { outletId: string; outlet: string; channel: string; logoUrl: string | null; slots: number; fromPrice: number; days: { date: string; slots: number; fromPrice: number }[] }
type State = { view: View; date: string; f: SlotFilter; mine: boolean; all: boolean; sort: Sort; osort: OSort }

export const CHANNELS = ['radio', 'tv', 'print', 'digital', 'podcast'] as const
export const CHANNEL_NAME: Record<string, string> = { print: t('Print'), digital: t('Digital'), radio: t('Radio'), tv: t('TV'), podcast: t('Podcast') }
const VIEWS: [View, string, string][] = [['list', t('List'), 'l'], ['day', t('Day'), 'd'], ['week', t('Week'), 'w'], ['month', t('Month'), 'm'], ['outlets', t('By outlet'), 'o']]
const SORTS: [Sort, string][] = [['time', t('Air time')], ['closing', t('Closing soonest')], ['price_asc', t('Price: low to high')], ['price_desc', t('Price: high to low')], ['bids', t('Most bids')]]
const LIST_DAYS = 28, PAGE = 50, OUTLET_PAGE = 50, HOUR = 64, MAX_COLS = 3

export const Gavel = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8" /></svg>
export const Bolt = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
export const Tag = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01" /></svg>
/** The three ways a slot is sold, with one label and one icon each, used everywhere (SPEC 12.1). */
export const SALE_TYPES = ['auction', 'quick_sale', 'fixed'] as const
export const SaleIcon = ({ k }: { k: string }) => k === 'auction' ? <Gavel /> : k === 'fixed' ? <Tag /> : <Bolt />
export const saleLabel = (k: string) => k === 'auction' ? t('Auction') : k === 'fixed' ? t('Fixed price') : t('Quick sale')
export const SaleType = ({ t: kind }: { t: Slot['saleType'] }) => <span className="tag"><SaleIcon k={kind} />{saleLabel(kind)}</span>
const ICON: Record<string, string> = {
  radio: 'M4 9h16v11H4zM8 9l9-5M8 14.5h.01M12 13h5M12 16h5', tv: 'M3 6h18v12H3zM8 21h8M12 18v3',
  print: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4', digital: 'M3 5h18v11H3zM9 20h6M12 16v4', podcast: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
}
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
const progStatus = (g: Prog) => g.youLead ? <span className="dot lead">{t('You lead')}</span> : g.youBid ? <span className="dot outbid">{t('You bid')}</span>
  : g.closesAt && closesIn(g.closesAt) ? <span className="on-air">{closesIn(g.closesAt)}</span> : null

// ---- the address is the state -----------------------------------------------------------------------------------------
const isView = (v: string | null): v is View => !!v && VIEWS.some(([k]) => k === v)
function readState(narrow: boolean): State {
  const p = new URLSearchParams(location.search), list = (k: string) => p.get(k)?.split(',').filter(Boolean)
  let saved: View | null = null; try { saved = localStorage.getItem('nashr:cal-view') as View | null } catch { /* private mode */ }
  const view = isView(p.get('view')) ? p.get('view') as View : isView(saved) ? saved : narrow ? 'list' : 'week'
  return { view, date: /^\d{4}-\d{2}-\d{2}$/.test(p.get('date') ?? '') ? p.get('date')! : todayInDubai(),
    f: { channels: list('ch'), saleTypes: list('sale'), sector: p.get('sector') || undefined, maxPrice: p.get('max') ? Number(p.get('max')) : undefined,
      dayparts: list('dp') as Daypart[] | undefined, q: p.get('q') || undefined, closingWithinHours: p.get('soon') ? Number(p.get('soon')) : undefined, audiences: list('aud') },
    mine: p.get('mine') === '1', all: p.get('all') === '1', sort: (p.get('sort') as Sort) || 'time', osort: (p.get('osort') as OSort) || 'name' }
}
function writeState(s: State, push: boolean) {
  const p = new URLSearchParams(location.search)
  const put = (k: string, v: string | number | undefined | null | false) => v === undefined || v === null || v === '' || v === false ? p.delete(k) : p.set(k, String(v))
  put('view', s.view); put('date', s.date); put('ch', s.f.channels?.join(',')); put('sale', s.f.saleTypes?.join(',')); put('sector', s.f.sector)
  put('max', s.f.maxPrice); put('dp', s.f.dayparts?.join(',')); put('aud', s.f.audiences?.join(',')); put('q', s.f.q); put('soon', s.f.closingWithinHours); put('mine', s.mine && '1'); put('all', s.all && '1')
  put('sort', s.sort === 'time' ? null : s.sort); put('osort', s.osort === 'name' ? null : s.osort)
  const url = `${location.pathname}?${p.toString()}`
  if (url !== location.pathname + location.search) history[push ? 'pushState' : 'replaceState'](null, '', url)
}
/** The query string the server's calendar search reads (marketplace/search.ts parseQuery). */
function query(s: State, from: string, to: string, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams({ from: `${from}T00:00:00+04:00`, to: `${to}T00:00:00+04:00` })
  const f = s.f
  if (f.channels?.length) p.set('ch', f.channels.join(',')); if (f.saleTypes?.length) p.set('sale', f.saleTypes.join(','))
  if (f.sector) p.set('sector', f.sector); if (f.maxPrice != null) p.set('max', String(f.maxPrice)); if (f.dayparts?.length) p.set('dp', f.dayparts.join(','))
  if (f.q?.trim()) p.set('q', f.q.trim()); if (f.closingWithinHours != null) p.set('soon', String(f.closingWithinHours)); if (f.audiences?.length) p.set('aud', f.audiences.join(','))
  if (s.mine) p.set('mine', '1'); if (!s.all) p.set('open', '1')
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v))
  return p.toString()
}
/** The days a view covers. */
function span(view: View, date: string, narrow: boolean): [string, string] {
  if (view === 'day') return [date, addDays(date, 1)]
  if (view === 'week' || view === 'outlets' || (narrow && view !== 'month')) { const w = weekOf(date); return [w[0], addDays(w[6], 1)] }
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

export function CalendarPage() {
  const guest = useGuest(), narrow = useNarrow()
  useMeta(PAGES['/calendar'])
  const [s, setS] = useState<State>(() => readState(narrow))
  const [qText, setQText] = useState(s.f.q ?? '')
  const [open, setOpen] = useState<string | null>(null), [panel, setPanel] = useState<Panel | null>(null), [sheet, setSheet] = useState(false)
  const [totals, setTotals] = useState<DayTotal[] | null>(null), [next, setNext] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const latest = useLatest()
  const [from, to] = span(s.view, s.date, narrow)

  // State changes: views and dates are steps Back can undo; filters replace the address.
  const update = (patch: Partial<State>, push = false) => setS(cur => { const n = { ...cur, ...patch, f: { ...cur.f, ...(patch.f ?? {}) } }; writeState(n, push); return n })
  useEffect(() => { const f = () => { const n = readState(narrow); setS(n); setQText(n.f.q ?? '') }; addEventListener('popstate', f); return () => removeEventListener('popstate', f) }, [narrow])
  useEffect(() => { try { localStorage.setItem('nashr:cal-view', s.view) } catch { /* fine */ } }, [s.view])
  // Typing searches after a short pause, not on every key.
  useEffect(() => { const k = setTimeout(() => { if ((s.f.q ?? '') !== qText) update({ f: { q: qText || undefined } }) }, 300); return () => clearTimeout(k) }, [qText])

  // Totals for the range on screen (the header count) and, when the range is empty, the next date that has something.
  useEffect(() => {
    setNext(null)
    latest(api<DayTotal[]>(`/slots/days?${query(s, from, to)}`), d => {
      setTotals(d)
      if (!d.length) api<DayTotal[]>(`/slots/days?${query(s, to, addDays(to, 120))}`).then(n => setNext(n[0]?.date ?? null), () => {})
    })
  }, [from, to, s.f, s.mine, s.all, reload])
  // First visit with no date in the address: open where something is on sale.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('date')) return
    api<DayTotal[]>(`/slots/days?${query(s, todayInDubai(), addDays(todayInDubai(), 120))}`).then(d => {
      const first = d[0]?.date; if (first && first >= to) update({ date: first })
    }, () => {})
  }, [])

  const total = totals?.reduce((n, d) => n + d.slots, 0) ?? null
  const active = activeCount(s.f, { channels: CHANNELS.length, saleTypes: 2 }) + (s.mine ? 1 : 0) + (s.all ? 1 : 0)
  const clear = () => { setQText(''); update({ f: { channels: undefined, saleTypes: undefined, sector: undefined, maxPrice: undefined, dayparts: undefined, q: undefined, closingWithinHours: undefined, audiences: undefined }, mine: false, all: false }) }
  const step = (n: number) => {
    if (s.view === 'month') { const d = new Date(s.date + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); return update({ date: d.toISOString().slice(0, 10) }, true) }
    update({ date: addDays(s.date, n * (narrow ? 7 : s.view === 'day' ? 1 : s.view === 'list' ? LIST_DAYS : 7)) }, true) // phones show a week in every view but month
  }
  const goDay = (d: string) => update({ view: 'day', date: d }, true)

  // Keyboard: ← → move, T today, L D W M O views, / search. Not while typing.
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(el.tagName) || el.isContentEditable || open || panel) return
      const key = e.key.toLowerCase(), v = VIEWS.find(x => x[2] === key)
      if (e.key === 'ArrowLeft') step(isAr ? 1 : -1); else if (e.key === 'ArrowRight') step(isAr ? -1 : 1)
      else if (key === 't') update({ date: todayInDubai() }, true); else if (v) update({ view: v[0] }, true)
      else if (e.key === '/') { e.preventDefault(); search.current?.focus() } else return
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  })

  const title = s.view === 'month' ? dayLabel(s.date, { month: 'long', year: 'numeric' })
    : s.view === 'day' && !narrow ? dayLabel(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : s.view === 'list' ? t('{from} – {to}', { from: dayLabel(from, { day: 'numeric', month: 'short' }), to: dayLabel(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' }) })
    : t('{from} – {to}', { from: dayLabel(from, { day: 'numeric', month: 'short' }), to: dayLabel(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' }) })
  const filterProps = { s, update, qText, setQText, guest, active, clear, search }

  return (
    <main className="cv">
      <header className="cv-head">
        <div className="cv-title">
          <h1>{t('Calendar')}</h1>
          <p className="cv-range"><b>{title}</b>{total != null && <span className="muted">{t(total === 1 ? '1 slot' : '{n} slots', { n: total.toLocaleString('en-US') })}{!s.all ? ` · ${t('open to book')}` : ''}</span>}</p>
        </div>
        <div className="cv-nav" role="group" aria-label={t('Dates')}>
          <button className="btn" onClick={() => update({ date: todayInDubai() }, true)} title={t('Today (T)')}>{t('Today')}</button>
          <button className="btn icon" aria-label={t('Previous')} title={t('Previous (←)')} onClick={() => step(-1)}><Chevron dir="back" /></button>
          <button className="btn icon" aria-label={t('Next')} title={t('Next (→)')} onClick={() => step(1)}><Chevron dir="fwd" /></button>
          <label className="btn cv-jump" title={t('Go to a date')}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg>
            <span className="cv-jump-label">{t('Go to date')}</span>
            <input type="date" aria-label={t('Go to a date')} value={s.date} onChange={e => e.target.value && update({ date: e.target.value }, true)} /></label>
        </div>
        <div className="seg cv-views" role="tablist" aria-label={t('View')}>{VIEWS.map(([v, l, key]) =>
          <button key={v} role="tab" aria-selected={s.view === v} className={s.view === v ? 'on' : ''} title={`${l} (${key.toUpperCase()})`} onClick={() => update({ view: v }, true)}>{l}</button>)}</div>
      </header>

      {narrow ? <div className="cv-mobilebar">
        <input ref={search} className="search" type="search" placeholder={t('Search outlets, programmes, audiences')} aria-label={t('Search')} value={qText} onChange={e => setQText(e.target.value)} />
        <button className={`btn ${active ? 'primary' : ''}`} onClick={() => setSheet(true)}>{active ? t('Filters ({n})', { n: active }) : t('Filters')}</button>
      </div> : <FilterBar {...filterProps} />}
      {narrow && sheet && <div className="scrim" onClick={() => setSheet(false)}><div className="cv-sheet" role="dialog" aria-label={t('Filters')} onClick={e => e.stopPropagation()}>
        <header className="drawer-h"><h2>{t('Filters')}</h2><button className="btn" onClick={() => setSheet(false)} aria-label={t('Close')}>✕</button></header>
        <FilterBar {...filterProps} stacked />
        <footer className="drawer-f"><button className="btn primary" onClick={() => setSheet(false)}>{total != null ? t('Show {n} slots', { n: total.toLocaleString('en-US') }) : t('Show slots')}</button>
          {active > 0 && <button className="btn" onClick={clear}>{t('Clear all')}</button>}</footer>
      </div></div>}

      {total === 0 && <div className="cv-empty" role="status">
        <p><b>{active ? t('Nothing matches these filters in this period.') : t('Nothing open to book in this period.')}</b>{' '}
          <span className="muted">{t('Bidding closes a few days before air, so the nearest days are often already closed.')}</span></p>
        <div className="row-flex">{next && <button className="btn primary" onClick={() => update({ date: next }, true)}>{t('Jump to {date}', { date: dayLabel(next, { weekday: 'short', day: 'numeric', month: 'short' }) })}</button>}
          {active > 0 && <button className="btn" onClick={clear}>{t('Clear filters')}</button>}</div>
      </div>}

      {(s.view === 'list' || (narrow && (s.view === 'week' || s.view === 'day'))) && <ListView s={s} from={from} to={to} narrow={narrow} reload={reload} onSort={v => update({ sort: v })} onOpen={setOpen} />}
      {!narrow && s.view === 'week' && <TimeGrid key="week" s={s} from={from} to={to} reload={reload} columns="days" onPanel={setPanel} onDay={goDay} />}
      {!narrow && s.view === 'day' && <TimeGrid key="day" s={s} from={from} to={to} reload={reload} columns="channels" onPanel={setPanel} onDay={goDay} />}
      {s.view === 'month' && <MonthView date={s.date} totals={totals ?? []} narrow={narrow} onDay={d => update({ view: narrow ? 'list' : 'day', date: d }, true)} />}
      {s.view === 'outlets' && <OutletsView s={s} from={from} to={to} reload={reload} onSort={v => update({ osort: v })} onPanel={setPanel} />}

      <footer className="cv-foot small muted">
        <span>{t('Dubai time. Prices exclude VAT. You pay only once the publisher accepts, and the money is held until the ad has run.')}</span>
        {!narrow && <span className="cv-keys">{t('Shortcuts: ← → move · T today · L D W M O views · / search')}</span>}
      </footer>
      {guest && <SignInPrompt to={t('bid or book')} compact />}

      {panel && <SlotsPanel p={panel} s={s} onClose={() => setPanel(null)} onOpen={id => { setPanel(null); setOpen(id) }} onPanel={setPanel} />}
      {open && <BidDrawer slotId={open} onClose={() => setOpen(null)} onDone={() => setReload(n => n + 1)} />}
    </main>
  )
}

export const Chevron = ({ dir }: { dir: 'back' | 'fwd' }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden
  className="flip-rtl"><path d={dir === 'back' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>

// ---- filters ----------------------------------------------------------------------------------------------------------
type FilterProps = { s: State; update: (p: Partial<State>, push?: boolean) => void; qText: string; setQText: (v: string) => void; guest: boolean; active: number
  clear: () => void; search: React.RefObject<HTMLInputElement | null>; stacked?: boolean }

/** One row of filters above the calendar (a sheet on phones): search, channels, sale type, time of day, more, saved searches. */
function FilterBar({ s, update, qText, setQText, guest, active, clear, search, stacked }: FilterProps) {
  const toggle = (list: string[] | undefined, v: string, all: readonly string[]) => {
    const cur = new Set(list?.length ? list : []); cur.has(v) ? cur.delete(v) : cur.add(v)
    return cur.size === 0 || cur.size === all.length ? undefined : [...cur]
  }
  const on = (list: string[] | undefined, v: string) => !!list?.includes(v)
  const more = (s.f.sector ? 1 : 0) + (s.f.maxPrice != null ? 1 : 0) + (s.f.closingWithinHours != null ? 1 : 0) + (s.mine ? 1 : 0) + (s.all ? 1 : 0)
  const moreFields = <div className="cv-more">
    <label className="field"><span className="small">{t('Sector')}</span>
      <select className="cal-input" value={s.f.sector ?? ''} onChange={e => update({ f: { sector: e.target.value || undefined } })}>
        <option value="">{t('Any sector')}</option>{INDUSTRIES.map(i => <option key={i} value={i}>{t(i)}</option>)}</select></label>
    <label className="field"><span className="small">{t('Up to (AED, excl. VAT)')}</span>
      <input className="cal-input" inputMode="numeric" placeholder={t('Any price')} value={s.f.maxPrice != null ? String(s.f.maxPrice / 100) : ''}
        onChange={e => { const v = e.target.value.replace(/[^\d]/g, ''); update({ f: { maxPrice: v ? Number(v) * 100 : undefined } }) }} /></label>
    <label className="switch"><input type="checkbox" role="switch" checked={s.f.closingWithinHours != null} onChange={e => update({ f: { closingWithinHours: e.target.checked ? 24 : undefined } })} />
      <span className="switch-track" aria-hidden><span /></span>{t('Bidding closes within 24 hours')}</label>
    {!guest && <label className="switch"><input type="checkbox" role="switch" checked={s.mine} onChange={e => update({ mine: e.target.checked })} />
      <span className="switch-track" aria-hidden><span /></span>{t('Only slots I bid on')}</label>}
    <label className="switch"><input type="checkbox" role="switch" checked={s.all} onChange={e => update({ all: e.target.checked })} />
      <span className="switch-track" aria-hidden><span /></span>{t('Show taken and closed slots')}</label>
  </div>
  const dayparts = <div className="cv-checks">{DAYPARTS.map(([v, l]) => <label key={v} className="check"><input type="checkbox" checked={on(s.f.dayparts, v)}
    onChange={() => update({ f: { dayparts: toggle(s.f.dayparts, v, DAYPARTS.map(d => d[0])) as Daypart[] | undefined } })} />{t(l)}</label>)}</div>
  const audiences = <div className="cv-checks">{AUDIENCES.map(([v, l]) => <label key={v} className="check"><input type="checkbox" checked={on(s.f.audiences, v)}
    onChange={() => update({ f: { audiences: toggle(s.f.audiences, v, AUDIENCES.map(a => a[0])) } })} />{t(l)}</label>)}</div>
  const filter = { ...s.f }
  return (
    <section className={`cv-filters ${stacked ? 'stacked' : ''}`} aria-label={t('Filters')}>
      {!stacked && <input ref={search} className="search cv-search" type="search" placeholder={t('Search outlets, programmes, audiences')} aria-label={t('Search')}
        value={qText} onChange={e => setQText(e.target.value)} />}
      <div className="cv-group" role="group" aria-label={t('Channels')}>{stacked && <span className="cv-label">{t('Channels')}</span>}
        {CHANNELS.map(c => <button key={c} type="button" className={`chipf ${on(s.f.channels, c) ? 'on' : ''}`} aria-pressed={on(s.f.channels, c)}
          onClick={() => update({ f: { channels: toggle(s.f.channels, c, CHANNELS) } })}><ChannelMark c={c} label /></button>)}</div>
      <div className="cv-group" role="group" aria-label={t('Sale type')}>{stacked && <span className="cv-label">{t('Sale type')}</span>}
        {SALE_TYPES.map(v => <button key={v} type="button" className={`chipf ${on(s.f.saleTypes, v) ? 'on' : ''}`} aria-pressed={on(s.f.saleTypes, v)}
          onClick={() => update({ f: { saleTypes: toggle(s.f.saleTypes, v, [...SALE_TYPES]) } })}><SaleIcon k={v} />{saleLabel(v)}</button>)}</div>
      {stacked ? <><span className="cv-label">{t('Audience')}</span>{audiences}<span className="cv-label">{t('Time of day')}</span>{dayparts}<span className="cv-label">{t('More filters')}</span>{moreFields}</> : <>
        <Popover label={<>{t('Audience')}{s.f.audiences?.length ? <span className="cv-count">{s.f.audiences.length}</span> : null}</>} on={!!s.f.audiences?.length}>{audiences}</Popover>
        <Popover label={<>{t('Time of day')}{s.f.dayparts?.length ? <span className="cv-count">{s.f.dayparts.length}</span> : null}</>} on={!!s.f.dayparts?.length}>{dayparts}</Popover>
        <Popover label={<>{t('More filters')}{more ? <span className="cv-count">{more}</span> : null}</>} on={more > 0}>{moreFields}</Popover>
      </>}
      <span className="spacer" />
      {!guest && !stacked && <Popover label={<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 3h12v18l-6-4-6 4z" /></svg>{t('Saved searches')}</>} align="end" wide>
        <SavedSearches filter={filter} active={active} names={CHANNEL_NAME} onApply={f => update({ f: { channels: f.channels, saleTypes: f.saleTypes, sector: f.sector, maxPrice: f.maxPrice, dayparts: f.dayparts, q: f.q, closingWithinHours: f.closingWithinHours, audiences: f.audiences } })} /></Popover>}
      {stacked && !guest && <><span className="cv-label">{t('Saved searches')}</span><SavedSearches filter={filter} active={active} names={CHANNEL_NAME}
        onApply={f => { setQText(f.q ?? ''); update({ f: { channels: f.channels, saleTypes: f.saleTypes, sector: f.sector, maxPrice: f.maxPrice, dayparts: f.dayparts, q: f.q, closingWithinHours: f.closingWithinHours, audiences: f.audiences } }) }} /></>}
      {!stacked && active > 0 && <button type="button" className="btn cv-clear" onClick={clear}>{t('Clear all ({n})', { n: active })}</button>}
    </section>
  )
}

/** A button that opens a small panel below it; closes on a click elsewhere or Escape. */
export function Popover({ label, children, on, align, wide }: { label: React.ReactNode; children: React.ReactNode; on?: boolean; align?: 'end'; wide?: boolean }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out); addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); removeEventListener('keydown', esc) }
  }, [open])
  return <div className="pop" ref={box}>
    <button type="button" className={`chipf ${on ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>{label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M6 9l6 6 6-6" /></svg></button>
    {open && <div className={`pop-panel ${align === 'end' ? 'end' : ''} ${wide ? 'wide' : ''}`} role="dialog">{children}</div>}
  </div>
}

// ---- list -------------------------------------------------------------------------------------------------------------
/** Every matching slot, sortable, 50 at a time: the way to compare prices across hundreds of outlets. */
function ListView({ s, from, to, narrow, reload, onSort, onOpen }: { s: State; from: string; to: string; narrow: boolean; reload: number; onSort: (v: Sort) => void; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<Slot[]>([]), [total, setTotal] = useState<number | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const latest = useLatest()
  const load = (offset: number) => { setBusy(true)
    latest(api<{ total: number; items: Slot[] }>(`/slots/list?${query(s, from, to, { sort: s.sort, offset, limit: PAGE })}`),
      r => { setItems(cur => offset ? [...cur, ...r.items] : r.items); setTotal(r.total); setBusy(false); setError('') }, e => { setError(e.message); setBusy(false) }) }
  useEffect(() => { setItems([]); setTotal(null); load(0) }, [from, to, s.f, s.mine, s.all, s.sort, reload])
  const grouped = s.sort === 'time'
  const rows: (Slot | string)[] = []
  items.forEach((x, i) => { const d = dubai(x.startsAt).date; if (grouped && (i === 0 || dubai(items[i - 1].startsAt).date !== d)) rows.push(d); rows.push(x) })
  const today = todayInDubai()
  return (
    <section className="card cv-list" aria-label={t('Slots')}>
      <div className="cv-list-bar">
        <span className="small muted" role="status">{total == null ? t('Loading…') : t('Showing {n} of {total}', { n: items.length.toLocaleString('en-US'), total: total.toLocaleString('en-US') })}</span>
        <span className="spacer" />
        <label className="small muted" htmlFor="cv-sort">{t('Sort by')}</label>
        <select id="cv-sort" className="cal-input cv-sort" value={s.sort} onChange={e => onSort(e.target.value as Sort)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      {error && <p className="error pad">{error}</p>}
      {narrow ? <ul className="cv-cards">{rows.map(r => typeof r === 'string'
        ? <li key={r} className={`cv-day ${r === today ? 'today' : ''}`}>{dayLabel(r, { weekday: 'long', day: 'numeric', month: 'short' })}</li>
        : <li key={r.id}><button className={`cv-card ch-b-${r.channel}`} onClick={() => onOpen(r.id)}>
          <span className="cv-card-top"><span className="num cv-when">{grouped ? (r.endsAt || dubai(r.startsAt).minutes ? time(r.startsAt) : t('All day')) : `${dayLabel(dubai(r.startsAt).date, { day: 'numeric', month: 'short' })} · ${time(r.startsAt)}`}</span>
            <b className="num">{money(r.topBid ?? r.startingPrice)}</b></span>
          <span className="cv-card-name"><ChannelMark c={r.channel} /><b>{r.outlet}</b></span>
          <span className="small muted">{r.placement}{r.label !== r.placement ? ` · ${tm(r.label)}` : ''}</span>
          <span className="cv-card-meta small"><SaleType t={r.saleType} />{status(r)}</span>
        </button></li>)}</ul>
      : <div className="table-wrap"><table className="table cv-table">
        <thead><tr><th>{t('Airs')}</th><th>{t('Outlet')}</th><th>{t('Slot')}</th><th>{t('Sale')}</th><th className="r">{t('Price')}</th><th className="r">{t('Bids')}</th><th>{t('Status')}</th><th /></tr></thead>
        <tbody>{rows.map(r => typeof r === 'string'
          ? <tr key={r} className="cv-dayrow"><th colSpan={8} className={r === today ? 'today' : ''}>{dayLabel(r, { weekday: 'long', day: 'numeric', month: 'long' })}</th></tr>
          : <tr key={r.id} data-slot={r.id} className={r.available ? '' : 'cv-taken'} onClick={() => onOpen(r.id)}>
            <td className="num nowrap">{grouped ? '' : <span className="muted">{dayLabel(dubai(r.startsAt).date, { day: 'numeric', month: 'short' })} · </span>}
              {r.endsAt || dubai(r.startsAt).minutes ? ltr(time(r.startsAt)) : t('All day')}</td>
            <td><span className="cv-outlet">{r.logoUrl ? <img src={r.logoUrl} width={24} height={24} alt="" className="cv-logo" loading="lazy" /> : <ChannelMark c={r.channel} />}<b>{r.outlet}</b></span></td>
            <td><span className="cv-slot">{r.placement}</span>{r.label !== r.placement && <span className="small muted"> · {tm(r.label)}</span>}</td>
            <td><SaleType t={r.saleType} /></td>
            <td className="r num"><b>{money(r.topBid ?? r.startingPrice)}</b>{r.topBid ? <div className="small muted">{t('top bid')}</div> : null}</td>
            <td className="r num">{r.bids || '—'}</td>
            <td className="small">{status(r)}</td>
            <td className="r"><button className="btn cv-act" onClick={e => { e.stopPropagation(); onOpen(r.id) }} disabled={!r.available}>{r.saleType === 'auction' ? t('Bid') : t('Make an offer')}</button></td>
          </tr>)}</tbody></table></div>}
      {total != null && items.length < total && <div className="cv-more-row"><button className="btn" disabled={busy} onClick={() => load(items.length)}>
        {busy ? t('Loading…') : t('Show {n} more', { n: Math.min(PAGE, total - items.length) })}</button></div>}
    </section>
  )
}

// ---- week and day grids -----------------------------------------------------------------------------------------------
type Panel = { title: string; sub: string; query?: Record<string, string>; list?: Record<string, string> }
type Fold = { date: string; channel: string | null; allDay: boolean; startsAt: string; endsAt: string; startMin: number; endMin: number
  programmes: number; slots: number; fromPrice: number; channels: string[] }
const mins = (iso: string) => dubai(iso).minutes
/** Where a programme block ends: its last break or its end time, at least half an hour after it starts; past midnight runs on. */
const progEnd = (g: Prog) => mins(g.startsAt) + Math.max(30, (Date.parse(g.endsAt) - Date.parse(g.startsAt)) / 60_000)

/**
 * A time grid: days across (week) or channels across (day). The server folds busy times (marketplace/search.ts grid): where more
 * than two programmes air at once, the grid shows one summary of them, which opens the matching slots as a sortable list.
 * So the grid reads the same with five outlets or five thousand.
 */
function TimeGrid({ s, from, to, reload, columns, onPanel, onDay }: { s: State; from: string; to: string; reload: number; columns: 'days' | 'channels'
  onPanel: (p: Panel) => void; onDay: (d: string) => void }) {
  const [data, setData] = useState<{ blocks: Prog[]; folds: Fold[] } | null>(null), [error, setError] = useState('')
  const latest = useLatest()
  useEffect(() => { setData(null); latest(api<{ blocks: Prog[]; folds: Fold[] }>(`/slots/grid?${query(s, from, to, { by: columns === 'days' ? 'day' : 'channel' })}`), d => { setData(d); setError('') }, e => setError(e.message)) },
    [from, to, s.f, s.mine, s.all, reload, columns])
  const days = columns === 'days' ? weekOf(from) : [from]
  const cols = columns === 'days' ? days.map(d => ({ key: d, label: <><span className="small muted">{dayLabel(d, { weekday: 'short' })}</span><b>{dayLabel(d, { day: 'numeric' })}</b></>, date: d, channel: undefined as string | undefined }))
    : CHANNELS.filter(c => !s.f.channels?.length || s.f.channels.includes(c)).map(c => ({ key: c, label: <ChannelMark c={c} label />, date: from, channel: c as string | undefined }))
  const blocks = data?.blocks ?? [], folds = data?.folds ?? []
  const inCol = (x: { date: string; channel: string | null }, c: { date: string; channel?: string }) => x.date === c.date && (!c.channel || x.channel === c.channel)
  const timedB = blocks.filter(g => !g.allDay), timedF = folds.filter(f => !f.allDay)
  // The hours worth showing: the earliest start to the latest end on screen, at least 8 hours.
  const starts = [...timedB.map(g => mins(g.startsAt)), ...timedF.map(f => f.startMin)], ends = [...timedB.map(progEnd), ...timedF.map(f => f.endMin)]
  const lo = starts.length ? Math.max(0, Math.floor(Math.min(...starts) / 60) - 1) : 6, hi = ends.length ? Math.min(24, Math.ceil(Math.max(...ends) / 60)) : 22
  const start = Math.min(lo, Math.max(0, hi - 8)), end = Math.max(hi, start + 8)
  const today = todayInDubai(), nowMin = mins(new Date().toISOString())
  const y = (m: number) => ((m - start * 60) / 60) * HOUR
  const open = (g: Prog) => onPanel({ title: `${g.outlet} · ${g.placement}`, sub: dayLabel(g.date, { weekday: 'long', day: 'numeric', month: 'long' }), query: { placement: g.placementId, date: g.date } })
  const openFold = (f: Fold) => onPanel({ title: t('{n} programmes', { n: f.programmes.toLocaleString('en-US') }),
    sub: `${dayLabel(f.date, { weekday: 'long', day: 'numeric', month: 'short' })} · ${f.allDay ? t('All day') : ltr(`${hhmm(f.startMin)}–${hhmm(f.endMin, true)}`)}${f.channel ? ` · ${CHANNEL_NAME[f.channel]}` : ''}`,
    list: { date: f.date, ...(f.allDay ? { dp: 'allday' } : { tmin: String(f.startMin), tmax: String(f.endMin) }), ...(f.channel ? { ch: f.channel } : {}) } })
  const width = columns === 'days' ? 130 : 170
  const gridCols = { gridTemplateColumns: `64px repeat(${cols.length}, minmax(${width}px, 1fr))` }
  if (error) return <p className="error">{error}</p>
  return (
    <section className="card cv-grid" aria-busy={!data}>
      <div className="cv-scroll-x"><div className="cv-grid-inner" style={{ minWidth: 64 + cols.length * width }}>
        <div className="cv-grid-head" style={gridCols}><div />{cols.map(c => <div key={c.key} className={`cv-colh ${c.date === today && columns === 'days' ? 'today' : ''} ${c.date < today ? 'past' : ''}`}>
          {columns === 'days' ? <button className="cv-colh-btn" onClick={() => onDay(c.date)} title={t('Open this day')}>{c.label}</button> : c.label}</div>)}</div>
        {blocks.some(g => g.allDay) || folds.some(f => f.allDay) ? <div className="cv-allday" style={gridCols}><div className="small muted cv-gutter">{t('All day')}</div>
          {cols.map(c => { const list = blocks.filter(g => g.allDay && inCol(g, c)), more = folds.find(f => f.allDay && inCol(f, c))
            return <div key={c.key} className="cv-allday-cell">{list.map(g => <Block key={g.placementId + g.date} g={g} compact onClick={() => open(g)} />)}
              {more && <button className="cv-moreb" onClick={() => openFold(more)}>{t('+{n} more from {price}', { n: more.programmes.toLocaleString('en-US'), price: money(more.fromPrice) })}</button>}</div> })}</div> : null}
        <div className="cv-grid-body" style={gridCols}>
          <div className="cv-hours" style={{ height: (end - start) * HOUR }}>{Array.from({ length: end - start }, (_, i) =>
            <span key={i} style={{ top: i * HOUR }}>{ltr(`${String(start + i).padStart(2, '0')}:00`)}</span>)}</div>
          {cols.map(c => { const list = timedB.filter(g => inCol(g, c)), fs = timedF.filter(f => inCol(f, c))
            const lay = layoutDay(list.map(g => ({ id: g.placementId + g.date, start: mins(g.startsAt), end: progEnd(g) })))
            return <div key={c.key} className={`cv-col ${c.date < today ? 'past' : ''} ${c.date === today ? 'today' : ''} ${columns === 'days' && dubai(c.date + 'T08:00:00Z').weekday >= 6 ? 'weekend' : ''}`}
              style={{ height: (end - start) * HOUR, backgroundSize: `100% ${HOUR}px` }}>
              {c.date === today && nowMin >= start * 60 && nowMin <= end * 60 && <div className="cv-now" style={{ top: y(nowMin) }} aria-hidden />}
              {list.map(g => { const l = lay.get(g.placementId + g.date)!, top = y(mins(g.startsAt)), h = Math.max(y(progEnd(g)) - top - 3, 30)
                return <Block key={g.placementId + g.date} g={g} tight={h < 54 || l.cols > 1 && h < 70} onClick={() => open(g)}
                  style={{ top, height: h, insetInlineStart: `calc(${(l.col / l.cols) * 100}% + 2px)`, width: `calc(${100 / l.cols}% - 4px)` }} /> })}
              {fs.map(f => { const top = y(f.startMin), h = Math.max(y(f.endMin) - top - 3, 30)
                return <button key={`${f.startMin}-${f.channel}`} className="cv-fold" style={{ top, height: h, insetInlineStart: 2, width: 'calc(100% - 4px)' }} onClick={() => openFold(f)}
                  title={t('{n} programmes', { n: f.programmes })}>
                  <span className="cv-fold-n"><b className="num">{f.programmes.toLocaleString('en-US')}</b> {t('programmes')}{h < 46 && <span className="small"> · {t('from {price}', { price: money(f.fromPrice) })}</span>}</span>
                  {h >= 52 && <span className="small num">{ltr(`${hhmm(f.startMin)}–${hhmm(f.endMin, true)}`)}</span>}
                  {h >= 46 && <span className="small">{t('from {price}', { price: money(f.fromPrice) })}</span>}
                  {h >= 76 && <span className="cv-fold-ch">{CHANNELS.filter(x => f.channels.includes(x)).map(x => <ChannelMark key={x} c={x} />)}</span>}
                </button> })}
            </div> })}
        </div>
      </div></div>
      {!data && <div className="cv-loading" aria-hidden />}
    </section>
  )
}
/** A time of day from minutes; an end time rounds up to the next five minutes so a run reads 06:00–08:45, not 08:41. */
const hhmm = (m: number, up = false) => { const r = up ? Math.ceil(m / 5) * 5 : Math.round(m); return `${String(Math.floor(r / 60) % 24).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }

/** A programme in the grid: its channel colour on the edge, the outlet, the time, the count and the lowest price. */
function Block({ g, onClick, style, compact, tight }: { g: Prog; onClick: () => void; style?: React.CSSProperties; compact?: boolean; tight?: boolean }) {
  const st = progStatus(g)
  // A short programme gets one line: the outlet and the price; the rest is in the tooltip and the panel.
  if (tight) return <button className={`cv-block tight ch-b-${g.channel} ${g.open ? '' : 'taken'}`} style={style} onClick={onClick}
    title={`${g.outlet} · ${g.placement} · ${time(g.startsAt)} · ${t('{n} slots', { n: g.slots })} · ${t('from {price}', { price: money(g.fromPrice) })}`}>
    <span className="cv-b1"><ChannelMark c={g.channel} /><b>{g.outlet}</b><span className="num cv-tprice">{money(g.fromPrice)}</span></span></button>
  return <button className={`cv-block ch-b-${g.channel} ${compact ? 'compact' : ''} ${g.open ? '' : 'taken'}`} style={style} onClick={onClick}
    title={`${g.outlet} · ${g.placement} · ${t('{n} slots', { n: g.slots })} · ${t('from {price}', { price: money(g.fromPrice) })}`}>
    <span className="cv-b1"><ChannelMark c={g.channel} /><b>{g.outlet}</b></span>
    {!compact && <span className="cv-b2 num">{g.allDay ? t('All day') : (Date.parse(g.endsAt) - Date.parse(g.startsAt)) < 120_000 ? ltr(time(g.startsAt)) : ltr(`${time(g.startsAt)}–${time(g.endsAt)}`)}</span>}
    <span className="cv-b3"><span className="num">{money(g.fromPrice)}</span>{g.slots > 1 && <span className="muted"> · {t('{n} slots', { n: g.slots })}</span>}</span>
    {!compact && st && <span className="cv-b4">{st}</span>}
  </button>
}

// ---- month ------------------------------------------------------------------------------------------------------------
/** A month of daily totals: how many slots, from what price, which channels; busier days are deeper in colour. */
function MonthView({ date, totals, narrow, onDay }: { date: string; totals: DayTotal[]; narrow: boolean; onDay: (d: string) => void }) {
  const weeks = monthGrid(date), month = date.slice(0, 7), today = todayInDubai(), by = new Map(totals.map(d => [d.date, d]))
  const max = Math.max(1, ...totals.map(d => d.slots))
  const level = (n: number) => n === 0 ? 0 : n / max > .66 ? 3 : n / max > .33 ? 2 : 1
  return (
    <section className="card cv-month" aria-label={t('Month')}>
      {[t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat'), t('Sun')].map(d => <div key={d} className="cv-month-h small muted">{d}</div>)}
      {weeks.flat().map(d => { const x = by.get(d), out = d.slice(0, 7) !== month, past = d < today
        return <button key={d} className={`cv-mcell lvl-${x ? level(x.slots) : 0} ${out ? 'out' : ''} ${past ? 'past' : ''} ${d === today ? 'today' : ''}`} disabled={!x}
          onClick={() => onDay(d)} aria-label={x ? `${dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${t('{n} slots', { n: x.slots })}, ${t('from {price}', { price: money(x.fromPrice) })}` : dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <span className="cv-mdate">{Number(d.slice(8))}</span>
          {x && <>
            <span className="cv-mcount"><b className="num">{x.slots.toLocaleString('en-US')}</b>{!narrow && <span className="small muted"> {t(x.slots === 1 ? 'slot' : 'slots')}</span>}</span>
            {!narrow && <span className="small muted num">{t('from {price}', { price: money(x.fromPrice) })}</span>}
            {!narrow && <span className="cv-mch">{CHANNELS.filter(c => x.channels.includes(c)).map(c => <ChannelMark key={c} c={c} />)}</span>}
            {!narrow && <span className="small muted">{t(x.outlets === 1 ? '1 outlet' : '{n} outlets', { n: x.outlets })}</span>}
          </>}
        </button> })}
    </section>
  )
}

// ---- outlets across the week ------------------------------------------------------------------------------------------
/** Outlets down, days across: each cell the count and lowest price. 50 outlets a page; search and sort narrow thousands. */
function OutletsView({ s, from, to, reload, onSort, onPanel }: { s: State; from: string; to: string; reload: number; onSort: (v: OSort) => void; onPanel: (p: Panel) => void }) {
  const [data, setData] = useState<{ total: number; items: OutletRow[] } | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState('')
  const latest = useLatest()
  useEffect(() => { setOffset(0) }, [from, to, s.f, s.mine, s.all, s.osort])
  useEffect(() => { latest(api<{ total: number; items: OutletRow[] }>(`/slots/outlets?${query(s, from, to, { sort: s.osort, offset, limit: OUTLET_PAGE })}`), d => { setData(d); setError('') }, e => setError(e.message)) },
    [from, to, s.f, s.mine, s.all, s.osort, offset, reload])
  const days = weekOf(from), today = todayInDubai()
  const prices = (data?.items ?? []).flatMap(o => o.days.map(d => d.fromPrice))
  const lo = Math.min(...prices), hi = Math.max(...prices)
  // Cheaper cells read lighter: a quiet guide for comparing price across a row or a column.
  const shade = (p: number) => hi > lo ? Math.round(((p - lo) / (hi - lo)) * 3) : 0
  const pages = data ? Math.ceil(data.total / OUTLET_PAGE) : 0, pageNo = Math.floor(offset / OUTLET_PAGE) + 1
  return (
    <section className="card cv-outlets">
      <div className="cv-list-bar">
        <span className="small muted" role="status">{!data ? t('Loading…') : t('{n} outlets with slots this week', { n: data.total.toLocaleString('en-US') })}</span>
        <span className="spacer" />
        <label className="small muted" htmlFor="cv-osort">{t('Sort by')}</label>
        <select id="cv-osort" className="cal-input cv-sort" value={s.osort} onChange={e => onSort(e.target.value as OSort)}>
          <option value="name">{t('Name')}</option><option value="price">{t('Lowest price')}</option><option value="slots">{t('Most slots')}</option></select>
      </div>
      {error && <p className="error pad">{error}</p>}
      <div className="table-wrap"><table className="table cv-otable">
        <thead><tr><th className="cv-ocol">{t('Outlet')}</th>{days.map(d => <th key={d} className={`num ${d === today ? 'today' : ''}`}>{dayLabel(d, { weekday: 'short', day: 'numeric' })}</th>)}<th className="r">{t('Week')}</th></tr></thead>
        <tbody>{(data?.items ?? []).map(o => <tr key={o.outletId}>
          <th className="cv-ocol" scope="row"><span className="cv-outlet">{o.logoUrl ? <img src={o.logoUrl} width={24} height={24} alt="" className="cv-logo" loading="lazy" /> : <ChannelMark c={o.channel} />}
            <span><b>{o.outlet}</b><span className="small muted">{CHANNEL_NAME[o.channel]}</span></span></span></th>
          {days.map(d => { const x = o.days.find(y => y.date === d)
            return <td key={d} className={`cv-ocell ${d < today ? 'past' : ''}`}>{x ? <button className={`cv-obtn shade-${shade(x.fromPrice)}`}
              onClick={() => onPanel({ title: o.outlet, sub: dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' }), query: { outlet: o.outletId, date: d } })}>
              <b className="num">{money(x.fromPrice)}</b><span className="small muted">{t(x.slots === 1 ? '1 slot' : '{n} slots', { n: x.slots })}</span></button> : <span className="muted">—</span>}</td> })}
          <td className="r num small"><b>{o.slots}</b><div className="muted">{t('from {price}', { price: money(o.fromPrice) })}</div></td>
        </tr>)}</tbody></table></div>
      {pages > 1 && <nav className="cv-pager" aria-label={t('Pages')}>
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(offset - OUTLET_PAGE)}><Chevron dir="back" /> {t('Previous')}</button>
        <span className="small muted">{t('Page {n} of {total}', { n: pageNo, total: pages })}</span>
        <button className="btn" disabled={pageNo >= pages} onClick={() => setOffset(offset + OUTLET_PAGE)}>{t('Next')} <Chevron dir="fwd" /></button></nav>}
    </section>
  )
}

// ---- side panel: the slots behind a block, a cell or a "+N more" ---------------------------------------------------------
function SlotsPanel({ p, s, onClose, onOpen }: { p: Panel; s: State; onClose: () => void; onOpen: (id: string) => void; onPanel: (p: Panel) => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null), [total, setTotal] = useState(0), [sort, setSort] = useState<Sort>('price_asc'), [busy, setBusy] = useState(false)
  const latest = useLatest()
  // One programme or an outlet's day: every slot, taken ones included. A folded time: the matching open slots, sorted and paged.
  const load = (offset: number) => {
    if (p.query) { const d = p.query.date; return latest(api<Slot[]>(`/slots?${query({ ...s, all: true }, d, addDays(d, 1), p.query)}`), x => { setSlots(x); setTotal(x.length) }, () => setSlots([])) }
    if (!p.list) return
    const d = p.list.date; setBusy(true)
    latest(api<{ total: number; items: Slot[] }>(`/slots/list?${query(s, d, addDays(d, 1), { ...p.list, sort, offset, limit: PAGE })}`),
      r => { setSlots(cur => offset ? [...(cur ?? []), ...r.items] : r.items); setTotal(r.total); setBusy(false) }, () => { setSlots([]); setBusy(false) })
  }
  useEffect(() => { setSlots(null); load(0) }, [p, sort])
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
  const order = { single: 0, any: 1, package: 2 }
  const shown = !slots ? null : p.list ? slots : [...slots].sort((a, b) => Number(b.available) - Number(a.available) || order[a.kind] - order[b.kind] || a.startsAt.localeCompare(b.startsAt))
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={p.title} onClick={e => e.stopPropagation()}>
        <header className="drawer-h"><div><h2>{p.title}</h2><p className="muted small">{p.sub}</p></div>
          <button className="btn" onClick={onClose} aria-label={t('Close')}>✕</button></header>
        {p.list && <div className="cv-panel-bar"><span className="small muted">{slots ? t('{n} slots', { n: total.toLocaleString('en-US') }) : t('Loading…')}</span><span className="spacer" />
          <select className="cal-input cv-sort" aria-label={t('Sort by')} value={sort} onChange={e => setSort(e.target.value as Sort)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
        {!shown ? <p className="muted">{t('Loading…')}</p>
        : <ul className="list">{shown.map(x =>
            <li key={x.id}><button className="row" onClick={() => onOpen(x.id)} disabled={!x.available}>
              <span>{p.list ? <><span className="cv-outlet"><ChannelMark c={x.channel} /><b>{x.outlet}</b></span><br />
                <span className="small muted">{x.placement}{x.label !== x.placement ? ` · ${tm(x.label)}` : ''}{x.endsAt || dubai(x.startsAt).minutes ? <span className="num"> · {time(x.startsAt)}</span> : null}</span></>
                : <><b>{tm(x.label)}</b>{x.kind === 'single' && (x.endsAt || dubai(x.startsAt).minutes) ? <span className="muted num"> · {time(x.startsAt)}</span> : null}
                  {p.query?.outlet && <span className="small muted"> · {x.placement}</span>}</>}
                <br /><SaleType t={x.saleType} /></span>
              <span className="right"><b className="num">{money(x.topBid ?? x.startingPrice)}</b><br /><span className="small">{status(x)}</span></span>
            </button></li>)}</ul>}
        {shown && !shown.length && <p className="muted">{t('Nothing here any more.')}</p>}
        {p.list && shown && shown.length < total && <button className="btn" disabled={busy} onClick={() => load(shown.length)}>{busy ? t('Loading…') : t('Show {n} more', { n: Math.min(PAGE, total - shown.length) })}</button>}
      </aside>
    </div>
  )
}

