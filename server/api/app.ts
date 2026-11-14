import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type pg from 'pg'
import { pool, tx } from '../core/db.js'
import { audit } from '../core/audit.js'
import { MarketError } from '../marketplace/market.js'
import { session, termsVersion, type Session } from '../auth/access.js'
import type { PaymentProvider } from '../payments/provider.js'
import { authRoutes } from './routes-auth.js'
import { buyerRoutes } from './routes-buyer.js'
import { sellerRoutes } from './routes-seller.js'
import { adminRoutes } from './routes-admin.js'
import { planRoutes } from './routes-plan.js'
import { sellerDeskRoutes } from './routes-seller-desk.js'
import { adminDeskRoutes } from './routes-admin-desk.js'
import { healthRoute } from './routes-health.js'
import { MAX_UPLOAD, sharedRoutes } from './routes-shared.js'
import { coverRoutes } from './routes-covers.js'
import { searchRoutes } from './routes-searches.js'
import { ratingRoutes } from './routes-ratings.js'
import { messageRoutes } from './routes-messages.js'
import { teamRoutes } from './routes-team.js'
import { clientRoutes } from './routes-clients.js'
import { recordError } from '../core/watch.js'
import { pushRoutes } from './routes-push.js'
import { mailRoutes } from './routes-mail.js'
import { userRoutes } from './routes-users.js'
import { supportRoutes } from './routes-support.js'
import { productRoutes } from './routes-products.js'
import { insightRoutes } from './routes-insights.js'
import { liveRoute } from './routes-live.js'
import { DiskStorage, type Storage } from '../files/storage.js'
import { type StripeConfig, stripeWebhook } from './routes-stripe.js'
import { dashboardRoutes } from './routes-dashboards.js'

export type Ctx = { db: pg.PoolClient; at: Date; me: Session & { actAs: { companyId: string; role: string } }; provider: PaymentProvider }
type Role = 'buyer' | 'seller' | 'admin' | 'founder' | 'guest' // 'guest': also readable without signing in (me is null)
// Bodies are validated by each route's JSON schema before the handler runs.
export type Req = FastifyRequest & { body: any; params: any; query: any }
type Handler = (ctx: Ctx, req: Req, reply: FastifyReply) => Promise<unknown>

export const COOKIE = 'nashr_session'
export const cookie = (req: FastifyRequest) =>
  req.headers.cookie?.split(';').map(c => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1]

/** Not yours and not found look the same, so nobody can probe other companies' records (SPEC 5.5). */
export class NotFound extends Error {}
/** The only routes that take raw bytes instead of JSON: private files, outlet cover photos and logos, and a brand's logo. */
const isUpload = (method: string, url: string) => {
  const path = url.split('?')[0]
  return (method === 'POST' && path === '/api/files') || (method === 'PUT' && /^\/api\/(seller|admin)\/outlets\/[^/]+\/(cover|logo)$/.test(path)) || (method === 'PUT' && /^\/api\/seller\/products\/[^/]+\/logo$/.test(path))
    || (method === 'PUT' && (path === '/api/company/logo' || /^\/api\/clients\/[^/]+\/logo$/.test(path)))
}

// Attempt limits (sign-in, resets, two-step codes): counted in Postgres, so every copy of the API shares them. The count is
// written on its own, outside the request's transaction, so a refused attempt still counts. Windows are one minute.
export const resetRateLimits = () => pool.query(`truncate rate_limits`) // tests run many sign-ins inside one fake minute
export async function rateLimit(key: string, max: number, now: number) {
  const at = new Date(now)
  const { n } = (await pool.query(`insert into rate_limits (key, n, reset_at) values ($1, 1, $2::timestamptz + interval '1 minute')
    on conflict (key) do update set
      n = case when rate_limits.reset_at <= $2 then 1 else rate_limits.n + 1 end,
      reset_at = case when rate_limits.reset_at <= $2 then $2::timestamptz + interval '1 minute' else rate_limits.reset_at end
    returning n`, [key, at])).rows[0]
  if (Math.random() < 0.01) pool.query(`delete from rate_limits where reset_at < $1::timestamptz - interval '1 hour'`, [at]).catch(() => {}) // keep the table small
  return n <= max
}

