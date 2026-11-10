import { navigate } from '../nav'
import { Resolution, type Dispute } from '../Resolution'
import { useEffect, useState } from 'react'
import { api, upload, type Client, type Rating } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import { DOC_TYPE } from '../documents/Documents'
import '../directory/directory.css'
import { PhotoBand } from '../PhotoBand'
import { StarInput, Stars } from '../Stars'
import { isAr, ltr, t } from '../i18n'
import { useNeedsTwoStep } from '../twoStep'
import { tm } from '../i18n-server'
import { Thread } from '../messages/Thread'
import { CardPay } from '../payments/CardPay'
import { art } from '../media'

type Deal = { dispute?: Dispute | null; id: string; ref: string; kind?: string; status: string; outlet: string; label: string; startsAt: string; currency: string; price: number; vat: number; total: number; nextDeadlineAt: string | null; reason: string | null; client?: string | null
  counter?: { price: number; note: string | null; at: string } | null }

const STATUS: Record<string, [string, string]> = {
  awaiting_publisher: ['Awaiting publisher', 'soon'], accepted_pay_now: ['Accepted, pay now', 'soon'], payment_secured: ['Payment secured', 'lead'],
  proof_ready: ['Proof ready, review', 'soon'], issue_open: ['Issue reported', 'soon'], disputed: ['Disputed', 'outbid'], released: ['Released', 'lead'],
  complete: ['Complete', 'lead'], not_selected: ['Not selected', 'muted'], lapsed: ['Lapsed', 'outbid'], cancelled: ['Cancelled', 'muted'], refunded: ['Refunded', 'muted'],
}
export const Status = ({ s }: { s: string }) => <span className={`dot ${STATUS[s]?.[1] ?? ''}`}>{t(STATUS[s]?.[0] ?? s)}</span>
const when = (iso: string) => `${dayLabel(dubai(iso).date)} · ${time(iso)}`

export function BookingsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null), [error, setError] = useState(''), [client, setClient] = useState('')
  useEffect(() => { api<Deal[]>('/deals').then(setDeals, e => setError(e.message)) }, [])
  const clients = [...new Set((deals ?? []).map(d => d.client).filter(Boolean))] as string[]
  const shown = (deals ?? []).filter(d => !client || d.client === client)
  return (
    <main>
      <PhotoBand img="/brand/bookings-wide.jpg" title={t("Bookings")} sub={t("Every booking from bid to proof, with your payment held until you approve that the ad ran.")}>
        <a className="btn" href="/documents">{t("Receipts and invoices")}</a>
      </PhotoBand>
      {error && <p className="error">{error}</p>}
      {deals && !deals.length && <p className="muted empty">{t("No bookings yet. Bid on a slot in the calendar, or send a buy-now request.")}</p>}
      {clients.length > 0 && <div className="toolbar" style={{ marginTop: 20 }}>
        <select className="btn" aria-label={t('Client')} value={client} onChange={e => setClient(e.target.value)}><option value="">{t('All clients')}</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}</select></div>}
      {deals && deals.length > 0 && <div className="table-wrap card"><table className="table">
        <thead><tr><th>{t("Order")}</th><th>{t("Slot")}</th>{clients.length > 0 && <th>{t('Client')}</th>}<th>{t("Airs")}</th><th className="r">{t("Total")}</th><th>{t("Status")}</th></tr></thead>
        <tbody>{shown.map(d => <tr key={d.id} onClick={() => (navigate(`/bookings/${d.id}`))}>
          <td className="num">{d.ref}</td><td><b>{d.outlet}</b> · {d.label}</td>{clients.length > 0 && <td className="small"><bdi>{d.client ?? '—'}</bdi></td>}<td className="num">{when(d.startsAt)}</td>
          <td className="r num">{money(d.total, d.currency)}</td><td><Status s={d.status} /></td></tr>)}</tbody>
      </table></div>}
    </main>
  )
}


