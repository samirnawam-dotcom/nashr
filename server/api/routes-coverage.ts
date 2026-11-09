import { NotFound, type RouteFn } from './app.js'
import { coverageRow, decideCoverage, saveCoverage, submitCoverage } from '../catalog/coverage.js'
import { COVERAGE_DELIVERABLES, COVERAGE_FORMATS, COVERAGE_FREQUENCY, COVERAGE_KINDS, COVERAGE_MARKETS, COVERAGE_PLATFORMS, COVERAGE_SOCIAL, COVERAGE_TYPES } from '../shared/coverage.js'
import { AUDIENCE_KEYS } from '../shared/audiences.js'

const keys = (l: readonly (readonly [string, string])[]) => l.map(x => x[0])
const many = (l: readonly (readonly [string, string])[]) => ({ type: 'array', uniqueItems: true, maxItems: l.length, items: { enum: keys(l) } })
const text = (n: number) => ({ type: 'string', maxLength: n })
const money = { type: 'integer', minimum: 0, maximum: 100_000_000_00 }

/** Everything optional while it is a draft; the full checks run when it is submitted (shared/coverage.ts). */
const DATA = { type: 'object', additionalProperties: false, properties: {
  name: text(120), type: { enum: keys(COVERAGE_TYPES) }, episode: text(120), format: { enum: keys(COVERAGE_FORMATS) },
  durationMin: { type: 'integer', minimum: 1, maximum: 1440 }, frequency: { enum: keys(COVERAGE_FREQUENCY) },
  dates: { type: 'array', uniqueItems: true, maxItems: 31, items: { type: 'string', format: 'date' } }, time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
  venue: text(160), kinds: many(COVERAGE_KINDS), angle: text(300), description: text(1000),
  reach: { type: 'integer', minimum: 0, maximum: 1_000_000_000 }, audienceProfile: text(200), markets: many(COVERAGE_MARKETS),
  audiences: { type: 'array', uniqueItems: true, maxItems: 20, items: { enum: AUDIENCE_KEYS } },
  deliverables: many(COVERAGE_DELIVERABLES), deliverablesOther: text(160), platforms: many(COVERAGE_PLATFORMS),
  social: { type: 'object', additionalProperties: false, properties: Object.fromEntries(keys(COVERAGE_SOCIAL).map(k => [k, money])) },
  price: money, saleType: { enum: ['fixed', 'auction'] }, sponsorship: text(120), language: { enum: ['english', 'arabic', 'both', 'hindi', 'urdu', 'other'] },
  files: { type: 'array', maxItems: 10, items: { type: 'object', required: ['id', 'name', 'size'], additionalProperties: false,
    properties: { id: { type: 'string', format: 'uuid' }, name: text(200), size: { type: 'integer', minimum: 0 } } } },
  notes: text(500),
} }
const BODY = { type: 'object', required: ['outletId', 'data'], additionalProperties: false, properties: { outletId: { type: 'string', format: 'uuid' }, data: DATA } }

export function coverageRoutes(route: RouteFn) {
  const LIST = `select s.*, o.name outlet, c.name company from coverage_submissions s join outlets o on o.id = s.outlet_id join companies c on c.id = s.company_id`

  route('GET', '/api/seller/coverage', ['seller'], async ({ db, me }) =>
    (await db.query(`${LIST} where s.company_id = $1 order by s.updated_at desc limit 200`, [me.actAs.companyId])).rows.map(r => coverageRow(r)))

  route('GET', '/api/seller/coverage/:id', ['seller'], async ({ db, me }, req) => {
    const r = (await db.query(`${LIST} where s.id = $1 and s.company_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!r) throw new NotFound()
    return coverageRow(r)
  })

  route('POST', '/api/seller/coverage', ['seller'], async ({ db, at, me }, req) => {
    const id = await saveCoverage(db, { companyId: me.actAs.companyId, userId: me.userId, outletId: req.body.outletId, data: req.body.data }, at)
    return coverageRow((await db.query(`${LIST} where s.id = $1`, [id])).rows[0])
  }, BODY)

  route('PUT', '/api/seller/coverage/:id', ['seller'], async ({ db, at, me }, req) => {
    if (!(await db.query(`select 1 from coverage_submissions where id = $1 and company_id = $2`, [req.params.id, me.actAs.companyId])).rowCount) throw new NotFound()
    await saveCoverage(db, { id: req.params.id, companyId: me.actAs.companyId, userId: me.userId, outletId: req.body.outletId, data: req.body.data }, at)
    return coverageRow((await db.query(`${LIST} where s.id = $1`, [req.params.id])).rows[0])
  }, BODY)

  route('POST', '/api/seller/coverage/:id/submit', ['seller'], async ({ db, at, me }, req) => {
    if (!(await db.query(`select 1 from coverage_submissions where id = $1 and company_id = $2`, [req.params.id, me.actAs.companyId])).rowCount) throw new NotFound()
    await submitCoverage(db, req.params.id, me.actAs.companyId, me.userId, at)
    return coverageRow((await db.query(`${LIST} where s.id = $1`, [req.params.id])).rows[0])
  })

  // Nashr's review queue: waiting first, then the rest, newest first
  route('GET', '/api/admin/coverage', ['admin'], async ({ db }, req) =>
    (await db.query(`${LIST} where s.status <> 'draft' and ($1::text is null or s.status = $1)
       order by (s.status = 'submitted') desc, coalesce(s.submitted_at, s.updated_at) desc limit 300`, [req.query.status || null])).rows.map(r => coverageRow(r, true)))

  route('GET', '/api/admin/coverage/:id', ['admin'], async ({ db }, req) => {
    const r = (await db.query(`${LIST} where s.id = $1 and s.status <> 'draft'`, [req.params.id])).rows[0]
    if (!r) throw new NotFound()
    return coverageRow(r, true)
  })

  route('POST', '/api/admin/coverage/:id/decide', ['admin'], async ({ db, at, me }, req) =>
    decideCoverage(db, req.params.id, req.body.decision, req.body.note ?? null, `admin:${me.userId}`, at),
  { type: 'object', required: ['decision'], additionalProperties: false, properties: { decision: { enum: ['approve', 'changes', 'reject'] }, note: text(1000) } })
}
