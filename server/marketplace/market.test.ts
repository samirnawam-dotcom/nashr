import { beforeEach, describe, expect, test } from 'vitest'
import { pool, tx } from '../core/db.js'
import { generateSlots } from '../catalog/placements.js'
import { accept, acceptInterest, chooseBid, decline, placeBid, requestBuyNow, showInterest } from './market.js'
import { transition } from './deals.js'
import { sweep } from './sweeper.js'
import { AED, BRIEF, T, company, radio, reset, slot } from '../test/helpers.js'

const now = T('2026-11-01T08:00:00Z')          // Sunday 1 Nov
const CLOSE = T('2026-11-04T03:15:00Z')        // Break 2 on Mon 9 Nov closes 5 days before air
const h = (t: Date, n: number) => new Date(t.getTime() + n * 3_600_000)

let p: Awaited<ReturnType<typeof radio>>
let b2: any, A: string, B: string, C: string
beforeEach(async () => {
  await reset()
  p = await radio(now, { reservePrice: AED(4_000) })
  await generateSlots(pool, p.placement, '2026-11-09', 1, now)
  b2 = await slot(p.placement, '2026-11-09', 'Break 2')
  ;[A, B, C] = [await company('Northwind Fintech', 'buyer'), await company('Al Futtaim', 'buyer'), await company('Emirates NBD', 'buyer')]
})

const bid = (buyerId: string, amount: number, maxAmount?: number, at = now) =>
  // the two numbers these tests pin; the screen also gets the buyer's maximum and the next minimum bid
  tx(c => placeBid(c, { slotId: b2.id, buyerId, amount: AED(amount), maxAmount: maxAmount && AED(maxAmount), brief: BRIEF }, at)).then(r => ({ leading: r.leading, topAmount: r.topAmount }))
const deal = async () => (await pool.query(`select * from deals where slot_id = $1 order by created_at desc, ref desc limit 1`, [b2.id])).rows[0]
const slotNow = async () => (await pool.query(`select * from slots where id = $1`, [b2.id])).rows[0]

describe('bidding', () => {
  test('the first bid needs a complete booking brief', async () => {
    await expect(tx(c => placeBid(c, { slotId: b2.id, buyerId: A, amount: AED(4_000) }, now))).rejects.toThrow('booking brief is required')
    await expect(tx(c => placeBid(c, { slotId: b2.id, buyerId: A, amount: AED(4_000), brief: { ...BRIEF, notes: 'call 0501234567' } }, now)))
      .rejects.toThrow('Remove the email or phone number')
  })

  test('floor and the 3% minimum step', async () => {
    await expect(bid(A, 3_000)).rejects.toThrow('at least AED 3,500.')
    await bid(A, 4_200)
    await expect(bid(B, 4_300)).rejects.toThrow('at least AED 4,326.')
    expect((await bid(B, 4_326)).leading).toBe(true)
  })

  test('auto-bid: the higher maximum leads at one step above the other; ties go to the earlier bid', async () => {
    await bid(A, 4_000, 5_000)
    expect(await bid(B, 4_500)).toEqual({ leading: false, topAmount: AED(4_635) }) // A raised to 4,500 + 3%
    expect(await bid(C, 5_000)).toEqual({ leading: false, topAmount: AED(5_000) }) // tie on 5,000: A was first
    expect(await bid(B, 5_200)).toEqual({ leading: true, topAmount: AED(5_200) })
    const rows = (await pool.query(`select buyer_id, status from bids where slot_id = $1 and buyer_id = $2`, [b2.id, A])).rows
    expect(rows.every(r => r.status === 'outbid')).toBe(true)
  })

  test('the leader can raise only their maximum without raising the visible bid', async () => {
    await bid(A, 4_000)
    expect(await bid(A, 4_000, 6_000)).toEqual({ leading: true, topAmount: AED(4_000) })
    await expect(bid(A, 4_000)).rejects.toThrow('already the top bidder')
    expect(await bid(B, 5_000)).toEqual({ leading: false, topAmount: AED(5_150) })
  })

  test('scenario 13: 50 bids at the same moment produce exactly one top bid and unique order', async () => {
    const buyers = await Promise.all(Array.from({ length: 50 }, (_, i) => company(`Buyer ${i}`, 'buyer')))
    const results = await Promise.allSettled(buyers.map((b, i) => tx(c => placeBid(c, { slotId: b2.id, buyerId: b, amount: AED(3_500 + i * 200), brief: BRIEF }, now))))
    const s = await slotNow()
    const { rows } = await pool.query(`select seq, amount, status from bids where slot_id = $1 order by seq`, [b2.id])
    expect(rows.map(r => r.seq)).toEqual(rows.map((_, i) => i + 1)) // gapless, no duplicates
    expect(rows.filter(r => r.status === 'active')).toHaveLength(1)
    expect(s.top_amount).toBe(Math.max(...rows.map(r => r.amount)))
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(rows.length)
  })

  test('no bids after closing time', async () => {
    await expect(bid(A, 4_000, undefined, CLOSE)).rejects.toThrow('Bidding is closed')
  })
})