type Detail = Deal & { channel: string; placement: string; creativeDueAt: string; rating: Rating | null; clientId?: string | null
  timeline: { at: string; event: string; status: string }[]
  creatives: { version: number; status: string; reason: string | null; fileId: string; fileType: string; uploadedAt: string }[]
  proof: { submittedAt: string; note: string | null; items: { key: string; label: string; value: unknown }[] } | null
  issue: { reason: string; note: string; offer: any; status: string; openedAt: string } | null
  prerun: { requestedAt: string; confirmedAt: string | null } | null
  documents: { id: string; type: string; number: string; total: number; currency: string; issuedAt: string }[] }

const EVENT: Record<string, string> = { opened: t('Request sent'), counter: t('Publisher offered another price'), counter_agreed: t('You agreed to the new price'), counter_refused: t('You kept your offer'), withdraw: t('You withdrew the request'), accept: t('Publisher accepted'), decline: t('Not selected'), expire: t('Publisher did not reply in time'),
  supersede: t('Slot went to another buyer'), pay: t('Payment secured'), lapse: t('Payment window passed'), submit_proof: t('Proof sent'), approve: t('You approved the proof'),
  auto_release: t('Released automatically after the review window'), report_issue: t('You reported an issue'), resolve: t('Corrected proof sent'), make_good: t('Make-good agreed'),
  partial_refund: t('Partial refund agreed'), escalate: t('Escalated to Nashr'), release: t('Nashr released the payment'), refund: t('Refunded'), paid_out: t('Publisher paid'),
  cancel_by_buyer: t('You cancelled'), cancel_by_seller: t('Publisher cancelled'), creative_missed: t('Creative deadline missed'), proof_missed: t('Proof not sent in time, refunded') }
const CREATIVE: Record<string, string> = { pending: t('With the publisher'), approved: t('Approved'), changes_requested: t('Changes requested'), technical_issue: t('Technical problem'), rejected: t('Rejected') }
const ISSUE_REASONS = [['did_not_run', t('The ad did not run')], ['wrong_time', t('Wrong time or date')], ['wrong_position', t('Wrong position or page')],
  ['creative_altered', t('The creative was altered')], ['quality', t('Poor quality')], ['other', t('Something else')]]
const full = (iso: string) => `${dayLabel(dubai(iso).date, { day: 'numeric', month: 'short' })} · ${time(iso)}`
const ProofValue = ({ v }: { v: unknown }) => typeof v === 'string' && v.startsWith('files/') ? <a href={`/api/${v}`}>{t("Download")}</a>
  : typeof v === 'string' && /^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer noopener">{v}</a> : <span>{String(v ?? '—')}</span>

/** Where the booking is, in five steps (from the Stitch v3 design). A booking that stopped shows where and why above. */
const STEPS: [string, string[], string[]][] = [
  ['Requested', ['opened'], ['awaiting_publisher']], ['Accepted', ['accept'], ['accepted_pay_now']], ['Paid', ['pay'], ['payment_secured']],
  ['Aired', ['submit_proof'], ['proof_ready', 'issue_open', 'disputed']],
  ['Released', ['approve', 'auto_release', 'release', 'partial_refund'], ['released', 'complete']],
]
const STOPPED = ['not_selected', 'lapsed', 'cancelled', 'refunded']
function Tracker({ status, timeline }: { status: string; timeline: { at: string; event: string }[] }) {
  const reached = (i: number) => timeline.some(e => STEPS[i][1].includes(e.event))
  const current = STEPS.findIndex(st => st[2].includes(status))
  return <ol className={`tracker ${STOPPED.includes(status) ? 'stopped' : ''}`} aria-label={t('Booking progress')}>{STEPS.map(([label, events], i) => {
    const at = timeline.find(e => events.includes(e.event))?.at, done = reached(i) || (current >= 0 && i < current)
    return <li key={label} className={done ? 'done' : i === current ? 'now' : ''} aria-current={i === current ? 'step' : undefined}>
      <span className="tracker-dot" aria-hidden>{done ? '✓' : i + 1}</span><b>{t(label)}</b>{at && <span className="small muted num">{full(at)}</span>}</li> })}</ol>
}

