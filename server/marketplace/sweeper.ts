import { pool, tx } from '../core/db.js'
import { audit } from '../core/audit.js'
import { ON_DEADLINE, transition } from './deals.js'
import { afterNoGo, closeAuction, expireInterests, relist } from './market.js'
import { onTimerEvent } from '../payments/payments.js'
import { escalateIssue } from '../fulfilment/issues.js'
import { requestPreRunChecks } from '../fulfilment/prerun.js'
import { notify } from '../core/notify.js'
import { sendSearchAlerts } from './alerts.js'
import { topUpRolling } from '../catalog/placements.js'
import type { Db } from '../core/db.js'

// Why the timer acted, in words both sides see on the timeline (scenarios 3, 4, 10, 11).
const TIMER_NOTE: Record<string, string> = {
  expire: 'The publisher did not reply in time', lapse: 'Payment was not made in time',
  proof_missed: 'The publisher did not send proof in time', auto_release: 'Released automatically after the review window',
}

// Reminders before each deadline (brief section 19). ponytail: fixed offsets; make them settings if the owner wants to tune them.
const REMIND: Record<string, { hours: number; who: 'buyer_id' | 'seller_id'; kind: string }[]> = {
  awaiting_seller: [{ hours: 12, who: 'seller_id', kind: 'reminder.decide' }, { hours: 2, who: 'seller_id', kind: 'reminder.decide' }],
  awaiting_payment: [{ hours: 12, who: 'buyer_id', kind: 'reminder.pay' }],
  in_review: [{ hours: 72, who: 'buyer_id', kind: 'reminder.review' }, { hours: 24, who: 'buyer_id', kind: 'reminder.review' }], // day 3 and day 1
  issue_open: [{ hours: 24, who: 'seller_id', kind: 'reminder.issue' }],
}

/** Send each reminder whose time has come, once per deadline. */
export async function sendReminders(db: Db, at: Date) {
  let sent = 0
  for (const [status, rules] of Object.entries(REMIND)) for (const r of rules) {
    const { rows } = await db.query(
      `insert into reminders (deal_id, kind, deadline_at, sent_at)
       select d.id, $2 || ':' || $3::text, d.next_deadline_at, $4 from deals d
       where d.status = $1 and d.next_deadline_at > $4 and d.next_deadline_at - make_interval(hours => $3::int) <= $4
       on conflict do nothing returning deal_id, deadline_at`, [status, r.kind, r.hours, at])
    for (const x of rows) {
      const d = (await db.query(`select buyer_id, seller_id from deals where id = $1`, [x.deal_id])).rows[0]
      await notify(db, d[r.who], r.kind, x.deal_id, { deadline: x.deadline_at }, at)
    }
    sent += rows.length
  }
  return sent
}

/**
 * One sweeper for every timer (SPEC 5.3). Each item is handled in its own transaction and claimed with
 * FOR UPDATE SKIP LOCKED, so a missed run catches up next time and two sweepers never handle the same row.
 */
export async function sweep(at: Date, batch = 100) {
  let handled = 0
  // One broken row must not stop every other timer: it is skipped for this run, logged, and tried again next minute.
  const skip: string[] = []
  let current: string | null = null
  for (;;) {
    let n: number
    try {
      n = await tx(async c => {
        current = null
        const slot = (await c.query(`select id from slots where status = 'open' and sale_type = 'auction' and closes_at <= $1 and id <> all($2::uuid[])
                                     order by closes_at limit 1 for update skip locked`, [at, skip])).rows[0]
        if (slot) { current = slot.id; await closeAuction(c, slot.id, at); return 1 }
        const quick = (await c.query(`select s.id from slots s where s.status = 'open' and s.sale_type = 'quick_sale' and s.closes_at <= $1 and s.id <> all($2::uuid[])
                                      and exists (select 1 from bids b where b.slot_id = s.id and b.kind = 'interest' and b.status = 'active')
                                      order by s.closes_at limit 1 for update skip locked`, [at, skip])).rows[0]
        if (quick) { current = quick.id; await expireInterests(c, quick.id, at); return 1 }
        const choice = (await c.query(`select id from slots where status = 'awaiting_choice' and choice_deadline_at <= $1 and id <> all($2::uuid[])
                                       order by choice_deadline_at limit 1 for update skip locked`, [at, skip])).rows[0]
        if (choice) { current = choice.id; await relist(c, choice.id, at); return 1 }
        const deal = (await c.query(`select * from deals where next_deadline_at <= $1 and id <> all($2::uuid[]) order by next_deadline_at limit 1 for update skip locked`, [at, skip])).rows[0]
        if (!deal) return 0
        current = deal.id
        const event = ON_DEADLINE[deal.status]
        if (!event) { await c.query(`update deals set next_deadline_at = null where id = $1`, [deal.id]); return 1 }
        if (event === 'escalate') { await escalateIssue(c, deal, 'system:timer', at); return 1 } // seller did not answer the issue in time
        const updated = await transition(c, deal.id, event, 'system:timer', at, TIMER_NOTE[event])
        if (event === 'expire' || event === 'lapse') await afterNoGo(c, updated, at)
        await onTimerEvent(c, updated, event, at)
        return 1
      })
    } catch (e: any) {
      if (!current) throw e
      skip.push(current)
      console.error(`sweeper: ${current} failed and is skipped this run:`, e?.message ?? e)
      await audit(pool, 'system:sweeper', 'sweeper.error', 'timer', current, { error: String(e?.message ?? e).slice(0, 500) }, at)
      n = 1
    }
    if (!n || (handled += n) >= batch) break
  }
  handled += await tx(c => requestPreRunChecks(c, at))
  handled += await tx(c => sendReminders(c, at))
  handled += await tx(c => sendSearchAlerts(c, at))
  handled += await tx(c => topUpRolling(c, at)) // "keep it on sale" placements stay listed their number of weeks ahead
  await audit(pool, 'system:sweeper', 'sweeper.heartbeat', null, null, { handled }, at)
  return handled
}
