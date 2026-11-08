import { holdSignals, releaseSignals } from './live.js'
import pg from 'pg'

// int8 → number. Amounts are in fils/halalas; safe up to 2^53 (≈ 90 trillion AED).
pg.types.setTypeParser(20, Number)

export type Db = pg.Pool | pg.PoolClient

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('begin')
    holdSignals(c)
    const out = await fn(c)
    await c.query('commit')
    releaseSignals(c, true)
    return out
  } catch (e) {
    releaseSignals(c, false)
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
