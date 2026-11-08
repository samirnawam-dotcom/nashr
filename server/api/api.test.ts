import { beforeEach, describe, expect, test } from 'vitest'
import { matches } from '../shared/slot-filter.js'
import { pool, tx } from '../core/db.js'
import { buildApp, resetRateLimits } from './app.js'
import { FakeProvider } from '../payments/provider.js'
import { acceptInvite, approveAccess, inviteStaff, requestAccess } from '../auth/access.js'
import { totp } from '../auth/crypto.js'
import { createPlacement, generateSlots } from '../catalog/placements.js'
import { AED, BRIEF, T, reset } from '../test/helpers.js'
import { DiskStorage } from '../files/storage.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sweep } from '../marketplace/sweeper.js'
import { reconcile, runMoneyOps } from '../payments/payments.js'
import { balance } from '../payments/ledger.js'
import { addWorkingDays } from '../core/market.js'
import { createHmac } from 'node:crypto'
import { StripeProvider } from '../payments/stripe.js'

let now = T('2026-11-01T08:00:00Z')
const provider = new FakeProvider()
const app = buildApp({ provider, clock: () => now, storage: new DiskStorage(mkdtempSync(join(tmpdir(), 'nashr-files-'))) })
const PASS = 'correct horse battery staple'

type Who = { cookie: string; companyId: string }
let founder: Who, admin: Who, buyerA: Who, buyerB: Who, sellerX: Who, sellerY: Who, slotX: string, slotY: string

async function signIn(email: string, totpCode?: string) {
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASS, totpCode } })
  expect(r.statusCode, r.body).toBe(200)
  return String(r.headers['set-cookie']).split(';')[0]
}
async function member(company: string, email: string, type: 'brand' | 'media_outlet'): Promise<Who> {
  const id = await tx(c => requestAccess(c, { name: 'Sara', email, phone: '+971500000000', role: 'Manager', company, companyType: type }, now))
  const { companyId, inviteToken } = await tx(c => approveAccess(c, id, 'admin:test', now))
  await tx(c => acceptInvite(c, { token: inviteToken, password: PASS }, now))
  return { cookie: await signIn(email), companyId }
}
async function staff(email: string, role: 'admin' | 'founder'): Promise<Who> {
  const { inviteToken, userId } = await tx(c => inviteStaff(c, { email, name: role, role }, 'system', now))
  const first = await tx(c => acceptInvite(c, { token: inviteToken, password: PASS }, now))
  expect(first.needsTotp).toBe(true)
  const secret = (first as any).totpSecret
  await tx(c => acceptInvite(c, { token: inviteToken, password: PASS, totpCode: totp(secret, now) }, now))
  const companyId = (await pool.query(`select company_id from users where id = $1`, [userId])).rows[0].company_id
  return { cookie: await signIn(email, totp(secret, now)), companyId, secret } as Who & { secret: string }
}
async function listSlot(seller: Who, name: string) {
  await pool.query(`update companies set payouts_enabled = true, vat_registered = true where id = $1`, [seller.companyId])
  const outlet = (await pool.query(`insert into outlets (company_id, name, channel) values ($1, $2, 'radio') returning id`, [seller.companyId, name])).rows[0].id
  const placement = await tx(c => createPlacement(c, { outletId: outlet, name: 'Morning Markets', saleType: 'auction', days: [1, 2, 3, 4, 5],
    startsAt: '06:30', endsAt: '09:00', breaks: [{ label: 'Break 2', at: '07:15', seconds: 30 }], startingPrice: AED(3_500), buyNowPrice: AED(5_500),
    reservePrice: AED(4_000), creativeLeadHours: 48, closeLeadHours: 120 }, 'seller', now))
  await tx(c => generateSlots(c, placement, '2026-11-09', 1, now))
  return (await pool.query(`select id from slots where placement_id = $1`, [placement])).rows[0].id
}
const call = (who: Who | null, method: any, url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as any, headers: who ? { cookie: who.cookie } : {} })

beforeEach(async () => {
  now = T('2026-11-01T08:00:00Z')
  await reset()
  resetRateLimits()
  provider.reset()
  founder = await staff('omar@nashr.ae', 'founder')
  admin = await staff('ops@nashr.ae', 'admin')
  buyerA = await member('Northwind Fintech', 'sara@northwind.ae', 'brand')
  buyerB = await member('Al Futtaim', 'ali@alfuttaim.ae', 'brand')
  sellerX = await member('Skyline FM', 'sales@skyline.ae', 'media_outlet')
  sellerY = await member('Gulf Radio', 'sales@gulfradio.ae', 'media_outlet')
  slotX = await listSlot(sellerX, 'Skyline FM')
  slotY = await listSlot(sellerY, 'Gulf Radio')
})

describe('invite-only access (scenario 14)', () => {
  test('free emails are refused; business emails reach the admin', async () => {
    const body = { name: 'Huda', phone: '+971501112222', role: 'Media buyer', company: 'Brand Co', companyType: 'brand' }
    expect((await call(null, 'POST', '/api/access-requests', { ...body, email: 'huda@gmail.com' })).json().error).toMatch('business email')
    expect((await call(null, 'POST', '/api/access-requests', { ...body, email: 'huda@brandco.ae' })).statusCode).toBe(200)
    // five fields only: anything else is dropped before it reaches the database
    expect((await call(null, 'POST', '/api/access-requests', { ...body, email: 'x@brandco.ae', status: 'approved' })).statusCode).toBe(200)
    expect((await pool.query(`select status from access_requests where email = 'x@brandco.ae'`)).rows[0].status).toBe('pending')
    const list = (await call(admin, 'GET', '/api/admin/access-requests')).json()
    expect(list.find((r: any) => r.email === 'huda@brandco.ae').status).toBe('pending')
  })

  test('approval gives a working invite link; staff cannot sign in without the authenticator code', async () => {
    const id = (await call(null, 'POST', '/api/access-requests', { name: 'Huda', email: 'huda@brandco.ae', phone: '+971501112222', role: 'Buyer', company: 'Brand Co', companyType: 'brand' })).json().id
    const link = (await call(admin, 'POST', `/api/admin/access-requests/${id}/approve`)).json().inviteLink
    const token = link.split('#')[1]
    expect((await call(null, 'POST', '/api/auth/invite', { token, password: 'short' })).json().error).toMatch('12 characters')
    expect((await call(null, 'POST', '/api/auth/invite', { token, password: PASS })).statusCode).toBe(200)
    expect((await call(null, 'POST', '/api/auth/invite', { token, password: PASS })).json().error).toMatch('expired')
    expect((await call(null, 'POST', '/api/auth/login', { email: 'huda@brandco.ae', password: 'wrong password!!' })).json().error).toBe('Email or password is not right.')
    expect((await call(null, 'POST', '/api/auth/login', { email: 'omar@nashr.ae', password: PASS })).json().error).toMatch('authenticator')
  })

  test('a lost invite link can be replaced until the person signs up; the old link stops working', async () => {
    const id = (await call(null, 'POST', '/api/access-requests', { name: 'Huda', email: 'huda@brandco.ae', phone: '+971501112222', role: 'Buyer', company: 'Brand Co', companyType: 'brand' })).json().id
    const first = (await call(admin, 'POST', `/api/admin/access-requests/${id}/approve`)).json().inviteLink.split('#')[1]
    expect((await call(admin, 'GET', '/api/admin/access-requests')).json().find((r: any) => r.id === id).invite_pending).toBe(true)
    const second = (await call(admin, 'POST', `/api/admin/access-requests/${id}/invite`)).json().inviteLink.split('#')[1]
    expect((await call(null, 'POST', '/api/auth/invite', { token: first, password: PASS })).json().error).toMatch('expired')
    expect((await call(null, 'POST', '/api/auth/invite', { token: second, password: PASS })).statusCode).toBe(200)
    expect((await call(admin, 'GET', '/api/admin/access-requests')).json().find((r: any) => r.id === id).invite_pending).toBe(false)
    expect((await call(admin, 'POST', `/api/admin/access-requests/${id}/invite`)).json().error).toMatch('already set their password')
    expect((await call(buyerA, 'POST', `/api/admin/access-requests/${id}/invite`)).statusCode).toBe(403)
  })

  test('for testing, STAFF_TWO_STEP=off lets staff sign in and accept invites with a password only; the wrong password still fails', async () => {
    process.env.STAFF_TWO_STEP = 'off'
    try {
      expect((await call(null, 'POST', '/api/auth/login', { email: 'omar@nashr.ae', password: 'wrong password!!' })).json().error).toBe('Email or password is not right.')
      const r = await call(null, 'POST', '/api/auth/login', { email: 'omar@nashr.ae', password: PASS })
      expect(r.statusCode).toBe(200)
      const cookie = String(r.headers['set-cookie']).split(';')[0]
      expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().role).toBe('founder')
      const link = (await call(founder, 'POST', '/api/admin/staff', { email: 'ops2@nashr.ae', name: 'Ops', role: 'admin' })).json().inviteLink
      const accepted = (await call(null, 'POST', '/api/auth/invite', { token: link.split('#')[1], password: PASS })).json()
      expect(accepted.needsTotp).toBe(false)
      expect((await call(null, 'POST', '/api/auth/login', { email: 'ops2@nashr.ae', password: PASS })).statusCode).toBe(200)
    } finally { delete process.env.STAFF_TWO_STEP }
    expect((await call(null, 'POST', '/api/auth/login', { email: 'omar@nashr.ae', password: PASS })).json().error).toMatch('authenticator') // back on by default
  })
})

describe('who can see what (SPEC 5.5, scenario 15)', () => {
  test('every route refuses the wrong role, and other companies\' records look like they do not exist', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    const cases: [Who | null, string, string, number][] = [
      [null, 'GET', '/api/slots', 200],                          // visitors can browse before they sign in
      [null, 'POST', `/api/slots/${slotX}/bids`, 401],           // but must sign in to act
      [null, 'POST', `/api/slots/${slotX}/buy-now`, 401],
      [null, 'GET', '/api/deals', 401],
      [null, 'GET', '/api/campaigns', 401],
      [null, 'GET', '/api/waitlist', 401],
      [sellerX, 'GET', '/api/slots', 403],                       // sellers see only their own calendar
      [sellerX, 'GET', '/api/directory', 403],                   // and not the directory
      [buyerA, 'GET', '/api/seller/deals', 403],
      [buyerA, 'GET', '/api/admin/deals', 403],
      [sellerX, 'PUT', '/api/admin/settings/min_step_bp', 403],
      [buyerB, 'GET', `/api/deals/${deal}`, 404],                // another buyer's booking
      [buyerB, 'POST', `/api/deals/${deal}/pay`, 404],
      [buyerB, 'POST', `/api/deals/${deal}/cancel`, 404],
      [sellerY, 'GET', `/api/seller/deals/${deal}`, 404],        // another seller's booking
      [sellerY, 'POST', `/api/seller/deals/${deal}/accept`, 404],
      [sellerY, 'POST', `/api/seller/slots/${slotX}/choose`, 404],
      [buyerA, 'GET', '/api/deals/not-a-uuid', 404],
    ]
    for (const [who, method, url, code] of cases) {
      const payload = method === 'GET' ? undefined : url.endsWith('pay') ? { paymentMethod: 'pm_card_4242' } : url.endsWith('choose') ? { bidId: deal } : url.includes('settings') ? { value: 1 } : url.endsWith('bids') ? { amount: AED(4_000) } : {}
      expect((await call(who, method, url, payload)).statusCode, `${method} ${url}`).toBe(code)
    }
    expect((await call(sellerX, 'GET', `/api/seller/deals/${deal}`)).statusCode).toBe(200)
  })

  test('visitors browse the calendar, a slot, the directory and an outlet with no per-buyer fields', async () => {
    await call(buyerB, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(3_600), maxAmount: AED(4_200), brief: BRIEF })
    const slots = (await call(null, 'GET', '/api/slots?from=2026-11-01&to=2026-12-01')).json()
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) expect(s).toMatchObject({ youLead: false, youBid: false })   // an unbid slot must not read as "you lead"
    const one = (await call(null, 'GET', `/api/slots/${slotX}`)).json()
    expect(one).toMatchObject({ topBid: AED(3_600), youLead: false, yourMax: null, briefOnFile: false })
    expect(JSON.stringify(slots) + JSON.stringify(one)).not.toMatch(/reserve|4200|420000|alfuttaim|Al Futtaim/i)
    const dir = (await call(null, 'GET', '/api/directory')).json()
    const outlet = dir.find((o: any) => o.name === 'Skyline FM')
    expect((await call(null, 'GET', `/api/outlets/${outlet.id}`)).json().placements.length).toBe(1)
    expect((await call(null, 'POST', `/api/outlets/${outlet.id}/quote`, { message: 'Hi' })).statusCode).toBe(401)
    expect((await call(sellerX, 'GET', `/api/outlets/${outlet.id}`)).statusCode).toBe(403)        // signed-in sellers still cannot
  })

  test('buyers never see reserve prices, commission, other bidders or contact details; sellers see the company, never contacts', async () => {
    await call(buyerB, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(3_600), brief: BRIEF })
    const slots = (await call(buyerA, 'GET', '/api/slots?from=2026-11-01&to=2026-12-01')).body
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json()
    const mine = (await call(buyerA, 'GET', `/api/deals/${deal.id}`)).body
    for (const body of [slots, mine]) expect(body).not.toMatch(/reserve|commission|"fee"|youReceive|@|\+971|Al Futtaim|top_buyer/i)
    expect(JSON.parse(mine)).toMatchObject({ status: 'awaiting_publisher', price: AED(5_500), vat: AED(275), total: AED(5_775) })
    const seller = (await call(sellerX, 'GET', `/api/seller/deals/${deal.id}`)).json()
    expect(seller).toMatchObject({ buyer: { company: 'Northwind Fintech' }, money: { fee: AED(660), youReceive: AED(5_115) } })
    expect(seller.otherBids).toEqual([expect.objectContaining({ label: 'Bidder B', company: 'Al Futtaim', amount: AED(3_600) })])
    expect(JSON.stringify(seller)).not.toMatch(/@|\+971/)
  })
})

