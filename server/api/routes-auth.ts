import type { RouteFn } from './app.js'
import { pool } from '../core/db.js'
import { smtpConfig } from '../core/smtp.js'
import { COOKIE, cookie, rateLimit } from './app.js'
import { acceptInvite, acceptTerms, termsVersion, changePassword, resetWithCode, recordSignIn, signInLocked, login, logout, requestAccess, requestReset, resetPassword } from '../auth/access.js'
import { MarketError } from '../marketplace/market.js'
import { sha256 } from '../auth/crypto.js'
import { audit } from '../core/audit.js'
import { setting } from '../core/settings.js'
import { confirmTwoStep, startTwoStep, stopTwoStep } from '../auth/two-step.js'

const str = { type: 'string', minLength: 1, maxLength: 200 }

export function authRoutes(route: RouteFn) {
  route('POST', '/api/access-requests', 'public', async ({ db, at }, req, reply) => {
    if (!rateLimit(`access:${req.ip}`, 5, at.getTime())) return reply.code(429).send({ error: 'Too many requests. Try again in a minute.' })
    const b = req.body
    return { id: await requestAccess(db, { name: b.name, email: b.email, phone: b.phone, role: b.role, company: b.company, companyType: b.companyType }, at) }
  }, { type: 'object', required: ['name', 'email', 'phone', 'role', 'company', 'companyType'], additionalProperties: false,
       properties: { name: str, email: str, phone: str, role: str, company: str, companyType: { enum: ['brand', 'agency', 'media_outlet'] } } })

  route('POST', '/api/auth/invite', 'public', async ({ db, at }, req) => acceptInvite(db, req.body, at),
    { type: 'object', required: ['token', 'password'], properties: { token: str, password: { type: 'string', maxLength: 200 }, totpCode: str, acceptTerms: { type: 'boolean' } } })

  route('POST', '/api/auth/login', 'public', async ({ db, at }, req, reply) => {
    // three limits: one address on one account, one address across many accounts (password spraying), one account from many addresses
    const email = String(req.body.email).toLowerCase()
    if (!rateLimit(`login:${req.ip}:${email}`, 10, at.getTime()) || !rateLimit(`login-ip:${req.ip}`, 60, at.getTime()) || !rateLimit(`login-acct:${email}`, 30, at.getTime()))
      return reply.code(429).send({ error: 'Too many attempts. Try again in a minute.' })
    const from = { ip: req.ip, ua: String(req.headers['user-agent'] ?? '') }
    if (await signInLocked(pool, email, at)) {
      await recordSignIn(pool, { email, ...from, success: false, reason: 'locked' }, at)
      return reply.code(429).send({ error: 'Too many failed sign-ins for this account. Try again in 15 minutes, or reset your password.' })
    }
    let token: string
    try { token = await login(db, req.body, at, from) } catch (e: any) {
      const reason = /authenticator/.test(e.message) ? (req.body.totpCode ? 'code' : 'code_needed') : 'password'
      await recordSignIn(pool, { email, ...from, success: false, reason }, at) // outside this request's transaction, which rolls back
      throw e
    }
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

  route('GET', '/api/me', ['buyer', 'seller', 'admin', 'founder'], async ({ db, me, at }) => {
    const c = (await db.query(`select name, type from companies where id = $1`, [me.actAs.companyId])).rows[0]
    const as = me.signedInAs && (await db.query(`select u.name, (select name from users where id = $2) staff from users u where u.id = $1`, [me.userId, me.signedInAs.staffId])).rows[0]
    const terms = (await db.query(`select terms_version, lang from users where id = $1`, [me.userId])).rows[0]
    const current = await termsVersion(db, at)
    return { role: me.actAs.role, company: c, lang: terms?.lang ?? 'en', viewingAs: me.viewAs ? me.viewAs.companyId : null, terms: { version: current, accepted: terms?.terms_version === current },
      signedInAs: me.signedInAs ? { user: as.name, staff: as.staff, until: me.signedInAs.until, companyId: me.companyId } : null }
  })

  // Forgotten password: the same answer whether or not the email has an account (no account probing).
  route('POST', '/api/auth/forgot', 'public', async ({ db, at }, req, reply) => {
    if (!rateLimit(`forgot:${req.ip}`, 5, at.getTime())) return reply.code(429).send({ error: 'Too many requests. Try again in a minute.' })
    // the same answer in the same time either way: the extra work for a real account is hidden under a fixed minimum
    const started = Date.now()
    await requestReset(db, req.body.email, at)
    await new Promise(r => setTimeout(r, Math.max(0, 300 - (Date.now() - started))))
    return { ok: true, by: smtpConfig() ? 'email' : 'team' } // how the link travels: the same answer for every address
  }, { type: 'object', required: ['email'], additionalProperties: false, properties: { email: str } })
  route('POST', '/api/auth/reset-with-code', 'public', async ({ db, at }, req, reply) => {
    if (!rateLimit(`reset-code:${req.ip}`, 5, at.getTime()) || !rateLimit(`reset-code:${String(req.body.email).toLowerCase()}`, 5, at.getTime()))
      return reply.code(429).send({ error: 'Too many attempts. Try again in a minute.' })
    const started = Date.now()
    try { await resetWithCode(db, req.body, at) }
    finally { await new Promise(r => setTimeout(r, Math.max(0, 300 - (Date.now() - started)))) } // the same time either way
    return { ok: true }
  }, { type: 'object', required: ['email', 'code', 'password'], additionalProperties: false,
    properties: { email: str, code: { type: 'string', maxLength: 10 }, password: { type: 'string', maxLength: 200 } } })
  route('POST', '/api/auth/reset', 'public', async ({ db, at }, req, reply) => {
    if (!rateLimit(`reset:${req.ip}`, 10, at.getTime())) return reply.code(429).send({ error: 'Too many attempts. Try again in a minute.' })
    await resetPassword(db, req.body, at)
    return { ok: true }
  }, { type: 'object', required: ['token', 'password'], additionalProperties: false, properties: { token: str, password: { type: 'string', maxLength: 200 } } })

  // Your own account: name, password, and which emails you want (essential ones about your bookings and money always go).
  route('GET', '/api/me/account', ['buyer', 'seller', 'admin', 'founder'], async ({ db, me }) => {
    const u = (await db.query(`select name, email, role, email_prefs, totp_enabled from users where id = $1`, [me.userId])).rows[0]
    return { name: u.name, email: u.email, role: u.role, emails: { bids: true, alerts: true, messages: true, news: false, ...u.email_prefs },
      twoStep: { on: u.totp_enabled, staff: ['admin', 'founder'].includes(u.role), requiredForMoney: !!(await setting(db, 'two_step_for_money', new Date())) } }
  })
  route('PUT', '/api/me/account', ['buyer', 'seller', 'admin', 'founder'], async ({ db, at, me }, req) => {
    const b = req.body
    if (me.viewAs) throw new MarketError('You are viewing another account. Changes are not allowed.')
    if (b.name != null) await db.query(`update users set name = $2 where id = $1`, [me.userId, b.name.trim()])
    if (b.emails) await db.query(`update users set email_prefs = $2 where id = $1`, [me.userId, JSON.stringify(b.emails)])
    if (b.lang) await db.query(`update users set lang = $2 where id = $1`, [me.userId, b.lang]) // emails follow the language they use Nashr in
    await audit(db, `user:${me.userId}`, 'account.updated', 'user', me.userId, { fields: Object.keys(b) }, at)
    return { ok: true }
  }, { type: 'object', additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 120 }, lang: { enum: ['en', 'ar'] },
    emails: { type: 'object', additionalProperties: false, properties: { bids: { type: 'boolean' }, alerts: { type: 'boolean' }, messages: { type: 'boolean' }, news: { type: 'boolean' } } } } })
  // Updated terms: accepted once per version, by the person themselves (not by Nashr signed in as them)
  route('POST', '/api/me/accept-terms', ['buyer', 'seller', 'admin', 'founder'], async ({ db, at, me }, req) => {
    if (me.viewAs) throw new MarketError('You are viewing another account. Changes are not allowed.')
    await acceptTerms(db, me.userId, at, req.body.version)
    return { ok: true }
  }, { type: 'object', required: ['version'], additionalProperties: false, properties: { version: { type: 'string', maxLength: 40 } } })

  // Two-step sign-in for buyers and publishers (staff set theirs up when they join).
  route('POST', '/api/me/two-step/start', ['buyer', 'seller'], async ({ db, at, me }) => {
    if (me.viewAs) throw new MarketError('You are viewing another account. Changes are not allowed.')
    return startTwoStep(db, me.userId, at)
  })
  route('POST', '/api/me/two-step/confirm', ['buyer', 'seller'], async ({ db, at, me }, req, reply) => {
    if (!rateLimit(`2s:${me.userId}`, 10, at.getTime())) return reply.code(429).send({ error: 'Too many attempts. Try again in a minute.' })
    await confirmTwoStep(db, me.userId, req.body.code, at)
    return { ok: true }
  }, { type: 'object', required: ['code'], additionalProperties: false, properties: { code: { type: 'string', maxLength: 10 } } })
  route('POST', '/api/me/two-step/off', ['buyer', 'seller'], async ({ db, at, me }, req, reply) => {
    if (!rateLimit(`2s:${me.userId}`, 10, at.getTime())) return reply.code(429).send({ error: 'Too many attempts. Try again in a minute.' })
    await stopTwoStep(db, me.userId, req.body, at)
    return { ok: true }
  }, { type: 'object', required: ['password', 'code'], additionalProperties: false, properties: { password: { type: 'string', maxLength: 200 }, code: { type: 'string', maxLength: 10 } } })

  route('PUT', '/api/me/password', ['buyer', 'seller', 'admin', 'founder'], async ({ db, at, me }, req, reply) => {
    if (!rateLimit(`pw:${me.userId}`, 10, at.getTime())) return reply.code(429).send({ error: 'Too many attempts. Try again in a minute.' })
    if (me.viewAs) throw new MarketError('You are viewing another account. Changes are not allowed.')
    await changePassword(db, { userId: me.userId, current: req.body.current, password: req.body.password, keepToken: me.tokenHash }, at)
    return { ok: true }
  }, { type: 'object', required: ['current', 'password'], additionalProperties: false, properties: { current: { type: 'string', maxLength: 200 }, password: { type: 'string', maxLength: 200 } } })
}
