import { type Db, one, pool, tx } from '../core/db.js'
import { audit } from '../core/audit.js'
import { setting } from '../core/settings.js'
import { pct, split } from '../core/money.js'
import { transition } from '../marketplace/deals.js'
import { MarketError } from '../marketplace/market.js'
import { balance, heldFor, post } from './ledger.js'
import type { ChargeResult, PaymentProvider } from './provider.js'

const ratesOf = (d: any) => ({ commissionBp: d.commission_bp, mediaVatBp: d.media_vat_bp, feeVatBp: d.fee_vat_bp })
const lockDeal = (db: Db, id: string) => one(db, `select * from deals where id = $1 for update`, [id])

/** Card processing cost estimate (SPEC 12A): a setting, since the real fee is only known later. */
async function processingCost(db: Db, amount: number, at: Date) {
  return pct(amount, await setting(db, 'processing_fee_bp', at)) + await setting<number>(db, 'processing_fee_fixed', at)
}

async function newOp(db: Db, o: { dealId: string | null; companyId?: string; kind: string; amount: number; currency: string; key: string }, at: Date) {
  return one(db, `insert into money_ops (deal_id, company_id, kind, amount, currency, idempotency_key, created_at, updated_at)
                  values ($1, $2, $3, $4, $5, $6, $7, $7) returning *`, [o.dealId, o.companyId ?? null, o.kind, o.amount, o.currency, o.key, at])
}

// ---------------------------------------------------------------- charging

/**
 * "Confirm payment" (brief section 11). Never automatic: only the buyer's own action charges the card.
 * The operation is recorded before the provider is called and finished after, so no provider call runs inside a
 * database transaction and a retry can never charge twice (same idempotency key).
 */
export async function confirmPayment(provider: PaymentProvider, a: { dealId: string; buyerId: string; paymentMethod: string }, at: Date) {
  const op = await tx(async c => {
    const deal = await lockDeal(c, a.dealId)
    if (deal.buyer_id !== a.buyerId) throw new MarketError('This booking is not yours.')
    if (deal.status !== 'awaiting_payment') throw new MarketError('This booking is not waiting for payment.')
    // An attempt whose outcome is unknown (the provider call failed mid-way) is retried with the same key,
    // so the provider returns the original result instead of charging twice.
    const unknown = (await c.query(`select * from money_ops where deal_id = $1 and kind = 'charge' and status = 'pending'`, [deal.id])).rows[0]
    if (unknown) return unknown
    const { n } = await one(c, `select count(*)::int n from money_ops where deal_id = $1 and kind = 'charge'`, [deal.id])
    return newOp(c, { dealId: deal.id, kind: 'charge', amount: split(deal.amount, ratesOf(deal)).buyerPays, currency: deal.currency, key: `charge:${deal.id}:${n + 1}` }, at)
  })
  const res = await provider.charge({ amount: op.amount, currency: op.currency, paymentMethod: a.paymentMethod, idempotencyKey: op.idempotency_key })
  return tx(c => recordCharge(c, op.id, res, at))
}

async function recordCharge(db: Db, opId: string, res: ChargeResult, at: Date) {
  const op = await one(db, `select * from money_ops where id = $1 for update`, [opId])
  if (op.status === 'succeeded') return { status: 'succeeded' as const, ref: op.ref }
  await db.query(`update money_ops set status = $2, provider_id = $3, failure = $4, updated_at = $5 where id = $1`,
    [op.id, res.status, res.id, res.failure ?? null, at])
  if (res.status === 'failed') await audit(db, 'system', 'payment.failed', 'deal', op.deal_id, { ref: op.ref, failure: res.failure }, at)
  if (res.status === 'succeeded') await secure(db, op, at)
  return { status: res.status, ref: op.ref, failure: res.failure }
}

async function secure(db: Db, op: any, at: Date) {
  const deal = await lockDeal(db, op.deal_id)
  await post(db, [{ debit: 'cash', credit: 'held', amount: op.amount, dealId: deal.id, ref: op.ref }], op.currency, at)
  if (deal.status !== 'awaiting_payment') { // money arrived after the booking lapsed: give it back, at Nashr's cost
    await newOp(db, { dealId: deal.id, kind: 'refund', amount: op.amount, currency: op.currency, key: `refund:${deal.id}:late` }, at)
    return audit(db, 'system', 'payment.late_refunded', 'deal', deal.id, { ref: op.ref }, at)
  }
  await transition(db, deal.id, 'pay', 'buyer', at, op.ref)
  // Payment secured: the other bids on this slot are no longer needed (SPEC 11.1 #7).
  await db.query(`update bids set status = 'not_selected' where slot_id = $1 and status in ('active', 'outbid')`, [deal.slot_id])
}

// ---------------------------------------------------------------- release and refunds

