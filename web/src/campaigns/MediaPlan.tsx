import { useEffect, useState } from 'react'
import { api, type Campaign } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import { Status } from '../bookings/Bookings'
import './media-plan.css'

type Detail = Campaign & { items: { outletId: string; outlet: string; channel: string; planned: number; committed: number }[]
  bookings: { id: string; ref: string; status: string; price: number; label: string; startsAt: string; outlet: string }[] }
const CHANNEL: Record<string, string> = { tv: 'TV', radio: 'Radio', print: 'Print', digital: 'Digital', podcast: 'Podcast' }
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })

/**
 * A campaign as a client-ready media plan on one A4 sheet: summary, the plan by outlet and the bookings made.
 * "Save as PDF" in the browser's print dialog gives the file; the screen-only controls never print.
 */
export function MediaPlanPage({ id }: { id: string }) {
  const [c, setC] = useState<Detail | null>(null), [company, setCompany] = useState(''), [error, setError] = useState('')
  useEffect(() => {
    api<Detail>(`/campaigns/${id}`).then(setC, e => setError(e.message))
    api<{ company: { name: string } }>('/me').then(m => setCompany(m.company.name), () => {})
  }, [id])
  useEffect(() => { if (c) document.title = `${c.name}: media plan | Nashr` }, [c])
  if (!c) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>

  const planned = c.items.reduce((n, i) => n + i.planned, 0)
  const byChannel = Object.entries(c.items.reduce((m, i) => ({ ...m, [i.channel]: (m[i.channel] ?? 0) + Math.max(i.planned, i.committed) }), {} as Record<string, number>))
    .sort((a, b) => b[1] - a[1])
  const mix = byChannel.reduce((n, [, v]) => n + v, 0)
  return (
    <main className="plan-page">
      <div className="plan-actions no-print">
        <a className="btn" href={`/campaigns/${c.id}`}>Back to the campaign</a>
        <button className="btn primary" onClick={() => print()}>Print or save as PDF</button>
        <span className="small muted">In the print dialog, choose “Save as PDF”.</span>
      </div>

      <article className="plan-sheet">
        <header className="plan-head">
          <div><span className="plan-mark"><b>Nashr</b><i lang="ar">نشر</i></span><p className="plan-kicker">Media plan</p>
            <h1>{c.name}</h1>
            <p className="plan-meta">{[company, c.objective, c.launchDate && `Launches ${dayLabel(c.launchDate)}`].filter(Boolean).join(' · ')}</p></div>
          <p className="plan-date">Prepared {today()}</p>
        </header>

        <section className="plan-kpis" aria-label="Budget">
          <div><span>Budget</span><b>{money(c.budget)}</b></div>
          <div><span>Planned</span><b>{money(planned)}</b></div>
          <div><span>Committed</span><b>{money(c.committed)}</b></div>
          <div><span>Remaining</span><b>{money(c.remaining)}</b></div>
        </section>

        {byChannel.length > 0 && mix > 0 && <section className="plan-mix" aria-label="Channel mix">
          <h2>Channel mix</h2>
          <div className="mix-bar" aria-hidden>{byChannel.map(([ch, v]) => <i key={ch} className={`mix-${ch}`} style={{ width: `${(v / mix) * 100}%` }} />)}</div>
          <ul>{byChannel.map(([ch, v]) => <li key={ch}><i className={`mix-${ch}`} aria-hidden />{CHANNEL[ch] ?? ch} <b>{Math.round((v / mix) * 100)}%</b> <span>{money(v)}</span></li>)}</ul>
          <p className="plan-note">By outlet in the plan: the amount committed, or the amount planned while that is higher.</p>
        </section>}

        <section>
          <h2>The plan</h2>
          {!c.items.length ? <p className="muted">No outlets in the plan yet.</p> :
            <table className="plan-table"><thead><tr><th>Outlet</th><th>Channel</th><th className="r">Planned</th><th className="r">Committed</th></tr></thead>
              <tbody>{c.items.map(i => <tr key={i.outletId}><td><b>{i.outlet}</b></td><td>{CHANNEL[i.channel] ?? i.channel}</td>
                <td className="r num">{i.planned ? money(i.planned) : '—'}</td><td className="r num">{i.committed ? money(i.committed) : '—'}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={2}>Total</td><td className="r num">{money(planned)}</td><td className="r num">{money(c.committed)}</td></tr></tfoot></table>}
        </section>

        <section>
          <h2>Bookings</h2>
          {!c.bookings.length ? <p className="muted">Nothing booked yet.</p> :
            <table className="plan-table"><thead><tr><th>Order</th><th>Outlet and slot</th><th>Airs</th><th className="r">Price</th><th>Status</th></tr></thead>
              <tbody>{c.bookings.map(b => <tr key={b.id}><td className="num">{b.ref}</td><td><b>{b.outlet}</b> · {b.label}</td>
                <td className="num">{dayLabel(dubai(b.startsAt).date)} · {time(b.startsAt)}</td><td className="r num">{money(b.price)}</td><td><Status s={b.status} /></td></tr>)}</tbody></table>}
        </section>

        <footer className="plan-foot">Prices in AED, excluding VAT. Times in Dubai time. Payments are held by Nashr until the publisher proves the ad ran.
          Figures as of {today()}; planned amounts are estimates until a publisher accepts.</footer>
      </article>
    </main>
  )
}
