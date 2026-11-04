import { beforeEach, expect, test } from 'vitest'
import { pool } from './db.js'
import { changeSetting, ratesFor, setting } from './settings.js'
import { addWorkingDays, localDay } from './market.js'
import { reset } from '../test/helpers.js'

beforeEach(reset)

test('settings keep history: the value depends on the time asked', async () => {
  const t1 = new Date('2026-11-01T00:00:00Z'), t2 = new Date('2026-11-10T00:00:00Z')
  await changeSetting(pool, 'seller_window_hours', 36, 'admin:zainab', t2)
  expect(await setting(pool, 'seller_window_hours', t1)).toBe(24)
  expect(await setting(pool, 'seller_window_hours', t2)).toBe(36)
  const { rows } = await pool.query(`select actor, action from audit_log where entity_id = 'seller_window_hours'`)
  expect(rows).toContainEqual({ actor: 'admin:zainab', action: 'setting.changed' })
})

test('rates: founding commission per publisher, media VAT by publisher, Nashr VAT switch', async () => {
  const at = new Date('2026-11-04T10:00:00Z')
  const { rows: [pub] } = await pool.query(`insert into companies (name, type, vat_registered) values ('Gulf News', 'publisher', true) returning id`)
  expect(await ratesFor(pool, pub.id, at)).toEqual({ commissionBp: 1200, mediaVatBp: 500, feeVatBp: 0 })
  await changeSetting(pool, `commission:${pub.id}`, 1000, 'admin', new Date('2026-11-01T00:00:00Z'))
  await changeSetting(pool, 'nashr_vat_registered', true, 'founder', new Date('2026-11-02T00:00:00Z'))
  expect(await ratesFor(pool, pub.id, at)).toEqual({ commissionBp: 1000, mediaVatBp: 500, feeVatBp: 500 })
})

test('UAE weekend is Saturday-Sunday; 5 working days skip it and holidays', async () => {
  expect(localDay(new Date('2026-11-13T21:00:00Z'), 'AE')).toEqual({ date: '2026-11-14', weekday: 6 }) // Sat 01:00 Dubai
  // Thu 26 Nov 10:00 Dubai + 5 working days: Fri 27, Mon 30, Tue 1 Dec, (Wed 2, Thu 3 holidays), Fri 4, Mon 7
  const out = await addWorkingDays(pool, new Date('2026-11-26T06:00:00Z'), 5, 'AE')
  expect(out.toISOString()).toBe('2026-12-07T06:00:00.000Z')
})
