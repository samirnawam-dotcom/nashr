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

/** Whose it is (owner's rules round 2): the brand's name and logo, and a title that starts with the brand: "The National · Custom". */
export const brandOf = (r: any) => { const brand = r.brand ?? r.outlet
  return { brand, title: r.placement && r.placement !== brand ? `${brand} · ${r.placement}` : brand,
    logoUrl: r.brand_logo_key ? `/api/brands/${r.brand_id}/logo?v=${String(r.brand_logo_key).slice(-8)}` : r.logo_key ? `/api/outlets/${r.outlet_id}/logo?v=${r.logo_key.slice(5, 13)}` : null } }

export const buyerSlot = (r: any, me: string | null) => ({
  id: r.id, outletId: r.outlet_id, outlet: r.outlet, ...brandOf(r), channel: r.channel, sectors: r.sectors ?? [], audience: r.audience ?? null, audiences: r.audiences ?? [], placement: r.placement, label: r.label, kind: r.kind, saleType: r.sale_type,
  startsAt: r.starts_at, endsAt: r.ends_at, closesAt: r.closes_at, currency: r.currency,
  startingPrice: r.starting_price, buyNowPrice: r.buy_now_price, topBid: r.top_amount, bids: r.bids,
  available: r.status === 'open', youLead: me != null && r.top_buyer_id === me, youBid: !!r.mine,
})

export const buyerDeal = (d: any) => {
  const s = split(d.amount, { commissionBp: 0, mediaVatBp: d.vat_bp, feeVatBp: 0 })
  return {
    id: d.id, ref: d.ref, kind: d.kind, status: buyerStatus[d.status] ?? d.status, outlet: d.outlet, channel: d.channel ?? null, label: d.label, startsAt: d.starts_at,
    currency: d.currency, price: d.amount, vat: s.mediaVat, total: s.buyerPays, nextDeadlineAt: d.next_deadline_at, reason: d.status_note ?? null, client: d.client ?? null,
    counter: d.counter_amount != null ? { price: Number(d.counter_amount), note: d.counter_note ?? null, at: d.countered_at } : null,
  }
}

export const sellerSlot = (r: any) => ({
  id: r.id, outletId: r.outlet_id, ...brandOf(r), dealId: r.deal_id ?? null, company: r.company ?? null, outlet: r.outlet, channel: r.channel, sectors: r.sectors ?? [], audience: r.audience ?? null, placement: r.placement, label: r.label, kind: r.kind, saleType: r.sale_type,
  startsAt: r.starts_at, endsAt: r.ends_at, closesAt: r.closes_at,
  status: r.status, startingPrice: r.starting_price, buyNowPrice: r.buy_now_price, reservePrice: r.reserve_price, topBid: r.top_amount, bids: r.bids,
})

export const sellerDeal = (d: any, bids: any[] = []) => {
  const rates = { commissionBp: d.commission_bp ?? d.default_commission_bp, mediaVatBp: d.vat_bp, feeVatBp: d.fee_vat_bp ?? 0 }
  const s = split(d.amount, rates)
  return {
    id: d.id, ref: d.ref, status: d.status, channel: d.channel ?? null, label: d.label, startsAt: d.starts_at, nextDeadlineAt: d.next_deadline_at,
    buyer: { company: d.buyer_name },           // company name and ad details only, never contact details (brief section 6)
    brief: d.brief, checks: d.brief ? briefChecks(d.brief, { channel: d.channel, sectors: d.sectors }) : null,
    belowReserve: d.reserve_price != null && d.amount < d.reserve_price, paymentFailed: !!d.payment_failed,
    counter: d.counter_amount != null ? { amount: Number(d.counter_amount), note: d.counter_note ?? null, at: d.countered_at } : null,
    money: { bid: d.amount, mediaVat: s.mediaVat, fee: s.fee, feeVat: s.feeVat, youReceive: s.payout, commissionBp: rates.commissionBp },
    otherBids: bids.map((b, i) => ({ id: b.id, label: `Bidder ${String.fromCharCode(66 + i)}`, company: b.buyer_name, amount: b.amount })),
  }
}
