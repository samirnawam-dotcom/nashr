import { type Db, one } from '../core/db.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { split } from '../core/money.js'
import { MarketError } from '../marketplace/market.js'

/*
 * Documents per the owner's invoice plan (SPEC 11.2 as changed in 12.1). Stored as structured data first; a PDF is a
 * rendering of a row, never the record. Rows are never changed: corrections are credit notes.
 *   order               Nashr → buyer       the confirmed booking, when the publisher accepts; the publisher sees it too (not a tax document)
 *   receipt             Nashr → buyer       payment received on the publisher's behalf (not a tax document)
 *   media_invoice       publisher → buyer   the publisher's tax invoice for the media: generated in its name and TRN, or uploaded
 *   commission_invoice  Nashr → publisher   Nashr's fee (+ VAT once Nashr is VAT-registered), paid by deduction from the payout
 *   credit_note         issuer → recipient  cancels (part of) an invoice
 */

const PREFIX: Record<string, string> = { order: 'ORD', receipt: 'RCT', media_invoice: 'INV', commission_invoice: 'NCI', credit_note: 'CN' }

/** Gapless sequence per document type, issuer and year: the series row lock serialises numbering. */
async function nextNumber(db: Db, type: string, issuerId: string | null, at: Date) {
  const year = at.getUTCFullYear()
  const { last } = await one(db, `insert into document_series (series, last) values ($1, 1)
                                  on conflict (series) do update set last = document_series.last + 1 returning last`, [`${type}:${issuerId ?? 'nashr'}:${year}`])
  return `${PREFIX[type]}-${year}-${String(last).padStart(6, '0')}`
}

async function parties(db: Db, issuerId: string | null, recipientId: string, at: Date) {
  const party = async (id: string) => one(db, `select id, name, trn, vat_registered, address from companies where id = $1`, [id])
  const issuer = issuerId ? await party(issuerId)
    : { id: null, name: await setting(db, 'nashr_legal_name', at), trn: await setting(db, 'nashr_trn', at), vat_registered: await setting(db, 'nashr_vat_registered', at),
        address: await setting(db, 'nashr_address', at) }
  return { issuer, recipient: await party(recipientId) }
}

type Doc = { type: string; issuerId: string | null; recipientId: string; dealId: string; relatedId?: string; onBehalf?: boolean; tax: boolean
  currency: string; subtotal: number; vatBp: number; vat: number; items: unknown[]; note?: string; number?: string; fileKey?: string }

async function issue(db: Db, d: Doc, at: Date) {
  const number = d.number ?? await nextNumber(db, d.type, d.issuerId, at)
  // A booking made for an agency's client names the client on the agency's documents (the agency stays the party billed).
  const client = (await db.query(`select c.name, c.trn, c.address from deals x join clients c on c.id = x.client_id where x.id = $1 and x.buyer_id = $2`,
    [d.dealId, d.recipientId])).rows[0] ?? null
  const lines = { ...(await parties(db, d.issuerId, d.recipientId, at)), items: d.items, note: d.note ?? null, client }
  return one(db, `insert into documents (type, number, issuer_id, recipient_id, deal_id, related_id, on_behalf, tax_document, currency,
                    subtotal, vat_bp, vat, total, lines, file_key, issued_at)
                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning *`,
    [d.type, number, d.issuerId, d.recipientId, d.dealId, d.relatedId ?? null, d.onBehalf ?? false, d.tax, d.currency,
     d.subtotal, d.vatBp, d.vat, d.subtotal + d.vat, JSON.stringify(lines), d.fileKey ?? null, at])
}

const describe = (db: Db, dealId: string) => one(db,
  `select d.*, s.label, s.air_date::text air_date, brand_name(o) outlet, c.invoice_mode from deals d join slots s on s.id = d.slot_id
   join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id join companies c on c.id = d.seller_id where d.id = $1`, [dealId])

