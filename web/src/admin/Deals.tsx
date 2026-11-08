import { navigate } from '../nav'
import { useState } from 'react'
import { DEAL_STATUS, DealStatus, Loading, date, money, useAct, useLoad, when } from './common'
import { DOC_TYPE } from '../documents/Documents'
import { PhotoBand } from '../PhotoBand'
import { Stars } from '../Stars'
import { ltr, t } from '../i18n'

type Row = { id: string; ref: string; status: string; kind: string; amount: number; currency: string; commission_bp: number | null; next_deadline_at: string | null
  created_at: string; buyer: string; seller: string; outlet: string; label: string; starts_at: string }

export function AdminDealsPage() {
  const initial = new URLSearchParams(location.search).get('status') ?? ''
  const [status, setStatus] = useState(initial), [q, setQ] = useState(''), [search, setSearch] = useState('')
  const { data, error } = useLoad<Row[]>(`/admin/deals?status=${status}&q=${encodeURIComponent(search)}`, [status, search])
  return (
    <main>
      <PhotoBand img="/brand/bookings-wide.jpg" title={t("Deals")} sub={t("Every booking on the platform, from request to release.")} />
      <form className="toolbar" onSubmit={e => { e.preventDefault(); setSearch(q) }}>
        <input className="search" type="search" aria-label={t("Search")} placeholder={t("Order number, buyer or publisher")} value={q} onChange={e => setQ(e.target.value)} />
        <select className="btn" aria-label={t("Status")} value={status} onChange={e => setStatus(e.target.value)}><option value="">{t("All statuses")}</option>
          {Object.entries(DEAL_STATUS).map(([k, [l]]) => <option key={k} value={k}>{t(l)}</option>)}</select>
        <button className="btn">{t("Search")}</button></form>
      {!data ? <Loading error={error} /> : !data.length ? <p className="muted empty">{t("No deals match.")}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Order")}</th><th>{t("Slot")}</th><th>{t("Buyer")}</th><th>{t("Publisher")}</th><th>{t("Airs")}</th><th className="r">{t("Price")}</th><th>{t("Next deadline")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{data.map(d => <tr key={d.id} onClick={() => (navigate(`/deals/${d.id}`))}>
            <td className="num">{d.ref}</td><td><b>{d.outlet}</b> · {d.label}</td><td>{d.buyer}</td><td>{d.seller}</td><td className="small num">{date(d.starts_at)}</td>
            <td className="r num">{money(d.amount, d.currency)}</td><td className="small num">{when(d.next_deadline_at)}</td><td><DealStatus s={d.status} /></td></tr>)}</tbody></table></div>}
    </main>
  )
}

type File = { rating: { id: string; score: number; comment: string | null; hidden: boolean } | null; id: string; ref: string; status: string; kind: string; outlet: string; channel: string; label: string; startsAt: string; creativeDueAt: string
  buyer: { id: string; name: string }; seller: { id: string; name: string }; brief: any; nextDeadlineAt: string | null; extraCreativeRounds: number; ratesFrozen: boolean
  money: { price: number; mediaVat: number; buyerPays: number; commissionBp: number | null; fee: number; feeVat: number; payout: number; held: number }
  events: { at: string; event: string; from_status: string | null; to_status: string; actor: string; note: string | null }[]
  ledger: { at: string; debit: string; credit: string; amount: number; currency: string; ref: string | null }[]
  moneyOps: { ref: string; kind: string; amount: number; currency: string; status: string; failure: string | null; created_at: string }[]
  creatives: { version: number; status: string; reason: string | null; fileId: string; uploaded_at: string }[]
  proofs: { items: Record<string, string>; note: string | null; submitted_at: string }[]
  issues: { reason: string; note: string; evidence: unknown; offer: any; status: string; opened_at: string; closed_at: string | null }[]
  documents: { id: string; type: string; number: string; total: number; issued_at: string }[] }

