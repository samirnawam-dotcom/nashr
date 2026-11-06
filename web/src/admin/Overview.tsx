import { useState } from 'react'
import { DEAL_STATUS, Loading, date, money, useAct, useLoad } from './common'
import { CHANNEL, Delta, Funnel, Hero, RankedBars, StatTile, WeekColumns, compact } from '../charts'
import { PhotoBand } from '../PhotoBand'

type O = { access_pending: number; quotes_open: number; disputes: number; issues: number; failed_ops: number; pending_ops: number; gmv_month: number
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
    [o.access_pending, 'Access requests to review', '/access', false], [o.disputes, 'Disputes to decide', '/disputes', true],
    [o.issues, 'Issues waiting on publishers', '/disputes', false], [o.failed_ops, 'Failed payouts or refunds', '/payouts', true],
    [o.quotes_open, 'Quote requests', '/directory', false],
  ] as const
  const ORDER = ['awaiting_seller', 'awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out']
  const statuses = ORDER.filter(s => o.byStatus[s]).map(s => ({ label: DEAL_STATUS[s]?.[0] ?? s, value: o.byStatus[s], href: `/deals?status=${s}` }))
  return (
    <main className="dash">
      <p className={`recon ${o.reconcile.ok ? 'ok' : 'bad'}`} role="status">{o.reconcile.ok ? 'Ledger reconciles with the payment provider.'
        : <>Ledger cash {money(o.reconcile.ledgerCash)} does not match the payment provider ({money(o.reconcile.providerCash)}). <a href="/funds">Open Funds</a></>}</p>
      <div className="dash-head photo-head"><img className="dash-photo" src="/brand/dash-admin.jpg" width={1600} height={400} alt="" decoding="async" fetchPriority="high" /><h1>Overview</h1><span className="muted">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}</span>
        <div className="spacer" /><a className="btn" href="/reports">Reports</a><a className="btn" href="/deals">All deals</a></div>

      <section className="dash-lead">
        <Hero label="Booked value, last 30 days" value={money(d.gmv.last30)}>
          <Delta now={d.gmv.last30} before={d.gmv.prev30} />
          <span className="stat-sub">Price of bookings paid, excluding VAT.</span>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>Commission earned (30 days)</dt><dd>{money(d.commission.last30)}</dd>
            <dt>Take rate (90 days)</dt><dd>{d.takeRate == null ? '—' : `${(d.takeRate * 100).toFixed(1)}%`}</dd>
            <dt>Publishers live</dt><dd>{o.publishers_live}</dd>
            <dt>Buyer companies</dt><dd>{o.buyers}</dd>
          </dl>
        </Hero>
        <WeekColumns weeks={d.gmv.weeks} title="Booked value by week (excluding VAT)" valueName="Booked value" />
      </section>

      <div className="stats">
        <StatTile label="Commission, last 30 days" value={compact(d.commission.last30)} delta={<Delta now={d.commission.last30} before={d.commission.prev30} />} spark={d.commission.weeks.map(w => w.value)} href="/reports" />
        <StatTile label="Held for bookings" value={compact(d.money.held)} sub="Paid by buyers, not yet released" href="/funds" />
        <StatTile label="Open slots with bids" value={`${d.live.withBids} of ${d.live.openSlots}`} sub={`${d.live.bids7d} bids this week`} />
        <StatTile label="Active buyers" value={String(d.live.activeBuyers)} sub="bid in the last 30 days" />
      </div>

      <div className="dash-grid">
        <section className="panel span-4"><div className="panel-h"><h2>Needs attention</h2></div>
          <ul className="attn-list">{attention.map(([n, label, href, hot]) => <li key={label} className={n ? (hot ? 'hot' : 'has') : 'none'}>
            <a href={href}><b className="num">{n}</b><span>{label}</span>{n > 0 && <span className="btn task-act">Open</span>}</a></li>)}</ul></section>
        <section className="panel span-4"><Funnel title="Bookings opened in the last 30 days" steps={d.funnel} /></section>
        <section className="panel span-4"><div className="panel-h"><h2>Money position</h2><div className="spacer" /><a href="/funds">Funds</a></div>
          <dl className="kv">
            <dt>Held for bookings</dt><dd>{money(d.money.held)}</dd>
            <dt>Owed to publishers</dt><dd>{money(d.money.owedToPublishers)}</dd>
            <dt>VAT on commission</dt><dd>{money(d.money.vat)}</dd>
            <dt>Card processing fees</dt><dd>{money(d.money.fees)}</dd>
            <dt className="total">Commission earned (all time)</dt><dd className="total">{money(d.money.revenue)}</dd>
          </dl></section>

        <section className="panel span-4"><RankedBars title="Booked value by channel (90 days)" items={d.byChannel.map(c => ({ label: CHANNEL[c.channel] ?? c.channel, sub: `${c.count} bookings`, value: c.value }))} /></section>
        <section className="panel span-4"><RankedBars title="Top publishers (90 days)" items={d.topPublishers.map(p => ({ label: p.label, sub: `${p.count} bookings`, value: p.value }))} /></section>
        <section className="panel span-4"><RankedBars title="Top buyers (90 days)" items={d.topBuyers.map(p => ({ label: p.label, sub: `${p.count} bookings`, value: p.value }))} /></section>

        <section className="panel"><RankedBars title="All deals by status" format={v => String(v)} empty="No deals yet." items={statuses} /></section>
      </div>
    </main>
  )
}

