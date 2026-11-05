import { split } from '../core/money.js'
import { briefChecks } from '../fulfilment/brief.js'

/*
 * Role-specific responses (SPEC 5.5). Each one lists the fields it may show; nothing is copied wholesale from a row,
 * so a buyer response cannot carry a reserve price, Nashr's commission, other bidders or contact details.
 */

export const buyerStatus: Record<string, string> = {
  awaiting_seller: 'awaiting_publisher', awaiting_payment: 'accepted_pay_now', secured: 'payment_secured', in_review: 'proof_ready',
  issue_open: 'issue_open', disputed: 'disputed', released: 'released', paid_out: 'complete', declined: 'not_selected', lapsed: 'lapsed',
  cancelled: 'cancelled', refunded: 'refunded',
}

export const buyerSlot = (r: any, me: string) => ({
  id: r.id, outlet: r.outlet, channel: r.channel, placement: r.placement, label: r.label, kind: r.kind, saleType: r.sale_type,
  startsAt: r.starts_at, endsAt: r.ends_at, closesAt: r.closes_at, currency: r.currency,
  startingPrice: r.starting_price, buyNowPrice: r.buy_now_price, topBid: r.top_amount, bids: r.bids,
  available: r.status === 'open', youLead: r.top_buyer_id === me, youBid: !!r.mine,
})

export const buyerDeal = (d: any) => {
  const s = split(d.amount, { commissionBp: 0, mediaVatBp: d.vat_bp, feeVatBp: 0 })
  return {
    id: d.id, ref: d.ref, status: buyerStatus[d.status] ?? d.status, outlet: d.outlet, label: d.label, startsAt: d.starts_at,
    currency: d.currency, price: d.amount, vat: s.mediaVat, total: s.buyerPays, nextDeadlineAt: d.next_deadline_at, reason: d.status_note ?? null,
  }
}

export const sellerSlot = (r: any) => ({
  id: r.id, outlet: r.outlet, channel: r.channel, placement: r.placement, label: r.label, kind: r.kind, saleType: r.sale_type,
  startsAt: r.starts_at, endsAt: r.ends_at, closesAt: r.closes_at,
  status: r.status, startingPrice: r.starting_price, buyNowPrice: r.buy_now_price, reservePrice: r.reserve_price, topBid: r.top_amount, bids: r.bids,
})

export const sellerDeal = (d: any, bids: any[] = []) => {
  const rates = { commissionBp: d.commission_bp ?? d.default_commission_bp, mediaVatBp: d.vat_bp, feeVatBp: d.fee_vat_bp ?? 0 }
  const s = split(d.amount, rates)
  return {
    id: d.id, ref: d.ref, status: d.status, label: d.label, startsAt: d.starts_at, nextDeadlineAt: d.next_deadline_at,
    buyer: { company: d.buyer_name },           // company name and ad details only, never contact details (brief section 6)
    brief: d.brief, checks: d.brief ? briefChecks(d.brief, { channel: d.channel, sectors: d.sectors }) : null,
    belowReserve: d.reserve_price != null && d.amount < d.reserve_price, paymentFailed: !!d.payment_failed,
    money: { bid: d.amount, mediaVat: s.mediaVat, fee: s.fee, feeVat: s.feeVat, youReceive: s.payout, commissionBp: rates.commissionBp },
    otherBids: bids.map((b, i) => ({ id: b.id, label: `Bidder ${String.fromCharCode(66 + i)}`, company: b.buyer_name, amount: b.amount })),
  }
}
