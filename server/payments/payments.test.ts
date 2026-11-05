import { beforeEach, describe, expect, test } from 'vitest'
import { pool, tx } from '../core/db.js'
import { generateSlots } from '../catalog/placements.js'
import { accept, requestBuyNow } from '../marketplace/market.js'
import { transition } from '../marketplace/deals.js'
import { sweep } from '../marketplace/sweeper.js'
import { FakeProvider } from './provider.js'
import { approve, cancelByBuyer, cancelBySeller, confirmPayment, decideDispute, handleProviderEvent, reconcile, runMoneyOps } from './payments.js'
import { balance, heldFor } from './ledger.js'
import { AED, BRIEF, T, company, radio, reset, slot } from '../test/helpers.js'

const now = T('2026-11-01T08:00:00Z')
const h = (t: Date, n: number) => new Date(t.getTime() + n * 3_600_000)
const VISA = 'pm_card_4242', DECLINED = 'pm_card_0002', THREE_DS = 'pm_card_3155'

let provider: FakeProvider, p: Awaited<ReturnType<typeof radio>>, buyer: string, other: string
beforeEach(async () => {
  await reset()
  provider = new FakeProvider()
  // Gulf News-sized booking: AED 76,000, VAT-registered publisher, 12% commission, Nashr not yet VAT-registered
  p = await radio(now, { startingPrice: AED(70_000), buyNowPrice: AED(76_000) })
  await generateSlots(pool, p.placement, '2026-11-09', 1, now)
  buyer = await company('Northwind Fintech', 'buyer')
  other = await company('Al Futtaim', 'buyer')
})

/** Buy-now request accepted by the seller: the buyer now owes AED 79,800 (76,000 + 5% VAT). */
async function accepted(label = 'Break 2') {
  const s = await slot(p.placement, '2026-11-09', label)
  const d = await tx(c => requestBuyNow(c, { slotId: s.id, buyerId: buyer, brief: BRIEF }, now))
  await tx(c => accept(c, d.id, 'seller', now))
  return d.id as string
}
const deal = async (id: string) => (await pool.query(`select * from deals where id = $1`, [id])).rows[0]
const pay = (id: string, card = VISA, at = h(now, 1)) => confirmPayment(provider, { dealId: id, buyerId: buyer, paymentMethod: card }, at)
const ops = async (id: string) => (await pool.query(`select kind, amount, status from money_ops where deal_id = $1 order by created_at, kind`, [id])).rows
const RUN_END = T('2026-11-09T03:15:30Z') // Break 2, Mon 9 Nov 07:15:30 Dubai

describe('scenario 1: full booking', () => {
  test('pay, prove, approve, release, payout; the ledger reconciles to the fil', async () => {
    const id = await accepted()
    expect(await pay(id)).toMatchObject({ status: 'succeeded' })
    expect((await deal(id)).status).toBe('secured')
    expect(await heldFor(pool, id, 'AED')).toBe(AED(79_800))

    await tx(c => transition(c, id, 'submit_proof', 'seller', h(RUN_END, 2)))
    await tx(c => approve(c, id, `buyer:${buyer}`, h(RUN_END, 30)))
    expect((await deal(id)).status).toBe('released')
    expect(await heldFor(pool, id, 'AED')).toBe(0)
    expect(await balance(pool, 'nashr_revenue', 'AED')).toBe(-AED(9_120))         // credit = Nashr's 12%
    expect(await balance(pool, 'vat_payable', 'AED')).toBe(0)                       // Nashr VAT switched off
    expect(await ops(id)).toContainEqual({ kind: 'transfer', amount: AED(70_680), status: 'pending' })

    await runMoneyOps(provider, h(RUN_END, 31))
    expect(await reconcile(provider, 'AED')).toEqual({ ledgerCash: AED(9_120), providerCash: AED(9_120), ok: true })

    const tr = (await pool.query(`select provider_id from money_ops where kind = 'transfer'`)).rows[0].provider_id
    expect(await handleProviderEvent({ id: 'evt_1', type: 'payout.paid', data: { id: tr } }, h(RUN_END, 100))).toBe('handled')
    expect((await deal(id)).status).toBe('paid_out')
    const sums = (await pool.query(`select debit, credit, sum(amount)::bigint s from ledger_entries group by 1, 2 order by 1, 2`)).rows
    expect(sums.reduce((t, r) => t + r.s, 0)).toBe(AED(79_800) + AED(79_800) + AED(70_680)) // charge, release split, transfer
  })
})

