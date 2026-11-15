import type { Db } from '../core/db.js'
import { clientLogoUrl } from './routes-covers.js'

/**
 * What a seller sees of a bid's brief before deciding (owner's buyer-side fixes, round 2: "a seller never accepts something blind"):
 * the advertiser (the client's name and logo when there is one), industry, what the ad will say, language, the creative itself and
 * any required disclaimer. Never the buyer's budget, campaign name, dates or objective.
 */
export async function briefForSeller(db: Db, brief: any, clientId: string | null) {
  if (!brief) return null
  const client = clientId ? (await db.query(`select id, name, logo_key from clients where id = $1`, [clientId])).rows[0] : null
  const key = typeof brief.draftFileKey === 'string' && brief.draftFileKey.startsWith('files/') ? brief.draftFileKey.slice(6) : null
  const file = key && /^[0-9a-f-]{36}$/i.test(key) ? (await db.query(`select id, name, type, size from files where id = $1`, [key])).rows[0] : null
  return {
    advertiser: brief.advertiser ?? null, industry: brief.industry ?? null, message: brief.message ?? null,
    language: brief.language ?? null, languageOther: brief.languageOther ?? null, landingUrl: brief.landingUrl ?? null,
    notes: brief.notes ?? null, disclaimer: brief.disclaimer ?? null,
    client: client ? { name: client.name, logoUrl: clientLogoUrl(client.id, client.logo_key) } : null,
    creative: file ? { fileId: file.id, name: file.name, type: file.type, size: Number(file.size) } : null,
  }
}
