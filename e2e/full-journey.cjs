const { twoStepViaApi, twoStepViaPage } = require('./two-step.cjs')
const { chromium } = require('playwright')
const { createHmac } = require('node:crypto')
// The whole marketplace through the screens only, with brand-new accounts:
// request access → Nashr approves → invites accepted → publisher sets up an outlet and lists → buyer finds it and requests →
// publisher receives and accepts → buyer pays and sends creative → publisher approves and sends proof → buyer confirms → money released.
// Plus an auction: two bids, bidding closes, the publisher picks the winner, the winner pays.
// Needs a running app (npm run seed, npm start, npm run dev:web). Screenshots go to E2E_OUT if set.
const out = process.env.E2E_OUT, BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const DB = process.env.DATABASE_URL ?? 'postgres://nashr:nashr@localhost:5432/nashr'
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function totp(secret, at = Date.now()) {
  let bits = ''; for (const ch of secret) bits += B32.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const h = createHmac('sha1', key).update(counter).digest(), o = h[h.length - 1] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
const run = Date.now().toString(36).slice(-5)
const PW = 'a-long-pass-phrase-2026'
const sql = async (q, a) => { const { Client } = require('pg'); const c = new Client({ connectionString: DB }); await c.connect(); try { return (await c.query(q, a)).rows } finally { await c.end() } }
let step = ''
const say = (...m) => console.log(`✓ ${step}`, ...m)

async function page(b, name) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(), errors = []
  p.on('pageerror', e => errors.push(e.message))
  p.on('response', r => { const u = new URL(r.url()); if (r.status() >= 400 && u.pathname.startsWith('/api/') && !/\/api\/(me|auth\/login)$/.test(u.pathname)) errors.push(`${r.status()} ${r.request().method()} ${u.pathname}`) })
  p.on('dialog', d => d.accept())
  p.errors = errors; p.who = name
  p.shot = async n => out && (await p.waitForTimeout(300), await p.screenshot({ path: `${out}/${n}.png`, fullPage: true }))
  return p
}
const signIn = async (p, email, code) => {
  await p.goto(BASE + '/sign-in'); await p.fill('#email', email); await p.fill('#pw', code ? 'nashr-demo-2026' : PW); await p.click('button.auth-submit')
  if (code) { // a code works once: wait for a fresh one in case another journey just used this one
    await p.waitForSelector('#code'); await p.waitForTimeout(30_000 - (Date.now() % 30_000) + 1000)
    await p.fill('#code', totp('JBSWY3DPEHPK3PXP')); await p.click('button.auth-submit') }
  await p.waitForSelector('nav.nav, .shell-main main', { timeout: 15000 })
}
const nav = async (p, label) => { await p.click(`.nav a:has-text("${label}")`); await p.waitForLoadState('networkidle') }
// Requests: pick one in the list, then open it (its booking, or the slot for an interest)
const openTask = async (p, has) => {
  await p.click(has ? `.rq-item:has-text("${has}")` : '.rq-item >> nth=0')
  const link = p.locator('.rq-detail a:has-text("Open the booking")')
  if (await link.count()) await link.first().click(); else await p.click('.rq-detail .row-flex .btn.primary')
}
const bell = async p => { await p.reload({ waitUntil: 'networkidle' }); return (await p.evaluate(async () => (await (await fetch('/api/notifications')).json()))) }