describe('admin', () => {
  test('view an account read-only; every page is logged; changes are blocked', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    expect((await call(admin, 'POST', `/api/admin/view-as/${sellerX.companyId}`)).json()).toEqual({ viewing: 'Skyline FM', viewOnly: true })
    expect((await call(admin, 'GET', '/api/me')).json()).toMatchObject({ role: 'seller', company: { name: 'Skyline FM' } })
    expect((await call(admin, 'GET', `/api/seller/deals/${deal}`)).statusCode).toBe(200)
    expect((await call(admin, 'POST', `/api/seller/deals/${deal}/accept`)).json().error).toMatch('View only')
    const logged = (await pool.query(`select action from audit_log where entity_id = $1 and action like 'view_as.%'`, [sellerX.companyId])).rows.map(r => r.action)
    expect(logged).toEqual(['view_as.started', 'view_as.page', 'view_as.page'])
    expect((await call(admin, 'DELETE', '/api/admin/view-as')).statusCode).toBe(200)
    expect((await call(admin, 'GET', `/api/seller/deals/${deal}`)).statusCode).toBe(403)
  })

  test('financial settings are the founder\'s; commission per publisher is a setting with history', async () => {
    expect((await call(admin, 'PUT', '/api/admin/settings/nashr_vat_registered', { value: true })).statusCode).toBe(403)
    expect((await call(admin, 'PUT', '/api/admin/settings/seller_window_hours', { value: 36 })).statusCode).toBe(200)
    expect((await call(founder, 'PUT', `/api/admin/settings/commission:${sellerX.companyId}`, { value: 1000 })).statusCode).toBe(200)
    expect((await call(admin, 'PUT', '/api/admin/settings/made_up', { value: 1 })).json().error).toBe('Unknown setting.')
  })
})

