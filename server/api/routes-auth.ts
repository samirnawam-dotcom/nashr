import type { RouteFn } from './app.js'
import { COOKIE, cookie, rateLimit } from './app.js'
import { acceptInvite, login, logout, requestAccess } from '../auth/access.js'
import { MarketError } from '../marketplace/market.js'
import { sha256 } from '../auth/crypto.js'

const str = { type: 'string', minLength: 1, maxLength: 200 }

export function authRoutes(route: RouteFn) {
  route('POST', '/api/access-requests', 'public', async ({ db, at }, req, reply) => {
    if (!rateLimit(`access:${req.ip}`, 5, at.getTime())) return reply.code(429).send({ error: 'Too many requests. Try again in a minute.' })
    const b = req.body
    return { id: await requestAccess(db, { name: b.name, email: b.email, phone: b.phone, role: b.role, company: b.company, companyType: b.companyType }, at) }
  }, { type: 'object', required: ['name', 'email', 'phone', 'role', 'company', 'companyType'], additionalProperties: false,
       properties: { name: str, email: str, phone: str, role: str, company: str, companyType: { enum: ['brand', 'agency', 'media_outlet'] } } })

  route('POST', '/api/auth/invite', 'public', async ({ db, at }, req) => acceptInvite(db, req.body, at),
    { type: 'object', required: ['token', 'password'], properties: { token: str, password: { type: 'string', maxLength: 200 }, totpCode: str } })

  route('POST', '/api/auth/login', 'public', async ({ db, at }, req, reply) => {
    if (!rateLimit(`login:${req.ip}:${String(req.body.email).toLowerCase()}`, 10, at.getTime()))
      return reply.code(429).send({ error: 'Too many attempts. Try again in a minute.' })
    const token = await login(db, req.body, at)
    reply.header('set-cookie', `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`)
    return { ok: true }
  }, { type: 'object', required: ['email', 'password'], properties: { email: str, password: { type: 'string', maxLength: 200 }, totpCode: str } })

  route('POST', '/api/auth/logout', ['buyer', 'seller', 'admin', 'founder'], async ({ db }, req, reply) => {
    const t = cookie(req)
    if (!t) throw new MarketError('Not signed in.')
    await logout(db, sha256(t))
    reply.header('set-cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`)
    return { ok: true }
  })

  route('GET', '/api/me', ['buyer', 'seller', 'admin', 'founder'], async ({ db, me }) => {
    const c = (await db.query(`select name, type from companies where id = $1`, [me.actAs.companyId])).rows[0]
    return { role: me.actAs.role, company: c, viewingAs: me.viewAs ? me.viewAs.companyId : null }
  })
}
