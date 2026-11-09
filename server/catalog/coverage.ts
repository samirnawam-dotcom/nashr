import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { MarketError } from '../marketplace/market.js'
import { containsContactDetails } from '../core/contact.js'
import { createPlacement, generateSlots } from './placements.js'
import { COVERAGE_DELIVERABLES, COVERAGE_KINDS, COVERAGE_PLATFORMS, COVERAGE_SOCIAL, coverageProblems, coverageTotal, type CoverageData } from '../shared/coverage.js'

/*
 * Media coverage submissions: a publisher drafts and submits; Nashr's team approves, asks for changes or rejects.
 * Approval puts it on sale as a product (one slot on each coverage date) at the total price.
 */
const dubaiToday = (at: Date) => new Date(at.getTime() + 4 * 3_600_000).toISOString().slice(0, 10)
const label = (list: readonly (readonly [string, string])[], keys: string[] = []) => keys.map(k => list.find(x => x[0] === k)?.[1] ?? k)

/** Buyers see what the publisher wrote, never contact details (brief section 6); the internal notes stay with Nashr. */
function checkText(d: CoverageData) {
  if (containsContactDetails([d.name, d.episode, d.venue, d.angle, d.description, d.audienceProfile, d.deliverablesOther, d.sponsorship].filter(Boolean).join(' \n ')))
    throw new MarketError('Emails and phone numbers are not allowed in what buyers see.')
}

export async function saveCoverage(db: Db, a: { id?: string; companyId: string; userId: string; outletId: string; data: CoverageData }, at: Date) {
  const outlet = (await db.query(`select id from outlets where id = $1 and company_id = $2`, [a.outletId, a.companyId])).rows[0]
  if (!outlet) throw new MarketError('Choose one of your outlets.')
  checkText(a.data)
  if (!a.id) {
    const r = await one(db, `insert into coverage_submissions (company_id, outlet_id, data, created_by, created_at, updated_at) values ($1, $2, $3, $4, $5, $5) returning id`,
      [a.companyId, a.outletId, JSON.stringify(a.data), a.userId, at])
    await audit(db, `user:${a.userId}`, 'coverage.drafted', 'coverage', r.id, null, at)
    return r.id as string
  }
  const r = await db.query(`update coverage_submissions set outlet_id = $3, data = $4, updated_at = $5
    where id = $1 and company_id = $2 and status in ('draft', 'changes_requested')`, [a.id, a.companyId, a.outletId, JSON.stringify(a.data), at])
  if (!r.rowCount) throw new MarketError('This submission is with Nashr or already decided, so it cannot be changed.')
  return a.id
}

export async function submitCoverage(db: Db, id: string, companyId: string, userId: string, at: Date) {
  const c = (await db.query(`select * from coverage_submissions where id = $1 and company_id = $2 for update`, [id, companyId])).rows[0]
  if (!c) throw new MarketError('This submission was not found.')
  if (!['draft', 'changes_requested'].includes(c.status)) throw new MarketError('This submission is already with Nashr.')
  const problems = coverageProblems(c.data, dubaiToday(at))
  if (problems.length) throw new MarketError(problems[0][1])
  checkText(c.data)
  await db.query(`update coverage_submissions set status = 'submitted', submitted_at = $2, updated_at = $2 where id = $1`, [id, at])
  await audit(db, `user:${userId}`, 'coverage.submitted', 'coverage', id, null, at)
  const company = (await db.query(`select name from companies where id = $1`, [companyId])).rows[0].name
  for (const s of (await db.query(`select distinct company_id from users where role in ('admin', 'founder')`)).rows)
    await notify(db, s.company_id, 'coverage.submitted', null, { coverageId: id, company, name: c.data.name }, at)
}