describe('after the auction closes (sweeper)', () => {
  test('top bid goes to the seller with 24 hours to decide; rates are frozen at acceptance', async () => {
    await bid(A, 3_800); await bid(B, 4_500)
    await sweep(CLOSE)
    let d = await deal()
    expect(d).toMatchObject({ status: 'awaiting_seller', buyer_id: B, amount: AED(4_500) })
    expect(d.next_deadline_at.toISOString()).toBe(h(CLOSE, 24).toISOString())
    d = await tx(c => accept(c, d.id, 'seller', h(CLOSE, 2)))
    expect(d).toMatchObject({ status: 'awaiting_payment', commission_bp: 1200, media_vat_bp: 500, fee_vat_bp: 0 })
    expect(d.next_deadline_at.toISOString()).toBe(h(CLOSE, 50).toISOString()) // 48h to pay, inside the creative deadline
    expect((await pool.query(`select status from bids where buyer_id = $1`, [A])).rows[0].status).toBe('outbid') // still valid until paid
  })

  test('auto-accept at or above the reserve (buyer still has to pay)', async () => {
    await pool.query(`update slots set auto_accept = true where id = $1`, [b2.id])
    await bid(A, 4_100)
    await sweep(CLOSE)
    expect((await deal()).status).toBe('awaiting_payment')
  })

  test('scenarios 3 and 4: no reply in 24h, seller picks the next bid, buyer does not pay, up to 2 choices then relist', async () => {
    await bid(A, 3_600); await bid(B, 3_800); await bid(C, 4_000)
    await sweep(CLOSE)
    await sweep(h(CLOSE, 24))                                     // seller silent: declined automatically
    expect((await deal()).status).toBe('declined')
    expect((await slotNow()).status).toBe('awaiting_choice')

    const bBid = (await pool.query(`select id from bids where buyer_id = $1`, [B])).rows[0].id
    let d = await tx(c => chooseBid(c, b2.id, bBid, 'seller', h(CLOSE, 30)))
    expect(d).toMatchObject({ status: 'awaiting_payment', buyer_id: B, amount: AED(3_800) })
    await sweep(h(CLOSE, 30 + 48))                                // B does not pay by the creative deadline: lapses
    expect((await deal()).status).toBe('lapsed')
    // no further round: nobody could pay before the creative is due (SPEC G8), so the slot is unsold and A is told
    expect(await slotNow()).toMatchObject({ status: 'unsold', top_amount: null })
    expect((await pool.query(`select status from bids where buyer_id = $1`, [A])).rows[0].status).toBe('not_selected')
    expect((await pool.query(`select 1 from notifications where company_id = $1 and kind = 'bid.not_selected'`, [A])).rowCount).toBe(1)
    const aBid = (await pool.query(`select id from bids where buyer_id = $1`, [A])).rows[0].id
    await expect(tx(c => chooseBid(c, b2.id, aBid, 'seller', h(CLOSE, 80)))).rejects.toThrow('cannot be chosen')
    const events = (await pool.query(`select event from deal_events order by id`)).rows.map(r => r.event)
    expect(events).toEqual(['opened', 'expire', 'opened', 'accept', 'lapse'])
  })

  test('scenario 2: seller declines with a reason; a reason is required', async () => {
    await bid(A, 3_600); await bid(B, 3_800)
    await sweep(CLOSE)
    const d = await deal()
    await expect(tx(c => decline(c, d.id, ' ', 'seller', h(CLOSE, 1)))).rejects.toThrow('reason is required')
    await tx(c => decline(c, d.id, 'Category not accepted', 'seller', h(CLOSE, 1)))
    expect((await pool.query(`select note from deal_events where event = 'decline'`)).rows[0].note).toBe('Category not accepted')
    expect((await slotNow()).status).toBe('awaiting_choice')
  })

  test('the seller may let the choice window pass: the slot is relisted', async () => {
    await bid(A, 3_600); await bid(B, 3_800)
    await sweep(CLOSE)
    await tx(async c => decline(c, (await deal()).id, 'Not a fit', 'seller', h(CLOSE, 1)))
    await sweep(h(CLOSE, 25))
    expect((await slotNow()).status).toBe('open')
  })
})