/** A deal status as the timeline shows it. */
const st = (s: string) => t(DEAL_STATUS[s]?.[0] ?? s.replace(/_/g, ' '))

const OUTCOMES = [['release', t("Release to the publisher")], ['refund', t("Refund the buyer in full")], ['partial_refund', t("Partial refund")], ['make_good', t("Make-good (run it again)")]]

export function AdminDealPage({ id }: { id: string }) {
  const { data: d, error, load } = useLoad<File>(`/admin/deals/${id}`)
  const { act, busy, msg } = useAct(load)
  const [tab, setTab] = useState('timeline'), [outcome, setOutcome] = useState(''), [amount, setAmount] = useState('')
  if (!d) return <Loading error={error} />
  // What Nashr actually earned, from the ledger (a partial refund lowers it below the full-price commission).
  const earned = d.ledger.reduce((n, l) => n + (l.credit === 'nashr_revenue' ? l.amount : l.debit === 'nashr_revenue' ? -l.amount : 0), 0)
  const pendingRefunds = d.moneyOps.filter(m => m.kind === 'refund' && m.status === 'pending').reduce((n, m) => n + m.amount, 0)
  const tabs = [['timeline', t("Timeline")], ['money', t("Money")], ['fulfilment', t("Creative and proof")], ['documents', t("Documents")]]
  return (
    <main className="narrow wide">
      <p className="small"><a href="/deals">{t("Deals")}</a> › {d.ref}</p>
      <div className="profile-cover slim" aria-hidden><img src={`/brand/${d.channel}-wide.jpg`} width={1600} height={500} alt="" decoding="async" /></div>
      <div className="profile-h"><div><h1>{d.outlet} · {d.label}</h1>
        <p className="muted">{when(d.startsAt)} · <a href={`/accounts/${d.buyer.id}`}>{d.buyer.name}</a> {t('buys from')} <a href={`/accounts/${d.seller.id}`}>{d.seller.name}</a> · <DealStatus s={d.status} /></p></div></div>
      {msg}
      {d.rating && <section className="card pad section rate"><h2>{d.rating.hidden ? t("Buyer's rating (hidden from the outlet page)") : t("Buyer's rating")}</h2><Stars value={d.rating.score} size={18} />
        {d.rating.comment && <p className="rate-comment">“{d.rating.comment}”</p>}
        <button className="btn" style={{ justifySelf: 'start' }} disabled={busy}
          onClick={() => act('POST', `/admin/ratings/${d.rating!.id}/hidden`, { hidden: !d.rating!.hidden }, d.rating!.hidden ? t('Rating shown again.') : t('Rating hidden.'))}>
          {d.rating.hidden ? t('Show on the outlet page') : t('Hide from the outlet page')}</button></section>}
      {d.status === 'disputed' && <section className="card pad section form">
        <h2>{t("Decide this dispute")}</h2>
        {d.issues.at(-1) && <p><b>{t(d.issues.at(-1)!.reason.replace(/_/g, ' '))}:</b> {d.issues.at(-1)!.note}
          {d.issues.at(-1)!.offer && <span className="muted"> · {d.issues.at(-1)!.offer.type === 'partial_refund' ? t('publisher offered a refund of {amount}', { amount: money(d.issues.at(-1)!.offer.amount) }) : t('publisher offered: {offer}', { offer: t(d.issues.at(-1)!.offer.type.replace(/_/g, ' ')) })}</span>}</p>}
        <div className="field"><label htmlFor="out">{t("Outcome")}</label><select id="out" value={outcome} onChange={e => setOutcome(e.target.value)}><option value="">{t("Choose…")}</option>
          {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div>
        {outcome === 'partial_refund' && <div className="field"><label htmlFor="amt">{t("Refund to the buyer (AED, incl. VAT)")}</label><input id="amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>}
        <p className="small muted">{t("Refunds at the publisher's fault: the card costs are deducted from their next payout. The decision is final and both sides are told.")}</p>
        <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || !outcome || (outcome === 'partial_refund' && !(Number(amount) > 0))}
          onClick={() => confirm(t('Apply this outcome? Money moves at once.')) && act('POST', `/admin/deals/${d.id}/dispute`, { outcome, ...(outcome === 'partial_refund' ? { amount: Math.round(Number(amount) * 100) } : {}) }, t("Decision applied."))}>{t("Apply decision")}</button>
      </section>}
      <dl className="kpis">
        <div className="card"><dt>{t("Price")}</dt><dd className="num">{money(d.money.price)}</dd></div>
        <div className="card"><dt>{t("Buyer pays")}</dt><dd className="num">{money(d.money.buyerPays)}</dd></div>
        <div className="card"><dt>{d.money.commissionBp != null ? t('Commission ({pct})', { pct: ltr(`${d.money.commissionBp / 100}%`) }) : t('Commission (not frozen yet)')}</dt>
          <dd className="num">{earned ? money(earned) : money(d.money.fee + d.money.feeVat)}</dd><div className="small muted">{earned ? (earned !== d.money.fee + d.money.feeVat ? t('earned · {amount} at full price', { amount: money(d.money.fee + d.money.feeVat) }) : t('earned')) : t('when released')}</div></div>
        <div className="card"><dt>{t("Held now")}</dt><dd className="num">{money(d.money.held)}</dd>{pendingRefunds > 0 && <div className="small muted">{t('{amount} refund being sent', { amount: money(pendingRefunds) })}</div>}</div>
      </dl>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
      {tab === 'timeline' && <div className="table-wrap card"><table className="table"><thead><tr><th>{t("When")}</th><th>{t("Event")}</th><th>{t("Status")}</th><th>{t("Who")}</th><th>{t("Note")}</th></tr></thead>
        <tbody>{d.events.map((e, i) => <tr key={i}><td className="small num">{when(e.at)}</td><td>{t(e.event.replace(/_/g, ' '))}</td>
          <td className="small">{e.from_status ? `${st(e.from_status)} ← ` : ''}{st(e.to_status)}</td><td className="mono">{e.actor}</td><td className="small">{e.note}</td></tr>)}</tbody></table></div>}
      {tab === 'money' && <>
        <div className="table-wrap card"><table className="table"><thead><tr><th>{t("When")}</th><th>{t("From (credit)")}</th><th>{t("To (debit)")}</th><th className="r">{t("Amount")}</th><th>{t("Reference")}</th></tr></thead>
          <tbody>{d.ledger.map((l, i) => <tr key={i}><td className="small num">{when(l.at)}</td><td className="mono">{l.credit}</td><td className="mono">{l.debit}</td>
            <td className="r num">{money(l.amount, l.currency)}</td><td className="small">{l.ref}</td></tr>)}</tbody></table></div>
        <h2 className="sec-h">{t("Payments, refunds and transfers")}</h2>
        <div className="table-wrap card"><table className="table"><tbody>{d.moneyOps.map(m => <tr key={m.ref}><td className="num">{m.ref}</td><td>{t(m.kind)}</td><td className="r num">{money(m.amount, m.currency)}</td>
          <td className={m.status === 'failed' ? 'outbid' : ''}>{t(m.status)}{m.failure && <div className="small">{m.failure}</div>}</td><td className="small num">{when(m.created_at)}</td></tr>)}</tbody></table></div>
      </>}
      {tab === 'fulfilment' && <div className="grid2">
        <section className="card pad"><h2 style={{ fontSize: 16, marginBottom: 12 }}>{t("Creative")}</h2>
          <p className="small muted">{t('Due {when} · extra change rounds allowed: {n}', { when: when(d.creativeDueAt), n: d.extraCreativeRounds })}</p>
          <ul className="timeline">{d.creatives.map(c => <li key={c.version}><a href={`/api/files/${c.fileId}`}>v{c.version}</a><span>{t(c.status.replace(/_/g, ' '))}{c.reason ? ` · ${t(c.reason.replace(/_/g, ' '))}` : ''}</span></li>)}</ul>
          {['awaiting_payment', 'secured'].includes(d.status) && <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={() => act('POST', `/admin/deals/${d.id}/extra-round`, {}, t("One more change round allowed."))}>{t("Allow one more change round")}</button>}
        </section>
        <section className="card pad"><h2 style={{ fontSize: 16, marginBottom: 12 }}>{t("Proof and issues")}</h2>
          {d.proofs.map((p, i) => <div key={i} style={{ marginBottom: 12 }}><div className="small muted">{t('Proof sent {when}', { when: when(p.submitted_at) })}</div><pre className="json">{JSON.stringify(p.items, null, 2)}</pre></div>)}
          {d.issues.map((x, i) => <div key={i}><div className="small muted">{t('Issue opened {when}', { when: when(x.opened_at) })} · {t(x.status)}</div><p>{t(x.reason.replace(/_/g, ' '))}: {x.note}</p>
            {x.offer && <pre className="json">{JSON.stringify(x.offer, null, 2)}</pre>}</div>)}
          {!d.proofs.length && !d.issues.length && <p className="muted">{t("Nothing yet.")}</p>}
        </section>
        {d.brief && <section className="card pad"><h2 style={{ fontSize: 16, marginBottom: 12 }}>{t("Booking brief")}</h2><pre className="json">{JSON.stringify(d.brief, null, 2)}</pre></section>}
      </div>}
      {tab === 'documents' && (!d.documents.length ? <p className="muted">{t("No documents yet.")}</p> : <div className="table-wrap card"><table className="table"><tbody>{d.documents.map(x => <tr key={x.id} onClick={() => (navigate(`/documents/${x.id}`))}>
        <td className="num">{x.number}</td><td>{DOC_TYPE[x.type]}</td><td className="r num">{money(x.total)}</td><td className="small num">{when(x.issued_at)}</td></tr>)}</tbody></table></div>)}
    </main>
  )
}

type Dispute = { id: string; ref: string; status: string; amount: number; dueAt: string | null; buyer: string; seller: string; outlet: string; label: string
  reason: string | null; note: string | null; offer: any; openedAt: string | null }

export function DisputesPage() {
  const { data, error } = useLoad<Dispute[]>('/admin/disputes')
  if (!data) return <Loading error={error} />
  return (
    <main>
      <PhotoBand img="/brand/print-wide.jpg" title={t("Disputes")} sub={t("Disputed deals wait for Nashr's decision. Open issues are still with the publisher until their deadline.")} />
      {!data.length ? <p className="muted empty">{t("No disputes or open issues.")}</p> : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Order")}</th><th>{t("Slot")}</th><th>{t("Buyer · publisher")}</th><th>{t("Issue")}</th><th>{t("Publisher's offer")}</th><th>{t("Deadline")}</th><th>{t("Status")}</th></tr></thead>
        <tbody>{data.map(r => <tr key={r.id} onClick={() => (navigate(`/deals/${r.id}`))}>
          <td className="num">{r.ref}</td><td><b>{r.outlet}</b> · {r.label}<div className="small muted num">{money(r.amount)}</div></td><td className="small">{r.buyer}<br />{r.seller}</td>
          <td className="small"><b>{r.reason && t(r.reason.replace(/_/g, ' '))}</b><div className="muted">{r.note}</div></td>
          <td className="small">{!r.offer ? '—' : r.offer.type === 'partial_refund' ? t('Refund {amount}', { amount: money(r.offer.amount) }) : t(r.offer.type.replace(/_/g, ' '))}</td>
          <td className="small num">{r.status === 'disputed' ? t('Nashr to decide') : when(r.dueAt)}</td><td><DealStatus s={r.status} /></td></tr>)}</tbody></table></div>}
    </main>
  )
}
