import { navigate } from '../nav'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { dayLabel, time } from '../format'
import { addDays, dubai, monthGrid, todayInDubai, weekOf } from '../calendar/layout'
import { DealStatus, SLOT_STATUS, money, when } from './common'
import { Bolt, Gavel, useLatest, useNarrow } from '../calendar/CalendarPage'
import { DateNav, FilterFold, GROUPS, groupOf, OpsList, OpsMonth, StatusChips, statusesOf, useAddress, type OpsDay } from '../calendar/ops'
import { ltr, sep, t } from '../i18n'
import { tm } from '../i18n-server'

type SSlot = { id: string; outletId?: string; outlet: string; channel: string; placement: string; label: string; kind: string; saleType: string; startsAt: string; endsAt: string | null
  closesAt: string; status: string; startingPrice: number; buyNowPrice: number | null; reservePrice: number | null; topBid: number | null; bids: number }

type View = 'programme' | 'week' | 'list' | 'month'
const VIEWS: [View, string][] = [['programme', t('Programme')], ['week', t('Week')], ['list', t('List')], ['month', t('Month')]]

/**
 * The publisher's calendar in four views: Programme (a row per placement), Week (days across, hours down), List (every slot,
 * sorted and paged on the server) and Month (each day's mix of statuses). One filter bar for all four, kept in the address.
 */