/** The Order: what was agreed, for both sides, when the publisher accepts. Prices excl. VAT, plus the media VAT the buyer will pay. */
export async function issueOrder(db: Db, dealId: string, at: Date) {
  const d = await describe(db, dealId)
  const s = split(d.amount, { commissionBp: 0, mediaVatBp: d.media_vat_bp ?? 0, feeVatBp: 0 })
  return issue(db, { type: 'order', issuerId: null, recipientId: d.buyer_id, dealId, tax: false, currency: d.currency, subtotal: d.amount,
    vatBp: d.media_vat_bp ?? 0, vat: s.mediaVat, number: d.ref,
    items: [{ description: `${d.outlet} · ${d.label} · ${d.air_date}`, quantity: 1, unitPrice: d.amount }],
    note: "Booking confirmed by the publisher, arranged by Nashr as the publisher's agent. Pay by the deadline to secure the slot. This is not a tax invoice." }, at)
}

export async function issueReceipt(db: Db, dealId: string, amount: number, paymentRef: string, at: Date) {
  const d = await describe(db, dealId)
  return issue(db, { type: 'receipt', issuerId: null, recipientId: d.buyer_id, dealId, tax: false, currency: d.currency, subtotal: amount, vatBp: 0, vat: 0,
    items: [{ description: `Payment for Order ${d.ref}: ${d.outlet} · ${d.label} · ${d.air_date}`, amount, paymentRef }],
    note: `Received by Nashr on behalf of ${d.outlet}. This is not a tax invoice.` }, at)
}

/** The publisher's tax invoice for the media, generated by Nashr in the publisher's name (disclosed agent), for `price` excl. VAT. */
export async function issueMediaInvoice(db: Db, dealId: string, at: Date, price?: number) {
  const d = await describe(db, dealId)
  if (d.invoice_mode !== 'generate') return notify(db, d.seller_id, 'invoice.upload_needed', dealId, { order: d.ref }, at)
  const p = price ?? d.amount
  const s = split(p, { commissionBp: 0, mediaVatBp: d.media_vat_bp, feeVatBp: 0 })
  return issue(db, { type: 'media_invoice', issuerId: d.seller_id, recipientId: d.buyer_id, dealId, onBehalf: true, tax: d.media_vat_bp > 0,
    currency: d.currency, subtotal: p, vatBp: d.media_vat_bp, vat: s.mediaVat,
    items: [{ description: `${d.outlet} · ${d.label} · ${d.air_date} · Order ${d.ref}`, quantity: 1, unitPrice: p }],
    note: `Issued by Nashr on behalf of ${d.outlet}.` }, at)
}

/** A publisher that issues its own invoices uploads it with its own number. */
export async function uploadMediaInvoice(db: Db, a: { dealId: string; sellerId: string; number: string; fileKey: string }, at: Date) {
  const d = await describe(db, a.dealId)
  if (d.seller_id !== a.sellerId) throw new MarketError('This booking is not yours.')
  if (d.invoice_mode !== 'upload') throw new MarketError('Nashr issues this invoice for you.')
  const s = split(d.amount, { commissionBp: 0, mediaVatBp: d.media_vat_bp, feeVatBp: 0 })
  return issue(db, { type: 'media_invoice', issuerId: d.seller_id, recipientId: d.buyer_id, dealId: d.id, tax: d.media_vat_bp > 0, currency: d.currency,
    subtotal: d.amount, vatBp: d.media_vat_bp, vat: s.mediaVat, items: [{ description: `Order ${d.ref}`, quantity: 1, unitPrice: d.amount }],
    number: a.number, fileKey: a.fileKey }, at)
}

export async function issueCommissionInvoice(db: Db, dealId: string, fee: number, feeVat: number, at: Date) {
  const d = await describe(db, dealId)
  return issue(db, { type: 'commission_invoice', issuerId: null, recipientId: d.seller_id, dealId, tax: d.fee_vat_bp > 0, currency: d.currency,
    subtotal: fee, vatBp: d.fee_vat_bp, vat: feeVat, items: [{ description: `Nashr commission (${d.commission_bp / 100}%) on Order ${d.ref}`, amount: fee }],
    note: 'Paid by deduction from your payout.' }, at)
}

