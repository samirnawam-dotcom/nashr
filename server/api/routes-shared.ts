import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { MarketError } from '../marketplace/market.js'
import type { Storage } from '../files/storage.js'

export const MAX_UPLOAD = 100 * 1024 * 1024 // ponytail: in-memory upload cap; TV masters go straight to S3 with presigned uploads later

/*
 * Private files (SPEC 5.5). Readable by the company that uploaded it, by the other side of a deal the file is attached to
 * (creative, proof, invoice, issue evidence), and by Nashr staff. Everyone else gets "not found".
 */
export function sharedRoutes(route: RouteFn, storage: Storage) {
  route('POST', '/api/files', ['buyer', 'seller'], async ({ db, at, me }, req) => {
    const bytes = req.body
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new MarketError('Choose a file to upload.')
    const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'file')).slice(0, 200)
    const f = (await db.query(`insert into files (company_id, name, type, size, created_at) values ($1, $2, $3, $4, $5) returning id`,
      [me.actAs.companyId, name, String(req.headers['content-type']).split(';')[0], bytes.length, at])).rows[0]
    await storage.put(f.id, bytes)
    return { id: f.id, key: `files/${f.id}`, name, size: bytes.length }
  })

  route('GET', '/api/files/:id', ['buyer', 'seller', 'admin'], async ({ db, me }, req, reply) => {
    const staff = ['admin', 'founder'].includes(me.actAs.role)
    const f = (await db.query(
      `select f.* from files f where f.id = $1 and ($3 or f.company_id = $2 or exists (
         select 1 from deals d where $2 in (d.buyer_id, d.seller_id) and f.company_id in (d.buyer_id, d.seller_id) and (
           exists (select 1 from creatives c where c.deal_id = d.id and c.file_key = 'files/' || f.id)
           or exists (select 1 from proofs p where p.deal_id = d.id and p.items::text like '%files/' || f.id || '%')
           or exists (select 1 from issues i where i.deal_id = d.id and i.evidence::text like '%files/' || f.id || '%')
           or exists (select 1 from documents x where x.deal_id = d.id and x.file_key = 'files/' || f.id))))`,
      [req.params.id, me.actAs.companyId, staff])).rows[0]
    if (!f) throw new NotFound()
    return reply.type(f.type).header('content-disposition', `attachment; filename="${encodeURIComponent(f.name)}"`)
      .header('cache-control', 'private, no-store').send(await storage.get(f.id))
  })

  // Documents: the issuer and the recipient may read one; Nashr staff may read all (SPEC 11.2).
  const ALL: ['buyer', 'seller', 'admin'] = ['buyer', 'seller', 'admin']
  route('GET', '/api/documents', ['buyer', 'seller'], async ({ db, me }) =>
    (await db.query(`select x.id, x.type, x.number, x.total, x.currency, x.issued_at, x.deal_id, d.ref from documents x left join deals d on d.id = x.deal_id
                     where $1 in (x.recipient_id, x.issuer_id) order by x.issued_at desc limit 500`, [me.actAs.companyId])).rows
      .map(x => ({ id: x.id, type: x.type, number: x.number, total: x.total, currency: x.currency, issuedAt: x.issued_at, dealId: x.deal_id, dealRef: x.ref })))

  route('GET', '/api/documents/:id', ALL, async ({ db, me }, req) => {
    const staff = ['admin', 'founder'].includes(me.actAs.role)
    const x = (await db.query(`select x.*, d.ref, r.number related_number from documents x left join deals d on d.id = x.deal_id
                               left join documents r on r.id = x.related_id
                               where x.id = $1 and ($3 or $2 in (x.recipient_id, x.issuer_id))`, [req.params.id, me.actAs.companyId, staff])).rows[0]
    if (!x) throw new NotFound()
    const party = (p: any) => ({ name: p.name, trn: p.trn ?? null })
    return { id: x.id, type: x.type, number: x.number, dealRef: x.ref, relatedNumber: x.related_number, onBehalf: x.on_behalf, taxDocument: x.tax_document,
      issuer: party(x.lines.issuer), recipient: party(x.lines.recipient), items: x.lines.items, note: x.lines.note,
      currency: x.currency, subtotal: x.subtotal, vatBp: x.vat_bp, vat: x.vat, total: x.total, issuedAt: x.issued_at,
      fileId: x.file_key ? x.file_key.replace(/^files\//, '') : null }
  })

  // The bell.
  route('GET', '/api/notifications', ['buyer', 'seller', 'admin', 'founder'], async ({ db, me }) => {
    const { rows } = await db.query(`select n.id, n.kind, n.deal_id, n.data, n.created_at, n.read_at, d.ref from notifications n left join deals d on d.id = n.deal_id
                                     where n.company_id = $1 order by n.id desc limit 30`, [me.actAs.companyId])
    const unread = (await db.query(`select count(*)::int n from notifications where company_id = $1 and read_at is null`, [me.actAs.companyId])).rows[0].n
    return { unread, items: rows.map(n => ({ id: n.id, kind: n.kind, dealId: n.deal_id, dealRef: n.ref, data: n.data, at: n.created_at, read: !!n.read_at })) }
  })

  route('POST', '/api/notifications/read', ['buyer', 'seller', 'admin', 'founder'], async ({ db, at, me }) => {
    await db.query(`update notifications set read_at = $2 where company_id = $1 and read_at is null`, [me.actAs.companyId, at])
    return { ok: true }
  })
}
