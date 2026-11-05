const { chromium } = require('playwright')
// Buyer journey end to end against a running app (npm run seed, npm start, npm run dev:web). Screenshots go to E2E_OUT if set.
const out = process.env.E2E_OUT
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && !/401/.test(m.text()) && errors.push(m.text()))
  await p.goto(BASE + '/')
  await p.fill('#email', 'demo@northwind.ae'); await p.fill('#pw', 'nashr-demo-2026'); await p.click('button:has-text("Sign in")')
  await p.waitForSelector('.cal-head')
  await p.click('[aria-label="Next"]'); await p.click('[aria-label="Next"]'); await p.waitForTimeout(700) // week of 16 Nov: everything open
  out && await p.screenshot({ path: out + '/6-week2.png' })
  await p.click('.seg button:has-text("Day")'); await p.waitForTimeout(700)
  out && await p.screenshot({ path: out + '/7-day.png' })
  // Bid on a break with a full brief
  await p.click('.ev.single >> nth=0'); await p.waitForSelector('.drawer h2')
  await p.fill('#adv', 'Northwind Business Cards'); await p.fill('#msg', 'Business cards for growing companies. Apply in minutes.')
  await p.check('text=Auto-bid'); await p.fill('#max', '6000')
  out && await p.screenshot({ path: out + '/8-drawer-brief.png' })
  await p.click('.drawer-f .btn.primary'); await p.waitForSelector('.drawer .ok, .drawer .error')
  console.log('bid:', await p.locator('.drawer .ok, .drawer .error').first().textContent())
  // Buy-now request on the next break
  await p.click('[aria-label="Close"]'); await p.click('.ev.single >> nth=1'); await p.waitForSelector('.drawer h2')
  await p.click('.drawer-f .btn:has-text("Request at")'); await p.waitForSelector('.drawer .ok, .drawer .error')
  console.log('buy-now:', await p.locator('.drawer .ok, .drawer .error').first().textContent())
  // The seller accepts through the API in their own session
  const seller = await b.newContext(); const sp = await seller.newPage()
  await sp.request.post(BASE + '/api/auth/login', { data: { email: 'sales@skyline.ae', password: 'nashr-demo-2026' } })
  const deals = await (await sp.request.get(BASE + '/api/seller/deals')).json()
  const req = deals.find(d => d.status === 'awaiting_seller')
  console.log('seller sees:', req.buyer.company, req.money.youReceive, 'below reserve:', req.belowReserve)
  console.log('accept:', (await sp.request.post(`${BASE}/api/seller/deals/${req.id}/accept`)).status())
  // Buyer pays from Bookings
  await p.click('[aria-label="Close"]'); await p.goto(BASE + '/#/bookings'); await p.waitForSelector('.table')
  out && await p.screenshot({ path: out + '/9-bookings.png' })
  await p.click('.table tbody tr >> nth=0'); await p.waitForSelector('.sum')
  await p.selectOption('#card', 'pm_card_0002'); await p.click('button:has-text("Pay")'); await p.waitForSelector('.error')
  console.log('declined:', await p.locator('.error').textContent())
  await p.selectOption('#card', 'pm_card_4242'); await p.click('button:has-text("Pay")'); await p.waitForTimeout(800)
  out && await p.screenshot({ path: out + '/10-paid.png' })
  const status = await p.locator('main p.muted').first().textContent()
  if (!/Payment secured/.test(status)) { console.error('Expected Payment secured, got', status); process.exitCode = 1 }
  console.log('status now:', status)
  if (errors.length) { console.error('Browser errors:', errors); process.exitCode = 1 }
  await b.close()
})()
