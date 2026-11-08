const { chromium } = require('playwright')
const { createHmac } = require('node:crypto')
// Admin journey against a running app (npm run seed, npm start, npm run dev:web). Screenshots go to E2E_OUT if set.
const out = process.env.E2E_OUT, BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const fail = m => { console.error(m); process.exitCode = 1 }
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function totp(secret, at = Date.now()) { // RFC 6238, as server/auth/crypto.ts
  let bits = ''; for (const ch of secret) bits += B32.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const h = createHmac('sha1', key).update(counter).digest(), o = h[h.length - 1] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
const login = async (b, email) => { const r = (await b.newContext()).request; await r.post(BASE + '/api/auth/login', { data: { email, password: 'nashr-demo-2026' } }); return r }

;(async () => {
  const b = await chromium.launch()
  // A dispute: booked, paid, aired, issue reported, the buyer turns down the publisher's offer
  const buyer = await login(b, 'demo@northwind.ae'), seller = await login(b, 'sales@skyline.ae')
  const slot = (await (await buyer.get(BASE + '/api/slots')).json()).find(s => s.available && s.buyNowPrice && s.kind === 'single' && !s.youBid && s.outlet === 'Skyline FM')
  const brief = { advertiser: 'Northwind', industry: 'Banking', message: 'Business cards for growing companies.', language: 'english', creativeToFollow: true }
  const dealId = (await (await buyer.post(`${BASE}/api/slots/${slot.id}/buy-now`, { data: { brief } })).json()).id
  await seller.post(`${BASE}/api/seller/deals/${dealId}/accept`)
  await buyer.post(`${BASE}/api/deals/${dealId}/pay`, { data: { paymentMethod: 'pm_card_4242' } })
  const { Client } = require('pg'); const db = new Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://nashr:nashr@localhost:5432/nashr' })
  await db.connect(); await db.query(`update slots set starts_at = now() - interval '2 hours', ends_at = now() - interval '2 hours' + interval '30 seconds' where id = $1`, [slot.id]); await db.end()
  await seller.post(`${BASE}/api/seller/deals/${dealId}/proof`, { data: { items: { as_run_log: 'Aired 08:31', audio_clip: 'clip.mp3' } } })
  await buyer.post(`${BASE}/api/deals/${dealId}/issues`, { data: { reason: 'wrong_time', note: 'Aired at 08:31 instead of 07:15.' } })
  await seller.post(`${BASE}/api/seller/deals/${dealId}/issues/offer`, { data: { type: 'partial_refund', amount: 50000 } })
  await buyer.post(`${BASE}/api/deals/${dealId}/issues/respond`, { data: { accept: false } })

  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []
  p.on('pageerror', e => errors.push(e.message)); p.on('response', r => r.status() >= 400 && !/\/api\/(me|auth\/login)$/.test(new URL(r.url()).pathname) && errors.push(`${r.status()} ${r.url()}`)) // sign-in asks for the code with a 400 first
  const shot = async n => out && (await p.waitForTimeout(300), await p.screenshot({ path: `${out}/${n}.png`, fullPage: true }))
  p.on('dialog', d => d.accept())
  await p.goto(BASE + '/#/sign-in'); await p.fill('#email', 'ops@nashr.ae'); await p.fill('#pw', 'nashr-demo-2026'); await p.click('button:has-text("Sign in")')
  await p.waitForSelector('#code'); await p.fill('#code', totp('JBSWY3DPEHPK3PXP')); await p.click('button:has-text("Sign in")')
  await p.waitForSelector('.attn-list'); await shot('a1-overview')
  // Decide the dispute
  await p.click('.nav >> text=Disputes'); await p.waitForSelector('table'); await shot('a2-disputes')
  await p.click('tbody tr >> nth=0'); await p.waitForSelector('text=Decide this dispute'); await p.selectOption('#out', 'partial_refund'); await p.fill('#amt', '1000')
  await shot('a3-dispute'); await p.click('button:has-text("Apply decision")'); await p.waitForSelector('text=Decision applied')
  await p.click('[role=tab]:has-text("Money")'); await shot('a4-deal-money')
  // Approve an access request
  await p.click('.nav >> text=Access'); await p.waitForSelector('table'); await p.click('tbody tr:has-text("Bright Agency") button:has-text("Approve")')
  await p.waitForSelector('text=Invite link'); await shot('a5-access')
  // View a publisher's account read-only
  await p.click('.nav >> text=Accounts'); await p.click('td:has-text("Skyline FM")'); await p.waitForSelector('text=Payout account'); await shot('a6-account')
  await p.click('button:has-text("View as this account")'); await p.waitForSelector('.viewbar'); await p.waitForSelector('.dash-lead'); await shot('a7-view-as')
  await p.click('button:has-text("Stop viewing")'); await p.waitForSelector('text=Payout account')
  // Money, reports, settings, audit, directory
  // Calendar oversight: every publisher's slots in every status; the booked filter keeps only booked ones
  await p.click('.nav >> text=Calendar'); await p.waitForSelector('.cv-table tbody tr'); await shot('a7b-calendar')
  await p.click('.cv-filters button:has-text("Booked")'); await p.waitForTimeout(700)
  if (await p.locator('.cv-table .st:not(.st-booked)').count()) throw new Error('the status filter let other statuses through')
  await p.click('.cv-views button:has-text("Month")'); await p.waitForSelector('.cv-mcell')
  await p.click('.nav >> text=Funds'); await p.waitForSelector('.kpis'); await shot('a8-funds')
  if (!(await p.locator('text=Reconciled').count())) fail('Funds do not reconcile')
  await p.click('.nav >> text=Payouts'); await p.waitForSelector('main h1')
  await p.click('.nav >> text=Reports'); await p.waitForSelector('text=By channel'); await shot('a9-reports')
  await p.click('.nav >> text=Settings'); await p.waitForSelector('table')
  if (!(await p.locator('tr:has-text("Default commission") button:has-text("Change")').isDisabled())) fail('An admin could edit a founder-only setting')
  await p.click('tr:has-text("Publisher decision window") button:has-text("Change")'); await p.fill('[aria-label="New value for seller_window_hours"]', '36')
  await p.click('tr:has-text("Publisher decision window") button:has-text("Save")'); await p.waitForSelector('text=Publisher decision window saved'); await shot('a10-settings')
  await p.click('.nav >> text=Audit'); await p.waitForSelector('table'); await shot('a11-audit')
  await p.click('.nav >> text=Directory'); await p.waitForSelector('text=Quote requests')
  await p.fill('#on', 'Time Out Dubai'); await p.selectOption('#oc', 'digital'); await p.fill('#ol', '5000'); await p.fill('#oh', '8000'); await p.click('section button:has-text("Add")')
  await p.waitForSelector('td:has-text("Time Out Dubai")'); await shot('a12-directory')
  const d = await (await p.context().request.get(`${BASE}/api/admin/deals/${dealId}`)).json()
  if (d.status !== 'released') fail(`Expected released after the decision, got ${d.status}`)
  if (errors.length) fail('Browser errors: ' + errors.join(' | '))
  console.log('dispute:', d.ref, d.status, 'held now', d.money.held)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
