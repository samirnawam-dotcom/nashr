import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { pool } from './db.js'
import { _resetErrors, recordError, watch } from './watch.js'
import { T, company, reset } from '../test/helpers.js'

// Far from the other tests' clocks, so their heartbeats never count here.
const day1 = T('2031-01-05T08:00:00Z')
const later = (m: number) => new Date(day1.getTime() + m * 60_000)
const heartbeat = (at: Date) => pool.query(`insert into audit_log (at, actor, action, entity, entity_id) values ($1, 'system', 'sweeper.heartbeat', 'system', null)`, [at])
const notices = async (kind: string) => (await pool.query(`select data from notifications where kind = $1 order by id`, [kind])).rows.map(r => r.data)
let staffCo: string

beforeEach(async () => {
  await reset(); _resetErrors(); delete process.env.BACKUP_DIR
  staffCo = (await pool.query(`insert into companies (name, type) values ('Nashr', 'nashr') returning id`)).rows[0].id
  await pool.query(`insert into users (company_id, email, name, role, status, created_at) values ($1, 'ops@nashr.ae', 'Ops', 'admin', 'active', now())`, [staffCo])
})
afterEach(() => { delete process.env.BACKUP_DIR })

describe('staff alerts', () => {
  test('a problem is told once when it starts and once when it clears', async () => {
    await heartbeat(day1)
    expect((await watch({ at: later(1) })).opened).toEqual([])
    // the timer job stops: staff hear once, however many minutes it lasts
    expect((await watch({ at: later(10) })).opened).toEqual(['sweeper.stopped'])
    expect((await watch({ at: later(11) })).opened).toEqual([])
    expect(await notices('ops.alert')).toHaveLength(1)
    expect((await notices('ops.alert'))[0].detail).toMatch('auctions do not close')
    // it runs again: cleared, and staff hear that too
    await heartbeat(later(12))
    expect((await watch({ at: later(13) })).cleared).toEqual(['sweeper.stopped'])
    expect(await notices('ops.cleared')).toHaveLength(1)
    expect((await pool.query(`select count(*)::int n from staff_alerts where resolved_at is null`)).rows[0].n).toBe(0)
  })

  test('stuck and failed money, late disputes and the ledger', async () => {
    await heartbeat(day1)
    const seller = await company('Skyline FM', 'publisher')
    await pool.query(`insert into money_ops (company_id, kind, amount, currency, idempotency_key, status, created_at, updated_at) values
      ($1, 'transfer', 1000, 'AED', 'k1', 'pending', $2, $2), ($1, 'transfer', 1000, 'AED', 'k2', 'failed', $2, $2)`, [seller, later(-30)])
    const r = await watch({ at: later(1), reconciles: async () => false })
    expect(r.opened.sort()).toEqual(['money.failed', 'money.ledger', 'money.stuck'])
  })

  test('a burst of server errors', async () => {
    await heartbeat(day1)
    for (let i = 0; i < 4; i++) recordError('GET /api/deals', later(0).getTime())
    expect((await watch({ at: later(1) })).opened).toEqual([])
    recordError('POST /api/slots/:id/bid', later(0).getTime())
    expect((await watch({ at: later(1) })).opened).toEqual(['errors.spike'])
    expect((await notices('ops.alert'))[0].detail).toMatch('POST /api/slots/:id/bid')
  })

  test('backups are watched where the server makes them', async () => {
    await heartbeat(day1)
    expect((await watch({ at: later(1) })).opened).toEqual([]) // not set up here: nothing to watch
    process.env.BACKUP_DIR = '/var/backups/nashr'
    expect((await watch({ at: later(2) })).opened).toEqual(['backup.missing'])
    await pool.query(`insert into ops_runs (kind, ok, detail, at) values ('backup', true, 'x.dump', $1)`, [later(3)])
    expect((await watch({ at: later(4) })).cleared).toEqual(['backup.missing'])
    await pool.query(`insert into ops_runs (kind, ok, detail, at) values ('restore_drill', false, 'the copy differs', $1)`, [later(5)])
    expect((await watch({ at: later(6) })).opened).toEqual(['restore.failed'])
    // a day and a half without a backup
    await heartbeat(later(60 * 36))
    expect((await watch({ at: later(60 * 36 + 1) })).opened).toEqual(['backup.missing'])
  })
})
