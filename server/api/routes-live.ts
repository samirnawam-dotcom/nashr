import type { FastifyInstance } from 'fastify'
import { pool } from '../core/db.js'
import { live } from '../core/live.js'
import { session } from '../auth/access.js'
import { cookie } from './app.js'

/*
 * GET /api/events: a Server-Sent Events stream. Signed-in pages get their company's bell signals; everyone (guests too) gets
 * slot signals, which carry only a slot id. No database connection is held open.
 * Limits: a few streams per session, more per address (an office shares one), and a ceiling overall; a reader that stops reading is dropped instead of buffered;
 * the session is checked again at every heartbeat, so a stream ends when its session does.
 */
const PER_SESSION = 4, PER_IP = 30, TOTAL = 2000, HEARTBEAT_MS = 25_000, MAX_BUFFERED = 64 * 1024
const open = new Map<string, number>()
let total = 0

export function liveRoute(app: FastifyInstance, clock: () => Date) {
  app.get('/api/events', async (req, reply) => {
    const token = cookie(req as any), ip = `ip:${req.ip}`, who = token ? `s:${token.slice(0, 16)}` : null
    if (total >= TOTAL || (open.get(ip) ?? 0) >= PER_IP || (who && (open.get(who) ?? 0) >= PER_SESSION))
      return reply.code(429).send({ error: 'Too many live connections.' })
    const companyOf = async () => {
      const s = await session(pool, token, clock())
      return s ? (s.viewAs && ['admin', 'founder'].includes(s.role) ? s.viewAs.companyId : s.companyId) : null
    }
    let company = await companyOf()
    reply.hijack()
    const res = reply.raw
    const keys = who ? [ip, who] : [ip]
    for (const k of keys) open.set(k, (open.get(k) ?? 0) + 1)
    total++
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    res.write('retry: 5000\n\n')
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      clearInterval(beat); live.off('notification', onNote); live.off('slot', onSlot)
      total--
      for (const k of keys) { const n = (open.get(k) ?? 1) - 1; if (n) open.set(k, n); else open.delete(k) }
      res.end()
    }
    const send = (text: string) => { if (res.writableLength > MAX_BUFFERED) return close(); res.write(text) } // not reading: let it go
    const onNote = (id: string) => { if (id === company) send('event: notification\ndata: {}\n\n') }
    const onSlot = (id: string) => send(`event: slot\ndata: ${JSON.stringify({ id })}\n\n`)
    live.on('notification', onNote); live.on('slot', onSlot)
    const beat = setInterval(async () => {
      const now = await companyOf().catch(() => company)
      if (token && company && now !== company) return close() // signed out, expired or switched: the page reconnects as what it now is
      company = now
      send(': keep-alive\n\n')
    }, HEARTBEAT_MS)
    req.raw.on('close', close)
  })
}
