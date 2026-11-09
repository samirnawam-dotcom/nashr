import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { DEAL_STATUS, DealStatus, Loading, date, money, useAct, useLoad, when } from './common'
import { DOC_TYPE } from '../documents/Documents'
import { PhotoBand } from '../PhotoBand'
import { Stars } from '../Stars'
import { ltr, t } from '../i18n'
import { tm } from '../i18n-server'
import { api } from '../api'
import { Bubbles, type Msg } from '../messages/Thread'

type Row = { id: string; ref: string; status: string; kind: string; amount: number; currency: string; commission_bp: number | null; next_deadline_at: string | null
  created_at: string; buyer: string; seller: string; outlet: string; channel: string; label: string; starts_at: string }
type Page = { total: number; value: number; items: Row[] }
const PAGE = 50

/** Every deal: filters and paging run on the server, and the same filters download as CSV (the whole result, not just the page). */
export function AdminDealsPage() {
  const p0 = new URLSearchParams(location.search)
  const [f, setF] = useState({ status: p0.get('status') ?? '', kind: '', channel: '', from: '', to: '', q: '' }), [q, setQ] = useState(''), [offset, setOffset] = useState(0)
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const { data, error } = useLoad<Page>(`/admin/deals?${qs}&limit=${PAGE}&offset=${offset}`, [qs, offset])
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setOffset(0) }
  const active = Object.values(f).filter(Boolean).length
  return (
    <main>
      <PhotoBand img="/brand/bookings-wide.jpg" title={t("Deals")} sub={t("Every booking on the platform, from request to release.")} />
      <form className="toolbar admin-filters" onSubmit={e => { e.preventDefault(); set('q', q.trim()) }}>
        <input className="search" type="search" aria-label={t("Search")} placeholder={t("Order number, buyer, publisher or outlet")} value={q} onChange={e => setQ(e.target.value)} />
        <select className="btn" aria-label={t("Status")} value={f.status} onChange={e => set('status', e.target.value)}><option value="">{t("All statuses")}</option>
          {Object.entries(DEAL_STATUS).map(([k, [l]]) => <option key={k} value={k}>{t(l)}</option>)}</select>
        <select className="btn" aria-label={t("Channel")} value={f.channel} onChange={e => set('channel', e.target.value)}><option value="">{t('All channels')}</option>
          {['radio', 'tv', 'print', 'digital', 'podcast'].map(c => <option key={c} value={c}>{t(c === 'tv' ? 'TV' : c[0].toUpperCase() + c.slice(1))}</option>)}</select>
        <select className="btn" aria-label={t("Sold as")} value={f.kind} onChange={e => set('kind', e.target.value)}><option value="">{t('Any way of selling')}</option>
          {[['auction', 'Auction'], ['buy_now', 'Buy now'], ['fixed', 'Fixed price'], ['quick_sale', 'Quick sale'], ['choice', 'Next bid chosen']].map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
        <label className="small muted" htmlFor="df">{t('Airs from')}</label><input id="df" className="search" type="date" value={f.from} onChange={e => set('from', e.target.value)} />
        <label className="small muted" htmlFor="dt">{t('to')}</label><input id="dt" className="search" type="date" value={f.to} onChange={e => set('to', e.target.value)} />
        <button className="btn">{t("Search")}</button>
        {active > 0 && <button type="button" className="btn" onClick={() => { setQ(''); setF({ status: '', kind: '', channel: '', from: '', to: '', q: '' }); setOffset(0) }}>{t('Clear all ({n})', { n: active })}</button>}
        <div className="spacer" /><a className="btn" href={`/api/admin/deals?${qs}&format=csv`}>{t('Download CSV')}</a></form>
      {!data ? <Loading error={error} /> : !data.items.length ? <p className="muted empty">{t("No deals match.")}</p> : <>
        <p className="small muted">{t('{n} deals, {value} in total (excl. VAT)', { n: data.total.toLocaleString('en-US'), value: money(data.value) })}</p>
        <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Order")}</th><th>{t("Slot")}</th><th>{t("Buyer")}</th><th>{t("Publisher")}</th><th>{t("Airs")}</th><th className="r">{t("Price")}</th><th>{t("Next deadline")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{data.items.map(d => <tr key={d.id} onClick={() => (navigate(`/deals/${d.id}`))}>
            <td className="num">{d.ref}</td><td><b>{d.outlet}</b> · {d.label}</td><td>{d.buyer}</td><td>{d.seller}</td><td className="small num">{date(d.starts_at)}</td>
            <td className="r num">{money(d.amount, d.currency)}</td><td className="small num">{when(d.next_deadline_at)}</td><td><DealStatus s={d.status} /></td></tr>)}</tbody></table></div>
        {data.total > PAGE && <nav className="row-flex section" aria-label={t('Pages')}>
          <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t('Previous')}</button>
          <span className="small muted">{t('Page {n} of {total}', { n: offset / PAGE + 1, total: Math.ceil(data.total / PAGE) })}</span>
          <button className="btn" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>{t('Next')}</button></nav>}
      </>}
    </main>
  )
}