describe('buy-now and quick sale', () => {
  test('scenario 21: buy-now request; accepting ends the auction and tells other bidders', async () => {
    await bid(A, 4_000)
    const r = await tx(c => requestBuyNow(c, { slotId: b2.id, buyerId: B, brief: BRIEF }, now))
    expect(r).toMatchObject({ status: 'awaiting_seller', amount: AED(5_500) })
    await expect(tx(c => requestBuyNow(c, { slotId: b2.id, buyerId: B, brief: BRIEF }, now))).rejects.toThrow('already have')
    await tx(c => accept(c, r.id, 'seller', h(now, 1)))
    expect((await slotNow()).status).toBe('booked')
    expect((await pool.query(`select status from bids where buyer_id = $1`, [A])).rows[0].status).toBe('not_selected')
  })

  test('an accepted buy-now that is not paid is relisted', async () => {
    const r = await tx(c => requestBuyNow(c, { slotId: b2.id, buyerId: B, brief: BRIEF }, now))
    await tx(c => accept(c, r.id, 'seller', h(now, 1)))
    await sweep(h(now, 49))
    expect(await slotNow()).toMatchObject({ status: 'open', sale_type: 'quick_sale' })
  })

  test('declined buy-now: the auction carries on', async () => {
    const r = await tx(c => requestBuyNow(c, { slotId: b2.id, buyerId: B, brief: BRIEF }, now))
    await tx(c => decline(c, r.id, 'Prefer the auction', 'seller', h(now, 1)))
    expect((await slotNow()).status).toBe('open')
    expect((await bid(A, 3_600)).leading).toBe(true)
  })

  test('scenario 22: two buyers show interest, the seller accepts the second; nothing is charged before payment', async () => {
    await pool.query(`update slots set sale_type = 'quick_sale' where id = $1`, [b2.id])
    await expect(tx(c => showInterest(c, { slotId: b2.id, buyerId: A, amount: AED(3_000), brief: BRIEF }, now))).rejects.toThrow(/cannot be below AED \d{1,3}(,\d{3})*\./)
    const first = await tx(c => showInterest(c, { slotId: b2.id, buyerId: A, brief: BRIEF }, now))
    const second = await tx(c => showInterest(c, { slotId: b2.id, buyerId: B, amount: AED(3_900), brief: BRIEF }, now))
    const d = await tx(c => acceptInterest(c, second.id, 'seller', h(now, 2)))
    expect(d).toMatchObject({ status: 'awaiting_payment', buyer_id: B, amount: AED(3_900) })
    expect((await pool.query(`select status from bids where id = $1`, [first.id])).rows[0].status).toBe('not_selected')
    expect((await pool.query(`select count(*)::int n from ledger_entries`)).rows[0].n).toBe(0)
  })
})

