import { audit } from '../core/audit.js'
import { containsContactDetails } from '../core/contact.js'
import { MarketError } from '../marketplace/market.js'
import { NotFound, type RouteFn } from './app.js'

/** The rating on one deal, for the buyer's booking page and the publisher's deal page. */
export async function dealRating(db: any, dealId: string) {
  const r = (await db.query(`select id, score, comment, hidden, updated_at from ratings where deal_id = $1`, [dealId])).rows[0]
  return r ? { id: r.id, score: r.score, comment: r.comment, hidden: r.hidden, at: r.updated_at } : null
}

/** What everyone sees on an outlet page: the average, the count and recent comments, never who wrote them. */
export async function outletRating(db: any, outletId: string) {
  const s = (await db.query(`select round(avg(score)::numeric, 1)::float average, count(*)::int count from ratings where outlet_id = $1 and not hidden`, [outletId])).rows[0]
  const recent = (await db.query(`select score, comment, updated_at from ratings where outlet_id = $1 and not hidden and comment is not null
    order by updated_at desc limit 5`, [outletId])).rows
  return { average: s.count ? s.average : null, count: s.count, recent: recent.map((r: any) => ({ score: r.score, comment: r.comment, at: r.updated_at })) }
}

export function ratingRoutes(route: RouteFn) {
  route('POST', '/api/deals/:id/rating', ['buyer'], async ({ db, at, me }, req) => {
    const d = (await db.query(`select d.id, d.status, p.outlet_id from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id
      where d.id = $1 and d.buyer_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!d) throw new NotFound()
    if (!['released', 'paid_out'].includes(d.status)) throw new MarketError('You can rate the publisher after the booking is complete and the payment is released.')
    const comment = req.body.comment?.trim() || null
    if (comment && containsContactDetails(comment)) throw new MarketError('Emails and phone numbers are not allowed in a rating.')
    await db.query(`insert into ratings (deal_id, outlet_id, buyer_id, score, comment, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $6)
      on conflict (deal_id) do update set score = excluded.score, comment = excluded.comment, updated_at = excluded.updated_at`,
      [d.id, d.outlet_id, me.actAs.companyId, req.body.score, comment, at])
    await audit(db, `buyer:${me.actAs.companyId}`, 'deal.rated', 'deal', d.id, { score: req.body.score }, at)
    return dealRating(db, d.id)
  }, { type: 'object', required: ['score'], additionalProperties: false, properties: {
    score: { type: 'integer', minimum: 1, maximum: 5 }, comment: { type: 'string', maxLength: 500 } } })

  route('POST', '/api/admin/ratings/:id/hidden', ['admin'], async ({ db, at, me }, req) => {
    const r = await db.query(`update ratings set hidden = $2 where id = $1 returning deal_id`, [req.params.id, req.body.hidden])
    if (!r.rowCount) throw new NotFound()
    await audit(db, `admin:${me.userId}`, req.body.hidden ? 'rating.hidden' : 'rating.shown', 'deal', r.rows[0].deal_id, null, at)
    return { ok: true }
  }, { type: 'object', required: ['hidden'], additionalProperties: false, properties: { hidden: { type: 'boolean' } } })
}