type File = { dispute?: { decideBy: string | null; statements: { side: string; text: string; by: string; at: string; files: string[] }[] } | null; chargeback?: string | null; rating: { id: string; score: number; comment: string | null; hidden: boolean } | null; id: string; ref: string; status: string; kind: string; outlet: string; channel: string; label: string; startsAt: string; creativeDueAt: string
  buyer: { id: string; name: string }; seller: { id: string; name: string }; brief: any; nextDeadlineAt: string | null; extraCreativeRounds: number; ratesFrozen: boolean
  money: { price: number; mediaVat: number; buyerPays: number; commissionBp: number | null; fee: number; feeVat: number; payout: number; held: number }
  events: { at: string; event: string; from_status: string | null; to_status: string; actor: string; note: string | null }[]
  ledger: { at: string; debit: string; credit: string; amount: number; currency: string; ref: string | null }[]
  moneyOps: { ref: string; kind: string; amount: number; currency: string; status: string; failure: string | null; created_at: string }[]
  creatives: { version: number; status: string; reason: string | null; fileId: string; uploaded_at: string }[]
  proofs: { items: Record<string, string>; note: string | null; submitted_at: string }[]
  issues: { reason: string; note: string; evidence: unknown; offer: any; status: string; opened_at: string; closed_at: string | null }[]
  slotId: string; proofChecklist: { key: string; label: string }[]
  documents: { id: string; type: string; number: string; total: number; issued_at: string }[] }

/** A deal status as the timeline shows it. */
const st = (s: string) => t(DEAL_STATUS[s]?.[0] ?? s.replace(/_/g, ' '))

const OUTCOMES = [['release', t("Release to the publisher")], ['refund', t("Refund the buyer in full")], ['partial_refund', t("Partial refund")], ['make_good', t("Make-good (run it again)")]]

