import type pg from 'pg'
import { companyLogoUrl } from './routes-covers.js'

/*
 * A company's business profile as the other side of a deal sees it before purchase (owner decision, 8 Nov):
 * who they are and their record on Nashr, never contact details (no emails, phones or people's names), so side deals stay hard.
 * Record figures appear only once there is enough history to mean something (SPEC 12.1 "hide data we don't have").
 */
export type CompanyProfile = {
  name: string; logoUrl: string | null; type: 'brand' | 'agency' | 'publisher'; industry: string | null; website: string | null; about: string | null
  memberSince: string; verified: true; taxRegistered: boolean; vatRegistered: boolean
  record: { completed: number; payRate?: number; acceptRate?: number; rating?: { average: number; count: number } }
  outlets?: string[]
}

const DONE = `('released', 'paid_out', 'complete')`

export async function companyProfile(db: pg.PoolClient, companyId: string): Promise<CompanyProfile | null> {
  const c = (await db.query(`select c.*, (select r.company_type from access_requests r join users u on lower(u.email) = lower(r.email)
      where u.company_id = c.id and r.status = 'approved' limit 1) applied_as from companies c where c.id = $1`, [companyId])).rows[0]
  if (!c) return null
  const publisher = c.type === 'publisher'
  const profile: CompanyProfile = {
    name: c.name, logoUrl: companyLogoUrl(c.id, c.logo_key), type: publisher ? 'publisher' : c.applied_as === 'agency' ? 'agency' : 'brand', industry: c.industry, website: c.website, about: c.about,
    memberSince: c.created_at, verified: true, taxRegistered: !!c.trn, vatRegistered: !!c.vat_registered, record: { completed: 0 },
  }
  if (publisher) {
    const r = (await db.query(`select count(*) filter (where status in ${DONE})::int completed,
        count(*) filter (where accepted_at is not null)::int accepted,
        count(*) filter (where accepted_at is not null or status = 'declined')::int decided
      from deals where seller_id = $1`, [companyId])).rows[0]
    const rating = (await db.query(`select round(avg(r.score)::numeric, 1)::float average, count(*)::int count from ratings r
      join outlets o on o.id = r.outlet_id where o.company_id = $1 and not r.hidden`, [companyId])).rows[0]
    profile.record = { completed: r.completed, ...(r.decided >= 5 ? { acceptRate: Math.round(100 * r.accepted / r.decided) } : {}),
      ...(rating.count >= 3 ? { rating } : {}) }
    profile.outlets = (await db.query(`select name from outlets where company_id = $1 order by name`, [companyId])).rows.map(o => o.name)
  } else {
    const r = (await db.query(`select count(*) filter (where status in ${DONE})::int completed,
        count(*) filter (where accepted_at is not null)::int accepted,
        count(*) filter (where accepted_at is not null and status not in ('lapsed', 'awaiting_payment'))::int paid
      from deals where buyer_id = $1`, [companyId])).rows[0]
    // the industry a buyer last advertised in, when its profile does not say
    if (!profile.industry) profile.industry = (await db.query(`select b.brief->>'industry' i from bids b where b.buyer_id = $1 and b.brief ? 'industry'
      order by b.created_at desc limit 1`, [companyId])).rows[0]?.i ?? null
    profile.record = { completed: r.completed, ...(r.accepted >= 3 ? { payRate: Math.round(100 * r.paid / r.accepted) } : {}) }
  }
  return profile
}
