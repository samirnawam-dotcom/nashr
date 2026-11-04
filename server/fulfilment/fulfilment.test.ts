import { beforeEach, describe, expect, test } from 'vitest'
import { pool, tx } from '../core/db.js'
import { generateSlots } from '../catalog/placements.js'
import { accept, requestBuyNow } from '../marketplace/market.js'
import { sweep } from '../marketplace/sweeper.js'
import { FakeProvider } from '../payments/provider.js'
import { approve, confirmPayment, creativeMissed } from '../payments/payments.js'
import { allowExtraRound, reviewCreative, uploadCreative } from './creative.js'
import { submitProof } from './proof.js'
import { offerFix, reportIssue, respondToOffer } from './issues.js'
import { confirmPreRun } from './prerun.js'
import { AED, BRIEF, T, company, radio, reset, slot } from '../test/helpers.js'

const now = T('2026-11-01T08:00:00Z')
const h = (t: Date, n: number) => new Date(t.getTime() + n * 3_600_000)
const AIR = T('2026-11-09T03:15:00Z')       // Break 2, Mon 9 Nov 07:15 Dubai
const AFTER = T('2026-11-09T06:00:00Z')
const PROOF = { as_run_log: 'files/asrun.pdf', audio_clip: 'files/spot.mp3' }
const WAV = { fileKey: 'files/spot.wav', fileType: 'audio/wav', fileSize: 4_000_000 }

let p: Awaited<ReturnType<typeof radio>>, buyer: string, id: string
beforeEach(async () => {
  await reset()
  p = await radio(now, { buyNowPrice: AED(76_000) })
  await generateSlots(pool, p.placement, '2026-11-09', 1, now)
  buyer = await company('Northwind Fintech', 'buyer')
  const s = await slot(p.placement, '2026-11-09', 'Break 2')
  const d = await tx(c => requestBuyNow(c, { slotId: s.id, buyerId: buyer, brief: BRIEF }, now))
  await tx(c => accept(c, d.id, 'seller', now))
  id = d.id
})
const paid = () => confirmPayment(new FakeProvider(), { dealId: id, buyerId: buyer, paymentMethod: 'pm_card_4242' }, h(now, 1))
const deal = async () => (await pool.query(`select * from deals where id = $1`, [id])).rows[0]
const run = <T>(fn: (c: any) => Promise<T>) => tx(fn)

