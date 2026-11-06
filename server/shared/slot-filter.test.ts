import { describe as group, expect, test } from 'vitest'
import { daypart, describe, matches, type FilterableSlot } from './slot-filter.js'

const slot = (o: Partial<FilterableSlot> = {}): FilterableSlot => ({ outlet: 'Skyline FM', placement: 'Morning Markets', channel: 'radio', saleType: 'auction',
  sectors: ['Banking', 'Retail'], audience: 'Business commuters', startsAt: '2026-11-16T03:15:00Z', endsAt: '2026-11-16T03:15:30Z',
  closesAt: '2026-11-15T03:15:00Z', startingPrice: 350_000, topBid: null, ...o })

group('calendar search', () => {
  test('time of day is Dubai time; a page with no end time at midnight is all day', () => {
    expect(daypart(slot())).toBe('morning')                                                      // 07:15 Dubai
    expect(daypart(slot({ startsAt: '2026-11-16T14:00:00Z' }))).toBe('evening')                    // 18:00
    expect(daypart(slot({ startsAt: '2026-11-15T20:00:00Z', endsAt: null }))).toBe('allday')        // 00:00
    expect(daypart(slot({ startsAt: '2026-11-15T21:30:00Z' }))).toBe('evening')                    // 01:30, late night
  })
  test('every filter narrows; price compares the current top bid, not the starting price', () => {
    const now = Date.parse('2026-11-14T10:00:00Z')
    expect(matches({}, slot(), now)).toBe(true)
    expect(matches({ channels: ['tv'] }, slot(), now)).toBe(false)
    expect(matches({ sector: 'banking' }, slot(), now)).toBe(true)
    expect(matches({ sector: 'Pets' }, slot(), now)).toBe(false)
    expect(matches({ maxPrice: 400_000 }, slot(), now)).toBe(true)
    expect(matches({ maxPrice: 400_000 }, slot({ topBid: 410_000 }), now)).toBe(false)
    expect(matches({ dayparts: ['evening'] }, slot(), now)).toBe(false)
    expect(matches({ q: 'skyline commuters' }, slot(), now)).toBe(true)
    expect(matches({ q: 'gulf' }, slot(), now)).toBe(false)
    expect(matches({ closingWithinHours: 24 }, slot(), now)).toBe(true)
    expect(matches({ closingWithinHours: 12 }, slot(), now)).toBe(false)
  })
  test('a saved search reads as a sentence', () => {
    expect(describe({ channels: ['radio'], sector: 'Banking', maxPrice: 500_000, dayparts: ['morning'] }, { radio: 'Radio' }))
      .toBe('Radio · Banking · under AED 5,000 · morning')
  })
})
