import { useState } from 'react'
import { DEAL_STATUS, Loading, date, money, useAct, useLoad } from './common'
import { CHANNEL, Funnel, RankedBars } from '../charts'
import { Change, KI, Kpi, Ring, Trend } from '../seller/Portal'
import '../seller/portal.css'
import { PhotoBand } from '../PhotoBand'
import { locale, ltr, t } from '../i18n'
import { tm } from '../i18n-server'

type O = { access_pending: number; resets_pending: number; held_60: number; quotes_open: number; support_open: number; disputes_overdue: number; disputes: number; issues: number; failed_ops: number; pending_ops: number; gmv_month: number
  bookings_month: number; publishers_live: number; buyers: number; revenue: number; held: number
  reconcile: { ledgerCash: number; providerCash: number; ok: boolean }; byStatus: Record<string, number> }

type Alerts = { watchingBackups: boolean; open: { key: string; detail: string; since: string }[]; cleared: { key: string; detail: string; cleared: string }[]
  runs: Record<string, { ok: boolean; detail: string | null; at: string }> }

/** What the watch found: open problems first, then the last backup and restore drill. Quiet when all is well. */
function SystemAlerts() {
  const { data: a } = useLoad<Alerts>('/admin/alerts')
  if (!a) return null
  const run = (k: string, label: string) => { const r = a.runs[k]
    return <span className={r && !r.ok ? 'outbid' : ''}>{label}: {r ? `${r.ok ? t('passed') : t('failed')} ${date(r.at)}` : t('not yet')}</span> }
  if (!a.open.length) return <span className="ov-pill good" title={t('Staff get a bell, email and phone alert when a problem starts and when it clears.')}>{t('All systems normal')}
    {a.watchingBackups && <span className="small"> · {run('backup', t('Last backup'))}</span>}</span>
  return <section className="card pad sys-alerts bad ov-alerts" aria-live="polite">
    <h2>{a.open.length === 1 ? t('One problem needs a person') : t('{n} problems need a person', { n: a.open.length })}</h2>
    <ul>{a.open.map(x => <li key={x.key}><b>{tm(x.detail)}</b> <span className="small muted">{t('since {date}', { date: date(x.since) })}</span></li>)}</ul>
    <p className="small muted">{a.watchingBackups ? <>{run('backup', t('Last backup'))} · {run('restore_drill', t('Last restore drill'))}.</> : t('Backups are not watched on this server (BACKUP_DIR is not set).')}
      {' '}{t('Staff get a bell, email and phone alert when a problem starts and when it clears.')}</p>
  </section>
}

type Weeks = { week: string; value: number }[]
type Dash = {
  gmv: { weeks: Weeks; last30: number; prev30: number }; commission: { weeks: Weeks; last30: number; prev30: number }; takeRate: number | null
  funnel: { label: string; value: number }[]; byChannel: { channel: string; value: number; count: number }[]
  topPublishers: { label: string; value: number; count: number }[]; topBuyers: { label: string; value: number; count: number }[]
  live: { openSlots: number; withBids: number; bids7d: number; activeBuyers: number }
  money: { held: number; owedToPublishers: number; revenue: number; vat: number; fees: number }
}

