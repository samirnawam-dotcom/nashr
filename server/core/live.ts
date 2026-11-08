import { EventEmitter } from 'node:events'

/*
 * Live updates (SPEC section 2: real-time), one process: the server tells open pages that something changed and the page fetches
 * the new state itself, so nothing private ever travels on this channel. Two kinds of signal:
 *  - "notification" for one company (its bell has something new),
 *  - "slot" for everyone watching a slot (a bid, an acceptance, a relist): just the slot id.
 * Signals go out a moment after the change, once its transaction has committed.
 * ponytail: in-process. With more than one API instance, carry the same two signals over Postgres LISTEN/NOTIFY.
 */
export const live = new EventEmitter()
live.setMaxListeners(0)

const AFTER_COMMIT_MS = 250
export function signalCompany(companyId: string) { setTimeout(() => live.emit('notification', companyId), AFTER_COMMIT_MS).unref?.() }
export function signalSlot(slotId: string) { setTimeout(() => live.emit('slot', slotId), AFTER_COMMIT_MS).unref?.() }