describe('card problems', () => {
  test('scenario 5: declined card, buyer updates it and pays; each attempt is its own operation', async () => {
    const id = await accepted()
    expect(await pay(id, DECLINED)).toMatchObject({ status: 'failed', failure: 'Your card was declined.' })
    expect((await deal(id)).status).toBe('awaiting_payment')
    expect(await pay(id, VISA, h(now, 2))).toMatchObject({ status: 'succeeded' })
    expect((await ops(id)).map(o => o.status)).toEqual(['failed', 'succeeded'])
  })

  test('scenario 5: if the card keeps failing, the booking lapses at the deadline', async () => {
    const id = await accepted()
    await pay(id, DECLINED)
    await sweep(h(now, 48))
    expect((await deal(id)).status).toBe('lapsed')
  })

  test('scenario 6: bank authentication, then the provider confirms; the same notification twice counts once', async () => {
    const id = await accepted()
    const r = await pay(id, THREE_DS)
    expect(r.status).toBe('requires_action')
    expect((await deal(id)).status).toBe('awaiting_payment')
    const ch = (await pool.query(`select provider_id from money_ops where deal_id = $1`, [id])).rows[0].provider_id
    provider.authenticate(ch)
    expect(await handleProviderEvent({ id: 'evt_9', type: 'charge.succeeded', data: { id: ch } }, h(now, 2))).toBe('handled')
    expect(await handleProviderEvent({ id: 'evt_9', type: 'charge.succeeded', data: { id: ch } }, h(now, 3))).toBe('duplicate')
    expect((await deal(id)).status).toBe('secured')
    expect(await heldFor(pool, id, 'AED')).toBe(AED(79_800))
    expect((await reconcile(provider, 'AED')).ok).toBe(true)
  })

  test('a provider error mid-payment is retried with the same key: the card is never charged twice', async () => {
    const id = await accepted()
    const real = provider.charge.bind(provider)
    provider.charge = async a => { await real(a); throw new Error('network timeout') } // charged, but we never heard back
    await expect(pay(id)).rejects.toThrow('network timeout')
    provider.charge = real
    expect(await pay(id, VISA, h(now, 2))).toMatchObject({ status: 'succeeded' })
    expect(await ops(id)).toEqual([{ kind: 'charge', amount: AED(79_800), status: 'succeeded' }])
    expect(await provider.balance('AED')).toBe(AED(79_800)) // charged once
  })

  test('only the buyer can pay, and only once accepted', async () => {
    const id = await accepted()
    await expect(confirmPayment(provider, { dealId: id, buyerId: other, paymentMethod: VISA }, now)).rejects.toThrow('not yours')
    await pay(id)
    await expect(pay(id)).rejects.toThrow('not waiting for payment')
  })
})

describe('scenario 7: buyer cancels', () => {
  test('inside 24 hours of paying: refunded in full minus the card cost (shown before they confirm)', async () => {
    const id = await accepted()
    await pay(id)
    await tx(c => cancelByBuyer(c, id, buyer, h(now, 20)))
    expect((await deal(id)).status).toBe('cancelled')
    expect(await ops(id)).toContainEqual({ kind: 'refund', amount: 7_748_480, status: 'pending' }) // 79,800 − (2.9% + AED 1) = 77,484.80
    await runMoneyOps(provider, h(now, 21))
    expect(await reconcile(provider, 'AED')).toMatchObject({ ledgerCash: 231_520, ok: true })     // card cost kept: 2,315.20
  })

  test('after 24 hours: the publisher keeps 15% (+ its VAT), Nashr takes its fee on that, the rest is refunded', async () => {
    const id = await accepted()
    await pay(id)
    await tx(c => cancelByBuyer(c, id, buyer, h(now, 30)))
    const o = await ops(id)
    expect(o).toContainEqual({ kind: 'refund', amount: 6_551_480, status: 'pending' })   // 79,800 − 11,970 − 2,315.20
    expect(o).toContainEqual({ kind: 'transfer', amount: 1_060_200, status: 'pending' }) // 11,970 − 12% of 11,400
    await runMoneyOps(provider, h(now, 31))
    expect(await reconcile(provider, 'AED')).toMatchObject({ ledgerCash: AED(1_368) + 231_520, ok: true })
    expect(await heldFor(pool, id, 'AED')).toBe(0)
  })

  test('after the creative deadline: no refund', async () => {
    const id = await accepted()
    await pay(id)
    await expect(tx(c => cancelByBuyer(c, id, buyer, T('2026-11-07T04:00:00Z')))).rejects.toThrow('creative deadline has passed')
  })
})

