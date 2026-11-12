import { useEffect, useState } from 'react'
import { tm } from '../i18n-server'
import { api, type Campaign } from '../api'
import { closesIn, dayLabel, money, time, slotWhen } from '../format'
import { dubai } from '../calendar/layout'
import { CHANNEL } from '../charts'
import { navigate } from '../nav'
import { ChannelMark } from '../calendar/CalendarPage'
import { Change, KI, Kpi, Ring, Trend } from '../seller/Portal'
import '../seller/portal.css'
import { isAr, t } from '../i18n'
import { useLive } from '../live'

type Weeks = { week: string; value: number }[]
type D = {
  heldNow: number; heldCount: number; spend: { weeks: Weeks; last30: number; prev30: number }
  toPay: { count: number; amount: number; soonest: string | null }
  bids: { leading: number; outbid: number; items: { slotId: string; outlet: string; channel: string; label: string; startsAt: string; closesAt: string; topBid: number; yourMax: number; leading: boolean }[] }
  tasks: { type: 'pay' | 'creative' | 'proof' | 'issue'; dealId: string; label: string; dueAt: string | null; amount?: number }[]; taskCount: number
  byChannel: { channel: string; value: number; count: number }[]
  upcoming: { dealId: string; outlet: string; channel: string; label: string; startsAt: string; status: string }[]
  outlets: number; bookings: number
  wins: { dealId: string; outlet: string; label: string; amount: number; status: 'awaiting_seller' | 'awaiting_payment'; dueAt: string | null }[]
}

