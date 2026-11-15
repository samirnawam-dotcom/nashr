import { useEffect, useRef, useState } from 'react'
import { api, type Slot } from '../api'
import { closesIn, dayLabel, hasTime, money, time } from '../format'
import { OutletMark } from '../LogoPicker'
import { addDays, dubai, monthGrid, todayInDubai, weekOf } from './layout'
import { BidDrawer, INDUSTRIES } from './BidDrawer'
/** The seller's Sectors accepted pick-list (the product form uses the same list). */
const SECTORS = INDUSTRIES.filter(x => x !== 'Other')
import { useLive } from '../live'
import { rememberPlace, useGuest } from '../guest'
import { PAGES, useMeta } from '../seo'
import { SavedSearches } from './SavedSearches'
import { CampaignDrawer, setCurrentCampaign, useCampaigns, useCurrentCampaign } from './CampaignDrawer'
import { activeCount, DAYPARTS, type Daypart, type SlotFilter } from '../../../server/shared/slot-filter'
import { isAr, sep, t } from '../i18n'
import { tm } from '../i18n-server'
import './calendar.css'
import { CHANNELS, CHANNEL_NAME, ICON } from '../media'
import { DateJump } from './ops'
import { MyBids } from './MyBids'
export { CHANNELS, CHANNEL_NAME }

/*
 * The calendar, built for a marketplace of 1000+ outlets. The server filters, sorts, pages and summarises (marketplace/search.ts);
 * this screen asks only for what it shows. Five ways to look: a sortable list, a day by channel, a week, a month of daily totals,
 * and outlets across the week. The view, the date and every filter live in the address, so links, Back and refresh keep them.
 */

type View = 'list' | 'day' | 'week' | 'month' | 'outlets'
type Sort = 'time' | 'price_asc' | 'price_desc' | 'closing' | 'bids' | 'popular'
type OSort = 'popular' | 'price' | 'price_desc' | 'closing' | 'name' | 'slots'
type DayTotal = { date: string; slots: number; outlets: number; fromPrice: number; channels: string[] }
// product and campaign narrow the calendar to one product or one campaign's products ("Check availability")
type State = { view: View; date: string; f: SlotFilter; mine: boolean; all: boolean; sort: Sort; osort: OSort; product?: string; item?: string; productName?: string; campaign?: string; fit?: number }

// owner's buyer-side fixes, round 2: Day, Week and Month, one layout (outlet rows with their products); Week is the default
const VIEWS: [View, string, string][] = [['day', t('Day'), 'd'], ['week', t('Week'), 'w'], ['month', t('Month'), 'm']]
/** One "Sort by:" for the whole calendar (the Week rows, and the list on phones). Default: most popular. */
const CAL_SORTS: [OSort, string, Sort][] = [['popular', 'Most popular', 'popular' as Sort], ['price', 'Price: low to high', 'price_asc'], ['price_desc', 'Price: high to low', 'price_desc'], ['closing', 'Closing soonest', 'closing']]
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

