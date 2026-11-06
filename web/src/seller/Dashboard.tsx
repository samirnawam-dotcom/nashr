import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { DealStatus, TaskList, money, when, type Task } from './common'
import { Delta, Hero, Meter, RankedBars, StatTile, WeekColumns, compact } from '../charts'

type Overview = { company: string; todo: number; money: { available: number; held: number; owed: number }
  onboarding: { outlet: boolean; payouts: boolean; tax: boolean; placement: boolean; live: boolean }
  upcoming: { id: string; ref: string; status: string; label: string; startsAt: string; outlet: string; buyer: string }[] }

const STEPS: [keyof Overview['onboarding'], string, string][] = [
  ['outlet', 'Add your outlet profile', '/profile'], ['payouts', 'Connect your payout account', '/profile'], ['tax', 'Add your TRN and invoice choice', '/profile'],
  ['placement', 'Add your first placement', '/listings/new'], ['live', 'Put slots on sale', '/listings'],
]

const greeting = () => { const h = (new Date().getUTCHours() + 4) % 24; return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' } // Dubai time

type Weeks = { week: string; value: number }[]
type Dash = {
  earnings: { weeks: Weeks; last30: number; prev30: number }; booked: { weeks: Weeks; last30: number; prev30: number }
  demand: { bids7d: number; buyers7d: number; buyers30d: number; priceLift: number | null; auctions: number }
  decisions: { accepted: number; declined: number; medianHours: number | null }
  inventory: { sold: number; waiting: number; open: number; unsold: number; blocked: number }
  topPlacements: { label: string; outlet: string; value: number; count: number }[]; topBuyers: { label: string; value: number; count: number }[]
}
const hours = (h: number | null) => h == null ? 'No decisions yet' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h < 10 ? h.toFixed(1) : Math.round(h)} h`

export function SellerDashboard() {
  const [o, setO] = useState<Overview | null>(null), [d, setD] = useState<Dash | null>(null), [tasks, setTasks] = useState<Task[]>([]), [error, setError] = useState('')
  useEffect(() => {
    api<Overview>('/seller/overview').then(setO, e => setError(e.message)); api<Dash>('/seller/dashboard').then(setD, () => {})
    api<Task[]>('/seller/inbox').then(setTasks, () => {})
  }, [])
  if (!o || !d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  const done = STEPS.filter(([k]) => o.onboarding[k]).length
  const inv = d.inventory, total = inv.sold + inv.waiting + inv.open + inv.unsold
  const decided = d.decisions.accepted + d.decisions.declined
  return (
    <main className="dash">
      <div className="dash-head photo-head"><img className="dash-photo" src="/brand/dash-seller.jpg" width={1600} height={400} alt="" decoding="async" fetchPriority="high" /><h1>{greeting()}, {o.company}</h1><div className="spacer" />
        <a className="btn" href="/schedule">Calendar</a><a className="btn primary" href="/listings/new">Add a placement</a></div>
      {done < STEPS.length && <section className="card pad section" style={{ maxWidth: 560 }}>
        <h2>Get ready to sell · {done} of {STEPS.length}</h2>
        <ul className="checklist">{STEPS.map(([k, label, href]) => <li key={k} className={o.onboarding[k] ? 'done' : ''}>
          <span className="tick" aria-hidden>✓</span><span>{o.onboarding[k] ? label : <a href={href}>{label}</a>}</span></li>)}</ul>
      </section>}

      <section className="dash-lead">
        <Hero label="Earned in the last 30 days" value={money(d.earnings.last30)}>
          <Delta now={d.earnings.last30} before={d.earnings.prev30} />
          <span className="stat-sub">Paid out to you after proof is approved, net of Nashr's commission.</span>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>Held for bookings in progress</dt><dd>{money(o.money.held)}</dd>
            <dt>Released, being paid out</dt><dd>{money(o.money.available)}</dd>
            {o.money.owed > 0 && <><dt>Owed to Nashr (next payout)</dt><dd style={{ color: 'var(--red)' }}>{money(o.money.owed)}</dd></>}
          </dl>
        </Hero>
        <WeekColumns weeks={d.earnings.weeks} title="Your earnings by week" valueName="Earned" />
      </section>

      <div className="stats">
        <StatTile label="Needs you" value={String(o.todo)} href="/inbox" sub={o.todo ? 'Decisions, creative and proof' : 'All clear'} />
        <StatTile label="Sold in the last 30 days" value={compact(d.booked.last30)} delta={<Delta now={d.booked.last30} before={d.booked.prev30} />} spark={d.booked.weeks.map(w => w.value)} />
        <StatTile label="Bids this week" value={String(d.demand.bids7d)} sub={`from ${d.demand.buyers7d} ${d.demand.buyers7d === 1 ? 'buyer' : 'buyers'} · ${d.demand.buyers30d} buyers this month`} />
        <StatTile label="Price above starting" value={d.demand.priceLift == null ? 'No auctions yet' : `+${Math.round(d.demand.priceLift * 100)}%`}
          sub={d.demand.auctions ? `average over ${d.demand.auctions} auctions, last 90 days` : 'Auctions show how far bidding lifts your price'} />
      </div>

      <div className="dash-grid">
        <section className="panel span-8">
          <div className="panel-h"><h2>To do</h2><span className="muted small">soonest first</span><div className="spacer" /><a href="/inbox">Inbox</a></div>
          <TaskList tasks={tasks} limit={6} />
        </section>
        <section className="panel span-4">
          <div className="panel-h"><h2>Next 4 weeks</h2><div className="spacer" /><a href="/schedule">Calendar</a></div>
          <Meter label="Sold or waiting on you" value={inv.sold + inv.waiting} max={total || 1} warnAt={2}
            detail={total ? `${inv.sold} sold · ${inv.waiting} waiting for your decision · ${inv.open} still on sale${inv.unsold ? ` · ${inv.unsold} unsold` : ''}` : 'Nothing listed for the next 4 weeks.'} />
          <Meter label="Requests you accepted (90 days)" value={d.decisions.accepted} max={decided || 1} warnAt={2}
            detail={decided ? `${d.decisions.accepted} accepted · ${d.decisions.declined} declined · typical reply ${hours(d.decisions.medianHours)}` : 'No decisions yet.'} />
        </section>

        <section className="panel span-6">
          <RankedBars title="Best-selling placements (last 90 days)" empty="No paid bookings yet."
            items={d.topPlacements.map(p => ({ label: p.label, sub: `${p.outlet} · ${p.count} sold`, value: p.value }))} />
        </section>
        <section className="panel span-6">
          <RankedBars title="Top buyers (last 90 days)" empty="No buyers yet."
            items={d.topBuyers.map(b => ({ label: b.label, sub: `${b.count} ${b.count === 1 ? 'booking' : 'bookings'}`, value: b.value }))} />
        </section>

        <section className="panel">
          <div className="panel-h"><h2>Coming up on air</h2><div className="spacer" /><a href="/deals">Deals</a></div>
          {!o.upcoming.length ? <p className="dash-empty">No booked slots coming up.</p>
            : <table className="table"><tbody>{o.upcoming.map(u => <tr key={u.id} onClick={() => (navigate(`/deals/${u.id}`))}>
              <td><b>{u.outlet}</b> · {u.label}<div className="small muted">{u.buyer}</div></td><td className="num small">{when(u.startsAt)}</td><td><DealStatus s={u.status} /></td></tr>)}</tbody></table>}
        </section>
      </div>
    </main>
  )
}

export function InboxPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null), [error, setError] = useState('')
  useEffect(() => { api<Task[]>('/seller/inbox').then(setTasks, e => setError(e.message)) }, [])
  return <main><div className="page-h"><h1>Inbox</h1><span className="muted small">Everything waiting on you, soonest deadline first.</span></div>
    {error && <p className="error">{error}</p>}{tasks && <TaskList tasks={tasks} />}</main>
}
