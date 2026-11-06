import { randomUUID } from 'node:crypto'
import { audit } from '../core/audit.js'
import { sniffType, type Storage } from '../files/storage.js'
import { MarketError } from '../marketplace/market.js'
import { NotFound, type RouteFn } from './app.js'

/** Covers are resized to 1600×500 in the browser, so a real one is far below this. */
export const MAX_COVER = 3 * 1024 * 1024
const IMAGE = ['image/jpeg', 'image/png']

/** The public URL for an outlet's cover, or null: the page then shows its channel's photo. */
export const coverUrl = (o: { id: string; cover_key?: string | null }) => o.cover_key ? `/api/outlets/${o.id}/cover?v=${o.cover_key.slice(6, 14)}` : null

/**
 * Publishers set the cover of their own outlets; Nashr sets it for outlets not on Nashr (the same split as editing the profile).
 * Anyone may see a cover, signed in or not: it is public by design, like the outlet page it sits on.
 */
export function coverRoutes(route: RouteFn, storage: Storage) {
  async function set(db: any, at: Date, actor: string, outlet: string, owner: string | null, body: unknown, reply: any) {
    if (!Buffer.isBuffer(body) || !body.length) throw new MarketError('Choose a photo to upload.')
    if (body.length > MAX_COVER) return reply.code(413).send({ error: 'The photo is too large. Use one under 3 MB.' })
    if (!IMAGE.includes(sniffType(body))) throw new MarketError('Use a JPEG or PNG photo.')
    const key = `cover-${randomUUID()}`
    const r = await db.query(`update outlets set cover_key = $2 where id = $1 and company_id is not distinct from $3 returning id, cover_key`, [outlet, key, owner])
    if (!r.rowCount) return null
    await storage.put(key, body)
    await audit(db, actor, 'outlet.cover_set', 'outlet', outlet, null, at)
    return { coverUrl: coverUrl(r.rows[0]) }
  }
  async function clear(db: any, at: Date, actor: string, outlet: string, owner: string | null) {
    const r = await db.query(`update outlets set cover_key = null where id = $1 and company_id is not distinct from $2`, [outlet, owner])
    if (r.rowCount) await audit(db, actor, 'outlet.cover_removed', 'outlet', outlet, null, at)
    return r.rowCount > 0
  }

  route('PUT', '/api/seller/outlets/:id/cover', ['seller'], async ({ db, at, me }, req, reply) => {
    const r = await set(db, at, `seller:${me.actAs.companyId}`, req.params.id, me.actAs.companyId, req.body, reply)
    if (r === null) throw new NotFound()
    return r
  })
  route('DELETE', '/api/seller/outlets/:id/cover', ['seller'], async ({ db, at, me }, req) => {
    if (!(await clear(db, at, `seller:${me.actAs.companyId}`, req.params.id, me.actAs.companyId))) throw new NotFound()
    return { ok: true }
  })
  route('PUT', '/api/admin/outlets/:id/cover', ['admin'], async ({ db, at, me }, req, reply) => {
    const r = await set(db, at, `admin:${me.userId}`, req.params.id, null, req.body, reply)
    if (r === null) throw new MarketError('Only outlets not on Nashr can be changed here.')
    return r
  })
  route('DELETE', '/api/admin/outlets/:id/cover', ['admin'], async ({ db, at, me }, req) => {
    if (!(await clear(db, at, `admin:${me.userId}`, req.params.id, null))) throw new MarketError('Only outlets not on Nashr can be changed here.')
    return { ok: true }
  })

  route('GET', '/api/outlets/:id/cover', 'public', async ({ db }, req, reply) => {
    const id = req.params.id
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFound()
    const key = (await db.query(`select cover_key from outlets where id = $1`, [id])).rows[0]?.cover_key
    if (!key) throw new NotFound()
    const bytes = await storage.get(key).catch(() => null) // bytes lost (e.g. a server moved without its files): the page falls back
    if (!bytes) throw new NotFound()
    return reply.type(sniffType(bytes)).header('cache-control', 'public, max-age=31536000, immutable').send(bytes)
  })
}
