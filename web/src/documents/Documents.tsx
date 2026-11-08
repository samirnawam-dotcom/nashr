import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { csv } from '../admin/common'
import { dayLabel, money } from '../format'
import { dubai } from '../calendar/layout'
import '../directory/directory.css'
import { PhotoBand } from '../PhotoBand'
import { isAr, ltr, t } from '../i18n'
import { tm } from '../i18n-server'

export const DOC_TYPE: Record<string, string> = { order: t('Order'), receipt: t('Payment receipt'), media_invoice: t('Tax invoice (media)'), commission_invoice: t('Commission invoice'), credit_note: t('Credit note') }
type Row = { id: string; type: string; number: string; total: number; currency: string; issuedAt: string; dealId: string | null; dealRef: string | null }

const day = (iso: string) => dayLabel(dubai(iso).date, { day: 'numeric', month: 'short', year: 'numeric' })

/** Every document a company issued or received, by type, with a PDF of each and the list as CSV for the accountant. */
export function DocumentsPage({ seller = false }: { seller?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null), [error, setError] = useState(''), [type, setType] = useState('')
  useEffect(() => { api<Row[]>('/documents').then(setRows, e => setError(e.message)) }, [])
  const types = [...new Set((rows ?? []).map(r => r.type))]
  const shown = (rows ?? []).filter(r => !type || r.type === type)
  return (
    <main>
      <p className="small">{seller ? <a href="/earnings">{t('Earnings')}</a> : <a href="/bookings">{t('Bookings')}</a>} {isAr ? '‹' : '›'} {t("Receipts and invoices")}</p>
      <PhotoBand img="/brand/bookings-wide.jpg" title={t("Receipts and invoices")} sub={seller ? t('Orders, the tax invoices issued in your name, Nashr\'s commission invoices and credit notes.') : t("Payment receipts, tax invoices and credit notes for every booking.")} />
      {error && <p className="error">{error}</p>}
      {rows && !rows.length && <p className="muted empty">{seller ? t('Nothing yet. Each accepted booking adds an order, and each payment a tax invoice in your name.') : t("Nothing yet. You get a receipt from Nashr and a tax invoice from the publisher when you pay.")}</p>}
      {rows && rows.length > 0 && <>
        <div className="toolbar" style={{ marginTop: 20 }}>
          <div className="seg" role="radiogroup" aria-label={t('Document type')}>
            {['', ...types].map(k => <button key={k} type="button" role="radio" aria-checked={type === k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{k ? DOC_TYPE[k] : t('All')}</button>)}</div>
          <div className="spacer" />
          <button className="btn" onClick={() => csv(`nashr-documents${type ? '-' + type : ''}.csv`, shown.map(r => ({ document: DOC_TYPE[r.type], number: r.number, order: r.dealRef ?? '',
            date: r.issuedAt.slice(0, 10), total: (r.total / 100).toFixed(2), currency: r.currency })))}>{t('Download CSV')}</button></div>
        <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Document")}</th><th>{t("Number")}</th><th>{t("Order")}</th><th>{t("Date")}</th><th className="r">{t("Total")}</th><th><span className="sr-only">{t('PDF')}</span></th></tr></thead>
          <tbody>{shown.map(r => <tr key={r.id} onClick={() => (navigate(`/documents/${r.id}`))}>
            <td>{DOC_TYPE[r.type]}</td><td className="num">{r.number}</td><td className="num">{r.dealRef ?? '—'}</td>
            <td className="num">{day(r.issuedAt)}</td><td className="r num">{money(r.total, r.currency)}</td>
            <td className="r"><a className="small" href={`/api/documents/${r.id}/pdf`} onClick={e => e.stopPropagation()} aria-label={t('PDF of {number}', { number: r.number })}>{t('PDF')}</a></td></tr>)}</tbody></table></div></>}
    </main>
  )
}

type Doc = { id: string; type: string; number: string; dealRef: string | null; relatedNumber: string | null; onBehalf: boolean; taxDocument: boolean
  issuer: { name: string; trn: string | null; address: string | null }; recipient: { name: string; trn: string | null; address: string | null }; items: { description: string; amount?: number; quantity?: number; unitPrice?: number }[]; note: string | null
  currency: string; subtotal: number; vatBp: number; vat: number; total: number; issuedAt: string; fileId: string | null }

/** A printable rendering of the stored document; the row is the record (SPEC 11.2). */
export function DocumentPage({ id }: { id: string }) {
  const [d, setD] = useState<Doc | null>(null), [error, setError] = useState('')
  useEffect(() => { api<Doc>(`/documents/${id}`).then(setD, e => setError(e.message)) }, [id])
  if (!d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const title = d.type === 'media_invoice' || d.type === 'commission_invoice' ? (d.taxDocument ? t('Tax invoice') : t('Invoice')) : DOC_TYPE[d.type]
  return (
    <main>
      <div className="row-flex no-print" style={{ marginBottom: 16 }}><a className="small" href="/documents" onClick={e => { if (history.length > 1) { e.preventDefault(); history.back() } }}>{t("Back")}</a><div className="spacer" />
        {d.fileId && <a className="btn" href={`/api/files/${d.fileId}`}>{t("Publisher's uploaded invoice")}</a>}
        <button className="btn" onClick={() => print()}>{t("Print")}</button>
        <a className="btn primary" href={`/api/documents/${d.id}/pdf`}>{t("Download PDF")}</a></div>
      <article className="card doc">
        <div className="row-flex"><h1>{title}</h1><div className="spacer" /><span className="num">{d.number}</span></div>
        <p className="muted small">{t('Issued {date}', { date: dayLabel(dubai(d.issuedAt).date, { day: 'numeric', month: 'long', year: 'numeric' }) })}{d.dealRef ? ` · ${t('Order {ref}', { ref: d.dealRef })}` : ''}{d.relatedNumber ? ` · ${t('Credits {ref}', { ref: d.relatedNumber })}` : ''}</p>
        <div className="parties">
          <div><div className="small muted">{t("From")}</div><b>{d.issuer.name}</b>{d.issuer.address && <div className="small addr">{d.issuer.address}</div>}{d.issuer.trn && <div className="small">{t('TRN')} {ltr(d.issuer.trn)}</div>}
            {d.onBehalf && !d.note && <div className="small muted">{t("Issued by Nashr on the publisher's behalf")}</div>}</div>
          <div><div className="small muted">{t("To")}</div><b>{d.recipient.name}</b>{d.recipient.address && <div className="small addr">{d.recipient.address}</div>}{d.recipient.trn && <div className="small">{t('TRN')} {ltr(d.recipient.trn)}</div>}</div>
        </div>
        <table><thead><tr><th>{t("Description")}</th><th style={{ textAlign: isAr ? 'left' : 'right' }}>{t('Amount')}</th></tr></thead>
          <tbody>{d.items.map((i, n) => <tr key={n}><td>{tm(i.description)}</td><td className="num" style={{ textAlign: isAr ? 'left' : 'right' }}>{money(i.amount ?? (i.unitPrice ?? 0) * (i.quantity ?? 1), d.currency)}</td></tr>)}</tbody></table>
        <dl className="sum num" style={{ maxWidth: 320, marginInlineStart: 'auto' }}>
          <div><dt>{t("Subtotal")}</dt><dd>{money(d.subtotal, d.currency)}</dd></div>
          {(d.taxDocument || d.vat > 0) && <div><dt>{t('VAT {rate}%', { rate: d.vatBp / 100 })}</dt><dd>{money(d.vat, d.currency)}</dd></div>}
          <div className="total"><dt>{t("Total")}</dt><dd>{money(d.total, d.currency)}</dd></div>
        </dl>
        {d.note && <p className="small muted">{tm(d.note)}</p>}
        {d.type === 'receipt' && <p className="small muted">{t("Payment received by Nashr on behalf of the publisher. This is not a tax invoice; the publisher's tax invoice is issued separately.")}</p>}
      </article>
    </main>
  )
}
