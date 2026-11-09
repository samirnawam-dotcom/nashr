import { afterEach, describe, expect, test } from 'vitest'
import pg from 'pg'
import { pool, tx } from './db.js'
import { live, shareLiveUpdates, signalCompany, signalSlot } from './live.js'

const next = (kind: string) => new Promise<string>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`no ${kind} signal`)), 3000)
  live.once(kind, id => { clearTimeout(t); resolve(id) })
})
let stop: (() => Promise<void>) | null = null
afterEach(async () => { await stop?.(); stop = null })

describe('live updates', () => {
  test('on one copy, a signal raised in a transaction goes out after commit, and never after a rollback', async () => {
    const got: string[] = [], on = (id: string) => got.push(id)
    live.on('slot', on)
    await tx(async c => { signalSlot(c, 'a'); expect(got).toEqual([]) })
    expect(got).toEqual(['a'])
    await tx(async c => { signalSlot(c, 'b'); throw new Error('refused') }).catch(() => {})
    await new Promise(r => setTimeout(r, 50))
    expect(got).toEqual(['a'])
    live.off('slot', on)
  })

  test('shared through Postgres: a signal from another copy of the API reaches this one', async () => {
    const s = shareLiveUpdates(); stop = s; await s.ready
    // another copy: its own connection, sending what its signals send
    const other = new pg.Client({ connectionString: process.env.DATABASE_URL }); await other.connect()
    const heard = next('notification')
    await other.query(`select pg_notify('nashr_live', 'notification:company-9')`)
    expect(await heard).toBe('company-9')
    await other.end()
    // and this copy's own signals make the round trip too, after commit only
    const slot = next('slot')
    await tx(async c => { signalSlot(c, 'slot-1'); signalCompany(c, 'company-1') })
    expect(await slot).toBe('slot-1')
  })
})