describe('creative', () => {
  test('buyers can send creative from acceptance; wrong files are technical issues and never count as a round', async () => {
    const bad = await run(c => uploadCreative(c, { dealId: id, buyerId: buyer, fileKey: 'f.pdf', fileType: 'application/pdf', fileSize: 1 }, now))
    expect(bad).toMatchObject({ status: 'technical_issue', reason: expect.stringContaining("isn't accepted for radio") })
    const ok = await run(c => uploadCreative(c, { dealId: id, buyerId: buyer, ...WAV }, now))
    expect(ok).toMatchObject({ version: 2, status: 'pending' })
    await expect(run(c => uploadCreative(c, { dealId: id, buyerId: buyer, ...WAV }, now))).rejects.toThrow('still reviewing')
  })

  test('two change rounds, then approve or reject with a reason, unless more rounds are allowed', async () => {
    const send = () => run(c => uploadCreative(c, { dealId: id, buyerId: buyer, ...WAV }, now))
    const review = (decision: any, reason?: string) => run(c => reviewCreative(c, { dealId: id, sellerId: p.seller, decision, reason }, now))
    await send(); expect(await review('changes', 'Louder voice-over')).toBe('changes_requested')
    await send(); expect(await review('technical')).toBe('technical_issue')   // damaged file: free
    await send(); expect(await review('changes', 'Shorter ending')).toBe('changes_requested')
    await send()
    await expect(review('changes', 'Again')).rejects.toThrow('Both change rounds are used')
    await expect(review('reject', 'I just do not like it')).rejects.toThrow('Choose a rejection reason')
    await run(c => allowExtraRound(c, id, 'seller', now))
    expect(await review('changes', 'Final tweak')).toBe('changes_requested')
    await send(); expect(await review('approve')).toBe('approved')
    const n = (await pool.query(`select count(*)::int n from notifications where company_id = $1 and kind like 'creative.%'`, [buyer])).rows[0].n
    expect(n).toBe(5)
  })

  test('no uploads after the material deadline', async () => {
    await expect(run(c => uploadCreative(c, { dealId: id, buyerId: buyer, ...WAV }, T('2026-11-07T03:15:00Z')))).rejects.toThrow('material deadline')
  })

  test('scenario 9: no creative; the seller releases the slot and the buyer is refunded minus the 15%', async () => {
    await paid()
    await expect(run(c => creativeMissed(c, id, p.seller, 'release', h(now, 3)))).rejects.toThrow('once the material deadline has passed')
    await run(c => creativeMissed(c, id, p.seller, 'release', T('2026-11-07T04:00:00Z')))
    expect((await deal()).status).toBe('cancelled')
    expect((await pool.query(`select note from deal_events where event = 'creative_missed'`)).rows[0].note).toBe('The buyer did not supply the creative')
    const ref = (await pool.query(`select amount from money_ops where kind = 'refund'`)).rows[0].amount
    expect(ref).toBe(AED(79_800) - AED(11_970) - 231_520)
  })

  test('scenario 9: or runs a placeholder and is paid in full', async () => {
    await paid()
    await run(c => creativeMissed(c, id, p.seller, 'placeholder', T('2026-11-07T04:00:00Z')))
    expect(await deal()).toMatchObject({ status: 'secured', placeholder: true })
  })
})

describe('proof', () => {
  test('scenario 26: a radio seller cannot send proof without the as-run log and the audio clip', async () => {
    await paid()
    await expect(run(c => submitProof(c, { dealId: id, sellerId: p.seller, items: PROOF }, h(AIR, -1)))).rejects.toThrow('once the ad has run')
    await expect(run(c => submitProof(c, { dealId: id, sellerId: p.seller, items: { audio_clip: 'x' } }, AFTER)))
      .rejects.toThrow('Add the as-run log before sending proof.')
    await expect(run(c => submitProof(c, { dealId: id, sellerId: p.seller, items: {} }, AFTER)))
      .rejects.toThrow('Add the as-run log and the audio clip before sending proof.')
    expect((await run(c => submitProof(c, { dealId: id, sellerId: p.seller, items: PROOF }, AFTER))).status).toBe('in_review')
  })
})

