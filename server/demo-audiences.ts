import type { Db } from './core/db.js'

/**
 * Who each demo outlet reaches, so every audience on the public Audiences pages has open slots to show. Used by the seed and by
 * scripts/demo-audiences.ts (to update a server that was seeded before). Touches only these five demo outlets, by name.
 */
export const DEMO_AUDIENCES: [string, string[]][] = [
  ['Skyline FM', ['commuters', 'young_professionals', 'affluent_expats', 'parents']],
  ['Dubai One TV', ['arabic_families', 'affluent_expats', 'sports_fans', 'parents']],
  ['Gulf News', ['executives', 'property_investors', 'affluent_expats', 'south_asian_community', 'luxury_shoppers']],
  ['Khaleej Times', ['executives', 'tech_adopters', 'young_professionals', 'south_asian_community', 'luxury_shoppers']],
  ['The Majlis Podcast', ['executives', 'young_professionals', 'students']],
]

export async function applyDemoAudiences(db: Db) {
  let n = 0
  for (const [name, audiences] of DEMO_AUDIENCES) n += (await db.query(`update outlets set audiences = $2 where name = $1`, [name, audiences])).rowCount ?? 0
  return n
}
