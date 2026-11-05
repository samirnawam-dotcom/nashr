import { beforeEach, describe, expect, test } from 'vitest'
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
import { runMoneyOps } from '../payments/payments.js'
import { balance } from '../payments/ledger.js'
import { addWorkingDays } from '../core/market.js'

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
})

describe('who can see what (SPEC 5.5, scenario 15)', () => {
  test('every route refuses the wrong role, and other companies\' records look like they do not exist', async () => {
    const deal = (await call(buyerA, 'POST', `/api/slots/${slotX}/buy-now`, { brief: BRIEF })).json().id
    const cases: [Who | null, string, string, number][] = [
      [null, 'GET', '/api/slots', 401],
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
      const payload = method === 'GET' ? undefined : url.endsWith('pay') ? { paymentMethod: 'pm_card_4242' } : url.endsWith('choose') ? { bidId: deal } : url.includes('settings') ? { value: 1 } : {}
      expect((await call(who, method, url, payload)).statusCode, `${method} ${url}`).toBe(code)
    }
    expect((await call(sellerX, 'GET', `/api/seller/deals/${deal}`)).statusCode).toBe(200)
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
  expect(docs).toEqual(['receipt', 'media_invoice'])
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
    expect(page.documents.map((d: any) => d.type)).toEqual(['receipt', 'media_invoice'])
    const inv = (await call(buyerA, 'GET', `/api/documents/${page.documents[1].id}`)).json()
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
