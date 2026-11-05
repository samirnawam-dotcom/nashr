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

let now = T('2026-11-01T08:00:00Z')
const app = buildApp({ provider: new FakeProvider(), clock: () => now, storage: new DiskStorage(mkdtempSync(join(tmpdir(), 'nashr-files-'))) })
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
