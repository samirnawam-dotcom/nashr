import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel, money } from '../format'
import { dubai } from '../calendar/layout'
import { locale, t } from '../i18n'
import '../campaigns/media-plan.css'

type Line = { at: string; ref: string | null; dealId: string | null; what: string | null; kind: 'released' | 'paid' | 'deducted'; amount: number; currency: string }
type S = { month: string; company: { name: string; trn: string | null }; issuer: string; opening: number; released: number; paid: number; deducted: number; closing: number; lines: Line[] }

const KIND: Record<string, string> = { released: 'Released to you', paid: 'Paid to your bank', deducted: 'Deducted (refund costs)' }
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shift = (m: string, n: number) => { const d = new Date(`${m}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7) }

/** The publisher's monthly payout statement (SPEC 11.2 #6): one printable sheet; not a tax document. */
export function StatementPage({ month }: { month: string }) {
  const [s, setS] = useState<S | null>(null), [error, setError] = useState('')
  useEffect(() => { setS(null); api<S>(`/seller/statements/${month}`).then(setS, e => setError(e.message)) }, [month])
  const thisMonth = new Date().toISOString().slice(0, 7)
  return (
    <main className="plan-page">
      <div className="plan-actions no-print">
        <a className="btn" href="/earnings">{t('Back to earnings')}</a>
        <nav className="row-flex" aria-label={t('Month')}>
          <a className="btn" href={`/earnings/statement/${shift(month, -1)}`} aria-label={t('Previous month')}><span className="flip-rtl" aria-hidden>‹</span></a>
          <b className="statement-month">{monthName(month)}</b>
          {month < thisMonth ? <a className="btn" href={`/earnings/statement/${shift(month, 1)}`} aria-label={t('Next month')}><span className="flip-rtl" aria-hidden>›</span></a>
            : <span className="btn" aria-disabled="true" style={{ opacity: .4 }}><span className="flip-rtl" aria-hidden>›</span></span>}
        </nav>
        <span className="spacer" />
        <a className="btn" href={`/api/seller/statement/${month}`}>{t('Download CSV')}</a>
        <button className="btn primary" onClick={() => print()}>{t('Print or save as PDF')}</button>
      </div>
      {!s ? <p className={error ? 'error' : 'muted'}>{error || t('Loading…')}</p> : <article className="plan-sheet">
        <header className="plan-head">
          <div><span className="plan-mark"><b>Nashr</b><i lang="ar">نشر</i></span><p className="plan-kicker">{t('Payout statement')}</p>
            <h1>{monthName(s.month)}</h1>
            <p className="plan-meta">{s.company.name}{s.company.trn ? ` · ${t('TRN {trn}', { trn: s.company.trn })}` : ''}</p></div>
          <p className="plan-date">{t('From {name}', { name: s.issuer })}</p>
        </header>
        <section className="plan-kpis" aria-label={t('Summary')}>
          <div><span>{t('Balance at the start')}</span><b>{money(s.opening)}</b></div>
          <div><span>{t('Released to you')}</span><b>{money(s.released)}</b></div>
          <div><span>{t('Paid to your bank')}</span><b>{money(-s.paid)}</b></div>
          <div><span>{t('Balance at the end')}</span><b>{money(s.closing)}</b></div>
        </section>
        <section>
          <h2>{t('Movements')}</h2>
          {!s.lines.length ? <p className="muted">{t('Nothing moved this month.')}</p> :
            <table className="plan-table"><thead><tr><th>{t('Date')}</th><th>{t('Order')}</th><th>{t('What')}</th><th className="r">{t('Amount')}</th></tr></thead>
              <tbody>{s.lines.map((l, i) => <tr key={i}><td className="num">{dayLabel(dubai(l.at).date, { day: 'numeric', month: 'short' })}</td>
                <td className="num">{l.dealId ? <a href={`/deals/${l.dealId}`}>{l.ref}</a> : '—'}</td>
                <td>{t(KIND[l.kind])}{l.what && <div className="small muted">{l.what}</div>}</td>
                <td className="r num">{money(l.amount, l.currency)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3}>{t('Change this month')}</td><td className="r num">{money(s.closing - s.opening)}</td></tr></tfoot></table>}
          {s.deducted !== 0 && <p className="small muted">{t('Deducted this month: {amount}. These are card costs of refunds that were your responsibility.', { amount: money(-s.deducted) })}</p>}
        </section>
        <footer className="plan-foot">{t('Amounts released are your price plus VAT, less Nashr’s commission. Nashr’s commission invoices and the tax invoices to buyers are separate documents. This statement is not a tax document.')}</footer>
      </article>}
    </main>
  )
}
