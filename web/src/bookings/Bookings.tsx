import { useEffect, useState } from 'react'
import { api, upload } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import { DOC_TYPE } from '../documents/Documents'
import '../directory/directory.css'

type Deal = { id: string; ref: string; status: string; outlet: string; label: string; startsAt: string; currency: string; price: number; vat: number; total: number; nextDeadlineAt: string | null; reason: string | null }

const STATUS: Record<string, [string, string]> = {
  awaiting_publisher: ['Awaiting publisher', 'soon'], accepted_pay_now: ['Accepted, pay now', 'soon'], payment_secured: ['Payment secured', 'lead'],
  proof_ready: ['Proof ready, review', 'soon'], issue_open: ['Issue reported', 'soon'], disputed: ['Disputed', 'outbid'], released: ['Released', 'lead'],
  complete: ['Complete', 'lead'], not_selected: ['Not selected', 'muted'], lapsed: ['Lapsed', 'outbid'], cancelled: ['Cancelled', 'muted'], refunded: ['Refunded', 'muted'],
}
export const Status = ({ s }: { s: string }) => <span className={`dot ${STATUS[s]?.[1] ?? ''}`}>{STATUS[s]?.[0] ?? s}</span>
const when = (iso: string) => `${dayLabel(dubai(iso).date)} · ${time(iso)}`

export function BookingsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null), [error, setError] = useState('')
  useEffect(() => { api<Deal[]>('/deals').then(setDeals, e => setError(e.message)) }, [])
  return (
    <main>
      <div className="page-h"><h1>Bookings</h1><div className="spacer" /><a className="small" href="#/documents">Receipts and invoices</a></div>
      {error && <p className="error">{error}</p>}
      {deals && !deals.length && <p className="muted empty">No bookings yet. Bid on a slot in the calendar, or send a buy-now request.</p>}
      {deals && deals.length > 0 && <table className="table card">
        <thead><tr><th>Order</th><th>Slot</th><th>Airs</th><th className="r">Total</th><th>Status</th></tr></thead>
        <tbody>{deals.map(d => <tr key={d.id} onClick={() => (location.hash = `#/bookings/${d.id}`)}>
          <td className="num">{d.ref}</td><td><b>{d.outlet}</b> · {d.label}</td><td className="num">{when(d.startsAt)}</td>
          <td className="r num">{money(d.total, d.currency)}</td><td><Status s={d.status} /></td></tr>)}</tbody>
      </table>}
    </main>
  )
}

// Test cards (brief section 11) while payments run against the test provider.
const CARDS = [['pm_card_4242', 'Visa •••• 4242'], ['pm_card_3155', 'Visa •••• 3155 (bank asks to confirm)'], ['pm_card_0002', 'Visa •••• 0002 (declined)']]

type Detail = Deal & { channel: string; placement: string; creativeDueAt: string
  timeline: { at: string; event: string; status: string }[]
  creatives: { version: number; status: string; reason: string | null; fileId: string; fileType: string; uploadedAt: string }[]
  proof: { submittedAt: string; note: string | null; items: { key: string; label: string; value: unknown }[] } | null
  issue: { reason: string; note: string; offer: any; status: string; openedAt: string } | null
  prerun: { requestedAt: string; confirmedAt: string | null } | null
  documents: { id: string; type: string; number: string; total: number; currency: string; issuedAt: string }[] }

const EVENT: Record<string, string> = { opened: 'Request sent', accept: 'Publisher accepted', decline: 'Not selected', expire: 'Publisher did not reply in time',
  supersede: 'Slot went to another buyer', pay: 'Payment secured', lapse: 'Payment window passed', submit_proof: 'Proof sent', approve: 'You approved the proof',
  auto_release: 'Released automatically after the review window', report_issue: 'You reported an issue', resolve: 'Corrected proof sent', make_good: 'Make-good agreed',
  partial_refund: 'Partial refund agreed', escalate: 'Escalated to Nashr', release: 'Nashr released the payment', refund: 'Refunded', paid_out: 'Publisher paid',
  cancel_by_buyer: 'You cancelled', cancel_by_seller: 'Publisher cancelled', creative_missed: 'Creative deadline missed', proof_missed: 'Proof not sent in time, refunded' }
const CREATIVE: Record<string, string> = { pending: 'With the publisher', approved: 'Approved', changes_requested: 'Changes requested', technical_issue: 'Technical problem', rejected: 'Rejected' }
const ISSUE_REASONS = [['did_not_run', 'The ad did not run'], ['wrong_time', 'Wrong time or date'], ['wrong_position', 'Wrong position or page'],
  ['creative_altered', 'The creative was altered'], ['quality', 'Poor quality'], ['other', 'Something else']]
const full = (iso: string) => `${dayLabel(dubai(iso).date, { day: 'numeric', month: 'short' })} · ${time(iso)}`
const ProofValue = ({ v }: { v: unknown }) => typeof v === 'string' && v.startsWith('files/') ? <a href={`/api/${v}`}>Download</a>
  : typeof v === 'string' && /^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer noopener">{v}</a> : <span>{String(v ?? '—')}</span>

