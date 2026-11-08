import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel } from '../format'
import { dubai, todayInDubai } from '../calendar/layout'
import { DealStatus, money } from './common'
import { PhotoBand } from '../PhotoBand'
import { ltr, t } from '../i18n'
import { SalesInsights } from '../insights/SalesInsights'

type E = { available: number; owed: number; payouts: { at: string; amount: number; currency: string; ref: string | null }[]
  deals: { id: string; ref: string; status: string; outlet: string; label: string; startsAt: string; price: number; mediaVat: number; fee: number; feeVat: number; payout: number; held: boolean }[] }

export function EarningsPage() {
  const [e, setE] = useState<E | null>(null), [error, setError] = useState(''), [month, setMonth] = useState(todayInDubai().slice(0, 7))
  useEffect(() => { api<E>('/seller/earnings').then(setE, x => setError(x.message)) }, [])
  if (!e) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const held = e.deals.filter(d => d.held).reduce((n, d) => n + d.payout, 0)
  const paid = e.payouts.reduce((n, p) => n + p.amount, 0)
  return (
    <main>
      <PhotoBand img="/brand/digital-wide.jpg" title={t("Earnings")} sub={t("Money is held while a booking runs and released to you when the buyer approves proof.")} />
      <dl className="kpis">
        <div className="card"><dt>{t("Held for bookings in progress")}</dt><dd className="num">{money(held)}</dd></div>
        <div className="card"><dt>{t("Released, to be paid out")}</dt><dd className="num">{money(e.available)}</dd></div>
        <div className="card"><dt>{t("Paid to your bank")}</dt><dd className="num">{money(paid)}</dd></div>
        {e.owed > 0 && <div className="card"><dt>{t("Owed (deducted from next payout)")}</dt><dd className="num" style={{ color: 'var(--red)' }}>{money(e.owed)}</dd></div>}
      </dl>
      <SalesInsights />
      <div className="toolbar"><h2 className="sec-h" style={{ margin: 0 }}>{t("Bookings")}</h2><div className="spacer" />
        <label className="small muted" htmlFor="m">{t("Monthly statement")}</label><input id="m" className="search" style={{ minWidth: 0 }} type="month" value={month} onChange={x => setMonth(x.target.value)} />
        <a className="btn primary" href={`/earnings/statement/${month}`}>{t("View statement")}</a><a className="btn" href={`/api/seller/statement/${month}`}>{t("Download CSV")}</a>
        <a className="btn" href="/documents">{t("Receipts and invoices")}</a></div>
      {!e.deals.length ? <p className="muted empty">{t("No paid bookings yet.")}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Order")}</th><th>{t("Slot")}</th><th>{t("Airs")}</th><th className="r">{t("Price")}</th><th className="r">{t("Your VAT")}</th><th className="r">{t("Commission")}</th><th className="r">{t("You receive")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{e.deals.map(d => <tr key={d.id} onClick={() => (navigate(`/deals/${d.id}`))}>
            <td className="num">{d.ref}</td><td><b>{d.outlet}</b> · {d.label}</td><td className="num">{dayLabel(dubai(d.startsAt).date)}</td>
            <td className="r num">{money(d.price)}</td><td className="r num">{money(d.mediaVat)}</td><td className="r num">{ltr(`−${money(d.fee + d.feeVat)}`)}</td>
            <td className="r num"><b>{money(d.payout)}</b></td><td><DealStatus s={d.status} /></td></tr>)}</tbody></table></div>}
      <h2 className="sec-h">{t("Payouts")}</h2>
      {!e.payouts.length ? <p className="muted">{t("No payouts yet. Released money is transferred to your payout account automatically.")}</p>
        : <div className="table-wrap card"><table className="table"><tbody>{e.payouts.map((p, i) => <tr key={i}><td className="num">{dayLabel(dubai(p.at).date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
          <td className="small muted">{p.ref}</td><td className="r num">{money(p.amount, p.currency)}</td></tr>)}</tbody></table></div>}
    </main>
  )
}
