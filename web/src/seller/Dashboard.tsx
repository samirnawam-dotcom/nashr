import { navigate } from '../nav'
import { slotWhen } from '../format'
import { tm } from '../i18n-server'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { DealStatus, TaskList, money, when, type Task } from './common'
import { Delta, Hero, Meter, RankedBars, StatTile, WeekColumns, compact } from '../charts'
import { PhotoBand } from '../PhotoBand'
import { ltr, sep, t } from '../i18n'

type Overview = { company: string; todo: number; money: { available: number; held: number; owed: number }
  onboarding: { outlet: boolean; payouts: boolean; tax: boolean; placement: boolean; live: boolean }
  upcoming: { id: string; ref: string; status: string; label: string; startsAt: string; outlet: string; buyer: string }[] }

const STEPS: [keyof Overview['onboarding'], string, string][] = [
  ['outlet', 'Add your outlet profile', '/profile'], ['payouts', 'Connect your payout account', '/profile'], ['tax', 'Add your TRN and invoice choice', '/profile'],
  ['placement', 'Add your first placement', '/listings/new'], ['live', 'Put slots on sale', '/listings'],
]

const greeting = () => { const h = (new Date().getUTCHours() + 4) % 24; return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening') } // Dubai time

type Weeks = { week: string; value: number }[]
type Dash = {
  earnings: { weeks: Weeks; last30: number; prev30: number }; booked: { weeks: Weeks; last30: number; prev30: number }
  demand: { bids7d: number; buyers7d: number; buyers30d: number; priceLift: number | null; auctions: number }
  decisions: { accepted: number; declined: number; medianHours: number | null }
  inventory: { sold: number; waiting: number; open: number; unsold: number; blocked: number }
  topPlacements: { label: string; outlet: string; value: number; count: number }[]; topBuyers: { label: string; value: number; count: number }[]
}
const hours = (h: number | null) => h == null ? t('No decisions yet') : h < 1 ? t('{n} min', { n: Math.max(1, Math.round(h * 60)) }) : t('{n} h', { n: h < 10 ? h.toFixed(1) : Math.round(h) })

export function SellerDashboard() {
  const [o, setO] = useState<Overview | null>(null), [d, setD] = useState<Dash | null>(null), [tasks, setTasks] = useState<Task[]>([]), [error, setError] = useState('')
  useEffect(() => {
    api<Overview>('/seller/overview').then(setO, e => setError(e.message)); api<Dash>('/seller/dashboard').then(setD, () => {})
    api<Task[]>('/seller/inbox').then(setTasks, () => {})
  }, [])
  if (!o || !d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const done = STEPS.filter(([k]) => o.onboarding[k]).length
  const inv = d.inventory, total = inv.sold + inv.waiting + inv.open + inv.unsold
  const decided = d.decisions.accepted + d.decisions.declined
  return (
    <main className="dash">
      <div className="dash-head photo-head"><img className="dash-photo" src="/brand/dash-seller.jpg" width={1600} height={400} alt="" decoding="async" fetchPriority="high" /><h1>{greeting()}{sep}{o.company}</h1><div className="spacer" />
        <a className="btn" href="/schedule">{t("Calendar")}</a><a className="btn primary" href="/listings/new">{t("Add a placement")}</a></div>
      {done < STEPS.length && <section className="card pad section" style={{ maxWidth: 560 }}>
        <h2>{t('Get ready to sell · {done} of {total}', { done, total: STEPS.length })}</h2>
        <ul className="checklist">{STEPS.map(([k, label, href]) => <li key={k} className={o.onboarding[k] ? 'done' : ''}>
          <span className="tick" aria-hidden>✓</span><span>{o.onboarding[k] ? t(label) : <a href={href}>{t(label)}</a>}</span></li>)}</ul>
      </section>}

      <section className="dash-lead">
        <Hero label={t("Earned in the last 30 days")} value={money(d.earnings.last30)}>
          <Delta now={d.earnings.last30} before={d.earnings.prev30} />
          <span className="stat-sub">{t("Paid out to you after proof is approved, net of Nashr's commission.")}</span>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>{t("Held for bookings in progress")}</dt><dd>{money(o.money.held)}</dd>
            <dt>{t("Released, being paid out")}</dt><dd>{money(o.money.available)}</dd>
            {o.money.owed > 0 && <><dt>{t("Owed to Nashr (next payout)")}</dt><dd style={{ color: 'var(--red)' }}>{money(o.money.owed)}</dd></>}
          </dl>
        </Hero>
        <WeekColumns weeks={d.earnings.weeks} title={t("Your earnings by week")} valueName={t("Earned")} />
      </section>

      <div className="stats">
        <StatTile label={t("Needs you")} value={String(o.todo)} href="/inbox" sub={o.todo ? t("Decisions, creative and proof") : t("All clear")} />
        <StatTile label={t("Sold in the last 30 days")} value={compact(d.booked.last30)} delta={<Delta now={d.booked.last30} before={d.booked.prev30} />} spark={d.booked.weeks.map(w => w.value)} />
        <StatTile label={t("Bids this week")} value={String(d.demand.bids7d)} sub={t(d.demand.buyers7d === 1 ? 'from 1 buyer · {month} buyers this month' : 'from {n} buyers · {month} buyers this month', { n: d.demand.buyers7d, month: d.demand.buyers30d })} />
        <StatTile label={t("Price above starting")} value={d.demand.priceLift == null ? t("No auctions yet") : ltr(`+${Math.round(d.demand.priceLift * 100)}%`)}
          sub={d.demand.auctions ? t('average over {n} auctions, last 90 days', { n: d.demand.auctions }) : t("Auctions show how far bidding lifts your price")} />
      </div>

      <div className="dash-grid">
        <section className="panel span-8">
          <div className="panel-h"><h2>{t("To do")}</h2><span className="muted small">{t("soonest first")}</span><div className="spacer" /><a href="/inbox">{t("Inbox")}</a></div>
          <TaskList tasks={tasks} limit={6} />
        </section>
        <section className="panel span-4">
          <div className="panel-h"><h2>{t("Next 4 weeks")}</h2><div className="spacer" /><a href="/schedule">{t("Calendar")}</a></div>
          <Meter label={t("Sold or waiting on you")} value={inv.sold + inv.waiting} max={total || 1} warnAt={2}
            detail={total ? t('{sold} sold · {waiting} waiting for your decision · {open} still on sale', { sold: inv.sold, waiting: inv.waiting, open: inv.open }) + (inv.unsold ? t(' · {n} unsold', { n: inv.unsold }) : '') : t("Nothing listed for the next 4 weeks.")} />
          <Meter label={t("Requests you accepted (90 days)")} value={d.decisions.accepted} max={decided || 1} warnAt={2}
            detail={decided ? t('{accepted} accepted · {declined} declined · typical reply {time}', { accepted: d.decisions.accepted, declined: d.decisions.declined, time: hours(d.decisions.medianHours) }) : t("No decisions yet.")} />
        </section>

        <section className="panel span-6">
          <RankedBars title={t("Best-selling placements (last 90 days)")} empty={t("No paid bookings yet.")}
            items={d.topPlacements.map(p => ({ label: p.label, sub: `${p.outlet} · ${t('{n} sold', { n: p.count })}`, value: p.value }))} />
        </section>
        <section className="panel span-6">
          <RankedBars title={t("Top buyers (last 90 days)")} empty={t("No buyers yet.")}
            items={d.topBuyers.map(b => ({ label: b.label, sub: t(b.count === 1 ? '1 booking' : '{n} bookings', { n: b.count }), value: b.value }))} />
        </section>

        <section className="panel">
          <div className="panel-h"><h2>{t("Coming up on air")}</h2><div className="spacer" /><a href="/deals">{t("Deals")}</a></div>
          {!o.upcoming.length ? <p className="dash-empty">{t("No booked slots coming up.")}</p>
            : <div className="table-wrap"><table className="table"><tbody>{o.upcoming.map(u => <tr key={u.id} onClick={() => (navigate(`/deals/${u.id}`))}>
              <td><b>{u.outlet}</b> · {tm(u.label)}<div className="small muted">{u.buyer}</div></td><td className="num small">{slotWhen(u.startsAt, (u as any).channel)}</td><td><DealStatus s={u.status} /></td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </main>
  )
}

