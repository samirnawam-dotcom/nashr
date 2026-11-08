import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai, monthGrid, todayInDubai } from './layout'
import { ChannelMark, Chevron, SaleType, useLatest } from './CalendarPage'
import { t, ltr } from '../i18n'
import { tm } from '../i18n-server'
import './calendar.css'

/*
 * The publisher's and Nashr's calendars share these pieces with the buyer's: the same server search (marketplace/search.ts,
 * scoped to the publisher's own outlets or to everything), a sortable paged list and a month of daily totals. What differs is
 * what they show: every status, the reserve, the publisher's name for Nashr.
 */

export type OpsSlot = { id: string; outletId?: string; dealId: string | null; company: string | null; outlet: string; channel: string; placement: string; label: string; kind: string
  saleType: 'auction' | 'quick_sale'; startsAt: string; endsAt: string | null; closesAt: string; status: string; startingPrice: number; buyNowPrice: number | null
  reservePrice: number | null; topBid: number | null; bids: number }
export type OpsDay = { date: string; slots: number; onSale: number; waiting: number; booked: number; off: number; fromPrice: number }
export type Sort = 'time' | 'price_asc' | 'price_desc' | 'closing' | 'bids'

/** Statuses in four groups everyone reads the same way; each group is a set of the server's statuses. */
export const GROUPS: [string, string[], string][] = [
  ['on_sale', ['open'], 'On sale'], ['waiting', ['awaiting_seller', 'awaiting_choice'], 'Waiting for a decision'],
  ['booked', ['booked'], 'Booked'], ['off', ['blocked', 'held', 'unsold'], 'Off sale or taken'],
]
export const groupOf = (status: string) => GROUPS.find(g => g[1].includes(status))?.[0] ?? 'off'
const STATUS_LABEL: Record<string, Record<string, string>> = {
  seller: { open: 'On sale', awaiting_seller: 'Your decision', awaiting_choice: 'Choose next bid', booked: 'Booked', blocked: 'Off sale', held: 'Unavailable (overlaps a booking)', unsold: 'Unsold' },
  admin: { open: 'On sale', awaiting_seller: 'Publisher deciding', awaiting_choice: 'Publisher choosing next bid', booked: 'Booked', blocked: 'Off sale', held: 'Unavailable (overlaps a booking)', unsold: 'Unsold' },
}
export const StatusDot = ({ s, who }: { s: string; who: 'seller' | 'admin' }) => <span className={`st st-${groupOf(s)}`}>{t(STATUS_LABEL[who][s] ?? s)}</span>
export const SORTS: [Sort, string][] = [['time', t('Air time')], ['closing', t('Closing soonest')], ['price_asc', t('Price: low to high')], ['price_desc', t('Price: high to low')], ['bids', t('Most bids')]]

