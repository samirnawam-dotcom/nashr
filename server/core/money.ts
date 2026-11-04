// All amounts are integers in minor units (fils, halalas). Rates are basis points (1200 = 12%).

/** Percentage of an amount, rounded half-up to the minor unit. */
export const pct = (amount: number, bp: number) => Math.floor((amount * bp + 5000) / 10000)

export type Rates = { commissionBp: number; mediaVatBp: number; feeVatBp: number }

/**
 * Disclosed-agent split (SPEC 12.2). The publisher sells the media and charges media VAT;
 * Nashr's fee is a % of the price excl. VAT, plus VAT on the fee only when Nashr is VAT-registered.
 */
export function split(price: number, r: Rates) {
  const mediaVat = pct(price, r.mediaVatBp)
  const fee = pct(price, r.commissionBp)
  const feeVat = pct(fee, r.feeVatBp)
  return { price, mediaVat, buyerPays: price + mediaVat, fee, feeVat, payout: price + mediaVat - fee - feeVat }
}

/** Minimum next bid: top bid plus the step, rounded up to a whole currency unit. */
export const minNextBid = (top: number, stepBp: number) => Math.ceil((top + pct(top, stepBp)) / 100) * 100
