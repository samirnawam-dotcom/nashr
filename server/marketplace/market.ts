import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { setting, ratesFor } from '../core/settings.js'
import { minNextBid } from '../core/money.js'
import { openDeal, transition } from './deals.js'
import { brandSafetyProblem, briefProblems } from '../fulfilment/brief.js'
import { notify } from '../core/notify.js'
import { signalSlot } from '../core/live.js'
import { issueOrder } from '../documents/documents.js'

export class MarketError extends Error {}

/** An amount in fils as people read it in a message: "AED 4,300", "AED 4,300.50". */
const aed = (fils: number) => `AED ${(fils / 100).toLocaleString('en-US', { minimumFractionDigits: fils % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

// Every change to a slot goes through this lock, so it is also where open pages are told the slot changed (after commit).
const lockSlot = (db: Db, id: string) => { signalSlot(db, id); return one(db, `select * from slots where id = $1 for update`, [id]) }

/** A brief is required with a buyer's first bid, request or interest on a slot (brief section 10). The client's own industry and name pass brand safety too. */
async function requireBrief(db: Db, slot: any, buyerId: string, brief: unknown, client?: { name: string; industry: string | null } | null) {
  const outlet = await one(db, `select o.channel, o.blocked_industries, o.blocked_advertisers from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  const onFile = (await db.query(`select brief from bids where slot_id = $1 and buyer_id = $2 and brief is not null order by created_at desc limit 1`, [slot.id, buyerId])).rows[0]?.brief
  if (!(onFile && brief == null)) {
    const problems = briefProblems(brief as any, outlet.channel)
    if (problems.length) throw new MarketError(problems.join(' '))
  }
  const unsafe = brandSafetyProblem((brief ?? onFile) as any, outlet) ?? (client ? brandSafetyProblem({ industry: client.industry ?? undefined, advertiser: client.name }, outlet) : null)
  if (unsafe) throw new MarketError(unsafe)
}