export function AdminOverview() {
  const { data: o, error } = useLoad<O>('/admin/overview'), { data: d } = useLoad<Dash>('/admin/dashboard')
  if (!o || !d) return <Loading error={error} />
  const attention = [
    [o.access_pending, t("Access requests to review"), '/access', false], [o.resets_pending, t('Password resets to send'), '/accounts', false],
    [o.held_60, t('Payments held over 60 days: release or refund them'), '/deals?status=secured,in_review,issue_open,disputed', true], [o.disputes, t("Disputes to decide"), '/disputes', true],
    [o.issues, t("Issues waiting on publishers"), '/disputes', false], [o.failed_ops, t("Failed payouts or refunds"), '/payouts', true],
    [o.disputes_overdue, t("Disputes past Nashr's decision date"), '/disputes', true],
    [o.support_open, t("Questions from buyers and publishers"), '/support', true],
    [o.quotes_open, t("Quote requests"), '/directory', false],
  ] as const
  const waiting = attention.filter(([n]) => n > 0), quiet = attention.filter(([n]) => !n)
  const ORDER = ['awaiting_seller', 'awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out']
  const statuses = ORDER.filter(s => o.byStatus[s]).map(s => ({ label: t(DEAL_STATUS[s]?.[0] ?? s), value: o.byStatus[s], href: `/deals?status=${s}` }))
  const pct = (now: number, before: number) => before > 0 ? Math.round((now - before) / before * 100) : null
  const channel90 = d.byChannel.reduce((n, c) => n + c.value, 0)
  return (
    <main className="pt">
      <div className="pt-head">
        <div><h1>{t("Overview")}</h1><p className="muted">{new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })} · {t('Click any card for detail.')}</p></div>
        <div className="pt-filters"><a className="btn" href="/reports">{t("Reports")}</a><a className="btn primary" href="/deals">{t("All deals")}</a></div>
      </div>
      <div className="ov-health">
        <a href="/funds" className={`ov-pill ${o.reconcile.ok ? 'good' : 'bad'}`}>{o.reconcile.ok ? t("Ledger reconciles with the payment provider.")
          : t('Ledger cash {ledger} does not match the payment provider ({provider}).', { ledger: money(o.reconcile.ledgerCash), provider: money(o.reconcile.providerCash) })}</a>
        <SystemAlerts />
      </div>

      <section className="pt-kpis">
        <Kpi main href="/deals" icon={KI.trend} label={t('Booked value, last 30 days')} value={money(d.gmv.last30)}><Change v={pct(d.gmv.last30, d.gmv.prev30)} /></Kpi>
        <Kpi href="/reports" icon={KI.layers} label={t('Commission, last 30 days')} value={money(d.commission.last30)}><Change v={pct(d.commission.last30, d.commission.prev30)} /></Kpi>
        <Kpi href="/funds" icon={KI.shield} label={t('Held for bookings')} value={money(d.money.held)}><em>{t('Paid by buyers, not yet released')}</em></Kpi>
        <Kpi href="/calendar" icon={KI.hammer} label={t('Open slots with bids')} value={t('{n} of {total}', { n: d.live.withBids, total: d.live.openSlots })}><em>{t('{n} bids this week', { n: d.live.bids7d })}</em></Kpi>
        <Kpi href="/accounts" icon={KI.users} label={t('Active buyers')} value={String(d.live.activeBuyers)}><em>{t('{p} publishers live · {b} buyer companies', { p: o.publishers_live, b: o.buyers })}</em></Kpi>
      </section>

      <section className="card pad">
        <div className="pt-card-h"><h2>{t("Needs attention")}</h2><span className="muted small">{waiting.length ? t('{n} kinds of work waiting', { n: waiting.length }) : t('Nothing waiting')}</span></div>
        <ul className="attn-list ov-attn">{[...waiting, ...quiet].map(([n, label, href, hot]) => <li key={label} className={n ? (hot ? 'hot' : 'has') : 'none'}>
          <a href={href}><b className="num">{n}</b><span>{t(label)}</span>{n > 0 && <span className="btn task-act">{t('Open')}</span>}</a></li>)}</ul>
      </section>

      <section className="pt-row">
        <div className="card pad"><div className="pt-card-h"><h2>{t('Booked value by week')}</h2><span className="muted small">{t('excluding VAT')}</span></div>
          <Trend data={d.gmv.weeks.map(w => ({ date: w.week, value: w.value }))} label={t('Booked value by week, excluding VAT')} />
          <p className="small muted">{t('Take rate (90 days)')}: <b className="num">{d.takeRate == null ? '—' : ltr(`${(d.takeRate * 100).toFixed(1)}%`)}</b></p></div>
        <div className="card pad"><div className="pt-card-h"><h2>{t('Booked value by channel')}</h2><span className="muted small">{t('last 90 days')}</span></div>
          <Ring parts={d.byChannel.map(c => ({ label: CHANNEL[c.channel] ?? c.channel, value: c.value, href: '/deals' }))} total={channel90} caption={t('Booked value')} empty={t('No paid bookings in the last 90 days.')} /></div>
      </section>

      <section className="pt-row ov-3">
        <div className="card pad"><Funnel title={t("Bookings opened in the last 30 days")} steps={d.funnel.map(f => ({ ...f, label: t(f.label) }))} /></div>
        <div className="card pad"><div className="pt-card-h"><h2>{t("Money position")}</h2><a href="/funds">{t("Funds")} ›</a></div>
          <ul className="ov-money">
            <li><a href="/funds"><span>{t("Held for bookings")}</span><b className="num">{money(d.money.held)}</b></a></li>
            <li><a href="/payouts"><span>{t("Owed to publishers")}</span><b className="num">{money(d.money.owedToPublishers)}</b></a></li>
            <li><a href="/reports"><span>{t("VAT on commission")}</span><b className="num">{money(d.money.vat)}</b></a></li>
            <li><a href="/reports"><span>{t("Card processing fees")}</span><b className="num">{money(d.money.fees)}</b></a></li>
            <li className="total"><a href="/reports"><span>{t("Commission earned (all time)")}</span><b className="num">{money(d.money.revenue)}</b></a></li>
          </ul></div>
        <div className="card pad"><RankedBars title={t("All deals by status")} format={v => String(v)} empty={t("No deals yet.")} items={statuses} /></div>
      </section>

      <section className="pt-row ov-2">
        <div className="card pad"><div className="pt-card-h"><h2>{t('Top publishers')}</h2><span className="muted small">{t('last 90 days')}</span></div><Leaders rows={d.topPublishers} /></div>
        <div className="card pad"><div className="pt-card-h"><h2>{t('Top buyers')}</h2><span className="muted small">{t('last 90 days')}</span></div><Leaders rows={d.topBuyers} /></div>
      </section>
    </main>
  )
}

