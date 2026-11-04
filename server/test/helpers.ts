import { pool } from '../core/db.js'

export async function reset() {
  await pool.query(`truncate deal_events, deals, bids, slots, placements, outlets, companies, provider_events restart identity cascade`)
}