test('a booking end to end through the API: request, accept, pay; fees frozen from the founder\'s rate', async () => {
  await call(founder, 'PUT', `/api/admin/settings/commission:${sellerX.companyId}`, { value: 1000 })
  now = T('2026-11-01T09:00:00Z')
  expect((await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, {})).json().error).toMatch('booking brief is required')
  const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
  expect((await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)).json()).toMatchObject({ status: 'awaiting_payment', money: { commissionBp: 1000 } })
  expect((await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_0002' })).json()).toMatchObject({ status: 'failed' })
  expect((await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_4242' })).json()).toMatchObject({ status: 'succeeded' })
  expect((await call(buyerA, 'GET', `/api/deals/${deal}`)).json().status).toBe('payment_secured')
  const docs = (await pool.query(`select type from documents where deal_id = $1 order by ctid`, [deal])).rows.map(r => r.type)
  expect(docs).toEqual(['order', 'receipt', 'media_invoice'])
})

describe('buyer screens', () => {
  const upload = (who: Who, bytes: string, type: string, name = 'spot.mp3') =>
    app.inject({ method: 'POST', url: '/api/files', payload: Buffer.from(bytes), headers: { cookie: who.cookie, 'content-type': type, 'x-file-name': name } })

  test('directory: three price levels, each labelled; off-platform outlets ask for a quote', async () => {
    const off = (await pool.query(`insert into outlets (name, channel, est_low, est_high) values ('Arabian Business', 'print', $1, $2) returning id`, [AED(8_000), AED(12_000)])).rows[0].id
    const outletX = (await pool.query(`select o.id from outlets o where company_id = $1`, [sellerX.companyId])).rows[0].id
    // three completed sales on Nashr make a typical price
    const bid = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json()
    const bidId = (await pool.query(`select bid_id from deals where id = $1`, [bid.id])).rows[0].bid_id
    for (const amount of [AED(4_000), AED(5_000), AED(6_000)])
      await pool.query(`insert into deals (slot_id, bid_id, buyer_id, seller_id, kind, status, amount, currency, created_at) values ($1, $2, $3, $4, 'auction', 'paid_out', $5, 'AED', now())`,
        [slotX, bidId, buyerA.companyId, sellerX.companyId, amount])
    const dir = (await call(buyerA, 'GET', '/api/directory')).json()
    expect(dir.find((o: any) => o.id === off)).toMatchObject({ onNashr: false, price: { level: 'estimate', label: 'Estimate, unconfirmed', from: AED(8_000) } })
    expect(dir.find((o: any) => o.id === outletX)).toMatchObject({ onNashr: true, price: { level: 'typical', label: 'Typical on Nashr', from: AED(4_000), to: AED(6_000) } })
    expect(dir.find((o: any) => o.name === 'Gulf Radio')).toMatchObject({ price: { level: 'rate', label: "Publisher's rate", from: AED(3_500) } })
    expect((await call(buyerA, 'GET', `/api/outlets/${outletX}`)).json()).toMatchObject({ completedSales: 3, placements: [{ name: 'Morning Markets', openSlots: 1 }] })
    expect((await call(sellerX, 'GET', `/api/outlets/${outletX}`)).statusCode).toBe(403)

    expect((await call(buyerA, 'POST', `/api/outlets/${off}/quote`, { message: 'Call me on 050 123 4567' })).json().error).toMatch('not allowed')
    expect((await call(buyerA, 'POST', `/api/outlets/${off}/quote`, { message: 'Full page in December?' })).statusCode).toBe(200)
    expect((await call(admin, 'GET', '/api/notifications')).json().items[0]).toMatchObject({ kind: 'quote.requested', data: { outlet: 'Arabian Business' } })
  })

  test('campaigns: bookings tagged to a campaign count against its budget; nobody else\'s campaign can be used', async () => {
    const c = (await call(buyerA, 'POST', '/api/campaigns', { name: 'Q4 launch', budget: AED(50_000), launchDate: '2026-11-15' })).json().id
    const other = (await call(buyerB, 'POST', '/api/campaigns', { name: 'Theirs', budget: AED(10_000) })).json().id
    expect((await call(buyerA, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(3_500), brief: BRIEF, campaignId: other })).json().error).toMatch('your active campaigns')
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF, campaignId: c })).json().id
    const outletX = (await pool.query(`select id from outlets where company_id = $1`, [sellerX.companyId])).rows[0].id
    expect((await call(buyerA, 'PUT', `/api/campaigns/${c}/items`, { items: [{ outletId: outletX, planned: AED(20_000) }] })).statusCode).toBe(200)
    expect((await call(buyerA, 'GET', `/api/campaigns/${c}`)).json()).toMatchObject({ committed: 0, pending: AED(5_500), planned: AED(20_000) })
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    expect((await call(buyerA, 'GET', `/api/campaigns/${c}`)).json()).toMatchObject({ committed: AED(5_500), remaining: AED(44_500),
      items: [{ outlet: 'Skyline FM', planned: AED(20_000), committed: AED(5_500) }], bookings: [{ id: deal }] })
    expect((await call(buyerB, 'GET', `/api/campaigns/${c}`)).statusCode).toBe(404)
    expect((await call(buyerB, 'PUT', `/api/campaigns/${c}`, { budget: 1 })).statusCode).toBe(404)
  })

  test('creative upload: private file, seen by the publisher on the deal, nobody else; booking page and documents', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    const f = (await upload(buyerA, 'ID3 fake audio', 'audio/mpeg')).json()
    expect((await call(buyerB, 'POST', `/api/deals/${deal}/creative`, { fileId: f.id })).statusCode).toBe(404)
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/creative`, { fileId: f.id })).json()).toMatchObject({ version: 1, status: 'pending' })
    expect((await call(sellerX, 'GET', `/api/files/${f.id}`)).body).toBe('ID3 fake audio')
    for (const who of [sellerY, buyerB]) expect((await call(who, 'GET', `/api/files/${f.id}`)).statusCode).toBe(404)
    expect((await call(sellerX, 'GET', '/api/notifications')).json()).toMatchObject({ unread: expect.any(Number), items: expect.arrayContaining([expect.objectContaining({ kind: 'creative.sent' })]) })
    await call(sellerX, 'POST', '/api/notifications/read')
    expect((await call(sellerX, 'GET', '/api/notifications')).json().unread).toBe(0)

    await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_4242' })
    const page = (await call(buyerA, 'GET', `/api/deals/${deal}`)).json()
    expect(page).toMatchObject({ status: 'payment_secured', channel: 'radio', creatives: [{ version: 1, status: 'pending', fileId: f.id }],
      timeline: [{ event: 'opened' }, { event: 'accept' }, { event: 'pay' }], proof: null })
    expect(JSON.stringify(page.timeline)).not.toMatch(/seller:|buyer:/)
    expect(page.documents.map((d: any) => d.type)).toEqual(['order', 'receipt', 'media_invoice'])
    const inv = (await call(buyerA, 'GET', `/api/documents/${page.documents[2].id}`)).json()
    expect(inv).toMatchObject({ type: 'media_invoice', onBehalf: true, taxDocument: true, issuer: { name: 'Skyline FM' }, total: AED(5_775) })
    expect((await call(buyerB, 'GET', `/api/documents/${inv.id}`)).statusCode).toBe(404)
  })
})

describe('seller screens', () => {
  test('onboarding: outlet, payout account, tax details, first placement, live', async () => {
    const z = await member('Pearl Radio', 'sales@pearl.ae', 'media_outlet')
    expect((await call(z, 'GET', '/api/seller/overview')).json().onboarding).toEqual({ outlet: false, payouts: false, tax: false, placement: false, live: false })
    expect((await call(z, 'POST', '/api/seller/outlets', { name: 'Pearl FM', channel: 'radio', description: 'Call 050 123 4567' })).json().error).toMatch('not allowed')
    const outletId = (await call(z, 'POST', '/api/seller/outlets', { name: 'Pearl FM', channel: 'radio', sectors: ['Retail', 'Pets'] })).json().id
    const placement = { outletId, name: 'Breakfast', saleType: 'auction', days: [1, 2, 3, 4, 5], startsAt: '07:00', endsAt: '09:00',
      breaks: [{ label: 'Break 1', at: '07:30', seconds: 30 }], startingPrice: AED(2_000), creativeLeadHours: 48, closeLeadHours: 120, listFrom: '2026-11-09', listDays: 5 }
    expect((await call(z, 'POST', '/api/seller/placements', placement)).json().error).toMatch('payout account')
    expect((await call(z, 'POST', '/api/seller/payouts/connect')).statusCode).toBe(200)
    expect((await call(z, 'PUT', '/api/seller/company', { vatRegistered: true, invoiceMode: 'generate' })).json().error).toMatch('TRN')
    expect((await call(z, 'PUT', '/api/seller/company', { vatRegistered: true, trn: '100200300400500', invoiceMode: 'generate' })).statusCode).toBe(200)
    expect((await call(z, 'POST', '/api/seller/placements', placement)).json().slots).toBe(5)
    expect((await call(z, 'GET', '/api/seller/overview')).json().onboarding).toEqual({ outlet: true, payouts: true, tax: true, placement: true, live: true })
    expect((await call(z, 'GET', '/api/seller/profile')).json().outlets[0].sectors).toEqual(['Retail', 'Pets'])
  })

  test('inbox, slot panel, block; deal page through proof; earnings and statement', async () => {
    expect((await call(sellerX, 'POST', `/api/seller/slots/${slotY}/block`, { blocked: true })).statusCode).toBe(400) // not theirs
    expect((await call(sellerY, 'POST', `/api/seller/slots/${slotY}/block`, { blocked: true })).statusCode).toBe(200)
    expect((await call(buyerA, 'POST', `/api/slots/${slotY}/bids`, { amount: AED(3_500), brief: BRIEF })).statusCode).toBe(400)
    expect((await call(sellerY, 'POST', `/api/seller/slots/${slotY}/block`, { blocked: false })).statusCode).toBe(200)

    await call(buyerB, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(3_600), brief: BRIEF })
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    expect((await call(sellerX, 'GET', '/api/seller/inbox')).json()).toEqual([expect.objectContaining({ type: 'decide', dealId: deal, buyer: 'Northwind Fintech' })])
    const panel = (await call(sellerX, 'GET', `/api/seller/slots/${slotX}`)).json()
    expect(panel).toMatchObject({ reservePrice: AED(4_000), bids: [{ kind: 'buy_now', company: 'Northwind Fintech' }, { kind: 'bid', company: 'Al Futtaim' }] })
    expect((await call(sellerY, 'GET', `/api/seller/slots/${slotX}`)).statusCode).toBe(404)
    expect((await call(sellerY, 'GET', `/api/seller/deals/${deal}/detail`)).statusCode).toBe(404)

    await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_4242' })
    const f = (await app.inject({ method: 'POST', url: '/api/files', payload: Buffer.from('ID3'), headers: { cookie: buyerA.cookie, 'content-type': 'audio/mpeg' } })).json()
    await call(buyerA, 'POST', `/api/deals/${deal}/creative`, { fileId: f.id })
    expect((await call(sellerX, 'GET', '/api/seller/inbox')).json().map((t: any) => t.type)).toEqual(['creative'])
    expect((await call(sellerX, 'GET', '/api/seller/overview')).json().money).toEqual({ available: 0, held: AED(5_115), owed: 0 })
    const page = (await call(sellerX, 'GET', `/api/seller/deals/${deal}/detail`)).json()
    expect(page).toMatchObject({ channel: 'radio', creatives: [{ version: 1, status: 'pending', fileId: f.id }], adHasRun: false,
      proofChecklist: [{ key: 'as_run_log' }, { key: 'audio_clip' }] })
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/creative-review`, { decision: 'approve' })

    now = T('2026-11-09T04:00:00Z') // the ad has run; sessions last 12 hours, so sign in again
    sellerX.cookie = await signIn('sales@skyline.ae'); buyerA.cookie = await signIn('sara@northwind.ae')
    expect((await call(sellerX, 'GET', '/api/seller/inbox')).json().map((t: any) => t.type)).toEqual(['proof'])
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/proof`, { items: { as_run_log: 'log', audio_clip: 'clip' } })
    await call(buyerA, 'POST', `/api/deals/${deal}/approve`)
    const earn = (await call(sellerX, 'GET', '/api/seller/earnings')).json()
    expect(earn.deals[0]).toMatchObject({ id: deal, held: false, price: AED(5_500), mediaVat: AED(275) })
    expect(earn.available + earn.payouts.reduce((n: number, p: any) => n + p.amount, 0)).toBe(earn.deals[0].payout)
    const csv = await call(sellerX, 'GET', '/api/seller/statement/2026-11')
    expect(csv.headers['content-type']).toMatch('text/csv')
    expect(csv.body).toMatch('Released to you')
  })
})

describe('admin screens', () => {
  async function paidDeal() {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_4242' })
    return deal
  }

  test('overview, funds and reports agree with the ledger; buyers and sellers are kept out', async () => {
    const deal = await paidDeal()
    for (const who of [buyerA, sellerX]) expect((await call(who, 'GET', '/api/admin/overview')).statusCode).toBe(403)
    const o = (await call(admin, 'GET', '/api/admin/overview')).json()
    expect(o).toMatchObject({ bookings_month: 1, gmv_month: AED(5_500), held: AED(5_775), revenue: 0, reconcile: { ok: true }, byStatus: { secured: 1 } })
    const f = (await call(admin, 'GET', '/api/admin/funds')).json()
    expect(f.accounts).toMatchObject({ cash: AED(5_775), held: AED(5_775), sellerPayable: 0 })
    const file = (await call(admin, 'GET', `/api/admin/deals/${deal}`)).json()
    expect(file).toMatchObject({ buyer: { name: 'Northwind Fintech' }, seller: { name: 'Skyline FM' }, ratesFrozen: true, money: { buyerPays: AED(5_775), held: AED(5_775) } })
    expect(file.events.map((e: any) => e.actor)).toEqual([`buyer:${buyerA.companyId}`, `seller:${sellerX.companyId}`, `buyer:${buyerA.companyId}`])
    const r = (await call(admin, 'GET', '/api/admin/reports?from=2026-11-01&to=2026-11-30')).json()
    expect(r.byChannel).toEqual([{ channel: 'radio', bookings: 1, gmv: AED(5_500), commission: AED(660) }])
    expect((await call(admin, 'GET', '/api/admin/deals?q=northwind')).json()).toHaveLength(1)
  })

  test('disputes: the buyer declines the fix, Nashr decides a partial refund', async () => {
    const deal = await paidDeal()
    now = T('2026-11-09T04:00:00Z')
    for (const w of [buyerA, sellerX, admin]) w.cookie = await signIn(w === buyerA ? 'sara@northwind.ae' : w === sellerX ? 'sales@skyline.ae' : 'ops@nashr.ae', w === admin ? totp((admin as any).secret, now) : undefined)
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/proof`, { items: { as_run_log: 'log', audio_clip: 'clip' } })
    await call(buyerA, 'POST', `/api/deals/${deal}/issues`, { reason: 'wrong_time', note: 'Aired at 08:30' })
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/issues/offer`, { type: 'partial_refund', amount: AED(500) })
    await call(buyerA, 'POST', `/api/deals/${deal}/issues/respond`, { accept: false })
    expect((await call(admin, 'GET', '/api/admin/disputes')).json()).toEqual([expect.objectContaining({ id: deal, status: 'disputed', reason: 'wrong_time', offer: { type: 'partial_refund', amount: AED(500) } })])
    expect((await call(admin, 'POST', `/api/admin/deals/${deal}/dispute`, { outcome: 'partial_refund', amount: AED(1_000) })).json().status).toBe('released')
    expect((await call(admin, 'GET', '/api/admin/disputes')).json()).toEqual([])
  })

  test('accounts: suspend signs the user out; staff invites; payouts retry; settings history; directory outlets', async () => {
    const c = (await call(admin, 'GET', `/api/admin/companies/${buyerB.companyId}`)).json()
    expect(c).toMatchObject({ type: 'buyer', users: [{ email: 'ali@alfuttaim.ae', status: 'active' }] })
    expect((await call(admin, 'POST', `/api/admin/users/${c.users[0].id}/status`, { status: 'suspended', reason: 'Card fraud check' })).statusCode).toBe(200)
    expect((await call(buyerB, 'GET', '/api/me')).statusCode).toBe(401)
    expect((await call(admin, 'POST', `/api/admin/users/${c.users[0].id}/status`, { status: 'active' })).statusCode).toBe(200)

    expect((await call(admin, 'POST', '/api/admin/staff', { email: 'cfo@nashr.ae', name: 'CFO', role: 'founder' })).statusCode).toBe(403)
    expect((await call(founder, 'POST', '/api/admin/staff', { email: 'cfo@nashr.ae', name: 'CFO', role: 'founder' })).json().inviteLink).toMatch('/invite#')
    expect((await call(admin, 'GET', '/api/admin/staff')).json().map((s: any) => s.role)).toEqual(['founder', 'admin', 'founder'])

    const deal = await paidDeal()
    const op = (await pool.query(`insert into money_ops (deal_id, company_id, kind, amount, currency, status, failure, idempotency_key, created_at, updated_at)
      values ($1, $2, 'transfer', 100, 'AED', 'failed', 'No payout account', 'test-op', now(), now()) returning id`, [deal, sellerX.companyId])).rows[0].id
    expect((await call(admin, 'GET', '/api/admin/money-ops?status=failed')).json()[0]).toMatchObject({ id: op, company: 'Skyline FM', failure: 'No payout account' })
    expect((await call(admin, 'POST', `/api/admin/money-ops/${op}/retry`)).statusCode).toBe(200)
    expect((await call(admin, 'POST', `/api/admin/money-ops/${op}/retry`)).statusCode).toBe(400)

    await call(admin, 'PUT', '/api/admin/settings/seller_window_hours', { value: 36 })
    const s = (await call(admin, 'GET', '/api/admin/settings')).json().find((x: any) => x.key === 'seller_window_hours')
    expect(s.value).toBe(36); expect(s.history.map((h: any) => h.value)).toEqual([36, 24])

    const off = (await call(admin, 'POST', '/api/admin/outlets', { name: 'Time Out Dubai', channel: 'digital', estLow: AED(5_000), estHigh: AED(8_000) })).json().id
    expect((await call(admin, 'PUT', `/api/admin/outlets/${off}`, { estHigh: AED(9_000), tier: 'Tier 1' })).statusCode).toBe(200)
    const onNashr = (await pool.query(`select id from outlets where company_id = $1`, [sellerX.companyId])).rows[0].id
    expect((await call(admin, 'PUT', `/api/admin/outlets/${onNashr}`, { name: 'Hacked' })).json().error).toMatch('not on Nashr')
    expect((await call(buyerA, 'GET', '/api/directory')).json().find((o: any) => o.id === off).price).toMatchObject({ level: 'estimate', to: AED(9_000) })
  })
})

describe('publisher ratings', () => {
  async function releasedDeal(buyer: Who, slot: string, seller: Who) {
    const deal = (await call(buyer, 'POST', `/api/slots/${slot}/buy-now`, { brief: BRIEF })).json().id
    await call(seller, 'POST', `/api/seller/deals/${deal}/accept`)
    await call(buyer, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_4242' })
    return deal
  }

  test('only the buyer of a released booking rates it, once (and may change it); outlets show the average without naming buyers', async () => {
    const deal = await releasedDeal(buyerA, slotX, sellerX)
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/rating`, { score: 5 })).json().error).toMatch('after the booking is complete')
    await pool.query(`update deals set status = 'released' where id = $1`, [deal]) // the ad ran and the money was released

    expect((await call(buyerB, 'POST', `/api/deals/${deal}/rating`, { score: 1 })).statusCode).toBe(404)
    expect((await call(sellerX, 'POST', `/api/deals/${deal}/rating`, { score: 5 })).statusCode).toBe(403)
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/rating`, { score: 6 })).statusCode).toBe(400)
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/rating`, { score: 4, comment: 'Call me on 050 123 4567' })).json().error).toMatch('not allowed')
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/rating`, { score: 3, comment: 'Aired on time.' })).statusCode).toBe(200)
    await pool.query(`update deals set status = 'paid_out' where id = $1`, [deal]) // still rateable once the publisher is paid
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/rating`, { score: 5, comment: 'Aired on time, great reach.' })).statusCode).toBe(200) // changed, not added
    expect((await call(buyerA, 'GET', `/api/deals/${deal}`)).json().rating).toMatchObject({ score: 5, comment: 'Aired on time, great reach.' })

    const outlet = (await pool.query(`select id from outlets where company_id = $1`, [sellerX.companyId])).rows[0].id
    const page = (await call(null, 'GET', `/api/outlets/${outlet}`)).json()
    expect(page.rating).toMatchObject({ average: 5, count: 1 })
    expect(page.rating.recent[0]).toMatchObject({ score: 5, comment: 'Aired on time, great reach.' })
    expect(JSON.stringify(page.rating)).not.toMatch(/Northwind|sara@/)
    expect((await call(null, 'GET', '/api/directory')).json().find((o: any) => o.id === outlet).rating).toMatchObject({ average: 5, count: 1 })
    expect((await call(sellerX, 'GET', `/api/seller/deals/${deal}`)).json().rating).toMatchObject({ score: 5 })

    // Nashr hides an abusive rating: it leaves the average and the page
    const id = (await pool.query(`select id from ratings where deal_id = $1`, [deal])).rows[0].id
    expect((await call(buyerA, 'POST', `/api/admin/ratings/${id}/hidden`, { hidden: true })).statusCode).toBe(403)
    expect((await call(admin, 'POST', `/api/admin/ratings/${id}/hidden`, { hidden: true })).statusCode).toBe(200)
    expect((await call(null, 'GET', `/api/outlets/${outlet}`)).json().rating).toMatchObject({ average: null, count: 0, recent: [] })
  })
})

