import { navigate } from '../nav'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { dayLabel, time } from '../format'
import { addDays, dubai, todayInDubai, weekOf } from '../calendar/layout'
import { DealStatus, SLOT_STATUS, money, when } from './common'
import { PhotoBand } from '../PhotoBand'
import { ltr, t } from '../i18n'
import { tm } from '../i18n-server'

type SSlot = { id: string; outlet: string; channel: string; placement: string; label: string; kind: string; saleType: string; startsAt: string; endsAt: string | null
  closesAt: string; status: string; startingPrice: number; buyNowPrice: number | null; reservePrice: number | null; topBid: number | null; bids: number }

/** Programme view: one row per placement, one column per day, each airing's breaks as chips (brief section 6). */
export function SchedulePage() {
  const [anchor, setAnchor] = useState(todayInDubai()), [slots, setSlots] = useState<SSlot[] | null>(null), [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState(''), [view, setView] = useState<'programme' | 'week'>(() => { try { return localStorage.getItem('nashr:seller-view') === 'week' ? 'week' : 'programme' } catch { return 'programme' } })
  const choose = (v: 'programme' | 'week') => { setView(v); try { localStorage.setItem('nashr:seller-view', v) } catch { /* fine */ } }
  const days = weekOf(anchor)
  const latest = useRef(0) // only the newest request may fill the grid, so a slow answer for the previous week can't overwrite this one
  const load = () => { const n = ++latest.current
    return api<SSlot[]>(`/seller/slots?from=${days[0]}T00:00:00%2B04:00&to=${addDays(days[6], 1)}T00:00:00%2B04:00`).then(x => n === latest.current && setSlots(x), e => n === latest.current && setError(e.message)) }
  useEffect(() => { load() }, [anchor])
  const rows = [...new Set((slots ?? []).map(s => `${s.outlet} · ${s.placement}`))].sort()
  return (
    <main>
      <PhotoBand img="/brand/tv-wide.jpg" title={t("Calendar")} sub={t("Your slots by week, with bids, bookings and what is still on sale. Dubai time.")} />
      <div className="page-h">
        <div className="seg" role="tablist" aria-label={t('View')}>{([['programme', t('Programme')], ['week', t('Week')]] as const).map(([v, l]) =>
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => choose(v)}>{l}</button>)}</div>
        <div className="spacer" />
        <div className="row-flex"><button className="btn" aria-label={t("Previous week")} onClick={() => setAnchor(addDays(anchor, -7))}>‹</button>
          <button className="btn" onClick={() => setAnchor(todayInDubai())}>{t("This week")}</button>
          <button className="btn" aria-label={t("Next week")} onClick={() => setAnchor(addDays(anchor, 7))}>›</button>
          <b>{dayLabel(days[0], { day: 'numeric', month: 'short' })} – {dayLabel(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}</b></div></div>
      <div className="legend">{[['var(--teal-4)', 'On sale'], ['var(--amber)', 'Needs your decision'], ['var(--green)', 'Booked'], ['var(--faint)', 'Off sale or taken']].map(([c, l]) =>
        <span key={l}><i style={{ background: c }} />{t(l)}</span>)}<span>{t("Dubai time")}</span></div>
      {error && <p className="error">{error}</p>}
      {slots && !slots.length && <p className="muted empty">{t("Nothing listed this week.")} <a href="/listings">{t("List slots")}</a></p>}
      {slots && slots.length > 0 && view === 'week' && <WeekGrid days={days} slots={slots} onOpen={setOpen} />}
      {slots && slots.length > 0 && view === 'programme' && <div className="scroll-x"><table className="prog">
        <thead><tr><th className="place">{t("Placement")}</th>{days.map(d => <th key={d}>{dayLabel(d)}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r}><th className="place">{r}</th>{days.map(d => <td key={d}>
          {slots.filter(s => `${s.outlet} · ${s.placement}` === r && dubai(s.startsAt).date === d).map(s =>
            <button key={s.id} className={`sl ${s.status}`} onClick={() => setOpen(s.id)}>
              <b>{tm(s.label)}</b>{s.endsAt && <span className="muted"> · {time(s.startsAt)}</span>}
              <div className="muted">{t(SLOT_STATUS[s.status])}{s.status !== 'open' ? '' : s.topBid ? ` · ${money(s.topBid)}` : s.bids ? ` · ${t('{n} interested', { n: s.bids })}` : ''}</div>
            </button>)}
        </td>)}</tr>)}</tbody></table></div>}
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
  bids: { id: string; kind: string; amount: number; status: string; at: string; company: string; choosable: boolean }[]
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
      {!s.bids.length ? <p className="muted small">{t("None yet.")}</p> : <div className="table-wrap"><table className="table"><tbody>{s.bids.map(b => <tr key={b.id}>
        <td>{b.company}<div className="small muted">{t(KIND[b.kind])} · {t(b.status.replace('_', ' '))}</div></td><td className="r num">{money(b.amount)}</td>
        <td className="r">{b.choosable && <button className="btn primary" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/choose`, { bidId: b.id })}>{t("Choose")}</button>}</td></tr>)}</tbody></table></div>}
    </section>
    {s.deals.length > 0 && <section><h3 style={{ fontSize: 15, marginBottom: 8 }}>{t("Bookings")}</h3>
      <ul className="timeline">{s.deals.map(d => <li key={d.id}><a href={`/deals/${d.id}`} className="num">{d.ref}</a><span><DealStatus s={d.status} /> · {money(d.amount)}</span></li>)}</ul></section>}
    {error && <p className="error" role="alert">{error}</p>}
    {(s.status === 'open' || s.status === 'blocked') && !s.bids.length && <footer className="drawer-f">
      <button className="btn" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/block`, { blocked: s.status === 'open' })}>{s.status === 'open' ? t('Take off sale') : t('Put back on sale')}</button></footer>}
  </>
}

export const SlotPage = ({ id }: { id: string }) => <main className="narrow"><p className="small"><a href="/schedule">{t("Calendar")}</a></p><div className="card pad" style={{ display: 'grid', gap: 16 }}><SlotPanel id={id} /></div></main>
