import { EventEmitter } from 'node:events'

/*
 * Live updates (SPEC section 2: real-time), one process: the server tells open pages that something changed and the page fetches
 * the new state itself, so nothing private ever travels on this channel. Two kinds of signal:
 *  - "notification" for one company (its bell has something new),
 *  - "slot" for everyone watching a slot (a bid, an acceptance, a relist): just the slot id.
 * Signals go out once the change's transaction has committed.
 * ponytail: in-process. With more than one API instance, carry the same two signals over Postgres LISTEN/NOTIFY.
 */
export const live = new EventEmitter()
live.setMaxListeners(0)

// Signals raised inside a transaction wait for it: sent once after COMMIT (each once), dropped on ROLLBACK, so a refused bid
// signals nothing and a page never refetches before the change is visible. Outside a transaction they go at once.
const waiting = new WeakMap<object, Set<string>>()
export function holdSignals(client: object) { waiting.set(client, new Set()) }
export function releaseSignals(client: object, committed: boolean) {
  const queue = waiting.get(client); waiting.delete(client)
  if (committed && queue) for (const s of queue) { const [kind, id] = s.split(':'); live.emit(kind, id) }
}
const raise = (db: object, kind: 'notification' | 'slot', id: string) => { const q = waiting.get(db); if (q) q.add(`${kind}:${id}`); else live.emit(kind, id) }
export const signalCompany = (db: object, companyId: string) => raise(db, 'notification', companyId)
export const signalSlot = (db: object, slotId: string) => raise(db, 'slot', slotId)