export function BookingPage({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<null | { reason: string; note: string }>(null), [withdrawing, setWithdrawing] = useState(false)
  const [terms, setTerms] = useState<null | { allowed: boolean; reason?: string; free?: boolean; paid?: number; publisherKeeps?: number; processing?: number; refund?: number }>(null)
  const load = () => api<Detail>(`/deals/${id}`).then(setD, e => setError(e.message))
  useEffect(() => { load() }, [id])
  async function sendCreative(file: File) {
    setBusy(true); setError(''); setNote('')
    try {
      const f = await upload(file)
      const c = await api(`/deals/${id}/creative`, { method: 'POST', body: { fileId: f.id } })
      if (c.status === 'technical_issue') setError(c.reason); else setNote(t('Version {n} sent to the publisher.', { n: c.version }))
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function act(path: string, body?: object, done?: string) {
    setBusy(true); setError(''); setNote('')
    try {
      const r = await api(path, { method: 'POST', body: body ?? {} })
      if (done) setNote(done)
      if (r?.status === 'failed') setError(`${tm(r.failure)} ${t('Update your card and try again.')}`)
      if (r?.status === 'requires_action') setNote(t('Your bank needs you to confirm this payment.'))
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const needsTwoStep = useNeedsTwoStep(d?.status === 'accepted_pay_now')
  if (!d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const order = d.documents.find(x => x.type === 'order')
  return (
    <main className="booking">
      <p className="small"><a href="/bookings">{t(t("Bookings"))}</a> {isAr ? '‹' : '›'} {t('Order {ref}', { ref: d.ref })}</p>
      <div className="page-title"><div><h1>{d.outlet}, {d.label}</h1><p className="muted">{when(d.startsAt)} · <a className="small" href={`/help?deal=${d.id}#contact`}>{t('Get help with this booking')}</a></p></div><Status s={d.status} /></div>
      <ClientLine id={d.id} clientId={d.clientId ?? null} onSaved={load} />
      <Tracker status={d.status} timeline={d.timeline} />
      <div className="booking-cols"><div className="booking-main">
      {['released', 'complete'].includes(d.status) && <RateBooking id={d.id} outlet={d.outlet} rating={d.rating} onSaved={load} />}
      {d.prerun && !d.prerun.confirmedAt && d.status === 'payment_secured' && <section className="card pad section">
        <h2>{t("Pre-run check")}</h2><p>{t("Your ad airs soon. Confirm the publisher has the final version of your creative.")}</p>
        <button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/prerun`, {}, t("Thanks. The publisher has been told."))}>{t("Confirm final version")}</button>
      </section>}

      {d.proof && <section className="card pad section">
        <h2>{t("Proof the ad ran")}</h2>
        <dl className="facts">{d.proof.items.map(i => <div key={i.key}><dt>{t(i.label[0].toUpperCase() + i.label.slice(1).replace(/^The /, ''))}</dt><dd><ProofValue v={i.value} /></dd></div>)}</dl>
        {d.proof.note && <p className="small muted">{tm(d.proof.note)}</p>}
        {d.status === 'proof_ready' && <>
          <p className="small muted">{d.nextDeadlineAt ? t('Approve to release the payment to the publisher. If you do nothing, it is released automatically on {date}.', { date: full(d.nextDeadlineAt) }) : t('Approve to release the payment to the publisher.')}</p>
          {!issue ? <div className="row-flex">
            <button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/approve`)}>{t("Approve proof")}</button>
            <button className="btn" onClick={() => setIssue({ reason: '', note: '' })}>{t("Report an issue")}</button></div>
          : <div className="form">
            <div className="field"><label htmlFor="ir">{t("What went wrong")}</label><select id="ir" value={issue.reason} onChange={e => setIssue({ ...issue, reason: e.target.value })}>
              <option value="">{t('Choose…')}</option>{ISSUE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="in">{t("Details")}</label><textarea id="in" rows={3} maxLength={2000} value={issue.note} onChange={e => setIssue({ ...issue, note: e.target.value })} /></div>
            <p className="small muted">{t("The publisher can send corrected proof, offer a make-good or a partial refund. Changing your mind or results below expectations are not issues.")}</p>
            <div className="row-flex"><button className="btn primary" disabled={busy || !issue.reason || !issue.note.trim()}
              onClick={async () => { await act(`/deals/${d.id}/issues`, issue, t('Issue reported. The publisher has 48 hours to respond.')); setIssue(null) }}>{t("Report issue")}</button>
              <button className="btn" onClick={() => setIssue(null)}>{t("Back")}</button></div>
          </div>}
        </>}
      </section>}

      <Resolution side="buyer" status={d.status} issue={d.issue as any} dispute={d.dispute ?? null} held={d.total} currency={d.currency} deadline={d.nextDeadlineAt}
        statementPath={`/deals/${d.id}/statements`} onChange={load} />
      {d.issue && <section className="card pad section">
        <h2>{t('Issue: {reason}', { reason: ISSUE_REASONS.find(([v]) => v === d.issue!.reason)?.[1] ?? '' })}</h2>
        <p>{d.issue.note}</p>
        {d.issue.status === 'escalated' && <p className="muted">{t("Nashr's team is looking at this and will decide the outcome.")}</p>}
        {d.issue.offer && d.issue.status === 'open' && <>
          <p><b>{t('The publisher offers:')} </b>{d.issue.offer.type === 'make_good' ? t('a make-good on {date}', { date: full(d.issue.offer.runAt) })
            : d.issue.offer.type === 'partial_refund' ? t('a partial refund of {amount}', { amount: money(d.issue.offer.amount, d.currency) }) : t('corrected proof (shown above)')}</p>
          <div className="row-flex"><button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/issues/respond`, { accept: true }, t('Offer accepted.'))}>{t("Accept offer")}</button>
            <button className="btn" disabled={busy} onClick={() => act(`/deals/${d.id}/issues/respond`, { accept: false }, t('Sent to Nashr to decide.'))}>{t("Decline, ask Nashr to decide")}</button></div>
        </>}
        {!d.issue.offer && d.issue.status === 'open' && <p className="muted">{t("Waiting for the publisher's response.")}</p>}
        {d.issue.status === 'resolved' && d.issue.offer && <p className="ok">{d.issue.offer.type === 'partial_refund' ? t('Settled: {amount} refunded to your card, VAT included.', { amount: money(d.issue.offer.amount, d.currency) })
          : d.issue.offer.type === 'make_good' ? t('Settled: the ad runs again on {date}.', { date: full(d.issue.offer.runAt) }) : t('Settled: corrected proof accepted.')}</p>}
      </section>}

      {(['accepted_pay_now', 'payment_secured'].includes(d.status) || d.creatives.length > 0) && <section className="card pad section">
        <h2>{t("Creative")}</h2>
        <p className="small muted">{t("Due {date} (Dubai time). Technical fixes don't count as a change round.", { date: full(d.creativeDueAt) })}</p>
        {d.creatives.length > 0 && <div className="table-wrap"><table className="table"><tbody>{d.creatives.map(c => <tr key={c.version}>
          <td className="num">{ltr(`v${c.version}`)}</td><td>{CREATIVE[c.status] ?? c.status}{c.reason && <div className="small muted">{tm(c.reason)}</div>}</td>
          <td className="small num">{full(c.uploadedAt)}</td><td className="r"><a className="small" href={`/api/files/${c.fileId}`}>{t("Download")}</a></td></tr>)}</tbody></table></div>}
        {['accepted_pay_now', 'payment_secured'].includes(d.status) && new Date(d.creativeDueAt) > new Date()
          && !d.creatives.some(c => c.status === 'approved' || c.status === 'pending') && <div className="field">
          <label htmlFor="file">{d.creatives.length ? t('Upload a new version') : t('Upload your creative')}</label>
          <input id="file" type="file" disabled={busy} onChange={e => e.target.files?.[0] && sendCreative(e.target.files[0])} /></div>}
      </section>}



      {!['not_selected'].includes(d.status) && <div className="section"><Thread dealId={d.id} other={d.outlet} compact side="buyer" /></div>}

      <section className="card pad section">
        <h2>{t("Timeline")}</h2>
        <ol className="timeline">{d.timeline.map((e, i) => <li key={i}><span className="small muted num">{full(e.at)}</span><span>{EVENT[e.event] ?? e.event.replace(/_/g, ' ')}</span></li>)}</ol>
      </section>
      </div>
      <aside className="booking-side">
      <div className="card pad summary">
        <dl className="sum num">
          <div><dt>{t("Price")}</dt><dd>{money(d.price, d.currency)}</dd></div>
          <div><dt>{t("VAT (charged by the publisher)")}</dt><dd>{money(d.vat, d.currency)}</dd></div>
          <div className="total"><dt>{t("Total")}</dt><dd>{money(d.total, d.currency)}</dd></div>
        </dl>
        {d.status === 'accepted_pay_now' && <>
          <p>{d.nextDeadlineAt ? t('The publisher accepted. Please pay by {date}.', { date: when(d.nextDeadlineAt) }) : t('The publisher accepted. Please pay.')}</p>
          <p className="small muted">{t('The money is held securely and released to the publisher only after you approve proof that the ad ran. You get a payment receipt from Nashr and a tax invoice from the publisher.')} {t('By paying you agree to the')} <a href="/terms">{t('terms')}</a> {t('and the')} <a href="/refunds">{t('refund and cancellation policy')}</a>.</p>
          {needsTwoStep ? <p className="warn small">{t('Before paying, turn on two-step sign-in to protect your account.')} <a href="/account">{t('Turn it on')}</a></p>
          : <CardPay dealId={d.id} label={t('Pay {amount}', { amount: money(d.total, d.currency) })} onDone={load} />}
        </>}
        {d.status === 'awaiting_publisher' && d.counter && <div className="counter-box">
          <p><b>{t('The publisher offered {amount} instead of {was}.', { amount: money(d.counter.price, d.currency), was: money(d.price, d.currency) })}</b></p>
          {d.counter.note && <p className="small">“{d.counter.note}”</p>}
          <p className="small muted">{t('Agree and the booking is accepted at that price; you pay next. Keep your offer and the publisher decides on it.')}</p>
          <div className="row-flex"><button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/counter`, { agree: true }, t('Agreed. The booking is accepted.'))}>{t('Agree to {amount}', { amount: money(d.counter.price, d.currency) })}</button>
            <button className="btn" disabled={busy} onClick={() => act(`/deals/${d.id}/counter`, { agree: false }, t('You kept your offer.'))}>{t('Keep my offer')}</button></div>
        </div>}
        {d.status === 'awaiting_publisher' && !d.counter && <p className="muted">{t("Waiting for the publisher's decision. You'll be asked to pay once they accept.")}</p>}
        {d.status === 'awaiting_publisher' && d.kind === 'buy_now' && (!withdrawing
          ? <button className="btn" disabled={busy} onClick={() => setWithdrawing(true)}>{t('Withdraw request…')}</button>
          : <div className="form confirm-box"><p>{t('Withdraw your buy-now request? The slot stays on sale, and you can bid or ask again.')}</p>
            <div className="row-flex"><button className="btn primary" disabled={busy} onClick={async () => { await act(`/deals/${d.id}/withdraw`, {}, t('Request withdrawn.')); setWithdrawing(false) }}>{t('Withdraw request')}</button>
              <button className="btn" onClick={() => setWithdrawing(false)}>{t('Keep the request')}</button></div></div>)}
        {order && <a className="btn order-link" href={`/documents/${order.id}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" /></svg>
          {t('View order {ref}', { ref: d.ref })}</a>}
        {d.reason && ['not_selected', 'lapsed', 'cancelled', 'refunded'].includes(d.status) && <p className="muted">{t('Reason: {reason}', { reason: tm(d.reason) })}</p>}
        {d.status === 'payment_secured' && !terms && <button className="btn" disabled={busy} onClick={() => api(`/deals/${d.id}/cancel-preview`).then(setTerms, e => setError(e.message))}>{t("Cancel booking…")}</button>}
        {terms && d.status === 'payment_secured' && (!terms.allowed ? <p className="warn">{tm(terms.reason)}</p> : <div className="form">
          <p><b>{t('If you cancel now')}</b>{terms.free ? ` ${t('(inside the free cancellation window)')}` : ''}:</p>
          <dl className="sum num">
            <div><dt>{t("You paid")}</dt><dd>{money(terms.paid!, d.currency)}</dd></div>
            {terms.publisherKeeps! > 0 && <div><dt>{t("Kept by the publisher (cancellation fee)")}</dt><dd>−{money(terms.publisherKeeps!, d.currency)}</dd></div>}
            <div><dt>{t("Card processing cost of the refund")}</dt><dd>−{money(terms.processing!, d.currency)}</dd></div>
            <div className="total"><dt>{t("Refunded to your card")}</dt><dd>{money(terms.refund!, d.currency)}</dd></div>
          </dl>
          <div className="row-flex"><button className="btn primary" disabled={busy} onClick={async () => { await act(`/deals/${d.id}/cancel`); setTerms(null) }}>{t("Confirm cancellation")}</button>
            <button className="btn" onClick={() => setTerms(null)}>{t("Keep the booking")}</button></div></div>)}
        {error && <p className="error" role="alert">{error}</p>}
        {note && <p className="ok" role="status">{note}</p>}
      </div>

      {d.documents.length > 0 && <section className="card pad section">
        <h2>{t("Order, receipts and invoices")}</h2>
        <ul className="timeline">{d.documents.map(x => <li key={x.id}><span className="num small">{x.number}</span>
          <span><a href={`/documents/${x.id}`}>{DOC_TYPE[x.type]}</a> · <span className="num">{money(x.total, x.currency)}</span></span></li>)}</ul>
      </section>}
      </aside></div>
    </main>
  )
}

/** After the booking is complete, the buyer rates the outlet: stars and an optional comment, changeable later. */
function RateBooking({ id, outlet, rating, onSaved }: { id: string; outlet: string; rating: Rating | null; onSaved: () => void }) {
  const [edit, setEdit] = useState(!rating), [score, setScore] = useState(rating?.score ?? 0), [comment, setComment] = useState(rating?.comment ?? '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api(`/deals/${id}/rating`, { method: 'POST', body: { score, ...(comment.trim() ? { comment: comment.trim() } : {}) } }); setEdit(false); onSaved() }
    catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  if (rating && !edit) return <section className="card pad section rate">
    <h2>{t("Your rating of {outlet}", { outlet })}</h2>
    <Stars value={rating.score} size={18} />
    {rating.comment && <p className="rate-comment">“{rating.comment}”</p>}
    {rating.hidden && <p className="small muted">{t("Nashr has hidden this rating from the outlet page.")}</p>}
    <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={() => setEdit(true)}>{t("Change rating")}</button>
  </section>
  return <form className="card pad section rate" onSubmit={save}>
    <h2>{t("How was {outlet}?", { outlet })}</h2>
    <p className="small muted">{t("Your rating helps other buyers choose. It shows on the outlet page as a verified booking, without your company's name.")}</p>
    <StarInput value={score} onChange={setScore} label={t("Your rating")} />
    <div className="field"><label htmlFor="rate-c">{t("Comment (optional)")}</label>
      <textarea id="rate-c" rows={3} maxLength={500} value={comment} onChange={e => setComment(e.target.value)} placeholder={t("Did it air as booked? How was working with them?")} /></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="row-flex"><button className="btn primary" disabled={busy || !score}>{rating ? t("Save rating") : t("Submit rating")}</button>
      {rating && <button type="button" className="btn" onClick={() => setEdit(false)}>{t("Cancel")}</button>}</div>
  </form>
}

/** Which client a booking is for (agencies). Set it here if it was not chosen when booking; documents issued from now on name it. */
function ClientLine({ id, clientId, onSaved }: { id: string; clientId: string | null; onSaved: () => void }) {
  const [clients, setClients] = useState<Client[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { api<Client[]>('/clients').then(setClients, () => setClients([])) }, [])
  if (!clients?.length) return null
  const usable = clients.filter(c => c.status === 'active' || c.id === clientId)
  async function pick(v: string) {
    setBusy(true); setError('')
    try { await api(`/deals/${id}/client`, { method: 'PUT', body: { clientId: v || null } }); onSaved() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="row-flex small client-line"><label htmlFor="bk-client">{t('For client')}</label>
    <select id="bk-client" className="btn" value={clientId ?? ''} disabled={busy} onChange={e => pick(e.target.value)}><option value="">{t('No client')}</option>
      {usable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    {clientId && <a href={`/clients/${clientId}`}>{t('Open client')}</a>}
    {error && <span className="error" role="alert">{error}</span>}</div>
}