/** Only open markets can be booked; KSA is "coming soon" at launch (brief section 14, scenario 19). */
async function assertMarketOpen(db: Db, slot: any, at: Date) {
  const { market } = await one(db, `select o.market from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  if (!(await setting<string[]>(db, 'open_markets', at)).includes(market)) throw new MarketError('This market is coming soon. Join the waiting list to hear when it opens.')
}

const BOOKED = `('awaiting_seller', 'awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out')`
type Tag = { campaignId?: string; clientId?: string }

/**
 * A booking may be tagged to one of the buyer's own campaigns and, for agencies, to one of their clients. A campaign made for a
 * client carries that client. A client whose budget is set to stop refuses a booking that would take it over.
 */
async function tagFor(db: Db, a: Tag, buyerId: string, amount: number) {
  let clientId = a.clientId ?? null
  if (a.campaignId) {
    const c = (await db.query(`select client_id from campaigns where id = $1 and buyer_id = $2 and status = 'active'`, [a.campaignId, buyerId])).rows[0]
    if (!c) throw new MarketError('Choose one of your active campaigns.')
    if (c.client_id && clientId && c.client_id !== clientId) throw new MarketError('This campaign is for another client.')
    clientId = c.client_id ?? clientId
  }
  if (!clientId) return { campaignId: a.campaignId ?? null, clientId: null, client: null }
  const client = (await db.query(`select * from clients where id = $1 and buyer_id = $2 and status = 'active' for update`, [clientId, buyerId])).rows[0]
  if (!client) throw new MarketError('Choose one of your active clients.')
  if (client.budget != null && client.budget_stop) {
    const { used } = await one(db, `select coalesce(sum(amount), 0)::bigint used from deals where client_id = $1 and status in ${BOOKED}`, [clientId])
    if (Number(used) + amount > Number(client.budget))
      throw new MarketError(`This would take ${client.name} over its budget: ${aed(Number(client.budget) - Number(used))} is left.`)
  }
  return { campaignId: a.campaignId ?? null, clientId, client }
}

async function insertBid(db: Db, slot: any, b: { buyerId: string; kind: string; amount: number; max?: number | null; status?: string; brief?: unknown; campaignId?: string | null; clientId?: string | null }, at: Date) {
  const { bid_seq } = await one(db, `update slots set bid_seq = bid_seq + 1 where id = $1 returning bid_seq`, [slot.id])
  return one(db,
    `insert into bids (slot_id, buyer_id, kind, amount, max_amount, seq, status, brief, created_at, campaign_id, client_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [slot.id, b.buyerId, b.kind, b.amount, b.max ?? null, bid_seq, b.status ?? 'active', b.brief == null ? null : JSON.stringify(b.brief), at, b.campaignId ?? null, b.clientId ?? null])
}

/**
 * The reserve as a floor for auto-bids (owner decision): when the leader's maximum reaches the reserve but the price is below it,
 * the price goes up to the reserve, never past the maximum. A plain bid below the reserve stays where it is.
 */
const reserveFloor = (slot: any, price: number, max: number) => {
  const reserve = slot.reserve_price == null ? null : Number(slot.reserve_price)
  return reserve != null && price < reserve && max >= reserve ? reserve : price
}

/**
 * Place a bid, with optional auto-bid maximum (owner feedback: needed for launch). The slot row lock
 * serialises bids, so two bids in the same second can never both win (brief scenario 13).
 * Auto-bid is standard proxy bidding: the higher maximum leads at one step above the other, ties go to the earlier bid.
 */
export async function placeBid(db: Db, a: { slotId: string; buyerId: string; amount: number; maxAmount?: number; brief?: unknown; campaignId?: string; clientId?: string }, at: Date) {
  const slot = await lockSlot(db, a.slotId)
  if (slot.status !== 'open' || slot.sale_type !== 'auction' || at >= slot.closes_at) throw new MarketError('Bidding is closed for this slot.')
  await assertMarketOpen(db, slot, at)
  const tag = await tagFor(db, a, a.buyerId, Math.max(a.maxAmount ?? a.amount, a.amount))
  await requireBrief(db, slot, a.buyerId, a.brief, tag.client)
  const step = await setting<number>(db, 'min_step_bp', at)
  const max = Math.max(a.maxAmount ?? a.amount, a.amount)

  let top: { bidId: string; amount: number; buyerId: string; max: number }
  if (slot.top_buyer_id === a.buyerId) { // the leader raises their maximum and/or their visible bid
    if (a.amount <= slot.top_amount && max <= slot.top_max) throw new MarketError('You are already the top bidder at this amount.')
    if (a.amount > slot.top_amount && a.amount < minNextBid(slot.top_amount, step))
      throw new MarketError(`Your bid must be at least ${aed(minNextBid(slot.top_amount, step))}.`)
    const amount = Math.max(a.amount, slot.top_amount)
    const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'bid', amount, max: Math.max(max, slot.top_max), brief: a.brief, campaignId: tag.campaignId, clientId: tag.clientId }, at)
    top = { bidId: bid.id, amount, buyerId: a.buyerId, max: Math.max(max, slot.top_max) }
  } else if (a.amount < (slot.top_amount ? minNextBid(slot.top_amount, step) : slot.starting_price)) {
    throw new MarketError(`Your bid must be at least ${aed(slot.top_amount ? minNextBid(slot.top_amount, step) : slot.starting_price)}.`)
  } else if (!slot.top_amount) {
    const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'bid', amount: a.amount, max, brief: a.brief, campaignId: tag.campaignId, clientId: tag.clientId }, at)
    top = { bidId: bid.id, amount: a.amount, buyerId: a.buyerId, max }
  } else if (max > slot.top_max) { // challenger takes the lead
    const price = reserveFloor(slot, Math.max(a.amount, Math.min(max, minNextBid(slot.top_max, step))), max)
    await db.query(`update bids set status = 'outbid' where slot_id = $1 and buyer_id = $2 and status = 'active'`, [slot.id, slot.top_buyer_id])
    const { outlet } = await one(db, `select o.name outlet from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
    // an auto-bidder hears that their maximum was passed, so they can raise it; a plain bidder that they were outbid
    const autoBidder = slot.top_max > slot.top_amount
    await notify(db, slot.top_buyer_id, 'bid.outbid', null, { slotId: slot.id, outlet, label: slot.label, ...(autoBidder ? { max: slot.top_max } : {}), top: price }, at)
    const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'bid', amount: price, max, brief: a.brief, campaignId: tag.campaignId, clientId: tag.clientId }, at)
    top = { bidId: bid.id, amount: price, buyerId: a.buyerId, max }
  } else { // leader's maximum holds: the system raises the leader just above the challenger, never past the leader's maximum
    await insertBid(db, slot, { buyerId: a.buyerId, kind: 'bid', amount: a.amount, max, status: 'outbid', brief: a.brief, campaignId: tag.campaignId, clientId: tag.clientId }, at)
    const price = reserveFloor(slot, Math.min(slot.top_max, Math.max(slot.top_amount, minNextBid(max, step))), slot.top_max)
    const bid = price > slot.top_amount
      ? await insertBid(db, slot, { buyerId: slot.top_buyer_id, kind: 'auto', amount: price, max: slot.top_max }, at)
      : { id: slot.top_bid_id }
    top = { bidId: bid.id, amount: price, buyerId: slot.top_buyer_id, max: slot.top_max }
    if (price > slot.top_amount) { // tell the auto-bidder it worked, and when it has reached the cap
      const { outlet } = await one(db, `select o.name outlet from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
      await notify(db, slot.top_buyer_id, price >= slot.top_max ? 'bid.auto_cap' : 'bid.auto_raised', null,
        { slotId: slot.id, outlet, label: slot.label, amount: price, max: slot.top_max }, at)
    }
  }
  // a first bid, or a leader raising their own maximum: the auto-bid lifts the price to the reserve if the maximum allows
  const floored = reserveFloor(slot, top.amount, top.max)
  if (floored > top.amount) top = { ...top, amount: floored, bidId: (await insertBid(db, slot, { buyerId: top.buyerId, kind: 'auto', amount: floored, max: top.max }, at)).id }
  await db.query(`update slots set top_bid_id = $2, top_amount = $3, top_buyer_id = $4, top_max = $5 where id = $1`,
    [slot.id, top.bidId, top.amount, top.buyerId, top.max])
  const leading = top.buyerId === a.buyerId
  return { leading, topAmount: top.amount, yourMax: leading ? top.max : max, minNextBid: minNextBid(top.amount, step),
    // the bid went in but another buyer's auto-bid answered at once: the screen says so instead of "your bid is in"
    beatenByAutoBid: !leading }
}

