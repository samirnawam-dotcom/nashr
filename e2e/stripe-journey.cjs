// Stripe journey: paying with a card typed into (a stand-in for) Stripe's fields, a declined card, the bank's 3-D Secure step and
// the signed webhook that secures the booking, then a publisher connecting payouts through Stripe's onboarding pages.
// Needs the API running against the mock Stripe:
//   STRIPE_SECRET_KEY=sk_test_mock STRIPE_PUBLISHABLE_KEY=pk_test_mock STRIPE_WEBHOOK_SECRET=whsec_mock STRIPE_API_BASE=http://localhost:12111 npm start
// then: node e2e/stripe-journey.cjs (it starts the mock Stripe itself).
const { chromium } = require('playwright')
const { twoStepViaApi } = require('./two-step.cjs')
const { STRIPE_JS } = require('./mock-stripe.cjs')
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173', out = process.env.E2E_OUT
const ok = (cond, what) => { if (!cond) throw new Error('FAILED: ' + what); console.log('✓', what) }

;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.route('https://js.stripe.com/v3/', r => r.fulfill({ contentType: 'application/javascript', body: STRIPE_JS }))
  const errors = []; ctx.on('page', p => p.on('pageerror', e => errors.push(e.message)))
  const login = async (c, email) => { const r = await c.request.post(BASE + '/api/auth/login', { data: { email, password: 'nashr-demo-2026' } }); if (!r.ok()) throw new Error('login ' + email) }
  ok((await (await ctx.request.get(BASE + '/api/config')).json()).stripePublishableKey === 'pk_test_mock', 'the API is running with Stripe (test keys)')

  // A booking to pay: buy-now on a Skyline slot, accepted by the publisher.
  await login(ctx, 'demo@northwind.ae'); await twoStepViaApi(ctx.request, BASE)
  const sellerCtx = await b.newContext(); await sellerCtx.route('https://js.stripe.com/v3/', r => r.fulfill({ contentType: 'application/javascript', body: STRIPE_JS }))
  await login(sellerCtx, 'sales@skyline.ae')
  const slot = (await (await ctx.request.get(BASE + '/api/slots')).json()).find(s => s.available && s.buyNowPrice && s.kind === 'single' && !s.youBid && s.outlet === 'Skyline FM')
  const brief = { advertiser: 'Northwind', industry: 'Banking', message: 'Business cards for growing companies.', language: 'english', creativeToFollow: true }
  const dealId = (await (await ctx.request.post(`${BASE}/api/slots/${slot.id}/buy-now`, { data: { brief } })).json()).id
  await sellerCtx.request.post(`${BASE}/api/seller/deals/${dealId}/accept`)

  const p = await ctx.newPage()
  await p.goto(`${BASE}/bookings/${dealId}`); await p.waitForSelector('#mock-card')
  ok(!(await p.locator('#card').count()), 'the card form is Stripe\'s, not the test-card list')
  // Declined
  await p.fill('#mock-card', '4000 0000 0000 0002'); await p.click('.card-pay button'); await p.waitForSelector('.card-pay .error')
  ok(/declined/i.test(await p.textContent('.card-pay .error')), 'a declined card shows the bank\'s answer')
  // Bank asks to confirm (3-D Secure), then Stripe's signed webhook secures the booking
  await p.fill('#mock-card', '4000 0025 0000 3155'); await p.click('.card-pay button')
  await p.waitForSelector('main .page-title:has-text("Paid")', { timeout: 30_000 })
  ok(true, '3-D Secure confirmed and the webhook secured the booking')
  out && await p.screenshot({ path: out + '/stripe-paid.png' })
  const docs = (await (await ctx.request.get(`${BASE}/api/deals/${dealId}`)).json()).documents.map(d => d.type)
  ok(docs.includes('receipt'), 'the receipt was issued')

  // A publisher connects payouts through Stripe's onboarding pages and comes back verified.
  const { Client } = require('pg'); const db = new Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://nashr:nashr@localhost:5432/nashr' })
  await db.connect(); await db.query(`update companies set provider_account = null, payouts_enabled = false where name = 'Skyline FM'`); await db.end()
  await twoStepViaApi(sellerCtx.request, BASE)
  const sp = await sellerCtx.newPage(); sp.on('pageerror', e => errors.push(e.message))
  await sp.goto(BASE + '/profile'); await sp.click('button:has-text("Connect payout account")')
  await sp.waitForURL(/\/profile/); await sp.waitForSelector('main .ok')
  ok(/verified/i.test(await sp.textContent('main .ok')), 'payout onboarding on Stripe\'s pages, back verified: ' + await sp.textContent('main .ok'))
  ok(/Verified/.test(await sp.textContent('main')), 'the profile shows the payout account as verified')
  out && await sp.screenshot({ path: out + '/stripe-payouts.png' })

  ok(!errors.length, 'no page errors ' + errors.join(' | '))
  console.log('STRIPE JOURNEY OK')
  await b.close(); process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
