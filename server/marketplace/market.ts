import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { setting, ratesFor } from '../core/settings.js'
import { minNextBid } from '../core/money.js'
import { openDeal, transition } from './deals.js'
import { briefProblems } from '../fulfilment/brief.js'
import { notify } from '../core/notify.js'
import { issueOrder } from '../documents/documents.js'

export class MarketError extends Error {}

/** An amount in fils as people read it in a message: "AED 4,300", "AED 4,300.50". */
const aed = (fils: number) => `AED ${(fils / 100).toLocaleString('en-US', { minimumFractionDigits: fils % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

const lockSlot = (db: Db, id: string) => one(db, `select * from slots where id = $1 for update`, [id])

/** A brief is required with a buyer's first bid, request or interest on a slot (brief section 10). */
async function requireBrief(db: Db, slot: any, buyerId: string, brief: unknown) {
  const has = await db.query(`select 1 from bids where slot_id = $1 and buyer_id = $2 and brief is not null limit 1`, [slot.id, buyerId])
  if (has.rowCount && brief == null) return
  const { channel } = await one(db, `select o.channel from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  const problems = briefProblems(brief as any, channel)
  if (problems.length) throw new MarketError(problems.join(' '))
}

/** Only open markets can be booked; KSA is "coming soon" at launch (brief section 14, scenario 19). */
async function assertMarketOpen(db: Db, slot: any, at: Date) {
  const { market } = await one(db, `select o.market from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  if (!(await setting<string[]>(db, 'open_markets', at)).includes(market)) throw new MarketError('This market is coming soon. Join the waiting list to hear when it opens.')
}

/** A bid may be tagged to one of the buyer's own campaigns. */
async function checkCampaign(db: Db, campaignId: string | undefined, buyerId: string) {
  if (!campaignId) return
  const c = await db.query(`select 1 from campaigns where id = $1 and buyer_id = $2 and status = 'active'`, [campaignId, buyerId])
  if (!c.rowCount) throw new MarketError('Choose one of your active campaigns.')
}

async function insertBid(db: Db, slot: any, b: { buyerId: string; kind: string; amount: number; max?: number | null; status?: string; brief?: unknown; campaignId?: string }, at: Date) {
  const { bid_seq } = await one(db, `update slots set bid_seq = bid_seq + 1 where id = $1 returning bid_seq`, [slot.id])
  return one(db,
    `insert into bids (slot_id, buyer_id, kind, amount, max_amount, seq, status, brief, created_at, campaign_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [slot.id, b.buyerId, b.kind, b.amount, b.max ?? null, bid_seq, b.status ?? 'active', b.brief == null ? null : JSON.stringify(b.brief), at, b.campaignId ?? null])
}

/**
 * Place a bid, with optional auto-bid maximum (owner feedback: needed for launch). The slot row lock
 * serialises bids, so two bids in the same second can never both win (brief scenario 13).
 * Auto-bid is standard proxy bidding: the higher maximum leads at one step above the other, ties go to the earlier bid.
 */
export async function placeBid(db: Db, a: { slotId: string; buyerId: string; amount: number; maxAmount?: number; brief?: unknown; campaignId?: string }, at: Date) {
  const slot = await lockSlot(db, a.slotId)
  if (slot.status !== 'open' || slot.sale_type !== 'auction' || at >= slot.closes_at) throw new MarketError('Bidding is closed for this slot.')
  await assertMarketOpen(db, slot, at)
  await requireBrief(db, slot, a.buyerId, a.brief)
  await checkCampaign(db, a.campaignId, a.buyerId)
  const step = await setting<number>(db, 'min_step_bp', at)
  const max = Math.max(a.maxAmount ?? a.amount, a.amount)

  let top: { bidId: string; amount: number; buyerId: string; max: number }
  if (slot.top_buyer_id === a.buyerId) { // the leader raises their maximum and/or their visible bid
    if (a.amount <= slot.top_amount && max <= slot.top_max) throw new MarketError('You are already the top bidder at this amount.')
    if (a.amount > slot.top_amount && a.amount < minNextBid(slot.top_amount, step))
      throw new MarketError(`Your bid must be at least ${aed(minNextBid(slot.top_amount, step))}.`)
    const amount = Math.max(a.amount, slot.top_amount)
    const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'bid', amount, max: Math.max(max, slot.top_max), brief: a.brief, campaignId: a.campaignId }, at)
    top = { bidId: bid.id, amount, buyerId: a.buyerId, max: Math.max(max, slot.top_max) }
  } else if (a.amount < (slot.top_amount ? minNextBid(slot.top_amount, step) : slot.starting_price)) {
    throw new MarketError(`Your bid must be at least ${aed(slot.top_amount ? minNextBid(slot.top_amount, step) : slot.starting_price)}.`)
  } else if (!slot.top_amount) {
    const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'bid', amount: a.amount, max, brief: a.brief, campaignId: a.campaignId }, at)
    top = { bidId: bid.id, amount: a.amount, buyerId: a.buyerId, max }
  } else if (max > slot.top_max) { // challenger takes the lead
    const price = Math.max(a.amount, Math.min(max, minNextBid(slot.top_max, step)))
    await db.query(`update bids set status = 'outbid' where slot_id = $1 and buyer_id = $2 and status = 'active'`, [slot.id, slot.top_buyer_id])
    const { outlet } = await one(db, `select o.name outlet from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
    await notify(db, slot.top_buyer_id, 'bid.outbid', null, { slotId: slot.id, outlet, label: slot.label }, at)
    const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'bid', amount: price, max, brief: a.brief, campaignId: a.campaignId }, at)
    top = { bidId: bid.id, amount: price, buyerId: a.buyerId, max }
  } else { // leader's maximum holds: the system raises the leader just above the challenger
    await insertBid(db, slot, { buyerId: a.buyerId, kind: 'bid', amount: a.amount, max, status: 'outbid', brief: a.brief, campaignId: a.campaignId }, at)
    const price = Math.min(slot.top_max, Math.max(slot.top_amount, minNextBid(max, step)))
    const bid = price > slot.top_amount
      ? await insertBid(db, slot, { buyerId: slot.top_buyer_id, kind: 'auto', amount: price, max: slot.top_max }, at)
      : { id: slot.top_bid_id }
    top = { bidId: bid.id, amount: price, buyerId: slot.top_buyer_id, max: slot.top_max }
  }
  await db.query(`update slots set top_bid_id = $2, top_amount = $3, top_buyer_id = $4, top_max = $5 where id = $1`,
    [slot.id, top.bidId, top.amount, top.buyerId, top.max])
  return { leading: top.buyerId === a.buyerId, topAmount: top.amount }
}

/** Buy-now is a request: nothing is charged, the seller must accept (brief section 9). */
export async function requestBuyNow(db: Db, a: { slotId: string; buyerId: string; brief?: unknown; campaignId?: string }, at: Date) {
  const slot = await lockSlot(db, a.slotId)
  if (slot.status !== 'open' || !slot.buy_now_price || at >= slot.closes_at) throw new MarketError('Buy now is not available for this slot.')
  const open = await db.query(`select 1 from deals where slot_id = $1 and buyer_id = $2 and kind = 'buy_now' and status = 'awaiting_seller'`, [slot.id, a.buyerId])
  if (open.rowCount) throw new MarketError('You already have a buy-now request on this slot.')
  await assertMarketOpen(db, slot, at)
  await requireBrief(db, slot, a.buyerId, a.brief)
  await checkCampaign(db, a.campaignId, a.buyerId)
  const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'buy_now', amount: slot.buy_now_price, brief: a.brief, campaignId: a.campaignId }, at)
  return openDeal(db, slot, bid, 'buy_now', `buyer:${a.buyerId}`, at)
}

/**
 * A buyer takes back a buy-now request the publisher hasn't answered (brief: buy-now requests may be withdrawn; ordinary bids are binding).
 * The auction carries on as if the request had never been made.
 */
export async function withdrawBuyNow(db: Db, dealId: string, buyerId: string, at: Date) {
  const d = (await db.query(`select id, kind, status, bid_id from deals where id = $1 and buyer_id = $2 for update`, [dealId, buyerId])).rows[0]
  if (!d) throw new MarketError('This booking is not yours.')
  if (d.kind !== 'buy_now' || d.status !== 'awaiting_seller') throw new MarketError('Only a buy-now request the publisher has not answered can be withdrawn.')
  const deal = await transition(db, dealId, 'withdraw', `buyer:${buyerId}`, at, 'Withdrawn by the buyer')
  await db.query(`update bids set status = 'withdrawn' where id = $1`, [d.bid_id])
  return deal
}

/** Quick sale: a buyer shows interest (optionally an offer, never below the floor). */
export async function showInterest(db: Db, a: { slotId: string; buyerId: string; amount?: number; brief?: unknown; campaignId?: string }, at: Date) {
  const slot = await lockSlot(db, a.slotId)
  if (slot.status !== 'open' || slot.sale_type !== 'quick_sale') throw new MarketError('This slot is not a quick sale.')
  await assertMarketOpen(db, slot, at)
  await requireBrief(db, slot, a.buyerId, a.brief)
  await checkCampaign(db, a.campaignId, a.buyerId)
  const amount = a.amount ?? slot.starting_price
  if (amount < slot.starting_price) throw new MarketError(`Offers cannot be below ${aed(slot.starting_price)}.`)
  return insertBid(db, slot, { buyerId: a.buyerId, kind: 'interest', amount, brief: a.brief, campaignId: a.campaignId }, at)
}

/** The seller accepts one quick-sale interest; everyone else is told the slot has gone. */
export async function acceptInterest(db: Db, bidId: string, actor: string, at: Date) {
  const bid = await one(db, `select * from bids where id = $1`, [bidId])
  const slot = await lockSlot(db, bid.slot_id)
  if (slot.status !== 'open' || bid.kind !== 'interest' || bid.status !== 'active') throw new MarketError('This interest can no longer be accepted.')
  const deal = await openDeal(db, slot, bid, 'quick_sale', actor, at)
  return accept(db, deal.id, actor, at)
}

/** Auction close (sweeper): the top bid goes to the seller, or auto-accept at/above reserve. */
export async function closeAuction(db: Db, slotId: string, at: Date) {
  const slot = await lockSlot(db, slotId)
  if (slot.status !== 'open' || slot.sale_type !== 'auction' || at < slot.closes_at) return null
  if (!slot.top_bid_id) { await db.query(`update slots set status = 'unsold' where id = $1`, [slot.id]); return null }
  await db.query(`update slots set status = 'awaiting_seller', round = 1 where id = $1`, [slot.id])
  const bid = await one(db, `select * from bids where id = $1`, [slot.top_bid_id])
  const deal = await openDeal(db, slot, bid, 'auction', 'system', at)
  if (slot.auto_accept && slot.reserve_price && bid.amount >= slot.reserve_price) return accept(db, deal.id, 'system:auto-accept', at)
  return deal
}

/**
 * Breaks, "any break" and the package on the same airing exclude each other. Recomputed from the booked slots
 * every time, so a lapsed booking releases what it held.
 */
async function refreshConflicts(db: Db, slot: any, at: Date) {
  // ponytail: an accepted "any break" only holds the package; assigning the actual break is the seller's job in fulfilment (C1).
  const group = [slot.placement_id, slot.air_date]
  // released slots whose bidding already closed come back as a quick sale, like a relist
  await db.query(`update slots set status = 'open', sale_type = case when closes_at <= $3 then 'quick_sale' else sale_type end
                  where placement_id = $1 and air_date = $2 and status = 'held'`, [...group, at])
  const booked = (await db.query(`select kind from slots where placement_id = $1 and air_date = $2 and status = 'booked'`, group)).rows.map(r => r.kind)
  const hold = new Set<string>()
  if (booked.includes('package')) ['single', 'any'].forEach(k => hold.add(k))
  if (booked.includes('single') || booked.includes('any')) hold.add('package')
  if (hold.size) await db.query(`update slots set status = 'held' where placement_id = $1 and air_date = $2 and status = 'open' and kind = any($3)`, [...group, [...hold]])
  // no single breaks left → "any break" can no longer be honoured
  await db.query(`update slots set status = 'held' where placement_id = $1 and air_date = $2 and kind = 'any' and status = 'open'
                  and not exists (select 1 from slots s where s.placement_id = $1 and s.air_date = $2 and s.kind = 'single' and s.status = 'open')`, group)
}

export async function accept(db: Db, dealId: string, actor: string, at: Date) {
  const pre = await one(db, `select * from deals where id = $1`, [dealId])
  const slot = await lockSlot(db, pre.slot_id)
  const rates = await ratesFor(db, pre.seller_id, at) // frozen on the deal (brief section 3)
  await db.query(`update deals set commission_bp = $2, media_vat_bp = $3, fee_vat_bp = $4 where id = $1`,
    [dealId, rates.commissionBp, rates.mediaVatBp, rates.feeVatBp])
  const deal = await transition(db, dealId, 'accept', actor, at)
  await db.query(`update slots set status = 'booked' where id = $1`, [slot.id])
  await db.query(`update bids set status = 'selected' where id = $1`, [deal.bid_id])
  // Buy-now and quick sale end the sale for everyone else now. After an auction, the other bids stay valid
  // until payment is secured, so the seller can pick another one if this buyer does not pay (SPEC 11.1 #7).
  if (deal.kind === 'buy_now' || deal.kind === 'quick_sale')
    await db.query(`update bids set status = 'not_selected' where slot_id = $1 and status in ('active', 'outbid')`, [slot.id])
  for (const other of (await db.query(`select id from deals where slot_id = $1 and id <> $2 and status = 'awaiting_seller'`, [slot.id, dealId])).rows)
    await transition(db, other.id, 'supersede', 'system', at, 'Another request was accepted')
  await refreshConflicts(db, slot, at)
  await issueOrder(db, dealId, at)
  return deal
}

export async function decline(db: Db, dealId: string, reason: string, actor: string, at: Date) {
  if (!reason?.trim()) throw new MarketError('A reason is required to decline.')
  const deal = await transition(db, dealId, 'decline', actor, at, reason)
  await afterNoGo(db, deal, at)
  return deal
}

/**
 * After a decline, expiry or lapse (owner feedback, SPEC 11.1 #7): a refused buy-now request just ends and the auction carries on;
 * an accepted buy-now or quick sale that is not paid is relisted.
 * Otherwise the seller may choose any remaining bid within their window, at most `max_choice_rounds` times, then the slot is relisted.
 */
export async function afterNoGo(db: Db, deal: any, at: Date) {
  const slot = await lockSlot(db, deal.slot_id)
  await db.query(`update bids set status = 'not_selected' where id = $1`, [deal.bid_id])
  if (deal.kind === 'buy_now' && deal.status === 'declined') return // request refused or expired: the auction carries on
  await db.query(`update slots set status = 'awaiting_seller' where id = $1`, [slot.id]) // no longer booked
  await refreshConflicts(db, slot, at)
  if (deal.kind === 'buy_now' || deal.kind === 'quick_sale') return relist(db, slot.id, at) // the other buyers were already told
  const remaining = await db.query(`select 1 from bids where slot_id = $1 and status in ('active', 'outbid') and buyer_id <> $2 limit 1`, [slot.id, deal.buyer_id])
  // round 1 is the original winner; the seller may then choose another bid up to max_choice_rounds times
  if (slot.round > await setting<number>(db, 'max_choice_rounds', at) || !remaining.rowCount) return relist(db, slot.id, at)
  const window = await setting<number>(db, 'seller_window_hours', at)
  await db.query(`update slots set status = 'awaiting_choice', choice_deadline_at = $2 where id = $1`, [slot.id, new Date(at.getTime() + window * 3_600_000)])
}

/** The seller picks a remaining bid. Choosing it is accepting it, so the buyer is asked to pay straight away. */
export async function chooseBid(db: Db, slotId: string, bidId: string, actor: string, at: Date) {
  const slot = await lockSlot(db, slotId)
  const bid = await one(db, `select * from bids where id = $1`, [bidId])
  if (slot.status !== 'awaiting_choice' || bid.slot_id !== slot.id || !['active', 'outbid'].includes(bid.status))
    throw new MarketError('This bid cannot be chosen.')
  await db.query(`update slots set status = 'awaiting_seller', round = round + 1, choice_deadline_at = null where id = $1`, [slot.id])
  // Bidders above the chosen one were skipped: tell them now.
  await db.query(`update bids set status = 'not_selected' where slot_id = $1 and status in ('active', 'outbid') and amount > $2 and id <> $3`,
    [slot.id, bid.amount, bid.id])
  const deal = await openDeal(db, { ...slot, status: 'awaiting_seller' }, bid, 'choice', actor, at)
  return accept(db, deal.id, actor, at)
}

/** ponytail: relisting reopens the slot as a quick sale at its starting price; the owner may prefer another rule. */
export async function relist(db: Db, slotId: string, at: Date) {
  await db.query(`update bids set status = 'not_selected' where slot_id = $1 and status in ('active', 'outbid')`, [slotId])
  await db.query(`update slots set status = 'open', sale_type = 'quick_sale', choice_deadline_at = null,
                  top_bid_id = null, top_amount = null, top_buyer_id = null, top_max = null where id = $1`, [slotId])
  await audit(db, 'system', 'slot.relisted', 'slot', slotId, null, at)
}
