import type { Db } from '../core/db.js'
import { audit } from '../core/audit.js'
import { containsContactDetails } from '../core/contact.js'
import { notify } from '../core/notify.js'
import { MarketError } from '../marketplace/market.js'

// Words that suggest taking the conversation off Nashr: the message goes through, and the team sees it flagged (SPEC G20).
const OFF_PLATFORM = /\b(whats\s*app|watsapp|telegram|signal|wechat|viber|call me|ring me|text me|email me|my number|my email|outside nashr|directly)\b|واتس|واتساب|تيليجرام|اتصل بي|راسلني|رقمي|إيميلي|بريدي/i
// Owner rule: the conversation opens once the buyer has paid, and closes when the deal is finished.
// Paid and running: secured → in review → (issue, dispute). Finished: released, paid out, cancelled or refunded (read-only history).
const OPEN = ['secured', 'in_review', 'issue_open', 'disputed']
const PAID = [...OPEN, 'released', 'paid_out', 'cancelled', 'refunded']

export type Side = 'buyer' | 'seller'

/** The deal, if this company is its buyer or its publisher; which side they are on. */
export async function dealFor(db: Db, dealId: string, companyId: string) {
  const d = (await db.query(`select id, ref, status, buyer_id, seller_id from deals where id = $1 and (buyer_id = $2 or seller_id = $2)`, [dealId, companyId])).rows[0]
  return d ? { ...d, side: (d.buyer_id === companyId ? 'buyer' : 'seller') as Side } : null
}

/** One conversation, oldest first, each message marked as written by this company or the other side. */
export async function thread(db: Db, dealId: string, viewer: string | null) {
  const rows = (await db.query(`select m.id, m.company_id, m.body, m.flagged, m.created_at, c.name company from messages m join companies c on c.id = m.company_id
    where m.deal_id = $1 order by m.seq`, [dealId])).rows
  return rows.map(r => ({ id: r.id, mine: r.company_id === viewer, company: r.company, body: r.body, at: r.created_at, ...(viewer ? {} : { flagged: r.flagged }) }))
}

export const canWrite = (status: string) => OPEN.includes(status)
/** Whether there is a conversation at all: only once the booking has been paid for. */
export const hasThread = (status: string) => PAID.includes(status)

export async function send(db: Db, deal: { id: string; ref: string; status: string; buyer_id: string; seller_id: string; side: Side }, companyId: string, userId: string, text: string, at: Date) {
  const body = text.trim()
  if (!body) throw new MarketError('Write a message first.')
  if (!hasThread(deal.status)) throw new MarketError('Messages open once the booking is paid.')
  if (!canWrite(deal.status)) throw new MarketError('This deal is finished, so the conversation is closed.')
  if (containsContactDetails(body)) throw new MarketError('Emails and phone numbers are not allowed. Talk through Nashr.')
  const flagged = OFF_PLATFORM.test(body)
  const m = (await db.query(`insert into messages (deal_id, company_id, user_id, body, flagged, created_at) values ($1, $2, $3, $4, $5, $6) returning id`,
    [deal.id, companyId, userId, body, flagged, at])).rows[0]
  await markRead(db, deal.id, companyId, at)
  const other = deal.side === 'buyer' ? deal.seller_id : deal.buyer_id
  await notify(db, other, 'message.new', deal.id, { from: deal.side }, at)
  if (flagged) await audit(db, `${deal.side}:${companyId}`, 'message.flagged', 'deal', deal.id, { message: m.id }, at)
  return m.id as string
}

export const markRead = (db: Db, dealId: string, companyId: string, at: Date) => db.query(
  `insert into message_reads (deal_id, company_id, read_at) values ($1, $2, $3) on conflict (deal_id, company_id) do update set read_at = greatest(message_reads.read_at, excluded.read_at)`,
  [dealId, companyId, at])

/** Every conversation this company has, newest first, with what it hasn't read yet. */
export async function conversations(db: Db, companyId: string) {
  return (await db.query(`
    select d.id, d.ref, d.status, s.label, o.name outlet, case when d.buyer_id = $1 then sc.name else bc.name end other,
           lm.body last_body, lm.created_at last_at, lm.company_id = $1 last_mine,
           (select count(*)::int from messages x where x.deal_id = d.id and x.company_id <> $1 and x.created_at > coalesce(r.read_at, '-infinity')) unread
    from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
    join companies bc on bc.id = d.buyer_id join companies sc on sc.id = d.seller_id
    join lateral (select body, created_at, company_id from messages m where m.deal_id = d.id order by seq desc limit 1) lm on true
    left join message_reads r on r.deal_id = d.id and r.company_id = $1
    where d.buyer_id = $1 or d.seller_id = $1
    order by lm.created_at desc limit 200`, [companyId])).rows
    .map(r => ({ dealId: r.id, ref: r.ref, status: r.status, outlet: r.outlet, label: r.label, with: r.other, last: { body: r.last_body, at: r.last_at, mine: r.last_mine }, unread: r.unread }))
}

export async function unreadCount(db: Db, companyId: string) {
  return (await db.query(`select count(*)::int n from messages m join deals d on d.id = m.deal_id
    left join message_reads r on r.deal_id = m.deal_id and r.company_id = $1
    where (d.buyer_id = $1 or d.seller_id = $1) and m.company_id <> $1 and m.created_at > coalesce(r.read_at, '-infinity')`, [companyId])).rows[0].n as number
}