describe('breaks, any break and package on the same airing', () => {
  test('booking the package holds every break; a lapse releases them again', async () => {
    const pkg = await slot(p.placement, '2026-11-09', 'All 4 breaks')
    await tx(c => placeBid(c, { slotId: pkg.id, buyerId: A, amount: AED(15_000), brief: BRIEF }, now))
    await sweep(T('2026-11-04T02:30:00Z')) // package (from 06:30) closes 5 days before
    const d = (await pool.query(`select * from deals where slot_id = $1`, [pkg.id])).rows[0]
    await tx(c => accept(c, d.id, 'seller', T('2026-11-04T03:00:00Z')))
    const statuses = async () => Object.fromEntries((await pool.query(`select label, status from slots where air_date = '2026-11-09'`)).rows.map(r => [r.label, r.status]))
    // "Any break" closed at the same time as the package with no bids, so it is unsold
    expect(await statuses()).toMatchObject({ 'Break 1': 'held', 'Break 4': 'held', 'Any break': 'unsold', 'All 4 breaks': 'booked' })
    await sweep(T('2026-11-06T03:00:00Z')) // A never pays
    expect(await statuses()).toMatchObject({ 'Break 1': 'open', 'Break 4': 'open', 'All 4 breaks': 'open' })
    const sale = (await pool.query(`select distinct sale_type from slots where air_date = '2026-11-09' and status = 'open'`)).rows
    expect(sale).toEqual([{ sale_type: 'quick_sale' }]) // bidding closed, still sellable before the creative deadline
  })

  test('airtime is never sold twice: accepting the package ends a waiting request for one of its breaks', async () => {
    const pkg = await slot(p.placement, '2026-11-09', 'All 4 breaks')
    const req = await tx(c => requestBuyNow(c, { slotId: b2.id, buyerId: B, brief: BRIEF }, T('2026-11-04T02:00:00Z'))) // still waiting when the package is accepted
    await tx(c => placeBid(c, { slotId: pkg.id, buyerId: A, amount: AED(15_000), brief: BRIEF }, now))
    await sweep(T('2026-11-04T02:30:00Z'))
    const d = (await pool.query(`select * from deals where slot_id = $1`, [pkg.id])).rows[0]
    await tx(c => accept(c, d.id, 'seller', T('2026-11-04T03:00:00Z')))
    expect((await pool.query(`select event from deal_events where deal_id = $1 order by id desc limit 1`, [req.id])).rows[0].event).toBe('supersede')
    await expect(tx(c => accept(c, req.id, 'seller', T('2026-11-04T03:05:00Z')))).rejects.toThrow()
    expect((await pool.query(`select status from slots where id = $1`, [b2.id])).rows[0].status).toBe('held')
  })

  test('booking a single break holds the package but not the other breaks', async () => {
    const r = await tx(c => requestBuyNow(c, { slotId: b2.id, buyerId: A, brief: BRIEF }, now))
    await tx(c => accept(c, r.id, 'seller', h(now, 1)))
    const rows = Object.fromEntries((await pool.query(`select label, status from slots where air_date = '2026-11-09'`)).rows.map(r => [r.label, r.status]))
    expect(rows).toMatchObject({ 'Break 2': 'booked', 'Break 1': 'open', 'Any break': 'open', 'All 4 breaks': 'held' })
  })
})

describe('state machine', () => {
  test('blocked transitions are refused', async () => {
    const r = await tx(c => requestBuyNow(c, { slotId: b2.id, buyerId: A, brief: BRIEF }, now))
    await expect(tx(c => transition(c, r.id, 'pay', 'buyer', now))).rejects.toThrow('Cannot pay a deal that is awaiting_seller')
  })

  test('scenario 11: proof not reviewed in 5 working days is released automatically (UAE weekend skipped)', async () => {
    const r = await tx(c => requestBuyNow(c, { slotId: b2.id, buyerId: A, brief: BRIEF }, now))
    await tx(c => accept(c, r.id, 'seller', now))
    await tx(c => transition(c, r.id, 'pay', 'buyer', h(now, 1)))
    const proofAt = T('2026-11-09T08:00:00Z') // Monday
    const d = await tx(c => transition(c, r.id, 'submit_proof', 'seller', proofAt))
    expect(d.next_deadline_at.toISOString()).toBe('2026-11-16T08:00:00.000Z') // next Monday
    await sweep(T('2026-11-16T07:59:00Z'))
    expect((await deal()).status).toBe('in_review')
    await sweep(T('2026-11-16T08:00:00Z'))
    expect((await deal()).status).toBe('released')
  })
})
