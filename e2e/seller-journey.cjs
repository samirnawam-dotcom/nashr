const { chromium } = require('playwright')
// Seller journey against a running app (npm run seed, npm start, npm run dev:web). Screenshots go to E2E_OUT if set.
const out = process.env.E2E_OUT, BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const fail = m => { console.error(m); process.exitCode = 1 }
;(async () => {
  const b = await chromium.launch()
  // A buyer sends a buy-now request through the API
  const buyer = await (await b.newContext()).request
  await buyer.post(BASE + '/api/auth/login', { data: { email: 'demo@northwind.ae', password: 'nashr-demo-2026' } })
  const slots = await (await buyer.get(BASE + '/api/slots')).json()
  const target = slots.find(s => s.available && s.buyNowPrice && s.kind === 'single' && !s.youBid && s.outlet === 'Skyline FM')
  const req = await buyer.post(`${BASE}/api/slots/${target.id}/buy-now`, { data: { brief: { advertiser: 'Northwind Business Cards', industry: 'Banking',
    message: 'Business cards for growing companies.', language: 'english', creativeToFollow: true } } })
  const dealId = (await req.json()).id

  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && !/401/.test(m.text()) && errors.push(m.text()))
  const shot = async n => out && (await p.waitForTimeout(300), await p.screenshot({ path: `${out}/${n}.png`, fullPage: true }))
  await p.goto(BASE + '/#/sign-in'); await p.fill('#email', 'sales@skyline.ae'); await p.fill('#pw', 'nashr-demo-2026'); await p.click('button:has-text("Sign in")')
  await p.waitForSelector('.dash-lead'); await shot('s1-dashboard')
  await p.click('.nav >> text=Inbox'); await p.waitForSelector('.tasks'); await shot('s2-inbox')
  await p.click(`.tasks a[href="/deals/${dealId}"]`); await p.waitForSelector('text=Booking brief'); await shot('s3-decide')
  await p.click('button:has-text("Accept")'); await p.waitForSelector('text=Accepted. The buyer')
  // The buyer pays and sends creative
  console.log('pay:', (await (await buyer.post(`${BASE}/api/deals/${dealId}/pay`, { data: { paymentMethod: 'pm_card_4242' } })).json()).status)
  const f = await (await buyer.post(BASE + '/api/files', { data: Buffer.from('ID3 spot'), headers: { 'content-type': 'audio/mpeg', 'x-file-name': 'spot.mp3' } })).json()
  await buyer.post(`${BASE}/api/deals/${dealId}/creative`, { data: { fileId: f.id } })
  await p.reload(); await p.waitForSelector('text=Waiting for your review'); await shot('s4-creative')
  await p.click('.section button:has-text("Approve")'); await p.waitForSelector('text=Creative approved')
  // Calendar, slot panel, take a slot off sale and back
  await p.click('.nav >> text=Calendar'); await p.waitForSelector('.prog, .empty')
  // Move forward to the first week with at least two slots still on sale (which week that is depends on today's date)
  await p.click('[aria-label="Next week"]'); await p.waitForTimeout(800)
  for (let i = 0; i < 4 && await p.locator('.sl.open').count() < 2; i++) { await p.click('[aria-label="Next week"]'); await p.waitForTimeout(800) }
  await shot('s5-calendar')
  await p.click('.sl.open >> nth=1'); await p.waitForSelector('.drawer h2'); await shot('s6-slot')
  const off = p.locator('button:has-text("Take off sale")')
  if (await off.count()) { await off.click(); await p.waitForSelector('button:has-text("Put back on sale")'); await p.click('button:has-text("Put back on sale")'); await p.waitForSelector('button:has-text("Take off sale")') }
  await p.click('[aria-label="Close"]')
  // A new placement, listed straight away
  await p.click('.nav >> text=Listings'); await p.waitForSelector('table'); await p.click('text=Add placement')
  await p.fill('#n', 'Weekend Brunch'); await p.selectOption('#st', 'quick_sale')
  await p.click('.days label:has-text("Mon")'); await p.click('.days label:has-text("Sat")'); await p.click('.days label:has-text("Sun")')
  await p.fill('#sa', '10:00'); await p.fill('#ea', '12:00'); await p.click('button:has-text("Add break")'); await p.fill('#bt0', '10:30')
  await p.fill('#sp', '1800'); await shot('s7-new-placement')
  await p.click('button:has-text("Save placement")'); await p.waitForSelector('td:has-text("Weekend Brunch")'); await shot('s8-listings')
  await p.click('.nav >> text=Earnings'); await p.waitForSelector('.kpis'); await shot('s9-earnings')
  await p.click('.nav >> text=Profile'); await p.waitForSelector('text=Payout account'); await shot('s10-profile')
  const sp = p.context().request
  const d = await (await sp.get(`${BASE}/api/seller/deals/${dealId}`)).json()
  if (d.status !== 'secured') fail(`Expected secured, got ${d.status}`)
  if (errors.length) fail('Browser errors: ' + errors.join(' | '))
  console.log('deal:', d.ref, d.status, 'you receive', d.money.youReceive)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
