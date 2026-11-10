import { navigate } from '../nav'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { dayLabel, time } from '../format'
import { addDays, dubai, monthGrid, todayInDubai, weekOf } from '../calendar/layout'
import { DealStatus, SLOT_STATUS, money, when } from './common'
import { ListingPanel, type Product } from './Listing'
import { SALE_TYPES, SaleIcon, saleLabel, useLatest, useNarrow } from '../calendar/CalendarPage'
import { DateNav, FilterFold, OpsList, statusesOf, useAddress } from '../calendar/ops'
import { CHANNEL_NAME, ICON, art } from '../media'
import { family } from '../../../server/shared/media'
import { ltr, sep, t } from '../i18n'
import { CompanyCard, type CompanyProfile } from '../CompanyCard'
import { tm } from '../i18n-server'

type SSlot = { id: string; outletId?: string; outlet: string; channel: string; placement: string; label: string; kind: string; saleType: string; startsAt: string; endsAt: string | null
  closesAt: string; status: string; startingPrice: number; buyNowPrice: number | null; reservePrice: number | null; topBid: number | null; bids: number }

type View = 'day' | 'week' | 'list' | 'month'

/** The four states a publisher acts on: the tile's name and what its money line says. Each maps to the server's status group for the list. */
const TILES: [string, string, string][] = [['pend', 'To decide', '{amount} offered'], ['bid', 'With bids', '{amount} in top bids'],
  ['acc', 'Booked', '{amount} booked'], ['open', 'Still on sale', '{amount} at starting prices']]
const STATE_GROUP: Record<string, string> = { pend: 'waiting', bid: 'on_sale', acc: 'booked', open: 'on_sale' }
const VIEWS: [View, string][] = [['day', t('Day')], ['week', t('Week')], ['month', t('Month')], ['list', t('List')]]

/** The owner's bid status for a slot: open for bids, bidding (n), pending your decision, bid accepted; anything else as it is. */
export function bidState(s: { status: string; saleType: string; bids: number }): [string, string] {
  if (s.status === 'open') return !s.bids ? [s.saleType === 'auction' ? t('Open for bids') : t('On sale'), 'open']
    : s.saleType === 'auction' ? [t('Bidding ({n})', { n: s.bids }), 'bid'] : [t('{n} interested', { n: s.bids }), 'bid']
  if (s.status === 'awaiting_seller' || s.status === 'awaiting_choice') return [t('Pending'), 'pend']
  if (s.status === 'booked') return [s.saleType === 'auction' ? t('Bid accepted') : t('Booked'), 'acc']
  return [t(SLOT_STATUS[s.status] ?? s.status), 'off']
}
export function BidChip({ s }: { s: { status: string; saleType: string; bids: number } }) {
  const [label, k] = bidState(s)
  return <span className={`bchip b-${k}`}>{k === 'acc' ? <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.5l2.2 2.2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    : k === 'pend' ? <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M6 3.5V6l1.6 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    : <i aria-hidden />}{label}</span>
}

