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
/** The public URL for an outlet's logo, or null: the page then shows its initials. */
export const logoUrl = (o: { id: string; logo_key?: string | null }) => o.logo_key ? `/api/outlets/${o.id}/logo?v=${o.logo_key.slice(5, 13)}` : null
/** The logo of the brand an outlet row belongs to (owner's "Outlet"), or null. */
export const companyLogoUrl = (id: string | null | undefined, key: string | null | undefined) => id && key ? `/api/companies/${id}/logo?v=${key.slice(-8)}` : null
export const clientLogoUrl = (id: string | null | undefined, key: string | null | undefined) => id && key ? `/api/clients/${id}/logo?v=${key.slice(-8)}` : null
export const brandLogoUrl = (id: string | null | undefined, key: string | null | undefined) => id && key ? `/api/brands/${id}/logo?v=${key.slice(-8)}` : null
const URL_OF = { cover: coverUrl, logo: logoUrl }

/**
 * Publishers set the cover and logo of their own outlets; Nashr sets it for outlets not on Nashr (the same split as editing the profile).
 * Anyone may see a cover, signed in or not: it is public by design, like the outlet page it sits on.
 */
export function coverRoutes(route: RouteFn, storage: Storage) {
  // The brand's logo (owner's rules round 2): one per outlet, shown on Products, the calendar and the bid drawer.
  route('PUT', '/api/seller/products/:id/logo', ['seller'], async ({ db, at, me }, req, reply) => {
    const body = req.body
    if (!Buffer.isBuffer(body) || !body.length) throw new MarketError('Choose a photo to upload.')
    if (body.length > MAX_COVER) return reply.code(413).send({ error: 'The photo is too large. Use one under 3 MB.' })
    if (!IMAGE.includes(sniffType(body))) throw new MarketError('Use a JPEG or PNG photo.')
    const key = `logo-${randomUUID()}`
    const r = await db.query(`update products set logo_key = $2 where id = $1 and company_id = $3 and not archived returning id`, [req.params.id, key, me.actAs.companyId])
    if (!r.rowCount) throw new NotFound()
    await storage.put(key, body)
    await audit(db, `seller:${me.actAs.companyId}`, 'product.logo_set', 'product', req.params.id, null, at)
    return { logoUrl: brandLogoUrl(req.params.id, key) }
  })
  route('DELETE', '/api/seller/products/:id/logo', ['seller'], async ({ db, at, me }, req) => {
    const r = await db.query(`update products set logo_key = null where id = $1 and company_id = $2`, [req.params.id, me.actAs.companyId])
    if (!r.rowCount) throw new NotFound()
    await audit(db, `seller:${me.actAs.companyId}`, 'product.logo_removed', 'product', req.params.id, null, at)
    return { ok: true }
  })
  route('GET', '/api/brands/:id/logo', 'public', async ({ db }, req, reply) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new NotFound()
    const key = (await db.query(`select logo_key from products where id = $1`, [req.params.id])).rows[0]?.logo_key
    const bytes = key ? await storage.get(key).catch(() => null) : null
    if (!bytes) throw new NotFound()
    return reply.type(sniffType(bytes)).header('cache-control', 'public, max-age=31536000, immutable').send(bytes)
  })

  // The buyer's (or publisher's) own company logo, and a buyer's client logos (owner's buyer-side fixes)
  async function image(body: unknown, reply: any) {
    if (!Buffer.isBuffer(body) || !body.length) throw new MarketError('Choose a photo to upload.')
    if (body.length > MAX_COVER) { reply.code(413).send({ error: 'The photo is too large. Use one under 3 MB.' }); return null }
    if (!IMAGE.includes(sniffType(body))) throw new MarketError('Use a JPEG or PNG photo.')
    return body
  }
  route('PUT', '/api/company/logo', ['buyer', 'seller'], async ({ db, at, me }, req, reply) => {
    const body = await image(req.body, reply); if (!body) return
    const key = `logo-${randomUUID()}`
    await db.query(`update companies set logo_key = $2 where id = $1`, [me.actAs.companyId, key])
    await storage.put(key, body)
    await audit(db, `${me.role}:${me.actAs.companyId}`, 'company.logo_set', 'company', me.actAs.companyId, null, at)
    return { logoUrl: companyLogoUrl(me.actAs.companyId, key) }
  })
  route('DELETE', '/api/company/logo', ['buyer', 'seller'], async ({ db, at, me }) => {
    await db.query(`update companies set logo_key = null where id = $1`, [me.actAs.companyId])
    await audit(db, `${me.role}:${me.actAs.companyId}`, 'company.logo_removed', 'company', me.actAs.companyId, null, at)
    return { ok: true }
  })
  route('GET', '/api/companies/:id/logo', 'public', async ({ db }, req, reply) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new NotFound()
    const key = (await db.query(`select logo_key from companies where id = $1`, [req.params.id])).rows[0]?.logo_key
    const bytes = key ? await storage.get(key).catch(() => null) : null
    if (!bytes) throw new NotFound()
    return reply.type(sniffType(bytes)).header('cache-control', 'public, max-age=31536000, immutable').send(bytes)
  })
  route('PUT', '/api/clients/:id/logo', ['buyer'], async ({ db, at, me }, req, reply) => {
    const body = await image(req.body, reply); if (!body) return
    const key = `logo-${randomUUID()}`
    const r = await db.query(`update clients set logo_key = $3 where id = $1 and buyer_id = $2`, [req.params.id, me.actAs.companyId, key])
    if (!r.rowCount) throw new NotFound()
    await storage.put(key, body)
    await audit(db, `user:${me.userId}`, 'client.logo_set', 'client', req.params.id, null, at)
    return { logoUrl: clientLogoUrl(req.params.id, key) }
  })
  route('DELETE', '/api/clients/:id/logo', ['buyer'], async ({ db, me }, req) => {
    const r = await db.query(`update clients set logo_key = null where id = $1 and buyer_id = $2`, [req.params.id, me.actAs.companyId])
    if (!r.rowCount) throw new NotFound()
    return { ok: true }
  })
  // a client's logo is the buyer's own: only their team sees it
  route('GET', '/api/clients/:id/logo', ['buyer'], async ({ db, me }, req, reply) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new NotFound()
    const key = (await db.query(`select logo_key from clients where id = $1 and buyer_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]?.logo_key
    const bytes = key ? await storage.get(key).catch(() => null) : null
    if (!bytes) throw new NotFound()
    return reply.type(sniffType(bytes)).header('cache-control', 'private, max-age=31536000, immutable').send(bytes)
  })

  for (const kind of ['cover', 'logo'] as const) {
  const col = `${kind}_key`
  async function set(db: any, at: Date, actor: string, outlet: string, owner: string | null, body: unknown, reply: any) {
    if (!Buffer.isBuffer(body) || !body.length) throw new MarketError('Choose a photo to upload.')
    if (body.length > MAX_COVER) return reply.code(413).send({ error: 'The photo is too large. Use one under 3 MB.' })
    if (!IMAGE.includes(sniffType(body))) throw new MarketError('Use a JPEG or PNG photo.')
    const key = `${kind}-${randomUUID()}`
    const r = await db.query(`update outlets set ${col} = $2 where id = $1 and company_id is not distinct from $3 returning id, ${col}`, [outlet, key, owner])
    if (!r.rowCount) return null
    await storage.put(key, body)
    await audit(db, actor, `outlet.${kind}_set`, 'outlet', outlet, null, at)
    return { [`${kind}Url`]: URL_OF[kind](r.rows[0]) }
  }
  async function clear(db: any, at: Date, actor: string, outlet: string, owner: string | null) {
    const r = await db.query(`update outlets set ${col} = null where id = $1 and company_id is not distinct from $2`, [outlet, owner])
    if (r.rowCount) await audit(db, actor, `outlet.${kind}_removed`, 'outlet', outlet, null, at)
    return r.rowCount > 0
  }

  route('PUT', `/api/seller/outlets/:id/${kind}`, ['seller'], async ({ db, at, me }, req, reply) => {
    const r = await set(db, at, `seller:${me.actAs.companyId}`, req.params.id, me.actAs.companyId, req.body, reply)
    if (r === null) throw new NotFound()
    return r
  })
  route('DELETE', `/api/seller/outlets/:id/${kind}`, ['seller'], async ({ db, at, me }, req) => {
    if (!(await clear(db, at, `seller:${me.actAs.companyId}`, req.params.id, me.actAs.companyId))) throw new NotFound()
    return { ok: true }
  })
  route('PUT', `/api/admin/outlets/:id/${kind}`, ['admin'], async ({ db, at, me }, req, reply) => {
    const r = await set(db, at, `admin:${me.userId}`, req.params.id, null, req.body, reply)
    if (r === null) throw new MarketError('Only outlets not on Nashr can be changed here.')
    return r
  })
  route('DELETE', `/api/admin/outlets/:id/${kind}`, ['admin'], async ({ db, at, me }, req) => {
    if (!(await clear(db, at, `admin:${me.userId}`, req.params.id, null))) throw new MarketError('Only outlets not on Nashr can be changed here.')
    return { ok: true }
  })

  route('GET', `/api/outlets/:id/${kind}`, 'public', async ({ db }, req, reply) => {
    const id = req.params.id
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFound()
    const key = (await db.query(`select ${col} from outlets where id = $1`, [id])).rows[0]?.[col]
    if (!key) throw new NotFound()
    const bytes = await storage.get(key).catch(() => null) // bytes lost (e.g. a server moved without its files): the page falls back
    if (!bytes) throw new NotFound()
    return reply.type(sniffType(bytes)).header('cache-control', 'public, max-age=31536000, immutable').send(bytes)
  })
  }
}
