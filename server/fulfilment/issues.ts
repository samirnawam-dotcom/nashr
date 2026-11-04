import { type Db, one } from '../core/db.js'
import { notify } from '../core/notify.js'
import { transition } from '../marketplace/deals.js'
import { MarketError } from '../marketplace/market.js'
import { partialRefund } from '../payments/payments.js'
import { checkProof } from './proof.js'

// "Report an issue", the lighter step before a dispute (brief 12A-C). Auto-release pauses while it is open.
export const ISSUE_REASONS = ['did_not_run', 'wrong_time', 'wrong_position', 'creative_altered', 'quality', 'other'] as const
export type Offer = { type: 'corrected_proof'; items: Record<string, unknown> } | { type: 'make_good'; runAt: Date } | { type: 'partial_refund'; amount: number }

const openIssue = (db: Db, dealId: string) => one(db, `select * from issues where deal_id = $1 and status = 'open' for update`, [dealId])

export async function reportIssue(db: Db, a: { dealId: string; buyerId: string; reason: string; note: string; evidence?: unknown }, at: Date) {
  const d = await one(db, `select * from deals where id = $1`, [a.dealId])
  if (d.buyer_id !== a.buyerId) throw new MarketError('This booking is not yours.')
  // "changed my mind", "results were below expectations" and the buyer's own late creative are not reasons (brief 12A-C)
  if (!ISSUE_REASONS.includes(a.reason as any)) throw new MarketError('Choose what went wrong.')
  if (!a.note?.trim()) throw new MarketError('Add a short note.')
  await transition(db, d.id, 'report_issue', `buyer:${a.buyerId}`, at, a.reason)
  await db.query(`insert into issues (deal_id, reason, note, evidence, opened_at) values ($1, $2, $3, $4, $5)`,
    [d.id, a.reason, a.note, a.evidence == null ? null : JSON.stringify(a.evidence), at])
  await notify(db, d.seller_id, 'issue.reported', d.id, { reason: a.reason }, at)
}

/** The seller answers within 48 hours: a corrected proof, a rerun on a stated date, or a partial refund. */
export async function offerFix(db: Db, a: { dealId: string; sellerId: string; offer: Offer }, at: Date) {
  const d = await one(db, `select * from deals where id = $1`, [a.dealId])
  if (d.seller_id !== a.sellerId) throw new MarketError('This booking is not yours.')
  const issue = await openIssue(db, d.id)
  if (a.offer.type === 'corrected_proof') await checkProof(db, d.id, a.offer.items)
  if (a.offer.type === 'make_good' && !(a.offer.runAt > at)) throw new MarketError('Choose a future date for the rerun.')
  await db.query(`update issues set offer = $2 where id = $1`, [issue.id, JSON.stringify(a.offer)])
  await notify(db, d.buyer_id, 'issue.offer', d.id, a.offer, at)
}

/** The buyer accepts with one tap, or refuses and it becomes a dispute for the admin. */
export async function respondToOffer(db: Db, a: { dealId: string; buyerId: string; accept: boolean }, at: Date) {
  const d = await one(db, `select * from deals where id = $1`, [a.dealId])
  if (d.buyer_id !== a.buyerId) throw new MarketError('This booking is not yours.')
  const issue = await openIssue(db, d.id)
  if (!issue.offer) throw new MarketError('The publisher has not answered yet.')
  const actor = `buyer:${a.buyerId}`
  if (!a.accept) return escalateIssue(db, d, actor, at)
  const offer = issue.offer
  if (offer.type === 'corrected_proof') {
    await db.query(`insert into proofs (deal_id, items, note, submitted_at) values ($1, $2, 'Corrected proof', $3)`, [d.id, JSON.stringify(offer.items), at])
    await transition(db, d.id, 'resolve', actor, at, 'Corrected proof accepted')
  }
  if (offer.type === 'make_good') {
    await db.query(`update deals set make_good_at = $2 where id = $1`, [d.id, offer.runAt])
    await transition(db, d.id, 'make_good', actor, at, 'Rerun accepted')
  }
  if (offer.type === 'partial_refund') {
    const released = await transition(db, d.id, 'partial_refund', actor, at, 'Partial refund accepted')
    await partialRefund(db, released, offer.amount, at)
  }
  await db.query(`update issues set status = 'resolved', closed_at = $2 where id = $1`, [issue.id, at])
  await notify(db, d.seller_id, 'issue.resolved', d.id, { type: offer.type }, at)
}

/** Buyer refuses, or the seller does not answer in time (sweeper): the deal goes to the admin's decision list. */
export async function escalateIssue(db: Db, deal: any, actor: string, at: Date) {
  if (deal.status === 'issue_open') await transition(db, deal.id, 'escalate', actor, at)
  await db.query(`update issues set status = 'escalated', closed_at = $2 where deal_id = $1 and status = 'open'`, [deal.id, at])
  for (const c of [deal.buyer_id, deal.seller_id]) await notify(db, c, 'dispute.opened', deal.id, null, at)
}
