import { useEffect, useState } from 'react'
import { api, upload } from '../api'
import { DOC_TYPE } from '../documents/Documents'
import { DealStatus, money, when } from './common'

type SDeal = { id: string; ref: string; status: string; label: string; startsAt: string; nextDeadlineAt: string | null; buyer: { company: string }
  brief: any; checks: { categoryAccepted: boolean; landingPageMissing: boolean; creativeToFollow: boolean } | null; belowReserve: boolean
  money: { bid: number; mediaVat: number; fee: number; feeVat: number; youReceive: number; commissionBp: number }
  otherBids: { id: string; label: string; company: string; amount: number }[] }
type Detail = { channel: string; creativeDueAt: string; slotId: string; slotStatus: string; invoiceMode: string; placeholder: boolean; rejectReasons: string[]
  proofChecklist: { key: string; label: string }[]; adHasRun: boolean
  timeline: { at: string; event: string; status: string; note: string | null }[]
  creatives: { version: number; status: string; reason: string | null; fileId: string; fileType: string; fileSize: number; uploadedAt: string }[]
  proof: { submittedAt: string; note: string | null; items: Record<string, string> } | null
  issue: { reason: string; note: string; offer: any; status: string; openedAt: string } | null
  prerun: { requestedAt: string; confirmedAt: string | null } | null
  documents: { id: string; type: string; number: string; total: number; currency: string; issuedAt: string }[] }

const FILTERS: [string, string, string[]][] = [['all', 'All', []], ['decide', 'To decide', ['awaiting_seller']], ['active', 'In progress', ['awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed']],
  ['done', 'Completed', ['released', 'paid_out']], ['closed', 'Closed', ['declined', 'lapsed', 'cancelled', 'refunded']]]

