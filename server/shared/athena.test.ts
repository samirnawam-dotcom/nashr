import { describe, expect, test } from 'vitest'
import { estimate, planBudget, readAmount, readDates, readRequest, score } from './athena.js'

const today = '2026-11-23'
describe('Athena reads a request (rules, no outside AI)', () => {
  test("the document's search example", () => {
    const r = readRequest('Radio in Dubai for a fintech launch in the first week of December, about AED 20,000, English or Arabic.', today)
    expect(r.channels).toEqual(['radio']); expect(r.sectors).toEqual(['Banking'])
    expect([r.dateFrom, r.dateTo]).toEqual(['2026-12-01', '2026-12-07']); expect(r.amount).toBe(2_000_000)
    expect(r.languages).toEqual(['english', 'arabic']); expect(r.request).toBe(true); expect(r.missing).toEqual([])
  })
  test("the document's planning example", () => {
    const r = readRequest('Launching a new credit card in Dubai, 1–14 Dec, AED 55,000, business people.', today)
    expect(r.sectors).toEqual(['Banking']); expect([r.dateFrom, r.dateTo]).toEqual(['2026-12-01', '2026-12-14'])
    expect(r.amount).toBe(5_500_000); expect(r.audiences).toEqual(['executives'])
    const p = readRequest('AED 55,000, launch of a new card, 1–14 Dec, banking audience, mostly radio and online.', today)
    expect(p.channels.sort()).toEqual(['digital', 'radio'])
  })
  test('a name is a plain search, not a request', () => {
    expect(readRequest('Skyline', today).request).toBe(false)
    expect(readRequest('Gulf News', today).request).toBe(false)
  })
  test('Arabic', () => {
    const r = readRequest('إذاعة لإطلاق بطاقة بنكية في الأسبوع الأول من ديسمبر بميزانية ٢٠ ألف درهم', today)
    expect(r.channels).toEqual(['radio']); expect(r.sectors).toEqual(['Banking'])
    expect([r.dateFrom, r.dateTo]).toEqual(['2026-12-01', '2026-12-07']); expect(r.amount).toBe(2_000_000)
  })
  test('dates', () => {
    expect(readDates('dec 3 to 9', today)).toEqual({ from: '2026-12-03', to: '2026-12-09' })
    expect(readDates('in January', today)).toEqual({ from: '2027-01-01', to: '2027-01-31' })
    expect(readDates('November', today)).toEqual({ from: '2026-11-23', to: '2026-11-30' }) // this month: from today
    expect(readDates('next week', today)).toEqual({ from: '2026-11-30', to: '2026-12-06' })
    expect(readDates('last week of december', today)).toEqual({ from: '2026-12-25', to: '2026-12-31' })
    expect(readDates('radio please', today)).toBeNull()
  })
  test('amounts', () => {
    expect(readAmount('about 20k')).toBe(2_000_000); expect(readAmount('budget 50000')).toBe(5_000_000)
    expect(readAmount('AED 1.5m')).toBe(150_000_000); expect(readAmount('1-14 dec')).toBeNull()
  })
  test('missing dates are asked for', () => {
    expect(readRequest('radio for a bank, AED 20,000', today).missing).toEqual(['dates'])
  })
  test('the score prefers the audience asked for and more reach for the price', () => {
    const base = { channel: 'radio', placement: 'Morning Markets', brand: 'Skyline FM', kind: 'programme', audienceText: null, text: '', language: 'English',
      price: 350_000, onSale: 5, popular: 0, sectors: [], blocked: [] }
    const r = { audiences: ['executives'], languages: [], words: [], dayparts: [], sectors: [] }
    expect(score({ ...base, audiences: ['executives'], reach: 100_000 }, r).score).toBeGreaterThan(score({ ...base, audiences: ['students'], reach: 100_000 }, r).score)
    expect(score({ ...base, audiences: [], reach: 500_000 }, r).score).toBeGreaterThan(score({ ...base, audiences: [], reach: 10_000 }, r).score)
  })
})

describe('Athena plans a budget', () => {
  const c = (id: string, channel: string, price: number, fit: number, brandKey = id, saleType = 'fixed'): any =>
    ({ placementId: id, brandKey, slotId: 's' + id, slotAt: '2026-12-02T06:00:00Z', saleType, channel, price, fit, why: [], placement: id, brand: brandKey, kind: 'main',
      audiences: [], audienceText: null, text: '', language: null, reach: null, onSale: 3, popular: 0, sectors: [], blocked: [] })
  const cands = [c('r1', 'radio', 400_000, 5), c('r2', 'radio', 300_000, 4), c('r3', 'radio', 300_000, 3, 'r1'), c('w1', 'digital', 900_000, 6), c('w2', 'digital', 200_000, 1), c('p1', 'podcast', 250_000, 2)]
  test('stays within each part and the budget, best fit first, outlets mixed', () => {
    const plan = planBudget(cands, 2_000_000)
    expect(plan.reduce((n, p) => n + p.share, 0)).toBe(100)
    for (const p of plan) expect(p.picks.reduce((n, x) => n + estimate(x), 0)).toBeLessThanOrEqual(p.amount)
    const radio = plan.find(p => p.channel === 'radio')!
    expect(radio.picks[0].placementId).toBe('r1')
    // another outlet (r2) comes before a second product of the same outlet (r3)
    const ids = radio.picks.map(x => x.placementId); expect(ids.indexOf('r2')).toBeLessThan(ids.includes('r3') ? ids.indexOf('r3') : 99)
  })
  test("the buyer's own split, and the media types they named", () => {
    const plan = planBudget(cands, 1_000_000, { shares: { radio: 30, digital: 70 } })
    expect(plan.map(p => [p.channel, p.share])).toEqual([['radio', 30], ['digital', 70]])
    expect(planBudget(cands, 1_000_000, { channels: ['podcast'] }).map(p => p.channel)).toEqual(['podcast'])
  })
  test('an auction is costed with room above its starting price', () => {
    expect(estimate({ price: 100_000, saleType: 'auction' })).toBe(110_000)
  })
})