// ---- the address is the state -----------------------------------------------------------------------------------------
const isView = (v: string | null): v is View => !!v && VIEWS.some(([k]) => k === v)
function readState(narrow: boolean): State {
  const p = new URLSearchParams(location.search), list = (k: string) => p.get(k)?.split(',').filter(Boolean)
  let saved: View | null = null; try { saved = localStorage.getItem('nashr:cal-view') as View | null } catch { /* private mode */ }
  // older addresses (list, by outlet) open the Week
  const old = (v: string | null) => v === 'list' || v === 'outlets' ? 'week' : v
  const view = isView(old(p.get('view'))) ? old(p.get('view')) as View : isView(old(saved)) ? old(saved) as View : 'week'
  return { view, date: /^\d{4}-\d{2}-\d{2}$/.test(p.get('date') ?? '') ? p.get('date')! : todayInDubai(),
    f: { channels: list('ch'), saleTypes: list('sale'), sector: p.get('sector') || undefined, maxPrice: p.get('max') ? Number(p.get('max')) : undefined, minPrice: p.get('min') ? Number(p.get('min')) : undefined,
      dayparts: list('dp') as Daypart[] | undefined, q: p.get('q') || undefined, closingWithinHours: p.get('soon') ? Number(p.get('soon')) : undefined, audiences: list('aud') },
    mine: p.get('mine') === '1', all: p.get('all') === '1', sort: (p.get('sort') as Sort) || 'time', osort: (p.get('osort') as OSort) || 'popular', fit: p.get('fit') ? Number(p.get('fit')) : undefined,
    product: p.get('product') || undefined, item: p.get('item') || undefined, productName: p.get('pname') || undefined, campaign: p.get('campaign') || undefined }
}
function writeState(s: State, push: boolean) {
  const p = new URLSearchParams(location.search)
  const put = (k: string, v: string | number | undefined | null | false) => v === undefined || v === null || v === '' || v === false ? p.delete(k) : p.set(k, String(v))
  put('view', s.view); put('date', s.date); put('ch', s.f.channels?.join(',')); put('sale', s.f.saleTypes?.join(',')); put('sector', s.f.sector)
  put('max', s.f.maxPrice); put('min', s.f.minPrice); put('dp', s.f.dayparts?.join(',')); put('aud', s.f.audiences?.join(',')); put('q', s.f.q); put('soon', s.f.closingWithinHours); put('mine', s.mine && '1'); put('all', s.all && '1')
  put('sort', s.sort === 'time' ? null : s.sort); put('osort', s.osort === 'popular' ? null : s.osort); put('fit', s.fit)
  put('product', s.product); put('item', s.item); put('pname', (s.product || s.item) && s.productName); put('campaign', s.campaign)
  const url = `${location.pathname}?${p.toString()}`
  if (url !== location.pathname + location.search) history[push ? 'pushState' : 'replaceState'](null, '', url)
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

export function CalendarPage() {
  const guest = useGuest(), narrow = useNarrow(), [planOpen, setPlanOpen] = useState(false)
  // the campaign drawer (owner's buyer-side fixes: "Plan" becomes "Campaign")
  const [campaignId] = useCurrentCampaign(), { list: campaigns } = useCampaigns(!guest), campaign = campaigns.find(c => c.id === campaignId)
  useMeta(PAGES['/calendar'])
  const [s, setS] = useState<State>(() => readState(narrow))
  const [qText, setQText] = useState(s.f.q ?? '')
  // ?slot=<id> opens that slot's bid drawer (links from bookings, the inbox, campaigns)
  const [open, setOpenRaw] = useState<string | null>(() => new URLSearchParams(location.search).get('slot'))
  const setOpen = (id: string | null) => { setOpenRaw(id)
    if (!id && new URLSearchParams(location.search).has('slot')) { const q = new URLSearchParams(location.search); q.delete('slot'); history.replaceState(null, '', `${location.pathname}?${q}`) } }
  const [panel, setPanel] = useState<Panel | null>(null), [sheet, setSheet] = useState(false)
  const [totals, setTotals] = useState<DayTotal[] | null>(null), [next, setNext] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  // Someone bid, booked or relisted: refresh the grid and outlet views quietly (the list updates the rows it shows).
  const [live, setLive] = useState(0)
  useLive('slot', () => setLive(n => n + 1), 1500)
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
  const active = activeCount(s.f, { channels: CHANNELS.length, saleTypes: SALE_TYPES.length }) + (s.mine ? 1 : 0) + (s.all ? 1 : 0) + (s.product || s.item ? 1 : 0) + (s.campaign ? 1 : 0) + (s.fit != null ? 1 : 0)
  // "Check availability" on a campaign: it becomes the campaign the bid drawer and the Campaign drawer use
  useEffect(() => { if (s.campaign && !guest) setCurrentCampaign(s.campaign) }, [s.campaign])
  const clear = () => { setQText(''); update({ f: { channels: undefined, saleTypes: undefined, sector: undefined, maxPrice: undefined, dayparts: undefined, q: undefined, closingWithinHours: undefined, audiences: undefined, minPrice: undefined }, mine: false, all: false, fit: undefined, product: undefined, item: undefined, productName: undefined, campaign: undefined }) }
  const step = (n: number) => {
    if (s.view === 'month') { const d = new Date(s.date + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); return update({ date: d.toISOString().slice(0, 10) }, true) }
    update({ date: addDays(s.date, n * (s.view === 'day' ? 1 : s.view === 'list' ? LIST_DAYS : 7)) }, true)
  }

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
  const filterProps = { s, update, qText, setQText, guest, active, clear, search, budget: campaign && campaign.remaining != null ? { name: campaign.name, remaining: campaign.remaining } : null }

  return (
    <main className="cv">
      <header className="cv-head">
        <div className="cv-title">
          <h1>{t('Calendar')}</h1>
          <p className="cv-range"><b>{title}</b>{total != null && <span className="muted">{s.all ? t(total === 1 ? '1 slot' : '{n} slots', { n: total.toLocaleString('en-US') }) : t('{n} on sale', { n: total.toLocaleString('en-US') })}</span>}</p>
        </div>
        <div className="cv-nav" role="group" aria-label={t('Dates')}>
          <button className="btn" onClick={() => update({ date: todayInDubai() }, true)} title={t('Today (T)')}>{t('Today')}</button>
          <button className="btn icon" aria-label={t('Previous')} title={t('Previous (←)')} onClick={() => step(-1)}><Chevron dir="back" /></button>
          <button className="btn icon" aria-label={t('Next')} title={t('Next (→)')} onClick={() => step(1)}><Chevron dir="fwd" /></button>
          <DateJump date={s.date} onDate={d => update({ date: d }, true)} />
        </div>
        {!guest && <button type="button" className={`btn cv-plan ${campaign ? 'has' : ''}`} onClick={() => setPlanOpen(true)} title={campaign?.name}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
          {t('Campaign')}{campaign && campaign.lines > 0 && <span className="cv-plan-n num">{campaign.lines}</span>}</button>}
        {<label className="cv-sortby"><span>{t('Sort by:')}</span><select className="cal-input" value={s.osort} onChange={e => update({ osort: e.target.value as OSort })}>
          {CAL_SORTS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></label>}
        <div className="seg cv-views" role="tablist" aria-label={t('View')}>{VIEWS.map(([v, l, key]) =>
          <button key={v} role="tab" aria-selected={s.view === v} className={s.view === v ? 'on' : ''} title={`${l} (${key.toUpperCase()})`} onClick={() => update({ view: v }, true)}>{l}</button>)}</div>
      </header>

      {guest && <div className="cv-guest" role="note">
        <span className="cv-guest-t"><b>{t('You are browsing as a guest.')}</b> {t('Every slot and price is open to read. Sign in to bid or book.')}</span>
        <a className="btn primary sm" href="/sign-in" onClick={rememberPlace}>{t('Sign in')}</a><a className="btn sm" href="/request-access" onClick={rememberPlace}>{t('Request access')}</a></div>}
      {narrow ? <div className="cv-mobilebar">
        <input ref={search} className="search" type="search" placeholder={t('Search outlets, programmes, sectors')} aria-label={t('Search')} value={qText} onChange={e => setQText(e.target.value)} />
        <button className={`btn ${active ? 'primary' : ''}`} onClick={() => setSheet(true)}>{active ? t('Filters ({n})', { n: active }) : t('Filters')}</button>
      </div> : <FilterBar {...filterProps} />}
      {narrow && sheet && <div className="scrim" onClick={() => setSheet(false)}><div className="cv-sheet" role="dialog" aria-label={t('Filters')} onClick={e => e.stopPropagation()}>
        <header className="drawer-h"><h2>{t('Filters')}</h2><button className="btn" onClick={() => setSheet(false)} aria-label={t('Close')}>✕</button></header>
        <FilterBar {...filterProps} stacked />
        <footer className="drawer-f"><button className="btn primary" onClick={() => setSheet(false)}>{total != null ? t('Show {n} slots', { n: total.toLocaleString('en-US') }) : t('Show slots')}</button>
          {active > 0 && <button className="btn" onClick={clear}>{t('Clear all')}</button>}</footer>
      </div></div>}

      {(s.product || s.item || s.campaign) && <div className="cv-scope" role="status">
        {s.campaign && <span className="cv-chip">{t('Products in {name}', { name: campaigns.find(c => c.id === s.campaign)?.name ?? t('this campaign') })}
          <button type="button" aria-label={t('Show everything')} onClick={() => update({ campaign: undefined })}>✕</button></span>}
        {(s.product || s.item) && <span className="cv-chip">{s.productName ? t('Only {name}', { name: s.productName }) : t('One product')}
          <button type="button" aria-label={t('Show everything')} onClick={() => update({ product: undefined, item: undefined, productName: undefined })}>✕</button></span>}
      </div>}
      {total === 0 && <div className="cv-empty" role="status">
        <p><b>{active ? t('Nothing matches these filters in this period.') : t('Nothing open to book in this period.')}</b>{' '}
          <span className="muted">{t('Bidding closes a few days before air, so the nearest days are often already closed.')}</span></p>
        <div className="row-flex">{next && <button className="btn primary" onClick={() => update({ date: next }, true)}>{t('Jump to {date}', { date: dayLabel(next, { weekday: 'short', day: 'numeric', month: 'short' }) })}</button>}
          {active > 0 && <button className="btn" onClick={clear}>{t('Clear filters')}</button>}</div>
      </div>}

      <div className={`cv-body ${guest ? '' : 'with-bids'}`}>
        {!guest && narrow && <MyBids onOpen={setOpen} reload={reload} narrow />}
        <RowsView s={s} view={s.view} from={from} to={to} reload={reload} live={live} onOpen={setOpen} onPick={setPanel} />
        {!guest && !narrow && <MyBids onOpen={setOpen} reload={reload} narrow={false} />}
      </div>

      <footer className="cv-foot small muted">
        <span>{t('Dubai time. Prices exclude VAT. You pay only once the publisher accepts, and the money is held until the ad has run.')}</span>
        {!narrow && <span className="cv-keys">{t('Shortcuts: ← → move · T today · D W M views · / search')}</span>}
      </footer>

      {panel && <SlotsPanel p={panel} s={s} onClose={() => setPanel(null)} onOpen={id => { setPanel(null); setOpen(id) }} onPanel={setPanel} />}
      {open && <BidDrawer slotId={open} onClose={() => setOpen(null)} onDone={() => setReload(n => n + 1)} />}
      {planOpen && !open && <CampaignDrawer onClose={() => setPlanOpen(false)} onSeeDates={(id, name) => { setPlanOpen(false); setQText(''); update({ item: id, product: undefined, productName: name, campaign: undefined, f: { q: undefined } }, true) }} />}
    </main>
  )
}

export const Chevron = ({ dir }: { dir: 'back' | 'fwd' }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden
  className="flip-rtl"><path d={dir === 'back' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>

/** The "Closes in 16h" tag: bidding closes within the next 24 hours (the bid drawer's wording). */
const soon = (iso: string) => { const ms = new Date(iso).getTime() - Date.now(); return ms > 0 && ms <= 24 * 3_600_000 }

// ---- filters ----------------------------------------------------------------------------------------------------------
type FilterProps = { s: State; update: (p: Partial<State>, push?: boolean) => void; qText: string; setQText: (v: string) => void; guest: boolean; active: number
  clear: () => void; search: React.RefObject<HTMLInputElement | null>; stacked?: boolean; budget?: { name: string; remaining: number } | null }

/** One row of filters above the calendar (a sheet on phones): search, channels, sale type, time of day, more, saved searches. */
function FilterBar({ s, update, qText, setQText, guest, active, clear, search, stacked, budget }: FilterProps) {
  const toggle = (list: string[] | undefined, v: string, all: readonly string[]) => {
    const cur = new Set(list?.length ? list : []); cur.has(v) ? cur.delete(v) : cur.add(v)
    return cur.size === 0 || cur.size === all.length ? undefined : [...cur]
  }
  const on = (list: string[] | undefined, v: string) => !!list?.includes(v)
  const more = (s.f.closingWithinHours != null ? 1 : 0) + (s.mine ? 1 : 0) + (s.all ? 1 : 0)
  const aed = (v: string) => { const n = v.replace(/[^\d]/g, ''); return n ? Number(n) * 100 : undefined }
  // owner's buyer-side fixes: "AED from … to …" after the sale type, and "Fits my budget" when a campaign is chosen
  const price = <div className="cv-price" role="group" aria-label={t('Price')}>
    <input className="cal-input" inputMode="numeric" aria-label={t('AED from')} placeholder={t('AED from')} value={s.f.minPrice != null ? String(s.f.minPrice / 100) : ''} onChange={e => update({ f: { minPrice: aed(e.target.value) } })} />
    <span aria-hidden>–</span>
    <input className="cal-input" inputMode="numeric" aria-label={t('to')} placeholder={t('to')} value={s.f.maxPrice != null ? String(s.f.maxPrice / 100) : ''} onChange={e => update({ f: { maxPrice: aed(e.target.value) } })} />
    {budget && <label className="switch cv-fits" title={t('{amount} left in {name}', { amount: money(budget.remaining), name: budget.name })}>
      <input type="checkbox" role="switch" checked={s.fit != null} onChange={e => update({ fit: e.target.checked ? Math.max(0, budget.remaining) : undefined })} />
      <span className="switch-track" aria-hidden><span /></span>{t('Fits my budget')}</label>}
  </div>
  const moreFields = <div className="cv-more">
    <label className="switch"><input type="checkbox" role="switch" checked={s.f.closingWithinHours != null} onChange={e => update({ f: { closingWithinHours: e.target.checked ? 24 : undefined } })} />
      <span className="switch-track" aria-hidden><span /></span>{t('Bidding closes within 24 hours')}</label>
    {!guest && <label className="switch"><input type="checkbox" role="switch" checked={s.mine} onChange={e => update({ mine: e.target.checked })} />
      <span className="switch-track" aria-hidden><span /></span>{t('Only slots I bid on')}</label>}
    <label className="switch"><input type="checkbox" role="switch" checked={s.all} onChange={e => update({ all: e.target.checked })} />
      <span className="switch-track" aria-hidden><span /></span>{t('Show taken and closed slots')}</label>
  </div>
  const dayparts = <div className="cv-checks">{DAYPARTS.map(([v, l]) => <label key={v} className="check"><input type="checkbox" checked={on(s.f.dayparts, v)}
    onChange={() => update({ f: { dayparts: toggle(s.f.dayparts, v, DAYPARTS.map(d => d[0])) as Daypart[] | undefined } })} />{t(l)}</label>)}</div>
  // Sectors (owner's buyer-side fixes, round 2): the advertiser industries a product takes ads from, the seller's own pick-list.
  // Products set to all sectors always show; a product that lists the sector as not accepted never does.
  const sectors = <div className="cv-checks" role="radiogroup" aria-label={t('Sectors')}>
    <label className="check"><input type="radio" name="cv-sector" checked={!s.f.sector} onChange={() => update({ f: { sector: undefined } })} />{t('Any sector')}</label>
    {SECTORS.map(v => <label key={v} className="check"><input type="radio" name="cv-sector" checked={s.f.sector === v} onChange={() => update({ f: { sector: v } })} />{t(v)}</label>)}</div>
  const filter = { ...s.f }
  return (
    <section className={`cv-filters ${stacked ? 'stacked' : ''}`} aria-label={t('Filters')}>
      {!stacked && <input ref={search} className="search cv-search" type="search" placeholder={t('Search outlets, programmes, sectors')} aria-label={t('Search')}
        value={qText} onChange={e => setQText(e.target.value)} />}
      <div className="cv-group" role="group" aria-label={t('Media type')}><span className="cv-label">{t('Media type:')}</span>
        {CHANNELS.map(c => <button key={c} type="button" className={`chipf ${on(s.f.channels, c) ? 'on' : ''}`} aria-pressed={on(s.f.channels, c)}
          onClick={() => update({ f: { channels: toggle(s.f.channels, c, CHANNELS) } })}><ChannelMark c={c} label /></button>)}</div>
      <div className="cv-group" role="group" aria-label={t('Sale type')}><span className="cv-label">{t('Sale type:')}</span>
        {SALE_TYPES.map(v => <button key={v} type="button" className={`chipf ${on(s.f.saleTypes, v) ? 'on' : ''}`} aria-pressed={on(s.f.saleTypes, v)}
          onClick={() => update({ f: { saleTypes: toggle(s.f.saleTypes, v, [...SALE_TYPES]) } })}><SaleIcon k={v} />{saleLabel(v)}</button>)}
        {!stacked && price}</div>
      {stacked && <><span className="cv-label">{t('Price:')}</span>{price}</>}
      {stacked ? <><span className="cv-label">{t('Sectors')}</span>{sectors}<span className="cv-label">{t('Time of day')}</span>{dayparts}<span className="cv-label">{t('More filters')}</span>{moreFields}</> : <>
        <Popover label={<>{t('Sectors')}{s.f.sector ? <span className="cv-count">1</span> : null}</>} on={!!s.f.sector}>{sectors}</Popover>
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
function RowsView({ s, view, from, to, reload, live, onOpen, onPick }: { s: State; view: View; from: string; to: string; reload: number; live: number
  onOpen: (id: string) => void; onPick: (p: Panel) => void }) {
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
  const total = view !== 'day' // the right-hand column: per product, what is on sale in the whole range
  const pick = (o: OutletRows, p: ProductRow, c: Cell) => {
    if (!c.onSale) return
    if (c.items?.length === 1) return onOpen(c.items[0].id)
    onPick({ title: `${o.outlet} · ${p.placement}`, sub: colLabel(c.col), query: { placement: p.placementId }, from: c.col, days: view === 'month' ? 7 : 1 })
  }
  return (
    <section className={`card cv-rows rv-${view}`}>
      <div className="cv-list-bar">
        <span className="small muted" role="status">{!data ? t('Loading…') : data.total === 1 ? t('1 outlet') : t('{n} outlets', { n: data.total.toLocaleString('en-US') })}</span>
        <span className="spacer" /><span className="small muted">{t('Prices in AED, before VAT')}</span>
      </div>
      {error && <p className="error pad">{error}</p>}
      <div className="table-wrap"><table className="table cv-rtable" style={{ minWidth: (view === 'day' ? 260 + 320 : 176 + cols.length * 76) + (total ? 100 : 0) }}>
        <colgroup><col className="c-p" />{cols.map(c => <col key={c} className="c-d" />)}{total && <col className="c-t" />}</colgroup>
        <thead><tr><th className="cv-pcol">{t('Outlet')}</th>
          {cols.map(c => <th key={c} className={`num ${isNow(c) ? 'today' : ''}`}>{colLabel(c)}</th>)}
          {total && <th className="r cv-tot">{view === 'month' ? t('Month') : t('Week')}</th>}</tr></thead>
        {(data?.outlets ?? []).map(o => { const open = !folded.has(o.key)
          return <tbody key={o.key} className="cv-outlet-group">
            <tr className="cv-orow"><th scope="rowgroup" colSpan={cols.length + 1 + (total ? 1 : 0)}>
              <button type="button" className="cv-fold" aria-expanded={open} onClick={() => fold(o.key)}>
                <svg className={`cv-arrow ${open ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
                <OutletMark name={o.outlet} url={o.logoUrl} size={30} />
                <span className="cv-oname"><b dir="auto">{o.outlet}</b><span className="small muted">{o.channels.map(c => CHANNEL_NAME[c] ?? c).join(sep)}</span></span>
                {!open && <span className="small muted">{o.products.length === 1 ? t('1 product') : t('{n} products', { n: o.products.length })}</span>}
              </button></th></tr>
            {open && o.products.map(p => <tr key={p.placementId} className="cv-prow">
              <th scope="row" className="cv-pcol"><span className="cv-pname"><b dir="auto">{o.outlet} · {p.placement}</b>
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
    </div>
  )
}