describe('saved searches and alerts', () => {
  const matchesFor = async (who: Who) => (await call(who, 'GET', '/api/notifications')).json().items.filter((n: any) => n.kind === 'search.match')

  test('a buyer saves searches; new matching slots raise one alert per run; nobody else sees or changes them', async () => {
    const mornings = { name: 'Radio mornings', filter: { channels: ['radio'], dayparts: ['morning'], maxPrice: AED(5_000) } }
    expect((await call(null, 'POST', '/api/searches', mornings)).statusCode).toBe(401)
    expect((await call(sellerX, 'POST', '/api/searches', mornings)).statusCode).toBe(403)
    expect((await call(buyerA, 'POST', '/api/searches', { name: 'Bad', filter: { maxPrice: -5 } })).statusCode).toBe(400)
    expect((await call(buyerA, 'POST', '/api/searches', { name: 'Bad', filter: { channels: ['cinema'] } })).statusCode).toBe(400)
    const s = (await call(buyerA, 'POST', '/api/searches', mornings)).json()
    await call(buyerA, 'POST', '/api/searches', { name: 'TV only', filter: { channels: ['tv'] } })
    expect((await call(buyerA, 'GET', '/api/searches')).json().map((x: any) => [x.name, x.alerts])).toEqual([['Radio mornings', true], ['TV only', true]])
    expect((await call(buyerB, 'GET', '/api/searches')).json()).toEqual([])
    expect((await call(buyerB, 'DELETE', `/api/searches/${s.id}`)).statusCode).toBe(404)
    expect((await call(buyerB, 'PUT', `/api/searches/${s.id}`, { alerts: false })).statusCode).toBe(404)

    await sweep(now)
    expect(await matchesFor(buyerA)).toEqual([]) // slots listed before the search was saved never alert

    now = T('2026-11-01T09:00:00Z'); await listSlot(sellerX, 'Skyline Breakfast') // radio, 07:15 Dubai, AED 3,500
    await sweep(now); await sweep(now)
    const alerts = await matchesFor(buyerA)
    expect(alerts).toHaveLength(1) // one alert, not one per run or per slot
    expect(alerts[0].data).toMatchObject({ searchId: s.id, name: 'Radio mornings', count: 1 })
    expect(await matchesFor(buyerB)).toEqual([])

    expect((await call(buyerA, 'PUT', `/api/searches/${s.id}`, { alerts: false })).statusCode).toBe(200)
    now = T('2026-11-01T10:00:00Z'); await listSlot(sellerY, 'Gulf Breakfast')
    await sweep(now)
    expect(await matchesFor(buyerA)).toHaveLength(1)

    expect((await call(buyerA, 'DELETE', `/api/searches/${s.id}`)).statusCode).toBe(200)
    expect((await call(buyerA, 'GET', '/api/searches')).json().map((x: any) => x.name)).toEqual(['TV only'])
    for (let i = 0; i < 19; i++) await call(buyerA, 'POST', '/api/searches', { name: `S${i}`, filter: {} })
    expect((await call(buyerA, 'POST', '/api/searches', { name: 'One too many', filter: {} })).json().error).toMatch('20')
  })
})

describe('outlet cover photos', () => {
  const PNG = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(64, 7)])
  const put = (who: Who | null, url: string, bytes: Buffer, type = 'image/png') =>
    app.inject({ method: 'PUT', url, payload: bytes, headers: { ...(who ? { cookie: who.cookie } : {}), 'content-type': type } })

  test('a publisher sets and removes its own cover; visitors see it everywhere; nobody else can change it', async () => {
    const mine = (await pool.query(`select id from outlets where company_id = $1`, [sellerX.companyId])).rows[0].id
    expect((await put(sellerX, `/api/seller/outlets/${mine}/cover`, Buffer.from('%PDF-1.4 renamed'), 'image/png')).json().error).toMatch('JPEG or PNG')
    expect((await put(sellerX, `/api/seller/outlets/${mine}/cover`, Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]))).statusCode).toBe(413)
    expect((await put(sellerY, `/api/seller/outlets/${mine}/cover`, PNG)).statusCode).toBe(404)
    expect((await put(null, `/api/seller/outlets/${mine}/cover`, PNG)).statusCode).toBe(401)
    expect((await put(admin, `/api/admin/outlets/${mine}/cover`, PNG)).json().error).toMatch('not on Nashr')

    const { coverUrl } = (await put(sellerX, `/api/seller/outlets/${mine}/cover`, PNG)).json()
    expect(coverUrl).toMatch(new RegExp(`^/api/outlets/${mine}/cover\\?v=`))
    const img = await app.inject({ method: 'GET', url: coverUrl }) // a visitor, not signed in
    expect(img.statusCode).toBe(200)
    expect(img.headers).toMatchObject({ 'content-type': 'image/png', 'x-content-type-options': 'nosniff' })
    expect(img.rawPayload.equals(PNG)).toBe(true)
    expect((await call(null, 'GET', `/api/outlets/${mine}`)).json().coverUrl).toBe(coverUrl)
    expect((await call(null, 'GET', '/api/directory')).json().find((o: any) => o.id === mine).coverUrl).toBe(coverUrl)
    expect((await call(sellerX, 'GET', '/api/seller/profile')).json().outlets[0].coverUrl).toBe(coverUrl)

    expect((await call(sellerY, 'DELETE', `/api/seller/outlets/${mine}/cover`)).statusCode).toBe(404)
    expect((await call(sellerX, 'DELETE', `/api/seller/outlets/${mine}/cover`)).statusCode).toBe(200)
    expect((await call(null, 'GET', `/api/outlets/${mine}`)).json().coverUrl).toBeNull()
    expect((await app.inject({ method: 'GET', url: coverUrl })).statusCode).toBe(404)
  })

  test('Nashr sets covers for outlets not on Nashr; buyers and publishers cannot', async () => {
    const off = (await call(admin, 'POST', '/api/admin/outlets', { name: 'Time Out Dubai', channel: 'digital', estLow: AED(5_000), estHigh: AED(8_000) })).json().id
    expect((await put(buyerA, `/api/admin/outlets/${off}/cover`, PNG)).statusCode).toBe(403)
    expect((await put(sellerX, `/api/seller/outlets/${off}/cover`, PNG)).statusCode).toBe(404)
    const { coverUrl } = (await put(admin, `/api/admin/outlets/${off}/cover`, PNG)).json()
    expect((await call(admin, 'GET', '/api/admin/outlets')).json().find((o: any) => o.id === off).coverUrl).toBe(coverUrl)
    expect((await call(admin, 'DELETE', `/api/admin/outlets/${off}/cover`)).statusCode).toBe(200)
    expect((await call(buyerA, 'GET', '/api/directory')).json().find((o: any) => o.id === off).coverUrl).toBeNull()
  })
})

describe('brief scenarios closed in phase F', () => {
  /** Move the clock; sessions last 12 hours, so everyone signs in again. */
  async function jump(iso: string) {
    now = T(iso)
    buyerA.cookie = await signIn('sara@northwind.ae'); buyerB.cookie = await signIn('ali@alfuttaim.ae')
    sellerX.cookie = await signIn('sales@skyline.ae'); sellerY.cookie = await signIn('sales@gulfradio.ae')
    admin.cookie = await signIn('ops@nashr.ae', totp((admin as any).secret, now))
  }
  const kinds = async (who: Who) => (await call(who, 'GET', '/api/notifications')).json().items.map((n: any) => n.kind)
  const deadline = async (deal: string) => (await call(buyerA, 'GET', `/api/deals/${deal}`)).json().nextDeadlineAt as string
  const hoursBefore = (iso: string, h: number) => new Date(new Date(iso).getTime() - h * 3_600_000).toISOString()

  test('scenarios 2 and 20: a bid below the reserve is flagged to the seller only; a decline shows the buyer the reason', async () => {
    await call(buyerB, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(3_600), brief: BRIEF })
    expect(JSON.stringify((await call(buyerB, 'GET', `/api/slots/${slotX}`)).json())).not.toMatch(/reserve/i)
    await jump('2026-11-04T04:00:00Z'); await sweep(now) // bidding closed
    const [task] = (await call(sellerX, 'GET', '/api/seller/inbox')).json()
    expect(task).toMatchObject({ type: 'decide', belowReserve: true, buyer: 'Al Futtaim' })
    await call(sellerX, 'POST', `/api/seller/deals/${task.dealId}/decline`, { reason: 'The break was sold off-platform' })
    expect((await call(buyerB, 'GET', '/api/deals')).json()[0]).toMatchObject({ status: 'not_selected', reason: 'The break was sold off-platform' })
  })

  test('scenarios 3 and 5: reminders before the deadline; a declined card shows "payment pending" to the seller, then lapses with a reason', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    const due = await deadline(deal)
    await jump(hoursBefore(due, 11)); await sweep(now); await sweep(now)
    expect((await kinds(sellerX)).filter((k: string) => k === 'reminder.decide')).toHaveLength(1) // once, however often the sweeper runs
    await jump(hoursBefore(due, 1)); await sweep(now)
    expect((await kinds(sellerX)).filter((k: string) => k === 'reminder.decide')).toHaveLength(2)
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_0002' })).json()).toMatchObject({ status: 'failed' })
    expect((await call(sellerX, 'GET', `/api/seller/deals/${deal}`)).json()).toMatchObject({ status: 'awaiting_payment', paymentFailed: true })
    await jump(new Date(new Date(await deadline(deal)).getTime() + 60_000).toISOString()); await sweep(now)
    expect((await call(buyerA, 'GET', `/api/deals/${deal}`)).json()).toMatchObject({ status: 'lapsed', reason: 'Payment was not made in time' })
  })

  test('scenarios 11, 17 and 25: review reminders on day 3 and day 1, auto-release; the money always adds up; cancellation is previewed exactly', async () => {
    // one booking runs to auto-release, another is cancelled by the buyer outside the free window
    const run = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    const cancel = (await call(buyerB, 'POST', `/api/slots/${slotY}/buy-now`, { brief: BRIEF })).json().id
    await call(sellerX, 'POST', `/api/seller/deals/${run}/accept`); await call(sellerY, 'POST', `/api/seller/deals/${cancel}/accept`)
    await call(buyerA, 'POST', `/api/deals/${run}/pay`, { paymentMethod: 'pm_card_4242' }); await call(buyerB, 'POST', `/api/deals/${cancel}/pay`, { paymentMethod: 'pm_card_4242' })

    await jump('2026-11-03T08:00:00Z') // two days later: outside the 24-hour free window, before the creative deadline
    const terms = (await call(buyerB, 'GET', `/api/deals/${cancel}/cancel-preview`)).json()
    expect(terms).toMatchObject({ allowed: true, free: false, paid: AED(5_775), publisherKeeps: AED(866.25) })
    expect(terms.refund).toBe(terms.paid - terms.publisherKeeps - terms.processing)
    await call(buyerB, 'POST', `/api/deals/${cancel}/cancel`)
    const refundOp = (await pool.query(`select amount from money_ops where deal_id = $1 and kind = 'refund'`, [cancel])).rows[0]
    expect(refundOp.amount).toBe(terms.refund) // what the buyer saw is what they get

    await jump('2026-11-09T04:00:00Z')
    await call(sellerX, 'POST', `/api/seller/deals/${run}/proof`, { items: { as_run_log: 'log', audio_clip: 'clip' } })
    const release = await deadline(run)
    await jump(hoursBefore(release, 71)); await sweep(now)
    await jump(hoursBefore(release, 23)); await sweep(now)
    expect((await kinds(buyerA)).filter((k: string) => k === 'reminder.review')).toHaveLength(2) // day 3 and day 1
    await jump(new Date(new Date(release).getTime() + 60_000).toISOString()); await sweep(now)
    expect((await call(buyerA, 'GET', `/api/deals/${run}`)).json()).toMatchObject({ status: 'released' })
    await runMoneyOps(provider, now)

    // Scenario 17: received = held + released (not yet paid out) + paid out + refunded + card costs kept
    const b = (a: string) => balance(pool, a, 'AED')
    const sum = async (sql: string) => Number((await pool.query(sql)).rows[0].n)
    const received = await sum(`select coalesce(sum(amount), 0) n from money_ops where kind = 'charge' and status = 'succeeded'`)
    const paidOut = await sum(`select coalesce(sum(amount), 0) n from money_ops where kind = 'transfer' and status = 'succeeded'`)
    const refunded = await sum(`select coalesce(sum(amount), 0) n from money_ops where kind = 'refund' and status = 'succeeded'`)
    const held = -(await b('held'))
    const released = -(await b(`seller_payable:${sellerX.companyId}`)) - (await b(`seller_payable:${sellerY.companyId}`)) - (await b('nashr_revenue')) - (await b('vat_payable'))
    const costsKept = -(await b('refund_costs')) - (await b(`seller_receivable:${sellerX.companyId}`)) - (await b(`seller_receivable:${sellerY.companyId}`))
    expect(received).toBe(AED(5_775) * 2)
    expect(held + released + paidOut + refunded + costsKept).toBe(received)
    expect(Math.abs(held)).toBe(0) // nothing is left held for a deal that is released or cancelled
    expect((await call(admin, 'GET', '/api/admin/funds')).json().reconcile.ok).toBe(true)
    expect((await call(admin, 'GET', '/api/admin/reports?from=2026-11-01&to=2026-11-30')).json().refundLosses).toMatchObject({ refunds: 1, from_buyers: terms.processing })
  })

  test('scenario 18: overnight programmes, overlap warnings, podcast release times', async () => {
    const outletId = (await pool.query(`select id from outlets where company_id = $1`, [sellerX.companyId])).rows[0].id
    const base = { outletId, saleType: 'auction', days: [1], startingPrice: AED(1_000), creativeLeadHours: 48, closeLeadHours: 120, listFrom: '2026-11-16', listDays: 1 }
    expect((await call(sellerX, 'POST', '/api/seller/placements', { ...base, name: 'Backwards', startsAt: '09:00', endsAt: '08:00' })).json().error).toMatch('after the start')
    const late = (await call(sellerX, 'POST', '/api/seller/placements', { ...base, name: 'Late Night', startsAt: '23:00', endsAt: '02:00',
      breaks: [{ label: 'Break 1', at: '23:30', seconds: 30 }, { label: 'Break 2', at: '00:30', seconds: 30 }] })).json()
    expect(late.slots).toBe(2)
    const slots = (await pool.query(`select label, starts_at from slots where placement_id = $1 order by starts_at`, [late.id])).rows
    expect(slots.map(r => [r.label, r.starts_at.toISOString()])).toEqual([['Break 1', '2026-11-16T19:30:00.000Z'], ['Break 2', '2026-11-16T20:30:00.000Z']]) // 00:30 is Tuesday
    const clash = (await call(sellerX, 'POST', '/api/seller/placements', { ...base, name: 'After Hours', startsAt: '01:00', endsAt: '03:00' })).json()
    expect(clash.warnings).toEqual([]) // 01:00 Monday is not 01:00 Tuesday: the overnight show runs into Tuesday
    const overlap = (await call(sellerX, 'POST', '/api/seller/placements', { ...base, name: 'Midnight Mix', startsAt: '22:00', endsAt: '23:45' })).json()
    expect(overlap.warnings).toEqual(['This overlaps Late Night on 1 of the same days.'])
    const pod = (await call(sellerX, 'POST', '/api/seller/placements', { ...base, name: 'Weekly episode', days: [4], startsAt: '06:00', breaks: [{ label: 'Pre-roll' }], listFrom: '2026-11-19' })).json()
    expect((await pool.query(`select starts_at from slots where placement_id = $1`, [pod.id])).rows[0].starts_at.toISOString()).toBe('2026-11-19T02:00:00.000Z') // Thursday 06:00 Dubai
  })

  test('scenarios 16 and 19: KSA is coming soon: listed and plannable, never bookable; waiting lists work', async () => {
    const ksa = (await pool.query(`insert into companies (name, type, payouts_enabled) values ('Rotana Media', 'publisher', true) returning id`)).rows[0].id
    const outlet = (await pool.query(`insert into outlets (company_id, name, channel, market, est_currency) values ($1, 'Rotana FM', 'radio', 'SA', 'SAR') returning id`, [ksa])).rows[0].id
    const placement = await tx(c => createPlacement(c, { outletId: outlet, name: 'Drive', saleType: 'auction', days: [1, 2, 3, 4, 5, 6, 7], startsAt: '07:00', endsAt: '09:00',
      startingPrice: AED(3_000), creativeLeadHours: 48, closeLeadHours: 120 }, 'seller', now))
    await tx(c => generateSlots(c, placement, '2026-11-16', 7, now))
    const slots = (await pool.query(`select id, currency, air_date::text d from slots where placement_id = $1 order by air_date`, [placement])).rows
    expect(slots).toHaveLength(7) // programmes air on the days the seller picks, weekend or not
    expect(slots[0].currency).toBe('SAR')
    // KSA deadlines count working days around a Friday-Saturday weekend: Thursday + 1 working day is Sunday (UAE: Monday)
    const thu = T('2026-11-19T09:00:00Z')
    expect((await addWorkingDays(pool, thu, 1, 'SA')).toISOString().slice(0, 10)).toBe('2026-11-22')
    expect((await addWorkingDays(pool, thu, 1, 'AE')).toISOString().slice(0, 10)).toBe('2026-11-20')
    expect((await call(buyerA, 'GET', '/api/slots?from=2026-11-15T00:00:00Z&to=2026-11-23T00:00:00Z')).json().some((s: any) => s.outlet === 'Rotana FM')).toBe(false)
    expect((await call(buyerA, 'POST', `/api/slots/${slots[0].id}/bids`, { amount: AED(3_000), brief: BRIEF })).json().error).toMatch('coming soon')
    expect((await call(buyerA, 'GET', '/api/directory')).json().find((o: any) => o.id === outlet)).toMatchObject({ market: 'SA', comingSoon: true, onNashr: false })
    const c = (await call(buyerA, 'POST', '/api/campaigns', { name: 'GCC', budget: AED(10_000) })).json().id
    await call(buyerA, 'PUT', `/api/campaigns/${c}/items`, { items: [{ outletId: outlet, planned: AED(3_000) }] })
    expect((await call(buyerA, 'GET', `/api/campaigns/${c}`)).json().items).toHaveLength(1)
    for (const topic of ['KSA', 'Athena', 'KSA']) await call(buyerA, 'POST', '/api/waitlist', { topic })
    expect((await call(buyerA, 'GET', '/api/waitlist')).json().sort()).toEqual(['Athena', 'KSA'])
  })
})