export function AdminDealPage({ id }: { id: string }) {
  const { data: d, error, load } = useLoad<File>(`/admin/deals/${id}`)
  const { act, busy, msg } = useAct(load)
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  useEffect(() => { api<Msg[]>(`/admin/deals/${id}/messages`).then(setMsgs, () => {}) }, [id])
  const [tab, setTab] = useState('timeline')
  if (!d) return <Loading error={error} />
  // What Nashr actually earned, from the ledger (a partial refund lowers it below the full-price commission).
  const earned = d.ledger.reduce((n, l) => n + (l.credit === 'nashr_revenue' ? l.amount : l.debit === 'nashr_revenue' ? -l.amount : 0), 0)
  const pendingRefunds = d.moneyOps.filter(m => m.kind === 'refund' && m.status === 'pending').reduce((n, m) => n + m.amount, 0)
  const flagged = msgs?.filter(m => m.flagged).length ?? 0
  const tabs = [['timeline', t("Timeline")], ['money', t("Money")], ['fulfilment', t("Creative and proof")], ['messages', msgs ? `${t('Messages')} (${msgs.length})` : t('Messages')], ['documents', t("Documents")]]
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
      {d.status === 'disputed' && <CaseFile d={d} busy={busy} act={act} />}
      {STEP_IN[d.status] && <StepIn d={d} busy={busy} act={act} />}
      <p className="small"><a href={`/slots/${d.slotId}`}>{t('Open the slot and every bid on it')}</a></p>
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
          <td className="small">{e.from_status ? `${st(e.from_status)} ← ` : ''}{st(e.to_status)}</td><td className="mono">{e.actor}</td><td className="small">{tm(e.note)}</td></tr>)}</tbody></table></div>}
      {tab === 'money' && <>
        <div className="table-wrap card"><table className="table"><thead><tr><th>{t("When")}</th><th>{t("From (credit)")}</th><th>{t("To (debit)")}</th><th className="r">{t("Amount")}</th><th>{t("Reference")}</th></tr></thead>
          <tbody>{d.ledger.map((l, i) => <tr key={i}><td className="small num">{when(l.at)}</td><td className="mono">{l.credit}</td><td className="mono">{l.debit}</td>
            <td className="r num">{money(l.amount, l.currency)}</td><td className="small">{tm(l.ref)}</td></tr>)}</tbody></table></div>
        <h2 className="sec-h">{t("Payments, refunds and transfers")}</h2>
        <div className="table-wrap card"><table className="table"><tbody>{d.moneyOps.map(m => <tr key={m.ref}><td className="num">{m.ref}</td><td>{t(m.kind)}</td><td className="r num">{money(m.amount, m.currency)}</td>
          <td className={m.status === 'failed' ? 'outbid' : ''}>{t(m.status)}{m.failure && <div className="small">{tm(m.failure)}</div>}</td><td className="small num">{when(m.created_at)}</td></tr>)}</tbody></table></div>
      </>}
      {tab === 'fulfilment' && <div className="grid2">
        <section className="card pad"><h2 style={{ fontSize: 16, marginBottom: 12 }}>{t("Creative")}</h2>
          <p className="small muted">{t('Due {when} · extra change rounds allowed: {n}', { when: when(d.creativeDueAt), n: d.extraCreativeRounds })}</p>
          <ul className="timeline">{d.creatives.map(c => <li key={c.version}><a href={`/api/files/${c.fileId}`}>v{c.version}</a><span>{t(c.status.replace(/_/g, ' '))}{c.reason ? ` · ${t(c.reason.replace(/_/g, ' '))}` : ''}</span></li>)}</ul>
          {['awaiting_payment', 'secured'].includes(d.status) && <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={() => act('POST', `/admin/deals/${d.id}/extra-round`, {}, t("One more change round allowed."))}>{t("Allow one more change round")}</button>}
        </section>
        <section className="card pad"><h2 style={{ fontSize: 16, marginBottom: 12 }}>{t("Proof")}</h2>
          {!d.proofs.length ? <p className="muted">{t("Nothing yet.")}</p> : d.proofs.map((p, i) => <div key={i} style={{ marginBottom: 12 }}>
            <div className="small muted">{t('Proof sent {when}', { when: when(p.submitted_at) })}</div><ProofItems items={p.items} checklist={d.proofChecklist} />{p.note && <p className="small">{p.note}</p>}</div>)}
        </section>
        {d.brief && <section className="card pad"><h2 style={{ fontSize: 16, marginBottom: 12 }}>{t("Booking brief")}</h2><Brief b={d.brief} /></section>}
      </div>}
      {tab === 'messages' && <section className="card pad">
        {flagged > 0 && <p className="warn">{t('{n} flagged: wording that suggests moving the conversation off Nashr. Emails and phone numbers are always refused.', { n: flagged })}</p>}
        {!msgs?.length ? <p className="muted">{t('No messages on this booking.')}</p> : <div className="thread-list staff-thread"><Bubbles messages={msgs} staff /></div>}
      </section>}
      {tab === 'documents' && (!d.documents.length ? <p className="muted">{t("No documents yet.")}</p> : <div className="table-wrap card"><table className="table"><tbody>{d.documents.map(x => <tr key={x.id} onClick={() => (navigate(`/documents/${x.id}`))}>
        <td className="num">{x.number}</td><td>{DOC_TYPE[x.type]}</td><td className="r num">{money(x.total)}</td><td className="small num">{when(x.issued_at)}</td></tr>)}</tbody></table></div>)}
    </main>
  )
}