/** Status chips: none chosen means every status. */
export function StatusChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return <div className="cv-group" role="group" aria-label={t('Status')}>{GROUPS.map(([k, , l]) => {
    const on = value.includes(k)
    return <button key={k} type="button" className={`chipf ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== k) : [...value, k])}>
      <span className={`st-dot st-${k}`} aria-hidden />{t(l)}</button> })}</div>
}
/** The server's statuses for the chosen groups. */
export const statusesOf = (groups: string[]) => GROUPS.filter(g => groups.includes(g[0])).flatMap(g => g[1])

/** Every matching slot, sorted on the server, 50 at a time. */
export function OpsList({ base, qs, who, onOpen, reload = 0, narrow }: { base: string; qs: string; who: 'seller' | 'admin'; onOpen: (s: OpsSlot) => void; reload?: number; narrow?: boolean }) {
  const [items, setItems] = useState<OpsSlot[]>([]), [total, setTotal] = useState<number | null>(null), [sort, setSort] = useState<Sort>('time'), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const latest = useLatest()
  const load = (offset: number) => { setBusy(true)
    latest(api<{ total: number; items: OpsSlot[] }>(`${base}/list?${qs}&sort=${sort}&offset=${offset}&limit=50`),
      r => { setItems(cur => offset ? [...cur, ...r.items] : r.items); setTotal(r.total); setBusy(false); setError('') }, e => { setError(e.message); setBusy(false) }) }
  useEffect(() => { setItems([]); setTotal(null); load(0) }, [qs, sort, reload])
  const grouped = sort === 'time', today = todayInDubai()
  const rows: (OpsSlot | string)[] = []
  items.forEach((x, i) => { const d = dubai(x.startsAt).date; if (grouped && (i === 0 || dubai(items[i - 1].startsAt).date !== d)) rows.push(d); rows.push(x) })
  const timeOf = (r: OpsSlot) => r.endsAt || dubai(r.startsAt).minutes ? ltr(time(r.startsAt)) : t('All day')
  return (
    <section className="card cv-list" aria-label={t('Slots')}>
      <div className="cv-list-bar">
        <span className="small muted" role="status">{total == null ? t('Loading…') : t('Showing {n} of {total}', { n: items.length.toLocaleString('en-US'), total: total.toLocaleString('en-US') })}</span>
        <span className="spacer" />
        <label className="small muted" htmlFor={`sort-${who}`}>{t('Sort by')}</label>
        <select id={`sort-${who}`} className="cal-input cv-sort" value={sort} onChange={e => setSort(e.target.value as Sort)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      {error && <p className="error pad">{error}</p>}
      {total === 0 && <p className="muted pad">{t('No slots match.')}</p>}
      {items.length > 0 && narrow && <ul className="cv-cards">{rows.map(r => typeof r === 'string'
        ? <li key={r} className={`cv-day ${r === today ? 'today' : ''}`}>{dayLabel(r, { weekday: 'long', day: 'numeric', month: 'short' })}</li>
        : <li key={r.id}><button className={`cv-card ch-b-${r.channel}`} onClick={() => onOpen(r)}>
          <span className="cv-card-top"><span className="num cv-when">{grouped ? timeOf(r) : `${dayLabel(dubai(r.startsAt).date, { day: 'numeric', month: 'short' })} · ${timeOf(r)}`}</span>
            <b className="num">{money(r.topBid ?? r.startingPrice)}</b></span>
          <span className="cv-card-name"><ChannelMark c={r.channel} /><b>{r.outlet}</b>{who === 'admin' && r.company && r.company !== r.outlet && <span className="small muted">· {r.company}</span>}</span>
          <span className="small muted">{r.placement}{r.label !== r.placement ? ` · ${tm(r.label)}` : ''}</span>
          <span className="cv-card-meta small"><StatusDot s={r.status} who={who} />{r.bids > 0 && <span className="muted">{t('{n} bids', { n: r.bids })}</span>}
            {r.reservePrice ? <span className="muted">{t('Reserve')} {money(r.reservePrice)}</span> : null}</span>
        </button></li>)}</ul>}
      {items.length > 0 && !narrow && <div className="table-wrap"><table className="table cv-table">
        <thead><tr><th>{t('Airs')}</th><th>{t('Outlet')}</th><th>{t('Slot')}</th><th>{t('Sale')}</th><th className="r">{t('Price')}</th><th className="r">{t('Reserve')}</th>
          <th className="r">{t('Bids')}</th><th>{t('Status')}</th><th>{t('Bidding closes')}</th></tr></thead>
        <tbody>{rows.map(r => typeof r === 'string'
          ? <tr key={r} className="cv-dayrow"><th colSpan={9} className={r === today ? 'today' : ''}>{dayLabel(r, { weekday: 'long', day: 'numeric', month: 'long' })}</th></tr>
          : <tr key={r.id} data-slot={r.id} onClick={() => onOpen(r)} className={who === 'admin' && !r.dealId ? 'cv-nolink' : ''}>
            <td className="num nowrap">{grouped ? '' : <span className="muted">{dayLabel(dubai(r.startsAt).date, { day: 'numeric', month: 'short' })} · </span>}{timeOf(r)}</td>
            <td><span className="cv-outlet"><ChannelMark c={r.channel} /><span><b>{r.outlet}</b>{who === 'admin' && r.company && r.company !== r.outlet && <span className="small muted">{r.company}</span>}</span></span></td>
            <td><span className="cv-slot">{r.placement}</span>{r.label !== r.placement && <span className="small muted"> · {tm(r.label)}</span>}</td>
            <td><SaleType t={r.saleType} /></td>
            <td className="r num"><b>{money(r.topBid ?? r.startingPrice)}</b>{r.topBid ? <div className="small muted">{t('top bid')}</div> : null}</td>
            <td className="r num small">{r.reservePrice ? money(r.reservePrice) : '—'}</td>
            <td className="r num">{r.bids || '—'}</td>
            <td><StatusDot s={r.status} who={who} /></td>
            <td className="small num nowrap">{r.status === 'open' ? `${dayLabel(dubai(r.closesAt).date, { day: 'numeric', month: 'short' })} · ${time(r.closesAt)}` : '—'}</td>
          </tr>)}</tbody></table></div>}
      {total != null && items.length < total && <div className="cv-more-row"><button className="btn" disabled={busy} onClick={() => load(items.length)}>
        {busy ? t('Loading…') : t('Show {n} more', { n: Math.min(50, total - items.length) })}</button></div>}
    </section>
  )
}

/** A month of daily totals, each day showing its mix of statuses as a bar and as numbers. */
export function OpsMonth({ date, days, onDay, narrow }: { date: string; days: OpsDay[]; onDay: (d: string) => void; narrow?: boolean }) {
  const weeks = monthGrid(date), month = date.slice(0, 7), today = todayInDubai(), by = new Map(days.map(d => [d.date, d]))
  return (
    <section className="card cv-month" aria-label={t('Month')}>
      {[t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat'), t('Sun')].map(d => <div key={d} className="cv-month-h small muted">{d}</div>)}
      {weeks.flat().map(d => { const x = by.get(d), out = d.slice(0, 7) !== month, past = d < today
        return <button key={d} className={`cv-mcell ops ${out ? 'out' : ''} ${past ? 'past' : ''} ${d === today ? 'today' : ''}`} disabled={!x} onClick={() => onDay(d)}
          aria-label={x ? `${dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${t('{n} slots', { n: x.slots })}` : dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <span className="cv-mdate">{Number(d.slice(8))}</span>
          {x && <>
            <span className="cv-mcount"><b className="num">{x.slots.toLocaleString('en-US')}</b>{!narrow && <span className="small muted"> {t(x.slots === 1 ? 'slot' : 'slots')}</span>}</span>
            <span className="mix" aria-hidden>{GROUPS.map(([k]) => { const n = k === 'on_sale' ? x.onSale : k === 'waiting' ? x.waiting : k === 'booked' ? x.booked : x.off
              return n ? <i key={k} className={`st-${k}`} style={{ flexGrow: n }} /> : null })}</span>
            <span className="mix-n small">{x.booked > 0 && <span className="st st-booked">{x.booked}</span>}{x.waiting > 0 && <span className="st st-waiting">{x.waiting}</span>}
              {x.onSale > 0 && <span className="st st-on_sale">{x.onSale}</span>}</span>
          </>}
        </button> })}
    </section>
  )
}

/** The shared date controls: today, previous, next, go to a date. */
export function DateNav({ date, onDate, onStep }: { date: string; onDate: (d: string) => void; onStep: (n: number) => void }) {
  return <div className="cv-nav" role="group" aria-label={t('Dates')}>
    <button className="btn" onClick={() => onDate(todayInDubai())}>{t('Today')}</button>
    <button className="btn icon" aria-label={t('Previous')} onClick={() => onStep(-1)}><Chevron dir="back" /></button>
    <button className="btn icon" aria-label={t('Next')} onClick={() => onStep(1)}><Chevron dir="fwd" /></button>
    <label className="btn cv-jump" title={t('Go to a date')}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg>
      <span className="cv-jump-label">{t('Go to date')}</span><input type="date" aria-label={t('Go to a date')} value={date} onChange={e => e.target.value && onDate(e.target.value)} /></label>
  </div>
}

/** View, date and filters in the address: read once, written on every change (Back undoes view and date changes). */
export function useAddress<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>, push?: boolean) => void] {
  const read = (): T => { const p = new URLSearchParams(location.search); return Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, p.get(k) ?? v])) as T }
  const [s, setS] = useState<T>(read)
  useEffect(() => { const f = () => setS(read()); addEventListener('popstate', f); return () => removeEventListener('popstate', f) }, [])
  const update = (patch: Partial<T>, push = false) => setS(cur => {
    const n = { ...cur, ...patch }, p = new URLSearchParams(location.search)
    for (const [k, v] of Object.entries(n)) v && v !== defaults[k] ? p.set(k, v) : p.delete(k)
    const url = `${location.pathname}${p.toString() ? `?${p}` : ''}`
    if (url !== location.pathname + location.search) history[push ? 'pushState' : 'replaceState'](null, '', url)
    return n })
  return [s, update]
}

type OutletRow = { outletId: string; outlet: string; channel: string; logoUrl: string | null; slots: number; fromPrice: number; days: { date: string; slots: number; fromPrice: number }[] }
/** Outlets down, days across, 50 a page: how many slots each outlet has each day (Nashr's view of supply). */
export function OpsOutlets({ base, qs, week, onCell }: { base: string; qs: string; week: string[]; onCell: (o: OutletRow, date: string) => void }) {
  const [data, setData] = useState<{ total: number; items: OutletRow[] } | null>(null), [offset, setOffset] = useState(0), [sort, setSort] = useState('name')
  const latest = useLatest(), today = todayInDubai()
  useEffect(() => { setOffset(0) }, [qs, sort])
  useEffect(() => { latest(api<{ total: number; items: OutletRow[] }>(`${base}/outlets?${qs}&sort=${sort}&offset=${offset}&limit=50`), setData) }, [qs, sort, offset])
  const pages = data ? Math.ceil(data.total / 50) : 0, page = Math.floor(offset / 50) + 1
  return (
    <section className="card cv-outlets">
      <div className="cv-list-bar"><span className="small muted" role="status">{!data ? t('Loading…') : t('{n} outlets with slots this week', { n: data.total.toLocaleString('en-US') })}</span>
        <span className="spacer" /><label className="small muted" htmlFor="ops-osort">{t('Sort by')}</label>
        <select id="ops-osort" className="cal-input cv-sort" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="name">{t('Name')}</option><option value="slots">{t('Most slots')}</option><option value="price">{t('Lowest price')}</option></select></div>
      <div className="table-wrap"><table className="table cv-otable">
        <thead><tr><th className="cv-ocol">{t('Outlet')}</th>{week.map(d => <th key={d} className={`num ${d === today ? 'today' : ''}`}>{dayLabel(d, { weekday: 'short', day: 'numeric' })}</th>)}<th className="r">{t('Week')}</th></tr></thead>
        <tbody>{(data?.items ?? []).map(o => <tr key={o.outletId}>
          <th className="cv-ocol" scope="row"><span className="cv-outlet"><ChannelMark c={o.channel} /><b>{o.outlet}</b></span></th>
          {week.map(d => { const x = o.days.find(y => y.date === d)
            return <td key={d} className={`cv-ocell ${d < today ? 'past' : ''}`}>{x ? <button className="cv-obtn" onClick={() => onCell(o, d)}>
              <b className="num">{x.slots}</b><span className="small muted">{t('from {price}', { price: money(x.fromPrice) })}</span></button> : <span className="muted">—</span>}</td> })}
          <td className="r num small"><b>{o.slots}</b></td></tr>)}</tbody></table></div>
      {pages > 1 && <nav className="cv-pager" aria-label={t('Pages')}>
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(offset - 50)}><Chevron dir="back" /> {t('Previous')}</button>
        <span className="small muted">{t('Page {n} of {total}', { n: page, total: pages })}</span>
        <button className="btn" disabled={page >= pages} onClick={() => setOffset(offset + 50)}>{t('Next')} <Chevron dir="fwd" /></button></nav>}
    </section>
  )
}

/** On phones the filters fold behind one button, so the calendar starts near the top of the screen. */
export function FilterFold({ narrow, active, children, search }: { narrow: boolean; active: number; children: React.ReactNode; search: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!narrow) return <section className="cv-filters" aria-label={t('Filters')}>{search}{children}</section>
  return <section className="cv-filters-m" aria-label={t('Filters')}>
    <div className="cv-mobilebar">{search}<button className={`btn ${active ? 'primary' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
      {active ? t('Filters ({n})', { n: active }) : t('Filters')}</button></div>
    {open && <div className="cv-filters stacked">{children}</div>}
  </section>
}
