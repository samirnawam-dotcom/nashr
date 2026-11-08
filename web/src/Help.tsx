import { useEffect, useState } from 'react'
import { api } from './api'
import { dayLabel, time } from './format'
import { dubai } from './calendar/layout'
import { PhotoBand } from './PhotoBand'
import { t } from './i18n'

type Rules = { seller_window_hours: number; payment_window_hours: number; proof_due_working_days: number; review_working_days: number
  issue_response_hours: number; free_cancel_hours: number; cancel_fee_bp: number; max_creative_rounds: number }
type Req = { id: string; topic: string; dealId: string | null; dealRef: string | null; message: string; status: 'open' | 'answered' | 'closed'
  reply: string | null; createdAt: string; answeredAt: string | null }
type QA = [string, string]

export const TOPIC: Record<string, string> = { booking: 'A booking', payment: 'A payment or refund', listing: 'My listings', account: 'My account', other: 'Something else' }
const when = (iso: string) => `${dayLabel(dubai(iso).date, { day: 'numeric', month: 'short' })}, ${time(iso)}`

// Answers built from the live rules, so a changed setting changes the help too.
const buyerQA = (r: Rules): QA[] => [
  [t('How do I book a slot?'), t('Each slot is sold one of three ways. Auction: the highest bid when bidding closes wins. Fixed price: book it now and it comes off sale at once. Quick sale: offer a price and the publisher picks one. In every case the publisher confirms within {h} hours.', { h: r.seller_window_hours })],
  [t('What is auto-bid?'), t('Set the most you will pay. Nashr bids for you, one step above anyone else, up to that maximum. Other buyers never see it.')],
  [t('When do I pay?'), t('Only after the publisher accepts. You then have {h} hours to pay, or until the creative deadline if that comes sooner.', { h: r.payment_window_hours })],
  [t('Where does my money go?'), t('Nashr holds it. The publisher is paid only after you approve proof that the ad ran. If you do not answer within {d} working days, it is released.', { d: r.review_working_days })],
  [t('What if the ad did not run as booked?'), t('Report an issue from the booking while you review the proof. The publisher has {h} hours to fix it, offer a make-good or refund. If you cannot agree, Nashr decides.', { h: r.issue_response_hours })],
  [t('Can I cancel?'), t('Free within {h} hours of paying. After that the publisher keeps {pct}% of the price.', { h: r.free_cancel_hours, pct: r.cancel_fee_bp / 100 })],
  [t('Where are my receipts and tax invoices?'), t('Under Bookings, Receipts and invoices: a receipt from Nashr when you pay, then the publisher\'s tax invoice. Add your TRN and registered address under Company so they appear on them.')],
]
const sellerQA = (r: Rules): QA[] => [
  [t('How do bookings reach me?'), t('In your Inbox. Accept or decline each one within {h} hours, or switch on auto-accept for a placement.', { h: r.seller_window_hours })],
  [t('When am I paid?'), t('After the buyer approves proof, or {d} working days after you send it if they do not answer. Nashr\'s commission is deducted and the rest goes to your verified bank account.', { d: r.review_working_days })],
  [t('When is proof due?'), t('Within {d} working days after the ad runs. If it is missing, the buyer is refunded.', { d: r.proof_due_working_days })],
  [t('Can I ask for changes to the creative?'), t('Yes, up to {n} rounds, before the creative deadline.', { n: r.max_creative_rounds })],
  [t('Who issues the tax invoices?'), t('Nashr issues them in your name and TRN, or you upload your own; choose under Profile. Nashr\'s commission invoice comes to you. All of them are under Earnings, Receipts and invoices.')],
  [t('What if I cannot run a paid booking?'), t('Cancel it from the deal. The buyer is refunded in full, and the card costs come out of your next payout.')],
]
const accountQA = (): QA[] => [
  [t('I forgot my password'), t('Use "Forgot your password?" on the sign-in page. Nashr sends you a link that works for 24 hours.')],
  [t('How do I add a colleague?'), t('Ask Nashr below: everyone joins by invitation.')],
]