/**
 * Release `kept` (part of what the buyer paid, default all of it) to the seller: payout, Nashr fee and VAT on the fee.
 * The transfer goes out through the outbox, net of anything the seller owes (refund costs at their fault).
 */
async function settle(db: Db, deal: any, kept: number, at: Date) {
  if (kept <= 0) return
  const rates = ratesOf(deal)
  const price = Math.round(kept * 10_000 / (10_000 + rates.mediaVatBp)) // split the kept amount back into price + media VAT
  const s = split(price, rates)
  const payout = kept - s.fee - s.feeVat
  const seller = `seller_payable:${deal.seller_id}`
  await post(db, [
    { debit: 'held', credit: seller, amount: payout, dealId: deal.id },
    { debit: 'held', credit: 'nashr_revenue', amount: s.fee, dealId: deal.id },
    { debit: 'held', credit: 'vat_payable', amount: s.feeVat, dealId: deal.id },
  ], deal.currency, at)
  const owed = await balance(db, `seller_receivable:${deal.seller_id}`, deal.currency)
  const deduct = Math.min(Math.max(owed, 0), payout)
  await post(db, [{ debit: seller, credit: `seller_receivable:${deal.seller_id}`, amount: deduct, dealId: deal.id, ref: 'deducted from payout' }], deal.currency, at)
  if (payout - deduct > 0)
    await newOp(db, { dealId: deal.id, companyId: deal.seller_id, kind: 'transfer', amount: payout - deduct, currency: deal.currency, key: `transfer:${deal.id}` }, at)
}

/**
 * Refund `amount` to the buyer and settle whatever is left to the seller.
 * Who bears the card cost (SPEC 12A): the buyer on their own cancellation (kept from the refund), the seller when at fault
 * (recovered from their next payout), Nashr otherwise.
 */
async function refund(db: Db, deal: any, amount: number, cost: 'buyer' | 'seller' | 'nashr', at: Date) {
  const held = await heldFor(db, deal.id, deal.currency)
  const fee = cost === 'nashr' ? 0 : await processingCost(db, held, at)
  const toBuyer = cost === 'buyer' ? Math.max(amount - fee, 0) : amount
  if (cost === 'buyer') await post(db, [{ debit: 'held', credit: 'refund_costs', amount: amount - toBuyer, dealId: deal.id, ref: 'card cost kept from refund' }], deal.currency, at)
  if (cost === 'seller') await post(db, [{ debit: `seller_receivable:${deal.seller_id}`, credit: 'refund_costs', amount: fee, dealId: deal.id, ref: 'card cost recoverable from seller' }], deal.currency, at)
  if (toBuyer > 0) await newOp(db, { dealId: deal.id, kind: 'refund', amount: toBuyer, currency: deal.currency, key: `refund:${deal.id}:${at.getTime()}` }, at)
  await settle(db, deal, held - amount, at)
  await audit(db, 'system', 'refund.initiated', 'deal', deal.id, { toBuyer, cost }, at)
}

/** Buyer approves the proof, or the review window passes (auto_release). */
export async function approve(db: Db, dealId: string, actor: string, at: Date) {
  const deal = await transition(db, dealId, 'approve', actor, at)
  await settle(db, deal, await heldFor(db, deal.id, deal.currency), at)
  return deal
}

/** Money side of events the sweeper fires (it has no business knowing money rules). */
export async function onTimerEvent(db: Db, deal: any, event: string, at: Date) {
  if (event === 'auto_release') await settle(db, deal, await heldFor(db, deal.id, deal.currency), at)
  if (event === 'proof_missed') await refund(db, deal, await heldFor(db, deal.id, deal.currency), 'seller', at) // brief scenario 10
}

/** Buyer cancels (brief section 12): full refund in the free window, then minus the cancellation fee, nothing after the creative deadline. */
export async function cancelByBuyer(db: Db, dealId: string, buyerId: string, at: Date) {
  const deal = await lockDeal(db, dealId)
  if (deal.buyer_id !== buyerId) throw new MarketError('This booking is not yours.')
  const { paid_at, creative_due_at } = await one(db, `select (select at from deal_events where deal_id = $1 and event = 'pay' order by id desc limit 1) paid_at,
                                                        s.creative_due_at from slots s where s.id = $2`, [deal.id, deal.slot_id])
  if (at >= creative_due_at) throw new MarketError('This booking can no longer be cancelled for a refund: the creative deadline has passed.')
  const held = await heldFor(db, deal.id, deal.currency)
  const free = at.getTime() - paid_at.getTime() <= (await setting<number>(db, 'free_cancel_hours', at)) * 3_600_000
  const keepPrice = free ? 0 : pct(deal.amount, await setting(db, 'cancel_fee_bp', at)) // the publisher keeps 15% (+ its VAT)
  const keep = keepPrice + pct(keepPrice, deal.media_vat_bp)
  await transition(db, dealId, 'cancel_by_buyer', `buyer:${buyerId}`, at, free ? 'Inside the free cancellation window' : 'Cancellation fee applies')
  await refund(db, deal, held - keep, 'buyer', at)
}

