import { useEffect, useState } from 'react'
import { api, type Campaign } from '../api'
import { closesIn, dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import { CHANNEL, Delta, Hero, Meter, RankedBars, StatTile, WeekColumns, compact } from '../charts'

type Weeks = { week: string; value: number }[]
type D = {
  heldNow: number; heldCount: number; spend: { weeks: Weeks; last30: number; prev30: number }
  toPay: { count: number; amount: number; soonest: string | null }
  bids: { leading: number; outbid: number; items: { slotId: string; outlet: string; channel: string; label: string; startsAt: string; closesAt: string; topBid: number; yourMax: number; leading: boolean }[] }
  tasks: { type: 'pay' | 'creative' | 'proof' | 'issue'; dealId: string; label: string; dueAt: string | null; amount?: number }[]; taskCount: number
  byChannel: { channel: string; value: number; count: number }[]
  upcoming: { dealId: string; outlet: string; channel: string; label: string; startsAt: string; status: string }[]
  outlets: number; bookings: number
}

const TASK: Record<string, [string, string]> = { pay: ['Pay', 'Pay to secure the booking'], creative: ['Ad', 'Send your creative'], proof: ['Proof', 'Review the proof'], issue: ['Issue', 'Answer the publisher'] }
const when = (iso: string) => `${dayLabel(dubai(iso).date)} · ${time(iso)}`
const soon = (iso: string | null) => !!iso && new Date(iso).getTime() - Date.now() < 24 * 3_600_000
const greeting = () => { const h = (new Date().getUTCHours() + 4) % 24; return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' } // Dubai time

export function BuyerDashboard() {
  const [d, setD] = useState<D | null>(null), [campaigns, setCampaigns] = useState<Campaign[]>([]), [error, setError] = useState(''), [company, setCompany] = useState('')
  useEffect(() => { api<{ company: { name: string } }>('/me').then(m => setCompany(m.company.name), () => {}); api<D>('/buyer/dashboard').then(setD, e => setError(e.message)); api<Campaign[]>('/campaigns').then(c => setCampaigns(c.filter(x => x.status === 'active')), () => {}) }, [])
  if (!d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  const live = d.bids.leading + d.bids.outbid
  return (
    <main className="dash">
      <div className="dash-head photo-head"><img className="dash-photo" src="/brand/dash-buyer.jpg" width={1600} height={400} alt="" decoding="async" fetchPriority="high" /><h1>{greeting()}, {company}</h1><div className="spacer" />
        <a className="btn" href="/campaigns">Campaigns</a><a className="btn primary" href="/calendar">Find slots</a></div>

      <section className="dash-lead">
        <Hero label="Held for you now" value={money(d.heldNow)}>
          <span className="stat-sub">{d.heldCount ? `${d.heldCount} paid ${d.heldCount === 1 ? 'booking' : 'bookings'}, released to publishers only after you approve proof.` : 'Nothing held: paid bookings appear here until their ad has run.'}</span>
          <span className="stat-sub">Paid in the last 30 days: <b className="num">{money(d.spend.last30)}</b></span>
          <Delta now={d.spend.last30} before={d.spend.prev30} goodWhenUp />
        </Hero>
        <WeekColumns weeks={d.spend.weeks} title="Booked and paid, by week (excluding VAT)" valueName="Paid" />
      </section>

      <div className="stats">
        <StatTile label="To pay" value={d.toPay.count ? money(d.toPay.amount) : 'Nothing'} href="/bookings"
          sub={d.toPay.count ? <>{d.toPay.count} accepted {d.toPay.count === 1 ? 'booking' : 'bookings'}{d.toPay.soonest && <>, first by <b>{when(d.toPay.soonest)}</b></>}</> : 'Every accepted booking is paid.'} />
        <StatTile label="Live bids" value={String(live)} href="/calendar"
          sub={live ? <><span className="pill-state is-lead">{d.bids.leading} leading</span> <span className="pill-state is-outbid">{d.bids.outbid} outbid</span></> : 'No open bids.'} />
        <StatTile label="Needs you" value={String(d.taskCount)} sub={d.taskCount ? 'Payments, creative and proof to review' : 'All clear'} />
        <StatTile label="Outlets booked" value={String(d.outlets)} sub={`${d.bookings} paid bookings so far`} spark={d.spend.weeks.map(w => w.value)} />
      </div>

      <div className="dash-grid">
        <section className="panel span-8">
          <div className="panel-h"><h2>Needs you</h2><span className="muted small">soonest first</span><div className="spacer" /><a href="/bookings">All bookings</a></div>
          {!d.tasks.length ? <p className="dash-empty">Nothing waiting on you. New requests appear here once a publisher accepts.</p>
            : <ul className="dash-list">{d.tasks.map(t => <li key={t.type + t.dealId}>
                <span className={`chip-ico ${soon(t.dueAt) ? 'urgent' : ''}`} aria-hidden>{TASK[t.type][0]}</span>
                <a className="what" href={`/bookings/${t.dealId}`}><b>{TASK[t.type][1]}{t.amount ? ` · ${money(t.amount)}` : ''}</b><span>{t.label}</span></a>
                <span className={`when ${soon(t.dueAt) ? 'soon' : ''}`}>{t.dueAt ? <>by {when(t.dueAt)}</> : ''}</span></li>)}</ul>}
        </section>

        <section className="panel span-4">
          <div className="panel-h"><h2>Your bids</h2><div className="spacer" /><a href="/calendar">Calendar</a></div>
          {!d.bids.items.length ? <p className="dash-empty">No open bids. Find a slot on the calendar.</p>
            : <ul className="dash-list">{d.bids.items.map(b => <li key={b.slotId} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <span className="what"><b>{b.outlet} · {b.label}</b><span>{CHANNEL[b.channel]} · airs {dayLabel(dubai(b.startsAt).date)} · {(closesIn(b.closesAt) ?? 'closing').toLowerCase()}</span></span>
                <span className="when"><span className={`pill-state ${b.leading ? 'is-lead' : 'is-outbid'}`}>{b.leading ? 'Leading' : 'Outbid'}</span><br /><span className="num">top {compact(b.topBid)}</span></span></li>)}</ul>}
        </section>

        <section className="panel span-6">
          <div className="panel-h"><h2>Campaign budgets</h2><div className="spacer" /><a href="/campaigns">Campaigns</a></div>
          {!campaigns.length ? <p className="dash-empty">No active campaigns. <a href="/campaigns">Plan one</a> to track spend against a budget.</p>
            : campaigns.slice(0, 4).map(c => <a key={c.id} href={`/campaigns/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <Meter label={c.name} value={c.committed} max={c.budget} warnAt={0.9}
                  detail={<>{money(c.committed)} committed · {money(c.pending)} waiting · <b>{money(c.remaining)} left</b> of {money(c.budget)}</>} /></a>)}
        </section>

        <section className="panel span-6">
          <RankedBars title="Where your budget went (last 90 days, excluding VAT)" empty="No paid bookings in the last 90 days."
            items={d.byChannel.map(c => ({ label: CHANNEL[c.channel] ?? c.channel, sub: `${c.count} ${c.count === 1 ? 'booking' : 'bookings'}`, value: c.value }))} />
        </section>

        <section className="panel">
          <div className="panel-h"><h2>Coming up on air</h2><div className="spacer" /><a href="/bookings">Bookings</a></div>
          {!d.upcoming.length ? <p className="dash-empty">Nothing booked to run yet.</p>
            : <ul className="dash-list">{d.upcoming.map(u => <li key={u.dealId}>
                <span className="chip-ico good" aria-hidden>{(CHANNEL[u.channel] ?? '').slice(0, 2)}</span>
                <a className="what" href={`/bookings/${u.dealId}`}><b>{u.outlet} · {u.label}</b><span>{u.status === 'secured' ? 'Paid, money held' : 'Accepted, waiting for payment'}</span></a>
                <span className="when">{when(u.startsAt)}</span></li>)}</ul>}
        </section>
      </div>
    </main>
  )
}
