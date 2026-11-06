import { useEffect, useState } from 'react'
import { api, type Campaign } from '../api'
import { closesIn, dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import { CHANNEL, Delta, Hero, Meter, RankedBars, StatTile, WeekColumns, compact } from '../charts'
import { isAr, t } from '../i18n'

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

const TASK: Record<string, [string, string]> = { pay: [t('Pay'), t('Pay to secure the booking')], creative: [t('Ad'), t('Send your creative')], proof: [t('Proof'), t('Review the proof')], issue: [t('Issue'), t('Answer the publisher')] }
const when = (iso: string) => `${dayLabel(dubai(iso).date)} · ${time(iso)}`
const soon = (iso: string | null) => !!iso && new Date(iso).getTime() - Date.now() < 24 * 3_600_000
const greeting = () => { const h = (new Date().getUTCHours() + 4) % 24; return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening') } // Dubai time

export function BuyerDashboard() {
  const [d, setD] = useState<D | null>(null), [campaigns, setCampaigns] = useState<Campaign[]>([]), [error, setError] = useState(''), [company, setCompany] = useState('')
  useEffect(() => { api<{ company: { name: string } }>('/me').then(m => setCompany(m.company.name), () => {}); api<D>('/buyer/dashboard').then(setD, e => setError(e.message)); api<Campaign[]>('/campaigns').then(c => setCampaigns(c.filter(x => x.status === 'active')), () => {}) }, [])
  if (!d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const live = d.bids.leading + d.bids.outbid
  return (
    <main className="dash">
      <div className="dash-head photo-head"><img className="dash-photo" src="/brand/dash-buyer.jpg" width={1600} height={400} alt="" decoding="async" fetchPriority="high" /><h1>{greeting()}, {company}</h1><div className="spacer" />
        <a className="btn" href="/campaigns">{t("Campaigns")}</a><a className="btn primary" href="/calendar">{t("Find slots")}</a></div>

      <section className="dash-lead">
        <Hero label={t("Held for you now")} value={money(d.heldNow)}>
          <span className="stat-sub">{d.heldCount ? t(d.heldCount === 1 ? '1 paid booking, released to the publisher only after you approve proof.' : '{n} paid bookings, released to publishers only after you approve proof.', { n: d.heldCount }) : t('Nothing held: paid bookings appear here until their ad has run.')}</span>
          <span className="stat-sub">{t('Paid in the last 30 days:')} <b className="num">{money(d.spend.last30)}</b></span>
          <Delta now={d.spend.last30} before={d.spend.prev30} goodWhenUp />
        </Hero>
        <WeekColumns weeks={d.spend.weeks} title={t("Booked and paid, by week (excluding VAT)")} valueName={t('Paid')} />
      </section>

      <div className="stats">
        <StatTile label={t("To pay")} value={d.toPay.count ? money(d.toPay.amount) : t('Nothing')} href="/bookings"
          sub={d.toPay.count ? <>{t(d.toPay.count === 1 ? '1 accepted booking' : '{n} accepted bookings', { n: d.toPay.count })}{d.toPay.soonest && <>{t(', first by')} <b>{when(d.toPay.soonest)}</b></>}</> : t('Every accepted booking is paid.')} />
        <StatTile label={t("Live bids")} value={String(live)} href="/calendar"
          sub={live ? <><span className="pill-state is-lead">{t('{n} leading', { n: d.bids.leading })}</span> <span className="pill-state is-outbid">{t('{n} outbid', { n: d.bids.outbid })}</span></> : t('No open bids.')} />
        <StatTile label={t("Needs you")} value={String(d.taskCount)} sub={d.taskCount ? t('Payments, creative and proof to review') : t('All clear')} />
        <StatTile label={t("Outlets booked")} value={String(d.outlets)} sub={t('{n} paid bookings so far', { n: d.bookings })} spark={d.spend.weeks.map(w => w.value)} />
      </div>

      <div className="dash-grid">
        <section className="panel span-8">
          <div className="panel-h"><h2>{t("Needs you")}</h2><span className="muted small">{t("soonest first")}</span><div className="spacer" /><a href="/bookings">{t("All bookings")}</a></div>
          {!d.tasks.length ? <p className="dash-empty">{t("Nothing waiting on you. New requests appear here once a publisher accepts.")}</p>
            : <ul className="dash-list">{d.tasks.map(task => <li key={task.type + task.dealId}>
                <span className={`chip-ico ${soon(task.dueAt) ? 'urgent' : ''}`} aria-hidden>{TASK[task.type][0]}</span>
                <a className="what" href={`/bookings/${task.dealId}`}><b>{TASK[task.type][1]}{task.amount ? ` · ${money(task.amount)}` : ''}</b><span>{task.label}</span></a>
                <span className={`when ${soon(task.dueAt) ? 'soon' : ''}`}>{task.dueAt ? <>{t('by {when}', { when: when(task.dueAt) })}</> : ''}</span></li>)}</ul>}
        </section>

        <section className="panel span-4">
          <div className="panel-h"><h2>{t("Your bids")}</h2><div className="spacer" /><a href="/calendar">{t("Calendar")}</a></div>
          {!d.bids.items.length ? <p className="dash-empty">{t("No open bids. Find a slot on the calendar.")}</p>
            : <ul className="dash-list">{d.bids.items.map(b => <li key={b.slotId} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <span className="what"><b>{b.outlet} · {b.label}</b><span>{CHANNEL[b.channel]} · {t('airs {date}', { date: dayLabel(dubai(b.startsAt).date) })} · {isAr ? (closesIn(b.closesAt) ?? t('closing')) : (closesIn(b.closesAt) ?? 'closing').toLowerCase()}</span></span>
                <span className="when"><span className={`pill-state ${b.leading ? 'is-lead' : 'is-outbid'}`}>{b.leading ? t('Leading') : t('Outbid')}</span><br /><span className="num">{t('top {price}', { price: compact(b.topBid) })}</span></span></li>)}</ul>}
        </section>

        <section className="panel span-6">
          <div className="panel-h"><h2>{t("Campaign budgets")}</h2><div className="spacer" /><a href="/campaigns">{t("Campaigns")}</a></div>
          {!campaigns.length ? <p className="dash-empty">{t('No active campaigns.')} <a href="/campaigns">{t('Plan a campaign')}</a> {t('to track spend against a budget.')}</p>
            : campaigns.slice(0, 4).map(c => <a key={c.id} href={`/campaigns/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <Meter label={c.name} value={c.committed} max={c.budget} warnAt={0.9}
                  detail={<>{t('{amount} committed', { amount: money(c.committed) })} · {t('{amount} waiting', { amount: money(c.pending) })} · <b>{t('{amount} left', { amount: money(c.remaining) })}</b> {t('of {amount}', { amount: money(c.budget) })}</>} /></a>)}
        </section>

        <section className="panel span-6">
          <RankedBars title={t("Where your budget went (last 90 days, excluding VAT)")} empty={t('No paid bookings in the last 90 days.')}
            items={d.byChannel.map(c => ({ label: CHANNEL[c.channel] ?? c.channel, sub: t(c.count === 1 ? '1 booking' : '{n} bookings', { n: c.count }), value: c.value }))} />
        </section>

        <section className="panel">
          <div className="panel-h"><h2>{t("Coming up on air")}</h2><div className="spacer" /><a href="/bookings">{t("Bookings")}</a></div>
          {!d.upcoming.length ? <p className="dash-empty">{t("Nothing booked to run yet.")}</p>
            : <ul className="dash-list">{d.upcoming.map(u => <li key={u.dealId}>
                <span className="chip-ico good" aria-hidden>{(CHANNEL[u.channel] ?? '').slice(0, 2)}</span>
                <a className="what" href={`/bookings/${u.dealId}`}><b>{u.outlet} · {u.label}</b><span>{u.status === 'secured' ? t('Paid, money held') : t('Accepted, waiting for payment')}</span></a>
                <span className="when">{when(u.startsAt)}</span></li>)}</ul>}
        </section>
      </div>
    </main>
  )
}