test('health: green when the sweeper ran and money flows; red, without details, when a payout is stuck', async () => {
  await sweep(now)
  expect((await call(null, 'GET', '/api/health')).json()).toMatchObject({ ok: true, checks: { database: true, sweeper: true, moneyFlowing: true, noFailedPayouts: true, ledgerReconciles: true } })
  await pool.query(`insert into money_ops (kind, amount, currency, status, idempotency_key, created_at, updated_at) values ('refund', 100, 'AED', 'failed', 'h1', $1, $1)`, [now])
  const r = await call(null, 'GET', '/api/health')
  expect(r.statusCode).toBe(503)
  expect(r.json().checks.noFailedPayouts).toBe(false)
  expect(r.body).not.toMatch(/AED|100|h1/)
})

describe('security review fixes', () => {
  test('a body cannot redirect an action to someone else\'s deal (IDOR)', async () => {
    const victim = (await call(buyerB, 'POST', `/api/slots/${slotY}/buy-now`, { brief: BRIEF })).json().id
    const mine = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    await call(sellerY, 'POST', `/api/seller/deals/${victim}/accept`); await call(sellerX, 'POST', `/api/seller/deals/${mine}/accept`)
    const f = (await app.inject({ method: 'POST', url: '/api/files', payload: Buffer.from('ID3 x'), headers: { cookie: buyerB.cookie, 'content-type': 'audio/mpeg' } })).json()
    await call(buyerB, 'POST', `/api/deals/${victim}/creative`, { fileId: f.id })
    // seller X reviews "their own" deal but names seller Y's deal and company in the body
    await call(sellerX, 'POST', `/api/seller/deals/${mine}/creative-review`, { decision: 'reject', reason: 'other', dealId: victim, sellerId: sellerY.companyId })
    expect((await pool.query(`select status from creatives where deal_id = $1`, [victim])).rows[0].status).toBe('pending')
    await call(buyerA, 'POST', `/api/deals/${mine}/issues`, { reason: 'other', note: 'x', dealId: victim, buyerId: buyerB.companyId })
    expect((await pool.query(`select count(*)::int n from issues where deal_id = $1`, [victim])).rows[0].n).toBe(0)
  })

  test('CSRF: forms and foreign origins cannot write; raw bytes only reach uploads, only when signed in', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    const form = await app.inject({ method: 'POST', url: `/api/seller/deals/${deal}/accept`, payload: 'x=1', headers: { cookie: sellerX.cookie, 'content-type': 'text/plain' } })
    expect(form.statusCode).toBe(415)
    const foreign = await app.inject({ method: 'POST', url: `/api/seller/deals/${deal}/accept`, headers: { cookie: sellerX.cookie, origin: 'https://evil.example', host: 'nashr.ae' } })
    expect(foreign.statusCode).toBe(403)
    expect((await call(sellerX, 'GET', `/api/seller/deals/${deal}`)).json().status).toBe('awaiting_seller') // nothing happened
    const own = await app.inject({ method: 'POST', url: `/api/seller/deals/${deal}/accept`, headers: { cookie: sellerX.cookie, origin: 'https://nashr.ae', host: 'nashr.ae' } })
    expect(own.statusCode).toBe(200)
    const anon = await app.inject({ method: 'POST', url: '/api/files', payload: Buffer.alloc(1024), headers: { 'content-type': 'application/octet-stream' } })
    expect(anon.statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: Buffer.alloc(1024), headers: { 'content-type': 'application/octet-stream' } })).statusCode).toBe(415)
    expect(own.headers).toMatchObject({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' })
  })

  test('a party cannot attach the other side\'s file to proof or an issue and then read it', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_4242' })
    const up = async (who: Who, text: string) => (await app.inject({ method: 'POST', url: '/api/files', payload: Buffer.from(text), headers: { cookie: who.cookie, 'content-type': 'audio/mpeg' } })).json().id
    const sellersPrivate = await up(sellerX, 'ID3 seller private'), buyersPrivate = await up(buyerA, 'ID3 buyer private')
    now = T('2026-11-09T04:00:00Z'); sellerX.cookie = await signIn('sales@skyline.ae'); buyerA.cookie = await signIn('sara@northwind.ae')
    // the seller tries to smuggle the buyer's file into proof; the buyer tries the same with the seller's file in issue evidence
    expect((await call(sellerX, 'POST', `/api/seller/deals/${deal}/proof`, { items: { as_run_log: `files/${buyersPrivate}`, audio_clip: 'clip' } })).json().error).toMatch('your own')
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/proof`, { items: { as_run_log: 'log', audio_clip: 'clip' } })
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/issues`, { reason: 'other', note: 'x', evidence: { shot: `files/${sellersPrivate}` } })).json().error).toMatch('your own')
    // and even if such a reference were in the database, the download check ties each kind of attachment to the side that sends it
    await pool.query(`update proofs set items = items || jsonb_build_object('extra', 'files/' || $2::text) where deal_id = $1`, [deal, buyersPrivate])
    expect((await call(sellerX, 'GET', `/api/files/${buyersPrivate}`)).statusCode).toBe(404)
    expect((await call(buyerA, 'GET', `/api/files/${sellersPrivate}`)).statusCode).toBe(404)
  })

  test('a slot in a market that is not open cannot be opened by id', async () => {
    const ksa = (await pool.query(`insert into companies (name, type, payouts_enabled) values ('Rotana Media', 'publisher', true) returning id`)).rows[0].id
    const outlet = (await pool.query(`insert into outlets (company_id, name, channel, market) values ($1, 'Rotana FM', 'radio', 'SA') returning id`, [ksa])).rows[0].id
    const placement = await tx(c => createPlacement(c, { outletId: outlet, name: 'Drive', saleType: 'auction', days: [1], startsAt: '07:00', endsAt: '09:00',
      startingPrice: AED(3_000), creativeLeadHours: 48, closeLeadHours: 120 }, 'seller', now))
    await tx(c => generateSlots(c, placement, '2026-11-16', 1, now))
    const id = (await pool.query(`select id from slots where placement_id = $1`, [placement])).rows[0].id
    expect((await call(buyerA, 'GET', `/api/slots/${id}`)).statusCode).toBe(404)
  })

  test('uploads are typed by their bytes; a renamed file is not a creative', async () => {
    const up = (bytes: Buffer, type: string) => app.inject({ method: 'POST', url: '/api/files', payload: bytes, headers: { cookie: buyerA.cookie, 'content-type': type } })
    const fake = (await up(Buffer.from('<script>alert(1)</script>'), 'audio/mpeg')).json()
    expect((await pool.query(`select type from files where id = $1`, [fake.id])).rows[0].type).toBe('application/octet-stream')
    const pdf = (await up(Buffer.from('%PDF-1.7 ...'), 'application/octet-stream')).json()
    expect((await pool.query(`select type from files where id = $1`, [pdf.id])).rows[0].type).toBe('application/pdf')
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/creative`, { fileId: fake.id })).json()).toMatchObject({ status: 'technical_issue' })
  })

  test('placements: prices must be positive whole amounts; settings keep their type; more of them are the founder\'s', async () => {
    const outletId = (await pool.query(`select id from outlets where company_id = $1`, [sellerX.companyId])).rows[0].id
    const base = { outletId, name: 'X', saleType: 'auction', days: [1], startingPrice: AED(1_000), creativeLeadHours: 48, closeLeadHours: 120 }
    expect((await call(sellerX, 'POST', '/api/seller/placements', { ...base, buyNowPrice: -500 })).statusCode).toBe(400)
    expect((await call(sellerX, 'POST', '/api/seller/placements', { ...base, packagePrice: 12.5 })).statusCode).toBe(400)
    await expect(pool.query(`update slots set buy_now_price = -1 where id = $1`, [slotX])).rejects.toThrow('slots_prices_positive')
    expect((await call(admin, 'PUT', '/api/admin/settings/free_cancel_hours', { value: 9999 })).statusCode).toBe(403)
    expect((await call(admin, 'PUT', '/api/admin/settings/nashr_trn', { value: '100000000000003' })).statusCode).toBe(403)
    expect((await call(admin, 'PUT', '/api/admin/settings/seller_window_hours', { value: 'soon' })).json().error).toMatch('takes a number')
    expect((await call(founder, 'PUT', '/api/admin/settings/nashr_trn', { value: '100000000000003' })).statusCode).toBe(200)
  })

  test('a payment waiting for the bank cannot be started again; an authenticator code signs in once', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    await call(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_3155' })).json().status).toBe('requires_action')
    expect((await call(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_4242' })).json().error).toMatch('waiting for you to confirm')
    expect((await pool.query(`select count(*)::int n from money_ops where deal_id = $1 and kind = 'charge'`, [deal])).rows[0].n).toBe(1)
    now = T('2026-11-01T09:00:00Z')
    const code = totp((admin as any).secret, now)
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ops@nashr.ae', password: PASS, totpCode: code } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ops@nashr.ae', password: PASS, totpCode: code } })).json().error).toMatch('authenticator')
  })
})

describe('Stripe (task B5) against an in-memory Stripe', () => {
  /** Behaves like Stripe's REST API with its test cards: 4242 succeeds, 0002 is declined, 3155 asks for 3-D Secure. */
  function fakeStripe() {
    const s = { pis: new Map<string, any>(), seen: new Map<string, any>(), accounts: new Map<string, any>(), refunded: 0, transferred: 0, n: 0, calls: [] as string[] }
    const fee = (amount: number) => Math.round(amount * 0.029) + 100
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    const http = async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(url)), method = init?.method ?? 'GET', b = new URLSearchParams(String(init?.body ?? ''))
      const key = (init?.headers as any)?.['idempotency-key']
      s.calls.push(`${method} ${u.pathname}`)
      if (key && s.seen.has(key)) return json(200, s.seen.get(key))
      const remember = (body: any) => { if (key) s.seen.set(key, body); return json(200, body) }
      if (method === 'POST' && u.pathname === '/v1/payment_intents') {
        const pm = b.get('payment_method')!, id = `pi_${++s.n}`
        if (pm.endsWith('0002')) return json(402, { error: { type: 'card_error', code: 'card_declined', message: 'Your card was declined.' } })
        const pi = { id, amount: Number(b.get('amount')), currency: b.get('currency'), status: pm.endsWith('3155') ? 'requires_action' : 'succeeded', client_secret: `${id}_secret` }
        s.pis.set(id, pi); return remember(pi)
      }
      const pi = u.pathname.match(/^\/v1\/payment_intents\/(pi_\d+)$/)
      if (pi) { const p = s.pis.get(pi[1]); return json(200, { ...p, latest_charge: { balance_transaction: { fee: fee(p.amount) } } }) }
      if (u.pathname === '/v1/refunds') { s.refunded += Number(b.get('amount')); return remember({ id: `re_${++s.n}` }) }
      if (u.pathname === '/v1/transfers') { s.transferred += Number(b.get('amount')); return remember({ id: `tr_${++s.n}` }) }
      if (u.pathname === '/v1/balance') {
        const ok = [...s.pis.values()].filter(p => p.status === 'succeeded')
        return json(200, { available: [{ currency: 'aed', amount: ok.reduce((n, p) => n + p.amount - fee(p.amount), 0) - s.refunded - s.transferred }], pending: [] })
      }
      if (method === 'POST' && u.pathname === '/v1/accounts') { const id = `acct_${++s.n}`; s.accounts.set(id, { id, details_submitted: false, payouts_enabled: false }); return remember({ id }) }
      if (u.pathname === '/v1/account_links') return json(200, { url: `https://connect.stripe.com/setup/e/${b.get('account')}` })
      const acct = u.pathname.match(/^\/v1\/accounts\/(acct_\d+)$/)
      if (acct) return json(200, s.accounts.get(acct[1]))
      return json(404, { error: { message: `no route ${method} ${u.pathname}` } })
    }
    return { s, http }
  }
  const WHSEC = 'whsec_test_secret'
  const signed = (event: unknown, at = now) => {
    const body = JSON.stringify(event), t = Math.floor(at.getTime() / 1000)
    return { body, header: `t=${t},v1=${createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex')}` }
  }

  test('pay with 3-D Secure, signed webhook secures it once, Stripe fee booked so the money check holds; payout onboarding', async () => {
    const { s, http } = fakeStripe()
    const stripe = new StripeProvider('sk_test_x', http as any)
    const sapp = buildApp({ provider: stripe, clock: () => now, stripe: { publishableKey: 'pk_test_x', webhookSecret: WHSEC } })
    const scall = (who: Who | null, method: any, url: string, payload?: unknown) => sapp.inject({ method, url, payload: payload as any, headers: who ? { cookie: who.cookie } : {} })
    expect((await scall(null, 'GET', '/api/config')).json()).toEqual({ stripePublishableKey: 'pk_test_x' })

    const deal = (await scall(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    await scall(sellerX, 'POST', `/api/seller/deals/${deal}/accept`)
    expect((await scall(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_0002' })).json()).toMatchObject({ status: 'failed', failure: 'Your card was declined.' })
    const pay = (await scall(buyerA, 'POST', `/api/deals/${deal}/pay`, { paymentMethod: 'pm_card_3155' })).json()
    expect(pay).toMatchObject({ status: 'requires_action', clientSecret: expect.stringMatching(/^pi_\d+_secret$/) })
    const piId = pay.clientSecret.replace('_secret', '')

    // The buyer passes 3-D Secure in the browser; Stripe then tells us. A forged or stale event is refused.
    s.pis.get(piId).status = 'succeeded'
    const ev = { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: piId } } }
    const good = signed(ev)
    const post = (sig: { body: string; header: string }) => sapp.inject({ method: 'POST', url: '/api/stripe/webhook', payload: sig.body, headers: { 'content-type': 'application/json', 'stripe-signature': sig.header } })
    expect((await post({ body: good.body, header: good.header.replace(/v1=./, 'v1=0') })).statusCode).toBe(400)
    expect((await post(signed(ev, new Date(now.getTime() - 3_600_000)))).statusCode).toBe(400)
    expect((await post(good)).json()).toEqual({ received: true, handled: 'handled' })
    expect((await post(good)).json()).toEqual({ received: true, handled: 'duplicate' })
    expect((await scall(buyerA, 'GET', `/api/deals/${deal}`)).json().status).toBe('payment_secured')

    const fee = Number((await pool.query(`select sum(amount) n from ledger_entries where debit = 'processing_fees'`)).rows[0].n)
    expect(fee).toBe(Math.round(s.pis.get(piId).amount * 0.029) + 100)
    expect(await reconcile(stripe, 'AED')).toMatchObject({ ok: true })

    // Publisher payouts: onboarding on Stripe's pages, then Stripe says the account is ready.
    await pool.query(`update companies set provider_account = null, payouts_enabled = false where id = $1`, [sellerY.companyId])
    const link = (await scall(sellerY, 'POST', '/api/seller/payouts/connect')).json()
    expect(link.url).toMatch(/^https:\/\/connect\.stripe\.com\/setup\/e\/acct_\d+$/)
    const acct = link.url.split('/').pop()
    expect((await scall(sellerY, 'POST', '/api/seller/payouts/refresh')).json()).toEqual({ payoutsEnabled: false })
    expect((await post(signed({ id: 'evt_2', type: 'account.updated', data: { object: { id: acct, details_submitted: true, payouts_enabled: true } } }))).json().handled).toBe('handled')
    expect((await scall(sellerY, 'GET', '/api/seller/profile')).json().company.payoutsEnabled).toBe(true)
    expect(s.calls.filter(c => c === 'POST /v1/accounts')).toHaveLength(1)
  })

  test('the webhook is off without a secret, and the fake provider keeps its test cards', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/stripe/webhook', payload: '{}', headers: { 'content-type': 'application/json' } })).statusCode).toBe(404)
    expect((await call(null, 'GET', '/api/config')).json()).toEqual({ stripePublishableKey: null })
  })
})