describe('seller at fault', () => {
  test('scenarios 8 and 25: seller cancels, buyer refunded in full, card cost deducted from the next payout', async () => {
    const first = await accepted('Break 2')
    await pay(first)
    await tx(c => cancelBySeller(c, first, p.seller, 'Programme replaced by breaking news', h(now, 5)))
    expect(await ops(first)).toEqual([{ kind: 'charge', amount: AED(79_800), status: 'succeeded' }, { kind: 'refund', amount: AED(79_800), status: 'pending' }])
    expect(await balance(pool, `seller_receivable:${p.seller}`, 'AED')).toBe(231_520)

    const second = await accepted('Break 3')
    await pay(second, VISA, h(now, 6))
    await tx(c => transition(c, second, 'submit_proof', 'seller', h(RUN_END, 2)))
    await tx(c => approve(c, second, `buyer:${buyer}`, h(RUN_END, 3)))
    expect(await ops(second)).toContainEqual({ kind: 'transfer', amount: AED(70_680) - 231_520, status: 'pending' })
    expect(await balance(pool, `seller_receivable:${p.seller}`, 'AED')).toBe(0)
    await runMoneyOps(provider, h(RUN_END, 4))
    expect((await reconcile(provider, 'AED')).ok).toBe(true)
  })

  test('scenario 10: no proof by the deadline, the buyer is refunded in full and the reason blames the publisher', async () => {
    const id = await accepted()
    await pay(id)
    expect((await deal(id)).next_deadline_at.toISOString()).toBe('2026-11-11T03:15:30.000Z') // 2 working days after the run
    await sweep(T('2026-11-11T03:15:30Z'))
    expect((await deal(id)).status).toBe('refunded')
    expect(await ops(id)).toContainEqual({ kind: 'refund', amount: AED(79_800), status: 'pending' })
    expect(await balance(pool, `seller_receivable:${p.seller}`, 'AED')).toBe(231_520)
  })

  test('scenario 11: the review window passes, the money is released automatically', async () => {
    const id = await accepted()
    await pay(id)
    await tx(c => transition(c, id, 'submit_proof', 'seller', T('2026-11-09T08:00:00Z')))
    await sweep(T('2026-11-16T08:00:00Z'))
    expect((await deal(id)).status).toBe('released')
    expect(await ops(id)).toContainEqual({ kind: 'transfer', amount: AED(70_680), status: 'pending' })
  })
})

describe('scenario 12: disputes', () => {
  test('partial refund: the admin enters the amount, the rest is released to the seller', async () => {
    const id = await accepted()
    await pay(id)
    await tx(async c => {
      await transition(c, id, 'submit_proof', 'seller', h(RUN_END, 2))
      await transition(c, id, 'report_issue', 'buyer', h(RUN_END, 5), 'Ran at the wrong time')
      await transition(c, id, 'escalate', 'system:timer', h(RUN_END, 53))
    })
    await expect(tx(c => decideDispute(c, id, 'partial_refund', 'admin', h(RUN_END, 60), AED(90_000)))).rejects.toThrow('between zero')
    await tx(c => decideDispute(c, id, 'partial_refund', 'admin', h(RUN_END, 60), AED(19_950)))
    const o = await ops(id)
    expect(o).toContainEqual({ kind: 'refund', amount: AED(19_950), status: 'pending' })
    expect(o).toContainEqual({ kind: 'transfer', amount: AED(59_850) - AED(6_840) - 231_520, status: 'pending' }) // fee 12% of 57,000; card cost to seller
    await runMoneyOps(provider, h(RUN_END, 61))
    expect((await reconcile(provider, 'AED')).ok).toBe(true)
    expect(await heldFor(pool, id, 'AED')).toBe(0)
  })

  test('release and full refund also work, and every outcome tells both sides', async () => {
    for (const [label, outcome, status] of [['Break 1', 'release', 'released'], ['Break 3', 'refund', 'refunded']] as const) {
      const id = await accepted(label)
      await pay(id)
      await tx(async c => {
        await transition(c, id, 'submit_proof', 'seller', h(RUN_END, 2))
        await transition(c, id, 'report_issue', 'buyer', h(RUN_END, 5))
        await transition(c, id, 'escalate', 'system:timer', h(RUN_END, 53))
        await decideDispute(c, id, outcome, 'admin', h(RUN_END, 60))
      })
      expect((await deal(id)).status).toBe(status)
      const told = (await pool.query(`select company_id from notifications where deal_id = $1 and kind = 'dispute.decided'`, [id])).rows.map(r => r.company_id)
      expect(told.sort()).toEqual([(await deal(id)).buyer_id, (await deal(id)).seller_id].sort())
    }
    await runMoneyOps(provider, h(RUN_END, 61))
    expect((await reconcile(provider, 'AED')).ok).toBe(true)
  })

  test('make-good: the seller reruns, the money stays secured', async () => {
    const id = await accepted()
    await pay(id)
    await tx(async c => {
      await transition(c, id, 'submit_proof', 'seller', h(RUN_END, 2))
      await transition(c, id, 'report_issue', 'buyer', h(RUN_END, 5))
      await transition(c, id, 'escalate', 'admin', h(RUN_END, 6))
      await decideDispute(c, id, 'make_good', 'admin', h(RUN_END, 7))
    })
    expect((await deal(id)).status).toBe('secured')
    expect(await heldFor(pool, id, 'AED')).toBe(AED(79_800))
  })
})

test('a seller cannot put slots on sale before the payout account is verified', async () => {
  await pool.query(`update companies set payouts_enabled = false where id = $1`, [p.seller])
  await expect(generateSlots(pool, p.placement, '2026-11-16', 7, now)).rejects.toThrow('payout account is verified')
})