export function SchedulePage() {
  let saved = 'programme'; try { saved = localStorage.getItem('nashr:seller-view') ?? 'programme' } catch { /* private mode */ }
  const [a, update] = useAddress({ view: saved, date: todayInDubai(), st: '', sale: '', outlet: '', q: '' })
  const view = (VIEWS.some(v => v[0] === a.view) ? a.view : 'programme') as View
  const [slots, setSlots] = useState<SSlot[] | null>(null), [days, setDays] = useState<OpsDay[]>([]), [open, setOpen] = useState<string | null>(null)
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]), [error, setError] = useState(''), [reload, setReload] = useState(0), [qText, setQText] = useState(a.q)
  const latest = useLatest(), narrow = useNarrow()
  useEffect(() => { try { localStorage.setItem('nashr:seller-view', view) } catch { /* fine */ } }, [view])
  useEffect(() => { api<{ outlets: { id: string; name: string }[] }>('/seller/profile').then(p => setOutlets(p.outlets), () => {}) }, [])
  useEffect(() => { const k = setTimeout(() => qText !== a.q && update({ q: qText }), 300); return () => clearTimeout(k) }, [qText])
  const week = weekOf(a.date)
  const [from, to] = view === 'month' ? [monthGrid(a.date)[0][0], addDays(monthGrid(a.date).at(-1)![6], 1)] : view === 'list' ? [a.date, addDays(a.date, 28)] : [week[0], addDays(week[6], 1)]
  const groups = a.st ? a.st.split(',') : [], sales = a.sale ? a.sale.split(',') : []
  const qs = new URLSearchParams({ from: `${from}T00:00:00+04:00`, to: `${to}T00:00:00+04:00`, ...(groups.length ? { st: statusesOf(groups).join(',') } : {}),
    ...(sales.length ? { sale: sales.join(',') } : {}), ...(a.outlet ? { outlet: a.outlet } : {}), ...(a.q.trim() ? { q: a.q.trim() } : {}) }).toString()
  const load = () => {
    if (view === 'programme' || view === 'week') latest(api<SSlot[]>(`/seller/slots?from=${week[0]}T00:00:00%2B04:00&to=${addDays(week[6], 1)}T00:00:00%2B04:00`), setSlots, e => setError(e.message))
    if (view === 'month') latest(api<OpsDay[]>(`/seller/slots/days?${qs}`), setDays, e => setError(e.message))
    setReload(n => n + 1)
  }
  useEffect(() => { load() }, [view, a.date, a.st, a.sale, a.outlet, a.q])
  // Programme and week filter the week on screen in the browser, with the same rules the server uses for the list.
  const words = a.q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = (slots ?? []).filter(x => (!groups.length || groups.includes(groupOf(x.status))) && (!sales.length || sales.includes(x.saleType))
    && (!a.outlet || x.outletId === a.outlet) && words.every(w => `${x.outlet} ${x.placement}`.toLowerCase().includes(w)))
  const rows = [...new Set(shown.map(x => `${x.outlet} · ${x.placement}`))].sort()
  const step = (n: number) => { if (view === 'month') { const d = new Date(a.date + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); return update({ date: d.toISOString().slice(0, 10) }, true) }
    update({ date: addDays(a.date, n * (view === 'list' ? 28 : 7)) }, true) }
  const active = groups.length + sales.length + (a.outlet ? 1 : 0) + (a.q ? 1 : 0)
  const title = view === 'month' ? dayLabel(a.date, { month: 'long', year: 'numeric' })
    : `${dayLabel(from, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' })}`
  return (
    <main className="cv">
      <header className="cv-head">
        <div className="cv-title"><h1>{t('Calendar')}</h1><p className="cv-range"><b>{title}</b><span className="muted">{t('Your slots, bids and bookings. Dubai time.')}</span></p></div>
        <DateNav date={a.date} onDate={d => update({ date: d }, true)} onStep={step} />
        <div className="seg cv-views" role="tablist" aria-label={t('View')}>{VIEWS.map(([v, l]) =>
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => update({ view: v }, true)}>{l}</button>)}</div>
      </header>
      <FilterFold narrow={narrow} active={active} search={<input className="search cv-search" type="search" placeholder={t('Search outlets and programmes')} aria-label={t('Search')} value={qText} onChange={e => setQText(e.target.value)} />}>
        {outlets.length > 1 && <select className="cal-input cv-outlet-pick" aria-label={t('Outlet')} value={a.outlet} onChange={e => update({ outlet: e.target.value })}>
          <option value="">{t('All outlets')}</option>{outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
        <StatusChips value={groups} onChange={v => update({ st: v.join(',') })} />
        <div className="cv-group" role="group" aria-label={t('Sale type')}>{(['auction', 'quick_sale'] as const).map(v => { const on = sales.includes(v)
          return <button key={v} type="button" className={`chipf ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => update({ sale: (on ? sales.filter(x => x !== v) : [...sales, v]).join(',') })}>
            {v === 'auction' ? <Gavel /> : <Bolt />}{v === 'auction' ? t('Auction') : t('Quick sale')}</button> })}</div>
        <span className="spacer" />
        {active > 0 && <button type="button" className="btn cv-clear" onClick={() => { setQText(''); update({ st: '', sale: '', outlet: '', q: '' }) }}>{t('Clear all ({n})', { n: active })}</button>}
      </FilterFold>
      {error && <p className="error">{error}</p>}
      {(view === 'programme' || view === 'week') && slots && !shown.length && <div className="cv-empty"><p><b>{slots.length ? t('No slots match these filters this week.') : t('Nothing listed this week.')}</b></p>
        <div className="row-flex">{!slots.length && <a className="btn primary" href="/listings">{t('List slots')}</a>}<button className="btn" onClick={() => step(1)}>{t('Show the next week')}</button></div></div>}
      {view === 'week' && shown.length > 0 && <WeekGrid days={week} slots={shown} onOpen={setOpen} />}
      {view === 'programme' && shown.length > 0 && <div className="card scroll-x"><table className="prog">
        <thead><tr><th className="place">{t("Placement")}</th>{week.map(d => <th key={d} className={d === todayInDubai() ? 'today' : ''}>{dayLabel(d)}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r}><th className="place">{r}</th>{week.map(d => <td key={d}>
          {shown.filter(x => `${x.outlet} · ${x.placement}` === r && dubai(x.startsAt).date === d).map(x =>
            <button key={x.id} className={`sl ${x.status}`} onClick={() => setOpen(x.id)}>
              <b>{tm(x.label)}</b>{x.endsAt && <span className="muted"> · {time(x.startsAt)}</span>}
              <div className="muted">{t(SLOT_STATUS[x.status])}{x.status !== 'open' ? '' : x.topBid ? ` · ${money(x.topBid)}` : x.bids ? ` · ${t('{n} interested', { n: x.bids })}` : ''}</div>
            </button>)}
        </td>)}</tr>)}</tbody></table></div>}
      {view === 'list' && <OpsList base="/seller/slots" qs={qs} who="seller" narrow={narrow} reload={reload} onOpen={x => setOpen(x.id)} />}
      {view === 'month' && <OpsMonth narrow={narrow} date={a.date} days={days} onDay={d => update({ view: 'programme', date: d }, true)} />}
      <footer className="cv-foot small muted"><span>{t('Dubai time. Prices exclude VAT.')}</span>
        <span className="legend">{GROUPS.map(([k, , l]) => <span key={k} className={`st st-${k}`}>{t(l)}</span>)}</span></footer>
      {open && <div className="scrim" onClick={() => setOpen(null)}><aside className="drawer" role="dialog" aria-label={t("Slot")} onClick={e => e.stopPropagation()}>
        <SlotPanel id={open} onChange={load} onClose={() => setOpen(null)} /></aside></div>}
    </main>
  )
}

/**
 * The week as a calendar (owner feedback: like Google Calendar): days across, hours down, each slot at its time and length.
 * Slots without a time (print pages, digital takeovers) sit in an all-day lane at the top. Slots at the same time share the column.
 */
function WeekGrid({ days, slots, onOpen }: { days: string[]; slots: SSlot[]; onOpen: (id: string) => void }) {
  const HOUR = 72, MIN_LEN = 30, mins = (iso: string) => dubai(iso).minutes
  // Single breaks sit at their time; whole-day items and package offers (any break, all breaks) go in the lane at the top.
  const timed = slots.filter(s => s.endsAt && s.kind === 'single'), allDay = slots.filter(s => !s.endsAt || s.kind !== 'single')
  const starts = timed.map(s => mins(s.startsAt)), from = Math.max(0, Math.floor((Math.min(...starts, 8 * 60)) / 60) - 1)
  const to = Math.min(24, Math.ceil(Math.max(...timed.map(s => mins(s.startsAt) + Math.max(MIN_LEN, (Date.parse(s.endsAt!) - Date.parse(s.startsAt)) / 60000)), 18 * 60) / 60) + 1)
  const hours = Array.from({ length: to - from }, (_, i) => from + i), today = todayInDubai()
  /** Side-by-side lanes for slots that overlap on one day. */
  const lanes = (list: SSlot[]) => { const end: number[] = [], out = new Map<string, [number, number]>()
    const sorted = [...list].sort((a, b) => mins(a.startsAt) - mins(b.startsAt))
    for (const s of sorted) { const st = mins(s.startsAt), en = st + Math.max(MIN_LEN, (Date.parse(s.endsAt!) - Date.parse(s.startsAt)) / 60000)
      let lane = end.findIndex(e => e <= st); if (lane < 0) { lane = end.length; end.push(en) } else end[lane] = en; out.set(s.id, [lane, 0]) }
    for (const [id, [l]] of out) out.set(id, [l, end.length]); return out }
  const chip = (s: SSlot, style?: React.CSSProperties) => <button key={s.id} className={`wk-ev sl ${s.status}`} style={style} onClick={() => onOpen(s.id)}
    title={`${s.outlet} · ${s.placement} · ${tm(s.label)} · ${t(SLOT_STATUS[s.status])}`}>
    <span className="wk-l1"><b>{tm(s.label)}</b> {style ? time(s.startsAt) : s.placement}</span>
    <span className="wk-l2 muted">{t(SLOT_STATUS[s.status])}{s.status === 'open' && s.topBid ? ` · ${money(s.topBid)}` : ''}</span></button>
  return <div className="wk scroll-x" role="grid" aria-label={t('Week')}>
    <div className="wk-inner" style={{ ['--hour' as string]: `${HOUR}px` }}>
      <div className="wk-head"><span />{days.map(d => <span key={d} className={d === today ? 'today' : ''}>{dayLabel(d)}</span>)}</div>
      {allDay.length > 0 && <div className="wk-allday"><span className="small muted">{t('All day and packages')}</span>{days.map(d => <div key={d}>{allDay.filter(s => dubai(s.startsAt).date === d)
        .sort((a, b) => a.placement.localeCompare(b.placement) || a.kind.localeCompare(b.kind) || a.startsAt.localeCompare(b.startsAt)).map(s => chip(s))}</div>)}</div>}
      <div className="wk-body" style={{ height: hours.length * HOUR }}>
        <div className="wk-hours">{hours.map(h => <span key={h} style={{ top: (h - from) * HOUR }}>{ltr(`${String(h).padStart(2, '0')}:00`)}</span>)}</div>
        {days.map(d => { const list = timed.filter(s => dubai(s.startsAt).date === d), l = lanes(list)
          return <div key={d} className={`wk-day ${d === today ? 'today' : ''}`}>{list.map(s => { const [lane, n] = l.get(s.id)!, st = mins(s.startsAt)
            const len = Math.max(MIN_LEN, (Date.parse(s.endsAt!) - Date.parse(s.startsAt)) / 60000)
            return chip(s, { top: (st / 60 - from) * HOUR + 1, height: len / 60 * HOUR - 3, insetInlineStart: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }) })}</div> })}
      </div>
    </div>
  </div>
}

type Panel = SSlot & { creativeDueAt: string; choiceDeadlineAt: string | null
  bids: { id: string; kind: string; amount: number; status: string; at: string; company: string; choosable: boolean; acceptable?: boolean
    brief: { advertiser: string | null; industry: string | null; message: string | null; language: string | null; notes: string | null } | null }[]
  deals: { id: string; ref: string; status: string; amount: number; kind: string }[] }
const KIND: Record<string, string> = { bid: 'Bid', auto: 'Auto-bid', buy_now: t("Buy now"), interest: 'Interest' }

export function SlotPanel({ id, onChange, onClose }: { id: string; onChange?: () => void; onClose?: () => void }) {
  const [s, setS] = useState<Panel | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = () => api<Panel>(`/seller/slots/${id}`).then(setS, e => setError(e.message))
  useEffect(() => { load() }, [id])
  async function act(path: string, body: object) {
    setBusy(true); setError('')
    try { const r = await api(path, { method: 'POST', body }); onChange?.(); if (r?.id && r?.status) navigate(`/deals/${r.id}`); else await load() }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!s) return error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>
  return <>
    <header className="drawer-h"><div><h2>{s.outlet} · {s.label}</h2><p className="muted small">{s.placement} · {when(s.startsAt)}</p></div>
      {onClose && <button className="btn" onClick={onClose} aria-label={t("Close")}>✕</button>}</header>
    <p><b>{t(SLOT_STATUS[s.status])}</b> · {s.saleType === 'auction' ? t('Auction') : t('Quick sale')}{s.status === 'open' && s.saleType === 'auction' ? ` · ${t('bidding closes {when}', { when: when(s.closesAt) })}` : ''}</p>
    {s.status === 'awaiting_choice' && <p className="warn">{s.choiceDeadlineAt ? t('The winner did not go ahead. Choose another bid by {when}, or let it relist as a quick sale.', { when: when(s.choiceDeadlineAt) }) : t('The winner did not go ahead. Choose another bid, or let it relist as a quick sale.')}</p>}
    <dl className="prices">
      <div><dt>{s.saleType === 'auction' ? t('Starting price') : t('Price')}</dt><dd className="num">{money(s.startingPrice)}</dd></div>
      {s.reservePrice && <div><dt>{t("Reserve (buyers don't see it)")}</dt><dd className="num">{money(s.reservePrice)}</dd></div>}
      {s.buyNowPrice && <div><dt>{t("Buy now")}</dt><dd className="num">{money(s.buyNowPrice)}</dd></div>}
      <div><dt>{t("Creative due")}</dt><dd className="num small">{when(s.creativeDueAt)}</dd></div>
    </dl>
    <section><h3 style={{ fontSize: 15, marginBottom: 8 }}>{t("Bids and requests")}</h3>
      {s.bids.some(b => b.acceptable) && <p className="small">{t('Accept one buyer by {when} to book it. The others are told the slot has gone. Unanswered interest lapses then.', { when: when(s.closesAt) })}</p>}
      {!s.bids.length ? <p className="muted small">{t("None yet.")}</p> : <div className="table-wrap"><table className="table"><tbody>{s.bids.map(b => <tr key={b.id}>
        <td>{b.company}<div className="small muted">{t(KIND[b.kind])} · {t(b.status.replace('_', ' '))}</div>
          {b.acceptable && b.brief && <div className="small brief-mini">{b.brief.advertiser && <div><b>{b.brief.advertiser}</b>{b.brief.industry ? `${sep}${t(b.brief.industry)}` : ''}</div>}
            {b.brief.message && <div className="muted">“{b.brief.message}”</div>}{b.brief.notes && <div className="muted">{b.brief.notes}</div>}</div>}</td>
        <td className="r num">{money(b.amount)}</td>
        <td className="r">{b.choosable && <button className="btn primary" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/choose`, { bidId: b.id })}>{t("Choose")}</button>}
          {b.acceptable && <button className="btn primary" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/accept-interest`, { bidId: b.id })}>{t("Accept")}</button>}</td></tr>)}</tbody></table></div>}
    </section>
    {s.deals.length > 0 && <section><h3 style={{ fontSize: 15, marginBottom: 8 }}>{t("Bookings")}</h3>
      <ul className="timeline">{s.deals.map(d => <li key={d.id}><a href={`/deals/${d.id}`} className="num">{d.ref}</a><span><DealStatus s={d.status} /> · {money(d.amount)}</span></li>)}</ul></section>}
    {error && <p className="error" role="alert">{error}</p>}
    {(s.status === 'open' || s.status === 'blocked') && !s.bids.length && <footer className="drawer-f">
      <button className="btn" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/block`, { blocked: s.status === 'open' })}>{s.status === 'open' ? t('Take off sale') : t('Put back on sale')}</button></footer>}
  </>
}

export const SlotPage = ({ id }: { id: string }) => <main className="narrow"><p className="small"><a href="/schedule">{t("Calendar")}</a></p><div className="card pad" style={{ display: 'grid', gap: 16 }}><SlotPanel id={id} /></div></main>
