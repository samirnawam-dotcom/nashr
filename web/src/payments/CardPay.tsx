import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { isAr, t } from '../i18n'
import { tm } from '../i18n-server'

/*
 * Paying for a booking. With Stripe connected (its publishable key comes from /api/config), the card is typed into Stripe's own
 * fields, so card numbers never reach Nashr. Stripe turns it into a payment method, Nashr charges it, and if the bank asks the
 * buyer to confirm (3-D Secure) Stripe shows its window here. Stripe's signed webhook then secures the booking.
 * Without Stripe (the demo), the test cards from the brief stand in.
 */
type StripeJs = { elements: (o?: object) => { create: (type: string, o?: object) => { mount: (el: HTMLElement) => void; destroy: () => void; on: (ev: string, fn: (e: any) => void) => void } }
  createPaymentMethod: (o: object) => Promise<{ paymentMethod?: { id: string }; error?: { message: string } }>
  handleNextAction: (o: { clientSecret: string }) => Promise<{ error?: { message: string } }> }
declare global { interface Window { Stripe?: (key: string, o?: object) => StripeJs } }

let config: Promise<string | null> | null = null
const publishableKey = () => (config ??= api<{ stripePublishableKey: string | null }>('/config').then(c => c.stripePublishableKey, () => null))
let script: Promise<StripeJs> | null = null
function loadStripe(key: string) {
  return (script ??= new Promise<StripeJs>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://js.stripe.com/v3/'; s.async = true
    s.onload = () => window.Stripe ? resolve(window.Stripe(key, { locale: isAr ? 'ar' : 'en' })) : reject(new Error('no Stripe'))
    s.onerror = () => { script = null; reject(new Error(t('The card form could not load. Check your connection and try again.'))) }
    document.head.appendChild(s)
  }))
}

const TEST_CARDS = [['pm_card_4242', t('Visa •••• 4242')], ['pm_card_3155', t('Visa •••• 3155 (bank asks to confirm)')], ['pm_card_0002', t('Visa •••• 0002 (declined)')]]
type PayResult = { status: 'succeeded' | 'requires_action' | 'failed'; failure?: string; clientSecret?: string }

export function CardPay({ dealId, label, onDone }: { dealId: string; label: string; onDone: () => Promise<unknown> | void }) {
  const [key, setKey] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState(''), [ready, setReady] = useState(false), [complete, setComplete] = useState(false)
  const [testCard, setTestCard] = useState(TEST_CARDS[0][0])
  const box = useRef<HTMLDivElement>(null), stripe = useRef<StripeJs | null>(null), card = useRef<any>(null)
  useEffect(() => { publishableKey().then(setKey) }, [])
  useEffect(() => {
    if (!key || !box.current) return
    let gone = false
    loadStripe(key).then(s => {
      if (gone || !box.current) return
      stripe.current = s
      const font = getComputedStyle(document.body).fontFamily
      card.current = s.elements({ locale: isAr ? 'ar' : 'en' }).create('card', { hidePostalCode: true,
        style: { base: { fontSize: '16px', color: '#0f2322', fontFamily: font, '::placeholder': { color: '#6b7a78' } }, invalid: { color: '#b0281c' } } })
      card.current.mount(box.current)
      card.current.on('change', (e: any) => { setComplete(!!e.complete); setError(e.error?.message ?? '') })
      setReady(true)
    }, e => setError(e.message))
    return () => { gone = true; card.current?.destroy(); card.current = null }
  }, [key])

  // After the bank's confirmation, Stripe tells Nashr by webhook; wait for the booking to show it (a few seconds at most).
  async function waitForSecured() {
    for (let i = 0; i < 20; i++) {
      const d = await api<{ status: string }>(`/deals/${dealId}`)
      if (d.status !== 'accepted_pay_now') return true
      await new Promise(r => setTimeout(r, 1500))
    }
    return false
  }

  async function pay(paymentMethod: string) {
    const r = await api<PayResult>(`/deals/${dealId}/pay`, { method: 'POST', body: { paymentMethod } })
    if (r.status === 'failed') { setError(`${tm(r.failure ?? '')} ${t('Update your card and try again.')}`); return }
    if (r.status === 'requires_action') {
      if (!stripe.current || !r.clientSecret) { setNote(t('Your bank needs you to confirm this payment.')); return }
      setNote(t('Your bank needs you to confirm this payment.'))
      const done = await stripe.current.handleNextAction({ clientSecret: r.clientSecret })
      if (done.error) { setNote(''); setError(`${done.error.message} ${t('Update your card and try again.')}`); return }
      setNote(t('Confirmed by your bank. Securing the payment…'))
      if (!(await waitForSecured())) { setNote(t('Your bank confirmed the payment. It can take a minute to show here; refresh the page shortly.')); return }
    }
    setNote(t('Payment secured.')); await onDone()
  }

  async function submit() {
    setBusy(true); setError(''); setNote('')
    try {
      if (!key) return await pay(testCard)
      const r = await stripe.current!.createPaymentMethod({ type: 'card', card: card.current })
      if (r.error || !r.paymentMethod) { setError(r.error?.message ?? t('Check the card details.')); return }
      await pay(r.paymentMethod.id)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  if (key === undefined) return <p className="muted small">{t('Loading…')}</p>
  return <div className="card-pay">
    {key ? <div className="field"><span className="label">{t('Card')}</span>
        <div className="card-field" ref={box} aria-busy={!ready} />
        <span className="small muted">{t('Card details go straight to Stripe, our payment provider. Nashr never sees the card number.')}</span></div>
      : <div className="field"><label htmlFor="card">{t('Card')}</label><select id="card" value={testCard} onChange={e => setTestCard(e.target.value)}>
          {TEST_CARDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <span className="small muted">{t('Test cards: payments are not connected yet, so no real money moves.')}</span></div>}
    {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
    <button className="btn primary" disabled={busy || (!!key && (!ready || !complete))} onClick={submit}>{busy ? t('Paying…') : label}</button>
  </div>
}