describe('report an issue', () => {
  beforeEach(async () => {
    await paid()
    await run(c => submitProof(c, { dealId: id, sellerId: p.seller, items: PROOF }, AFTER))
  })
  const report = () => run(c => reportIssue(c, { dealId: id, buyerId: buyer, reason: 'wrong_time', note: 'Aired at 08:40, not 07:15' }, h(AFTER, 2)))

  test('reasons come from the list; a note is required', async () => {
    await expect(run(c => reportIssue(c, { dealId: id, buyerId: buyer, reason: 'changed_my_mind', note: 'x' }, h(AFTER, 2)))).rejects.toThrow('Choose what went wrong')
    await expect(run(c => reportIssue(c, { dealId: id, buyerId: buyer, reason: 'quality', note: ' ' }, h(AFTER, 2)))).rejects.toThrow('short note')
  })

  test('scenario 23: wrong date, the seller offers a rerun, the buyer accepts; money released after the rerun proof', async () => {
    await report()
    const d = await deal()
    expect(d.status).toBe('issue_open')
    expect(d.next_deadline_at.toISOString()).toBe(h(AFTER, 50).toISOString()) // auto-release paused; 48h for the seller
    const rerun = T('2026-11-16T03:15:00Z')
    await expect(run(c => respondToOffer(c, { dealId: id, buyerId: buyer, accept: true }, h(AFTER, 3)))).rejects.toThrow('not answered yet')
    await run(c => offerFix(c, { dealId: id, sellerId: p.seller, offer: { type: 'make_good', runAt: rerun } }, h(AFTER, 5)))
    await run(c => respondToOffer(c, { dealId: id, buyerId: buyer, accept: true }, h(AFTER, 6)))
    expect(await deal()).toMatchObject({ status: 'secured', make_good_at: rerun })
    expect((await deal()).next_deadline_at.toISOString()).toBe('2026-11-18T03:15:00.000Z') // proof due 2 working days after the rerun
    expect((await pool.query(`select status from issues`)).rows[0].status).toBe('resolved')
    await expect(run(c => submitProof(c, { dealId: id, sellerId: p.seller, items: PROOF }, h(rerun, -1)))).rejects.toThrow('once the ad has run')
    await run(c => submitProof(c, { dealId: id, sellerId: p.seller, items: PROOF }, h(rerun, 1)))
    await run(c => approve(c, id, `buyer:${buyer}`, h(rerun, 3)))
    expect((await deal()).status).toBe('released')
  })

  test('scenario 24: the seller does not answer within 48 hours; it becomes a dispute', async () => {
    await report()
    await sweep(h(AFTER, 50))
    expect((await deal()).status).toBe('disputed')
    expect((await pool.query(`select status from issues`)).rows[0].status).toBe('escalated')
    const kinds = (await pool.query(`select kind from notifications where kind = 'dispute.opened'`)).rows
    expect(kinds).toHaveLength(2)
  })

  test('a partial refund offer, accepted: part refunded, the rest released', async () => {
    await report()
    await run(c => offerFix(c, { dealId: id, sellerId: p.seller, offer: { type: 'partial_refund', amount: AED(19_950) } }, h(AFTER, 5)))
    await run(c => respondToOffer(c, { dealId: id, buyerId: buyer, accept: true }, h(AFTER, 6)))
    expect((await deal()).status).toBe('released')
    const o = (await pool.query(`select kind, amount from money_ops where kind <> 'charge' order by kind`)).rows
    expect(o).toEqual([{ kind: 'refund', amount: AED(19_950) }, { kind: 'transfer', amount: AED(59_850) - AED(6_840) - 231_520 }])
  })

  test('a corrected proof, accepted: back to review with a fresh window; refused offers go to the admin', async () => {
    await report()
    await expect(run(c => offerFix(c, { dealId: id, sellerId: p.seller, offer: { type: 'corrected_proof', items: {} } }, h(AFTER, 4))))
      .rejects.toThrow('Add the as-run log')
    await run(c => offerFix(c, { dealId: id, sellerId: p.seller, offer: { type: 'corrected_proof', items: PROOF } }, h(AFTER, 5)))
    await run(c => respondToOffer(c, { dealId: id, buyerId: buyer, accept: false }, h(AFTER, 6)))
    expect((await deal()).status).toBe('disputed')
  })
})

test('pre-run check: requested 48 hours before air, both sides confirm', async () => {
  await paid()
  await sweep(h(AIR, -49))
  expect((await pool.query(`select count(*)::int n from prerun_checks`)).rows[0].n).toBe(0)
  await sweep(h(AIR, -48))
  const kinds = (await pool.query(`select kind from notifications where kind like 'prerun.%' order by kind`)).rows.map(r => r.kind)
  expect(kinds).toEqual(['prerun.confirm_final_version', 'prerun.confirm_slot_and_creative'])
  await run(c => confirmPreRun(c, id, p.seller, h(AIR, -40)))
  await run(c => confirmPreRun(c, id, buyer, h(AIR, -39)))
  expect((await pool.query(`select seller_confirmed_at is not null s, buyer_confirmed_at is not null b from prerun_checks`)).rows[0]).toEqual({ s: true, b: true })
})
