import { expect, test } from 'vitest'
import { dubai, isAllDay, layoutDay, monthGrid, weekOf } from './layout.js'

test('Dubai time and Monday-start weeks', () => {
  expect(dubai('2026-11-09T03:15:00Z')).toEqual({ date: '2026-11-09', minutes: 7 * 60 + 15, weekday: 1 })
  expect(weekOf('2026-11-12')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
})

test('month grid covers the month in whole weeks', () => {
  const g = monthGrid('2026-11-20')
  expect(g[0][0]).toBe('2026-10-26')
  expect(g.at(-1)!.at(-1)).toBe('2026-12-06')
  expect(g).toHaveLength(6)
})

test('print editions without a time go in the all-day lane', () => {
  expect(isAllDay({ startsAt: '2026-11-08T20:00:00Z', endsAt: null })).toBe(true) // midnight Dubai
  expect(isAllDay({ startsAt: '2026-11-09T03:15:00Z', endsAt: '2026-11-09T03:15:30Z' })).toBe(false)
})

test('overlapping events share the width; separate ones use the full width', () => {
  const l = layoutDay([{ id: 'a', start: 0, end: 60 }, { id: 'b', start: 30, end: 90 }, { id: 'c', start: 70, end: 80 }, { id: 'd', start: 120, end: 150 }])
  expect(Object.fromEntries(l)).toEqual({ a: { col: 0, cols: 2 }, b: { col: 1, cols: 2 }, c: { col: 0, cols: 2 }, d: { col: 0, cols: 1 } })
})