;(async () => {
  const b = await chromium.launch()
  const pubEmail = `ops-${run}@palmradio.ae`, buyEmail = `media-${run}@desertbank.ae`, buy2Email = `ads-${run}@oasisretail.ae`
  const pub = await page(b, 'publisher'), buy = await page(b, 'buyer'), buy2 = await page(b, 'buyer2'), staff = await page(b, 'staff')
  try {
    step = '1 request access'
    for (const [p, email, company, type] of [[pub, pubEmail, `Palm Radio ${run}`, 'media_outlet'], [buy, buyEmail, `Desert Bank ${run}`, 'brand'], [buy2, buy2Email, `Oasis Retail ${run}`, 'agency']]) {
      await p.goto(BASE + '/request-access'); await p.click(type === 'media_outlet' ? '.side-card:has-text("I sell airtime")' : '.side-card:has-text("I want to advertise")')
      await p.fill('#n', 'Test Person'); await p.fill('#e', email); await p.fill('#p', '+971501234567')
      await p.fill('#c', company); await p.fill('#r', 'Marketing'); if (type !== 'media_outlet') await p.selectOption('#t', type); await p.click('button:has-text("Send request")')
      await p.waitForSelector('h1:has-text("Request sent")')
    }
    say()

    step = '2 Nashr approves, invite links'
    await signIn(staff, 'ops@nashr.ae', true); await nav(staff, 'Access'); await staff.shot('f2-access')
    const links = {}
    for (const company of [`Palm Radio ${run}`, `Desert Bank ${run}`, `Oasis Retail ${run}`]) {
      const row = staff.locator(`tbody tr:has-text("${company}")`)
      await row.locator('button:has-text("Approve")').click(); await row.locator('input[readonly]').waitFor()
      links[company] = await row.locator('input[readonly]').inputValue()
    }
    say(Object.values(links).map(l => l.slice(0, 40)).join(' | '))

    step = '3 accept invites'
    for (const [p, company] of [[pub, `Palm Radio ${run}`], [buy, `Desert Bank ${run}`], [buy2, `Oasis Retail ${run}`]]) {
      await p.goto(links[company]); await p.fill('#pw', PW); await p.fill('#pw2', PW); await p.check('label.check input'); await p.click('button:has-text("Continue")')
      await p.waitForSelector('h1:has-text("You are in")')
    }
    await signIn(pub, pubEmail); await pub.shot('f3-pub-first'); await signIn(buy, buyEmail); await buy.shot('f3-buy-first'); await signIn(buy2, buy2Email)
    await twoStepViaPage(buy, BASE); await twoStepViaPage(buy2, BASE) // both buyers will pay: two-step sign-in first
    say(await pub.locator('main h1').first().textContent(), '/', await buy.locator('main h1').first().textContent())

    step = '4 publisher: outlet, payouts, tax'
    await nav(pub, 'Your business'); await pub.waitForSelector('h2:has-text("Payout account")')
    if (!(await pub.locator('#n-new').count())) await pub.click('button:has-text("outlet")')
    await pub.fill('#n-new', `Palm Radio ${run}`); await pub.selectOption('#c-new', 'radio'); await pub.check('#sec-new-Banking'); await pub.check('#sec-new-Retail')
    await pub.fill('#au-new', 'Commuters 25-45'); await pub.fill('#d-new', 'Drive-time radio across the Emirates.')
    await pub.click('button:has-text("Add outlet")'); await pub.waitForSelector('text=Outlet added.')
    // connecting payouts needs two-step sign-in: the publisher turns it on from its account page first
    await twoStepViaPage(pub, BASE); await nav(pub, 'Your business'); await pub.waitForSelector('h2:has-text("Payout account")')
    await pub.click('button:has-text("Connect payout account")'); await pub.waitForSelector('text=Payout account verified.')
    await pub.fill('#trn', '100123456700003'); await pub.click('section:has(#trn) button:has-text("Save")'); await pub.waitForSelector('text=Tax details saved.')
    await pub.shot('f4-profile'); say()

    step = '5 publisher: placements listed'
    // The placement form as Omar described it: a format, what the buyer gets, specs, sale type, kept on sale 8 weeks ahead
    const placement = async (name, sale, from, to, at, extra) => {
      await nav(pub, 'Products'); await pub.click('a:has-text("Add product")'); await pub.waitForSelector('.pl-format')
      await pub.click('.pl-format:has-text("Something else")'); await pub.fill('#n', name)
      await pub.fill('#ds', 'A 30-second spot in one ad break of the programme.'); await pub.fill('#sx', 'MP3, 30 seconds')
      await pub.click('.pl-quick button:has-text("Every day")')
      await pub.fill('#sa', from); await pub.fill('#ea', to); await pub.click('button:has-text("Add break")'); await pub.fill('#bt0', at)
      if (sale === 'quick_sale') await pub.click('.pl-sale-card:has-text("Quick sale")')
      if (sale === 'fixed') await pub.click('.pl-sale-card:has-text("Fixed price")')
      await pub.fill('#sp', '2000'); await pub.fill('#cd', '6'); if (extra) await extra()
      await pub.shot(`f5-${sale}`)
      await pub.click('button:has-text("Save placement")'); await pub.waitForSelector('h1:has-text("is saved")')
      const lead = await pub.locator('.pl-done .lead').textContent(); if (!/slots are on sale/.test(lead)) throw new Error(`${name}: ${lead}`)
    }
    await placement('Morning Drive', 'auction', '07:00', '09:00', '07:30', async () => { await pub.fill('#bn', '3500') })
    await placement('Evening Drive', 'quick_sale', '17:00', '19:00', '17:30')
    await placement('Lunch Hour', 'fixed', '12:00', '13:00', '12:30')
    await pub.shot('f5-listings')
    const listed = await sql(`select p.name, count(*)::int n, min(s.starts_at) first from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
                              where o.name = $1 group by p.name`, [`Palm Radio ${run}`])
    say(listed.map(r => `${r.name}: ${r.n} slots from ${r.first.toISOString().slice(0, 16)}`).join(', '))
    if (!listed.length) throw new Error('nothing was put on sale')

    step = '6 buyer finds it on the calendar'
    await nav(buy, 'Calendar'); await buy.waitForSelector('.cv-head')
    await buy.click('.cv-views button:has-text("List")'); await buy.fill('.cv-filters input[type=search]', `Palm Radio ${run}`)
    await buy.waitForSelector(`.cv-table tbody tr:has-text("Morning Drive")`, { timeout: 15000 }); await buy.shot('f6-buyer-finds')
    say(await buy.locator('.cv-table tbody tr').count(), 'rows')

    step = '7 buyer: buy-now request'
    const brief = async p => { await p.fill('#adv', 'Desert Bank'); await p.fill('#msg', 'Open a business account in ten minutes.') }
    await buy.click(`.cv-table tbody tr:has-text("Morning Drive") .cv-act >> nth=0`); await buy.waitForSelector('.drawer h2')
    await brief(buy); await buy.shot('f7-drawer')
    await buy.click('.drawer-f .btn:has-text("Request at")'); await buy.waitForSelector('.drawer .ok, .drawer .error')
    const sent = await buy.locator('.drawer .ok, .drawer .error').first().textContent(); if (!/Request sent/.test(sent)) throw new Error(sent)
    await buy.click('[aria-label="Close"]'); say(sent)

    step = '8 publisher receives it'
    const pn = await bell(pub); say('bell:', pn.items?.map?.(n => n.kind).join(',') ?? JSON.stringify(pn).slice(0, 120))
    await nav(pub, 'Requests'); await pub.waitForSelector('.rq-item'); await pub.shot('f8-inbox')
    await openTask(pub); await pub.waitForSelector('text=Booking brief'); await pub.shot('f8-request')

    step = '9 publisher accepts on screen'
    await pub.click('button:has-text("Accept")'); await pub.waitForSelector('text=Accepted. The buyer'); const dealUrl = pub.url(); say(dealUrl)

    step = '10 buyer is told, pays'
    const bn = await bell(buy); say('bell:', bn.items?.map?.(n => n.kind).join(',') ?? JSON.stringify(bn).slice(0, 120))
    await nav(buy, 'Bookings'); await buy.shot('f10-bookings'); await buy.click('.table tbody tr >> nth=0'); await buy.waitForSelector('.sum')
    await buy.selectOption('#card', 'pm_card_4242'); await buy.click('button:has-text("Pay")'); await buy.waitForSelector('main .page-title:has-text("Payment secured")')
    const dealId = buy.url().split('/').pop(); say(dealId)

    step = '11 creative: buyer sends, publisher approves'
    await buy.setInputFiles('#file', { name: 'spot.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3 demo audio') }); await buy.waitForSelector('text=Version 1 sent')
    await pub.goto(BASE + `/deals/${dealId}`); await pub.waitForSelector('text=Waiting for your review'); await pub.click('.section button:has-text("Approve")'); await pub.waitForSelector('text=Creative approved')
    say()

    step = '12 the ad runs, publisher sends proof on screen'
    await sql(`update slots set starts_at = now() - interval '2 hours', ends_at = now() - interval '2 hours' + interval '30 seconds' where id = (select slot_id from deals where id = $1)`, [dealId])
    await pub.reload(); await pub.waitForSelector('button:has-text("Send proof")'); await pub.shot('f12-proof-form')
    for (const f of await pub.locator('.section input[id^="p-"]').all()) {
      if ((await f.getAttribute('type')) === 'file') await f.setInputFiles({ name: 'as-run.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 as run') })
      else await f.fill('Aired 07:30 as booked')
    }
    await pub.waitForTimeout(800); await pub.click('button:has-text("Send proof")'); await pub.waitForSelector('text=Proof sent'); say()

    step = '13 buyer approves proof, money released'
    await buy.reload(); await buy.waitForSelector('button:has-text("Approve proof")'); await buy.click('button:has-text("Approve proof")')
    await buy.waitForSelector('main .page-title:has-text("Released")'); await buy.shot('f13-released')
    await nav(pub, 'Balances'); await pub.shot('f13-earnings'); say()

    step = '14 auction: two buyers bid, bidding closes, publisher picks'
    await buy.goto(BASE + `/calendar?view=list&q=${encodeURIComponent(`Palm Radio ${run}`)}`); await buy.waitForSelector('.cv-table tbody tr:has-text("Morning Drive")')
    const target = await buy.locator('.cv-table tbody tr:has-text("Morning Drive")').nth(1).getAttribute('data-slot')
    const open = async p => { await p.goto(BASE + `/calendar?view=list&q=${encodeURIComponent(`Palm Radio ${run}`)}`); await p.waitForSelector(`tr[data-slot="${target}"]`)
      await p.click(`tr[data-slot="${target}"] .cv-act`); await p.waitForSelector('.drawer h2') }
    const result = async p => { await p.waitForSelector('.drawer .ok, .drawer .warn, .drawer .error'); return p.locator('.drawer .ok, .drawer .warn, .drawer .error').first().textContent() }
    // buyer 1 turns on auto-bid with a 3,000 cap
    await open(buy); await brief(buy); await buy.click('.bid-mode button:has-text("Auto-bid")'); await buy.fill('#max', '3000'); await buy.shot('f14-autobid')
    await buy.click('.drawer-f .btn.primary'); let r = await result(buy); if (!/Auto-bid is on/.test(r)) throw new Error('buyer1: ' + r)
    // buyer 2 bids 2,300 once: the auto-bid answers at once and buyer 2 is told
    await open(buy2); await brief(buy2); await buy2.fill('#amt', '2300'); await buy2.click('.drawer-f .btn.primary'); r = await result(buy2)
    if (!/auto-bid is higher/.test(r)) throw new Error('buyer2 single bid: ' + r)
    // buyer 2 sets a 4,000 maximum and takes the lead one step above buyer 1's cap
    await buy2.click('.bid-mode button:has-text("Auto-bid")'); await buy2.fill('#max', '4000'); await buy2.click('.drawer-f .btn.primary'); r = await result(buy2)
    if (!/You lead at AED 3,090/.test(r)) throw new Error('buyer2 auto-bid: ' + r)
    await open(buy); await buy.waitForSelector('.bid-status.outbid'); await buy.shot('f14-cap-passed')
    say(await buy.locator('.bid-status').textContent())
    const ob = await bell(buy); if (!JSON.stringify(ob).includes('bid.outbid')) throw new Error('buyer 1 was not told the cap was passed')
    await sql(`update slots set closes_at = now() - interval '1 minute' where id = $1`, [target])
    for (let i = 0; i < 30 && !(await sql(`select 1 from deals where slot_id = $1`, [target])).length; i++) await pub.waitForTimeout(2000)
    const ad = (await sql(`select id, status from deals where slot_id = $1`, [target]))[0]; if (!ad) throw new Error('bidding closed but no deal was opened')
    await nav(pub, 'Requests'); await pub.shot('f14-inbox'); await pub.goto(BASE + `/deals/${ad.id}`); await pub.waitForSelector('button:has-text("Accept")'); await pub.shot('f14-choose')
    await pub.click('button:has-text("Accept")'); await pub.waitForSelector('text=Accepted. The buyer')
    await buy2.goto(BASE + `/bookings/${ad.id}`); await buy2.waitForSelector('.sum'); await buy2.selectOption('#card', 'pm_card_4242'); await buy2.click('button:has-text("Pay")')
    await buy2.waitForSelector('main .page-title:has-text("Payment secured")'); say(ad.status)

    step = '15 quick sale: interest, publisher accepts'
    await buy.goto(BASE + `/calendar?view=list&q=${encodeURIComponent(`Palm Radio ${run}`)}`); await buy.waitForSelector('.cv-table tbody tr:has-text("Evening Drive")')
    await buy.click('.cv-table tbody tr:has-text("Evening Drive") .cv-act >> nth=0'); await buy.waitForSelector('.drawer h2'); await brief(buy)
    await buy.click('.drawer-f .btn.primary'); await buy.waitForSelector('.drawer .ok, .drawer .error'); say(await buy.locator('.drawer .ok, .drawer .error').first().textContent())
    const qn = await bell(pub); say('publisher bell:', JSON.stringify(qn).slice(0, 200))
    await nav(pub, 'Requests'); await pub.shot('f15-inbox')
    await pub.waitForSelector('.rq-item:has-text("Buyer interested")', { timeout: 10000 }).catch(() => { throw new Error('the publisher has no task for the interest') })
    await openTask(pub, 'Buyer interested'); await pub.waitForSelector('.brief-mini'); await pub.shot('f15-slot')
    await pub.click('td button:has-text("Accept")'); await pub.waitForURL(/\/deals\//); await pub.waitForSelector('text=Booking brief'); await pub.shot('f15-deal')
    const qb = await bell(buy); if (!JSON.stringify(qb).includes('deal.awaiting_payment')) throw new Error('the buyer was not told')
    await buy.goto(BASE + '/bookings'); await buy.click('.table tbody tr >> nth=0'); await buy.waitForSelector('.sum')
    await buy.selectOption('#card', 'pm_card_4242'); await buy.click('button:has-text("Pay")'); await buy.waitForSelector('main .page-title:has-text("Payment secured")')
    say()

    step = '16 fixed price: book now, each side sees the other, publisher confirms, buyer pays'
    await buy2.goto(BASE + `/calendar?view=list&q=${encodeURIComponent(`Palm Radio ${run}`)}`); await buy2.waitForSelector('.cv-table tbody tr:has-text("Lunch Hour")')
    await buy2.click('.cv-table tbody tr:has-text("Lunch Hour") .cv-act >> nth=0'); await buy2.waitForSelector('.drawer h2')
    if (!(await buy2.locator('.drawer-seller:has-text("Palm Radio")').count())) throw new Error('the buyer does not see who sells it')
    await brief(buy2); await buy2.shot('f16-book'); await buy2.click('.drawer-f .btn.primary:has-text("Book for")')
    const booked = await buy2.locator('.drawer .ok, .drawer .error').first().textContent(); if (!/Booked/.test(booked)) throw new Error(booked)
    await nav(pub, 'Requests'); await pub.waitForSelector('.rq-item:has-text("Booked at your fixed price")'); await openTask(pub, 'Booked at your fixed price')
    await pub.waitForSelector('.co-card:has-text("Oasis Retail")'); await pub.shot('f16-buyer-profile')
    if (/@|\+971/.test(await pub.locator('.co-card').textContent())) throw new Error('contact details shown before purchase')
    await pub.click('button:has-text("Accept")'); await pub.waitForSelector('text=Accepted. The buyer')
    await buy2.goto(BASE + '/bookings'); await buy2.click('.table tbody tr:has-text("pay now") >> nth=0'); await buy2.waitForSelector('.sum')
    await buy2.selectOption('#card', 'pm_card_4242'); await buy2.click('button:has-text("Pay")'); await buy2.waitForSelector('main .page-title:has-text("Payment secured")')
    say(booked)

    for (const p of [pub, buy, buy2, staff]) if (p.errors.length) throw new Error(`${p.who} errors: ${p.errors.join(' | ')}`)
    console.log('ALL GOOD')
  } catch (e) {
    console.error(`✗ ${step}:`, e.message.split('\n')[0])
    for (const p of [pub, buy, buy2, staff]) { if (p.errors.length) console.error(`  ${p.who} errors:`, p.errors.join(' | ')); out && await p.screenshot({ path: `${out}/fail-${p.who}.png`, fullPage: true }).catch(() => {}) }
    process.exitCode = 1
  }
  await b.close()
})()