type Dispute = { id: string; ref: string; status: string; amount: number; dueAt: string | null; buyer: string; seller: string; outlet: string; label: string
  reason: string | null; note: string | null; offer: any; openedAt: string | null; decideBy: string | null; chargeback: string | null; statements: number }

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
          <td className="small num">{r.status !== 'disputed' ? when(r.dueAt) : r.chargeback === 'open' ? t('With the bank (chargeback)')
            : r.decideBy ? <>{t('Decide by {when}', { when: when(r.decideBy) })}{new Date(r.decideBy) < new Date() && <b className="outbid"> · {t('overdue')}</b>}</> : t('Nashr to decide')}
            {r.statements > 0 && <div className="muted">{t('{n} statements', { n: r.statements })}</div>}</td><td><DealStatus s={r.status} /></td></tr>)}</tbody></table></div>}
    </main>
  )
}

/** Proof as the publisher sent it: each checklist item by name, files as download links, nothing as raw data. */
function ProofItems({ items, checklist }: { items: Record<string, unknown>; checklist: { key: string; label: string }[] }) {
  const label = (k: string) => { const l = checklist.find(c => c.key === k)?.label ?? k.replace(/_/g, ' '); const x = l.replace(/^the /, ''); return t(x[0].toUpperCase() + x.slice(1)) }
  return <dl className="facts">{Object.entries(items ?? {}).map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd>{String(v).startsWith('files/')
    ? <a href={`/api/${String(v)}`}>{t('Download')}</a> : /^https?:\/\//.test(String(v)) ? <a href={String(v)} target="_blank" rel="noopener noreferrer nofollow">{String(v)}</a> : String(v)}</dd></div>)}</dl>
}

/** The booking brief as fields, not data. */
function Brief({ b }: { b: any }) {
  const rows: [string, unknown][] = [[t('Advertiser'), b.advertiser], [t('Industry'), b.industry && t(b.industry)], [t('The ad will say'), b.message], [t('Language'), b.language],
    [t('Landing page'), b.landingUrl], [t('Required disclaimer'), b.disclaimer], [t('Notes'), b.notes]]
  return <dl className="facts">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd dir="auto">{String(v)}</dd></div>)}</dl>
}

/** Files the buyer attached to an issue (any shape: a list, or named fields). */
function Evidence({ e }: { e: unknown }) {
  if (!e) return <p className="small muted">{t('No files attached.')}</p>
  const list = Array.isArray(e) ? e.map((v, i) => [String(i + 1), v] as const) : typeof e === 'object' ? Object.entries(e as Record<string, unknown>) : [['1', e] as const]
  return <ul className="timeline">{list.map(([k, v]) => <li key={k}>{String(v).startsWith('files/') ? <a href={`/api/${String(v)}`}>{t('File {n}', { n: k })}</a> : <span>{String(v)}</span>}</li>)}</ul>
}

/**
 * A dispute as a case file: what the buyer says on one side, what the publisher sent on the other, the offer between them,
 * the brief they agreed to, and a decision with a written reason both sides receive.
 */