export function SellerDealsPage() {
  const [deals, setDeals] = useState<SDeal[] | null>(null), [error, setError] = useState(''), [f, setF] = useState('all')
  useEffect(() => { api<SDeal[]>('/seller/deals').then(setDeals, e => setError(e.message)) }, [])
  const set = FILTERS.find(x => x[0] === f)![2]
  const shown = (deals ?? []).filter(d => !set.length || set.includes(d.status))
  return (
    <main>
      <div className="page-h"><h1>Deals</h1></div>
      <div className="toolbar"><div className="seg" role="group" aria-label="Filter">{FILTERS.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div></div>
      {error && <p className="error">{error}</p>}
      {deals && !shown.length && <p className="muted empty">No deals here.</p>}
      {shown.length > 0 && <table className="table card"><thead><tr><th>Order</th><th>Slot</th><th>Buyer</th><th>Airs</th><th className="r">Bid</th><th className="r">You receive</th><th>Status</th></tr></thead>
        <tbody>{shown.map(d => <tr key={d.id} onClick={() => (location.hash = `#/deals/${d.id}`)}>
          <td className="num">{d.ref}</td><td>{d.label}</td><td>{d.buyer.company}</td><td className="num">{when(d.startsAt)}</td>
          <td className="r num">{money(d.money.bid)}</td><td className="r num">{money(d.money.youReceive)}</td><td><DealStatus s={d.status} /></td></tr>)}</tbody></table>}
    </main>
  )
}

const EVENT: Record<string, string> = { opened: 'Request received', accept: 'You accepted', decline: 'You declined', expire: 'Expired without a decision', supersede: 'Another request was accepted',
  pay: 'Buyer paid', lapse: 'Buyer did not pay in time', submit_proof: 'You sent proof', approve: 'Buyer approved', auto_release: 'Released automatically', report_issue: 'Buyer reported an issue',
  resolve: 'Corrected proof accepted', make_good: 'Make-good agreed', partial_refund: 'Partial refund agreed', escalate: 'Escalated to Nashr', release: 'Nashr released', refund: 'Refunded',
  paid_out: 'Paid to your bank', cancel_by_buyer: 'Buyer cancelled', cancel_by_seller: 'You cancelled', creative_missed: 'Released: creative not received', proof_missed: 'Refunded: proof not sent in time' }
const CREATIVE: Record<string, string> = { pending: 'Waiting for your review', approved: 'Approved', changes_requested: 'Changes requested', technical_issue: 'Technical problem', rejected: 'Rejected' }
const REJECT: Record<string, string> = { brief_mismatch: "Doesn't match the booking brief", content_standards: 'Breaks content standards', wrong_specs: 'Wrong specifications', other: 'Other (Nashr reviews it)' }
const ISSUE: Record<string, string> = { did_not_run: 'The ad did not run', wrong_time: 'Wrong time or date', wrong_position: 'Wrong position or page', creative_altered: 'The creative was altered', quality: 'Poor quality', other: 'Something else' }

export function SellerDealPage({ id }: { id: string }) {
  const [d, setD] = useState<SDeal | null>(null), [x, setX] = useState<Detail | null>(null)
  const [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [form, setForm] = useState<any>(null) // the one open form: decline, review, proof, offer, cancel, invoice
  const load = () => Promise.all([api<SDeal>(`/seller/deals/${id}`), api<Detail>(`/seller/deals/${id}/detail`)]).then(([a, b]) => { setD(a); setX(b) }, e => setError(e.message))
  useEffect(() => { load() }, [id])
  async function act(path: string, body: object, done: string) {
    setBusy(true); setError(''); setNote('')
    try { await api(path, { method: 'POST', body }); setForm(null); setNote(done); await load() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function withFile(file: File, f: (fileId: string) => Promise<void>) {
    setBusy(true); setError('')
    try { await f((await upload(file)).id) } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!d || !x) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  const latest = x.creatives[x.creatives.length - 1]
  const msg = <>{error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}</>
  return (
    <main className="narrow">
      <p className="small"><a href="#/deals">Deals</a> › Order {d.ref}</p>
      <h1>{d.label}</h1>
      <p className="muted">{when(d.startsAt)} · {d.buyer.company} · <DealStatus s={d.status} /></p>

      <div className="card pad">
        <dl className="sum num">
          <div><dt>Price</dt><dd>{money(d.money.bid)}</dd></div>
          <div><dt>Your VAT on the media</dt><dd>{money(d.money.mediaVat)}</dd></div>
          <div><dt>Nashr commission ({d.money.commissionBp / 100}%)</dt><dd>−{money(d.money.fee + d.money.feeVat)}</dd></div>
          <div className="total"><dt>You receive</dt><dd>{money(d.money.youReceive)}</dd></div>
        </dl>
        {d.status === 'awaiting_seller' && <>
          {d.belowReserve && <p className="warn">This is below your reserve price. You can still accept it.</p>}
          {d.nextDeadlineAt && <p className="small muted">Decide by {when(d.nextDeadlineAt)} or the request expires.</p>}
          {form?.k !== 'decline' ? <div className="row-flex">
            <button className="btn primary" disabled={busy} onClick={() => act(`/seller/deals/${d.id}/accept`, {}, 'Accepted. The buyer has been asked to pay.')}>Accept</button>
            <button className="btn" onClick={() => setForm({ k: 'decline', reason: '' })}>Decline</button></div>
          : <div className="form"><div className="field"><label htmlFor="dr">Reason (the buyer sees it)</label><textarea id="dr" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="row-flex"><button className="btn primary" disabled={busy || !form.reason.trim()} onClick={() => act(`/seller/deals/${d.id}/decline`, { reason: form.reason }, 'Declined.')}>Decline</button>
              <button className="btn" onClick={() => setForm(null)}>Back</button></div></div>}
        </>}
        {d.status === 'awaiting_payment' && <p className="muted">Waiting for the buyer to pay{d.nextDeadlineAt ? ` (by ${when(d.nextDeadlineAt)})` : ''}. They can send creative already.</p>}
        {x.slotStatus === 'awaiting_choice' && ['declined', 'lapsed'].includes(d.status) && <p className="warn">You can choose another bid for this slot. <a href={`#/slots/${x.slotId}`}>Choose the next bid</a></p>}
        {msg}
      </div>

      {d.brief && <section className="card pad section">
        <h2>Booking brief</h2>
        <dl className="facts">
          <div><dt>Advertiser</dt><dd>{d.brief.advertiser}</dd></div><div><dt>Industry</dt><dd>{d.brief.industry}</dd></div>
          <div><dt>The ad will say</dt><dd>{d.brief.message}</dd></div><div><dt>Language</dt><dd>{d.brief.language}</dd></div>
          {d.brief.landingUrl && <div><dt>Landing page</dt><dd>{d.brief.landingUrl}</dd></div>}
          {d.brief.notes && <div><dt>Notes</dt><dd>{d.brief.notes}</dd></div>}
        </dl>
        {d.checks && <ul className="checklist" style={{ marginTop: 12 }}>{([
          [d.checks.categoryAccepted, d.checks.categoryAccepted ? 'Industry is one of your sectors' : "Industry isn't in your sectors"],
          ...(d.checks.landingPageMissing ? [[false, 'No landing page link yet']] : []),
          ...(d.checks.creativeToFollow ? [[true, 'Creative to follow']] : []),
        ] as [boolean, string][]).map(([ok, label]) => <li key={label}><span className="tick" aria-hidden style={ok ? {} : { color: 'var(--amber)' }}>{ok ? '✓' : '!'}</span><span>{label}</span></li>)}</ul>}
        <p className="small muted">These checks are for your information. The decision is yours.</p>
      </section>}

      {(x.creatives.length > 0 || ['awaiting_payment', 'secured'].includes(d.status)) && <section className="card pad section">
        <h2>Creative</h2>
        <p className="small muted">Due {when(x.creativeDueAt)}. A technical problem with the file doesn't use one of the buyer's change rounds.</p>
        {!x.creatives.length && <p className="muted">Not received yet.</p>}
        {x.creatives.length > 0 && <table className="table"><tbody>{x.creatives.map(c => <tr key={c.version}>
          <td className="num">v{c.version}</td><td>{CREATIVE[c.status]}{c.reason && <div className="small muted">{REJECT[c.reason] ?? c.reason}</div>}</td>
          <td className="small muted">{c.fileType} · {Math.max(1, Math.round(c.fileSize / 1024))} KB</td><td className="r"><a className="small" href={`/api/files/${c.fileId}`}>Download</a></td></tr>)}</tbody></table>}
        {latest?.status === 'pending' && (form?.k !== 'review' ? <div className="row-flex">
          <button className="btn primary" disabled={busy} onClick={() => act(`/seller/deals/${d.id}/creative-review`, { decision: 'approve' }, 'Creative approved.')}>Approve</button>
          <button className="btn" onClick={() => setForm({ k: 'review', decision: 'changes', reason: '' })}>Ask for changes or reject</button></div>
          : <div className="form">
            <div className="field"><label htmlFor="rv">Decision</label><select id="rv" value={form.decision} onChange={e => setForm({ ...form, decision: e.target.value, reason: '' })}>
              <option value="changes">Ask for changes (uses a change round)</option><option value="technical">Technical problem with the file (free)</option><option value="reject">Reject</option></select></div>
            {form.decision === 'reject' ? <div className="field"><label htmlFor="rr">Reason</label><select id="rr" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
              <option value="">Choose…</option>{x.rejectReasons.map(r => <option key={r} value={r}>{REJECT[r]}</option>)}</select></div>
              : <div className="field"><label htmlFor="rn">What needs to change</label><textarea id="rn" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>}
            <div className="row-flex"><button className="btn primary" disabled={busy || (form.decision !== 'technical' && !form.reason)}
              onClick={() => act(`/seller/deals/${d.id}/creative-review`, { decision: form.decision, ...(form.reason ? { reason: form.reason } : {}) }, 'Sent to the buyer.')}>Send</button>
              <button className="btn" onClick={() => setForm(null)}>Back</button></div></div>)}
        {d.status === 'secured' && new Date(x.creativeDueAt) <= new Date() && !x.placeholder && !x.creatives.some(c => c.status === 'approved') && <div className="form">
          <p className="warn">The material deadline has passed without approved creative.</p>
          <div className="row-flex"><button className="btn" disabled={busy} onClick={() => act(`/seller/deals/${d.id}/creative-missed`, { choice: 'placeholder' }, 'You will run a placeholder.')}>Run a placeholder</button>
            <button className="btn" disabled={busy} onClick={() => act(`/seller/deals/${d.id}/creative-missed`, { choice: 'release' }, 'The booking is released to you.')}>Release the slot (you are paid)</button></div></div>}
      </section>}

      {x.prerun && !x.prerun.confirmedAt && d.status === 'secured' && <section className="card pad section">
        <h2>Pre-run check</h2><p>Confirm the slot is scheduled and you have the final creative.</p>
        <button className="btn primary" disabled={busy} onClick={() => act(`/seller/deals/${d.id}/prerun`, {}, 'Pre-run check confirmed.')}>Confirm</button></section>}

      {(d.status === 'secured' || x.proof) && <section className="card pad section">
        <h2>Proof the ad ran</h2>
        {x.proof ? <dl className="facts">{x.proofChecklist.map(i => <div key={i.key}><dt>{i.label}</dt><dd>{String(x.proof!.items[i.key] ?? '—').startsWith('files/')
          ? <a href={`/api/${x.proof!.items[i.key]}`}>Download</a> : String(x.proof!.items[i.key] ?? '—')}</dd></div>)}</dl>
        : !x.adHasRun ? <p className="muted">You can send proof once the ad has run. You'll need {x.proofChecklist.map(i => i.label).join(', ')}.</p>
        : <ProofForm items={x.proofChecklist} busy={busy} onUpload={withFile} onSend={(items, n) => act(`/seller/deals/${d.id}/proof`, { items, ...(n ? { note: n } : {}) }, 'Proof sent. The buyer has the review window to approve.')} />}
      </section>}

      {x.issue && <section className="card pad section">
        <h2>Issue: {ISSUE[x.issue.reason]}</h2><p>{x.issue.note}</p>
        {x.issue.status === 'open' && !x.issue.offer && (form?.k !== 'offer' ? <>
          <p className="small muted">Respond before the deadline{d.nextDeadlineAt ? ` (${when(d.nextDeadlineAt)})` : ''}, or it goes to Nashr to decide.</p>
          <button className="btn primary" onClick={() => setForm({ k: 'offer', type: 'partial_refund', amount: '', runAt: '' })}>Offer a fix</button></>
          : <div className="form">
            <div className="field"><label htmlFor="ot">Offer</label><select id="ot" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="partial_refund">Partial refund</option><option value="make_good">Make-good (run it again)</option></select></div>
            {form.type === 'partial_refund' ? <div className="field"><label htmlFor="oa">Refund to the buyer (AED, incl. VAT)</label><input id="oa" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              : <div className="field"><label htmlFor="om">New air date and time (Dubai)</label><input id="om" type="datetime-local" value={form.runAt} onChange={e => setForm({ ...form, runAt: e.target.value })} /></div>}
            <div className="row-flex"><button className="btn primary" disabled={busy} onClick={() => act(`/seller/deals/${d.id}/issues/offer`, form.type === 'partial_refund'
              ? { type: 'partial_refund', amount: Math.round(Number(form.amount) * 100) } : { type: 'make_good', runAt: new Date(form.runAt + ':00+04:00').toISOString() }, 'Offer sent to the buyer.')}>Send offer</button>
              <button className="btn" onClick={() => setForm(null)}>Back</button></div></div>)}
        {x.issue.offer && x.issue.status === 'open' && <p className="muted">Your offer is with the buyer.</p>}
        {x.issue.status === 'escalated' && <p className="muted">Nashr's team is deciding this one.</p>}
      </section>}

      {x.invoiceMode === 'upload' && ['secured', 'in_review', 'released', 'paid_out'].includes(d.status) && !x.documents.some(doc => doc.type === 'media_invoice') && <section className="card pad section">
        <h2>Your tax invoice</h2><p className="small muted">You chose to issue your own invoices. Upload it for the buyer; Nashr keeps it with the booking.</p>
        <div className="field"><label htmlFor="inv">Invoice number</label><input id="inv" value={form?.k === 'invoice' ? form.number : ''} onChange={e => setForm({ k: 'invoice', number: e.target.value })} /></div>
        <div className="field"><label htmlFor="invf">Invoice file (PDF)</label><input id="invf" type="file" accept="application/pdf" disabled={busy || !(form?.k === 'invoice' && form.number)}
          onChange={e => e.target.files?.[0] && withFile(e.target.files[0], fid => act(`/seller/deals/${d.id}/invoice`, { number: form.number, fileId: fid }, 'Invoice sent to the buyer.'))} /></div>
      </section>}

      {d.status === 'secured' && <section className="section">{form?.k !== 'cancel' ? <button className="btn" onClick={() => setForm({ k: 'cancel', reason: '' })}>Cancel this booking</button>
        : <div className="card pad form"><p className="warn">Cancelling refunds the buyer in full and the card costs are deducted from your next payout.</p>
          <div className="field"><label htmlFor="cr">Reason</label><textarea id="cr" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
          <div className="row-flex"><button className="btn primary" disabled={busy || !form.reason.trim()} onClick={() => act(`/seller/deals/${d.id}/cancel`, { reason: form.reason }, 'Booking cancelled.')}>Cancel booking</button>
            <button className="btn" onClick={() => setForm(null)}>Back</button></div></div>}</section>}

      {x.documents.length > 0 && <section className="card pad section"><h2>Documents</h2>
        <ul className="timeline">{x.documents.map(doc => <li key={doc.id}><span className="num small">{doc.number}</span><span><a href={`#/documents/${doc.id}`}>{DOC_TYPE[doc.type]}</a> · {money(doc.total, doc.currency)}</span></li>)}</ul></section>}

      <section className="card pad section"><h2>Timeline</h2>
        <ol className="timeline">{x.timeline.map((e, i) => <li key={i}><span className="small muted num">{when(e.at)}</span><span>{EVENT[e.event] ?? e.event}{e.note && <span className="muted"> · {e.note}</span>}</span></li>)}</ol></section>
      {msg}
    </main>
  )
}

/** One field per checklist item: a file, or a link/time typed in. */
function ProofForm({ items, busy, onUpload, onSend }: { items: { key: string; label: string }[]; busy: boolean
  onUpload: (f: File, then: (id: string) => Promise<void>) => void; onSend: (items: Record<string, string>, note: string) => void }) {
  const [v, setV] = useState<Record<string, string>>({}), [n, setN] = useState('')
  const text = (k: string) => /link|time/.test(k)
  return <div className="form">
    {items.map(i => <div className="field" key={i.key}><label htmlFor={`p-${i.key}`}>{i.label[0].toUpperCase() + i.label.slice(1)}</label>
      {text(i.key) ? <input id={`p-${i.key}`} value={v[i.key] ?? ''} placeholder={/link/.test(i.key) ? 'https://' : 'e.g. 07:16'} onChange={e => setV({ ...v, [i.key]: e.target.value })} />
        : <>{v[i.key] && <span className="small ok">Uploaded</span>}<input id={`p-${i.key}`} type="file" disabled={busy} onChange={e => e.target.files?.[0] && onUpload(e.target.files[0], async id => setV(x => ({ ...x, [i.key]: `files/${id}` })))} /></>}
    </div>)}
    <div className="field"><label htmlFor="pn">Note (optional)</label><input id="pn" value={n} onChange={e => setN(e.target.value)} /></div>
    <button className="btn primary" disabled={busy || items.some(i => !v[i.key])} onClick={() => onSend(v, n)}>Send proof</button>
  </div>
}
