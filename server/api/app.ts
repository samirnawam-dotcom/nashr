import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type pg from 'pg'
import { pool, tx } from '../core/db.js'
import { audit } from '../core/audit.js'
import { MarketError } from '../marketplace/market.js'
import { session, type Session } from '../auth/access.js'
import type { PaymentProvider } from '../payments/provider.js'
import { authRoutes } from './routes-auth.js'
import { buyerRoutes } from './routes-buyer.js'
import { sellerRoutes } from './routes-seller.js'
import { adminRoutes } from './routes-admin.js'

export type Ctx = { db: pg.PoolClient; at: Date; me: Session & { actAs: { companyId: string; role: string } }; provider: PaymentProvider }
type Role = 'buyer' | 'seller' | 'admin' | 'founder'
// Bodies are validated by each route's JSON schema before the handler runs.
export type Req = FastifyRequest & { body: any; params: any; query: any }
type Handler = (ctx: Ctx, req: Req, reply: FastifyReply) => Promise<unknown>

export const COOKIE = 'nashr_session'
export const cookie = (req: FastifyRequest) =>
  req.headers.cookie?.split(';').map(c => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1]

/** Not yours and not found look the same, so nobody can probe other companies' records (SPEC 5.5). */
export class NotFound extends Error {}

// ponytail: in-memory, per process. Move to Postgres or a shared store when running more than one instance.
const hits = new Map<string, { n: number; reset: number }>()
export function rateLimit(key: string, max: number, now: number) {
  const h = hits.get(key)
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); return true }
  return ++h.n <= max
}

export function buildApp(deps: { provider: PaymentProvider; clock?: () => Date }) {
  const clock = deps.clock ?? (() => new Date())
  const app = Fastify({ logger: false })

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof NotFound || /not yours|expected 1 row, got 0|invalid input syntax for type uuid/.test(err.message)) return reply.code(404).send({ error: 'Not found.' })
    if (err instanceof MarketError) return reply.code(400).send({ error: err.message })
    if (err.validation) return reply.code(400).send({ error: 'Some fields are missing or not valid.', details: err.validation.map((v: any) => v.instancePath || v.params?.missingProperty) })
    reply.code(500).send({ error: 'Something went wrong on our side.' })
  })

  /** Every route goes through here: authentication, role check, read-only enforcement while viewing as, one transaction. */
  function route(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, roles: Role[] | 'public', handler: Handler, schema?: object) {
    app.route({ method, url, schema: schema ? { body: schema } : undefined, handler: async (req, reply) => {
      const at = clock()
      if (roles === 'public') return tx(db => handler({ db, at, me: null as any, provider: deps.provider }, req as Req, reply))
      const s = await session(pool, cookie(req), at)
      if (!s) return reply.code(401).send({ error: 'Please sign in.' })
      const viewing = s.viewAs && ['admin', 'founder'].includes(s.role)
      const actAs = viewing ? s.viewAs! : { companyId: s.companyId, role: s.role }
      if (viewing && method !== 'GET' && url !== '/api/admin/view-as' && url !== '/api/auth/logout')
        return reply.code(403).send({ error: 'View only: you are viewing this account as an admin.' })
      const effective = (viewing && !url.startsWith('/api/admin/') ? actAs.role : s.role) as Role
      if (!roles.includes(effective) && !(effective === 'founder' && roles.includes('admin')))
        return reply.code(403).send({ error: 'You do not have access to this.' })
      return tx(async db => {
        if (viewing && method === 'GET') await audit(db, `admin:${s.userId}`, 'view_as.page', 'company', actAs.companyId, { url: req.url }, at)
        return handler({ db, at, me: { ...s, actAs }, provider: deps.provider }, req as Req, reply)
      })
    } })
  }

  authRoutes(route)
  buyerRoutes(route)
  sellerRoutes(route)
  adminRoutes(route)
  return app
}

export type RouteFn = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, roles: Role[] | 'public', handler: Handler, schema?: object) => void