const TASK: Record<string, [string, string]> = { pay: [t('Pay'), t('Pay to secure the booking')], creative: [t('Ad'), t('Send your creative')], proof: [t('Proof'), t('Review the proof')], issue: [t('Issue'), t('Answer the publisher')] }
const when = (iso: string) => `${dayLabel(dubai(iso).date)} · ${time(iso)}`
const soon = (iso: string | null) => !!iso && new Date(iso).getTime() - Date.now() < 24 * 3_600_000
const greeting = () => { const h = (new Date().getUTCHours() + 4) % 24; return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening') } // Dubai time

const pct = (now: number, before: number) => before > 0 ? Math.round((now - before) / before * 100) : null
const TASK_BTN: Record<string, string> = { pay: 'Pay now', creative: 'Send creative', proof: 'Review proof', issue: 'Answer' }

/**
 * The buyer's dashboard in the owner's style: figure cards that each open their detail, spend over time beside where it went,
 * what needs the buyer, their live bids, campaign budgets and what is coming up on air. Every row opens its booking or slot.
 */
export function BuyerDashboard() {
  const [d, setD] = useState<D | null>(null), [campaigns, setCampaigns] = useState<Campaign[]>([]), [error, setError] = useState(''), [company, setCompany] = useState('')
  useEffect(() => { api<{ company: { name: string } }>('/me').then(m => setCompany(m.company.name), () => {}); api<D>('/buyer/dashboard').then(setD, e => setError(e.message)); api<Campaign[]>('/campaigns').then(c => setCampaigns(c.filter(x => x.status === 'active')), () => {}) }, [])
  // New wins and acceptances arrive on the bell: reload the dashboard with them.
  useLive('notification', () => api<D>('/buyer/dashboard').then(setD, () => {}))
  if (!d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const live = d.bids.leading + d.bids.outbid, spent90 = d.byChannel.reduce((n, c) => n + c.value, 0)
  return (
    <main className="pt">
      <div className="pt-head">
        <div><h1>{greeting()}{company ? `, ${company}` : ''}</h1><p className="muted">{t('Your bookings, bids and spend at a glance. Click any card for detail.')}</p></div>
        <div className="pt-filters"><a className="btn" href="/campaigns">{t("Campaigns")}</a><a className="btn primary" href="/calendar">{t("Find slots")}</a></div>
      </div>

      {d.wins.length > 0 && <section className="wins" aria-label={t('Auctions you won')}>{d.wins.map(w => <a key={w.dealId} className="win" href={`/bookings/${w.dealId}`}>
        <span className="win-mark" aria-hidden>✓</span>
        <span className="win-text"><b>{t('You won {slot}', { slot: `${w.outlet} · ${tm(w.label)}` })}</b>
          <span>{w.status === 'awaiting_payment'
            ? t('The publisher confirmed. Pay {amount} by {when} to secure it.', { amount: money(w.amount), when: w.dueAt ? when(w.dueAt) : '' })
            : t('{amount} with VAT. The publisher confirms by {when}; you pay only then.', { amount: money(w.amount), when: w.dueAt ? when(w.dueAt) : '' })}</span></span>
        <span className={`btn ${w.status === 'awaiting_payment' ? 'primary' : ''}`}>{w.status === 'awaiting_payment' ? t('Pay now') : t('View booking')}</span></a>)}</section>}

      <section className="pt-kpis">
        <Kpi main href="/results" icon={KI.trend} label={t('Paid, last 30 days')} value={money(d.spend.last30)}><Change v={pct(d.spend.last30, d.spend.prev30)} /></Kpi>
        <Kpi href="/bookings" icon={KI.shield} label={t('Held for you')} value={money(d.heldNow)}>
          <em>{!d.heldCount ? t('Nothing held') : d.heldCount === 1 ? t('1 booking until proof') : t('{n} bookings until proof', { n: d.heldCount })}</em></Kpi>
        <Kpi href="/bookings" icon={KI.card} label={t('To pay')} value={d.toPay.count ? money(d.toPay.amount) : t('Nothing')}>
          {d.toPay.count > 0 ? <em className="warn">{d.toPay.soonest ? t('First by {when}', { when: dayLabel(dubai(d.toPay.soonest).date, { day: 'numeric', month: 'short' }) }) : t('Pay now')}</em> : <em>{t('All paid')}</em>}</Kpi>
        <Kpi href="/calendar" icon={KI.hammer} label={t('Live bids')} value={String(live)}>
          {live > 0 ? <span className="pt-pair"><em>{t('{n} leading', { n: d.bids.leading })}</em>{d.bids.outbid > 0 && <em className="warn">{t('{n} outbid', { n: d.bids.outbid })}</em>}</span> : <em>{t('No open bids')}</em>}</Kpi>
        <Kpi href="#needs" icon={KI.clock} label={t('Needs you')} value={String(d.taskCount)}>{d.taskCount > 0 ? <em className="warn">{t('Review now')}</em> : <em>{t('All clear')}</em>}</Kpi>
      </section>

      <section className="pt-row">
        <div className="card pad"><div className="pt-card-h"><h2>{t('Spend by week')}</h2><a href="/results">{t('Results')} ›</a></div>
          <Trend data={d.spend.weeks.map(w => ({ date: w.week, value: w.value }))} label={t('Paid by week, excluding VAT')} />
          <p className="small muted">{t('Paid by week, excluding VAT.')} {t('{n} outlets booked, {m} paid bookings so far.', { n: d.outlets, m: d.bookings })}</p></div>
        <div className="card pad"><div className="pt-card-h"><h2>{t('Where your budget went')}</h2><span className="muted small">{t('last 90 days')}</span></div>
          <Ring parts={d.byChannel.map(c => ({ label: CHANNEL[c.channel] ?? c.channel, value: c.value, href: `/directory?channel=${c.channel}` }))} total={spent90} caption={t('Spent')} empty={t('No paid bookings in the last 90 days.')} /></div>
      </section>

      <section className="card pad" id="needs">
        <div className="pt-card-h"><h2>{t('Needs you')}</h2><a href="/bookings">{t('All bookings')} ›</a></div>
        {!d.tasks.length ? <p className="muted">{t("Nothing waiting on you. New requests appear here once a publisher accepts.")}</p>
          : <ul className="pt-actions">{d.tasks.map(task => <li key={task.type + task.dealId}>
            <span className={`pt-av ${soon(task.dueAt) ? 'hot' : ''}`} aria-hidden>{TASK[task.type][0]}</span>
            <a className="pt-what" href={`/bookings/${task.dealId}`}><b>{TASK[task.type][1]}</b><span className="small">{tm(task.label)}</span></a>
            <span className="pt-money">{task.amount != null && <b className="num">{money(task.amount)}</b>}</span>
            <span className="pt-due">{task.dueAt && <span className={`pt-chip ${soon(task.dueAt) ? 'warn' : ''}`}>{t('Due {date}', { date: dayLabel(dubai(task.dueAt).date, { day: 'numeric', month: 'short' }) })}</span>}</span>
            <span className="pt-btns"><a className="btn primary" href={`/bookings/${task.dealId}`}>{t(TASK_BTN[task.type] ?? 'Open')}</a></span></li>)}</ul>}
      </section>

      <section className="pt-row">
        <div className="card pad"><div className="pt-card-h"><h2>{t('Your bids')}</h2><a href="/calendar">{t('Calendar')} ›</a></div>
          {!d.bids.items.length ? <p className="muted">{t("No open bids. Find a slot on the calendar.")}</p>
            : <div className="table-wrap"><table className="table pt-tx"><thead><tr><th>{t('Slot')}</th><th>{t('Airs')}</th><th>{t('Closes')}</th><th className="r">{t('Top bid')}</th><th>{t('Status')}</th></tr></thead>
              <tbody>{d.bids.items.map(b => <tr key={b.slotId} onClick={() => navigate(`/calendar?view=list&q=${encodeURIComponent(b.outlet)}&date=${dubai(b.startsAt).date}`)}>
                <td><b>{b.outlet}</b><div className="small muted">{tm(b.label)} · {CHANNEL[b.channel]}</div></td><td className="small">{dayLabel(dubai(b.startsAt).date)}</td>
                <td className="small">{isAr ? (closesIn(b.closesAt) ?? t('closing')) : (closesIn(b.closesAt) ?? 'closing')}</td>
                <td className="r num">{money(b.topBid)}</td><td><span className={`pt-pill ${b.leading ? 'good' : 'bad'}`}>{b.leading ? t('Leading') : t('Outbid')}</span></td></tr>)}</tbody></table></div>}
        </div>
        <div className="card pad"><div className="pt-card-h"><h2>{t('Campaign budgets')}</h2><a href="/campaigns">{t('Campaigns')} ›</a></div>
          {!campaigns.length ? <p className="muted">{t('No active campaigns.')} <a href="/campaigns">{t('Plan a campaign')}</a> {t('to track spend against a budget.')}</p>
            : <ul className="pt-budgets">{campaigns.slice(0, 5).map(c => { const used = c.budget ? Math.min(100, Math.round(c.committed / c.budget * 100)) : 0
              return <li key={c.id}><a href={`/campaigns/${c.id}`}><span className="pt-b-h"><b>{c.name}</b><span className="num">{used}%</span></span>
                <span className="pt-bar"><i style={{ width: `${used}%` }} className={used >= 90 ? 'warn' : ''} /></span>
                <span className="small muted">{t('{amount} committed', { amount: money(c.committed) })} · {t('{amount} left', { amount: money(c.remaining) })}</span></a></li> })}</ul>}
        </div>
      </section>

      <section className="card pad">
        <div className="pt-card-h"><h2>{t("Coming up on air")}</h2><a href="/bookings">{t('Bookings')} ›</a></div>
        {!d.upcoming.length ? <p className="muted">{t("Nothing booked to run yet.")}</p>
          : <div className="table-wrap"><table className="table pt-tx"><thead><tr><th>{t('Outlet')}</th><th>{t('Slot')}</th><th>{t('Airs')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{d.upcoming.map(u => <tr key={u.dealId} onClick={() => navigate(`/bookings/${u.dealId}`)}>
              <td><ChannelMark c={u.channel} /> <b>{u.outlet}</b></td><td>{tm(u.label)}</td><td className="small">{slotWhen(u.startsAt, u.channel)}</td>
              <td><span className={`pt-pill ${u.status === 'secured' ? 'good' : 'info'}`}>{u.status === 'secured' ? t('Paid, money held') : t('Accepted, waiting for payment')}</span></td></tr>)}</tbody></table></div>}
      </section>
    </main>
  )
}
