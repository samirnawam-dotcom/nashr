import { pool, tx } from '../core/db.js'
import { audit } from '../core/audit.js'
import { ON_DEADLINE, transition } from './deals.js'
import { afterNoGo, closeAuction, relist } from './market.js'
import { onTimerEvent } from '../payments/payments.js'

/**
 * One sweeper for every timer (SPEC 5.3). Each item is handled in its own transaction and claimed with
 * FOR UPDATE SKIP LOCKED, so a missed run catches up next time and two sweepers never handle the same row.
 */
export async function sweep(at: Date, batch = 100) {
  let handled = 0
  for (;;) {
    const n = await tx(async c => {
      const slot = (await c.query(`select id from slots where status = 'open' and sale_type = 'auction' and closes_at <= $1
                                   order by closes_at limit 1 for update skip locked`, [at])).rows[0]
      if (slot) { await closeAuction(c, slot.id, at); return 1 }
      const choice = (await c.query(`select id from slots where status = 'awaiting_choice' and choice_deadline_at <= $1
                                     order by choice_deadline_at limit 1 for update skip locked`, [at])).rows[0]
      if (choice) { await relist(c, choice.id, at); return 1 }
      const deal = (await c.query(`select * from deals where next_deadline_at <= $1 order by next_deadline_at limit 1 for update skip locked`, [at])).rows[0]
      if (!deal) return 0
      const event = ON_DEADLINE[deal.status]
      if (!event) { await c.query(`update deals set next_deadline_at = null where id = $1`, [deal.id]); return 1 }
      const updated = await transition(c, deal.id, event, 'system:timer', at)
      if (event === 'expire' || event === 'lapse') await afterNoGo(c, updated, at)
      await onTimerEvent(c, updated, event, at)
      return 1
    })
    if (!n || (handled += n) >= batch) break
  }
  await audit(pool, 'system:sweeper', 'sweeper.heartbeat', null, null, { handled }, at)
  return handled
}