export function BookingPage({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null), [card, setCard] = useState(CARDS[0][0])
  const [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<null | { reason: string; note: string }>(null)
  const [terms, setTerms] = useState<null | { allowed: boolean; reason?: string; free?: boolean; paid?: number; publisherKeeps?: number; processing?: number; refund?: number }>(null)
  const load = () => api<Detail>(`/deals/${id}`).then(setD, e => setError(e.message))
  useEffect(() => { load() }, [id])
  async function sendCreative(file: File) {
    setBusy(true); setError(''); setNote('')
    try {
      const f = await upload(file)
      const c = await api(`/deals/${id}/creative`, { method: 'POST', body: { fileId: f.id } })
      if (c.status === 'technical_issue') setError(c.reason); else setNote(`Version ${c.version} sent to the publisher.`)
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function act(path: string, body?: object, done?: string) {
    setBusy(true); setError(''); setNote('')
    try {
      const r = await api(path, { method: 'POST', body: body ?? {} })
      if (done) setNote(done)
      if (r?.status === 'failed') setError(`${r.failure} Update your card and try again.`)
      if (r?.status === 'requires_action') setNote('Your bank needs you to confirm this payment.')
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!d) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  return (
    <main className="narrow">
      <p className="small"><a href="#/bookings">Bookings</a> › Order {d.ref}</p>
      <h1>{d.outlet} · {d.label}</h1>
      <p className="muted">{when(d.startsAt)} · <Status s={d.status} /></p>
      <div className="card pad">
        <dl className="sum num">
          <div><dt>Price</dt><dd>{money(d.price, d.currency)}</dd></div>
          <div><dt>VAT (charged by the publisher)</dt><dd>{money(d.vat, d.currency)}</dd></div>
          <div className="total"><dt>Total</dt><dd>{money(d.total, d.currency)}</dd></div>
        </dl>
        {d.status === 'accepted_pay_now' && <>
          <p>The publisher accepted. Please pay{d.nextDeadlineAt ? ` by ${when(d.nextDeadlineAt)}` : ''}.</p>
          <div className="field"><label htmlFor="card">Card</label><select id="card" value={card} onChange={e => setCard(e.target.value)}>{CARDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <p className="small muted">The money is held securely and released to the publisher only after you approve proof that the ad ran. You get a payment receipt from Nashr and a tax invoice from the publisher.</p>
          <button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/pay`, { paymentMethod: card })}>Pay {money(d.total, d.currency)}</button>
        </>}
        {d.status === 'awaiting_publisher' && <p className="muted">Waiting for the publisher's decision. You'll be asked to pay once they accept.</p>}
        {d.reason && ['not_selected', 'lapsed', 'cancelled', 'refunded'].includes(d.status) && <p className="muted">Reason: {d.reason}</p>}
        {d.status === 'payment_secured' && !terms && <button className="btn" disabled={busy} onClick={() => api(`/deals/${d.id}/cancel-preview`).then(setTerms, e => setError(e.message))}>Cancel booking…</button>}
        {terms && d.status === 'payment_secured' && (!terms.allowed ? <p className="warn">{terms.reason}</p> : <div className="form">
          <p><b>If you cancel now</b>{terms.free ? ' (inside the free cancellation window)' : ''}:</p>
          <dl className="sum num">
            <div><dt>You paid</dt><dd>{money(terms.paid!, d.currency)}</dd></div>
            {terms.publisherKeeps! > 0 && <div><dt>Kept by the publisher (cancellation fee)</dt><dd>−{money(terms.publisherKeeps!, d.currency)}</dd></div>}
            <div><dt>Card processing cost of the refund</dt><dd>−{money(terms.processing!, d.currency)}</dd></div>
            <div className="total"><dt>Refunded to your card</dt><dd>{money(terms.refund!, d.currency)}</dd></div>
          </dl>
          <div className="row-flex"><button className="btn primary" disabled={busy} onClick={async () => { await act(`/deals/${d.id}/cancel`); setTerms(null) }}>Confirm cancellation</button>
            <button className="btn" onClick={() => setTerms(null)}>Keep the booking</button></div></div>)}
        {error && <p className="error" role="alert">{error}</p>}
        {note && <p className="ok" role="status">{note}</p>}
      </div>

      {d.prerun && !d.prerun.confirmedAt && d.status === 'payment_secured' && <section className="card pad section">
        <h2>Pre-run check</h2><p>Your ad airs soon. Confirm the publisher has the final version of your creative.</p>
        <button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/prerun`, {}, 'Thanks. The publisher has been told.')}>Confirm final version</button>
      </section>}

      {d.proof && <section className="card pad section">
        <h2>Proof the ad ran</h2>
        <dl className="facts">{d.proof.items.map(i => <div key={i.key}><dt>{i.label[0].toUpperCase() + i.label.slice(1).replace(/^The /, '')}</dt><dd><ProofValue v={i.value} /></dd></div>)}</dl>
        {d.proof.note && <p className="small muted">{d.proof.note}</p>}
        {d.status === 'proof_ready' && <>
          <p className="small muted">Approve to release the payment to the publisher{d.nextDeadlineAt ? `. If you do nothing, it is released automatically on ${full(d.nextDeadlineAt)}` : ''}.</p>
          {!issue ? <div className="row-flex">
            <button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/approve`)}>Approve proof</button>
            <button className="btn" onClick={() => setIssue({ reason: '', note: '' })}>Report an issue</button></div>
          : <div className="form">
            <div className="field"><label htmlFor="ir">What went wrong</label><select id="ir" value={issue.reason} onChange={e => setIssue({ ...issue, reason: e.target.value })}>
              <option value="">Choose…</option>{ISSUE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="in">Details</label><textarea id="in" rows={3} maxLength={2000} value={issue.note} onChange={e => setIssue({ ...issue, note: e.target.value })} /></div>
            <p className="small muted">The publisher can send corrected proof, offer a make-good or a partial refund. Changing your mind or results below expectations are not issues.</p>
            <div className="row-flex"><button className="btn primary" disabled={busy || !issue.reason || !issue.note.trim()}
              onClick={async () => { await act(`/deals/${d.id}/issues`, issue, 'Issue reported. The publisher has 48 hours to respond.'); setIssue(null) }}>Report issue</button>
              <button className="btn" onClick={() => setIssue(null)}>Back</button></div>
          </div>}
        </>}
      </section>}

      {d.issue && <section className="card pad section">
        <h2>Issue: {ISSUE_REASONS.find(([v]) => v === d.issue!.reason)?.[1]}</h2>
        <p>{d.issue.note}</p>
        {d.issue.status === 'escalated' && <p className="muted">Nashr's team is looking at this and will decide the outcome.</p>}
        {d.issue.offer && d.issue.status === 'open' && <>
          <p><b>The publisher offers: </b>{d.issue.offer.type === 'make_good' ? `a make-good on ${full(d.issue.offer.runAt)}`
            : d.issue.offer.type === 'partial_refund' ? `a partial refund of ${money(d.issue.offer.amount, d.currency)}` : 'corrected proof (shown above)'}</p>
          <div className="row-flex"><button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/issues/respond`, { accept: true }, 'Offer accepted.')}>Accept offer</button>
            <button className="btn" disabled={busy} onClick={() => act(`/deals/${d.id}/issues/respond`, { accept: false }, 'Sent to Nashr to decide.')}>Decline, ask Nashr to decide</button></div>
        </>}
        {!d.issue.offer && d.issue.status === 'open' && <p className="muted">Waiting for the publisher's response.</p>}
        {d.issue.status === 'resolved' && d.issue.offer && <p className="ok">Settled: {d.issue.offer.type === 'partial_refund' ? `${money(d.issue.offer.amount, d.currency)} refunded to your card, VAT included`
          : d.issue.offer.type === 'make_good' ? `the ad runs again on ${full(d.issue.offer.runAt)}` : 'corrected proof accepted'}.</p>}
      </section>}

      {(['accepted_pay_now', 'payment_secured'].includes(d.status) || d.creatives.length > 0) && <section className="card pad section">
        <h2>Creative</h2>
        <p className="small muted">Due {full(d.creativeDueAt)} (Dubai time). Technical fixes don't count as a change round.</p>
        {d.creatives.length > 0 && <table className="table"><tbody>{d.creatives.map(c => <tr key={c.version}>
          <td className="num">v{c.version}</td><td>{CREATIVE[c.status] ?? c.status}{c.reason && <div className="small muted">{c.reason}</div>}</td>
          <td className="small num">{full(c.uploadedAt)}</td><td className="r"><a className="small" href={`/api/files/${c.fileId}`}>Download</a></td></tr>)}</tbody></table>}
        {['accepted_pay_now', 'payment_secured'].includes(d.status) && new Date(d.creativeDueAt) > new Date()
          && !d.creatives.some(c => c.status === 'approved' || c.status === 'pending') && <div className="field">
          <label htmlFor="file">{d.creatives.length ? 'Upload a new version' : 'Upload your creative'}</label>
          <input id="file" type="file" disabled={busy} onChange={e => e.target.files?.[0] && sendCreative(e.target.files[0])} /></div>}
      </section>}

      {d.documents.length > 0 && <section className="card pad section">
        <h2>Receipts and invoices</h2>
        <ul className="timeline">{d.documents.map(x => <li key={x.id}><span className="num small">{x.number}</span>
          <span><a href={`#/documents/${x.id}`}>{DOC_TYPE[x.type]}</a> · <span className="num">{money(x.total, x.currency)}</span></span></li>)}</ul>
      </section>}

      <section className="card pad section">
        <h2>Timeline</h2>
        <ol className="timeline">{d.timeline.map((e, i) => <li key={i}><span className="small muted num">{full(e.at)}</span><span>{EVENT[e.event] ?? e.event.replace(/_/g, ' ')}</span></li>)}</ol>
      </section>
    </main>
  )
}
