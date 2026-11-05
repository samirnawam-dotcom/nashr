import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel, money } from '../format'
import { dubai } from '../calendar/layout'
import '../directory/directory.css'

export const DOC_TYPE: Record<string, string> = { receipt: 'Payment receipt', media_invoice: 'Tax invoice (media)', commission_invoice: 'Commission invoice', credit_note: 'Credit note' }
type Row = { id: string; type: string; number: string; total: number; currency: string; issuedAt: string; dealId: string | null; dealRef: string | null }

export function DocumentsPage() {
  const [rows, setRows] = useState<Row[] | null>(null), [error, setError] = useState('')
  useEffect(() => { api<Row[]>('/documents').then(setRows, e => setError(e.message)) }, [])
  return (
    <main>
      <p className="small"><a href="#/bookings">Bookings</a> › Receipts and invoices</p>
      <h1>Receipts and invoices</h1>
      {error && <p className="error">{error}</p>}
      {rows && !rows.length && <p className="muted empty">Nothing yet. You get a receipt from Nashr and a tax invoice from the publisher when you pay.</p>}
      {rows && rows.length > 0 && <table className="table card" style={{ marginTop: 20 }}><thead><tr><th>Document</th><th>Number</th><th>Order</th><th>Date</th><th className="r">Total</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} onClick={() => (location.hash = `#/documents/${r.id}`)}>
          <td>{DOC_TYPE[r.type]}</td><td className="num">{r.number}</td><td className="num">{r.dealRef ?? '—'}</td>
          <td className="num">{dayLabel(dubai(r.issuedAt).date, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td className="r num">{money(r.total, r.currency)}</td></tr>)}</tbody></table>}
    </main>
  )
}

type Doc = { id: string; type: string; number: string; dealRef: string | null; relatedNumber: string | null; onBehalf: boolean; taxDocument: boolean
  issuer: { name: string; trn: string | null }; recipient: { name: string; trn: string | null }; items: { description: string; amount?: number; quantity?: number; unitPrice?: number }[]; note: string | null
  currency: string; subtotal: number; vatBp: number; vat: number; total: number; issuedAt: string; fileId: string | null }

/** A printable rendering of the stored document; the row is the record (SPEC 11.2). */
export function DocumentPage({ id }: { id: string }) {
  const [d, setD] = useState<Doc | null>(null), [error, setError] = useState('')
  useEffect(() => { api<Doc>(`/documents/${id}`).then(setD, e => setError(e.message)) }, [id])
  if (!d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  const title = d.type === 'media_invoice' || d.type === 'commission_invoice' ? (d.taxDocument ? 'Tax invoice' : 'Invoice') : DOC_TYPE[d.type]
  return (
    <main>
      <div className="row-flex no-print" style={{ marginBottom: 16 }}><a className="small" href="#/documents" onClick={e => { if (history.length > 1) { e.preventDefault(); history.back() } }}>Back</a><div className="spacer" />
        {d.fileId && <a className="btn" href={`/api/files/${d.fileId}`}>Publisher's uploaded invoice</a>}
        <button className="btn primary" onClick={() => print()}>Print or save as PDF</button></div>
      <article className="card doc">
        <div className="row-flex"><h1>{title}</h1><div className="spacer" /><span className="num">{d.number}</span></div>
        <p className="muted small">Issued {dayLabel(dubai(d.issuedAt).date, { day: 'numeric', month: 'long', year: 'numeric' })}{d.dealRef ? ` · Order ${d.dealRef}` : ''}{d.relatedNumber ? ` · Credits ${d.relatedNumber}` : ''}</p>
        <div className="parties">
          <div><div className="small muted">From</div><b>{d.issuer.name}</b>{d.issuer.trn && <div className="small">TRN {d.issuer.trn}</div>}
            {d.onBehalf && !d.note && <div className="small muted">Issued by Nashr on the publisher's behalf</div>}</div>
          <div><div className="small muted">To</div><b>{d.recipient.name}</b>{d.recipient.trn && <div className="small">TRN {d.recipient.trn}</div>}</div>
        </div>
        <table><thead><tr><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>{d.items.map((i, n) => <tr key={n}><td>{i.description}</td><td className="num" style={{ textAlign: 'right' }}>{money(i.amount ?? (i.unitPrice ?? 0) * (i.quantity ?? 1), d.currency)}</td></tr>)}</tbody></table>
        <dl className="sum num" style={{ maxWidth: 320, marginLeft: 'auto' }}>
          <div><dt>Subtotal</dt><dd>{money(d.subtotal, d.currency)}</dd></div>
          {(d.taxDocument || d.vat > 0) && <div><dt>VAT {d.vatBp / 100}%</dt><dd>{money(d.vat, d.currency)}</dd></div>}
          <div className="total"><dt>Total</dt><dd>{money(d.total, d.currency)}</dd></div>
        </dl>
        {d.note && <p className="small muted">{d.note}</p>}
        {d.type === 'receipt' && <p className="small muted">Payment received by Nashr on behalf of the publisher. This is not a tax invoice; the publisher's tax invoice is issued separately.</p>}
      </article>
    </main>
  )
}