type AR = { id: string; name: string; email: string; phone: string; role: string; company: string; company_type: string; status: string; reason: string | null; created_at: string }
const TYPE: Record<string, string> = { brand: 'Brand', agency: 'Agency', media_outlet: 'Media outlet' }

export function AccessPage() {
  const { data, error, load } = useLoad<AR[]>('/admin/access-requests')
  const { act, busy, msg } = useAct(load)
  const [reason, setReason] = useState<Record<string, string>>({}), [links, setLinks] = useState<Record<string, string>>({})
  if (!data) return <Loading error={error} />
  return (
    <main>
      <PhotoBand img="/brand/dash-buyer.jpg" title="Access requests" sub="Nashr is invite-only. Approving creates the company and an invite link (valid 7 days)." />
      {msg}
      {!data.length ? <p className="muted empty">No requests.</p> : <table className="table card"><thead><tr><th>Person</th><th>Company</th><th>Received</th><th>Status</th><th style={{ width: 360 }} /></tr></thead>
        <tbody>{data.map(r => <tr key={r.id}>
          <td><b>{r.name}</b><div className="small muted">{r.role} · {r.email} · {r.phone}</div></td>
          <td>{r.company}<div className="small muted">{TYPE[r.company_type]}</div></td><td className="small num">{date(r.created_at)}</td>
          <td className="small">{r.status}{r.reason && <div className="muted">{r.reason}</div>}</td>
          <td>{links[r.id] ? <div className="small">Invite link (send it to {r.email}):<input className="search mono" style={{ width: '100%' }} readOnly value={location.origin + links[r.id]} onFocus={e => e.target.select()} /></div>
            : ['pending', 'info'].includes(r.status) && <div className="form" style={{ gap: 6 }}>
            <div className="row-flex"><button className="btn primary" disabled={busy} onClick={() => act('POST', `/admin/access-requests/${r.id}/approve`, {}, x => { setLinks({ ...links, [r.id]: x.inviteLink }); return `${r.company} approved.` })}>Approve</button>
              <input className="search" style={{ minWidth: 0, flex: 1 }} aria-label={`Reason for ${r.name}`} placeholder="Reason (for reject or more info)" value={reason[r.id] ?? ''} onChange={e => setReason({ ...reason, [r.id]: e.target.value })} /></div>
            <div className="row-flex"><button className="btn" disabled={busy || !reason[r.id]} onClick={() => act('POST', `/admin/access-requests/${r.id}/decide`, { decision: 'info', reason: reason[r.id] }, 'Asked for more information.')}>Ask for info</button>
              <button className="btn" disabled={busy || !reason[r.id]} onClick={() => act('POST', `/admin/access-requests/${r.id}/decide`, { decision: 'rejected', reason: reason[r.id] }, 'Rejected.')}>Reject</button></div>
          </div>}</td></tr>)}</tbody></table>}
    </main>
  )
}
