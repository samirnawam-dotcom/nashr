import { audit } from '../core/audit.js'
import { MarketError } from '../marketplace/market.js'
import { NotFound, type RouteFn } from './app.js'
import { AUDIENCE_KEYS } from '../shared/audiences.js'

const MAX_SEARCHES = 20
// The same fields as the calendar's filter (server/shared/slot-filter.ts); anything else is refused.
export const filterSchema = { type: 'object', additionalProperties: false, properties: {
  channels: { type: 'array', maxItems: 5, uniqueItems: true, items: { enum: ['print', 'digital', 'radio', 'tv', 'podcast'] } },
  saleTypes: { type: 'array', maxItems: 3, uniqueItems: true, items: { enum: ['auction', 'quick_sale', 'fixed'] } },
  sector: { type: 'string', minLength: 1, maxLength: 60 },
  maxPrice: { type: 'integer', minimum: 1 },
  dayparts: { type: 'array', maxItems: 4, uniqueItems: true, items: { enum: ['morning', 'afternoon', 'evening', 'allday'] } },
  q: { type: 'string', maxLength: 100 },
  closingWithinHours: { type: 'integer', minimum: 1, maximum: 168 },
  audiences: { type: 'array', maxItems: 12, uniqueItems: true, items: { enum: AUDIENCE_KEYS } } } }
const shape = (r: any) => ({ id: r.id, name: r.name, filter: r.filter, alerts: r.alerts, createdAt: r.created_at })

/** Saved calendar searches belong to the buyer's company; alerts arrive in the company's notifications. */
export function searchRoutes(route: RouteFn) {
  route('GET', '/api/searches', ['buyer'], async ({ db, me }) =>
    (await db.query(`select * from saved_searches where company_id = $1 order by created_at, name`, [me.actAs.companyId])).rows.map(shape))

  route('POST', '/api/searches', ['buyer'], async ({ db, at, me }, req) => {
    const n = (await db.query(`select count(*)::int n from saved_searches where company_id = $1`, [me.actAs.companyId])).rows[0].n
    if (n >= MAX_SEARCHES) throw new MarketError(`You can save up to ${MAX_SEARCHES} searches. Delete one to save another.`)
    const r = (await db.query(`insert into saved_searches (company_id, created_by, name, filter, alerts, checked_at, created_at)
      values ($1, $2, $3, $4, $5, $6, $6) returning *`, [me.actAs.companyId, me.userId, req.body.name.trim(), JSON.stringify(req.body.filter), req.body.alerts ?? true, at])).rows[0]
    await audit(db, `buyer:${me.actAs.companyId}`, 'search.saved', 'saved_search', r.id, { name: r.name }, at)
    return shape(r)
  }, { type: 'object', required: ['name', 'filter'], additionalProperties: false, properties: {
    name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' }, filter: filterSchema, alerts: { type: 'boolean' } } })

  route('PUT', '/api/searches/:id', ['buyer'], async ({ db, at, me }, req) => {
    const b = req.body
    // Turning alerts back on starts from now, so it never sends a backlog for the time they were off.
    const r = await db.query(`update saved_searches set name = coalesce($3, name), alerts = coalesce($4, alerts),
        checked_at = case when $4::boolean and not alerts then $5 else checked_at end
      where id = $1 and company_id = $2 returning *`, [req.params.id, me.actAs.companyId, b.name?.trim() ?? null, b.alerts ?? null, at])
    if (!r.rowCount) throw new NotFound()
    return shape(r.rows[0])
  }, { type: 'object', additionalProperties: false, minProperties: 1, properties: {
    name: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' }, alerts: { type: 'boolean' } } })

  route('DELETE', '/api/searches/:id', ['buyer'], async ({ db, me }, req) => {
    const r = await db.query(`delete from saved_searches where id = $1 and company_id = $2`, [req.params.id, me.actAs.companyId])
    if (!r.rowCount) throw new NotFound()
    return { ok: true }
  })
}
