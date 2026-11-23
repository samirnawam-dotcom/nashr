const { twoStepViaApi, twoStepViaPage } = require('./two-step.cjs')
const { chromium } = require('playwright')
// Buyer journey end to end against a running app (npm run seed, npm start, npm run dev:web). Screenshots go to E2E_OUT if set.
const out = process.env.E2E_OUT
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.addInitScript(() => { try { localStorage.setItem('nashr:tour:off', '1') } catch {} })
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && !/401/.test(m.text()) && errors.push(m.text()))
  await p.goto(BASE + '/#/sign-in')
  await p.fill('#email', 'demo@northwind.ae'); await p.fill('#pw', 'nashr-demo-2026'); await p.click('button:has-text("Sign in")')
  await p.waitForSelector('.pt-kpis') // the buyer dashboard is home
  await twoStepViaPage(p, BASE); await p.goto(BASE + '/dashboard'); await p.waitForSelector('.pt-kpis') // paying needs two-step sign-in
  // Shopping is in the Directory (owner's "Buying moves to the Directory"): Products view, radio auctions, a product's dates, then its outlet's Calendar tab
  await p.click('.nav >> text=Directory'); await p.waitForSelector('.outlet-grid')
  await p.goto(BASE + '/directory?view=products&sale=auction&channel=radio'); await p.waitForSelector('.prod-card')
  out && await p.screenshot({ path: out + '/6-shop.png' })
  await p.locator('.prod-card .btn.primary').first().click(); await p.waitForSelector('.date-lines button')
  out && await p.screenshot({ path: out + '/6b-dates.png' })
  await p.keyboard.press('Escape')
  // Athena (rules only): a sentence becomes the Directory's filters, results best fit first with one line on why
  await p.goto(BASE + '/directory'); await p.waitForSelector('.ask-bar input')
  await p.fill('.ask-bar input', 'Radio for a fintech launch in the first week of December, about AED 20,000, business people'); await p.keyboard.press('Enter')
  await p.waitForSelector('.athena-line'); await p.waitForSelector('.pc-why')
  console.log('athena search:', (await p.locator('.fchip').allTextContents()).join(' | '), '→', (await p.locator('.pc-why').first().textContent()).trim())
  out && await p.screenshot({ path: out + '/6c-athena.png' })
  const W = await p.evaluate(async () => { const from = new Date().toISOString(), to = new Date(Date.now() + 40 * 86_400_000).toISOString()
    const d = await (await fetch(`/api/slots/days?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&open=1&sale=auction&ch=radio`)).json()
    const day = new Date(d[0].date + 'T12:00:00Z'), monday = new Date(day.getTime() - ((day.getUTCDay() || 7) - 1) * 86_400_000)
    return { start: monday.toISOString().slice(0, 10), end: new Date(monday.getTime() + 7 * 86_400_000).toISOString().slice(0, 10) } })
  await p.goto(BASE + '/directory/skyline-fm?tab=calendar'); await p.waitForSelector('.oc-cal .cv-rtable .cv-prow')
  out && await p.screenshot({ path: out + '/7-outlet-calendar.png' })
  await p.click('.oc-cal .seg button:has-text("Day")'); await p.waitForSelector('.oc-cal .rv-day .cv-rtable')
  const picks = await p.evaluate(async W => (await (await fetch(`/api/slots/list?from=${W.start}T00:00:00%2B04:00&to=${W.end}T00:00:00%2B04:00&open=1&sale=auction&ch=radio&limit=100`)).json())
    .items.filter(s => s.kind === 'single' && s.buyNowPrice && !s.youBid).slice(0, 2).map(s => s.id), W)
  const openSlot = async id => { await p.goto(BASE + `/calendar?slot=${id}`); await p.waitForSelector('.drawer h2') }
  // Bid on a break with a full brief
  await openSlot(picks[0])
  await p.fill('#adv', 'Northwind Business Cards'); await p.selectOption('#ind', 'Banking'); await p.fill('#msg', 'Business cards for growing companies. Apply in minutes.')
  await p.setInputFiles('.drawer .cp-creative input[type=file]', { name: 'draft-spot.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3 draft spot') }); await p.waitForSelector('.drawer .cp-creative bdi')
  await p.click('.bid-mode button:has-text("Auto-bid")'); await p.fill('#max', '6000')
  out && await p.screenshot({ path: out + '/8-drawer-brief.png' })
  await p.click('.drawer-f .btn.primary'); await p.waitForSelector('.drawer .ok, .drawer .error')
  console.log('bid:', await p.locator('.drawer .ok, .drawer .error').first().textContent())
  // Buy-now request on the next break
  await openSlot(picks[1])
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
  // The Calendar is the buyer's tracker: the paid booking shows as Paid
  const bookingUrl = p.url(); await p.goto(BASE + '/calendar'); await p.waitForSelector('.tk-item')
  console.log('tracker statuses:', [...new Set(await p.locator('.tk-item .tk-st').allTextContents())].join(', '))
  out && await p.screenshot({ path: out + '/10b-tracker.png' })
  // Athena plans the campaign: a split by media type, the best products for each part, kept lines added as Added
  await p.goto(BASE + '/campaigns'); await p.locator('.cp-card').first().click(); await p.waitForSelector('.ap-ask input')
  await p.fill('.ap-ask input', 'AED 55,000, 1-14 Dec, business people, mostly radio and online'); await p.click('.ap-ask .btn.primary')
  await p.waitForSelector('.ap-total'); console.log('athena plan:', (await p.locator('.ap-total b').textContent()).trim())
  await p.click('.athena-plan .btn.primary:has-text("Add")'); await p.waitForSelector('.ok:has-text("added to the plan")')
  out && await p.screenshot({ path: out + '/10c-athena-plan.png' })
  await p.goto(bookingUrl); await p.waitForSelector('main .page-title')

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
