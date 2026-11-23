const { chromium } = require('playwright')
// The guided tour (owner's "Buying moves to the Directory"): the first sign-in welcome, each step done by the user, pause and
// resume, the last popup, and the Get started list. Buyer, then publisher. Needs npm run seed, npm start, npm run dev:web.
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173', out = process.env.E2E_OUT
const say = (...a) => console.log('✓', ...a)
;(async () => {
  const b = await chromium.launch(), errors = []
  const signIn = async (email) => { const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    p.on('pageerror', e => errors.push(e.message))
    await p.goto(BASE + '/sign-in'); await p.fill('#email', email); await p.fill('#pw', 'nashr-demo-2026'); await p.click('button.auth-submit'); return p }
  const pop = p => p.locator('.tour-pop')
  const expectStep = async (p, n, words) => { await p.waitForSelector(`.tour-pop:has-text("Step ${n} of")`); const txt = await pop(p).textContent()
    if (!txt.includes(words)) throw new Error(`step ${n}: expected "${words}", got "${txt}"`) }

  // ---- buyer ----
  const p = await signIn('demo@northwind.ae')
  await p.waitForSelector('.tour-card:has-text("Want a 2-minute tour?")'); say('welcome popup')
  await p.click('.tour-card button:has-text("Start tour")')
  await expectStep(p, 1, 'find and buy media'); out && await p.screenshot({ path: out + '/t1.png' })
  await p.click('.side-nav a[href="/directory"]')
  await expectStep(p, 2, 'Browse by outlet or by product'); say('step 1 → 2 by clicking Directory')
  // clicking elsewhere pauses it; Resume brings it back
  await p.click('h1'); await p.waitForSelector('.tour-paused'); say('paused'); out && await p.screenshot({ path: out + '/t2-paused.png' })
  await p.click('.tour-paused button:has-text("Resume")'); await expectStep(p, 2, 'Browse by outlet')
  await p.click('.tour-pop button:has-text("Next")')
  await expectStep(p, 3, "Open an outlet's calendar")
  await p.locator('.outlet-card a.badge.on').first().click()
  await p.waitForSelector('.tour-pop:has-text("Click a price to bid")'); say('step 3: outlet calendar'); out && await p.screenshot({ path: out + '/t3.png' })
  await p.locator('.oc-cal .cv-cell:not(.closed)').first().click()
  if (!(await p.locator('.drawer').count())) await p.waitForSelector('.drawer')
  // several listings in that cell: a short list to pick from, then the drawer
  if (await p.locator('.drawer .list button.row').count()) await p.locator('.drawer .list button.row:not([disabled])').first().click()
  await expectStep(p, 4, "We won't send anything now"); out && await p.screenshot({ path: out + '/t4.png' })
  await p.click('.tour-pop button:has-text("Next")')
  await expectStep(p, 5, 'one budget and one brief')
  if (await p.locator('.drawer h2').count()) throw new Error('the bid drawer should close at Next, with nothing sent')
  await p.click('.tour-pop button:has-text("Next")')
  await expectStep(p, 6, 'Track everything')
  await p.click('.tour-pop button:has-text("Finish")')
  await p.waitForSelector('.tour-card:has-text("You\'re set")'); await p.click('.tour-card button:has-text("Go to Dashboard")')
  await p.waitForSelector('.get-started'); say('finished; Get started on the Dashboard:', (await p.locator('.get-started li').allTextContents()).join(' | '))
  out && await p.screenshot({ path: out + '/t5-dashboard.png' })
  // replay from the account menu, then skip with the confirmation
  await p.click('.name-btn'); await p.click('.name-pop button:has-text("Take the tutorial again")')
  await expectStep(p, 1, 'find and buy media')
  await p.click('.tour-pop button:has-text("Skip tutorial")'); await p.waitForSelector('.tour-skip:has-text("replay it any time")')
  await p.click('.tour-skip button:has-text("Skip")'); await p.waitForTimeout(300)
  if (await p.locator('.tour-pop, .tour-paused').count()) throw new Error('skip did not end the tour')
  say('replay and skip')
  // a new visit does not offer it again
  await p.reload(); await p.waitForTimeout(1500); if (await p.locator('.tour-card').count()) throw new Error('the welcome came back')

  // ---- publisher ----
  const s = await signIn('sales@skyline.ae')
  await s.waitForSelector('.tour-card'); await s.click('.tour-card button:has-text("Start tour")')
  await expectStep(s, 1, 'Your outlets'); await s.click('.side-nav a[href="/listings"]')
  await expectStep(s, 2, 'Start by adding your outlet'); await s.click('.tour-pop button:has-text("Next")')
  await expectStep(s, 3, 'Put a product on sale'); await s.click('.tour-pop button:has-text("Next")')
  await expectStep(s, 4, 'Bids arrive here'); await s.click('.tour-pop button:has-text("Next")')
  await expectStep(s, 5, "what you'll be paid"); await s.click('.tour-pop button:has-text("Finish")')
  await s.waitForSelector('.tour-card:has-text("You\'re set")'); say('publisher tour')

  await b.close()
  if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
  console.log('ALL GOOD')
})().catch(e => { console.error(e); process.exit(1) })
