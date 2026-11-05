import { useState } from 'react'
import { Loading, csv, date, money, useAct, useLoad, when } from './common'

type Funds = { accounts: Record<string, number>; reconcile: { ledgerCash: number; providerCash: number; ok: boolean }
  recent: { at: string; debit: string; credit: string; amount: number; currency: string; ref: string | null; deal: string | null }[] }
const ACCOUNT: [string, string, string][] = [
  ['cash', 'Cash at the payment provider', 'Everything paid in, less refunds and payouts'], ['held', 'Held for bookings', 'Paid by buyers, not yet released or refunded'],
  ['sellerPayable', 'Owed to publishers', 'Released, waiting for transfer'], ['sellerReceivable', 'Owed by publishers', 'Refund costs at their fault, deducted from next payout'],
  ['revenue', 'Nashr commission', 'Earned on released bookings'], ['vatPayable', 'VAT on commission', 'Only while Nashr is VAT-registered'],
  ['refundCosts', 'Refund card costs', 'Positive: still to recover · negative: recovered'],
]

export function FundsPage() {
  const { data: f, error } = useLoad<Funds>('/admin/funds')
  if (!f) return <Loading error={error} />
  return (
    <main>
      <div className="page-h"><h1>Funds</h1><span className="muted small">Double-entry ledger. Every movement is recorded once and never changed.</span></div>
      <p className={f.reconcile.ok ? 'ok' : 'error'}>{f.reconcile.ok ? 'Reconciled: ' : 'Does not reconcile: '}ledger cash {money(f.reconcile.ledgerCash)}, payment provider {money(f.reconcile.providerCash)}.</p>
      <dl className="kpis">{ACCOUNT.map(([k, label, hint]) => <div key={k} className="card" title={hint}><dt>{label}</dt><dd className="num">{money(f.accounts[k])}</dd><div className="small muted">{hint}</div></div>)}</dl>
      <h2 className="sec-h">Latest movements</h2>
      <table className="table card"><thead><tr><th>When</th><th>Order</th><th>From</th><th>To</th><th className="r">Amount</th><th>Reference</th></tr></thead>
        <tbody>{f.recent.map((r, i) => <tr key={i}><td className="small num">{when(r.at)}</td><td className="num small">{r.deal ?? '—'}</td>
          <td className="mono">{r.credit}</td><td className="mono">{r.debit}</td><td className="r num">{money(r.amount, r.currency)}</td><td className="small">{r.ref}</td></tr>)}</tbody></table>
    </main>
  )
}

type Op = { id: string; ref: string; kind: string; amount: number; currency: string; status: string; failure: string | null; createdAt: string; updatedAt: string
  deal: string | null; dealId: string | null; company: string | null; payoutsEnabled: boolean | null }