export function buildApp(deps: { provider: PaymentProvider; clock?: () => Date; storage?: Storage; log?: boolean; stripe?: StripeConfig }) {
  const clock = deps.clock ?? (() => new Date())
  // Bodies are checked strictly: unknown fields are an error, never silently passed to the handler (security review F2).
  const app = Fastify({ logger: false, trustProxy: process.env.TRUST_PROXY === '1', // behind the load balancer: real client IPs for rate limits and logs
    ajv: { customOptions: { removeAdditional: 'all', coerceTypes: false } } })
  // Uploads arrive as raw bytes with their own content type; JSON keeps Fastify's own parser.
  // One JSON line per request for the log pipeline: no query strings, bodies or cookies (they can carry personal data or tokens).
  if (deps.log ?? process.env.NODE_ENV === 'production')
    app.addHook('onResponse', async (req, reply) => console.log(JSON.stringify({ t: new Date().toISOString(), method: req.method,
      path: req.url.split('?')[0], status: reply.statusCode, ms: Math.round(reply.elapsedTime), ip: req.ip })))
  const fail = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })
  // Raw bytes only for file uploads, only from a signed-in user, checked before a single byte is read (security review F2).
  app.addContentTypeParser('*', { bodyLimit: MAX_UPLOAD }, async (req: any, payload: any) => {
    if (!isUpload(req.method, req.url)) throw fail(415, 'Send JSON.')
    if (!(await session(pool, cookie(req), clock()))) throw fail(401, 'Please sign in.')
    const chunks: Buffer[] = []; let size = 0
    for await (const c of payload) { if ((size += c.length) > MAX_UPLOAD) throw fail(413, 'The file is too large.'); chunks.push(c) }
    return Buffer.concat(chunks)
  })

  // CSRF (security review F2): every write must come from our own pages. Browsers send Origin on cross-site and same-site
  // writes; HTML forms cannot send JSON. So: a foreign Origin is refused, and every write except an upload must be JSON (or empty).
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD') return
    const origin = req.headers.origin
    const allowed = process.env.APP_ORIGIN?.split(',').map(o => o.trim()) // set it when the web app is served from another host
    if (origin && (allowed ? !allowed.includes(origin) : (() => { try { return new URL(origin).host !== req.headers.host } catch { return true } })()))
      return reply.code(403).send({ error: 'Requests must come from Nashr.' })
    const type = String(req.headers['content-type'] ?? '')
    const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined
    if (hasBody && !isUpload(req.method, req.url) && !type.startsWith('application/json')) return reply.code(415).send({ error: 'Send JSON.' })
  })

  // Security headers on every API response; the web app's own headers (CSP for scripts and fonts) are set at the edge (docs/runbook.md).
  app.addHook('onSend', async (req, reply) => {
    // one exception: an email, shown to Nashr's staff inside the app's own page (same site only, no scripts, sandboxed)
    const emailPreview = req.method === 'GET' && /^\/api\/admin\/emails\/[0-9a-f-]{36}$/.test(req.url)
    reply.header('x-content-type-options', 'nosniff').header('x-frame-options', emailPreview ? 'SAMEORIGIN' : 'DENY').header('referrer-policy', 'same-origin')
      .header('content-security-policy', emailPreview ? "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox"
        : "default-src 'none'; frame-ancestors 'none'").header('cross-origin-resource-policy', 'same-origin')
    if (process.env.NODE_ENV === 'production') reply.header('strict-transport-security', 'max-age=63072000; includeSubDomains')
  })

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof NotFound || /not yours|expected 1 row, got 0|invalid input syntax for type uuid/.test(err.message)) return reply.code(404).send({ error: 'Not found.' })
    if (err instanceof MarketError) return reply.code(400).send({ error: err.message })
    if (err.statusCode === 413) return reply.code(413).send({ error: 'The file is too large.' })
    if (err.validation) return reply.code(400).send({ error: 'Some fields are missing or not valid.', details: err.validation.map((v: any) => v.instancePath || v.params?.missingProperty) })
    if (err.statusCode >= 400 && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.statusCode === 415 ? 'Send JSON.' : err.message })
    console.error(new Date().toISOString(), req.method, req.url, err) // unexpected: keep the cause in the server log, never in the response
    recordError(`${req.method} ${req.routeOptions?.url ?? req.url.split('?')[0]}`) // staff are alerted when these pile up
    reply.code(500).send({ error: 'Something went wrong on our side.' })
  })

  // What a company's own team settings allow each person (self-serve teams): paying, deciding on bookings, managing the team
  const NEEDS: Record<string, 'pay' | 'decide' | 'manage'> = {
    'POST /api/deals/:id/pay': 'pay', 'POST /api/deals/:id/cancel': 'pay', 'POST /api/deals/:id/counter': 'pay',
    'POST /api/seller/deals/:id/accept': 'decide', 'POST /api/seller/deals/:id/decline': 'decide', 'POST /api/seller/deals/:id/counter': 'decide', 'POST /api/seller/slots/:id/choose': 'decide',
    'POST /api/seller/slots/:id/accept-interest': 'decide', 'POST /api/seller/deals/:id/cancel': 'decide', 'POST /api/seller/deals/:id/issues/offer': 'decide',
    'PUT /api/buyer/company': 'manage', 'PUT /api/seller/company': 'manage', 'POST /api/seller/payouts/connect': 'manage',
    'POST /api/team': 'manage', 'PUT /api/team/:id': 'manage', 'POST /api/team/:id/remove': 'manage', 'POST /api/team/:id/restore': 'manage', 'POST /api/team/:id/invite': 'manage',
  }
  const CANT: Record<string, string> = {
    pay: 'Your company has not given you the right to pay or cancel. Ask a team manager.',
    decide: 'Your company has not given you the right to decide on bookings. Ask a team manager.',
    manage: 'Only your company\'s team managers can do this.',
  }
  const TERMS_FREE = new Set(['/api/me/accept-terms', '/api/auth/logout'])
  // Steps only the account holder may take, even when Nashr is signed in as them: their password and email choices, paying by card, bank details.
  const OWN_STEPS = new Set(['PUT /api/me/password', 'PUT /api/me/account', 'POST /api/deals/:id/pay', 'POST /api/seller/payouts/connect',
    'POST /api/me/two-step/start', 'POST /api/me/two-step/confirm', 'POST /api/me/two-step/off', 'POST /api/me/accept-terms'])

  /** Every route goes through here: authentication, role check, read-only enforcement while viewing as, one transaction. */
  function route(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, roles: Role[] | 'public', handler: Handler, schema?: object) {
    app.route({ method, url, schema: schema ? { body: schema } : undefined, handler: async (req, reply) => {
      const at = clock()
      if (roles === 'public') return tx(db => handler({ db, at, me: null as any, provider: deps.provider }, req as Req, reply))
      const s = await session(pool, cookie(req), at)
      if (!s) {
        if (roles.includes('guest') && method === 'GET') return tx(db => handler({ db, at, me: null as any, provider: deps.provider }, req as Req, reply))
        return reply.code(401).send({ error: 'Please sign in.' })
      }
      const viewing = s.viewAs && ['admin', 'founder'].includes(s.role)
      const actAs = viewing ? s.viewAs! : { companyId: s.companyId, role: s.role }
      if (viewing && method !== 'GET' && url !== '/api/admin/view-as' && url !== '/api/auth/logout')
        return reply.code(403).send({ error: 'View only: you are viewing this account as an admin.' })
      const effective = (viewing && !url.startsWith('/api/admin/') ? actAs.role : s.role) as Role
      if (!roles.includes(effective) && !(effective === 'founder' && roles.includes('admin')))
        return reply.code(403).send({ error: 'You do not have access to this.' })
      // Staff signed in as this user: they act as the person, except for what only the person may do; every change is logged under their own name.
      if (s.signedInAs && OWN_STEPS.has(`${method} ${url}`))
        return reply.code(403).send({ error: 'Nashr is signed in as this user. The person must do this step themselves.' })
      return tx(async db => {
        // a buyer or publisher who has not accepted the terms in force can look, not act (accepting them, and signing out, excepted)
        if (method !== 'GET' && ['buyer', 'seller'].includes(s.role) && !s.signedInAs && !TERMS_FREE.has(url)) {
          const u = (await db.query(`select terms_version from users where id = $1`, [s.userId])).rows[0]
          if (u?.terms_version !== await termsVersion(db, at)) return reply.code(403).send({ error: 'Accept the updated terms of use to carry on.' })
        }
        const need = ['buyer', 'seller'].includes(s.role) ? NEEDS[`${method} ${url}`] : undefined
        if (need) {
          const u = (await db.query(`select can_pay, can_decide, can_manage from users where id = $1`, [s.userId])).rows[0]
          if (!u?.[`can_${need}`]) return reply.code(403).send({ error: CANT[need] })
        }
        if (s.signedInAs) await audit(db, `admin:${s.signedInAs.staffId}`, method === 'GET' ? 'sign_in_as.page' : 'sign_in_as.action', 'user', s.userId,
          { method, url: req.url, company: s.companyId }, at) // every page read and every change, as view-as logs every page
        if (viewing && method === 'GET') await audit(db, `admin:${s.userId}`, 'view_as.page', 'company', actAs.companyId, { url: req.url }, at)
        return handler({ db, at, me: { ...s, actAs }, provider: deps.provider }, req as Req, reply)
      })
    } })
  }

  authRoutes(route)
  buyerRoutes(route)
  sellerRoutes(route)
  adminRoutes(route)
  planRoutes(route)
  clientRoutes(route)
  sellerDeskRoutes(route, deps)
  adminDeskRoutes(route, deps)
  dashboardRoutes(route)
  searchRoutes(route)
  ratingRoutes(route)
  messageRoutes(route)
  insightRoutes(route)
  supportRoutes(route)
  productRoutes(route)
  userRoutes(route)
  teamRoutes(route)
  mailRoutes(route)
  pushRoutes(route)
  healthRoute(app, { provider: deps.provider, clock })
  liveRoute(app, clock)
  stripeWebhook(app, { provider: deps.provider, stripe: deps.stripe, clock })
  // What the browser needs to show the card form: Stripe's publishable key (public by design), or null for the test cards.
  route('GET', '/api/config', 'public', async () => ({ stripePublishableKey: deps.stripe?.publishableKey ?? null }))
  const storage = deps.storage ?? new DiskStorage()
  sharedRoutes(route, storage)
  coverRoutes(route, storage)
  return app
}

export type RouteFn = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, roles: Role[] | 'public', handler: Handler, schema?: object) => void
