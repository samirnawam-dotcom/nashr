import type { Db } from '../core/db.js'
import { notify } from '../core/notify.js'
import { matches, type SlotFilter } from '../shared/slot-filter.js'
import { AUDIENCES_SQL } from './search.js'

const OPEN_MARKET = `(select value from settings where key = 'open_markets' order by valid_from desc limit 1) ? o.market`

/**
 * Saved-search alerts: each search with alerts on gets one notification per run that found new matching slots
 * ("3 new slots match Radio mornings"), never one per slot. Only slots listed since the search last checked count,
 * so a search never alerts for what the buyer could already see when they saved it. Matching uses the calendar's own rules.
 */
export async function sendSearchAlerts(db: Db, at: Date) {
  const searches = (await db.query(`select * from saved_searches where alerts and checked_at < $1 order by checked_at for update skip locked`, [at])).rows
  if (!searches.length) return 0
  const since = searches.reduce((m, s) => s.checked_at < m ? s.checked_at : m, searches[0].checked_at)
  const slots = (await db.query(
    `select s.*, p.name placement, brand_name(o) outlet, o.channel, o.sectors, o.audience, ${AUDIENCES_SQL} audiences from slots s
       join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
     where s.listed_at > $1 and s.listed_at <= $2 and s.status = 'open' and s.closes_at > $2 and ${OPEN_MARKET}`, [since, at])).rows
    .map(r => ({ listedAt: r.listed_at as Date, starts: r.starts_at as Date, slot: { outlet: r.outlet, placement: r.placement, channel: r.channel, saleType: r.sale_type,
      sectors: r.sectors, audience: r.audience, audiences: r.audiences, startsAt: r.starts_at.toISOString(), endsAt: r.ends_at?.toISOString() ?? null,
      closesAt: r.closes_at.toISOString(), startingPrice: r.starting_price, topBid: r.top_amount } }))
  let sent = 0
  for (const s of searches) {
    const hits = slots.filter(x => x.listedAt > s.checked_at && matches(s.filter as SlotFilter, x.slot, at.getTime()))
    if (hits.length) {
      const first = hits.reduce((a, b) => (b.starts < a.starts ? b : a))
      await notify(db, s.company_id, 'search.match', null, { searchId: s.id, name: s.name, count: hits.length, firstAt: first.starts }, at)
      sent++
    }
    await db.query(`update saved_searches set checked_at = $2 where id = $1`, [s.id, at])
  }
  return sent
}
