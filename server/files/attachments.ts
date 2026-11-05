import type { Db } from '../core/db.js'
import { MarketError } from '../marketplace/market.js'

/**
 * Proof items, issue evidence and corrected proof are free JSON that may point at uploads ("files/<id>").
 * A party may only attach files their own company uploaded; otherwise attaching would let them read the other side's files.
 */
export async function assertOwnFiles(db: Db, value: unknown, companyId: string) {
  const ids = [...new Set(JSON.stringify(value ?? null).match(/files\/[0-9a-f-]{36}/gi) ?? [])].map(k => k.slice(6))
  if (!ids.length) return
  const { rows } = await db.query(`select id from files where id = any($1::uuid[]) and company_id = $2`, [ids, companyId])
  if (rows.length !== ids.length) throw new MarketError('Attach only files your own company uploaded.')
}