export function PayoutsPage() {
  const [status, setStatus] = useState('')
  const { data, error, load } = useLoad<Op[]>(`/admin/money-ops${status ? `?status=${status}` : ''}`, [status])
  const { act, busy, msg } = useAct(load)
  return (
    <main>
      <div className="page-h"><h1>Payouts and refunds</h1><span className="muted small">Sent every minute by the money job. A retry reuses the same key, so nothing is paid twice.</span></div>
      <div className="toolbar"><div className="seg" role="group" aria-label="Status">{[['', 'All'], ['failed', 'Failed'], ['pending', 'Pending'], ['succeeded', 'Sent']].map(([v, l]) =>
        <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>)}</div></div>
      {msg}
      {!data ? <Loading error={error} /> : !data.length ? <p className="muted empty">Nothing here.</p>
        : <table className="table card"><thead><tr><th>Reference</th><th>Type</th><th>To</th><th>Order</th><th className="r">Amount</th><th>Status</th><th>Updated</th><th /></tr></thead>
          <tbody>{data.map(m => <tr key={m.id}>
            <td className="num">{m.ref}</td><td>{m.kind === 'transfer' ? 'Payout' : 'Refund'}</td>
            <td>{m.kind === 'transfer' ? <>{m.company}{m.payoutsEnabled === false && <div className="small outbid">Payout account not verified</div>}</> : 'Buyer card'}</td>
            <td className="num small">{m.dealId ? <a href={`#/deals/${m.dealId}`}>{m.deal}</a> : '—'}</td><td className="r num">{money(m.amount, m.currency)}</td>
            <td className={m.status === 'failed' ? 'outbid' : m.status === 'pending' ? 'soon' : 'lead'}>{m.status}{m.failure && <div className="small">{m.failure}</div>}</td>
            <td className="small num">{when(m.updatedAt)}</td>
            <td className="r">{m.status === 'failed' && <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/money-ops/${m.id}/retry`, {}, `${m.ref} queued again.`)}>Retry</button>}</td></tr>)}</tbody></table>}
    </main>
  )
}

type Agg = { bookings: number; gmv: number; commission: number }
type Losses = { refunds: number; refunded: number; from_buyers: number; charged_to_sellers: number; recovered_from_sellers: number }
type R = { from: string; to: string; sellersStillOwe: number; refundLosses: Losses; byMonth: (Agg & { month: string })[]; byChannel: (Agg & { channel: string })[]; byOutlet: (Agg & { outlet: string; channel: string })[]; bySaleType: (Agg & { kind: string })[] }
const KIND: Record<string, string> = { auction: 'Auction', buy_now: 'Buy now', quick_sale: 'Quick sale', choice: 'Next bid chosen' }

export function ReportsPage() {
  const year = new Date().getFullYear()
  const [from, setFrom] = useState(`${year}-01-01`), [to, setTo] = useState(`${year}-12-31`)
  const { data, error } = useLoad<R>(`/admin/reports?from=${from}&to=${to}`, [from, to])
  const Table = ({ title, rows, label, name }: { title: string; rows: (Agg & Record<string, any>)[]; label: (r: any) => string; name: string }) => <section className="section">
    <div className="row-flex" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 16 }}>{title}</h2><div className="spacer" />
      <button className="btn" disabled={!rows.length} onClick={() => csv(`nashr-${name}-${from}-${to}.csv`, rows.map(r => ({ [name]: label(r), bookings: r.bookings, gmv_aed: r.gmv / 100, commission_aed: r.commission / 100 })))}>CSV</button></div>
    {!rows.length ? <p className="muted">No paid bookings in this period.</p> : <table className="table card"><thead><tr><th /><th className="r">Bookings</th><th className="r">Booked value</th><th className="r">Commission</th><th className="r">Take rate</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td>{label(r)}</td><td className="r num">{r.bookings}</td><td className="r num">{money(r.gmv)}</td><td className="r num">{money(r.commission)}</td>
        <td className="r num small">{r.gmv ? `${((r.commission / r.gmv) * 100).toFixed(1)}%` : '—'}</td></tr>)}</tbody></table>}</section>
  return (
    <main>
      <div className="page-h"><h1>Reports</h1><span className="muted small">Paid bookings, by the date they were booked (Dubai). Values excl. VAT.</span></div>
      <div className="toolbar"><label className="small muted" htmlFor="f">From</label><input id="f" className="search" style={{ minWidth: 0 }} type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <label className="small muted" htmlFor="t">To</label><input id="t" className="search" style={{ minWidth: 0 }} type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      {!data ? <Loading error={error} /> : <div className="grid2">
        <Table title="By month" rows={data.byMonth} label={r => r.month} name="month" />
        <Table title="By channel" rows={data.byChannel} label={r => r.channel} name="channel" />
        <Table title="By how it sold" rows={data.bySaleType} label={r => KIND[r.kind] ?? r.kind} name="sale_type" />
        <Table title="Top outlets" rows={data.byOutlet} label={r => `${r.outlet} (${r.channel})`} name="outlet" />
      </div>}
      {data && <section className="section"><h2 style={{ fontSize: 16, marginBottom: 8 }}>Refund losses</h2>
        <dl className="kpis">
          <div className="card"><dt>Refunds sent</dt><dd className="num">{data.refundLosses.refunds} · {money(data.refundLosses.refunded)}</dd></div>
          <div className="card"><dt>Card costs kept from buyer cancellations</dt><dd className="num">{money(data.refundLosses.from_buyers)}</dd></div>
          <div className="card"><dt>Card costs charged to publishers</dt><dd className="num">{money(data.refundLosses.charged_to_sellers)}</dd></div>
          <div className="card"><dt>Recovered from publisher payouts</dt><dd className="num">{money(data.refundLosses.recovered_from_sellers)}</dd></div>
          <div className="card"><dt>Publishers still owe (all time)</dt><dd className="num">{money(data.sellersStillOwe)}</dd></div>
        </dl>
        <p className="small muted">Card costs are Nashr's estimate until the payment provider's own refund fees are recorded (Stripe, B5).</p></section>}
      <p className="small muted">Period {date(from)} to {date(to)}.</p>
    </main>
  )
}
