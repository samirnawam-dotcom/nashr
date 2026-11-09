import { holdSignals, releaseSignals } from './live.js'
import pg from 'pg'

// int8 → number. Amounts are in fils/halalas; safe up to 2^53 (≈ 90 trillion AED).
pg.types.setTypeParser(20, Number)

export type Db = pg.Pool | pg.PoolClient

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// Work that must wait until the change it is about is saved (sending push alerts): run after COMMIT, dropped on ROLLBACK.
const later = new WeakMap<object, (() => Promise<unknown>)[]>()
// Work that runs after a commit is tracked, so tests can wait for it before wiping the database (and shutdown could too).
const running = new Set<Promise<unknown>>()
const runLater = (f: () => Promise<unknown>, onError: (e: any) => void) => {
  const p = new Promise<void>(resolve => setImmediate(resolve)).then(f).catch(onError)
  running.add(p); p.finally(() => running.delete(p))
}
/** Resolves once every after-commit job started so far has finished. */
export async function afterCommitSettled() { while (running.size) await Promise.allSettled([...running]) }
export function afterCommit(db: object, f: () => Promise<unknown>) { const q = later.get(db); if (q) q.push(f); else runLater(f, () => {}) }

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('begin')
    holdSignals(c); later.set(c, [])
    const out = await fn(c)
    await c.query('commit')
    releaseSignals(c, true)
    for (const f of later.get(c) ?? []) runLater(f, e => console.error(JSON.stringify({ t: new Date().toISOString(), job: 'after-commit', error: String(e?.stack ?? e) })))
    later.delete(c)
    return out
  } catch (e) {
    releaseSignals(c, false); later.delete(c)
    await c.query('rollback')
    throw e
  } finally {
    c.release()
  }
}

export async function one<T = any>(db: Db, text: string, values: unknown[] = []): Promise<T> {
  const { rows } = await db.query(text, values)
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`)
  return rows[0]
}

/** Several reads on one connection, one after another (a connection runs one query at a time). */
export async function inTurn<T>(run: (sql: string) => Promise<T>, sqls: string[]) {
  const out: T[] = []
  for (const sql of sqls) out.push(await run(sql))
  return out
}
