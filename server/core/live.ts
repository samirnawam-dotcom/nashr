import { EventEmitter } from 'node:events'
import pg from 'pg'
import { pool } from './db.js'

/*
 * Live updates (SPEC section 2: real-time): the server tells open pages that something changed and the page fetches the new state
 * itself, so nothing private ever travels on this channel. Two kinds of signal:
 *  - "notification" for one company (its bell has something new),
 *  - "slot" for everyone watching a slot (a bid, an acceptance, a relist): just the slot id.
 * Signals go out once the change's transaction has committed.
 *
 * Every copy of the API shares them through Postgres (NOTIFY on one channel, each copy LISTENing on its own connection), so a bid
 * taken by one copy refreshes pages connected to another. Without that connection (tests, or while it reconnects) a copy tells
 * its own pages only.
 */
export const live = new EventEmitter()
live.setMaxListeners(0)

const CHANNEL = 'nashr_live'
let listening = false

const emitLocal = (s: string) => { const i = s.indexOf(':'); const kind = s.slice(0, i), id = s.slice(i + 1); if (kind === 'notification' || kind === 'slot') live.emit(kind, id) }
function deliver(s: string) {
  if (!listening) return emitLocal(s)
  // every copy (this one included) hears it back through its listener
  pool.query(`select pg_notify($1, $2)`, [CHANNEL, s]).catch(() => emitLocal(s))
}

// Signals raised inside a transaction wait for it: sent once after COMMIT (each once), dropped on ROLLBACK, so a refused bid
// signals nothing and a page never refetches before the change is visible. Outside a transaction they go at once.
const waiting = new WeakMap<object, Set<string>>()
export function holdSignals(client: object) { waiting.set(client, new Set()) }
export function releaseSignals(client: object, committed: boolean) {
  const queue = waiting.get(client); waiting.delete(client)
  if (committed && queue) for (const s of queue) deliver(s)
}
const raise = (db: object, kind: 'notification' | 'slot', id: string) => { const q = waiting.get(db); if (q) q.add(`${kind}:${id}`); else deliver(`${kind}:${id}`) }
export const signalCompany = (db: object, companyId: string) => raise(db, 'notification', companyId)
export const signalSlot = (db: object, slotId: string) => raise(db, 'slot', slotId)

/** Listen for every copy's signals on a connection of its own; reconnects by itself. Returns a function that stops it. */
export function shareLiveUpdates(connectionString = process.env.DATABASE_URL) {
  let client: pg.Client | null = null, stopped = false, retry: NodeJS.Timeout | null = null
  const connect = async () => {
    if (stopped) return
    const c = new pg.Client({ connectionString })
    const lost = () => {
      if (client !== c) return
      listening = false; client = null
      c.end().catch(() => {})
      if (!stopped) retry = setTimeout(connect, 5_000)
    }
    c.on('error', lost); c.on('end', lost)
    c.on('notification', m => { if (m.channel === CHANNEL && m.payload) emitLocal(m.payload) })
    try {
      await c.connect(); await c.query(`listen ${CHANNEL}`)
      client = c; listening = true
    } catch { client = c; lost() }
  }
  const ready = connect()
  return Object.assign(async () => {
    stopped = true; listening = false
    if (retry) clearTimeout(retry)
    await client?.end().catch(() => {}); client = null
  }, { ready })
}
