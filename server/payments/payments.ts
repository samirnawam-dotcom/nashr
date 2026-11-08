import { type Db, one, pool, tx } from '../core/db.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { pct, split } from '../core/money.js'
import { TRANSITIONS, transition } from '../marketplace/deals.js'
import { afterNoGo, MarketError, refreshConflicts, relist, releaseBids } from '../marketplace/market.js'
import { balance, heldFor, post } from './ledger.js'
import type { ChargeResult, PaymentProvider } from './provider.js'
import { issueCommissionInvoice, issueMediaInvoice, issueReceipt, reissueAfterRefund } from '../documents/documents.js'

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
    const unknown = (await c.query(`select * from money_ops where deal_id = $1 and kind = 'charge' and status in ('pending', 'requires_action')`, [deal.id])).rows[0]
    if (unknown?.status === 'requires_action') throw new MarketError('Your bank is still waiting for you to confirm the last payment.')
    if (unknown) return unknown
    const { n } = await one(c, `select count(*)::int n from money_ops where deal_id = $1 and kind = 'charge'`, [deal.id])
    return newOp(c, { dealId: deal.id, kind: 'charge', amount: split(deal.amount, ratesOf(deal)).buyerPays, currency: deal.currency, key: `charge:${deal.id}:${n + 1}` }, at)
  })
  const res = await provider.charge({ amount: op.amount, currency: op.currency, paymentMethod: a.paymentMethod, idempotencyKey: op.idempotency_key })
  const out = await tx(c => recordCharge(c, op.id, res, at))
  if (out.status === 'succeeded') await recordFee(provider, op.id, at)
  // 3-D Secure: the buyer's browser completes it with this secret; the provider's webhook reports the outcome.
  return res.status === 'requires_action' ? { ...out, clientSecret: res.clientSecret } : out
}

/**
 * Book the provider's processing fee for a succeeded charge (cash → processing_fees), so Nashr's cash in the ledger
 * matches the provider's balance, which is net of fees. Once per charge; a missed one is caught by the money check.
 */
export async function recordFee(provider: PaymentProvider, opId: string, at: Date) {
  if (!provider.chargeFee) return
  const op = await one(pool, `select * from money_ops where id = $1`, [opId])
  if (op.status !== 'succeeded' || !op.provider_id) return
  const fee = await provider.chargeFee(op.provider_id)
  await tx(async c => {
    const done = await c.query(`select 1 from ledger_entries where debit = 'processing_fees' and ref = $1`, [`fee ${op.ref}`])
    if (!done.rowCount) await post(c, [{ debit: 'processing_fees', credit: 'cash', amount: fee, dealId: op.deal_id, ref: `fee ${op.ref}` }], op.currency, at)
  })
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
  await transition(db, deal.id, 'pay', `buyer:${deal.buyer_id}`, at, op.ref)
  await issueReceipt(db, deal.id, op.amount, op.ref, at)
  if (await setting(db, 'media_invoice_timing', at) === 'payment') await issueMediaInvoice(db, deal.id, at)
  // Payment secured: the other bids on this slot are no longer needed (SPEC 11.1 #7).
  await releaseBids(db, deal.slot_id, at, deal.buyer_id) // the other bidders hear the slot is gone
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
  if (s.fee > 0) await issueCommissionInvoice(db, deal.id, s.fee, s.feeVat, at)
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
  await reissueAfterRefund(db, deal.id, Math.round((held - amount) * 10_000 / (10_000 + deal.media_vat_bp)), at)
  await settle(db, deal, held - amount, at)
  await audit(db, 'system', 'refund.initiated', 'deal', deal.id, { toBuyer, cost }, at)
}

/** Partial refund the buyer accepted on a reported issue (seller's offer): the seller bears the card cost. */
export async function partialRefund(db: Db, deal: any, amount: number, at: Date) {
  const held = await heldFor(db, deal.id, deal.currency)
  if (!amount || amount <= 0 || amount >= held) throw new MarketError('Enter a partial refund between zero and the amount paid.')
  await refund(db, deal, amount, 'seller', at)
}

/**
 * The buyer never sent the creative (brief section 12). The seller chooses: run a placeholder and be paid in full,
 * or release the slot, refunding the buyer minus the cancellation fee.
 */
