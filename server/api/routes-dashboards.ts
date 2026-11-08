import type { RouteFn } from './app.js'
import type { Db } from '../core/db.js'
import { split } from '../core/money.js'
import { balance } from '../payments/ledger.js'

/*
 * One request per dashboard. Weeks are Dubai weeks (Monday start); money is in fils, excluding VAT unless a field says otherwise.
 * "Booked value" is the price of bookings paid in the period (when the money arrived), never bids or unpaid requests.
 */
const WEEKS = 12
const PAID_LIST = ['secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out']
const PAID = `(${PAID_LIST.map(s => `'${s}'`).join(', ')})`
const DUBAI = (col: string) => `(${col} at time zone 'Asia/Dubai')`

/** A 12-week series: `inner` must select (ts timestamptz, v bigint). Missing weeks are zero. */
async function weekly(db: Db, inner: string, params: unknown[], at: Date) {
  const n = params.length + 1
  const { rows } = await db.query(`with w as (select generate_series(date_trunc('week', ${DUBAI(`$${n}::timestamptz`)}) - interval '${WEEKS - 1} weeks',
      date_trunc('week', ${DUBAI(`$${n}::timestamptz`)}), interval '1 week') wk)
    select to_char(w.wk, 'YYYY-MM-DD') week, coalesce(sum(x.v), 0)::bigint v from w left join (${inner}) x on date_trunc('week', ${DUBAI('x.ts')}) = w.wk
    group by w.wk order by w.wk`, [...params, at])
  return rows.map(r => ({ week: r.week as string, value: Number(r.v) }))
}

/** The last 30 days vs the 30 days before (fair on any day of the month), from a series of (ts, v). */
async function monthCompare(db: Db, inner: string, params: unknown[], at: Date) {
  const p = `$${params.length + 1}::timestamptz`
  const r = (await db.query(`select
      coalesce(sum(v) filter (where ts > ${p} - interval '30 days' and ts <= ${p}), 0)::bigint cur,
      coalesce(sum(v) filter (where ts > ${p} - interval '60 days' and ts <= ${p} - interval '30 days'), 0)::bigint prev
    from (${inner}) x`, [...params, at])).rows[0]
  return { last30: Number(r.cur), prev30: Number(r.prev) }
}

const payEvents = (where: string) => `select e.at ts, d.amount v from deal_events e join deals d on d.id = e.deal_id where e.event = 'pay' and ${where}`
const SLOT_JOIN = `join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id`

