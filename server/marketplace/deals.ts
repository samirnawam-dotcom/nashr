import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { addWorkingDays, type Market } from '../core/market.js'

// The booking state machine (SPEC 5.2). No other code writes deals.status.
export const TRANSITIONS: Record<string, Record<string, string>> = {
  awaiting_seller: { accept: 'awaiting_payment', decline: 'declined', expire: 'declined', supersede: 'declined' },
  awaiting_payment: { pay: 'secured', lapse: 'lapsed' },
  secured: { submit_proof: 'in_review', cancel_by_buyer: 'cancelled', cancel_by_seller: 'cancelled', creative_missed: 'cancelled', proof_missed: 'refunded' },
  in_review: { approve: 'released', auto_release: 'released', report_issue: 'issue_open' },
  issue_open: { resolve: 'in_review', make_good: 'secured', partial_refund: 'released', escalate: 'disputed' },
  disputed: { release: 'released', refund: 'refunded', partial_refund: 'released', make_good: 'secured' },
  released: { paid_out: 'paid_out' },
}

// Who hears about a status change on the bell (and later by email). Other steps notify from their own modules.
const TELL: Record<string, ('buyer' | 'seller')[]> = {
  awaiting_payment: ['buyer'], declined: ['buyer'], lapsed: ['buyer', 'seller'], secured: ['seller'],
  cancelled: ['buyer', 'seller'], refunded: ['buyer', 'seller'], released: ['seller'],
}

// The event the sweeper fires when a deal's deadline passes.
export const ON_DEADLINE: Record<string, string> = {
  awaiting_seller: 'expire', awaiting_payment: 'lapse', secured: 'proof_missed', in_review: 'auto_release', issue_open: 'escalate',
}

const hours = (t: Date, h: number) => new Date(t.getTime() + h * 3_600_000)
const earliest = (...ts: Date[]) => new Date(Math.min(...ts.map(t => t.getTime())))

/** When the deal's next timer runs out, for the status it is entering. */
async function deadlineFor(db: Db, deal: any, status: string, at: Date): Promise<Date | null> {
  const slot = await one(db, `select s.closes_at, s.creative_due_at, s.starts_at, s.ends_at, o.market from slots s join placements p on p.id = s.placement_id
                              join outlets o on o.id = p.outlet_id where s.id = $1`, [deal.slot_id])
  switch (status) {
    case 'awaiting_seller': {
      const d = hours(at, await setting(db, 'seller_window_hours', at))
      return deal.kind === 'buy_now' ? earliest(d, slot.closes_at) : d // a buy-now request ends with the auction at the latest
    }
    case 'awaiting_payment': // ends at the creative deadline at the latest; buyers may upload creative from acceptance (SPEC 12.1)
      return earliest(hours(at, await setting(db, 'payment_window_hours', at)), slot.creative_due_at)
    case 'secured': // proof due N working days after the run (SPEC G10)
      return addWorkingDays(db, deal.make_good_at ?? slot.ends_at ?? slot.starts_at, await setting(db, 'proof_due_working_days', at), slot.market as Market)
    case 'in_review': return addWorkingDays(db, at, await setting(db, 'review_working_days', at), slot.market as Market)
    case 'issue_open': return hours(at, await setting(db, 'issue_response_hours', at))
    default: return null
  }
}

export async function transition(db: Db, dealId: string, event: string, actor: string, at: Date, note?: string) {
  const deal = await one(db, `select * from deals where id = $1 for update`, [dealId])
  const to = TRANSITIONS[deal.status]?.[event]
  if (!to) throw new Error(`Cannot ${event} a deal that is ${deal.status}`)
  const deadline = await deadlineFor(db, deal, to, at)
  const updated = await one(db,
    `update deals set status = $2, next_deadline_at = $3,
       accepted_at = case when $2 = 'awaiting_payment' then $4 else accepted_at end,
       proof_at = case when $2 = 'in_review' and proof_at is null then $4 else proof_at end
     where id = $1 returning *`, [dealId, to, deadline, at])
  await db.query(`insert into deal_events (deal_id, at, event, from_status, to_status, actor, note) values ($1, $2, $3, $4, $5, $6, $7)`,
    [dealId, at, event, deal.status, to, actor, note ?? null])
  await audit(db, actor, `deal.${event}`, 'deal', dealId, { from: deal.status, to, note }, at)
  for (const side of TELL[to] ?? []) await notify(db, side === 'buyer' ? deal.buyer_id : deal.seller_id, `deal.${to}`, dealId, null, at)
  return updated
}

/** Open a deal from a winning bid, request or choice. */
export async function openDeal(db: Db, slot: any, bid: any, kind: string, actor: string, at: Date) {
  const seller = await one(db, `select o.company_id from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  const deal = await one(db,
    `insert into deals (slot_id, bid_id, buyer_id, seller_id, kind, status, amount, currency, created_at, campaign_id)
     values ($1, $2, $3, $4, $5, 'awaiting_seller', $6, $7, $8,
             -- an auto-bid placed by the system carries the campaign of the buyer's own last tagged bid
             coalesce($9::uuid, (select campaign_id from bids where slot_id = $1 and buyer_id = $3 and campaign_id is not null order by seq desc limit 1))) returning *`,
    [slot.id, bid.id, bid.buyer_id, seller.company_id, kind, bid.amount, slot.currency, at, bid.campaign_id ?? null])
  const deadline = await deadlineFor(db, deal, 'awaiting_seller', at)
  await db.query(`update deals set next_deadline_at = $2 where id = $1`, [deal.id, deadline])
  await db.query(`insert into deal_events (deal_id, at, event, from_status, to_status, actor) values ($1, $2, 'opened', null, 'awaiting_seller', $3)`,
    [deal.id, at, actor])
  await audit(db, actor, 'deal.opened', 'deal', deal.id, { kind, amount: bid.amount }, at)
  await notify(db, deal.seller_id, 'deal.opened', deal.id, { kind }, at)
  return { ...deal, next_deadline_at: deadline }
}