/** Seller cancels: full refund, recorded against the seller, card cost recovered from their payouts (scenarios 8, 25). */
export async function cancelBySeller(db: Db, dealId: string, sellerId: string, reason: string, at: Date) {
  const deal = await lockDeal(db, dealId)
  if (deal.seller_id !== sellerId) throw new MarketError('This booking is not yours.')
  await transition(db, dealId, 'cancel_by_seller', `seller:${sellerId}`, at, reason)
  await refund(db, deal, await heldFor(db, deal.id, deal.currency), 'seller', at)
}

/** Admin decision on a dispute (brief section 12): release, full refund, partial refund or make-good. */
export async function decideDispute(db: Db, dealId: string, outcome: 'release' | 'refund' | 'partial_refund' | 'make_good', actor: string, at: Date, refundAmount?: number) {
  const deal = await transition(db, dealId, outcome, actor, at)
  const held = await heldFor(db, deal.id, deal.currency)
  if (outcome === 'release') await settle(db, deal, held, at)
  if (outcome === 'refund') await refund(db, deal, held, 'seller', at)
  if (outcome === 'partial_refund') {
    if (!refundAmount || refundAmount <= 0 || refundAmount >= held) throw new MarketError('Enter a partial refund between zero and the amount paid.')
    await refund(db, deal, refundAmount, 'seller', at)
  }
  return deal
}

// ---------------------------------------------------------------- outbox and provider events

/** Execute pending refunds and transfers. Safe to run repeatedly: the idempotency key makes each call happen once. */
export async function runMoneyOps(provider: PaymentProvider, at: Date) {
  const { rows } = await pool.query(`select o.*, c.provider_account,
      (select provider_id from money_ops ch where ch.deal_id = o.deal_id and ch.kind = 'charge' and ch.status = 'succeeded' limit 1) as charge_id
    from money_ops o left join companies c on c.id = o.company_id where o.status = 'pending' and o.kind <> 'charge' order by o.created_at`)
  for (const op of rows) {
    const res = op.kind === 'refund'
      ? await provider.refund({ chargeId: op.charge_id, amount: op.amount, idempotencyKey: op.idempotency_key })
      : await provider.transfer({ amount: op.amount, currency: op.currency, destination: op.provider_account, idempotencyKey: op.idempotency_key })
    await tx(async c => {
      const cur = await one(c, `select status from money_ops where id = $1 for update`, [op.id])
      if (cur.status !== 'pending') return
      await c.query(`update money_ops set status = 'succeeded', provider_id = $2, updated_at = $3 where id = $1`, [op.id, res.id, at])
      await post(c, [op.kind === 'refund'
        ? { debit: 'held', credit: 'cash', amount: op.amount, dealId: op.deal_id, ref: op.ref }
        : { debit: `seller_payable:${op.company_id}`, credit: 'cash', amount: op.amount, dealId: op.deal_id, ref: op.ref }], op.currency, at)
    })
  }
  return rows.length
}

/**
 * Provider notifications (webhooks). Stored first under the event id, so the same event never counts twice (SPEC 5.6).
 */
export async function handleProviderEvent(ev: { id: string; type: string; data: any }, at: Date) {
  return tx(async c => {
    const ins = await c.query(`insert into provider_events (id, type, payload, received_at) values ($1, $2, $3, $4) on conflict do nothing`,
      [ev.id, ev.type, JSON.stringify(ev.data), at])
    if (!ins.rowCount) return 'duplicate'
    const op = (await c.query(`select * from money_ops where provider_id = $1`, [ev.data.id])).rows[0]
    if (!op) return 'ignored'
    if (ev.type === 'charge.succeeded') await recordCharge(c, op.id, { id: op.provider_id, status: 'succeeded' }, at)
    if (ev.type === 'charge.failed') await recordCharge(c, op.id, { id: op.provider_id, status: 'failed', failure: ev.data.failure }, at)
    if (ev.type === 'payout.paid') await transition(c, op.deal_id, 'paid_out', 'system:provider', at, op.ref)
    if (ev.type === 'charge.dispute.created') await audit(c, 'system:provider', 'chargeback.opened', 'deal', op.deal_id, ev.data, at) // goes to the admin as a dispute
    return 'handled'
  })
}

/** Daily check (SPEC 5.6): the ledger balances, and Nashr's cash in the ledger matches the provider balance. */
export async function reconcile(provider: PaymentProvider, currency: string) {
  const ledgerCash = await balance(pool, 'cash', currency)
  const providerCash = await provider.balance(currency)
  // ponytail: real Stripe also deducts its fees; B5 records them from balance transactions before comparing.
  return { ledgerCash, providerCash, ok: ledgerCash === providerCash }
}
