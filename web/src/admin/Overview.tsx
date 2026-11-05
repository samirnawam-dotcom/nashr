import { useState } from 'react'
import { DEAL_STATUS, Loading, date, money, useAct, useLoad } from './common'

type O = { access_pending: number; quotes_open: number; disputes: number; issues: number; failed_ops: number; pending_ops: number; gmv_month: number
  bookings_month: number; publishers_live: number; buyers: number; revenue: number; held: number
  reconcile: { ledgerCash: number; providerCash: number; ok: boolean }; byStatus: Record<string, number> }

export function AdminOverview() {
  const { data: o, error } = useLoad<O>('/admin/overview')
  if (!o) return <Loading error={error} />
  const attention = [
    [o.access_pending, 'Access requests to review', '#/access', false], [o.disputes, 'Disputes to decide', '#/disputes', true],
    [o.issues, 'Issues waiting on publishers', '#/disputes', false], [o.failed_ops, 'Failed payouts or refunds', '#/payouts', true],
    [o.quotes_open, 'Quote requests', '#/directory', false],
  ] as const
  return (
    <main>
      <div className="page-h"><h1>Overview</h1></div>
      {!o.reconcile.ok && <p className="error">Ledger cash {money(o.reconcile.ledgerCash)} does not match the payment provider balance {money(o.reconcile.providerCash)}. <a href="#/funds">Funds</a></p>}
      <dl className="kpis">
        <div className="card"><dt>Bookings paid this month</dt><dd className="num">{o.bookings_month}</dd></div>
        <div className="card"><dt>Booked value this month (excl. VAT)</dt><dd className="num">{money(o.gmv_month)}</dd></div>
        <div className="card"><dt>Held for bookings</dt><dd className="num">{money(o.held)}</dd></div>
        <div className="card"><dt>Nashr commission earned</dt><dd className="num">{money(o.revenue)}</dd></div>
        <div className="card"><dt>Publishers live · buyers</dt><dd className="num">{o.publishers_live} · {o.buyers}</dd></div>
      </dl>
      <h2 className="sec-h">Needs attention</h2>
      <div className="attn">{attention.map(([n, label, href, hot]) => <a key={label} href={href} className={`card ${hot && n ? 'hot' : ''}`}><b className="num">{n}</b><span className="small">{label}</span></a>)}</div>
      <h2 className="sec-h">Deals by status</h2>
      <div className="attn">{Object.entries(o.byStatus).map(([s, n]) => <a key={s} href={`#/deals?status=${s}`} className="card"><b className="num">{n}</b><span className="small">{DEAL_STATUS[s]?.[0] ?? s}</span></a>)}</div>
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
      <div className="page-h"><h1>Access requests</h1><span className="muted small">Nashr is invite-only. Approving creates the company and an invite link (valid 7 days).</span></div>
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
