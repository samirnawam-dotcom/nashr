import { expect, test } from 'vitest'
import { pool } from './db.js'

test('database is migrated and settings are seeded', async () => {
  const { rows } = await pool.query(`select value from settings where key = 'min_step_bp'`)
  expect(rows[0].value).toBe(300)
})

test('audit log is append-only', async () => {
  await pool.query(`insert into audit_log (actor, action) values ('test', 'x')`)
  await expect(pool.query(`update audit_log set action = 'y'`)).rejects.toThrow(/append-only/)
  await expect(pool.query(`delete from audit_log`)).rejects.toThrow(/append-only/)
})
