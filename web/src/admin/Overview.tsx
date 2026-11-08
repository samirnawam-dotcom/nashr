import { useState } from 'react'
import { DEAL_STATUS, Loading, date, money, useAct, useLoad } from './common'
import { CHANNEL, Delta, Funnel, Hero, RankedBars, StatTile, WeekColumns, compact } from '../charts'
import { PhotoBand } from '../PhotoBand'
import { locale, ltr, t } from '../i18n'

type O = { access_pending: number; resets_pending: number; held_60: number; quotes_open: number; support_open: number; disputes_overdue: number; disputes: number; issues: number; failed_ops: number; pending_ops: number; gmv_month: number
  bookings_month: number; publishers_live: number; buyers: number; revenue: number; held: number
  reconcile: { ledgerCash: number; providerCash: number; ok: boolean }; byStatus: Record<string, number> }

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
  const ORDER = ['awaiting_seller', 'awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out']
  const statuses = ORDER.filter(s => o.byStatus[s]).map(s => ({ label: t(DEAL_STATUS[s]?.[0] ?? s), value: o.byStatus[s], href: `/deals?status=${s}` }))
  return (
    <main className="dash">
      <p className={`recon ${o.reconcile.ok ? 'ok' : 'bad'}`} role="status">{o.reconcile.ok ? t("Ledger reconciles with the payment provider.")
        : <>{t('Ledger cash {ledger} does not match the payment provider ({provider}).', { ledger: money(o.reconcile.ledgerCash), provider: money(o.reconcile.providerCash) })} <a href="/funds">{t('Open Funds')}</a></>}</p>
      <div className="dash-head photo-head"><img className="dash-photo" src="/brand/dash-admin.jpg" width={1600} height={400} alt="" decoding="async" fetchPriority="high" /><h1>{t("Overview")}</h1><span className="muted">{new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}</span>
        <div className="spacer" /><a className="btn" href="/reports">{t("Reports")}</a><a className="btn" href="/deals">{t("All deals")}</a></div>

      <section className="dash-lead">
        <Hero label={t("Booked value, last 30 days")} value={money(d.gmv.last30)}>
          <Delta now={d.gmv.last30} before={d.gmv.prev30} />
          <span className="stat-sub">{t("Price of bookings paid, excluding VAT.")}</span>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>{t("Commission earned (30 days)")}</dt><dd>{money(d.commission.last30)}</dd>
            <dt>{t("Take rate (90 days)")}</dt><dd>{d.takeRate == null ? '—' : ltr(`${(d.takeRate * 100).toFixed(1)}%`)}</dd>
            <dt>{t("Publishers live")}</dt><dd>{o.publishers_live}</dd>
            <dt>{t("Buyer companies")}</dt><dd>{o.buyers}</dd>
          </dl>
        </Hero>
        <WeekColumns weeks={d.gmv.weeks} title={t("Booked value by week (excluding VAT)")} valueName={t("Booked value")} />
      </section>

      <div className="stats">
        <StatTile label={t("Commission, last 30 days")} value={compact(d.commission.last30)} delta={<Delta now={d.commission.last30} before={d.commission.prev30} />} spark={d.commission.weeks.map(w => w.value)} href="/reports" />
        <StatTile label={t("Held for bookings")} value={compact(d.money.held)} sub={t("Paid by buyers, not yet released")} href="/funds" />
        <StatTile label={t("Open slots with bids")} value={t('{n} of {total}', { n: d.live.withBids, total: d.live.openSlots })} sub={t('{n} bids this week', { n: d.live.bids7d })} />
        <StatTile label={t("Active buyers")} value={String(d.live.activeBuyers)} sub={t("bid in the last 30 days")} />
      </div>

      <div className="dash-grid">
        <section className="panel span-4"><div className="panel-h"><h2>{t("Needs attention")}</h2></div>
          <ul className="attn-list">{attention.map(([n, label, href, hot]) => <li key={label} className={n ? (hot ? 'hot' : 'has') : 'none'}>
            <a href={href}><b className="num">{n}</b><span>{t(label)}</span>{n > 0 && <span className="btn task-act">{t('Open')}</span>}</a></li>)}</ul></section>
        <section className="panel span-4"><Funnel title={t("Bookings opened in the last 30 days")} steps={d.funnel.map(f => ({ ...f, label: t(f.label) }))} /></section>
        <section className="panel span-4"><div className="panel-h"><h2>{t("Money position")}</h2><div className="spacer" /><a href="/funds">{t("Funds")}</a></div>
          <dl className="kv">
            <dt>{t("Held for bookings")}</dt><dd>{money(d.money.held)}</dd>
            <dt>{t("Owed to publishers")}</dt><dd>{money(d.money.owedToPublishers)}</dd>
            <dt>{t("VAT on commission")}</dt><dd>{money(d.money.vat)}</dd>
            <dt>{t("Card processing fees")}</dt><dd>{money(d.money.fees)}</dd>
            <dt className="total">{t("Commission earned (all time)")}</dt><dd className="total">{money(d.money.revenue)}</dd>
          </dl></section>

        <section className="panel span-4"><RankedBars title={t("Booked value by channel (90 days)")} items={d.byChannel.map(c => ({ label: CHANNEL[c.channel] ?? c.channel, sub: t(c.count === 1 ? '1 booking' : '{n} bookings', { n: c.count }), value: c.value }))} /></section>
        <section className="panel span-4"><RankedBars title={t("Top publishers (90 days)")} items={d.topPublishers.map(p => ({ label: p.label, sub: t(p.count === 1 ? '1 booking' : '{n} bookings', { n: p.count }), value: p.value }))} /></section>
        <section className="panel span-4"><RankedBars title={t("Top buyers (90 days)")} items={d.topBuyers.map(p => ({ label: p.label, sub: t(p.count === 1 ? '1 booking' : '{n} bookings', { n: p.count }), value: p.value }))} /></section>

        <section className="panel"><RankedBars title={t("All deals by status")} format={v => String(v)} empty={t("No deals yet.")} items={statuses} /></section>
      </div>
    </main>
  )
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
