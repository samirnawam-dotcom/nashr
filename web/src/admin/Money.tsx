import { useState } from 'react'
import { Loading, csv, date, money, useAct, useLoad, when } from './common'
import { PhotoBand } from '../PhotoBand'
import { ltr, t } from '../i18n'
import { CHANNEL } from '../charts'
import { tm } from '../i18n-server'

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
      <PhotoBand img="/brand/digital-wide.jpg" title={t("Funds")} sub={t("Double-entry ledger. Every movement is recorded once and never changed.")} />
      <p className={f.reconcile.ok ? 'ok' : 'error'}>{t(f.reconcile.ok ? 'Reconciled: ledger cash {ledger}, payment provider {provider}.' : 'Does not reconcile: ledger cash {ledger}, payment provider {provider}.', { ledger: money(f.reconcile.ledgerCash), provider: money(f.reconcile.providerCash) })}</p>
      <dl className="kpis">{ACCOUNT.map(([k, label, hint]) => <div key={k} className="card" title={t(hint)}><dt>{t(label)}</dt><dd className="num">{money(f.accounts[k])}</dd><div className="small muted">{t(hint)}</div></div>)}</dl>
      <h2 className="sec-h">{t("Latest movements")}</h2>
      <div className="table-wrap card"><table className="table"><thead><tr><th>{t("When")}</th><th>{t("Order")}</th><th>{t("From")}</th><th>{t("To")}</th><th className="r">{t("Amount")}</th><th>{t("Reference")}</th></tr></thead>
        <tbody>{f.recent.map((r, i) => <tr key={i}><td className="small num">{when(r.at)}</td><td className="num small">{r.deal ?? '—'}</td>
          <td className="mono">{r.credit}</td><td className="mono">{r.debit}</td><td className="r num">{money(r.amount, r.currency)}</td><td className="small">{tm(r.ref)}</td></tr>)}</tbody></table></div>
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
      <PhotoBand img="/brand/podcast-wide.jpg" title={t("Payouts and refunds")} sub={t("Sent every minute by the money job. A retry reuses the same key, so nothing is paid twice.")} />
      <div className="toolbar"><div className="seg" role="group" aria-label={t("Status")}>{[['', t("All")], ['failed', t("Failed")], ['pending', t("Pending")], ['succeeded', t("Sent")]].map(([v, l]) =>
        <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{t(l)}</button>)}</div></div>
      {msg}
      {!data ? <Loading error={error} /> : !data.length ? <p className="muted empty">{t("Nothing here.")}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Reference")}</th><th>{t("Type")}</th><th>{t("To")}</th><th>{t("Order")}</th><th className="r">{t("Amount")}</th><th>{t("Status")}</th><th>{t("Updated")}</th><th /></tr></thead>
          <tbody>{data.map(m => <tr key={m.id}>
            <td className="num">{m.ref}</td><td>{m.kind === 'transfer' ? t('Payout') : t('Refund')}</td>
            <td>{m.kind === 'transfer' ? <>{m.company}{m.payoutsEnabled === false && <div className="small outbid">{t("Payout account not verified")}</div>}</> : t('Buyer card')}</td>
            <td className="num small">{m.dealId ? <a href={`/deals/${m.dealId}`}>{m.deal}</a> : '—'}</td><td className="r num">{money(m.amount, m.currency)}</td>
            <td className={m.status === 'failed' ? 'outbid' : m.status === 'pending' ? 'soon' : 'lead'}>{t(m.status)}{m.failure && <div className="small">{tm(m.failure)}</div>}</td>
            <td className="small num">{when(m.updatedAt)}</td>
            <td className="r">{m.status === 'failed' && <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/money-ops/${m.id}/retry`, {}, t('{ref} queued again.', { ref: m.ref }))}>{t("Retry")}</button>}</td></tr>)}</tbody></table></div>}
    </main>
  )
}

type Agg = { bookings: number; gmv: number; commission: number }
type Losses = { refunds: number; refunded: number; from_buyers: number; charged_to_sellers: number; recovered_from_sellers: number }
type R = { from: string; to: string; sellersStillOwe: number; refundLosses: Losses; byMonth: (Agg & { month: string })[]; byChannel: (Agg & { channel: string })[]; byOutlet: (Agg & { outlet: string; channel: string })[]; bySaleType: (Agg & { kind: string })[] }
const KIND: Record<string, string> = { auction: 'Auction', buy_now: 'Buy now', quick_sale: 'Quick sale', choice: 'Next bid chosen', fixed: 'Fixed price' }

export function ReportsPage() {
  const year = new Date().getFullYear()
  const [from, setFrom] = useState(`${year}-01-01`), [to, setTo] = useState(`${year}-12-31`)
  const { data, error } = useLoad<R>(`/admin/reports?from=${from}&to=${to}`, [from, to])
  const Table = ({ title, rows, label, name }: { title: string; rows: (Agg & Record<string, any>)[]; label: (r: any) => string; name: string }) => <section className="section">
    <div className="row-flex" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 16 }}>{title}</h2><div className="spacer" />
      <button className="btn" disabled={!rows.length} onClick={() => csv(`nashr-${name}-${from}-${to}.csv`, rows.map(r => ({ [name]: label(r), bookings: r.bookings, gmv_aed: r.gmv / 100, commission_aed: r.commission / 100 })))}>CSV</button></div>
    {!rows.length ? <p className="muted">{t("No paid bookings in this period.")}</p> : <div className="table-wrap card"><table className="table"><thead><tr><th /><th className="r">{t("Bookings")}</th><th className="r">{t("Booked value")}</th><th className="r">{t("Commission")}</th><th className="r">{t("Take rate")}</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td>{label(r)}</td><td className="r num">{r.bookings}</td><td className="r num">{money(r.gmv)}</td><td className="r num">{money(r.commission)}</td>
        <td className="r num small">{r.gmv ? ltr(`${((r.commission / r.gmv) * 100).toFixed(1)}%`) : '—'}</td></tr>)}</tbody></table></div>}</section>
  return (
    <main>
      <PhotoBand img="/brand/campaigns-wide.jpg" title={t("Reports")} sub={t("Paid bookings, by the date they were booked (Dubai). Values excl. VAT.")} />
      <div className="toolbar"><label className="small muted" htmlFor="f">{t("From")}</label><input id="f" className="search" style={{ minWidth: 0 }} type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <label className="small muted" htmlFor="t">{t("To")}</label><input id="t" className="search" style={{ minWidth: 0 }} type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      {!data ? <Loading error={error} /> : <div className="grid2 report-grid">
        <Table title={t("By month")} rows={data.byMonth} label={r => r.month} name="month" />
        <Table title={t("By channel")} rows={data.byChannel} label={r => CHANNEL[r.channel] ?? r.channel} name="channel" />
        <Table title={t("By how it sold")} rows={data.bySaleType} label={r => t(KIND[r.kind] ?? r.kind)} name="sale_type" />
        <Table title={t("Top outlets")} rows={data.byOutlet} label={r => `${r.outlet} (${CHANNEL[r.channel] ?? r.channel})`} name="outlet" />
      </div>}
      {data && <section className="section"><h2 style={{ fontSize: 16, marginBottom: 8 }}>{t("Refund losses")}</h2>
        <dl className="kpis">
          <div className="card"><dt>{t("Refunds sent")}</dt><dd className="num">{data.refundLosses.refunds} · {money(data.refundLosses.refunded)}</dd></div>
          <div className="card"><dt>{t("Card costs kept from buyer cancellations")}</dt><dd className="num">{money(data.refundLosses.from_buyers)}</dd></div>
          <div className="card"><dt>{t("Card costs charged to publishers")}</dt><dd className="num">{money(data.refundLosses.charged_to_sellers)}</dd></div>
          <div className="card"><dt>{t("Recovered from publisher payouts")}</dt><dd className="num">{money(data.refundLosses.recovered_from_sellers)}</dd></div>
          <div className="card"><dt>{t("Publishers still owe (all time)")}</dt><dd className="num">{money(data.sellersStillOwe)}</dd></div>
        </dl>
        <p className="small muted">{t("Card costs are Nashr's estimate until the payment provider's own refund fees are recorded (Stripe, B5).")}</p></section>}
      <p className="small muted">{t('Period {from} to {to}.', { from: date(from), to: date(to) })}</p>
    </main>
  )
}