export function SchedulePage() {
  let saved = 'day'; try { saved = localStorage.getItem('nashr:seller-view') ?? 'day' } catch { /* private mode */ }
  const [a, update] = useAddress({ view: saved === 'programme' ? 'day' : saved, date: todayInDubai(), bs: '', lay: 'prog', sale: '', outlet: '', q: '' })
  const view = (VIEWS.some(v => v[0] === a.view) ? a.view : 'day') as View, lay = a.lay === 'time' ? 'time' : 'prog'
  const [slots, setSlots] = useState<SSlot[] | null>(null), [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<false | { date: string; product?: string }>(false), [products, setProducts] = useState<Product[]>([])
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]), [error, setError] = useState(''), [reload, setReload] = useState(0), [qText, setQText] = useState(a.q)
  const latest = useLatest(), narrow = useNarrow(), wide = useWide()
  useEffect(() => { try { localStorage.setItem('nashr:seller-view', view) } catch { /* fine */ } }, [view])
  useEffect(() => { api<{ outlets: { id: string; name: string }[] }>('/seller/profile').then(p => setOutlets(p.outlets), () => {}); api<Product[]>('/seller/products').then(setProducts, () => {}) }, [])
  useEffect(() => { const k = setTimeout(() => qText !== a.q && update({ q: qText }), 300); return () => clearTimeout(k) }, [qText])
  const week = weekOf(a.date), grid = monthGrid(a.date)
  const [from, to] = view === 'month' ? [grid[0][0], addDays(grid.at(-1)![6], 1)] : view === 'list' ? [a.date, addDays(a.date, 28)] : view === 'day' ? [a.date, addDays(a.date, 1)] : [week[0], addDays(week[6], 1)]
  const states = a.bs ? a.bs.split(',').filter(k => k in STATE_GROUP) : [], groups = [...new Set(states.map(k => STATE_GROUP[k]))], sales = a.sale ? a.sale.split(',') : []
  const qs = new URLSearchParams({ from: `${from}T00:00:00+04:00`, to: `${to}T00:00:00+04:00`, ...(groups.length ? { st: statusesOf(groups).join(',') } : {}),
    ...(sales.length ? { sale: sales.join(',') } : {}), ...(a.outlet ? { outlet: a.outlet } : {}), ...(a.q.trim() ? { q: a.q.trim() } : {}) }).toString()
  const load = () => {
    if (view !== 'list') latest(api<SSlot[]>(`/seller/slots?from=${from}T00:00:00%2B04:00&to=${to}T00:00:00%2B04:00`), setSlots, e => setError(e.message))
    setReload(n => n + 1)
  }
  useEffect(() => { setSlots(null); load() }, [view, from, to])
  // Day, week and month filter what is on screen in the browser, with the same rules the server uses for the list.
  const words = a.q.toLowerCase().split(/\s+/).filter(Boolean)
  const base = (slots ?? []).filter(x => (!sales.length || sales.includes(x.saleType))
    && (!a.outlet || x.outletId === a.outlet) && words.every(w => `${x.outlet} ${x.placement}`.toLowerCase().includes(w)))
  const shown = states.length ? base.filter(x => states.includes(bidState(x)[1])) : base
  const step = (n: number) => { if (view === 'month') { const d = new Date(a.date + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); return update({ date: d.toISOString().slice(0, 10) }, true) }
    update({ date: addDays(a.date, n * (view === 'list' ? 28 : view === 'day' ? 1 : 7)) }, true) }
  const active = states.length + sales.length + (a.outlet ? 1 : 0) + (a.q ? 1 : 0)
  const title = view === 'month' ? dayLabel(a.date, { month: 'long', year: 'numeric' }) : view === 'day' ? dayLabel(a.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${dayLabel(from, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' })}`
  const of = (k: string) => base.filter(x => bidState(x)[1] === k), worth = (l: SSlot[]) => l.reduce((n, x) => n + price(x), 0)
  const toggle = (k: string) => update({ bs: (states.includes(k) ? states.filter(x => x !== k) : [...states, k]).join(',') })
  const outletName = outlets.length === 1 ? outlets[0].name : ''
  const openSlot = (id: string) => setOpen(id)
  const toDay = (d: string) => update({ view: 'day', date: d }, true)
  const panel = open && <SlotPanel key={open} id={open} onChange={load} onClose={() => setOpen(null)} />
  return (
    <main className="cv cc">
      <header className="cc-head">
        <div className="cc-title"><h1>{outletName ? t('{outlet} content calendar', { outlet: outletName }) : t('Content calendar')}</h1></div>
        <a className="btn" href="/listings">{t('Products')}{products.length > 0 && <span className="cc-n">{products.length}</span>}</a>
        <button type="button" className="btn primary" aria-expanded={!!adding} onClick={() => setAdding(adding ? false : { date: a.date })}>+ {t('List it')}</button>
      </header>
      {adding && <ListingPanel key={`${adding.date}-${adding.product ?? ''}`} products={products} placementId={adding.product} date={adding.date} onClose={() => setAdding(false)} onDone={load} />}

      <div className="cc-bar">
        <DateNav date={a.date} onDate={d => update({ date: d }, true)} onStep={step} />
        <b className="cc-range">{title}</b>
        <span className="spacer" />
        {view === 'week' && <div className="seg cc-lay" role="group" aria-label={t('Week layout')}>{([['prog', t('By programme')], ['time', t('By time')]] as const).map(([k, l]) =>
          <button key={k} type="button" aria-pressed={lay === k} className={lay === k ? 'on' : ''} onClick={() => update({ lay: k }, true)}>{l}</button>)}</div>}
        <div className="seg cv-views" role="tablist" aria-label={t('View')}>{VIEWS.map(([v, l]) =>
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => update({ view: v }, true)}>{l}</button>)}</div>
      </div>
      <FilterFold narrow={narrow} active={active} search={<input className="search cv-search" type="search" placeholder={t('Search outlets and programmes')} aria-label={t('Search')} value={qText} onChange={e => setQText(e.target.value)} />}>
        {outlets.length > 1 && <select className="cal-input cv-outlet-pick" aria-label={t('Outlet')} value={a.outlet} onChange={e => update({ outlet: e.target.value })}>
          <option value="">{t('All outlets')}</option>{outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
        {view === 'list' && <div className="cv-group" role="group" aria-label={t('Status')}>{([['pend', 'To decide'], ['acc', 'Booked'], ['open', 'On sale']] as const).map(([k, l]) => { const on = states.includes(k)
          return <button key={k} type="button" className={`chipf ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(k)}><span className={`st-dot st-${STATE_GROUP[k]}`} aria-hidden />{t(l)}</button> })}</div>}
        <div className="cv-group" role="group" aria-label={t('Sale type')}>{SALE_TYPES.map(v => { const on = sales.includes(v)
          return <button key={v} type="button" className={`chipf ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => update({ sale: (on ? sales.filter(x => x !== v) : [...sales, v]).join(',') })}>
            <SaleIcon k={v} />{saleLabel(v)}</button> })}</div>
        <span className="spacer" />
        {active > 0 && <button type="button" className="btn cv-clear" onClick={() => { setQText(''); update({ bs: '', sale: '', outlet: '', q: '' }) }}>{t('Clear all ({n})', { n: active })}</button>}
      </FilterFold>
      {/* What the period holds, in money, and the filter at the same time: press a tile to see only those slots. */}
      {slots && <div className="cc-tiles" role="group" aria-label={t('Show only')}>{TILES.map(([k, label, note]) => { const l = of(k), on = states.includes(k)
        return <button key={k} type="button" className={`cc-tile s-${k} ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(k)}>
          <span className="cc-tl"><i aria-hidden />{t(label)}</span><b className="num">{l.length}</b>
          <span className="cc-tn num">{l.length ? t(note, { amount: money(worth(l)) }) : t('None in this period')}</span></button> })}</div>}
      {error && <p className="error">{error}</p>}

      <div className={`cc-body ${open && wide ? 'docked' : ''}`}>
        <div className="cc-main">
          {view !== 'list' && !slots && <p className="muted">{t('Loading…')}</p>}
          {view !== 'list' && slots && !shown.length && <div className="cv-empty"><p><b>{slots.length ? t('No slots match these filters.') : view === 'day' ? t('Nothing listed on this day.') : t('Nothing listed in this period.')}</b></p>
            <div className="row-flex">{!slots.length && <button className="btn primary" onClick={() => setAdding({ date: a.date })}>+ {t('Add to calendar')}</button>}<button className="btn" onClick={() => step(1)}>{t('Show the next one')}</button></div></div>}
          {view === 'day' && shown.length > 0 && <DayList slots={shown} open={open} onOpen={openSlot} />}
          {view === 'week' && shown.length > 0 && lay === 'prog' && <Lanes days={week} slots={shown} open={open} onOpen={openSlot} onAdd={d => setAdding({ date: d })} onDay={toDay} />}
          {view === 'week' && shown.length > 0 && lay === 'time' && <WeekGrid days={week} slots={shown} open={open} onOpen={openSlot} onAdd={d => setAdding({ date: d })} />}
          {view === 'month' && slots && <MonthGrid date={a.date} grid={grid} slots={shown} onDay={toDay} />}
          {view === 'list' && <OpsList base="/seller/slots" qs={qs} who="seller" narrow={narrow} reload={reload} onOpen={x => setOpen(x.id)} />}
          <footer className="cv-foot small muted"><span>{t('Dubai time. Prices exclude VAT.')}</span>
            <span className="legend">{TILES.map(([k, l]) => <span key={k} className={`bchip b-${k}`}><i aria-hidden />{t(l)}</span>)}</span></footer>
        </div>
        {open && wide && <aside className="cc-panel card" aria-label={t('Slot')}>{panel}</aside>}
      </div>
      {open && !wide && <div className="scrim" onClick={() => setOpen(null)}><aside className="drawer" role="dialog" aria-label={t("Slot")} onClick={e => e.stopPropagation()}>{panel}</aside></div>}
    </main>
  )
}

const TabSvg = ({ d }: { d: string }) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
const ChIcon = ({ c, size = 16 }: { c: string; size?: number }) => <svg className="cc-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[c] ?? ICON.digital} /></svg>
/** Wide screens keep the slot panel docked beside the calendar, as in the owner's design; smaller ones open it over the page. */
function useWide() {
  const q = '(min-width: 1280px)', [w, setW] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches)
  useEffect(() => { const m = matchMedia(q), f = () => setW(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return w
}
const secs = (s: SSlot) => s.endsAt ? Math.round((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 1000) : 0
const mins = (s: SSlot) => Math.round(secs(s) / 60)
const length = (s: SSlot) => { const m = mins(s); return !secs(s) ? '' : secs(s) < 90 ? t('{n} sec', { n: secs(s) }) : m < 60 ? t('{n} min', { n: m }) : m % 60 ? t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 }) : m >= 1440 ? t('{n} days', { n: Math.round(m / 1440) }) : t('{n} h', { n: m / 60 }) }
const price = (s: SSlot) => s.topBid ?? s.startingPrice
/** AED amounts where there is no room for the currency: 3,500 or 12.4k (amounts are stored in fils). */
const short = (fils: number) => { const v = fils / 100; return v >= 10_000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : v.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
const isLong = (s: SSlot) => !s.endsAt || Date.parse(s.endsAt) - Date.parse(s.startsAt) >= 86_400_000
/** How a set of slots splits by state, as a thin stacked bar (booked, to decide, with bids, on sale). */
function Mix({ list }: { list: SSlot[] }) {
  const n = (k: string) => list.filter(s => bidState(s)[1] === k).length
  return <span className="cc-mix" aria-hidden>{['acc', 'pend', 'bid', 'open', 'off'].map(k => n(k) > 0 && <i key={k} className={`m-${k}`} style={{ flexGrow: n(k) }} />)}</span>
}

/**
 * The week by programme: one row for each programme (or media type sold as one), days across, and each break as a one-line
 * pill coloured by its state: the time, how many bids, the price. The programme's name is written once, not on every break.
 */
function Lanes({ days, slots, open, onOpen, onAdd, onDay }: { days: string[]; slots: SSlot[]; open: string | null; onOpen: (id: string) => void; onAdd: (d: string) => void; onDay: (d: string) => void }) {
  const today = todayInDubai(), lanes = new Map<string, SSlot[]>()
  for (const s of slots) { const k = `${s.outlet}\n${s.placement}`; lanes.set(k, [...(lanes.get(k) ?? []), s]) }
  const on = (l: SSlot[], d: string) => l.filter(s => dubai(s.startsAt).date === d).sort((x, y) => Number(x.kind !== 'single') - Number(y.kind !== 'single') || x.startsAt.localeCompare(y.startsAt))
  const pill = (s: SSlot) => { const [label, k] = bidState(s), timed = s.kind === 'single' && !isLong(s)
    return <button key={s.id} type="button" className={`ln-ev cc-ev s-${k} ${timed ? '' : 'pkg'} ${open === s.id ? 'on' : ''}`} onClick={() => onOpen(s.id)}
      title={`${s.placement} · ${tm(s.label)}${timed ? ` · ${time(s.startsAt)}` : ''} · ${label} · ${money(price(s))}`}>
      <span className={`bchip b-${k} ln-s`}>{k === 'acc' ? '✓' : k === 'bid' ? s.bids : k === 'pend' ? '!' : <i aria-hidden />}</span>
      <span className="ln-t num">{timed ? time(s.startsAt) : tm(s.label)}</span>
      <span className="ln-p num">{short(price(s))}</span></button> }
  return <div className="cw ln card scroll-x" role="grid" aria-label={t('Week')}>
    <div className="ln-inner">
      <div className="ln-row ln-head"><span className="ln-corner small muted">{t('Programme')}</span>{days.map(d => { const l = slots.filter(s => dubai(s.startsAt).date === d), pend = l.filter(s => bidState(s)[1] === 'pend').length
        return <span key={d} className={`ln-dh ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`}>
          <button type="button" className="ln-dn" onClick={() => onDay(d)} aria-label={t('Open {day}', { day: dayLabel(d) })}><small>{dayLabel(d, { weekday: 'short' })}</small><b className="num">{Number(d.slice(8))}</b></button>
          {pend > 0 && <span className="ln-flag">{t('{n} to decide', { n: pend })}</span>}
          {d >= today && <button type="button" className="wk-add" aria-label={t('Add to calendar on {day}', { day: dayLabel(d) })} onClick={() => onAdd(d)}>+</button>}
          {l.length > 0 && <Mix list={l} />}</span> })}</div>
      {[...lanes.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([key, l]) => { const s0 = l[0], sold = l.filter(s => bidState(s)[1] === 'acc').length
        return <div className="ln-row" key={key}>
          <div className={`ln-who cc-ev f-${family(s0.channel)}`}><span className="ln-ic"><ChIcon c={s0.channel} size={17} /></span>
            <span className="ln-name"><b>{s0.placement}</b><span className="small muted">{CHANNEL_NAME[s0.channel] ?? s0.channel}{s0.outlet !== s0.placement ? `${sep}${s0.outlet}` : ''}</span>
              <span className="ln-stat small num">{t('{sold} of {n} booked', { sold, n: l.length })}</span></span></div>
          {days.map(d => <div key={d} className={`ln-cell ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`}>{on(l, d).map(pill)}</div>)}
        </div> })}
    </div>
  </div>
}

/** A day as the owner drew it: hours down the side, one tinted card per slot with its type, length, bid status and price. */
function DayList({ slots, open, onOpen }: { slots: SSlot[]; open: string | null; onOpen: (id: string) => void }) {
  const hours = [...new Set(slots.map(s => Math.floor(dubai(s.startsAt).minutes / 60)))].sort((x, y) => x - y)
  return <div className="cc-day card">{hours.map(h => <div className="cc-hour" key={h}>
    <span className="cc-hl num">{ltr(`${String(h).padStart(2, '0')}:00`)}</span>
    <div className="cc-hitems">{slots.filter(s => Math.floor(dubai(s.startsAt).minutes / 60) === h).map(s =>
      <button key={s.id} type="button" className={`cc-ev f-${family(s.channel)} ${open === s.id ? 'on' : ''}`} onClick={() => onOpen(s.id)}>
        <ChIcon c={s.channel} size={20} />
        <img className="cc-thumb" src={art(s.channel, 'card')} alt="" width={84} height={52} loading="lazy" decoding="async" />
        <span className="cc-what"><b>{s.placement}</b><span className="small muted">{tm(s.label)}{sep}{CHANNEL_NAME[s.channel] ?? s.channel}{sep}{s.outlet}</span></span>
        <span className="cc-chips"><span className="cc-pill">{time(s.startsAt)}{s.endsAt && mins(s) >= 5 ? `–${time(s.endsAt)}` : ''}</span>{length(s) && <span className="cc-pill">{length(s)}</span>}
          <span className="cc-pill">{saleLabel(s.saleType)}</span></span>
        <BidChip s={s} />
        <span className="cc-price num">{money(price(s))}</span>
      </button>)}</div></div>)}</div>
}

/**
 * The week as the owner drew it: days across, the hours that have something down the side, and each slot as a tinted card with
 * its bid status in the day and hour it airs. Whole-day items and package offers sit in a row at the top.
 */
function WeekGrid({ days, slots, open, onOpen, onAdd }: { days: string[]; slots: SSlot[]; open: string | null; onOpen: (id: string) => void; onAdd: (d: string) => void }) {
  const long = isLong
  const timed = slots.filter(s => !long(s) && s.kind === 'single'), allDay = slots.filter(s => long(s) || s.kind !== 'single')
  const hourOf = (s: SSlot) => Math.floor(dubai(s.startsAt).minutes / 60)
  const hours = [...new Set(timed.map(hourOf))].sort((x, y) => x - y), today = todayInDubai()
  const card = (s: SSlot) => <button key={s.id} type="button" className={`wk-ev cc-ev f-${family(s.channel)} ${open === s.id ? 'on' : ''}`} onClick={() => onOpen(s.id)}
    title={`${s.outlet} · ${s.placement} · ${tm(s.label)} · ${bidState(s)[0]}`}>
    <span className="wk-l1"><ChIcon c={s.channel} size={13} /><b>{s.placement}</b></span>
    <span className="wk-l2 muted">{tm(s.label)}{s.kind === 'single' && !long(s) ? ` · ${time(s.startsAt)}` : ''}</span>
    <span className="wk-l3"><BidChip s={s} /><span className="wk-p num">{short(price(s))}</span></span></button>
  const row = (label: string, pick: (d: string) => SSlot[], key: string) => <div className="cw-row" key={key}>
    <span className="cw-t num">{label}</span>
    {days.map(d => <div key={d} className={`cw-cell ${d === today ? 'today' : ''}`}>{pick(d).sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.placement.localeCompare(y.placement)).map(card)}</div>)}</div>
  return <div className="cw card scroll-x" role="grid" aria-label={t('Week')}>
    <div className="cw-inner">
      <div className="cw-row cw-head"><span />{days.map(d => <span key={d} className={d === today ? 'today' : ''}>{dayLabel(d)}
        {d >= today && <button type="button" className="wk-add" aria-label={t('Add to calendar on {day}', { day: dayLabel(d) })} onClick={() => onAdd(d)}>+</button>}</span>)}</div>
      {allDay.length > 0 && row(t('All day and packages'), d => allDay.filter(s => dubai(s.startsAt).date === d), 'all')}
      {hours.map(h => row(ltr(`${String(h).padStart(2, '0')}:00`), d => timed.filter(s => dubai(s.startsAt).date === d && hourOf(s) === h), String(h)))}
    </div>
  </div>
}

/** The month at a glance: each day says how much is booked, what waits on the publisher and what is still on sale. Press a day to open it. */
function MonthGrid({ date, grid, slots, onDay }: { date: string; grid: string[][]; slots: SSlot[]; onDay: (d: string) => void }) {
  const today = todayInDubai(), month = date.slice(0, 7), byDay = new Map<string, SSlot[]>()
  for (const s of slots) { const d = dubai(s.startsAt).date; byDay.set(d, [...(byDay.get(d) ?? []), s]) }
  return <div className="cc-month card scroll-x" role="grid" aria-label={t('Month')}>
    <div className="cc-mhead">{grid[0].map(d => <span key={d}>{dayLabel(d, { weekday: 'short' })}</span>)}</div>
    {grid.map(w => <div className="cc-mrow" key={w[0]}>{w.map(d => { const list = byDay.get(d) ?? [], n = (k: string) => list.filter(s => bidState(s)[1] === k)
      const acc = n('acc'), pend = n('pend').length, bid = n('bid').length, open = n('open').length
      return <button key={d} type="button" className={`cv-mcell cc-md ${d.slice(0, 7) !== month ? 'out' : ''} ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${list.length ? '' : 'none'}`} onClick={() => onDay(d)}
        aria-label={`${dayLabel(d)}: ${t('{n} slots', { n: list.length })}`}>
        <span className="cc-mtop"><span className="cc-mday num">{Number(d.slice(8))}</span>{pend > 0 && <span className="ln-flag">{t('{n} to decide', { n: pend })}</span>}</span>
        {list.length > 0 && <>
          <Mix list={list} />
          {acc.length > 0 && <span className="cc-ml l-acc"><b className="num">{acc.length}</b> {t('booked')}<span className="num">{short(acc.reduce((x, s) => x + price(s), 0))}</span></span>}
          {bid > 0 && <span className="cc-ml l-bid"><b className="num">{bid}</b> {t('with bids')}</span>}
          {open > 0 && <span className="cc-ml l-open"><b className="num">{open}</b> {t('on sale')}</span>}
        </>}
      </button> })}</div>)}
  </div>
}

type Panel = SSlot & { creativeDueAt: string; choiceDeadlineAt: string | null
  bids: { id: string; kind: string; amount: number; status: string; at: string; company: string; choosable: boolean; acceptable?: boolean; profile?: CompanyProfile | null
    brief: { advertiser: string | null; industry: string | null; message: string | null; language: string | null; notes: string | null } | null }[]
  placementId?: string; channel: string
  deals: { id: string; ref: string; status: string; amount: number; kind: string; buyer?: string }[]
  assets?: { dealId: string; ref: string; creatives: { version: number; status: string; fileId: string; fileType: string; uploadedAt: string }[]
    proof: { submittedAt: string; files: { key: string; fileId: string }[] } | null }[] }
const KIND: Record<string, string> = { bid: 'Bid', auto: 'Auto-bid', buy_now: t("Buy now"), interest: 'Interest', book: 'Booking' }

const CREATIVE_STATUS: Record<string, string> = { pending: 'Waiting for your review', approved: 'Approved', changes_requested: 'Changes asked', technical_issue: 'Technical fix asked', rejected: 'Rejected' }

/**
 * The side panel for one slot (owner's calendar): its bid status, then Details, Bids and Assets as tabs. It opens on Bids
 * when something waits on the publisher there, otherwise on Details.
 */
const TAKEN = ['awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out']
/** The owner's bid summary: how many bids, the highest, and who the slot went to at what price. */
function BidSummary({ s, onBids }: { s: Panel; onBids: () => void }) {
  const live = s.bids.filter(b => b.status !== 'withdrawn'), top = live.reduce((x, b) => Math.max(x, b.amount), 0)
  const won = s.deals.find(d => TAKEN.includes(d.status)), waiting = s.deals.find(d => d.status === 'awaiting_seller')
  return <section className="sp-sum">
    <div className="sp-sum-h"><h3>{t('Bid summary')}</h3>{live.length > 0 && <button type="button" className="btn" onClick={onBids}>{t('View bids')}</button>}</div>
    <ul>
      <li><TabSvg d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><span>{live.length === 1 ? t('1 bid') : t('{n} bids', { n: live.length })}</span></li>
      {won && <li className="acc"><TabSvg d="M5 12.5l4.5 4.5L19 7.5" /><span>{t('Accepted:')} <b className="num">{money(won.amount)}</b></span></li>}
      {waiting && !won && <li className="pend"><TabSvg d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /><span>{t('Waiting for your decision:')} <a href={`/deals/${waiting.id}`}><b className="num">{money(waiting.amount)}</b></a></span></li>}
      {top > 0 && <li><TabSvg d="M4 18l6-6 4 4 6-8" /><span>{t('Highest bid:')} <b className="num">{money(top)}</b></span></li>}
      {(won ?? waiting)?.buyer && <li><TabSvg d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /><span>{t('Buyer:')} <b>{(won ?? waiting)!.buyer}</b></span></li>}
      {!live.length && !won && <li className="muted"><span>{s.status === 'open' ? t('No bids yet. Buyers see this slot on the calendar now.') : t('No bids.')}</span></li>}
    </ul>
  </section>
}

export function SlotPanel({ id, onChange, onClose }: { id: string; onChange?: () => void; onClose?: () => void }) {
  const [s, setS] = useState<Panel | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [tab, setTab] = useState<'' | 'details' | 'bids' | 'assets'>('')
  const load = () => api<Panel>(`/seller/slots/${id}`).then(setS, e => setError(e.message))
  useEffect(() => { setTab(''); load() }, [id])
  async function act(path: string, body: object) {
    setBusy(true); setError('')
    try { const r = await api(path, { method: 'POST', body }); onChange?.(); if (r?.id && r?.status) navigate(`/deals/${r.id}`); else await load() }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!s) return error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>
  const assets = s.assets ?? [], files = assets.reduce((n, a) => n + a.creatives.length + (a.proof?.files.length ?? 0), 0)
  const waiting = s.status === 'awaiting_choice' || s.bids.some(b => b.acceptable)
  const on = tab || (waiting ? 'bids' : 'details')
  const TABS: [typeof on, string][] = [['details', t('Details')], ['bids', s.bids.length ? t('Bids ({n})', { n: s.bids.length }) : t('Bids')], ['assets', files ? t('Assets ({n})', { n: files }) : t('Assets')]]
  return <>
    <header className="sp-head">
      <img src={art(s.channel, 'card')} alt="" width={96} height={72} decoding="async" />
      <div className="sp-head-t"><h2>{s.placement}</h2><p className="muted small">{tm(s.label)}{sep}{s.outlet}</p><p className="small">{when(s.startsAt)}{s.endsAt && mins(s) >= 5 ? `–${time(s.endsAt)}` : ''}</p></div>
      {onClose && <button className="btn icon" onClick={onClose} aria-label={t("Close")}>✕</button>}</header>
    <div className="sp-state"><BidChip s={{ status: s.status, saleType: s.saleType, bids: s.bids.filter(b => ['active', 'outbid', 'selected'].includes(b.status)).length }} />
      <b className="sp-price num">{money(s.topBid ?? s.startingPrice)}</b>
      <span className="small muted">{s.saleType === 'auction' ? t('Auction') : s.saleType === 'quick_sale' ? t('Quick sale') : t('Fixed price')}
        {s.status === 'open' && s.saleType === 'auction' ? ` · ${t('bidding closes {when}', { when: when(s.closesAt) })}` : ''}</span></div>
    {s.status === 'awaiting_choice' && <p className="warn">{s.choiceDeadlineAt ? t('The winner did not go ahead. Choose another bid by {when}, or let it relist as a quick sale.', { when: when(s.choiceDeadlineAt) }) : t('The winner did not go ahead. Choose another bid, or let it relist as a quick sale.')}</p>}
    <div className="seg sp-tabs" role="tablist" aria-label={t('Slot')}>{TABS.map(([k, l]) =>
      <button key={k} role="tab" id={`sp-${k}`} aria-selected={on === k} aria-controls="sp-body" className={on === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

    <div id="sp-body" role="tabpanel" aria-labelledby={`sp-${on}`} className="sp-body">
    {on === 'details' && <>
      <ul className="sp-rows">
        <li><TabSvg d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><span>{dayLabel(dubai(s.startsAt).date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></li>
        <li><TabSvg d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /><span>{time(s.startsAt)}{s.endsAt && mins(s) >= 5 ? ` – ${time(s.endsAt)}` : ''}{s.endsAt && mins(s) < 5 ? ` · ${length(s)}` : ''} {t('(UAE)')}</span></li>
        <li><ChIcon c={s.channel} size={17} /><span>{CHANNEL_NAME[s.channel] ?? s.channel}{sep}{s.placement}</span></li>
        <li><TabSvg d="M12 3 3 8l9 5 9-5zM3 13l9 5 9-5" /><span>{t('Sale closes {when}', { when: when(s.closesAt) })}</span></li>
        <li><TabSvg d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5" /><span>{t('Creative due {when}', { when: when(s.creativeDueAt) })}</span></li>
      </ul>
      <dl className="prices">
        <div><dt>{s.saleType === 'auction' ? t('Starting price') : t('Price')}</dt><dd className="num">{money(s.startingPrice)}</dd></div>
        {s.reservePrice && <div><dt>{t("Reserve (buyers don't see it)")}</dt><dd className="num">{money(s.reservePrice)}</dd></div>}
        {s.buyNowPrice && <div><dt>{t("Buy now")}</dt><dd className="num">{money(s.buyNowPrice)}</dd></div>}
      </dl>
      <BidSummary s={s} onBids={() => setTab('bids')} />
    </>}

    {on === 'bids' && <section>
      {s.bids.some(b => b.acceptable) && <p className="small">{t('Accept one buyer by {when} to book it. The others are told the slot has gone. Unanswered interest lapses then.', { when: when(s.closesAt) })}</p>}
      {!s.bids.length ? <p className="muted small">{s.status === 'open' ? t('No bids yet. Buyers see this slot on the calendar now.') : t("None yet.")}</p>
        : <div className="table-wrap"><table className="table"><tbody>{s.bids.map(b => <tr key={b.id}>
        <td>{b.profile ? <CompanyCard p={b.profile} compact /> : b.company}<div className="small muted">{t(KIND[b.kind])} · {t(b.status.replace('_', ' '))}</div>
          {b.acceptable && b.brief && <div className="small brief-mini">{b.brief.advertiser && <div><b>{b.brief.advertiser}</b>{b.brief.industry ? `${sep}${t(b.brief.industry)}` : ''}</div>}
            {b.brief.message && <div className="muted">“{b.brief.message}”</div>}{b.brief.notes && <div className="muted">{b.brief.notes}</div>}</div>}</td>
        <td className="r num">{money(b.amount)}</td>
        <td className="r">{b.choosable && <button className="btn primary" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/choose`, { bidId: b.id })}>{t("Choose")}</button>}
          {b.acceptable && <button className="btn primary" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/accept-interest`, { bidId: b.id })}>{t("Accept")}</button>}</td></tr>)}</tbody></table></div>}
      {s.deals.some(d => d.status === 'awaiting_seller') && <p className="small"><a href={`/deals/${s.deals.find(d => d.status === 'awaiting_seller')!.id}`}>{t('Open the request to accept, counter or decline')}</a></p>}
    </section>}

    {on === 'assets' && (!assets.length ? <p className="muted small">{t('Creative and proof appear here once a buyer books this slot.')}</p>
      : assets.map(a => <section key={a.dealId} className="sp-assets"><h3 className="sp-h">{t('Order {ref}', { ref: a.ref })} · <a className="small" href={`/deals/${a.dealId}`}>{t('Open the booking')}</a></h3>
        {a.creatives.length ? <ul className="sp-files">{a.creatives.map(c => <li key={c.version}><span className="sp-ic" aria-hidden>{ltr(`v${c.version}`)}</span>
          <span><b>{t('Creative')}</b><span className="small muted">{t(CREATIVE_STATUS[c.status] ?? c.status)} · {when(c.uploadedAt)}</span></span>
          <a className="btn" href={`/api/files/${c.fileId}`}>{t('Download')}</a></li>)}</ul> : <p className="muted small">{t('No creative yet.')}</p>}
        {a.proof && <ul className="sp-files">{a.proof.files.length ? a.proof.files.map(f => <li key={f.key}><span className="sp-ic" aria-hidden>✓</span>
          <span><b>{t('Proof')}</b><span className="small muted">{when(a.proof!.submittedAt)}</span></span><a className="btn" href={`/api/files/${f.fileId}`}>{t('Download')}</a></li>)
          : <li><span className="sp-ic" aria-hidden>✓</span><span><b>{t('Proof sent')}</b><span className="small muted">{when(a.proof.submittedAt)}</span></span></li>}</ul>}
      </section>))}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="sp-foot">
      {s.placementId && <a className="btn" href={`/listings/p/${s.placementId}`}><TabSvg d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />{t('Edit')}</a>}
      {(s.status === 'open' || s.status === 'blocked') && !s.bids.length &&
        <button className="btn sp-wide" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/block`, { blocked: s.status === 'open' })}>{s.status === 'open' ? t('Take off sale') : t('Put back on sale')}</button>}
    </footer>
  </>
}

export const SlotPage = ({ id }: { id: string }) => <main className="narrow"><p className="small"><a href="/schedule">{t("Calendar")}</a></p><div className="card pad" style={{ display: 'grid', gap: 16 }}><SlotPanel id={id} /></div></main>