export function dashboardRoutes(route: RouteFn) {
  // ------------------------------------------------------------------ buyer
  route('GET', '/api/buyer/dashboard', ['buyer'], async ({ db, at, me }) => {
    const id = me.actAs.companyId
    const spend = payEvents('d.buyer_id = $1')
    const deals = (await db.query(`select d.*, s.label, s.starts_at, s.creative_due_at, o.name outlet, o.channel,
        coalesce(d.media_vat_bp, 0) vat_bp from deals d ${SLOT_JOIN} where d.buyer_id = $1`, [id])).rows
    const total = (d: any) => split(d.amount, { commissionBp: 0, mediaVatBp: d.vat_bp, feeVatBp: 0 }).buyerPays
    const held = deals.filter(d => ['secured', 'in_review', 'issue_open', 'disputed'].includes(d.status))
    const toPay = deals.filter(d => d.status === 'awaiting_payment')

    // Live bids: one row per slot this buyer bid on that is still open.
    const bids = (await db.query(`select s.id slot_id, s.label, s.starts_at, s.closes_at, s.top_amount, s.top_buyer_id = $1 leading, o.name outlet, o.channel,
        max(b.max_amount) your_max, max(b.amount) your_bid
      from bids b join slots s on s.id = b.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      where b.buyer_id = $1 and b.status in ('active', 'outbid') and s.status = 'open' and s.closes_at > $2
      group by s.id, o.name, o.channel order by s.closes_at`, [id, at])).rows

    // What needs the buyer: pay, send creative, review proof, answer an offer.
    const creativeOk = new Set((await db.query(`select distinct deal_id from creatives where status in ('approved', 'pending') and deal_id = any($1)`,
      [deals.map(d => d.id)])).rows.map(r => r.deal_id))
    const tasks = [
      ...toPay.map(d => ({ type: 'pay', dealId: d.id, label: `${d.outlet} · ${d.label}`, dueAt: d.next_deadline_at, amount: total(d) })),
      ...deals.filter(d => d.status === 'secured' && !creativeOk.has(d.id) && new Date(d.creative_due_at) > at)
        .map(d => ({ type: 'creative', dealId: d.id, label: `${d.outlet} · ${d.label}`, dueAt: d.creative_due_at })),
      ...deals.filter(d => d.status === 'in_review').map(d => ({ type: 'proof', dealId: d.id, label: `${d.outlet} · ${d.label}`, dueAt: d.next_deadline_at })),
      ...deals.filter(d => d.status === 'issue_open').map(d => ({ type: 'issue', dealId: d.id, label: `${d.outlet} · ${d.label}`, dueAt: d.next_deadline_at })),
    ].sort((a, b) => +new Date(a.dueAt ?? 8.64e15) - +new Date(b.dueAt ?? 8.64e15))

    const byChannel = (await db.query(`select o.channel, sum(d.amount)::bigint v, count(*)::int n from deals d ${SLOT_JOIN}
      where d.buyer_id = $1 and d.status in ${PAID} and s.starts_at > $2::timestamptz - interval '90 days' group by o.channel order by v desc`, [id, at])).rows
    const upcoming = deals.filter(d => ['awaiting_payment', 'secured'].includes(d.status) && new Date(d.starts_at) > at)
      .sort((a, b) => +a.starts_at - +b.starts_at).slice(0, 6)
    const outlets = new Set(deals.filter(d => PAID_LIST.includes(d.status)).map(d => d.outlet)).size
    return {
      heldNow: held.reduce((n, d) => n + total(d), 0), heldCount: held.length,
      spend: { weeks: await weekly(db, spend, [id], at), ...(await monthCompare(db, spend, [id], at)) },
      toPay: { count: toPay.length, amount: toPay.reduce((n, d) => n + total(d), 0), soonest: toPay.map(d => d.next_deadline_at).filter(Boolean).sort((a, b) => +a - +b)[0] ?? null },
      bids: { leading: bids.filter(b => b.leading).length, outbid: bids.filter(b => !b.leading).length,
        items: bids.slice(0, 6).map(b => ({ slotId: b.slot_id, outlet: b.outlet, channel: b.channel, label: b.label, startsAt: b.starts_at, closesAt: b.closes_at,
          topBid: Number(b.top_amount), yourMax: Number(b.your_max ?? b.your_bid), leading: b.leading })) },
      tasks: tasks.slice(0, 8), taskCount: tasks.length,
      byChannel: byChannel.map(r => ({ channel: r.channel, value: Number(r.v), count: r.n })),
      upcoming: upcoming.map(d => ({ dealId: d.id, outlet: d.outlet, channel: d.channel, label: d.label, startsAt: d.starts_at, status: d.status })),
      outlets, bookings: deals.filter(d => PAID_LIST.includes(d.status)).length,
      // Auctions won in the last week that still need a step: the publisher's confirmation, then payment.
      wins: deals.filter(d => d.kind === 'auction' && ['awaiting_seller', 'awaiting_payment'].includes(d.status) && +at - +d.created_at < 7 * 86_400_000)
        .sort((a, b) => +b.created_at - +a.created_at).slice(0, 3)
        .map(d => ({ dealId: d.id, outlet: d.outlet, label: d.label, amount: total(d), status: d.status, dueAt: d.next_deadline_at })),
    }
  })

  // ------------------------------------------------------------------ publisher
  route('GET', '/api/seller/dashboard', ['seller'], async ({ db, at, me }) => {
    const id = me.actAs.companyId
    // Earnings = payouts released to this publisher (after Nashr's commission), when they were released.
    const earned = `select at ts, amount v from ledger_entries where credit = 'seller_payable:' || $1::text`
    const booked = payEvents('d.seller_id = $1')
    const demand = (await db.query(`select count(*)::int bids_7d, count(distinct b.buyer_id)::int buyers_7d
      from bids b join slots s on s.id = b.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      where o.company_id = $1 and b.created_at > $2::timestamptz - interval '7 days'`, [id, at])).rows[0]
    const buyers30 = (await db.query(`select count(distinct d.buyer_id)::int n from deals d where d.seller_id = $1 and d.created_at > $2::timestamptz - interval '30 days'`, [id, at])).rows[0].n
    // Price lift: how far paid auction prices went above the starting price (last 90 days).
    const lift = (await db.query(`select avg(d.amount::float / s.starting_price - 1) lift, count(*)::int n from deals d join slots s on s.id = d.slot_id
      where d.seller_id = $1 and d.kind = 'auction' and d.status in ${PAID} and s.starts_at > $2::timestamptz - interval '90 days'`, [id, at])).rows[0]
    const decisions = (await db.query(`select count(*) filter (where e.event = 'accept')::int accepted, count(*) filter (where e.event = 'decline')::int declined,
        percentile_cont(0.5) within group (order by extract(epoch from (e.at - o.at)) / 3600) filter (where e.event in ('accept', 'decline')) median_hours
      from deal_events e join deals d on d.id = e.deal_id join deal_events o on o.deal_id = d.id and o.event = 'opened'
      where d.seller_id = $1 and e.event in ('accept', 'decline') and e.at > $2::timestamptz - interval '90 days'`, [id, at])).rows[0]
    // Next four weeks of inventory: sold, waiting, still on sale.
    const inventory = (await db.query(`select s.status, count(*)::int n from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      where o.company_id = $1 and s.kind = 'single' and s.starts_at > $2 and s.starts_at < $2::timestamptz + interval '28 days' group by s.status`, [id, at])).rows
    const inv = Object.fromEntries(inventory.map(r => [r.status, r.n]))
    const placements = (await db.query(`select p.name placement, o.name outlet, sum(d.amount)::bigint v, count(*)::int n from deals d ${SLOT_JOIN}
      where d.seller_id = $1 and d.status in ${PAID} and s.starts_at > $2::timestamptz - interval '90 days' group by p.name, o.name order by v desc limit 5`, [id, at])).rows
    const buyers = (await db.query(`select c.name, sum(d.amount)::bigint v, count(*)::int n from deals d join companies c on c.id = d.buyer_id
      where d.seller_id = $1 and d.status in ${PAID} and d.created_at > $2::timestamptz - interval '90 days' group by c.name order by v desc limit 5`, [id, at])).rows
    return {
      earnings: { weeks: await weekly(db, earned, [id], at), ...(await monthCompare(db, earned, [id], at)) },
      booked: { weeks: await weekly(db, booked, [id], at), ...(await monthCompare(db, booked, [id], at)) },
      available: 0 - await balance(db, `seller_payable:${id}`, 'AED'),
      demand: { bids7d: demand.bids_7d, buyers7d: demand.buyers_7d, buyers30d: buyers30, priceLift: lift.n ? Number(lift.lift) : null, auctions: lift.n },
      decisions: { accepted: decisions.accepted, declined: decisions.declined, medianHours: decisions.median_hours == null ? null : Number(decisions.median_hours) },
      inventory: { sold: (inv.booked ?? 0) + (inv.held ?? 0), waiting: (inv.awaiting_seller ?? 0) + (inv.awaiting_choice ?? 0), open: inv.open ?? 0,
        unsold: inv.unsold ?? 0, blocked: inv.blocked ?? 0 },
      topPlacements: placements.map(r => ({ label: `${r.placement}`, outlet: r.outlet, value: Number(r.v), count: r.n })),
      topBuyers: buyers.map(r => ({ label: r.name, value: Number(r.v), count: r.n })),
    }
  })

  // ------------------------------------------------------------------ Nashr
  route('GET', '/api/admin/dashboard', ['admin'], async ({ db, at }) => {
    const gmv = payEvents('true')
    const commission = `select at ts, amount v from ledger_entries where credit = 'nashr_revenue'`
    // Funnel: bookings opened in the last 30 days, and how far each got.
    const f = (await db.query(`select count(*)::int opened,
        count(*) filter (where exists (select 1 from deal_events e where e.deal_id = d.id and e.event = 'accept'))::int accepted,
        count(*) filter (where exists (select 1 from deal_events e where e.deal_id = d.id and e.event = 'pay'))::int paid,
        count(*) filter (where d.status in ('released', 'paid_out'))::int released
      from deals d where d.created_at > $1::timestamptz - interval '30 days'`, [at])).rows[0]
    const byChannel = (await db.query(`select o.channel, sum(d.amount)::bigint v, count(*)::int n from deals d ${SLOT_JOIN}
      where d.status in ${PAID} and s.starts_at > $1::timestamptz - interval '90 days' group by o.channel order by v desc`, [at])).rows
    const top = (side: 'seller_id' | 'buyer_id') => db.query(`select c.name, sum(d.amount)::bigint v, count(*)::int n from deals d join companies c on c.id = d.${side}
      where d.status in ${PAID} and d.created_at > $1::timestamptz - interval '90 days' group by c.name order by v desc limit 5`, [at])
    const live = (await db.query(`select count(*) filter (where s.status = 'open')::int open_slots,
        count(*) filter (where s.status = 'open' and s.top_amount is not null)::int with_bids,
        (select count(*)::int from bids b where b.created_at > $1::timestamptz - interval '7 days') bids_7d,
        (select count(distinct b.buyer_id)::int from bids b where b.created_at > $1::timestamptz - interval '30 days') active_buyers
      from slots s where s.closes_at > $1`, [at])).rows[0]
    const liability = async (acct: string) => 0 - await balance(db, acct, 'AED')
    const gm = await monthCompare(db, gmv, [], at), cm = await monthCompare(db, commission, [], at)
    return {
      gmv: { weeks: await weekly(db, gmv, [], at), ...gm },
      commission: { weeks: await weekly(db, commission, [], at), ...cm },
      // Commission over the price of the same released bookings (90 days), so timing never skews it.
      takeRate: (await db.query(`select sum(l.amount)::float / nullif(sum(d.amount), 0) r from ledger_entries l join deals d on d.id = l.deal_id
        where l.credit = 'nashr_revenue' and l.at > $1::timestamptz - interval '90 days'`, [at])).rows[0].r,
      funnel: [['Requested or won', f.opened], ['Accepted by publisher', f.accepted], ['Paid', f.paid], ['Released', f.released]].map(([label, value]) => ({ label, value })),
      byChannel: byChannel.map(r => ({ channel: r.channel, value: Number(r.v), count: r.n })),
      topPublishers: (await top('seller_id')).rows.map(r => ({ label: r.name, value: Number(r.v), count: r.n })),
      topBuyers: (await top('buyer_id')).rows.map(r => ({ label: r.name, value: Number(r.v), count: r.n })),
      live: { openSlots: live.open_slots, withBids: live.with_bids, bids7d: live.bids_7d, activeBuyers: live.active_buyers },
      money: { held: await liability('held'), owedToPublishers: (await db.query(`select coalesce(sum(case when credit like 'seller_payable:%' then amount else -amount end), 0)::bigint n
          from ledger_entries where credit like 'seller_payable:%' or debit like 'seller_payable:%'`)).rows[0].n * 1,
        revenue: await liability('nashr_revenue'), vat: await liability('vat_payable'), fees: await balance(db, 'processing_fees', 'AED') },
    }
  })
}
