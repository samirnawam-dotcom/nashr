// Screenshots for docs/showcase (the owner's public preview). Needs: npm run seed, npm start, npm run dev:web.
// Usage: node scripts/showcase.cjs [out-dir]   (re-run after the brand pass)
const { chromium } = require('playwright')
const { createHmac } = require('node:crypto')
const OUT = process.argv[2] ?? 'docs/showcase', B = process.env.E2E_BASE ?? 'http://localhost:5173', PW = 'nashr-demo-2026'
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const totp = s => { let bits = ''; for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2))), ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const h = createHmac('sha1', key).update(ctr).digest(), o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0') }

;(async () => {
  const b = await chromium.launch(), errors = []
  const page = async (w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }); const p = await ctx.newPage()
    p.on('pageerror', e => errors.push(e.message)); return p }
  const signIn = async (p, email, staff) => { await p.goto(B + '/'); await p.fill('#email', email); await p.fill('#pw', PW); await p.click('button.primary')
    if (staff) { await p.waitForSelector('#code'); await p.fill('#code', totp('JBSWY3DPEHPK3PXP')); await p.click('button.primary') }
    await p.waitForSelector('.topbar') }
  const shot = async (p, name, full = false) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82, fullPage: full }) }

  // Set up a little activity through the API: a buy-now request waiting for the publisher.
  const api = (await b.newContext()).request
  await api.post(B + '/api/auth/login', { data: { email: 'demo@northwind.ae', password: PW } })
  const slot = (await (await api.get(B + '/api/slots')).json()).find(s => s.available && s.buyNowPrice && s.kind === 'single' && !s.youBid && s.outlet === 'Skyline FM')
  if (slot) await api.post(`${B}/api/slots/${slot.id}/buy-now`, { data: { brief: { advertiser: 'Northwind Business Cards', industry: 'Banking',
    message: 'Business cards for growing companies. Apply in minutes.', language: 'english', creativeToFollow: true } } })

  let p = await page(1440, 900)
  await p.goto(B + '/'); await p.waitForSelector('#email'); await shot(p, '01-sign-in')
  await signIn(p, 'demo@northwind.ae')
  await p.click('[aria-label="Next"]'); await shot(p, '02-buyer-calendar')
  await p.click('.ev >> nth=0'); await p.waitForSelector('.drawer'); await shot(p, '03-buyer-programme')
  await p.click('.drawer .row:not([disabled]) >> nth=1'); await p.waitForSelector('#amt, #offer'); await shot(p, '04-buyer-bid')
  await p.goto(B + '/#/directory'); await shot(p, '05-buyer-directory')
  await p.goto(B + '/#/campaigns'); await p.click('tbody tr >> nth=0').catch(() => {}); await shot(p, '06-buyer-campaign')
  await p.goto(B + '/#/bookings'); await p.click('tbody tr >> nth=1').catch(() => {}); await shot(p, '07-buyer-booking', true)
  await p.context().close()

  p = await page(1440, 900); await signIn(p, 'sales@skyline.ae')
  await shot(p, '08-publisher-dashboard')
  await p.goto(B + '/#/inbox'); await p.click('.tasks a >> nth=0').catch(() => {}); await shot(p, '09-publisher-decide', true)
  await p.goto(B + '/#/schedule'); await p.click('[aria-label="Next week"]'); await shot(p, '10-publisher-calendar')
  await p.goto(B + '/#/listings/new'); await shot(p, '11-publisher-add-placement')
  await p.context().close()

  p = await page(1440, 900); await signIn(p, 'ops@nashr.ae', true)
  await shot(p, '12-admin-overview')
  await p.goto(B + '/#/funds'); await shot(p, '13-admin-funds')
  await p.goto(B + '/#/settings'); await shot(p, '14-admin-settings')
  await p.context().close()

  p = await page(390, 844); await signIn(p, 'demo@northwind.ae')
  const next = p.locator('text=Show the next week'); if (await next.count()) await next.click(); await shot(p, '15-phone-calendar')
  await p.click('[aria-label="Menu"]'); await shot(p, '16-phone-menu')
  await p.context().close()

  if (errors.length) { console.error('Browser errors:', errors); process.exitCode = 1 }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
