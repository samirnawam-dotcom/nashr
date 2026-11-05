import { useEffect, useState } from 'react'
import { api } from '../api'
import { DealStatus, TaskList, money, when, type Task } from './common'

type Overview = { company: string; todo: number; money: { available: number; held: number; owed: number }
  onboarding: { outlet: boolean; payouts: boolean; tax: boolean; placement: boolean; live: boolean }
  upcoming: { id: string; ref: string; status: string; label: string; startsAt: string; outlet: string; buyer: string }[] }

const STEPS: [keyof Overview['onboarding'], string, string][] = [
  ['outlet', 'Add your outlet profile', '#/profile'], ['payouts', 'Connect your payout account', '#/profile'], ['tax', 'Add your TRN and invoice choice', '#/profile'],
  ['placement', 'Add your first placement', '#/listings/new'], ['live', 'Put slots on sale', '#/listings'],
]

const greeting = () => { const h = (new Date().getUTCHours() + 4) % 24; return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' } // Dubai time

export function SellerDashboard() {
  const [o, setO] = useState<Overview | null>(null), [tasks, setTasks] = useState<Task[]>([]), [error, setError] = useState('')
  useEffect(() => { api<Overview>('/seller/overview').then(setO, e => setError(e.message)); api<Task[]>('/seller/inbox').then(setTasks, () => {}) }, [])
  if (!o) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  const done = STEPS.filter(([k]) => o.onboarding[k]).length
  return (
    <main>
      <div className="page-h"><h1>{greeting()}, {o.company}</h1></div>
      {done < STEPS.length && <section className="card pad section" style={{ maxWidth: 560 }}>
        <h2>Get ready to sell · {done} of {STEPS.length}</h2>
        <ul className="checklist">{STEPS.map(([k, label, href]) => <li key={k} className={o.onboarding[k] ? 'done' : ''}>
          <span className="tick" aria-hidden>✓</span><span>{o.onboarding[k] ? label : <a href={href}>{label}</a>}</span></li>)}</ul>
      </section>}
      <dl className="kpis">
        <div className="card"><dt>Needs you</dt><dd className="num">{o.todo}</dd></div>
        <div className="card"><dt>Held for bookings in progress</dt><dd className="num">{money(o.money.held)}</dd></div>
        <div className="card"><dt>Released, to be paid out</dt><dd className="num">{money(o.money.available)}</dd></div>
        {o.money.owed > 0 && <div className="card"><dt>Owed to Nashr (next payout)</dt><dd className="num" style={{ color: 'var(--red)' }}>{money(o.money.owed)}</dd></div>}
      </dl>
      <div className="dash-cols">
        <section><div className="row-flex" style={{ marginBottom: 12 }}><h2 className="sec-h" style={{ margin: 0 }}>To do</h2><div className="spacer" /><a className="small" href="#/inbox">Inbox</a></div>
          <TaskList tasks={tasks} limit={6} /></section>
        <section><h2 className="sec-h" style={{ marginTop: 0 }}>Coming up</h2>
          {!o.upcoming.length ? <p className="muted empty">No booked slots coming up.</p>
            : <table className="table card"><tbody>{o.upcoming.map(u => <tr key={u.id} onClick={() => (location.hash = `#/deals/${u.id}`)}>
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
