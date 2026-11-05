import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'

type Deal = { id: string; ref: string; status: string; outlet: string; label: string; startsAt: string; currency: string; price: number; vat: number; total: number; nextDeadlineAt: string | null }

const STATUS: Record<string, [string, string]> = {
  awaiting_publisher: ['Awaiting publisher', 'soon'], accepted_pay_now: ['Accepted, pay now', 'soon'], payment_secured: ['Payment secured', 'lead'],
  proof_ready: ['Proof ready, review', 'soon'], issue_open: ['Issue reported', 'soon'], disputed: ['Disputed', 'outbid'], released: ['Released', 'lead'],
  complete: ['Complete', 'lead'], not_selected: ['Not selected', 'muted'], lapsed: ['Lapsed', 'outbid'], cancelled: ['Cancelled', 'muted'], refunded: ['Refunded', 'muted'],
}
const Status = ({ s }: { s: string }) => <span className={`dot ${STATUS[s]?.[1] ?? ''}`}>{STATUS[s]?.[0] ?? s}</span>
const when = (iso: string) => `${dayLabel(dubai(iso).date)} · ${time(iso)}`

export function BookingsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null), [error, setError] = useState('')
  useEffect(() => { api<Deal[]>('/deals').then(setDeals, e => setError(e.message)) }, [])
  return (
    <main>
      <h1>Bookings</h1>
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

export function BookingPage({ id }: { id: string }) {
  const [d, setD] = useState<Deal | null>(null), [card, setCard] = useState(CARDS[0][0])
  const [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const load = () => api<Deal>(`/deals/${id}`).then(setD, e => setError(e.message))
  useEffect(() => { load() }, [id])
  async function act(path: string, body?: object) {
    setBusy(true); setError(''); setNote('')
    try {
      const r = await api(path, { method: 'POST', body: body ?? {} })
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
        {d.status === 'proof_ready' && <button className="btn primary" disabled={busy} onClick={() => act(`/deals/${d.id}/approve`)}>Approve proof</button>}
        {d.status === 'payment_secured' && <button className="btn" disabled={busy} onClick={() => act(`/deals/${d.id}/cancel`)}>Cancel booking</button>}
        {error && <p className="error" role="alert">{error}</p>}
        {note && <p className="ok" role="status">{note}</p>}
      </div>
    </main>
  )
}
