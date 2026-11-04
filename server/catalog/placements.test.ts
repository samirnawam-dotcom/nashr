import { beforeEach, expect, test } from 'vitest'
import { pool } from '../core/db.js'
import { generateSlots } from './placements.js'
import { AED, T, radio, reset, slot } from '../test/helpers.js'

beforeEach(reset)
const now = T('2026-11-01T08:00:00Z')

test('each break is its own slot, plus any-break and package, Mon-Fri only (UAE weekend Sat-Sun)', async () => {
  const { placement } = await radio(now)
  expect(await generateSlots(pool, placement, '2026-11-09', 7, now)).toBe(30) // 5 days × (4 breaks + any + package)
  const { rows } = await pool.query(`select distinct air_date::text d from slots order by d`)
  expect(rows.map(r => r.d)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])

  const b2 = await slot(placement, '2026-11-09', 'Break 2')
  expect(b2.starts_at.toISOString()).toBe('2026-11-09T03:15:00.000Z') // 07:15 Dubai
  expect(b2.closes_at.toISOString()).toBe('2026-11-04T03:15:00.000Z') // 5 days before air
  expect(b2.creative_due_at.toISOString()).toBe('2026-11-07T03:15:00.000Z') // 2 days before
  expect((await slot(placement, '2026-11-09', 'Any break')).starting_price).toBe(AED(3_500))
  expect((await slot(placement, '2026-11-09', 'All 4 breaks')).starting_price).toBe(AED(15_000))
})

test('generation is idempotent and skips airings already too late to sell', async () => {
  const { placement } = await radio(now)
  await generateSlots(pool, placement, '2026-11-09', 7, now)
  expect(await generateSlots(pool, placement, '2026-11-09', 7, now)).toBe(0)
  // By Wed 4 Nov every airing in the week of 2-6 Nov has already closed for bids, so nothing is created.
  expect(await generateSlots(pool, placement, '2026-11-02', 7, T('2026-11-04T08:00:00Z'))).toBe(0)
})

test('podcast positions are slots on the episode date', async () => {
  const { placement } = await radio(now, {
    name: 'The Majlis Podcast', days: [4], startsAt: '06:00', endsAt: undefined, anyBreakPrice: undefined, packagePrice: undefined,
    breaks: [{ label: 'Pre-roll' }, { label: 'Mid-roll' }, { label: 'Post-roll' }],
  })
  expect(await generateSlots(pool, placement, '2026-11-09', 7, now)).toBe(3)
  expect((await slot(placement, '2026-11-12', 'Mid-roll')).starts_at.toISOString()).toBe('2026-11-12T02:00:00.000Z')
})

test('deadline rule: bidding cannot close too late for decision, payment and creative', async () => {
  await expect(radio(now, { closeLeadHours: 48 })).rejects.toThrow('at least 5 days before air')
  await expect(radio(now, { closeLeadHours: 120 })).resolves.toBeTruthy()
})