/**
 * On a refund: credit the open media invoice in full, then invoice what the publisher keeps (cancellation fee or the
 * unrefunded part), as the owner's plan asks. Uploaded invoices are the publisher's to credit; they are told to.
 */
export async function reissueAfterRefund(db: Db, dealId: string, keptPrice: number, at: Date) {
  const d = await describe(db, dealId)
  const open = (await db.query(`select * from documents i where deal_id = $1 and type = 'media_invoice'
      and not exists (select 1 from documents c where c.related_id = i.id) order by issued_at desc limit 1`, [dealId])).rows[0]
  if (!open) return keptPrice > 0 ? issueMediaInvoice(db, dealId, at, keptPrice) : undefined // refunded before the invoice was due
  if (open.file_key) return notify(db, d.seller_id, 'invoice.credit_note_needed', dealId, { invoice: open.number, keptPrice }, at)
  await issue(db, { type: 'credit_note', issuerId: open.issuer_id, recipientId: open.recipient_id, dealId, relatedId: open.id, onBehalf: open.on_behalf,
    tax: open.tax_document, currency: open.currency, subtotal: open.subtotal, vatBp: open.vat_bp, vat: open.vat,
    items: [{ description: `Credit for invoice ${open.number}`, amount: open.subtotal }] }, at)
  if (keptPrice > 0) await issueMediaInvoice(db, dealId, at, keptPrice)
}

/** Monthly payout statement for a publisher (CSV, not a tax document). */
/** A publisher's month (SPEC 11.2 #6, not a tax document): what was released to it, paid to its bank and deducted, with the balance before and after. */
export async function statement(db: Db, sellerId: string, month: string) {
  const acct = `seller_payable:${sellerId}`, first = `${month}-01`
  const opening = (await db.query(`select coalesce(sum(case when credit = $1 then amount else -amount end), 0)::bigint n from ledger_entries
    where (debit = $1 or credit = $1) and (at at time zone 'Asia/Dubai') < $2::date`, [acct, first])).rows[0].n
  const { rows } = await db.query(
    `select l.at, d.ref, d.id deal_id, brand_name(o) outlet, s.label, l.debit, l.credit, l.amount, l.currency from ledger_entries l left join deals d on d.id = l.deal_id
     left join slots s on s.id = d.slot_id left join placements p on p.id = s.placement_id left join outlets o on o.id = p.outlet_id
     where (l.debit = $1 or l.credit = $1) and to_char(l.at at time zone 'Asia/Dubai', 'YYYY-MM') = $2 order by l.id`, [acct, month])
  const kind = (r: any) => r.credit === acct ? 'released' : r.credit === 'cash' ? 'paid' : 'deducted'
  const lines = rows.map(r => ({ at: r.at, ref: r.ref as string | null, dealId: r.deal_id as string | null, what: r.outlet ? `${r.outlet} · ${r.label}` : null,
    kind: kind(r), amount: r.credit === acct ? Number(r.amount) : -Number(r.amount), currency: r.currency as string }))
  const total = (k: string) => lines.filter(l => l.kind === k).reduce((n, l) => n + l.amount, 0)
  const company = await one(db, `select name, trn from companies where id = $1`, [sellerId])
  return { month, company: { name: company.name, trn: company.trn }, issuer: await setting(db, 'nashr_legal_name', new Date()), opening: Number(opening),
    released: total('released'), paid: total('paid'), deducted: total('deducted'), closing: Number(opening) + lines.reduce((n, l) => n + l.amount, 0), lines }
}

export async function payoutStatement(db: Db, sellerId: string, month: string) {
  const st = await statement(db, sellerId, month)
  const label = { released: 'Released to you', paid: 'Paid to your bank account', deducted: 'Deducted (refund costs)' } as Record<string, string>
  const money = (n: number) => (n / 100).toFixed(2)
  return ['Date,Order,Type,Amount,Currency',
    ...st.lines.map(l => [l.at.toISOString().slice(0, 10), l.ref ?? '', label[l.kind], money(l.amount), l.currency].join(','))].join('\n')
}
