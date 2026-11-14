const { twoStepViaApi, twoStepViaPage } = require('./two-step.cjs')
const { chromium } = require('playwright')
// Buyer journey end to end against a running app (npm run seed, npm start, npm run dev:web). Screenshots go to E2E_OUT if set.
const out = process.env.E2E_OUT
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && !/401/.test(m.text()) && errors.push(m.text()))
  await p.goto(BASE + '/#/sign-in')
  await p.fill('#email', 'demo@northwind.ae'); await p.fill('#pw', 'nashr-demo-2026'); await p.click('button:has-text("Sign in")')
  await p.waitForSelector('.pt-kpis') // the buyer dashboard is home
  await twoStepViaPage(p, BASE); await p.goto(BASE + '/dashboard'); await p.waitForSelector('.pt-kpis') // paying needs two-step sign-in
  await p.click('.nav >> text=Calendar'); await p.waitForSelector('.cv-head')
  // The week of 16 Nov (everything open): week grid, then the day, then the list filtered to radio auctions
  await p.goto(BASE + '/calendar?view=week&date=2026-11-16'); await p.waitForSelector('.cv-block')
  out && await p.screenshot({ path: out + '/6-week2.png' })
  await p.click('.cv-views button:has-text("Day")'); await p.waitForSelector('.cv-col')
  out && await p.screenshot({ path: out + '/7-day.png' })
  const picks = await p.evaluate(async () => (await (await fetch('/api/slots/list?from=2026-11-16T00:00:00%2B04:00&to=2026-11-23T00:00:00%2B04:00&open=1&sale=auction&ch=radio&limit=100')).json())
    .items.filter(s => s.kind === 'single' && s.buyNowPrice && !s.youBid).slice(0, 2).map(s => s.id))
  await p.goto(BASE + '/calendar?view=list&date=2026-11-16&sale=auction&ch=radio'); await p.waitForSelector('.cv-table tbody tr')
  const row = async id => { while (!(await p.locator(`tr[data-slot="${id}"]`).count())) { await p.click('.cv-more-row .btn'); await p.waitForTimeout(400) } return `tr[data-slot="${id}"] .cv-act` }
  // Bid on a break with a full brief
  await p.click(await row(picks[0])); await p.waitForSelector('.drawer h2')
  await p.fill('#adv', 'Northwind Business Cards'); await p.selectOption('#ind', 'Banking'); await p.fill('#msg', 'Business cards for growing companies. Apply in minutes.')
  await p.click('.bid-mode button:has-text("Auto-bid")'); await p.fill('#max', '6000')
  out && await p.screenshot({ path: out + '/8-drawer-brief.png' })
  await p.click('.drawer-f .btn.primary'); await p.waitForSelector('.drawer .ok, .drawer .error')
  console.log('bid:', await p.locator('.drawer .ok, .drawer .error').first().textContent())
  // Buy-now request on the next break
  await p.click('[aria-label="Close"]'); await p.click(await row(picks[1])); await p.waitForSelector('.drawer h2')
  await p.click('.drawer-f .btn:has-text("Request at")'); await p.waitForSelector('.drawer .ok, .drawer .error')
  console.log('buy-now:', await p.locator('.drawer .ok, .drawer .error').first().textContent())
  // The seller accepts through the API in their own session
  const seller = await b.newContext(); const sp = await seller.newPage()
  await sp.request.post(BASE + '/api/auth/login', { data: { email: 'sales@skyline.ae', password: 'nashr-demo-2026' } })
  const deals = await (await sp.request.get(BASE + '/api/seller/deals')).json()
  // this buyer's newest request (the demo data has other buyers' requests waiting too)
  const req = deals.find(d => d.status === 'awaiting_seller' && d.buyer.company === 'Northwind Fintech') // newest first
  console.log('seller sees:', req.buyer.company, req.money.youReceive, 'below reserve:', req.belowReserve)
  console.log('accept:', (await sp.request.post(`${BASE}/api/seller/deals/${req.id}/accept`)).status())
  // Buyer pays from Bookings
  await p.click('[aria-label="Close"]'); await p.goto(BASE + '/#/bookings'); await p.waitForSelector('.table')
  out && await p.screenshot({ path: out + '/9-bookings.png' })
  await p.click(`.table tbody tr:has-text("${req.ref}")`); await p.waitForSelector('.sum')
  await p.selectOption('#card', 'pm_card_0002'); await p.click('button:has-text("Pay")'); await p.waitForSelector('.error')
  console.log('declined:', await p.locator('.error').textContent())
  await p.selectOption('#card', 'pm_card_4242'); await p.click('button:has-text("Pay")'); await p.waitForTimeout(800)
  out && await p.screenshot({ path: out + '/10-paid.png' })
  const status = await p.locator('main .page-title').first().textContent()
  if (!/Paid/.test(status)) { console.error('Expected Paid, got', status); process.exitCode = 1 }
  console.log('status now:', status)

  // Creative: the buyer uploads, the publisher approves
  await p.setInputFiles('#file', { name: 'spot.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3 demo audio') })
  await p.waitForSelector('text=Version 1 sent')
  const dealId = p.url().split('/').pop()
  console.log('creative review:', (await sp.request.post(`${BASE}/api/seller/deals/${dealId}/creative-review`, { data: { decision: 'approve' } })).status())
  // Time travel: the ad has run (dev database only), then the publisher sends proof with a file
  const { Client } = require('pg'); const db = new Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://nashr:nashr@localhost:5432/nashr' })
  await db.connect(); await db.query(`update slots set starts_at = now() - interval '2 hours', ends_at = now() - interval '2 hours' + interval '30 seconds' where id = (select slot_id from deals where id = $1)`, [dealId]); await db.end()
  const clip = await (await sp.request.post(BASE + '/api/files', { data: Buffer.from('ID3 as aired'), headers: { 'content-type': 'audio/mpeg', 'x-file-name': 'aired.mp3' } })).json()
  console.log('proof:', (await sp.request.post(`${BASE}/api/seller/deals/${dealId}/proof`, { data: { items: { as_run_log: `files/${clip.id}`, audio_clip: `files/${clip.id}` } } })).status())
  await p.reload(); await p.waitForSelector('text=Proof the ad ran')
  out && await p.screenshot({ path: out + '/11-proof.png', fullPage: true })
  const dl = await p.request.get(BASE + `/api/files/${clip.id}`)
  if (dl.status() !== 200) { console.error('Buyer cannot download proof'); process.exitCode = 1 }
  // Report an issue; the publisher offers a partial refund; the buyer accepts
  await p.click('button:has-text("Report an issue")'); await p.selectOption('#ir', 'wrong_time'); await p.fill('#in', 'Aired at 07:20, not 06:45.')
  await p.click('button:has-text("Report issue")'); await p.waitForSelector('text=Waiting for the publisher')
  console.log('offer:', (await sp.request.post(`${BASE}/api/seller/deals/${dealId}/issues/offer`, { data: { type: 'partial_refund', amount: 100000 } })).status())
  await p.reload(); await p.click('button:has-text("Accept offer")'); await p.waitForSelector('text=Offer accepted')
  out && await p.screenshot({ path: out + '/12-issue-settled.png', fullPage: true })
  const final = await p.locator('main .page-title').first().textContent()
  if (!/Completed/.test(final)) { console.error('Expected Completed after partial refund, got', final); process.exitCode = 1 }
  console.log('after offer:', final)
  if (errors.length) { console.error('Browser errors:', errors); process.exitCode = 1 }
  await b.close()
})()