/** A ranked table: each company with its bookings and value, opening its accounts. */
function Leaders({ rows }: { rows: { label: string; value: number; count: number }[] }) {
  if (!rows.length) return <p className="muted">{t('No paid bookings yet.')}</p>
  const top = Math.max(...rows.map(r => r.value))
  return <ul className="ov-lead">{rows.map((r, i) => <li key={r.label}><a href={`/accounts?q=${encodeURIComponent(r.label)}`}>
    <span className="ov-rank num">{i + 1}</span><span className="ov-name"><b>{r.label}</b><span className="small muted">{t(r.count === 1 ? '1 booking' : '{n} bookings', { n: r.count })}</span>
      <span className="pt-bar"><i style={{ width: `${Math.round(r.value / top * 100)}%` }} /></span></span><b className="num">{money(r.value)}</b></a></li>)}</ul>
}

type AR = { id: string; name: string; email: string; phone: string; role: string; company: string; company_type: string; status: string; reason: string | null; created_at: string; invite_pending?: boolean }
const ACCESS_STATUS: Record<string, string> = { pending: 'Pending', info: 'More information asked', approved: 'Approved', rejected: 'Rejected' }
const TYPE: Record<string, string> = { brand: 'Brand', agency: 'Agency', media_outlet: 'Media outlet' }

export function AccessPage() {
  const { data, error, load } = useLoad<AR[]>('/admin/access-requests')
  const { act, busy, msg } = useAct(load)
  const [reason, setReason] = useState<Record<string, string>>({}), [links, setLinks] = useState<Record<string, string>>({})
  if (!data) return <Loading error={error} />
  return (
    <main>
      <PhotoBand img="/brand/dash-buyer.jpg" title={t("Access requests")} sub={t("Nashr is invite-only. Approving creates the company and an invite link (valid 7 days).")} />
      {msg}
      {!data.length ? <p className="muted empty">{t("No requests.")}</p> : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Person")}</th><th>{t("Company")}</th><th>{t("Received")}</th><th>{t("Status")}</th><th style={{ width: 360 }} /></tr></thead>
        <tbody>{data.map(r => <tr key={r.id}>
          <td><b>{r.name}</b><div className="small muted">{r.role} · <bdi>{r.email}</bdi> · <bdi>{r.phone}</bdi></div></td>
          <td>{r.company}<div className="small muted">{t(TYPE[r.company_type] ?? r.company_type)}</div></td><td className="small num">{date(r.created_at)}</td>
          <td className="small">{t(ACCESS_STATUS[r.status] ?? r.status)}{r.reason && <div className="muted">{r.reason}</div>}</td>
          <td>{links[r.id] ? <div className="small">{t('Invite link (send it to {email}):', { email: r.email })}<input className="search mono" style={{ width: '100%' }} readOnly value={location.origin + links[r.id]} onFocus={e => e.target.select()} /></div>
            : r.status === 'approved' && r.invite_pending ? <div className="small"><span className="muted">{t('Not signed up yet.')}</span>{' '}
              <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/access-requests/${r.id}/invite`, {}, x => { setLinks({ ...links, [r.id]: x.inviteLink }); return t('New invite link for {email}. The old link no longer works.', { email: r.email }) })}>{t('New invite link')}</button></div>
            : ['pending', 'info'].includes(r.status) && <div className="form" style={{ gap: 6 }}>
            <div className="row-flex"><button className="btn primary" disabled={busy} onClick={() => act('POST', `/admin/access-requests/${r.id}/approve`, {}, x => { setLinks({ ...links, [r.id]: x.inviteLink }); return t('{name} approved.', { name: r.company }) })}>{t("Approve")}</button>
              <input className="search" style={{ minWidth: 0, flex: 1 }} aria-label={t('Reason for {name}', { name: r.name })} placeholder={t("Reason (for reject or more info)")} value={reason[r.id] ?? ''} onChange={e => setReason({ ...reason, [r.id]: e.target.value })} /></div>
            <div className="row-flex"><button className="btn" disabled={busy || !reason[r.id]} onClick={() => act('POST', `/admin/access-requests/${r.id}/decide`, { decision: 'info', reason: reason[r.id] }, t("Asked for more information."))}>{t("Ask for info")}</button>
              <button className="btn" disabled={busy || !reason[r.id]} onClick={() => act('POST', `/admin/access-requests/${r.id}/decide`, { decision: 'rejected', reason: reason[r.id] }, t("Rejected."))}>{t("Reject")}</button></div>
          </div>}</td></tr>)}</tbody></table></div>}
    </main>
  )
}
