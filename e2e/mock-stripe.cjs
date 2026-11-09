// A stand-in for Stripe, for the Stripe journey (e2e/stripe-journey.cjs): the REST endpoints Nashr calls, signed webhooks back to
// the API, the bank's 3-D Secure step and Stripe's payout onboarding pages. Test card numbers behave as Stripe's do:
// 4242 succeeds, 3155 asks the bank to confirm, 0002 is declined.
//   node e2e/mock-stripe.cjs            (port 12111; the API runs with STRIPE_API_BASE=http://localhost:12111)
const http = require('node:http'), { createHmac } = require('node:crypto')
const PORT = Number(process.env.MOCK_STRIPE_PORT ?? 12111), API = process.env.API_BASE ?? 'http://localhost:3000', WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_mock'
const s = { n: 0, pis: new Map(), accounts: new Map(), seen: new Map(), balance: 0, events: 0 }
const fee = a => Math.round(a * 0.029) + 100

async function webhook(type, object) {
  const body = JSON.stringify({ id: `evt_${++s.events}_${Date.now()}`, type, data: { object } }), t = Math.floor(Date.now() / 1000)
  const sig = `t=${t},v1=${createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex')}`
  const r = await fetch(`${API}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body })
  console.log('webhook', type, r.status, await r.text())
}

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' })
  res.end(type === 'application/json' ? JSON.stringify(data) : data)
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`)
  let raw = ''; for await (const c of req) raw += c
  const b = new URLSearchParams(req.method === 'GET' ? u.search : raw)
  if (req.method === 'OPTIONS') return send(res, 204, '')
  const key = req.headers['idempotency-key']
  const remember = (data, status = 200) => { if (key) s.seen.set(key, [status, data]); send(res, status, data) }
  if (key && s.seen.has(key)) return send(res, ...s.seen.get(key))

  // The bank's confirmation (called by the stand-in for Stripe's browser script), then Stripe's webhook.
  if (u.pathname === '/__test/confirm') {
    const pi = s.pis.get(raw.replace(/_secret.*$/, ''))
    if (!pi) return send(res, 404, { error: 'no such payment' })
    pi.status = 'succeeded'; s.balance += pi.amount - fee(pi.amount)
    send(res, 200, { ok: true })
    return webhook('payment_intent.succeeded', { id: pi.id, amount_received: pi.amount, currency: pi.currency })
  }
  // Stripe's onboarding pages: the publisher "fills them in", Stripe tells Nashr, the publisher goes back.
  if (u.pathname === '/onboard') {
    const a = s.accounts.get(u.searchParams.get('account'))
    a.details_submitted = true; a.payouts_enabled = true
    await webhook('account.updated', a)
    res.writeHead(302, { location: u.searchParams.get('return') }); return res.end()
  }

  if (u.pathname === '/v1/payment_intents' && req.method === 'POST') {
    const pm = b.get('payment_method'), id = `pi_${++s.n}`, amount = Number(b.get('amount'))
    if (pm.endsWith('0002')) return remember({ error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } }, 402)
    const pi = { id, amount, currency: b.get('currency'), status: pm.endsWith('3155') ? 'requires_action' : 'succeeded', client_secret: `${id}_secret_x` }
    if (pi.status === 'succeeded') s.balance += amount - fee(amount)
    s.pis.set(id, pi); return remember(pi)
  }
  const pi = u.pathname.match(/^\/v1\/payment_intents\/(pi_\d+)$/)
  if (pi) { const p = s.pis.get(pi[1]); return send(res, 200, { ...p, latest_charge: { balance_transaction: { fee: fee(p.amount) } } }) }
  if (u.pathname === '/v1/refunds') { s.balance -= Number(b.get('amount')); return remember({ id: `re_${++s.n}` }) }
  if (u.pathname === '/v1/transfers') { s.balance -= Number(b.get('amount')); return remember({ id: `tr_${++s.n}` }) }
  if (u.pathname === '/v1/balance') return send(res, 200, { available: [{ currency: 'aed', amount: s.balance }], pending: [] })
  if (u.pathname === '/v1/accounts' && req.method === 'POST') { const id = `acct_${++s.n}`; s.accounts.set(id, { id, details_submitted: false, payouts_enabled: false }); return remember({ id }) }
  if (u.pathname === '/v1/account_links') return send(res, 200, { url: `http://localhost:${PORT}/onboard?account=${b.get('account')}&return=${encodeURIComponent(b.get('return_url'))}` })
  const acct = u.pathname.match(/^\/v1\/accounts\/(acct_\d+)$/)
  if (acct) return send(res, 200, s.accounts.get(acct[1]) ?? { id: acct[1], details_submitted: false, payouts_enabled: false })
  send(res, 404, { error: { message: `mock Stripe has no ${req.method} ${u.pathname}` } })
}).listen(PORT, () => console.log(`mock Stripe on :${PORT}`))

// What the browser loads instead of https://js.stripe.com/v3/: one plain card input, Stripe's calls, and the bank's "confirm".
module.exports.STRIPE_JS = `window.Stripe = function (key) {
  var listeners = {}
  return {
    elements: function () { return { create: function () { var input; return {
      mount: function (el) { input = document.createElement('input'); input.id = 'mock-card'; input.placeholder = 'Card number'; input.style.cssText = 'border:0;outline:0;width:100%;font:inherit'
        input.addEventListener('input', function () { var d = input.value.replace(/\\D/g, ''); (listeners.change || []).forEach(function (f) { f({ complete: d.length >= 16 }) }) })
        el.appendChild(input) },
      destroy: function () { input && input.remove() }, on: function (ev, f) { (listeners[ev] = listeners[ev] || []).push(f) }, focus: function () { input.focus() },
      value: function () { return input.value.replace(/\\D/g, '') } } } } },
    createPaymentMethod: function (o) { return Promise.resolve({ paymentMethod: { id: 'pm_card_' + o.card.value().slice(-4) } }) },
    handleNextAction: function (o) { return fetch('http://localhost:${PORT}/__test/confirm', { method: 'POST', body: o.clientSecret }).then(function () { return {} }) }
  }
}`