export async function creativeMissed(db: Db, dealId: string, sellerId: string, choice: 'placeholder' | 'release', at: Date) {
  const deal = await one(db, `select d.*, s.creative_due_at from deals d join slots s on s.id = d.slot_id where d.id = $1 for update of d`, [dealId])
  if (deal.seller_id !== sellerId) throw new MarketError('This booking is not yours.')
  if (deal.status !== 'secured' || at < deal.creative_due_at) throw new MarketError('This choice is available once the material deadline has passed.')
  const approved = await db.query(`select 1 from creatives where deal_id = $1 and status = 'approved'`, [dealId])
  if (approved.rowCount) throw new MarketError('The creative was approved.')
  if (choice === 'placeholder') {
    await db.query(`update deals set placeholder = true where id = $1`, [dealId])
    return audit(db, `seller:${sellerId}`, 'creative.missed_placeholder', 'deal', dealId, null, at)
  }
  const held = await heldFor(db, deal.id, deal.currency)
  const keepPrice = pct(deal.amount, await setting(db, 'cancel_fee_bp', at))
  await transition(db, dealId, 'creative_missed', `seller:${sellerId}`, at, 'The buyer did not supply the creative')
  await refund(db, deal, held - keepPrice - pct(keepPrice, deal.media_vat_bp), 'buyer', at)
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
/** What a buyer cancellation would mean right now: shown before confirming (scenario 25), applied by cancelByBuyer. */
export async function buyerCancelTerms(db: Db, deal: any, at: Date) {
  if (deal.status !== 'secured') return { allowed: false, reason: 'Only a paid booking that has not run can be cancelled.' }
  const { paid_at, creative_due_at } = await one(db, `select (select at from deal_events where deal_id = $1 and event = 'pay' order by id desc limit 1) paid_at,
                                                        s.creative_due_at from slots s where s.id = $2`, [deal.id, deal.slot_id])
  if (at >= creative_due_at) return { allowed: false, reason: 'This booking can no longer be cancelled for a refund: the creative deadline has passed.' }
  const paid = await heldFor(db, deal.id, deal.currency)
  const free = at.getTime() - paid_at.getTime() <= (await setting<number>(db, 'free_cancel_hours', at)) * 3_600_000
  const keepPrice = free ? 0 : pct(deal.amount, await setting(db, 'cancel_fee_bp', at)) // the publisher keeps 15% (+ its VAT)
  const publisherKeeps = keepPrice + pct(keepPrice, deal.media_vat_bp)
  const processing = Math.min(await processingCost(db, paid, at), paid - publisherKeeps) // card cost of the refund, borne by the buyer
  return { allowed: true, free, currency: deal.currency, paid, publisherKeeps, processing, refund: paid - publisherKeeps - processing }
}

export async function cancelByBuyer(db: Db, dealId: string, buyerId: string, at: Date) {
  const deal = await lockDeal(db, dealId)
  if (deal.buyer_id !== buyerId) throw new MarketError('This booking is not yours.')
  const t = await buyerCancelTerms(db, deal, at)
  if (!t.allowed) throw new MarketError(t.reason!)
  await transition(db, dealId, 'cancel_by_buyer', `buyer:${buyerId}`, at, t.free ? 'Inside the free cancellation window' : 'Cancellation fee applies')
  await refund(db, deal, t.paid! - t.publisherKeeps!, 'buyer', at)
}

/** Seller cancels: full refund, recorded against the seller, card cost recovered from their payouts (scenarios 8, 25). */
export async function cancelBySeller(db: Db, dealId: string, sellerId: string, reason: string, at: Date) {
  const deal = await lockDeal(db, dealId)
  if (deal.seller_id !== sellerId) throw new MarketError('This booking is not yours.')
  await transition(db, dealId, 'cancel_by_seller', `seller:${sellerId}`, at, reason)
  await refund(db, deal, await heldFor(db, deal.id, deal.currency), 'seller', at)
}

/** Admin decision on a dispute (brief section 12): release, full refund, partial refund or make-good. */
/** While the buyer's bank is deciding a chargeback, money stays where the bank left it: no refund (the buyer may be paid twice), no release. */
async function noOpenChargeback(db: Db, dealId: string) {
  const { chargeback } = await one(db, `select chargeback from deals where id = $1`, [dealId])
  if (chargeback === 'open') throw new MarketError("The buyer's bank is deciding a chargeback on this payment. Wait for its decision.")
}

export async function decideDispute(db: Db, dealId: string, outcome: 'release' | 'refund' | 'partial_refund' | 'make_good', actor: string, at: Date, refundAmount?: number, reason?: string) {
  await noOpenChargeback(db, dealId)
  const deal = await transition(db, dealId, outcome, actor, at, reason?.trim() || undefined)
  const held = await heldFor(db, deal.id, deal.currency)
  if (outcome === 'release') await settle(db, deal, held, at)
  if (outcome === 'refund') await refund(db, deal, held, 'seller', at)
  if (outcome === 'partial_refund') {
    if (!refundAmount || refundAmount <= 0 || refundAmount >= held) throw new MarketError('Enter a partial refund between zero and the amount paid.')
    await refund(db, deal, refundAmount, 'seller', at)
  }
  for (const side of [deal.buyer_id, deal.seller_id]) // both sides hear the decision (scenario 12)
    await notify(db, side, 'dispute.decided', deal.id, { outcome, ...(refundAmount ? { amount: refundAmount } : {}), ...(reason?.trim() ? { reason: reason.trim() } : {}) }, at)
  return deal
}

/**
 * Nashr steps in on a live deal (not only disputes): cancel before payment, refund in full or in part, or release to the publisher.
 * Always with a written reason that both sides see; who bears the card cost on a refund is Nashr's call (default Nashr).
 * A refund before the ad has run puts the slot back on sale.
 */
export async function intervene(db: Db, a: { dealId: string; action: 'cancel' | 'refund' | 'release' | 'partial_refund'; reason: string; amount?: number;
  cost?: 'buyer' | 'seller' | 'nashr'; actor: string }, at: Date) {
  if ((a.reason ?? '').trim().length < 5) throw new MarketError('Write the reason both sides will see.')
  const pre = await lockDeal(db, a.dealId)
  if (a.action !== 'cancel') await noOpenChargeback(db, a.dealId)
  const event = a.action === 'cancel' ? 'admin_cancel' : a.action === 'refund' ? 'admin_refund' : 'admin_release'
  if (!TRANSITIONS[pre.status]?.[event]) throw new MarketError('This step is not possible for a deal in this state.')
  const held = await heldFor(db, pre.id, pre.currency)
  if (a.action === 'partial_refund' && (!a.amount || a.amount <= 0 || a.amount >= held)) throw new MarketError('Enter a partial refund between zero and the amount paid.')
  const deal = await transition(db, a.dealId, event, a.actor, at, a.reason.trim())
  if (a.action === 'cancel') await afterNoGo(db, deal, at) // nothing was paid: the slot goes back to the next buyer or on sale
  if (a.action === 'release') await settle(db, deal, held, at)
  if (a.action === 'partial_refund') await refund(db, deal, a.amount!, a.cost ?? 'nashr', at)
  if (a.action === 'refund') {
    await refund(db, deal, held, a.cost ?? 'nashr', at)
    const slot = await one(db, `select * from slots where id = $1 for update`, [deal.slot_id])
    if (new Date(slot.starts_at) > at) { // not aired yet: free the airtime it held (a package or its breaks), then put it back on sale
      await db.query(`update slots set status = 'awaiting_seller' where id = $1`, [slot.id])
      await refreshConflicts(db, slot, at)
      await relist(db, slot.id, at)
    }
  }
  for (const side of [deal.buyer_id, deal.seller_id])
    await notify(db, side, 'deal.nashr_action', deal.id, { action: a.action, reason: a.reason.trim(), ...(a.amount ? { amount: a.amount } : {}) }, at)
  return deal
}

// ---------------------------------------------------------------- chargebacks

/**
 * The buyer's bank disputes a charge (a chargeback). The provider takes the disputed amount and its fee out of Nashr's balance
 * at once, so the books follow: the money leaves what is held for the deal, or, if the publisher was already paid, the
 * publisher owes it (recovered from later payouts, as card costs are) and any payout not yet sent waits. Nashr's team is
 * told; refund and release wait for the bank's decision.
 */
async function chargebackOpened(c: Db, op: any, data: any, at: Date) {
  const deal = await lockDeal(c, op.deal_id)
  if (deal.chargeback === 'open') return // the same dispute again
  const held = await heldFor(c, deal.id, deal.currency)
  const amount = Number(data.amount ?? op.amount), fee = Number(data.fee ?? 0), ref = `chargeback ${data.dispute ?? ''}`.trim()
  const fromHeld = Math.min(amount, held), fromSeller = amount - fromHeld
  await post(c, [
    { debit: 'held', credit: 'cash', amount: fromHeld, dealId: deal.id, ref },
    { debit: `seller_receivable:${deal.seller_id}`, credit: 'cash', amount: fromSeller, dealId: deal.id, ref },
    { debit: 'nashr_losses', credit: 'cash', amount: fee, dealId: deal.id, ref: 'chargeback fee' },
  ], deal.currency, at)
  await c.query(`update money_ops set status = 'on_hold', updated_at = $2 where deal_id = $1 and kind = 'transfer' and status = 'pending'`, [deal.id, at])
  await c.query(`update deals set chargeback = 'open' where id = $1`, [deal.id])
  if (TRANSITIONS[deal.status]?.chargeback) await transition(c, deal.id, 'chargeback', 'system:provider', at, "The buyer's bank disputed the payment")
  await audit(c, 'system:provider', 'chargeback.opened', 'deal', deal.id, { amount, fee, fromHeld, fromSeller }, at)
  for (const admin of (await c.query(`select distinct company_id from users where role in ('admin', 'founder')`)).rows)
    await notify(c, admin.company_id, 'chargeback.opened', deal.id, { released: ['released', 'paid_out'].includes(deal.status) }, at)
}

/** The bank decided. Won: the money comes back where it was taken from. Lost: the buyer keeps it and the booking ends as refunded. */
async function chargebackClosed(c: Db, op: any, data: any, at: Date) {
  const deal = await lockDeal(c, op.deal_id)
  if (deal.chargeback !== 'open') return
  const taken = (await c.query(`select debit, sum(amount)::bigint amount from ledger_entries where deal_id = $1 and credit = 'cash'
      and ref like 'chargeback%' and ref <> 'chargeback fee' group by debit`, [deal.id])).rows
  if (data.status === 'won') {
    await post(c, taken.map(t => ({ debit: 'cash', credit: t.debit, amount: Number(t.amount), dealId: deal.id, ref: 'chargeback won' })), deal.currency, at)
    await c.query(`update money_ops set status = 'pending', updated_at = $2 where deal_id = $1 and kind = 'transfer' and status = 'on_hold'`, [deal.id, at])
  } else {
    // a payout that was waiting is not sent; what the publisher was owed for this deal is set against what it now owes
    for (const t of (await c.query(`update money_ops set status = 'cancelled', updated_at = $2 where deal_id = $1 and kind = 'transfer' and status = 'on_hold' returning amount, company_id`, [deal.id, at])).rows)
      await post(c, [{ debit: `seller_payable:${t.company_id}`, credit: `seller_receivable:${t.company_id}`, amount: Number(t.amount), dealId: deal.id, ref: 'chargeback lost: payout withheld' }], deal.currency, at)
    if (deal.status === 'disputed') await transition(c, deal.id, 'refund', 'system:provider', at, "The buyer's bank decided the chargeback for the buyer")
  }
  await c.query(`update deals set chargeback = $2 where id = $1`, [deal.id, data.status === 'won' ? 'won' : 'lost'])
  await audit(c, 'system:provider', `chargeback.${data.status === 'won' ? 'won' : 'lost'}`, 'deal', deal.id, null, at)
  for (const admin of (await c.query(`select distinct company_id from users where role in ('admin', 'founder')`)).rows)
    await notify(c, admin.company_id, 'chargeback.closed', deal.id, { won: data.status === 'won' }, at)
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
export async function handleProviderEvent(ev: { id: string; type: string; data: any }, at: Date, provider?: PaymentProvider) {
  const result = await tx(async c => {
    const ins = await c.query(`insert into provider_events (id, type, payload, received_at) values ($1, $2, $3, $4) on conflict do nothing`,
      [ev.id, ev.type, JSON.stringify(ev.data), at])
    if (!ins.rowCount) return 'duplicate'
    if (ev.type === 'account.updated') { // a publisher finished (or lost) payout verification on the provider's pages
      const co = (await c.query(`update companies set payouts_enabled = $2 where provider_account = $1 and payouts_enabled <> $2 returning id`, [ev.data.account, ev.data.ready])).rows[0]
      if (co) await audit(c, 'system:provider', ev.data.ready ? 'payouts.connected' : 'payouts.disabled', 'company', co.id, { account: ev.data.account }, at)
      return co ? 'handled' : 'ignored'
    }
    const op = (await c.query(`select * from money_ops where provider_id = $1`, [ev.data.id])).rows[0]
    if (!op) return 'ignored'
    if (ev.type === 'charge.succeeded') await recordCharge(c, op.id, { id: op.provider_id, status: 'succeeded' }, at)
    if (ev.type === 'charge.failed') await recordCharge(c, op.id, { id: op.provider_id, status: 'failed', failure: ev.data.failure }, at)
    if (ev.type === 'payout.paid') await transition(c, op.deal_id, 'paid_out', 'system:provider', at, op.ref)
    if (ev.type === 'charge.dispute.created') await chargebackOpened(c, op, ev.data, at)
    if (ev.type === 'charge.dispute.closed') await chargebackClosed(c, op, ev.data, at)
    return 'handled'
  })
  if (result === 'handled' && ev.type === 'charge.succeeded' && provider) {
    const op = (await pool.query(`select id from money_ops where provider_id = $1 and kind = 'charge'`, [ev.data.id])).rows[0]
    if (op) await recordFee(provider, op.id, at)
  }
  return result
}

/** Daily check (SPEC 5.6): the ledger balances, and Nashr's cash in the ledger matches the provider balance. */
export async function reconcile(provider: PaymentProvider, currency: string) {
  const ledgerCash = await balance(pool, 'cash', currency)
  const providerCash = await provider.balance(currency)
  // ponytail: real Stripe also deducts its fees; B5 records them from balance transactions before comparing.
  return { ledgerCash, providerCash, ok: ledgerCash === providerCash }
}
