import { type Db, one } from '../core/db.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { MarketError } from '../marketplace/market.js'

/**
 * Pre-run check (brief 12A-A): about 48 hours before air the seller confirms the slot and the creative and the buyer
 * confirms the final version. Problems found now can be fixed; after the run they become disputes.
 */
export async function requestPreRunChecks(db: Db, at: Date) {
  const lead = await setting<number>(db, 'prerun_hours', at)
  const { rows } = await db.query(
    `insert into prerun_checks (deal_id, requested_at)
     select d.id, $1 from deals d join slots s on s.id = d.slot_id
     where d.status = 'secured' and coalesce(d.make_good_at, s.starts_at) - make_interval(hours => $2) <= $1
       and coalesce(d.make_good_at, s.starts_at) > $1
     on conflict do nothing returning deal_id`, [at, lead])
  for (const r of rows) {
    const d = await one(db, `select buyer_id, seller_id from deals where id = $1`, [r.deal_id])
    await notify(db, d.seller_id, 'prerun.confirm_slot_and_creative', r.deal_id, null, at)
    await notify(db, d.buyer_id, 'prerun.confirm_final_version', r.deal_id, null, at)
  }
  return rows.length
}

export async function confirmPreRun(db: Db, dealId: string, companyId: string, at: Date) {
  const d = await one(db, `select buyer_id, seller_id from deals where id = $1`, [dealId])
  const col = companyId === d.seller_id ? 'seller_confirmed_at' : companyId === d.buyer_id ? 'buyer_confirmed_at' : null
  if (!col) throw new MarketError('This booking is not yours.')
  const r = await db.query(`update prerun_checks set ${col} = $2 where deal_id = $1`, [dealId, at])
  if (!r.rowCount) throw new MarketError('The pre-run check is not open yet.')
}
