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
  const total = Object.values(o.byStatus).reduce((x, y) => x + y, 0)
  const COLORS: Record<string, string> = { awaiting_seller: 'var(--signal)', awaiting_payment: 'var(--teal-4)', secured: 'var(--teal)', in_review: 'var(--studio-2)',
    issue_open: 'var(--amber)', disputed: 'var(--red)', released: 'var(--green)', paid_out: '#2f9e62' }
  return (
    <main>
      <p className={`recon ${o.reconcile.ok ? 'ok' : 'bad'}`} role="status">{o.reconcile.ok ? 'Ledger reconciles with the payment provider.'
        : <>Ledger cash {money(o.reconcile.ledgerCash)} does not match the payment provider ({money(o.reconcile.providerCash)}). <a href="#/funds">Open Funds</a></>}</p>
      <div className="page-h"><h1>Overview</h1><span className="muted">{new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}</span></div>
      <dl className="figures">
        <div><dt>Bookings paid this month</dt><dd className="num">{o.bookings_month}</dd></div>
        <div><dt>Booked value this month</dt><dd className="num">{money(o.gmv_month)}</dd><small>excl. VAT</small></div>
        <div><dt>Held for bookings</dt><dd className="num">{money(o.held)}</dd></div>
        <div><dt>Nashr commission earned</dt><dd className="num">{money(o.revenue)}</dd></div>
        <div><dt>Publishers live</dt><dd className="num">{o.publishers_live}</dd><small>{o.buyers} buyers</small></div>
      </dl>
      <div className="grid2">
        <section><h2 className="sec-h">Needs attention</h2>
          <ul className="attn-list card">{attention.map(([n, label, href, hot]) => <li key={label} className={n ? (hot ? 'hot' : 'has') : 'none'}>
            <a href={href}><b className="num">{n}</b><span>{label}</span>{n > 0 && <span className="btn task-act">Open</span>}</a></li>)}</ul></section>
        <section><h2 className="sec-h">Deals by status</h2>
          {total === 0 ? <p className="muted">No deals yet.</p> : <div className="card pad">
            <div className="stack" role="img" aria-label="Deals by status">{Object.entries(o.byStatus).map(([s, n]) =>
              <span key={s} style={{ flex: n, background: COLORS[s] ?? 'var(--faint)' }} title={`${DEAL_STATUS[s]?.[0] ?? s}: ${n}`} />)}</div>
            <ul className="stack-key">{Object.entries(o.byStatus).map(([s, n]) => <li key={s}><a href={`#/deals?status=${s}`}>
              <i style={{ background: COLORS[s] ?? 'var(--faint)' }} />{DEAL_STATUS[s]?.[0] ?? s}<b className="num">{n}</b></a></li>)}</ul></div>}
        </section>
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