describe('messages between buyer and publisher', () => {
  test('both sides talk once the booking is paid, until the deal is finished; contact details are refused, off-platform wording is flagged, outsiders see nothing', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json()
    const url = `/api/deals/${deal.id}/messages`
    // Owner rule (no side agreements): nothing before payment, not even after the publisher accepts
    expect((await call(buyerA, 'POST', url, { body: 'Hello?' })).json().error).toMatch('once the booking is paid')
    expect((await call(buyerA, 'GET', url)).json()).toMatchObject({ open: false, canWrite: false, messages: [] })
    expect((await call(sellerX, 'POST', `/api/seller/deals/${deal.id}/accept`)).statusCode).toBe(200)
    expect((await call(sellerX, 'POST', url, { body: 'Thanks for booking' })).json().error).toMatch('once the booking is paid')
    expect((await call(buyerA, 'POST', `/api/deals/${deal.id}/pay`, { paymentMethod: 'pm_card_4242' })).statusCode).toBe(200)
    expect((await call(buyerA, 'POST', url, { body: 'Can the spot run after the news?' })).statusCode).toBe(200)
    // The publisher is told, sees one unread conversation, and opening it marks it read
    expect((await pool.query(`select count(*)::int n from notifications where company_id = $1 and kind = 'message.new'`, [sellerX.companyId])).rows[0].n).toBe(1)
    expect((await call(sellerX, 'GET', '/api/messages/unread')).json().count).toBe(1)
    const list = (await call(sellerX, 'GET', '/api/messages')).json()
    expect(list[0]).toMatchObject({ dealId: deal.id, with: 'Northwind Fintech', unread: 1, last: { body: 'Can the spot run after the news?', mine: false } })
    const seen = (await call(sellerX, 'GET', url)).json()
    expect(seen.messages).toMatchObject([{ mine: false, company: 'Northwind Fintech', body: 'Can the spot run after the news?' }])
    expect(seen.messages[0].flagged).toBeUndefined() // only the team sees flags
    expect((await call(sellerX, 'GET', '/api/messages/unread')).json().count).toBe(0)
    // Contact details never get through, in Latin or Arabic-Indic digits
    expect((await call(sellerX, 'POST', url, { body: 'Call 050 123 4567' })).json().error).toMatch('not allowed')
    expect((await call(sellerX, 'POST', url, { body: 'رقمي ٠٥٠١٢٣٤٥٦٧' })).statusCode).toBe(400)
    expect((await call(sellerX, 'POST', url, { body: 'sara at northwind dot ae' })).statusCode).toBe(400)
    // Suggesting WhatsApp goes through, flagged for the team
    expect((await call(sellerX, 'POST', url, { body: 'Yes. Easier on WhatsApp though?' })).statusCode).toBe(200)
    const team = (await call(admin, 'GET', `/api/admin/deals/${deal.id}/messages`)).json()
    expect(team.map((m: any) => m.flagged)).toEqual([false, true])
    // Another buyer or publisher: not found
    expect((await call(buyerB, 'GET', url)).statusCode).toBe(404)
    expect((await call(sellerY, 'POST', url, { body: 'hi' })).statusCode).toBe(404)
    // A finished deal closes the conversation; it stays readable as a record
    await pool.query(`update deals set status = 'released' where id = $1`, [deal.id])
    expect((await call(buyerA, 'POST', url, { body: 'One more thing' })).json().error).toMatch('finished')
    expect((await call(buyerA, 'GET', url)).json()).toMatchObject({ open: true, canWrite: false, messages: [{}, {}] })
  })
})