/** Nashr's decision. Approve: the coverage goes on sale on its dates (slots need the publisher's payout account to be verified). */
export async function decideCoverage(db: Db, id: string, decision: 'approve' | 'changes' | 'reject', note: string | null, actor: string, at: Date) {
  const c = (await db.query(`select * from coverage_submissions where id = $1 for update`, [id])).rows[0]
  if (!c) throw new MarketError('This submission was not found.')
  if (c.status !== 'submitted') throw new MarketError('Only a submission waiting for review can be decided.')
  if (decision !== 'approve' && !note?.trim()) throw new MarketError('Say what needs changing, so the publisher can act on it.')
  let placementId: string | null = null, slots = 0
  if (decision === 'approve') {
    const d: CoverageData = c.data
    const dates = [...new Set(d.dates ?? [])].sort().filter(x => x >= dubaiToday(at))
    if (!dates.length) throw new MarketError('Every coverage date has passed. Ask the publisher for new dates.')
    const [h, m] = (d.time ?? '00:00').split(':').map(Number), end = Math.min(h * 60 + m + (d.durationMin ?? 30), 23 * 60 + 59)
    const creative = 48, close = Math.ceil((creative + await setting<number>(db, 'seller_window_hours', at) + await setting<number>(db, 'payment_window_hours', at)) / 24) * 24
    const social = COVERAGE_SOCIAL.filter(([k]) => d.social?.[k]).map(([, l]) => l)
    const lines = [d.angle?.trim(), d.description?.trim(),
      `Coverage: ${label(COVERAGE_KINDS, d.kinds).join(', ')}.`, `Appears on: ${label(COVERAGE_PLATFORMS, d.platforms).join(', ')}${social.length ? `; social: ${social.join(', ')}` : ''}.`,
      d.venue?.trim() ? `Location: ${d.venue.trim()}.` : '', d.reach ? `Estimated reach: ${d.reach.toLocaleString('en-US')}.` : '', d.audienceProfile?.trim() ? `Audience: ${d.audienceProfile.trim()}.` : '']
    placementId = await createPlacement(db, {
      outletId: c.outlet_id, name: [d.name?.trim(), d.episode?.trim()].filter(Boolean).join(' · ').slice(0, 120), saleType: d.saleType === 'auction' ? 'auction' : 'fixed',
      days: [...new Set(dates.map(x => new Date(x + 'T12:00:00Z').getUTCDay() || 7))], startsAt: d.time,
      endsAt: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`, breaks: [],
      startingPrice: coverageTotal(d), creativeLeadHours: creative, closeLeadHours: close, format: 'coverage',
      description: lines.filter(Boolean).join('\n').slice(0, 600),
      specs: [...label(COVERAGE_DELIVERABLES, (d.deliverables ?? []).filter(x => x !== 'other')), ...(d.deliverablesOther?.trim() ? [d.deliverablesOther.trim()] : [])].join(', ').slice(0, 400),
      language: d.language, listing: 'manual', audiences: d.audiences ?? [],
    }, actor, at)
    const payouts = (await db.query(`select c.payouts_enabled from outlets o join companies c on c.id = o.company_id where o.id = $1`, [c.outlet_id])).rows[0]?.payouts_enabled
    if (payouts) for (const x of dates) slots += await generateSlots(db, placementId, x, 1, at)
  }
  const status = decision === 'approve' ? 'approved' : decision === 'changes' ? 'changes_requested' : 'rejected'
  await db.query(`update coverage_submissions set status = $2, decided_at = $3, decided_by = $4, decision_note = $5, placement_id = $6, updated_at = $3 where id = $1`,
    [id, status, at, actor, note?.trim() || null, placementId, ])
  await audit(db, actor, `coverage.${status}`, 'coverage', id, { note: note?.trim() || null, placementId, slots }, at)
  await notify(db, c.company_id, `coverage.${status}`, null, { coverageId: id, name: c.data.name, note: note?.trim() || null, slots }, at)
  return { status, placementId, slots }
}

export const coverageRow = (r: any, staff = false) => ({
  id: r.id, outletId: r.outlet_id, outlet: r.outlet ?? null, company: staff ? r.company ?? null : undefined, status: r.status, data: staff ? r.data : r.data,
  createdAt: r.created_at, updatedAt: r.updated_at, submittedAt: r.submitted_at, decidedAt: r.decided_at, decisionNote: r.decision_note, placementId: r.placement_id,
})
