import { beforeEach, describe, expect, test } from 'vitest'
import { pool, tx } from '../core/db.js'
import { generateSlots } from '../catalog/placements.js'
import { accept, placeBid, requestBuyNow } from './market.js'
import { AED, BRIEF, T, company, radio, reset, slot } from '../test/helpers.js'

const now = T('2026-11-01T08:00:00Z')
let p: Awaited<ReturnType<typeof radio>>, b1: any, b2: any, agency: string, other: string

const client = async (buyerId: string, name: string, over: Record<string, unknown> = {}) =>
  (await pool.query(`insert into clients (buyer_id, name, industry, budget, budget_stop, trn, created_at) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [buyerId, name, over.industry ?? 'Retail', over.budget ?? null, over.budgetStop ?? false, over.trn ?? null, now])).rows[0].id as string

beforeEach(async () => {
  await reset()
  p = await radio(now)
  await generateSlots(pool, p.placement, '2026-11-09', 1, now)
  b1 = await slot(p.placement, '2026-11-09', 'Break 1'); b2 = await slot(p.placement, '2026-11-09', 'Break 2')
  agency = await company('Blue Agency', 'buyer'); other = await company('Other Buyer', 'buyer')
})

describe('agencies book for their clients', () => {
  test('a booking carries the client, and the order names the client for the agency only', async () => {
    const c = await client(agency, 'Gulf Shoes', { trn: '100200300400500' })
    await tx(x => requestBuyNow(x, { slotId: b2.id, buyerId: agency, brief: BRIEF, clientId: c }, now))
    const d = (await pool.query(`select * from deals where slot_id = $1`, [b2.id])).rows[0]
    expect(d.client_id).toBe(c)
    await tx(x => accept(x, d.id, 'seller', now))
    const order = (await pool.query(`select lines from documents where deal_id = $1 and type = 'order'`, [d.id])).rows[0]
    expect(order.lines.client).toMatchObject({ name: 'Gulf Shoes', trn: '100200300400500' })
  })

  test('only the agency\'s own active clients can be named', async () => {
    const theirs = await client(other, 'Not Yours')
    await expect(tx(x => requestBuyNow(x, { slotId: b2.id, buyerId: agency, brief: BRIEF, clientId: theirs }, now))).rejects.toThrow('active clients')
    const archived = await client(agency, 'Old Client')
    await pool.query(`update clients set status = 'archived' where id = $1`, [archived])
    await expect(tx(x => requestBuyNow(x, { slotId: b2.id, buyerId: agency, brief: BRIEF, clientId: archived }, now))).rejects.toThrow('active clients')
  })

  test('brand safety checks the client\'s industry and name, not only the brief', async () => {
    await pool.query(`update outlets set blocked_industries = '{Alcohol}', blocked_advertisers = '{Rival Shoes}' where id = $1`, [p.outlet])
    const drinks = await client(agency, 'Cool Drinks', { industry: 'Alcohol' })
    await expect(tx(x => requestBuyNow(x, { slotId: b2.id, buyerId: agency, brief: BRIEF, clientId: drinks }, now))).rejects.toThrow('does not accept Alcohol')
    const rival = await client(agency, 'Rival Shoes LLC')
    await expect(tx(x => requestBuyNow(x, { slotId: b2.id, buyerId: agency, brief: BRIEF, clientId: rival }, now))).rejects.toThrow('does not run ads for this advertiser')
  })

  test('budgets live on campaigns only: a client never refuses a booking on budget', async () => {
    const c = await client(agency, 'Any Budget', { budget: AED(1_000), budgetStop: true }) // an old client budget is ignored
    await tx(x => requestBuyNow(x, { slotId: b1.id, buyerId: agency, brief: BRIEF, clientId: c }, now)) // AED 5,500
    await tx(x => placeBid(x, { slotId: b2.id, buyerId: agency, amount: AED(3_500), brief: BRIEF, clientId: c }, now))
  })

  test('a campaign made for a client carries the client; naming another client is refused', async () => {
    const c = await client(agency, 'Gulf Shoes'), d = await client(agency, 'Desert Cars')
    const cmp = (await pool.query(`insert into campaigns (buyer_id, name, budget, client_id, created_at) values ($1, 'Winter', $2, $3, $4) returning id`,
      [agency, AED(50_000), c, now])).rows[0].id
    await expect(tx(x => requestBuyNow(x, { slotId: b2.id, buyerId: agency, brief: BRIEF, campaignId: cmp, clientId: d }, now))).rejects.toThrow('another client')
    await tx(x => requestBuyNow(x, { slotId: b2.id, buyerId: agency, brief: BRIEF, campaignId: cmp }, now))
    expect((await pool.query(`select client_id from deals where slot_id = $1`, [b2.id])).rows[0].client_id).toBe(c)
  })
})
