import { describe as group, expect, test } from 'vitest'
import { daypart, describe, matches, reachMatch, type FilterableSlot } from './slot-filter.js'

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
    // Sectors: a product set to all sectors (no list) always shows; one that lists the sector as not accepted never does
    expect(matches({ sector: 'Pets' }, slot({ sectors: [] }), now)).toBe(true)
    expect(matches({ sector: 'banking' }, slot({ sectors: [], blocked: ['Banking'] }), now)).toBe(false)
    // several sectors (owner's "Buying moves to the Directory"): any picked one accepted; all-sector products always; a picked one not accepted hides it
    expect(matches({ sectors: ['Pets', 'retail'] }, slot(), now)).toBe(true)
    expect(matches({ sectors: ['Pets', 'Toys'] }, slot(), now)).toBe(false)
    expect(matches({ sectors: ['Pets', 'Toys'] }, slot({ sectors: [] }), now)).toBe(true)
    expect(matches({ sectors: ['Banking', 'Pets'] }, slot({ sectors: [], blocked: ['Pets'] }), now)).toBe(false)
    // reach: 2,000 or 2% of the number typed, whichever is bigger, either side; no reach given shows unless "only with reach"
    expect(reachMatch(98_000, { reachMin: 100_000 })).toBe('close')
    expect(reachMatch(97_000, { reachMin: 100_000 })).toBe('out')
    expect(reachMatch(980_000, { reachMin: 1_000_000 })).toBe('close')
    expect(reachMatch(979_000, { reachMin: 1_000_000 })).toBe('out')
    expect(reachMatch(150_000, { reachMin: 100_000, reachMax: 250_000 })).toBe('in')
    expect(reachMatch(255_000, { reachMin: 100_000, reachMax: 250_000 })).toBe('close')
    expect(reachMatch(null, { reachMin: 100_000 })).toBe('none')
    expect(matches({ reachMin: 100_000 }, slot({ reach: null }), now)).toBe(true)
    expect(matches({ reachMin: 100_000, reachOnly: true }, slot({ reach: null }), now)).toBe(false)
    expect(matches({ reachMin: 100_000 }, slot({ reach: 50_000 }), now)).toBe(false)
    // dates: on sale between two Dubai dates, both included (the slot airs 16 Nov, 07:15 Dubai)
    expect(matches({ dateFrom: '2026-11-16', dateTo: '2026-11-16' }, slot(), now)).toBe(true)
    expect(matches({ dateFrom: '2026-11-17' }, slot(), now)).toBe(false)
    expect(matches({ sector: 'Banking' }, slot({ blocked: ['Banking'] }), now)).toBe(false)
    expect(matches({ maxPrice: 400_000 }, slot(), now)).toBe(true)
    expect(matches({ maxPrice: 400_000 }, slot({ topBid: 410_000 }), now)).toBe(false)
    expect(matches({ dayparts: ['evening'] }, slot(), now)).toBe(false)
    expect(matches({ q: 'skyline retail' }, slot(), now)).toBe(true) // outlets, programmes, sectors
    expect(matches({ q: 'gulf' }, slot(), now)).toBe(false)
    expect(matches({ closingWithinHours: 24 }, slot(), now)).toBe(true)
    expect(matches({ closingWithinHours: 12 }, slot(), now)).toBe(false)
  })
  test('a saved search reads as a sentence', () => {
    expect(describe({ channels: ['radio'], sector: 'Banking', maxPrice: 500_000, dayparts: ['morning'] }, { radio: 'Radio' }))
      .toBe('Radio · Banking · under AED 5,000 · morning')
  })
})
