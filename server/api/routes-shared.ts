import { documentPdf, titleOf } from '../documents/render.js'
import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { MarketError } from '../marketplace/market.js'
import { sniffType, type Storage } from '../files/storage.js'
import { containsContactDetails } from '../core/contact.js'
import { audit } from '../core/audit.js'
import { companyProfile } from './profiles.js'

export const MAX_UPLOAD = 100 * 1024 * 1024 // ponytail: in-memory upload cap; TV masters go straight to S3 with presigned uploads later

/*
 * Private files (SPEC 5.5). Readable by the company that uploaded it, by the other side of a deal the file is attached to
 * (creative, proof, invoice, issue evidence), and by Nashr staff. Everyone else gets "not found".
 */
export function sharedRoutes(route: RouteFn, storage: Storage) {
  // Your business profile, as the other side sees it before a deal (no contact details: those stay inside a paid booking).
  route('GET', '/api/company/profile', ['buyer', 'seller'], async ({ db, me }) => companyProfile(db, me.actAs.companyId))
  route('PUT', '/api/company/profile', ['buyer', 'seller'], async ({ db, at, me }, req) => {
    const b = req.body
    // the website too: a phone number in a link, or a chat link (WhatsApp, Telegram, Messenger), is a contact detail
    if (containsContactDetails([b.industry, b.about, b.website].filter(Boolean).join(' \n '))
      || /^https?:\/\/([^/]*\.)?(wa\.me|whatsapp\.com|t\.me|telegram\.(me|org)|m\.me|signal\.me|viber\.com)(\/|$)/i.test(b.website ?? ''))
      throw new MarketError('Emails and phone numbers are not allowed in the profile.')
    await db.query(`update companies set industry = $2, website = $3, about = $4 where id = $1`, [me.actAs.companyId, b.industry?.trim() || null, b.website?.trim() || null, b.about?.trim() || null])
    await audit(db, `${me.role}:${me.actAs.companyId}`, 'company.profile_updated', 'company', me.actAs.companyId, null, at)
    return companyProfile(db, me.actAs.companyId)
  }, { type: 'object', additionalProperties: false, properties: { industry: { type: 'string', maxLength: 80 }, website: { type: 'string', maxLength: 300, pattern: '^(https?://.*)?$' },
    about: { type: 'string', maxLength: 600 } } })

  route('POST', '/api/files', ['buyer', 'seller'], async ({ db, at, me }, req) => {
    const bytes = req.body
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new MarketError('Choose a file to upload.')
    const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'file')).slice(0, 200)
    const f = (await db.query(`insert into files (company_id, name, type, size, created_at) values ($1, $2, $3, $4, $5) returning id`,
      [me.actAs.companyId, name, sniffType(bytes), bytes.length, at])).rows[0]
    await storage.put(f.id, bytes)
    return { id: f.id, key: `files/${f.id}`, name, size: bytes.length }
  })

  route('GET', '/api/files/:id', ['buyer', 'seller', 'admin'], async ({ db, me }, req, reply) => {
    const staff = ['admin', 'founder'].includes(me.actAs.role)
    const f = (await db.query(
      `select f.* from files f where f.id = $1 and ($3 or f.company_id = $2 or exists (
         select 1 from deals d where $2 in (d.buyer_id, d.seller_id) and (
           -- either side's files attached to its statement in a dispute: the case is open both ways
           exists (select 1 from dispute_statements s where s.deal_id = d.id and s.company_id = f.company_id and s.files::text like '%files/' || f.id || '%') or
           -- the buyer sends creative and issue evidence; the publisher sends proof, corrected proof and its own invoice
           (f.company_id = d.buyer_id and (exists (select 1 from creatives c where c.deal_id = d.id and c.file_key = 'files/' || f.id)
              or exists (select 1 from issues i where i.deal_id = d.id and i.evidence::text like '%files/' || f.id || '%')))
           or (f.company_id = d.seller_id and (exists (select 1 from proofs p where p.deal_id = d.id and p.items::text like '%files/' || f.id || '%')
              or exists (select 1 from issues i where i.deal_id = d.id and i.offer::text like '%files/' || f.id || '%')
              or exists (select 1 from documents x where x.deal_id = d.id and x.file_key = 'files/' || f.id))))))`,
      [req.params.id, me.actAs.companyId, staff])).rows[0]
    if (!f) throw new NotFound()
    return reply.type(f.type).header('content-disposition', `attachment; filename="${encodeURIComponent(f.name)}"`)
      .header('cache-control', 'private, no-store').send(await storage.get(f.id))
  })

  // Documents: the issuer and the recipient may read one; Nashr staff may read all (SPEC 11.2).
  const ALL: ['buyer', 'seller', 'admin'] = ['buyer', 'seller', 'admin']
  route('GET', '/api/documents', ['buyer', 'seller'], async ({ db, me }) =>
    (await db.query(`select x.id, x.type, x.number, x.total, x.currency, x.issued_at, x.deal_id, d.ref from documents x left join deals d on d.id = x.deal_id
                     where $1 in (x.recipient_id, x.issuer_id) or (x.type = 'order' and d.seller_id = $1) order by x.issued_at desc limit 500`, [me.actAs.companyId])).rows
      .map(x => ({ id: x.id, type: x.type, number: x.number, total: x.total, currency: x.currency, issuedAt: x.issued_at, dealId: x.deal_id, dealRef: x.ref })))

  /** One document as its reader may see it, or not found. */
  async function readDocument(db: any, me: any, id: string) {
    const staff = ['admin', 'founder'].includes(me.actAs.role)
    const x = (await db.query(`select x.*, d.ref, r.number related_number from documents x left join deals d on d.id = x.deal_id
                               left join documents r on r.id = x.related_id
                               where x.id = $1 and ($3 or $2 in (x.recipient_id, x.issuer_id) or (x.type = 'order' and d.seller_id = $2))`, [id, me.actAs.companyId, staff])).rows[0]
    if (!x) throw new NotFound()
    const party = (p: any) => ({ name: p.name, trn: p.trn ?? null, address: p.address ?? null })
    return { id: x.id, type: x.type, number: x.number, dealRef: x.ref, relatedNumber: x.related_number, onBehalf: x.on_behalf, taxDocument: x.tax_document,
      issuer: party(x.lines.issuer), recipient: party(x.lines.recipient), items: x.lines.items, note: x.lines.note,
      currency: x.currency, subtotal: Number(x.subtotal), vatBp: x.vat_bp, vat: Number(x.vat), total: Number(x.total), issuedAt: x.issued_at,
      fileId: x.file_key ? x.file_key.replace(/^files\//, '') : null }
  }

  route('GET', '/api/documents/:id', ALL, async ({ db, me }, req) => readDocument(db, me, req.params.id))

  // The same document as a PDF to download, file it or send it on (an uploaded invoice is the publisher's own file instead).
  // ?lang=ar gives the whole document in Arabic, laid out right to left.
  route('GET', '/api/documents/:id/pdf', ALL, async ({ db, me }, req, reply) => {
    const d = await readDocument(db, me, req.params.id), lang = req.query.lang === 'ar' ? 'ar' : 'en'
    return reply.type('application/pdf').header('content-disposition', `attachment; filename="${titleOf(d).replace(/ /g, '-')}-${d.number}${lang === 'ar' ? '-ar' : ''}.pdf"`)
      .header('cache-control', 'private, no-store').send(documentPdf(d, lang))
  })

  // The bell.
  route('GET', '/api/notifications', ['buyer', 'seller', 'admin', 'founder'], async ({ db, me }) => {
    const { rows } = await db.query(`select n.id, n.kind, n.deal_id, n.data, n.created_at, n.read_at, d.ref from notifications n left join deals d on d.id = n.deal_id
                                     where n.company_id = $1 order by n.id desc limit 30`, [me.actAs.companyId])
    const unread = (await db.query(`select count(*)::int n from notifications where company_id = $1 and read_at is null`, [me.actAs.companyId])).rows[0].n
    return { unread, items: rows.map(n => ({ id: n.id, kind: n.kind, dealId: n.deal_id, dealRef: n.ref, data: n.data, at: n.created_at, read: !!n.read_at })) }
  })

  route('POST', '/api/notifications/read', ['buyer', 'seller', 'admin', 'founder'], async ({ db, at, me }) => {
    if (me.signedInAs) return { ok: true } // Nashr helping out: the person still sees what is new
    await db.query(`update notifications set read_at = $2 where company_id = $1 and read_at is null`, [me.actAs.companyId, at])
    return { ok: true }
  })
}
