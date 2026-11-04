import { expect, test } from 'vitest'
import { minNextBid, split } from './money.js'

const AED = (n: number) => n * 100

test('brief section 3 example: publisher not VAT-registered, Nashr fee VAT on', () => {
  expect(split(AED(76_000), { commissionBp: 1200, mediaVatBp: 0, feeVatBp: 500 })).toEqual({
    price: AED(76_000), mediaVat: 0, buyerPays: AED(76_000), fee: AED(9_120), feeVat: AED(456), payout: AED(66_424),
  })
})

test('SPEC 12.2: VAT-registered publisher, Nashr not yet VAT-registered', () => {
  const s = split(AED(76_000), { commissionBp: 1200, mediaVatBp: 500, feeVatBp: 0 })
  expect(s.buyerPays).toBe(AED(79_800))
  expect(s.payout).toBe(AED(70_680))
})

test('SPEC 12.2: once Nashr is VAT-registered', () => {
  expect(split(AED(76_000), { commissionBp: 1200, mediaVatBp: 500, feeVatBp: 500 }).payout).toBe(AED(70_224))
})

test('seller inbox example: 24,000 bid, 12%, no fee VAT', () => {
  expect(split(AED(24_000), { commissionBp: 1200, mediaVatBp: 0, feeVatBp: 0 }).payout).toBe(AED(21_120))
})

test('rounding is half-up to the fil', () => {
  expect(split(333, { commissionBp: 1250, mediaVatBp: 500, feeVatBp: 500 })).toMatchObject({ mediaVat: 17, fee: 42, feeVat: 2 })
})

test('minimum next bid is +3%, rounded up to whole dirhams', () => {
  expect(minNextBid(AED(20_000), 300)).toBe(AED(20_600))
  expect(minNextBid(AED(4_200), 300)).toBe(AED(4_326))
  expect(minNextBid(AED(48_000), 300)).toBe(AED(49_440))
  expect(minNextBid(AED(333), 300)).toBe(AED(343)) // 342.99 → 343
})
