import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel, time } from '../format'
import { addDays, dubai, todayInDubai, weekOf } from '../calendar/layout'
import { DealStatus, SLOT_STATUS, money, when } from './common'
import { PhotoBand } from '../PhotoBand'

type SSlot = { id: string; outlet: string; channel: string; placement: string; label: string; kind: string; saleType: string; startsAt: string; endsAt: string | null
  closesAt: string; status: string; startingPrice: number; buyNowPrice: number | null; reservePrice: number | null; topBid: number | null; bids: number }

/** Programme view: one row per placement, one column per day, each airing's breaks as chips (brief section 6). */
export function SchedulePage() {
  const [anchor, setAnchor] = useState(todayInDubai()), [slots, setSlots] = useState<SSlot[] | null>(null), [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState('')
  const days = weekOf(anchor)
  const load = () => api<SSlot[]>(`/seller/slots?from=${days[0]}T00:00:00%2B04:00&to=${addDays(days[6], 1)}T00:00:00%2B04:00`).then(setSlots, e => setError(e.message))
  useEffect(() => { load() }, [anchor])
  const rows = [...new Set((slots ?? []).map(s => `${s.outlet} · ${s.placement}`))].sort()
  return (
    <main>
      <PhotoBand img="/brand/tv-wide.jpg" title="Calendar" sub="Your slots by week, with bids, bookings and what is still on sale. Dubai time." />
      <div className="page-h"><div className="spacer" />
        <div className="row-flex"><button className="btn" aria-label="Previous week" onClick={() => setAnchor(addDays(anchor, -7))}>‹</button>
          <button className="btn" onClick={() => setAnchor(todayInDubai())}>This week</button>
          <button className="btn" aria-label="Next week" onClick={() => setAnchor(addDays(anchor, 7))}>›</button>
          <b>{dayLabel(days[0], { day: 'numeric', month: 'short' })} – {dayLabel(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}</b></div></div>
      <div className="legend">{[['var(--teal-4)', 'On sale'], ['var(--amber)', 'Needs your decision'], ['var(--green)', 'Booked'], ['var(--faint)', 'Off sale or taken']].map(([c, l]) =>
        <span key={l}><i style={{ background: c }} />{l}</span>)}<span>Dubai time</span></div>
      {error && <p className="error">{error}</p>}
      {slots && !slots.length && <p className="muted empty">Nothing listed this week. <a href="/listings">List slots</a></p>}
      {slots && slots.length > 0 && <div className="scroll-x"><table className="prog">
        <thead><tr><th className="place">Placement</th>{days.map(d => <th key={d}>{dayLabel(d)}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r}><th className="place">{r}</th>{days.map(d => <td key={d}>
          {slots.filter(s => `${s.outlet} · ${s.placement}` === r && dubai(s.startsAt).date === d).map(s =>
            <button key={s.id} className={`sl ${s.status}`} onClick={() => setOpen(s.id)}>
              <b>{s.label}</b>{s.endsAt && <span className="muted"> · {time(s.startsAt)}</span>}
              <div className="muted">{SLOT_STATUS[s.status]}{s.status !== 'open' ? '' : s.topBid ? ` · ${money(s.topBid)}` : s.bids ? ` · ${s.bids} interested` : ''}</div>
            </button>)}
        </td>)}</tr>)}</tbody></table></div>}
      {open && <div className="scrim" onClick={() => setOpen(null)}><aside className="drawer" role="dialog" aria-label="Slot" onClick={e => e.stopPropagation()}>
        <SlotPanel id={open} onChange={load} onClose={() => setOpen(null)} /></aside></div>}
    </main>
  )
}

type Panel = SSlot & { creativeDueAt: string; choiceDeadlineAt: string | null
  bids: { id: string; kind: string; amount: number; status: string; at: string; company: string; choosable: boolean }[]
  deals: { id: string; ref: string; status: string; amount: number; kind: string }[] }
const KIND: Record<string, string> = { bid: 'Bid', auto: 'Auto-bid', buy_now: 'Buy now', interest: 'Interest' }

export function SlotPanel({ id, onChange, onClose }: { id: string; onChange?: () => void; onClose?: () => void }) {
  const [s, setS] = useState<Panel | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = () => api<Panel>(`/seller/slots/${id}`).then(setS, e => setError(e.message))
  useEffect(() => { load() }, [id])
  async function act(path: string, body: object) {
    setBusy(true); setError('')
    try { const r = await api(path, { method: 'POST', body }); onChange?.(); if (r?.id && r?.status) navigate(`/deals/${r.id}`); else await load() }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!s) return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>
  return <>
    <header className="drawer-h"><div><h2>{s.outlet} · {s.label}</h2><p className="muted small">{s.placement} · {when(s.startsAt)}</p></div>
      {onClose && <button className="btn" onClick={onClose} aria-label="Close">✕</button>}</header>
    <p><b>{SLOT_STATUS[s.status]}</b> · {s.saleType === 'auction' ? 'Auction' : 'Quick sale'}{s.status === 'open' && s.saleType === 'auction' ? ` · bidding closes ${when(s.closesAt)}` : ''}</p>
    {s.status === 'awaiting_choice' && <p className="warn">The winner did not go ahead. Choose another bid{s.choiceDeadlineAt ? ` by ${when(s.choiceDeadlineAt)}` : ''}, or let it relist as a quick sale.</p>}
    <dl className="prices">
      <div><dt>{s.saleType === 'auction' ? 'Starting price' : 'Price'}</dt><dd className="num">{money(s.startingPrice)}</dd></div>
      {s.reservePrice && <div><dt>Reserve (buyers don't see it)</dt><dd className="num">{money(s.reservePrice)}</dd></div>}
      {s.buyNowPrice && <div><dt>Buy now</dt><dd className="num">{money(s.buyNowPrice)}</dd></div>}
      <div><dt>Creative due</dt><dd className="num small">{when(s.creativeDueAt)}</dd></div>
    </dl>
    <section><h3 style={{ fontSize: 15, marginBottom: 8 }}>Bids and requests</h3>
      {!s.bids.length ? <p className="muted small">None yet.</p> : <div className="table-wrap"><table className="table"><tbody>{s.bids.map(b => <tr key={b.id}>
        <td>{b.company}<div className="small muted">{KIND[b.kind]} · {b.status.replace('_', ' ')}</div></td><td className="r num">{money(b.amount)}</td>
        <td className="r">{b.choosable && <button className="btn primary" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/choose`, { bidId: b.id })}>Choose</button>}</td></tr>)}</tbody></table></div>}
    </section>
    {s.deals.length > 0 && <section><h3 style={{ fontSize: 15, marginBottom: 8 }}>Bookings</h3>
      <ul className="timeline">{s.deals.map(d => <li key={d.id}><a href={`/deals/${d.id}`} className="num">{d.ref}</a><span><DealStatus s={d.status} /> · {money(d.amount)}</span></li>)}</ul></section>}
    {error && <p className="error" role="alert">{error}</p>}
    {(s.status === 'open' || s.status === 'blocked') && !s.bids.length && <footer className="drawer-f">
      <button className="btn" disabled={busy} onClick={() => act(`/seller/slots/${s.id}/block`, { blocked: s.status === 'open' })}>{s.status === 'open' ? 'Take off sale' : 'Put back on sale'}</button></footer>}
  </>
}

export const SlotPage = ({ id }: { id: string }) => <main className="narrow"><p className="small"><a href="/schedule">Calendar</a></p><div className="card pad" style={{ display: 'grid', gap: 16 }}><SlotPanel id={id} /></div></main>