describe('buyer and publisher tools', () => {
  const PNG = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(64, 7)])
  const put = (who: Who, url: string, bytes: Buffer, type: string) =>
    app.inject({ method: 'PUT', url, payload: bytes, headers: { cookie: who.cookie, 'content-type': type } })

  test('a buyer withdraws an unanswered buy-now request; only that, and only its own', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json()
    expect((await call(buyerB, 'POST', `/api/deals/${deal.id}/withdraw`)).statusCode).toBe(404)
    expect((await call(buyerA, 'POST', `/api/deals/${deal.id}/withdraw`)).json().status).toBe('cancelled')
    expect((await pool.query(`select b.status from bids b join deals d on d.bid_id = b.id where d.id = $1`, [deal.id])).rows[0].status).toBe('withdrawn')
    expect((await call(buyerA, 'POST', `/api/deals/${deal.id}/withdraw`)).json().error).toMatch('Only a buy-now request')
    // the slot is still on sale, and the buyer may ask again
    expect((await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).statusCode).toBe(200)
  })

  test("a buyer keeps its TRN for tax invoices; sees its team; what it's committed to if everything wins", async () => {
    expect((await call(buyerA, 'PUT', '/api/buyer/company', { trn: '12345' })).statusCode).toBe(400)
    expect((await call(buyerA, 'PUT', '/api/buyer/company', { trn: '100200300400500' })).statusCode).toBe(200)
    expect((await call(buyerA, 'GET', '/api/buyer/company')).json()).toMatchObject({ name: 'Northwind Fintech', trn: '100200300400500', team: [{ email: 'sara@northwind.ae' }] })
    await call(buyerA, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(3_600), brief: BRIEF })
    await call(buyerA, 'POST', `/api/slots/${slotY}/buy-now`, { brief: BRIEF })
    expect((await call(buyerA, 'GET', '/api/buyer/exposure')).json()).toMatchObject({ leading: { count: 1, amount: AED(3_600) },
      requests: { count: 1, amount: AED(5_500) }, total: AED(9_100) })
  })

  test('a publisher edits a placement: unbid future slots take the new terms, a slot with a bid keeps its own', async () => {
    const placement = (await pool.query(`select placement_id from slots where id = $1`, [slotX])).rows[0].placement_id
    await tx(c => generateSlots(c, placement, '2026-11-16', 5, now))
    await call(buyerA, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(3_600), brief: BRIEF })
    const edit = { name: 'Morning Markets', startingPrice: AED(3_900), buyNowPrice: AED(6_000), reservePrice: AED(4_500), autoAccept: true, creativeLeadHours: 48, closeLeadHours: 120 }
    expect((await call(sellerY, 'PUT', `/api/seller/placements/${placement}`, edit)).statusCode).toBe(404)
    expect((await call(sellerX, 'PUT', `/api/seller/placements/${placement}`, { ...edit, closeLeadHours: 48 })).json().error).toMatch('Bidding must close')
    expect((await call(sellerX, 'PUT', `/api/seller/placements/${placement}`, { ...edit, reservePrice: undefined })).json().error).toMatch('reserve price')
    const r = (await call(sellerX, 'PUT', `/api/seller/placements/${placement}`, edit)).json()
    expect(r, JSON.stringify(r)).toHaveProperty('slotsUpdated', 5)
    const slots = (await pool.query(`select id, starting_price, buy_now_price, reserve_price, auto_accept from slots where placement_id = $1`, [placement])).rows
    expect(slots.find(s => s.id === slotX)).toMatchObject({ starting_price: AED(3_500), buy_now_price: AED(5_500) })
    expect(slots.filter(s => s.id !== slotX).every(s => s.starting_price === AED(3_900) && s.reserve_price === AED(4_500) && s.auto_accept)).toBe(true)
    expect((await call(sellerX, 'GET', '/api/seller/profile')).json().placements[0]).toMatchObject({ startingPrice: AED(3_900), autoAccept: true })
  })

  test('a publisher uploads a logo and a rate card; visitors see the logo, the team opens the rate card', async () => {
    const mine = (await pool.query(`select id from outlets where company_id = $1`, [sellerX.companyId])).rows[0].id
    const { logoUrl } = (await put(sellerX, `/api/seller/outlets/${mine}/logo`, PNG, 'image/png')).json()
    expect(logoUrl).toMatch(new RegExp(`^/api/outlets/${mine}/logo\\?v=`))
    expect((await app.inject({ method: 'GET', url: logoUrl })).statusCode).toBe(200)
    expect((await call(null, 'GET', '/api/directory')).json().find((o: any) => o.id === mine).logoUrl).toBe(logoUrl)
    expect((await put(sellerY, `/api/seller/outlets/${mine}/logo`, PNG, 'image/png')).statusCode).toBe(404)

    const file = (await app.inject({ method: 'POST', url: '/api/files', payload: Buffer.from('%PDF-1.4 rate card'),
      headers: { cookie: sellerX.cookie, 'content-type': 'application/pdf', 'x-file-name': 'rates.pdf' } })).json()
    expect((await call(sellerY, 'PUT', '/api/seller/rate-card', { fileId: file.id })).json().error).toMatch('Upload the file first')
    expect((await call(sellerX, 'PUT', '/api/seller/rate-card', { fileId: file.id })).json()).toMatchObject({ name: 'rates.pdf' })
    expect((await call(sellerX, 'GET', '/api/seller/profile')).json().company.rateCard).toMatchObject({ fileId: file.id, name: 'rates.pdf' })
    expect((await call(admin, 'GET', `/api/admin/companies/${sellerX.companyId}`)).json().rateCard).toMatchObject({ fileId: file.id })
    expect((await call(admin, 'GET', `/api/files/${file.id}`)).statusCode).toBe(200)
    expect((await call(buyerA, 'GET', `/api/files/${file.id}`)).statusCode).toBe(404)
  })

  test('the monthly payout statement: opening balance, what was released, paid and deducted, closing balance', async () => {
    const st = (await call(sellerX, 'GET', '/api/seller/statements/2026-11')).json()
    expect(st).toMatchObject({ month: '2026-11', company: { name: 'Skyline FM' }, opening: 0, closing: 0, lines: [] })
    expect((await call(sellerX, 'GET', '/api/seller/statements/nope')).statusCode).toBe(404)
  })
})

describe('the calendar at scale: filters, pages and summaries in SQL', () => {
  async function catalogue() {
    // Three more outlets on different channels, times and prices, so every filter has something to keep and something to drop.
    await pool.query(`update outlets set sectors = '{Banking,Retail}', audience = 'Business commuters' where company_id = $1`, [sellerX.companyId])
    const add = async (name: string, channel: string, startsAt: string | undefined, endsAt: string | undefined, price: number, saleType: 'auction' | 'quick_sale', sectors: string) => {
      const outlet = (await pool.query(`insert into outlets (company_id, name, channel, sectors) values ($1, $2, $3, $4) returning id`, [sellerY.companyId, name, channel, sectors])).rows[0].id
      const placement = await tx(c => createPlacement(c, { outletId: outlet, name: `${name} slot`, saleType, days: [1, 2, 3, 4, 5, 6, 7], startsAt, endsAt,
        startingPrice: AED(price), creativeLeadHours: 48, closeLeadHours: 120 }, 'seller', now))
      await tx(c => generateSlots(c, placement, '2026-11-09', 7, now))
    }
    await add('Evening TV', 'tv', '19:00', '20:00', 9_000, 'auction', '{Automotive}')
    await add('Daily Paper', 'print', undefined, undefined, 12_000, 'quick_sale', '{Real estate,Banking}')
    await add('Lunch Podcast', 'podcast', '13:00', '13:30', 1_200, 'quick_sale', '{Retail}')
  }
  const range = 'from=2026-11-09T00:00:00%2B04:00&to=2026-11-16T00:00:00%2B04:00'

  test('every filter in SQL keeps exactly what the shared rule keeps (the one saved-search alerts use)', async () => {
    await catalogue()
    const all = (await call(buyerA, 'GET', `/api/slots?${range}`)).json()
    expect(all.length).toBeGreaterThan(20)
    const cases: [string, any][] = [
      ['ch=tv,print', { channels: ['tv', 'print'] }], ['sale=quick_sale', { saleTypes: ['quick_sale'] }], ['sector=banking', { sector: 'banking' }],
      [`max=${AED(5_000)}`, { maxPrice: AED(5_000) }], ['dp=morning', { dayparts: ['morning'] }], ['dp=allday,evening', { dayparts: ['allday', 'evening'] }],
      ['dp=afternoon', { dayparts: ['afternoon'] }], ['q=business%20markets', { q: 'business markets' }], ['q=paper', { q: 'paper' }],
      [`ch=radio,podcast&sale=quick_sale&max=${AED(2_000)}`, { channels: ['radio', 'podcast'], saleTypes: ['quick_sale'], maxPrice: AED(2_000) }],
    ]
    for (const [qs, f] of cases) {
      const sql = (await call(buyerA, 'GET', `/api/slots?${range}&${qs}`)).json().map((s: any) => s.id).sort()
      const js = all.filter((s: any) => matches(f, s, now.getTime())).map((s: any) => s.id).sort()
      expect(sql, qs).toEqual(js)
      expect(js.length, `${qs} should keep some and drop some`).toBeGreaterThan(0)
      expect(js.length, qs).toBeLessThan(all.length)
    }
  })

  test('the list pages and sorts on the server; programmes, days and outlets summarise', async () => {
    await catalogue()
    const first = (await call(buyerA, 'GET', `/api/slots/list?${range}&open=1&sort=price_asc&limit=5`)).json()
    const next = (await call(buyerA, 'GET', `/api/slots/list?${range}&open=1&sort=price_asc&limit=5&offset=5`)).json()
    expect(first.total).toBeGreaterThan(10)
    expect(first.items).toHaveLength(5)
    const prices = [...first.items, ...next.items].map((s: any) => s.topBid ?? s.startingPrice)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    expect(new Set([...first.items, ...next.items].map((s: any) => s.id)).size).toBe(10) // no overlap between pages
    expect((await call(buyerA, 'GET', `/api/slots/list?${range}&open=1&limit=1000`)).json().items.length).toBeLessThanOrEqual(100) // capped

    const progs = (await call(buyerA, 'GET', `/api/slots/programmes?${range}&open=1`)).json()
    const tv = progs.find((p: any) => p.outlet === 'Evening TV')
    expect(tv).toMatchObject({ channel: 'tv', allDay: false, slots: 1, fromPrice: AED(9_000), saleTypes: ['auction'] })
    expect(progs.find((p: any) => p.outlet === 'Daily Paper').allDay).toBe(true)
    const inside = (await call(buyerA, 'GET', `/api/slots?${range}&placement=${tv.placementId}&date=${tv.date}`)).json()
    expect(inside.map((s: any) => s.outlet)).toEqual(['Evening TV'])

    const days = (await call(buyerA, 'GET', `/api/slots/days?${range}&open=1`)).json()
    expect(days.every((d: any) => d.slots > 0 && d.outlets > 0 && d.fromPrice > 0 && d.channels.length > 0)).toBe(true)
    const outlets = (await call(buyerA, 'GET', `/api/slots/outlets?${range}&open=1&sort=price&limit=2`)).json()
    expect(outlets.total).toBe(5)
    expect(outlets.items.map((o: any) => o.outlet)).toEqual(['Lunch Podcast', 'Gulf Radio']) // a tie on price goes by name
    expect(outlets.items[0].days.length).toBe(7)
    expect((await call(buyerA, 'GET', `/api/slots/outlets?${range}&open=1&sort=price&limit=2&offset=4`)).json().items.map((o: any) => o.outlet)).toEqual(['Daily Paper'])
    // a guest sees the same calendar, without anything about bids of their own
    expect((await call(null, 'GET', `/api/slots/list?${range}&open=1&limit=3`)).json().items.every((s: any) => s.youBid === false && s.youLead === false)).toBe(true)
  })
})

describe('the publisher and Nashr calendars: the same search, scoped', () => {
  test('a publisher sees only its own slots, in every status; Nashr sees everything; status filters and daily counts', async () => {
    const range = 'from=2026-11-09T00:00:00%2B04:00&to=2026-11-16T00:00:00%2B04:00'
    expect((await call(sellerX, 'POST', `/api/seller/slots/${slotX}/block`, { blocked: true })).statusCode).toBe(200)
    const mine = (await call(sellerX, 'GET', `/api/seller/slots/list?${range}`)).json()
    expect(mine.total).toBe(1)
    expect(mine.items[0]).toMatchObject({ id: slotX, status: 'blocked', outlet: 'Skyline FM', reservePrice: AED(4_000) })
    // a scope or company in the address is ignored: the session decides
    expect((await call(sellerX, 'GET', `/api/seller/slots/list?${range}&scope=admin&company=${sellerY.companyId}`)).json().total).toBe(1)
    expect((await call(sellerX, 'GET', `/api/seller/slots/list?${range}&st=open`)).json().total).toBe(0)
    expect((await call(sellerX, 'GET', `/api/seller/slots/days?${range}`)).json()).toMatchObject([{ slots: 1, onSale: 0, waiting: 0, booked: 0, off: 1 }])
    expect((await call(buyerA, 'GET', `/api/seller/slots/list?${range}`)).statusCode).toBe(403)

    const all = (await call(admin, 'GET', `/api/admin/slots/list?${range}`)).json()
    expect(all.total).toBe(2) // Skyline FM's blocked slot and Gulf Radio's open one
    expect(all.items.map((x: any) => x.company).sort()).toEqual(['Gulf Radio', 'Skyline FM'])
    expect((await call(admin, 'GET', `/api/admin/slots/list?${range}&st=blocked`)).json().items.map((x: any) => x.id)).toEqual([slotX])
    expect((await call(admin, 'GET', `/api/admin/slots/list?${range}&q=gulf%20radio`)).json().total).toBe(1) // the publisher's name is searchable
    expect((await call(admin, 'GET', `/api/admin/slots/days?${range}`)).json()[0]).toMatchObject({ slots: 2, onSale: 1, off: 1 })
    expect((await call(sellerX, 'GET', `/api/admin/slots/list?${range}`)).statusCode).toBe(403)
    // the buyer's calendar still hides the publisher's blocked slot
    expect((await call(buyerA, 'GET', `/api/slots/list?${range}`)).json().items.map((x: any) => x.id)).not.toContain(slotX)
  })
})

