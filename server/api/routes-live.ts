import type { FastifyInstance } from 'fastify'
import { pool } from '../core/db.js'
import { live } from '../core/live.js'
import { session } from '../auth/access.js'
import { cookie } from './app.js'

/*
 * GET /api/events: a Server-Sent Events stream. Signed-in pages get their company's bell signals; everyone (guests too) gets
 * slot signals, which carry only a slot id. The session is checked once at the start; no database connection is held open.
 */
export function liveRoute(app: FastifyInstance, clock: () => Date) {
  app.get('/api/events', async (req, reply) => {
    const s = await session(pool, cookie(req as any), clock())
    const company = s ? (s.viewAs && ['admin', 'founder'].includes(s.role) ? s.viewAs.companyId : s.companyId) : null
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    res.write('retry: 5000\n\n')
    const send = (event: string, data: object) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
    const onNote = (id: string) => { if (id === company) send('notification', {}) }
    const onSlot = (id: string) => send('slot', { id })
    live.on('notification', onNote); live.on('slot', onSlot)
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 25_000)
    req.raw.on('close', () => { clearInterval(beat); live.off('notification', onNote); live.off('slot', onSlot) })
  })
}