/**
 * Nashr voids a bid (SPEC G11: bids are binding, but the admin can void one with a reason, audited). The auction is worked out
 * again from the bids that remain, with the same proxy rule: the highest maximum leads one step above the next buyer's maximum,
 * never below its own bid.
 */
export async function voidBid(db: Db, bidId: string, reason: string, actor: string, at: Date) {
  if ((reason ?? '').trim().length < 5) throw new MarketError('Write the reason the buyer will see.')
  const { slot_id } = await one(db, `select slot_id from bids where id = $1`, [bidId])
  const slot = await lockSlot(db, slot_id)
  const bid = await one(db, `select * from bids where id = $1 for update`, [bidId])
  if (slot.status !== 'open' || slot.sale_type !== 'auction' || !['active', 'outbid'].includes(bid.status) || !['bid', 'auto'].includes(bid.kind))
    throw new MarketError('Only a live bid on an open auction can be voided.')
  // the buyer's whole position on this slot goes: their bids and any auto-bid made for them
  await db.query(`update bids set status = 'withdrawn' where slot_id = $1 and buyer_id = $2 and status in ('active', 'outbid') and kind in ('bid', 'auto')`, [slot.id, bid.buyer_id])
  const step = await setting<number>(db, 'min_step_bp', at)
  // ties go to the buyer who reached that maximum first, as in live bidding
  const per = (await db.query(`select buyer_id, top_max, own, (select min(seq) from bids b2 where b2.slot_id = $1 and b2.buyer_id = x.buyer_id
        and b2.status in ('active', 'outbid') and b2.kind in ('bid', 'auto') and coalesce(b2.max_amount, b2.amount) = x.top_max) first_seq
      from (select buyer_id, max(coalesce(max_amount, amount))::bigint top_max, max(amount) filter (where kind = 'bid')::bigint own
            from bids where slot_id = $1 and status in ('active', 'outbid') and kind in ('bid', 'auto') group by buyer_id) x
      order by top_max desc, first_seq`, [slot.id])).rows
  if (!per.length) await db.query(`update slots set top_bid_id = null, top_amount = null, top_buyer_id = null, top_max = null where id = $1`, [slot.id])
  else {
    const [lead, next] = per, leadMax = Number(lead.top_max), own = Number(lead.own ?? lead.top_max)
    const price = reserveFloor(slot, next ? Math.min(leadMax, Math.max(own, minNextBid(Number(next.top_max), step))) : own, leadMax)
    const top = await insertBid(db, slot, { buyerId: lead.buyer_id, kind: 'auto', amount: price, max: leadMax }, at)
    await db.query(`update bids set status = case when buyer_id = $2 then 'active' else 'outbid' end where slot_id = $1 and status in ('active', 'outbid') and kind in ('bid', 'auto')`, [slot.id, lead.buyer_id])
    await db.query(`update slots set top_bid_id = $2, top_amount = $3, top_buyer_id = $4, top_max = $5 where id = $1`, [slot.id, top.id, price, lead.buyer_id, leadMax])
  }
  const { outlet } = await one(db, `select o.name outlet from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  await notify(db, bid.buyer_id, 'bid.voided', null, { slotId: slot.id, outlet, label: slot.label, reason: reason.trim() }, at)
  await audit(db, actor, 'bid.voided', 'slot', slot.id, { bidId, buyer: bid.buyer_id, reason: reason.trim() }, at)
}

/** Buy-now is a request: nothing is charged, the seller must accept (brief section 9). */
export async function requestBuyNow(db: Db, a: { slotId: string; buyerId: string; brief?: unknown; campaignId?: string; clientId?: string }, at: Date) {
  const slot = await lockSlot(db, a.slotId)
  if (slot.status !== 'open' || !slot.buy_now_price || at >= slot.closes_at) throw new MarketError('Buy now is not available for this slot.')
  const open = await db.query(`select 1 from deals where slot_id = $1 and buyer_id = $2 and kind = 'buy_now' and status = 'awaiting_seller'`, [slot.id, a.buyerId])
  if (open.rowCount) throw new MarketError('You already have a buy-now request on this slot.')
  await assertMarketOpen(db, slot, at)
  const tag = await tagFor(db, a, a.buyerId, Number(slot.buy_now_price))
  await requireBrief(db, slot, a.buyerId, a.brief, tag.client)
  const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'buy_now', amount: slot.buy_now_price, brief: a.brief, campaignId: tag.campaignId, clientId: tag.clientId }, at)
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

/**
 * Fixed price, book now: the first buyer to book takes the slot off sale at once (nobody else can book it while the publisher
 * decides). The publisher confirms within its window, or the placement confirms bookings automatically.
 */
export async function bookFixed(db: Db, a: { slotId: string; buyerId: string; brief?: unknown; campaignId?: string; clientId?: string }, at: Date) {
  const slot = await lockSlot(db, a.slotId)
  if (slot.sale_type !== 'fixed') throw new MarketError('This slot is not sold at a fixed price.')
  if (slot.status !== 'open' || at >= slot.closes_at) throw new MarketError('Someone has just booked this slot, or it is no longer on sale.')
  await assertMarketOpen(db, slot, at)
  const tag = await tagFor(db, a, a.buyerId, Number(slot.starting_price))
  await requireBrief(db, slot, a.buyerId, a.brief, tag.client)
  const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'book', amount: slot.starting_price, brief: a.brief, campaignId: tag.campaignId, clientId: tag.clientId }, at)
  await db.query(`update slots set status = 'awaiting_seller' where id = $1`, [slot.id])
  const deal = await openDeal(db, { ...slot, status: 'awaiting_seller' }, bid, 'fixed', `buyer:${a.buyerId}`, at)
  if (slot.auto_accept) return accept(db, deal.id, 'system:auto-accept', at)
  return deal
}

/** Quick sale: a buyer shows interest (optionally an offer, never below the floor). */
export async function showInterest(db: Db, a: { slotId: string; buyerId: string; amount?: number; brief?: unknown; campaignId?: string; clientId?: string }, at: Date) {
  const slot = await lockSlot(db, a.slotId)
  if (slot.status !== 'open' || slot.sale_type !== 'quick_sale') throw new MarketError('This slot is not a quick sale.')
  await assertMarketOpen(db, slot, at)
  const amount = a.amount ?? slot.starting_price
  if (amount < slot.starting_price) throw new MarketError(`Offers cannot be below ${aed(slot.starting_price)}.`)
  const tag = await tagFor(db, a, a.buyerId, Number(amount))
  await requireBrief(db, slot, a.buyerId, a.brief, tag.client)
  // a second interest from the same buyer replaces the first (a new offer or brief), so the publisher sees one line per buyer
  await db.query(`update bids set status = 'withdrawn' where slot_id = $1 and buyer_id = $2 and kind = 'interest' and status = 'active'`, [slot.id, a.buyerId])
  const bid = await insertBid(db, slot, { buyerId: a.buyerId, kind: 'interest', amount, brief: a.brief, campaignId: tag.campaignId, clientId: tag.clientId }, at)
  // The publisher hears at once: the interest is a request waiting on them (it shows in their inbox until bidding closes).
  const { outlet, seller } = await one(db, `select o.name outlet, o.company_id seller from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  await notify(db, seller, 'interest.received', null, { slotId: slot.id, outlet, label: slot.label, amount }, at)
  return bid
}

/** Bidding closed on a quick sale nobody accepted: the interested buyers are told it did not go ahead. */
export async function expireInterests(db: Db, slotId: string, at: Date) {
  const slot = await lockSlot(db, slotId)
  const gone = (await db.query(`update bids set status = 'not_selected' where slot_id = $1 and kind = 'interest' and status = 'active' returning buyer_id`, [slot.id])).rows
  const { outlet } = await one(db, `select o.name outlet from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  for (const b of gone) await notify(db, b.buyer_id, 'interest.expired', null, { slotId: slot.id, outlet, label: slot.label }, at)
  return gone.length
}

/** The seller accepts one quick-sale interest; everyone else is told the slot has gone. */
export async function acceptInterest(db: Db, bidId: string, actor: string, at: Date) {
  const { slot_id } = await one(db, `select slot_id from bids where id = $1`, [bidId])
  const slot = await lockSlot(db, slot_id)
  const bid = await one(db, `select * from bids where id = $1 for update`, [bidId]) // read again under the slot lock: it may have been replaced
  if (slot.status !== 'open' || bid.kind !== 'interest' || bid.status !== 'active' || at >= slot.closes_at) throw new MarketError('This interest can no longer be accepted.')
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
  // The winner hears at once; the others learn bidding closed (they may still be offered the slot if the publisher passes).
  const { outlet } = await one(db, `select o.name outlet from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
  await notify(db, bid.buyer_id, 'bid.won', deal.id, { slotId: slot.id, outlet, label: slot.label, amount: bid.amount }, at)
  for (const b of (await db.query(`select distinct buyer_id from bids where slot_id = $1 and buyer_id <> $2 and status <> 'withdrawn'`, [slot.id, bid.buyer_id])).rows)
    await notify(db, b.buyer_id, 'bid.closed_lost', null, { slotId: slot.id, outlet, label: slot.label, amount: bid.amount }, at)
  if (slot.auto_accept && slot.reserve_price && bid.amount >= slot.reserve_price) return accept(db, deal.id, 'system:auto-accept', at)
  return deal
}

/**
 * Breaks, "any break" and the package on the same airing exclude each other. Recomputed from the booked slots
 * every time, so a lapsed booking releases what it held.
 */
export async function refreshConflicts(db: Db, slot: any, at: Date) {
  // ponytail: an accepted "any break" only holds the package; assigning the actual break is the seller's job in fulfilment (C1).
  const group = [slot.placement_id, slot.air_date]
  // released slots whose bidding already closed come back as a quick sale, like a relist
  for (const h of (await db.query(`select id from slots where placement_id = $1 and air_date = $2 and status = 'held'`, group)).rows) await reopen(db, h.id, at)
  const booked = (await db.query(`select kind from slots where placement_id = $1 and air_date = $2 and status = 'booked'`, group)).rows.map(r => r.kind)
  const hold = new Set<string>()
  if (booked.includes('package')) ['single', 'any'].forEach(k => hold.add(k))
  if (booked.includes('single') || booked.includes('any')) hold.add('package')
  const held = hold.size ? (await db.query(`update slots set status = 'held' where placement_id = $1 and air_date = $2 and status = 'open' and kind = any($3) returning id`, [...group, [...hold]])).rows : []
  // no single breaks left → "any break" can no longer be honoured
  held.push(...(await db.query(`update slots set status = 'held' where placement_id = $1 and air_date = $2 and kind = 'any' and status = 'open'
                  and not exists (select 1 from slots s where s.placement_id = $1 and s.air_date = $2 and s.kind = 'single' and s.status = 'open') returning id`, group)).rows)
  // whatever was waiting on a held slot ends now: open requests are superseded, bids released, and their buyers told
  for (const h of held) {
    for (const d of (await db.query(`select id, bid_id from deals where slot_id = $1 and status = 'awaiting_seller'`, [h.id])).rows) {
      await transition(db, d.id, 'supersede', 'system', at, 'An overlapping booking was accepted')
      await db.query(`update bids set status = 'not_selected' where id = $1`, [d.bid_id])
    }
    await releaseBids(db, h.id, at)
    await db.query(`update slots set top_bid_id = null, top_amount = null, top_buyer_id = null, top_max = null where id = $1`, [h.id])
  }
}

/** Bids that will never be taken up are released, and each buyer hears once (SPEC 11.1 #7: "not selected"). */
export async function releaseBids(db: Db, slotId: string, at: Date, except?: string) {
  await db.query(`update bids set status = 'not_selected' where slot_id = $1 and buyer_id = $2 and status in ('active', 'outbid')`, [slotId, except ?? null])
  const gone = (await db.query(`update bids set status = 'not_selected' where slot_id = $1 and status in ('active', 'outbid') returning buyer_id`, [slotId])).rows
  const buyers = [...new Set(gone.map(b => b.buyer_id as string))]
  if (!buyers.length) return
  const s = await one(db, `select s.label, o.name outlet from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where s.id = $1`, [slotId])
  for (const b of buyers) await notify(db, b, 'bid.not_selected', null, { slotId, outlet: s.outlet, label: s.label }, at)
}

/**
 * A slot comes back on sale (relist, or an overlapping booking fell through). If bidding already closed, it reopens as a quick sale
 * that closes 12 hours before the creative is due, so an accepted buyer still has time to pay; if that time has passed it is unsold
 * (a slot nobody can buy must not look open).
 */
async function reopen(db: Db, slotId: string, at: Date) {
  const s = await one(db, `select * from slots where id = $1`, [slotId])
  // a relisted quick sale is decided on the spot (the publisher accepts an interest), so it only needs half a day for the buyer to pay
  const latest = new Date(new Date(s.creative_due_at).getTime() - RELIST_PAY_HOURS * 3_600_000)
  if (new Date(s.closes_at) > at) return db.query(`update slots set status = 'open' where id = $1`, [slotId])
  if (latest <= at) return db.query(`update slots set status = 'unsold' where id = $1`, [slotId])
  await db.query(`update slots set status = 'open', sale_type = case when sale_type = 'auction' then 'quick_sale' else sale_type end, closes_at = $2 where id = $1`, [slotId, latest])
}

export async function accept(db: Db, dealId: string, actor: string, at: Date) {
  const pre = await one(db, `select * from deals where id = $1`, [dealId])
  const slot = await lockSlot(db, pre.slot_id)
  // never sell airtime twice: a slot held by an overlapping booking (or already booked) cannot be accepted again
  if (!['open', 'awaiting_seller'].includes(slot.status)) throw new MarketError('This slot is no longer available.')
  if (pre.status === 'awaiting_seller' && pre.next_deadline_at && new Date(pre.next_deadline_at) <= at) throw new MarketError('This request has expired.')
  const rates = await ratesFor(db, pre.seller_id, at) // frozen on the deal (brief section 3)
  await db.query(`update deals set commission_bp = $2, media_vat_bp = $3, fee_vat_bp = $4 where id = $1`,
    [dealId, rates.commissionBp, rates.mediaVatBp, rates.feeVatBp])
  const deal = await transition(db, dealId, 'accept', actor, at)
  await db.query(`update slots set status = 'booked' where id = $1`, [slot.id])
  await db.query(`update bids set status = 'selected' where id = $1`, [deal.bid_id])
  // Buy-now and quick sale end the sale for everyone else now. After an auction, the other bids stay valid
  // until payment is secured, so the seller can pick another one if this buyer does not pay (SPEC 11.1 #7).
  if (deal.kind === 'buy_now' || deal.kind === 'quick_sale') {
    const others = (await db.query(`update bids set status = 'not_selected' where slot_id = $1 and status in ('active', 'outbid') returning buyer_id, kind`, [slot.id])).rows
    const { outlet } = await one(db, `select o.name outlet from placements p join outlets o on o.id = p.outlet_id where p.id = $1`, [slot.placement_id])
    for (const b of others.filter(b => b.kind === 'interest' && b.buyer_id !== deal.buyer_id))
      await notify(db, b.buyer_id, 'interest.not_selected', null, { slotId: slot.id, outlet, label: slot.label }, at)
  }
  for (const other of (await db.query(`select id, bid_id from deals where slot_id = $1 and id <> $2 and status = 'awaiting_seller'`, [slot.id, dealId])).rows) {
    await transition(db, other.id, 'supersede', 'system', at, 'Another request was accepted')
    await db.query(`update bids set status = 'not_selected' where id = $1`, [other.bid_id]) // a superseded request can never be "chosen" later
  }
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
 * Counter offer (owner's brief): instead of accepting or declining a request, the publisher names another price. The request stays
 * with the publisher and keeps its deadline; the buyer agrees (the booking is accepted at that price) or keeps their offer.
 */
export async function counter(db: Db, dealId: string, amount: number, note: string | null, actor: string, at: Date) {
  const deal = await one(db, `select d.*, s.label, o.name outlet from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id
    join outlets o on o.id = p.outlet_id where d.id = $1 for update of d`, [dealId])
  if (deal.status !== 'awaiting_seller') throw new MarketError('Only a request waiting on you can get a counter offer.')
  if (deal.next_deadline_at && new Date(deal.next_deadline_at) <= at) throw new MarketError('This request has expired.')
  if (amount === Number(deal.amount)) throw new MarketError('A counter offer needs a different price. To take this price, accept the request.')
  const clean = note?.trim() || null
  await db.query(`update deals set counter_amount = $2, counter_note = $3, countered_at = $4 where id = $1`, [dealId, amount, clean, at])
  await db.query(`insert into deal_events (deal_id, at, event, from_status, to_status, actor, note) values ($1, $2, 'counter', $3, $3, $4, $5)`,
    [dealId, at, deal.status, actor, clean])
  await audit(db, actor, 'deal.countered', 'deal', dealId, { from: Number(deal.amount), to: amount }, at)
  await notify(db, deal.buyer_id, 'deal.countered', dealId, { outlet: deal.outlet, label: deal.label, amount, was: Number(deal.amount) }, at)
}

/** The buyer's answer to a counter offer: agree, and the booking is accepted at that price; or keep the first offer for the publisher to decide. */
export async function answerCounter(db: Db, dealId: string, buyerId: string, agree: boolean, actor: string, at: Date) {
  const deal = await one(db, `select * from deals where id = $1 and buyer_id = $2 for update`, [dealId, buyerId])
  if (deal.status !== 'awaiting_seller' || deal.counter_amount == null) throw new MarketError('There is no counter offer to answer.')
  const amount = Number(deal.counter_amount)
  await db.query(`update deals set counter_amount = null, counter_note = null, countered_at = null${agree ? ', amount = $2' : ''} where id = $1`,
    agree ? [dealId, amount] : [dealId])
  await db.query(`insert into deal_events (deal_id, at, event, from_status, to_status, actor, note) values ($1, $2, $3, $4, $4, $5, null)`,
    [dealId, at, agree ? 'counter_agreed' : 'counter_refused', deal.status, actor])
  if (!agree) {
    await audit(db, actor, 'deal.counter_refused', 'deal', dealId, { amount }, at)
    await notify(db, deal.seller_id, 'deal.counter_refused', dealId, { amount, was: Number(deal.amount) }, at)
    return
  }
  if (deal.client_id && amount > Number(deal.amount)) { // a client whose budget is set to stop still refuses what would take it over
    const client = await one(db, `select * from clients where id = $1 for update`, [deal.client_id])
    if (client.budget != null && client.budget_stop) {
      const { used } = await one(db, `select coalesce(sum(amount), 0)::bigint used from deals where client_id = $1 and status in ${BOOKED}`, [deal.client_id])
      if (Number(used) > Number(client.budget))
        throw new MarketError(`This would take ${client.name} over its budget: ${aed(Math.max(0, Number(client.budget) - Number(used) + amount))} is left.`)
    }
  }
  await audit(db, actor, 'deal.counter_agreed', 'deal', dealId, { from: Number(deal.amount), to: amount }, at)
  await notify(db, deal.seller_id, 'deal.counter_agreed', dealId, { amount }, at)
  return accept(db, dealId, actor, at)
}

/**
 * After a decline, expiry or lapse (owner feedback, SPEC 11.1 #7): a refused buy-now request just ends and the auction carries on;
 * an accepted buy-now or quick sale that is not paid is relisted.
 * Otherwise the seller may choose any remaining bid within their window, at most `max_choice_rounds` times, then the slot is relisted.
 */
export async function afterNoGo(db: Db, deal: any, at: Date) {
  const slot = await lockSlot(db, deal.slot_id)
  await db.query(`update bids set status = 'not_selected' where id = $1`, [deal.bid_id])
  // a buy-now request refused, expired or cancelled while the auction is still open: the auction carries on untouched
  if (deal.kind === 'buy_now' && (deal.status === 'declined' || slot.status === 'open')) return
  // a buyer who did not go ahead is out of this slot altogether: none of their earlier bids can be chosen later
  await db.query(`update bids set status = 'not_selected' where slot_id = $1 and buyer_id = $2 and status in ('active', 'outbid')`, [slot.id, deal.buyer_id])
  await db.query(`update slots set status = 'awaiting_seller' where id = $1`, [slot.id]) // no longer booked
  await refreshConflicts(db, slot, at)
  if (deal.kind === 'buy_now' || deal.kind === 'quick_sale' || deal.kind === 'fixed') return relist(db, slot.id, at) // back on sale for the next buyer
  const remaining = await db.query(`select 1 from bids where slot_id = $1 and status in ('active', 'outbid') and buyer_id <> $2 limit 1`, [slot.id, deal.buyer_id])
  // round 1 is the original winner; the seller may then choose another bid up to max_choice_rounds times
  const window = await setting<number>(db, 'seller_window_hours', at)
  // another round only if the next buyer could still pay before the creative is due (SPEC G8/G9: never past the creative deadline)
  const tooLate = at.getTime() + (window + MIN_PAY_HOURS) * 3_600_000 > new Date(slot.creative_due_at).getTime()
  if (slot.round > await setting<number>(db, 'max_choice_rounds', at) || !remaining.rowCount || tooLate) return relist(db, slot.id, at)
  await db.query(`update slots set status = 'awaiting_choice', choice_deadline_at = $2 where id = $1`, [slot.id, new Date(at.getTime() + window * 3_600_000)])
}

/** The seller picks a remaining bid. Choosing it is accepting it, so the buyer is asked to pay straight away. */
export async function chooseBid(db: Db, slotId: string, bidId: string, actor: string, at: Date) {
  const slot = await lockSlot(db, slotId)
  const bid = await one(db, `select * from bids where id = $1`, [bidId])
  if (slot.status !== 'awaiting_choice' || bid.slot_id !== slot.id || !['active', 'outbid'].includes(bid.status))
    throw new MarketError('This bid cannot be chosen.')
  if (at.getTime() + MIN_PAY_HOURS * 3_600_000 > new Date(slot.creative_due_at).getTime())
    throw new MarketError('It is too close to the creative deadline for another buyer to pay. The slot will be relisted.')
  await db.query(`update slots set status = 'awaiting_seller', round = round + 1, choice_deadline_at = null where id = $1`, [slot.id])
  // Bidders above the chosen one were skipped: tell them now.
  const skipped = (await db.query(`update bids set status = 'not_selected' where slot_id = $1 and status in ('active', 'outbid') and amount > $2 and id <> $3 and buyer_id <> $4
      returning buyer_id`, [slot.id, bid.amount, bid.id, bid.buyer_id])).rows
  for (const b of new Set(skipped.map(x => x.buyer_id as string))) await notify(db, b, 'bid.not_selected', null, { slotId: slot.id, label: slot.label }, at)
  const deal = await openDeal(db, { ...slot, status: 'awaiting_seller' }, bid, 'choice', actor, at)
  return accept(db, deal.id, actor, at)
}

/** ponytail: relisting reopens the slot as a quick sale at its starting price; the owner may prefer another rule. */
export async function relist(db: Db, slotId: string, at: Date) {
  await releaseBids(db, slotId, at)
  await db.query(`update slots set sale_type = case when sale_type = 'auction' then 'quick_sale' else sale_type end, choice_deadline_at = null,
                  top_bid_id = null, top_amount = null, top_buyer_id = null, top_max = null where id = $1`, [slotId])
  await reopen(db, slotId, at)
  await audit(db, 'system', 'slot.relisted', 'slot', slotId, null, at)
}

/** The shortest payment window worth offering a buyer (SPEC G9: under this, don't ask anyone to pay). */
const MIN_PAY_HOURS = 4
const RELIST_PAY_HOURS = 12