describe('quick sale: interest reaches the publisher, who accepts one buyer', () => {
  const kinds = async (who: Who) => (await call(who, 'GET', '/api/notifications')).json().items.map((n: any) => n.kind)

  test('the publisher is told, sees it in the inbox with the brief, accepts one buyer; the other is told', async () => {
    await pool.query(`update slots set sale_type = 'quick_sale' where id = $1`, [slotX])
    expect((await call(buyerA, 'POST', `/api/slots/${slotX}/interest`, { brief: BRIEF })).statusCode).toBe(200)
    expect((await call(buyerA, 'POST', `/api/slots/${slotX}/interest`, { amount: AED(3_800), brief: BRIEF })).statusCode).toBe(200) // a new offer replaces the first
    expect((await call(buyerB, 'POST', `/api/slots/${slotX}/interest`, { brief: BRIEF })).statusCode).toBe(200)
    expect(await kinds(sellerX)).toContain('interest.received')
    const tasks = (await call(sellerX, 'GET', '/api/seller/inbox')).json()
    expect(tasks).toEqual([expect.objectContaining({ type: 'interest', slotId: slotX, interested: 2, amount: AED(3_800), buyer: null })])
    const panel = (await call(sellerX, 'GET', `/api/seller/slots/${slotX}`)).json()
    expect(panel.bids).toHaveLength(2)
    const a = panel.bids.find((b: any) => b.company === 'Northwind Fintech')
    expect(a).toMatchObject({ acceptable: true, amount: AED(3_800), brief: expect.objectContaining({ advertiser: BRIEF.advertiser }) })
    // someone else's slot cannot be used to accept
    expect((await call(sellerY, 'POST', `/api/seller/slots/${slotX}/accept-interest`, { bidId: a.id })).statusCode).toBe(404)
    const deal = (await call(sellerX, 'POST', `/api/seller/slots/${slotX}/accept-interest`, { bidId: a.id })).json()
    expect(deal).toMatchObject({ status: 'awaiting_payment' })
    expect((await pool.query(`select kind, amount from deals where id = $1`, [deal.id])).rows[0]).toEqual({ kind: 'quick_sale', amount: AED(3_800) })
    expect(await kinds(buyerA)).toContain('deal.awaiting_payment')
    expect(await kinds(buyerB)).toContain('interest.not_selected')
    expect((await call(sellerX, 'GET', '/api/seller/inbox')).json().filter((t: any) => t.type === 'interest')).toHaveLength(0)
  })

  test('unanswered interest lapses when bidding closes, and the buyer is told', async () => {
    await pool.query(`update slots set sale_type = 'quick_sale' where id = $1`, [slotX])
    await call(buyerA, 'POST', `/api/slots/${slotX}/interest`, { brief: BRIEF })
    now = T('2026-11-04T04:00:00Z'); await sweep(now)
    buyerA.cookie = await signIn('sara@northwind.ae')
    expect(await kinds(buyerA)).toContain('interest.expired')
    sellerX.cookie = await signIn('sales@skyline.ae')
    expect((await call(sellerX, 'GET', '/api/seller/inbox')).json().filter((t: any) => t.type === 'interest')).toHaveLength(0)
    const bid = (await call(sellerX, 'GET', `/api/seller/slots/${slotX}`)).json().bids[0]
    expect(bid).toMatchObject({ status: 'not_selected', acceptable: false })
  })
})

describe('auto-bid: the system bids up to the cap, and says so', () => {
  const notes = async (who: Who) => (await call(who, 'GET', '/api/notifications')).json().items

  test('a maximum holds the lead in steps up to the cap; the challenger is told at once; passing the cap is announced', async () => {
    // A sets auto-bid with a cap of 6,000 (bids 3,500 now)
    expect((await call(buyerA, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(3_500), maxAmount: AED(6_000), brief: BRIEF })).json())
      .toMatchObject({ leading: true, topAmount: AED(3_500), yourMax: AED(6_000) })
    // B bids 4,000: A's auto-bid answers at once, one step above B
    const b1 = (await call(buyerB, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(4_000), brief: BRIEF })).json()
    expect(b1).toMatchObject({ leading: false, beatenByAutoBid: true, topAmount: AED(4_120) })
    expect((await notes(buyerA)).map((n: any) => n.kind)).toContain('bid.auto_raised')
    expect((await call(buyerA, 'GET', `/api/slots/${slotX}`)).json()).toMatchObject({ youLead: true, topBid: AED(4_120), yourAutoMax: AED(6_000) })
    // B bids 5,900: A's auto-bid stops at the cap (6,000) and A is told the cap is reached
    expect((await call(buyerB, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(5_900) })).json()).toMatchObject({ leading: false, topAmount: AED(6_000) })
    expect((await notes(buyerA)).map((n: any) => n.kind)).toContain('bid.auto_cap')
    // A raises the cap without raising the visible bid
    expect((await call(buyerA, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(6_000), maxAmount: AED(8_000) })).json()).toMatchObject({ leading: true, topAmount: AED(6_000), yourMax: AED(8_000) })
    // B bids past the new cap: B leads and A hears its maximum was passed
    expect((await call(buyerB, 'POST', `/api/slots/${slotX}/bids`, { amount: AED(8_500) })).json()).toMatchObject({ leading: true, topAmount: AED(8_500) })
    expect((await notes(buyerA)).find((n: any) => n.kind === 'bid.outbid').data).toMatchObject({ max: AED(8_000), top: AED(8_500) })
    expect((await call(buyerA, 'GET', `/api/slots/${slotX}`)).json()).toMatchObject({ youLead: false, yourAutoMax: AED(8_000) })
    // B's own bids never reveal A's maximum
    expect(JSON.stringify((await call(buyerB, 'GET', `/api/slots/${slotX}`)).json())).not.toContain(String(AED(8_000)))
  })
})

describe('add placement as Omar described it', () => {
  const outletOf = async (seller: Who) => (await pool.query(`select id from outlets where company_id = $1 limit 1`, [seller.companyId])).rows[0].id
  const base = { saleType: 'auction', days: [1, 2, 3, 4, 5], startingPrice: AED(2_000), creativeLeadHours: 48, closeLeadHours: 144 }

  test('buyers see what they get, the specs and the language; contact details are refused', async () => {
    const outletId = await outletOf(sellerX)
    expect((await call(sellerX, 'POST', '/api/seller/placements', { ...base, outletId, name: 'Drive', description: 'Call 050 123 4567' })).json().error).toMatch('Emails and phone numbers')
    const r = (await call(sellerX, 'POST', '/api/seller/placements', { ...base, outletId, name: 'Drive', startsAt: '07:00', endsAt: '09:00', format: 'spots',
      description: 'A 30-second spot.', specs: 'MP3, 30 seconds', language: 'arabic', listFrom: '2026-11-08', listDays: 14 })).json()
    expect(r.slots).toBeGreaterThan(0)
    const slot = (await pool.query(`select s.id from slots s where s.placement_id = $1 order by starts_at limit 1`, [r.id])).rows[0].id
    expect((await call(buyerA, 'GET', `/api/slots/${slot}`)).json().details).toEqual({ description: 'A 30-second spot.', specs: 'MP3, 30 seconds', language: 'arabic', unit: 'day' })
  })

  test('a week-long placement makes one slot a week that runs seven days', async () => {
    const r = (await call(sellerX, 'POST', '/api/seller/placements', { ...base, outletId: await outletOf(sellerX), name: 'Banner week', days: [1], unit: 'week',
      listFrom: '2026-11-08', listDays: 28 })).json()
    const slots = (await pool.query(`select starts_at, ends_at, label from slots where placement_id = $1 order by starts_at`, [r.id])).rows
    expect(slots.length).toBe(r.slots)
    expect(slots.length).toBeGreaterThanOrEqual(2)
    expect(slots.every((s: any) => s.ends_at - s.starts_at === 7 * 86_400_000 && s.label === 'Full week')).toBe(true)
    expect((await call(sellerX, 'POST', '/api/seller/placements', { ...base, outletId: await outletOf(sellerX), name: 'Bad', days: [1, 2], unit: 'week' })).json().error).toMatch('one day')
  })

  test('"keep it on sale" tops itself up to the horizon every day; "I list weeks myself" does not', async () => {
    const outletId = await outletOf(sellerX)
    const rolling = (await call(sellerX, 'POST', '/api/seller/placements', { ...base, outletId, name: 'Rolling', days: [1, 2, 3, 4, 5, 6, 7], listing: 'rolling', horizonWeeks: 4, listFrom: '2026-11-01', listDays: 28 })).json().id
    const manual = (await call(sellerX, 'POST', '/api/seller/placements', { ...base, outletId, name: 'Manual', days: [1, 2, 3, 4, 5, 6, 7], listing: 'manual', listFrom: '2026-11-01', listDays: 28 })).json().id
    const last = async (id: string) => (await pool.query(`select max(air_date)::text d from slots where placement_id = $1`, [id])).rows[0].d
    expect(await last(rolling)).toBe('2026-11-28')
    now = T('2026-11-10T08:00:00Z'); await sweep(now)
    expect(await last(rolling)).toBe('2026-12-07') // nine days later, still four weeks ahead
    expect(await last(manual)).toBe('2026-11-28')
    await sweep(now) // nothing more to add on the same day
    expect(await last(rolling)).toBe('2026-12-07')
  })

  test('competitive separation warns the publisher when the same industry is booked that day', async () => {
    await pool.query(`update placements set separation = true where id = (select placement_id from slots where id = $1)`, [slotX])
    const twin = (await pool.query(`insert into slots (placement_id, air_date, kind, label, starts_at, ends_at, sale_type, starting_price, buy_now_price, auto_accept, currency, closes_at, creative_due_at, listed_at)
      select placement_id, air_date, kind, 'Break 9', starts_at + interval '1 hour', ends_at + interval '1 hour', sale_type, starting_price, buy_now_price, false, currency, closes_at, creative_due_at, listed_at
      from slots where id = $1 returning id`, [slotX])).rows[0].id
    const first = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    await call(sellerX, 'POST', `/api/seller/deals/${first}/accept`)
    const second = (await call(buyerB, 'POST', `/api/slots/${twin}/buy-now`, { brief: BRIEF })).json().id
    expect((await call(sellerX, 'GET', `/api/seller/deals/${second}`)).json().separation).toEqual({ industry: BRIEF.industry, count: 1 })
  })
})

describe('fixed price, book now', () => {
  const fixedSlot = async (autoAccept = false) => {
    const outletId = (await pool.query(`select id from outlets where company_id = $1 limit 1`, [sellerX.companyId])).rows[0].id
    const r = (await call(sellerX, 'POST', '/api/seller/placements', { outletId, name: 'Fixed spot', saleType: 'fixed', days: [1, 2, 3, 4, 5], startsAt: '12:00', endsAt: '13:00',
      startingPrice: AED(2_500), autoAccept, creativeLeadHours: 48, closeLeadHours: 144, listFrom: '2026-11-08', listDays: 14 })).json()
    return (await pool.query(`select id from slots where placement_id = $1 order by starts_at limit 1`, [r.id])).rows[0].id as string
  }

  test('the first buyer takes it off sale; the publisher confirms; a decline puts it back on sale', async () => {
    const slot = await fixedSlot()
    const d = (await call(buyerA, 'POST', `/api/slots/${slot}/book`, { brief: BRIEF })).json()
    expect(d).toMatchObject({ status: 'awaiting_publisher' })
    expect((await call(buyerB, 'POST', `/api/slots/${slot}/book`, { brief: BRIEF })).json().error).toMatch('just booked')
    expect((await call(buyerB, 'GET', `/api/slots/${slot}`)).json().available).toBe(false)
    expect((await call(sellerX, 'GET', '/api/seller/inbox')).json()).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'decide', kind: 'fixed', amount: AED(2_500) })]))
    await call(sellerX, 'POST', `/api/seller/deals/${d.id}/decline`, { reason: 'Programme moved' })
    expect((await call(buyerB, 'GET', `/api/slots/${slot}`)).json()).toMatchObject({ available: true, saleType: 'fixed' })
    expect((await call(buyerB, 'POST', `/api/slots/${slot}/book`, { brief: BRIEF })).json()).toMatchObject({ status: 'awaiting_publisher' })
  })

  test('with automatic confirmation the buyer is asked to pay at once; auctions-only prices are refused', async () => {
    const slot = await fixedSlot(true)
    expect((await call(buyerA, 'POST', `/api/slots/${slot}/book`, { brief: BRIEF })).json()).toMatchObject({ status: 'accepted_pay_now' })
    const outletId = (await pool.query(`select id from outlets where company_id = $1 limit 1`, [sellerX.companyId])).rows[0].id
    expect((await call(sellerX, 'POST', '/api/seller/placements', { outletId, name: 'Bad', saleType: 'fixed', days: [1], startingPrice: AED(100), reservePrice: AED(200),
      creativeLeadHours: 48, closeLeadHours: 144 })).json().error).toMatch('auctions only')
    expect((await call(buyerA, 'POST', `/api/slots/${slotX}/book`, { brief: BRIEF })).json().error).toMatch('fixed price')
  })
})

describe('business profiles both ways, never contact details', () => {
  test('the publisher sees the buyer before deciding, and the buyer sees the publisher before booking', async () => {
    expect((await call(buyerA, 'PUT', '/api/company/profile', { industry: 'Banking', about: 'Call us on 050 123 4567' })).json().error).toMatch('Emails and phone numbers')
    expect((await call(buyerA, 'PUT', '/api/company/profile', { industry: 'Banking', website: 'https://northwind.ae', about: 'Business banking for growing companies.' })).json())
      .toMatchObject({ name: 'Northwind Fintech', type: 'brand', industry: 'Banking', verified: true })
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    const seen = (await call(sellerX, 'GET', `/api/seller/deals/${deal}`)).json().buyerProfile
    expect(seen).toMatchObject({ name: 'Northwind Fintech', industry: 'Banking', about: 'Business banking for growing companies.', record: { completed: 0 } })
    const bidder = (await call(sellerX, 'GET', `/api/seller/slots/${slotX}`)).json().bids[0].profile
    expect(bidder.name).toBe('Northwind Fintech')
    const pub = (await call(buyerB, 'GET', `/api/slots/${slotX}`)).json().publisher
    expect(pub).toMatchObject({ name: 'Skyline FM', type: 'publisher', outlets: ['Skyline FM'] })
    // no emails, phones or people anywhere in either profile
    for (const p of [seen, bidder, pub]) expect(JSON.stringify(p)).not.toMatch(/@|\+971|sara|ali|email|phone/i)
  })
})