function CaseFile({ d, busy, act }: { d: File; busy: boolean; act: (m: string, p: string, b: object, done: string) => void }) {
  const [outcome, setOutcome] = useState(''), [amount, setAmount] = useState(''), [reason, setReason] = useState('')
  const issue = d.issues.at(-1), proof = d.proofs.at(-1)
  return <section className="card pad section case">
    <h2>{t("Decide this dispute")}</h2>
    <div className="case-sides">
      <div className="case-side buyer"><span className="small muted">{t('The buyer, {name}', { name: d.buyer.name })}</span>
        {issue ? <><p><b>{t(issue.reason.replace(/_/g, ' '))}</b></p><p dir="auto">{issue.note}</p><span className="small muted">{t('Reported {when}', { when: when(issue.opened_at) })}</span>
          <Evidence e={issue.evidence} /></> : <p className="muted">{t('No issue on record (a chargeback or a direct escalation).')}</p>}</div>
      <div className="case-side seller"><span className="small muted">{t('The publisher, {name}', { name: d.seller.name })}</span>
        {proof ? <><span className="small muted">{t('Proof sent {when}', { when: when(proof.submitted_at) })}</span><ProofItems items={proof.items} checklist={d.proofChecklist} /></> : <p className="muted">{t('No proof sent.')}</p>}
        {issue?.offer && <p className="case-offer">{issue.offer.type === 'partial_refund' ? t('Offered a refund of {amount}', { amount: money(issue.offer.amount) })
          : issue.offer.type === 'make_good' ? t('Offered to run it again on {when}', { when: when(issue.offer.runAt) }) : t('Sent corrected proof')} · <span className="muted">{t('the buyer turned it down')}</span></p>}</div>
    </div>
    {d.chargeback === 'open' && <p className="warn">{t("The buyer's bank is deciding a chargeback on this payment. Refund and release wait for its decision.")}</p>}
    {d.dispute?.decideBy && <p className="small">{t('Decide by {when}', { when: when(d.dispute.decideBy) })}{new Date(d.dispute.decideBy) < new Date() && <b className="outbid"> · {t('overdue')}</b>}</p>}
    {!!d.dispute?.statements.length && <><h3>{t("Each side's case")}</h3><ul className="statements">{d.dispute.statements.map((x, i) => <li key={i} className={x.side === 'buyer' ? '' : 'mine'}>
      <span className="small muted">{x.side === 'buyer' ? t('The buyer') : t('The publisher')} · {x.by} · {when(x.at)}</span><p dir="auto">{x.text}</p>
      {x.files.length > 0 && <p className="small">{x.files.map((f, n) => <a key={f} href={`/api/files/${f}`}>{t('File {n}', { n: n + 1 })}</a>)}</p>}</li>)}</ul></>}
    {d.brief && <details><summary>{t('The brief both sides agreed to')}</summary><Brief b={d.brief} /></details>}
    <div className="form">
      <div className="field"><label htmlFor="out">{t("Outcome")}</label><select id="out" value={outcome} onChange={e => setOutcome(e.target.value)}><option value="">{t("Choose…")}</option>
        {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div>
      {outcome === 'partial_refund' && <div className="field"><label htmlFor="amt">{t("Refund to the buyer (AED, incl. VAT)")}</label><input id="amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>}
      <div className="field"><label htmlFor="why">{t('Reason (both sides receive it)')}</label><textarea id="why" rows={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <p className="small muted">{t("Refunds at the publisher's fault: the card costs are deducted from their next payout. Both sides are told. The decision is final, except that within 10 working days either side can point to a clear mistake of fact and Nashr looks again.")}</p>
      <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || !outcome || reason.trim().length < 5 || (outcome === 'partial_refund' && !(Number(amount) > 0))}
        onClick={() => confirm(t('Apply this outcome? Money moves at once.')) && act('POST', `/admin/deals/${d.id}/dispute`, { outcome, reason: reason.trim(), ...(outcome === 'partial_refund' ? { amount: Math.round(Number(amount) * 100) } : {}) }, t("Decision applied."))}>{t("Apply decision")}</button>
    </div>
  </section>
}

// What Nashr can do on a live deal outside a dispute, by its status.
const STEP_IN: Record<string, string[]> = { awaiting_seller: ['cancel'], awaiting_payment: ['cancel'], secured: ['refund', 'partial_refund', 'release'],
  in_review: ['refund', 'partial_refund', 'release'], issue_open: ['refund', 'partial_refund', 'release'] }
const ACTION_LABEL: Record<string, string> = { cancel: 'Cancel it (nothing has been paid)', refund: 'Refund the buyer in full', partial_refund: 'Refund part, release the rest', release: 'Release to the publisher' }

/** Step in on a live deal: always with a written reason both sides see; on a refund, choose who bears the card cost. */
function StepIn({ d, busy, act }: { d: File; busy: boolean; act: (m: string, p: string, b: object, done: string) => void }) {
  const [open, setOpen] = useState(false), [action, setAction] = useState(''), [reason, setReason] = useState(''), [amount, setAmount] = useState(''), [cost, setCost] = useState('nashr')
  if (!open) return <p className="section"><button className="btn" onClick={() => setOpen(true)}>{t('Step in on this deal')}</button></p>
  const refunds = action === 'refund' || action === 'partial_refund'
  return <section className="card pad section form step-in">
    <h2>{t('Step in on this deal')}</h2>
    <p className="small muted">{t('For what the normal flow cannot fix: a publisher off air, a mistake, a request from both sides. Every step is on the record.')}</p>
    <div className="field"><label htmlFor="si-a">{t('What to do')}</label><select id="si-a" value={action} onChange={e => setAction(e.target.value)}><option value="">{t('Choose…')}</option>
      {STEP_IN[d.status].map(a => <option key={a} value={a}>{t(ACTION_LABEL[a])}</option>)}</select></div>
    {action === 'partial_refund' && <div className="field"><label htmlFor="si-m">{t("Refund to the buyer (AED, incl. VAT)")}</label><input id="si-m" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>}
    {refunds && <div className="field"><label htmlFor="si-c">{t('Who bears the card cost')}</label><select id="si-c" value={cost} onChange={e => setCost(e.target.value)}>
      <option value="nashr">{t('Nashr')}</option><option value="seller">{t("The publisher (from their next payout)")}</option><option value="buyer">{t('The buyer (kept from the refund)')}</option></select></div>}
    <div className="field"><label htmlFor="si-r">{t('Reason (both sides receive it)')}</label><textarea id="si-r" rows={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></div>
    <div className="row-flex"><button className="btn primary" disabled={busy || !action || reason.trim().length < 5 || (action === 'partial_refund' && !(Number(amount) > 0))}
      onClick={() => confirm(t('Apply this now? Money moves at once and both sides are told.')) && act('POST', `/admin/deals/${d.id}/intervene`,
        { action, reason: reason.trim(), ...(refunds ? { cost } : {}), ...(action === 'partial_refund' ? { amount: Math.round(Number(amount) * 100) } : {}) }, t('Done. Both sides have been told.'))}>{t('Apply')}</button>
      <button className="btn" onClick={() => setOpen(false)}>{t('Cancel')}</button></div>
  </section>
}

type SlotFile = { id: string; outlet: string; company: string; channel: string; placement: string; label: string; startsAt: string; closesAt: string; saleType: string; status: string
  startingPrice: number; reservePrice: number | null; topAmount: number | null; topMax: number | null
  bids: { id: string; kind: string; amount: number; max: number | null; status: string; at: string; buyer: string }[]; deals: { id: string; ref: string; status: string; amount: number }[] }

/** One slot with every bid on it (buyers named, for Nashr only): void a live bid with a reason, and the auction works itself out again. */
export function AdminSlotPage({ id }: { id: string }) {
  const { data: s, error, load } = useLoad<SlotFile>(`/admin/slots/${id}`)
  const { act, busy, msg } = useAct(load)
  const [voiding, setVoiding] = useState(''), [reason, setReason] = useState('')
  if (!s) return <Loading error={error} />
  return <main className="narrow wide">
    <p className="small"><a href="/calendar">{t('Calendar')}</a> › {s.outlet}</p>
    <h1>{s.outlet} · {s.label}</h1>
    <p className="muted">{s.company} · {s.placement} · {when(s.startsAt)} · {t(s.saleType === 'auction' ? 'Auction' : s.saleType === 'fixed' ? 'Fixed price' : 'Quick sale')} · {s.status === 'open' ? t('Open') : st(s.status)}</p>
    {msg}
    <dl className="kpis">
      <div className="card"><dt>{t('Starting price')}</dt><dd className="num">{money(s.startingPrice)}</dd></div>
      <div className="card"><dt>{t('Top bid')}</dt><dd className="num">{s.topAmount ? money(s.topAmount) : '—'}</dd>{s.topMax && s.topMax > (s.topAmount ?? 0) ? <span className="small muted">{t('auto-bid up to {max}', { max: money(s.topMax) })}</span> : null}</div>
      <div className="card"><dt>{t('Reserve')}</dt><dd className="num">{s.reservePrice ? money(s.reservePrice) : '—'}</dd></div>
      <div className="card"><dt>{t('Bidding closes')}</dt><dd className="num small">{when(s.closesAt)}</dd></div>
    </dl>
    <section className="card pad section"><h2>{t('Bids and requests')}</h2>
      {!s.bids.length ? <p className="muted">{t('None yet.')}</p> : <div className="table-wrap"><table className="table"><thead><tr><th>{t('Buyer')}</th><th>{t('Type')}</th><th className="r">{t('Amount')}</th><th className="r">{t('Maximum')}</th><th>{t('Status')}</th><th>{t('When')}</th><th /></tr></thead>
        <tbody>{s.bids.map(b => <tr key={b.id}><td>{b.buyer}</td><td className="small">{t(b.kind === 'auto' ? 'Auto-bid' : b.kind === 'buy_now' ? 'Buy now' : b.kind === 'interest' ? 'Interest' : b.kind === 'book' ? 'Booking' : 'Bid')}</td>
          <td className="r num">{money(b.amount)}</td><td className="r num small">{b.max && b.max > b.amount ? money(b.max) : ''}</td><td className="small">{t(b.status.replace('_', ' '))}</td><td className="small num">{when(b.at)}</td>
          <td className="r">{s.status === 'open' && s.saleType === 'auction' && ['active', 'outbid'].includes(b.status) && ['bid', 'auto'].includes(b.kind) && (voiding === b.id
            ? <div className="form" style={{ minWidth: 240 }}><label className="visually-hidden" htmlFor={`vr-${b.id}`}>{t('Reason the buyer will see')}</label>
                <input id={`vr-${b.id}`} className="search" placeholder={t('Reason the buyer will see')} value={reason} onChange={e => setReason(e.target.value)} />
                <div className="row-flex"><button className="btn primary" disabled={busy || reason.trim().length < 5} onClick={() => act('POST', `/admin/bids/${b.id}/void`, { reason: reason.trim() }, t('Bid voided. The auction has been worked out again.'))}>{t('Void bid')}</button>
                  <button className="btn" onClick={() => setVoiding('')}>{t('Cancel')}</button></div></div>
            : <button className="btn" onClick={() => { setVoiding(b.id); setReason('') }}>{t('Void')}</button>)}</td></tr>)}</tbody></table></div>}
      <p className="small muted">{t("Voiding removes all of that buyer's bids on this slot. The highest remaining maximum leads, one step above the next.")}</p></section>
    {s.deals.length > 0 && <section className="card pad section"><h2>{t('Bookings')}</h2><ul className="timeline">{s.deals.map(x => <li key={x.id}><a href={`/deals/${x.id}`} className="num">{x.ref}</a><span><DealStatus s={x.status} /> · {money(x.amount)}</span></li>)}</ul></section>}
  </main>
}
