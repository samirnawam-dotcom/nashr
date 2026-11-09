import { useState } from 'react'
import { api } from '../api'
import { t } from '../i18n'
import { money } from './common'

export type Counter = { amount: number; note: string | null; at: string } | null

/** The publisher's three answers to a request (owner's brief): accept, offer another price, or decline with a reason. */
export function Decide({ dealId, price, counter, onDone }: { dealId: string; price: number; counter: Counter; onDone: (said: string) => void }) {
  const [k, setK] = useState<'' | 'counter' | 'decline'>(''), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function post(path: string, body: object, said: string) {
    setBusy(true); setError('')
    try { await api(`/seller/deals/${dealId}/${path}`, { method: 'POST', body }); setK(''); onDone(said) } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const fils = Math.round(Number(amount) * 100)
  return <div className="decide">
    {counter && <p className="counter-box"><span>{t('You offered {amount}. Waiting for the buyer to agree or keep their offer of {was}.', { amount: money(counter.amount), was: money(price) })}</span>
      <span className="small muted">{t('You can still accept their offer, decline, or offer another price.')}</span></p>}
    {k === '' && <div className="row-flex">
      <button className="btn primary" disabled={busy} onClick={() => post('accept', {}, t('Accepted. The buyer has been asked to pay.'))}>{t('Accept {amount}', { amount: money(price) })}</button>
      <button className="btn" onClick={() => { setK('counter'); setAmount(String(Math.round((counter?.amount ?? price) / 100))) }}>{t('Counter offer')}</button>
      <button className="btn" onClick={() => setK('decline')}>{t('Decline')}</button>
    </div>}
    {k === 'counter' && <div className="form">
      <div className="field"><label htmlFor={`ca-${dealId}`}>{t('Your price (AED, excl. VAT)')}</label>
        <input id={`ca-${dealId}`} type="number" inputMode="decimal" min={1} step={1} value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="field"><label htmlFor={`cn-${dealId}`}>{t('Note to the buyer (optional)')}</label>
        <textarea id={`cn-${dealId}`} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></div>
      <p className="small muted">{t('The buyer agrees and the booking is accepted at this price, or keeps their offer for you to decide. The request keeps its deadline.')}</p>
      <div className="row-flex"><button className="btn primary" disabled={busy || !(fils >= 100) || fils === price}
        onClick={() => post('counter', { amount: fils, ...(note.trim() ? { note: note.trim() } : {}) }, t('Counter offer sent to the buyer.'))}>{t('Send counter offer')}</button>
        <button className="btn" onClick={() => setK('')}>{t('Back')}</button></div>
    </div>}
    {k === 'decline' && <div className="form">
      <div className="field"><label htmlFor={`dr-${dealId}`}>{t('Reason (the buyer sees it)')}</label>
        <textarea id={`dr-${dealId}`} rows={2} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <div className="row-flex"><button className="btn primary" disabled={busy || !reason.trim()} onClick={() => post('decline', { reason }, t('Declined.'))}>{t('Decline')}</button>
        <button className="btn" onClick={() => setK('')}>{t('Back')}</button></div>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>
}