function Questions({ title, items }: { title: string; items: QA[] }) {
  return <section className="card pad section help-qa"><h2>{title}</h2>
    {items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
}

/** Help and Contact Nashr: answers first, then a way to ask, then what was asked before and Nashr's replies. */
export function HelpPage({ role }: { role: 'buyer' | 'seller' | 'guest' }) {
  const [rules, setRules] = useState<Rules | null>(null)
  useEffect(() => { api<Rules>('/help/rules').then(setRules, () => {}) }, [])
  return (
    <main className="narrow">
      <PhotoBand img="/brand/bookings-wide.jpg" title={t('Help')} sub={t('How Nashr works, and a direct line to the team.')} />
      {rules && <>
        {role !== 'seller' && <Questions title={role === 'guest' ? t('For advertisers') : t('Booking and paying')} items={buyerQA(rules)} />}
        {role !== 'buyer' && <Questions title={role === 'guest' ? t('For publishers') : t('Selling and getting paid')} items={sellerQA(rules)} />}
        <Questions title={t('Your account')} items={accountQA()} />
      </>}
      {role === 'guest' ? <section className="card pad section"><h2>{t('Contact Nashr')}</h2>
        <p>{t('Sign in to send a question to the team and follow the answer here.')} <a href="/sign-in">{t('Sign in')}</a> · <a href="/request-access">{t('Request access')}</a></p></section>
        : <Contact seller={role === 'seller'} />}
    </main>
  )
}

function Contact({ seller }: { seller: boolean }) {
  const q = new URLSearchParams(location.search)
  const [topic, setTopic] = useState(q.get('topic') ?? (q.get('deal') ? 'booking' : '')), [message, setMessage] = useState('')
  const [list, setList] = useState<Req[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false)
  const deal = q.get('deal')
  const load = () => api<Req[]>('/support').then(setList, () => setList([]))
  useEffect(() => { load() }, [])
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('/support', { method: 'POST', body: { topic, message: message.trim(), ...(deal ? { dealId: deal } : {}) } }); setMessage(''); setSent(true); load() }
    catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return <>
    <section className="card pad section form" id="contact">
      <h2>{t('Contact Nashr')}</h2>
      <p className="muted">{t('The team answers here and on your bell, usually within one working day.')}</p>
      <form className="form" onSubmit={send}>
        <div className="field"><label htmlFor="topic">{t('What is it about?')}</label>
          <select id="topic" value={topic} onChange={e => setTopic(e.target.value)} required>
            <option value="" disabled>{t('Choose')}</option>
            {Object.entries(TOPIC).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></div>
        {deal && <p className="small muted">{t('About the booking you came from. Nashr sees it with your question.')}</p>}
        <div className="field"><label htmlFor="msg">{t('Your question')}</label>
          <textarea id="msg" rows={5} maxLength={4000} value={message} onChange={e => { setMessage(e.target.value); setSent(false) }} required /></div>
        <div className="row-flex"><button className="btn primary" disabled={busy || !topic || message.trim().length < 10}>{t('Send to Nashr')}</button></div>
        {error && <p className="error" role="alert">{error}</p>}
        {sent && <p className="ok" role="status">{t('Sent. You will see the answer below and on your bell.')}</p>}
      </form>
    </section>
    {list && list.length > 0 && <section className="card pad section"><h2>{t('Your questions')}</h2>
      <ul className="support-list">{list.map(r => <li key={r.id}>
        <div className="row-flex"><b>{t(TOPIC[r.topic] ?? r.topic)}</b>{r.dealRef && r.dealId && <a className="small" href={seller ? `/deals/${r.dealId}` : `/bookings/${r.dealId}`}>{r.dealRef}</a>}<div className="spacer" />
          <span className={`pill-state ${r.status === 'open' ? 'is-outbid' : 'is-lead'}`}>{r.status === 'open' ? t('Waiting for Nashr') : r.status === 'answered' ? t('Answered') : t('Closed')}</span></div>
        <p className="small muted">{when(r.createdAt)}</p><p className="support-msg" dir="auto">{r.message}</p>
        {r.reply && <div className="support-reply"><span className="small muted">{t('Nashr replied')}{r.answeredAt ? `, ${when(r.answeredAt)}` : ''}</span><p dir="auto">{r.reply}</p></div>}
      </li>)}</ul></section>}
  </>
}
