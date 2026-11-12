import { inTurn } from '../core/db.js'
import type pg from 'pg'
import { NotFound, type RouteFn } from './app.js'
import { companyProfile } from './profiles.js'
import { containsContactDetails } from '../core/contact.js'
import { requireTwoStepForMoney } from '../auth/two-step.js'
import { buyerDeal, buyerSlot } from './shapes.js'
import { answerCounter, placeBid, requestBuyNow, showInterest, withdrawBuyNow, bookFixed } from '../marketplace/market.js'
import { minNextBid } from '../core/money.js'
import { audit } from '../core/audit.js'
import { setting } from '../core/settings.js'
import { approve, buyerCancelTerms, cancelByBuyer, confirmPayment } from '../payments/payments.js'
import { addStatement, disputeView, reportIssue, respondToOffer } from '../fulfilment/issues.js'
import { uploadCreative } from '../fulfilment/creative.js'
import { confirmPreRun } from '../fulfilment/prerun.js'
import { checklistFor } from '../fulfilment/proof.js'
import { MarketError } from '../marketplace/market.js'
import { dealRating } from './routes-ratings.js'
import { byAudience, byDay, byOutlet, grid, listSlots, parseQuery, programmes, slots as searchSlots } from '../marketplace/search.js'
import { logoUrl } from './routes-covers.js'

const BUYER: ['buyer'] = ['buyer']
const money = { type: 'integer', minimum: 1 }
const campaignId = { type: 'string', format: 'uuid' }, clientId = { type: 'string', format: 'uuid' }
const brief = { type: 'object', additionalProperties: false, properties: {
  advertiser: { type: 'string', maxLength: 200 }, industry: { type: 'string', maxLength: 100 }, message: { type: 'string', maxLength: 2000 },
  language: { enum: ['arabic', 'english', 'bilingual'] }, landingUrl: { type: 'string', maxLength: 500 }, draftFileKey: { type: 'string', maxLength: 300 },
  creativeToFollow: { type: 'boolean' }, notes: { type: 'string', maxLength: 2000 }, disclaimer: { type: 'string', maxLength: 500 } } }

// Before acceptance, VAT is previewed from the publisher's VAT status; acceptance freezes it on the deal.
const DEAL_SQL = `select d.*, (select e.note from deal_events e where e.deal_id = d.id and e.event in ('decline', 'expire', 'lapse', 'cancel_by_seller', 'cancel_by_buyer', 'creative_missed', 'proof_missed', 'supersede') order by e.id desc limit 1) status_note,
  s.label, s.starts_at, s.creative_due_at, o.name outlet, o.channel, p.name placement, (select name from clients where id = d.client_id) client, coalesce(d.media_vat_bp, case when sc.vat_registered then (select (value)::int from settings where key = 'media_vat_bp' order by valid_from desc limit 1) else 0 end) vat_bp from deals d join slots s on s.id = d.slot_id
                  join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id join companies sc on sc.id = d.seller_id`

// Only markets that are open can be browsed or booked; KSA is "coming soon" (brief section 14).
const OPEN_MARKET = `(select value from settings where key = 'open_markets' order by valid_from desc limit 1) ? o.market`

/** The buyer's own deal, or not found. */
export async function ownDeal(db: pg.PoolClient, id: string, buyerId: string) {
  const d = (await db.query(`${DEAL_SQL} where d.id = $1 and d.buyer_id = $2`, [id, buyerId])).rows[0]
  if (!d) throw new NotFound()
  return d
}

export function buyerRoutes(route: RouteFn) {
  // The calendar: every bookable slot from every outlet (brief section 5). Sellers use their own calendar instead.
  // Guests can browse the calendar too (signing in is only needed to act); they get no per-buyer fields.
  // The calendar (scales to 1000+ outlets): filters, sorting, pages and summaries run in SQL; see marketplace/search.ts.
  const range = (r: any) => ({ from: r.from ?? new Date().toISOString(), to: r.to ?? new Date(Date.now() + 35 * 86_400_000).toISOString() })
  const query = (me: any, r: any) => { const { from, to } = range(r); return parseQuery(r, me?.actAs.companyId ?? null, from, to) }
  route('GET', '/api/slots', [...BUYER, 'admin', 'guest'], async ({ db, me, at }, req) =>
    (await searchSlots(db, query(me, req.query), at)).map(r => buyerSlot(r, me?.actAs.companyId ?? null)))
  route('GET', '/api/slots/list', [...BUYER, 'admin', 'guest'], async ({ db, me, at }, req) => {
    const { total, rows } = await listSlots(db, query(me, req.query), req.query.sort ?? 'time', Number(req.query.offset ?? 0), Number(req.query.limit ?? 50), at)
    return { total, items: rows.map(r => buyerSlot(r, me?.actAs.companyId ?? null)) }
  })
  route('GET', '/api/slots/programmes', [...BUYER, 'admin', 'guest'], async ({ db, me, at }, req) => programmes(db, query(me, req.query), at))
  route('GET', '/api/slots/grid', [...BUYER, 'admin', 'guest'], async ({ db, me, at }, req) => grid(db, query(me, req.query), req.query.by === 'channel' ? 'channel' : 'day', at))
  route('GET', '/api/slots/days', [...BUYER, 'admin', 'guest'], async ({ db, me, at }, req) => byDay(db, query(me, req.query), at))
  route('GET', '/api/slots/audiences', [...BUYER, 'admin', 'guest'], async ({ db, me, at }, req) =>
    (await byAudience(db, query(me, req.query), at)).map(r => ({ audience: r.audience, slots: r.slots, outlets: r.outlets, fromPrice: Number(r.from_price), channels: r.channels })))
  route('GET', '/api/slots/outlets', [...BUYER, 'admin', 'guest'], async ({ db, me, at }, req) => {
    const { total, rows } = await byOutlet(db, query(me, req.query), req.query.sort ?? 'name', Number(req.query.offset ?? 0), Number(req.query.limit ?? 50), at)
    return { total, items: rows.map(r => ({ outletId: r.outlet_id, outlet: r.outlet, channel: r.channel, logoUrl: logoUrl({ id: r.outlet_id, logo_key: r.logo_key }),
      slots: r.slots, fromPrice: Number(r.from_price), days: r.days.map((d: any) => ({ date: d.date, slots: d.slots, fromPrice: Number(d.fromPrice) })) })) }
  })

  // One slot for the bid drawer: the server says what the next bid must be, the screen never works it out.
  route('GET', '/api/slots/:id', [...BUYER, 'admin', 'guest'], async ({ db, me, at }, req) => {
    const company = me?.actAs.companyId ?? null
    const r = (await db.query(
      `select s.*, p.name placement, p.description placement_description, p.specs placement_specs, p.language placement_language, p.unit placement_unit, o.blocked_industries, o.company_id seller_company, o.id outlet_id, o.name outlet, o.logo_key, o.channel, o.sectors, o.audience, o.reach, o.reach_unit, coalesce(nullif(p.details->>'notes', ''), o.notes) notes,
         pr.id brand_id, pr.name brand, pr.logo_key brand_logo_key, (select count(*)::int from bids b where b.slot_id = s.id) bids
       from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id left join products pr on pr.id = o.product_id where s.id = $1 and s.status <> 'blocked' and ${OPEN_MARKET}`, [req.params.id])).rows[0]
    if (!r) throw new NotFound()
    const mine = (await db.query(`select max(max_amount) max, max(max_amount) filter (where max_amount > amount and kind in ('bid', 'auto')) auto_max,
      bool_or(brief is not null) has_brief, count(*) filter (where kind in ('bid', 'auto', 'interest') and status <> 'withdrawn')::int n
      from bids where slot_id = $1 and buyer_id = $2`, [r.id, company])).rows[0]
    // this buyer's own booking on the slot, if it is still going ahead (the screen says "You won" from this, not from the top bid)
    const yourDeal = company ? (await db.query(`select id, status, kind from deals where slot_id = $1 and buyer_id = $2
      and status not in ('declined', 'lapsed', 'cancelled', 'refunded') order by created_at desc limit 1`, [r.id, company])).rows[0] ?? null : null
    return { ...buyerSlot(r, company), youBid: mine.n > 0, creativeDueAt: r.creative_due_at, yourDeal,
      minNextBid: r.top_amount ? minNextBid(r.top_amount, await setting(db, 'min_step_bp', at)) : r.starting_price,
      yourMax: mine.max, yourAutoMax: mine.auto_max, briefOnFile: !!mine.has_brief,
      reach: r.reach ?? null, reachUnit: r.reach_unit ?? null, notes: r.notes ?? null,
      details: { description: r.placement_description, specs: r.placement_specs, language: r.placement_language, unit: r.placement_unit, notAccepted: r.blocked_industries ?? [] },
      publisher: await companyProfile(db, r.seller_company) }
  })

  route('POST', '/api/slots/:id/bids', BUYER, async ({ db, at, me }, req) =>
    placeBid(db, { slotId: req.params.id, buyerId: me.actAs.companyId, amount: req.body.amount, maxAmount: req.body.maxAmount, brief: req.body.brief, campaignId: req.body.campaignId, clientId: req.body.clientId }, at),
    { type: 'object', required: ['amount'], additionalProperties: false, properties: { amount: money, maxAmount: money, brief, campaignId, clientId } })

  route('POST', '/api/slots/:id/book', BUYER, async ({ db, at, me }, req) =>
    buyerDeal(await bookFixed(db, { slotId: req.params.id, buyerId: me.actAs.companyId, brief: req.body?.brief, campaignId: req.body?.campaignId, clientId: req.body?.clientId }, at)),
    { type: 'object', additionalProperties: false, properties: { brief, campaignId, clientId } })

  route('POST', '/api/slots/:id/buy-now', BUYER, async ({ db, at, me }, req) =>
    buyerDeal(await requestBuyNow(db, { slotId: req.params.id, buyerId: me.actAs.companyId, brief: req.body?.brief, campaignId: req.body?.campaignId, clientId: req.body?.clientId }, at)),
    { type: 'object', additionalProperties: false, properties: { brief, campaignId, clientId } })

  // What the buyer would owe if every bid it leads wins and every request is accepted (SPEC G13: a warning, never a block).
  route('GET', '/api/buyer/exposure', BUYER, async ({ db, me }) => {
    const b = me.actAs.companyId
    const leading = (await db.query(`select count(*)::int n, coalesce(sum(top_amount), 0)::bigint amount from slots
      where top_buyer_id = $1 and status = 'open'`, [b])).rows[0]
    const requests = (await db.query(`select count(*)::int n, coalesce(sum(amount), 0)::bigint amount from deals where buyer_id = $1 and status = 'awaiting_seller'`, [b])).rows[0]
    const toPay = (await db.query(`select count(*)::int n, coalesce(sum(amount), 0)::bigint amount from deals where buyer_id = $1 and status = 'awaiting_payment'`, [b])).rows[0]
    return { leading: { count: leading.n, amount: Number(leading.amount) }, requests: { count: requests.n, amount: Number(requests.amount) },
      toPay: { count: toPay.n, amount: Number(toPay.amount) }, total: Number(leading.amount) + Number(requests.amount) + Number(toPay.amount) }
  })

  route('POST', '/api/deals/:id/withdraw', BUYER, async ({ db, at, me }, req) =>
    buyerDeal(await withdrawBuyNow(db, req.params.id, me.actAs.companyId, at)))

  // The buyer's company: its name and TRN go on the receipts and tax invoices it receives (SPEC 11.2: TRN at onboarding).
  route('GET', '/api/buyer/company', BUYER, async ({ db, me }) => {
    const c = (await db.query(`select name, trn, address from companies where id = $1`, [me.actAs.companyId])).rows[0]
    const team = (await db.query(`select name, email, status, created_at from users where company_id = $1 order by created_at`, [me.actAs.companyId])).rows
    return { name: c.name, trn: c.trn, address: c.address, team: team.map(u => ({ name: u.name, email: u.email, status: u.status, since: u.created_at })) }
  })
  route('PUT', '/api/buyer/company', BUYER, async ({ db, at, me }, req) => {
    if (containsContactDetails(req.body.address)) throw new MarketError('Emails and phone numbers are not allowed in the address.')
    // the address is optional here: an older client may send only the TRN
    await db.query(`update companies set trn = $2, address = case when $3 then $4 else address end where id = $1`,
      [me.actAs.companyId, req.body.trn || null, 'address' in req.body, req.body.address?.trim() || null])
    await audit(db, `buyer:${me.actAs.companyId}`, 'company.tax_updated', 'company', me.actAs.companyId, { trn: req.body.trn || null, address: req.body.address }, at)
    return { ok: true }
  }, { type: 'object', required: ['trn'], additionalProperties: false, properties: { trn: { type: 'string', pattern: '^(\\d{15})?$' }, address: { type: 'string', maxLength: 300 } } })

  route('POST', '/api/slots/:id/interest', BUYER, async ({ db, at, me }, req) => {
    const b = await showInterest(db, { slotId: req.params.id, buyerId: me.actAs.companyId, amount: req.body?.amount, brief: req.body?.brief, campaignId: req.body?.campaignId, clientId: req.body?.clientId }, at)
    return { id: b.id, amount: b.amount }
  }, { type: 'object', additionalProperties: false, properties: { amount: money, brief, campaignId, clientId } })

  route('GET', '/api/deals', BUYER, async ({ db, me }) =>
    (await db.query(`${DEAL_SQL} where d.buyer_id = $1 order by d.created_at desc`, [me.actAs.companyId])).rows.map(buyerDeal))

  // The booking page: everything the buyer may see about one booking. The timeline never shows who at the publisher did what.
  route('GET', '/api/deals/:id', BUYER, async ({ db, me }, req) => {
    const d = await ownDeal(db, req.params.id, me.actAs.companyId)
    const q = async (sql: string) => (await db.query(sql, [d.id])).rows
    const [events, creatives, proofs, issues, prerun, docs] = await inTurn(q, [
      `select at, event, to_status from deal_events where deal_id = $1 order by id`,
      `select version, status, reason, file_key, file_type, uploaded_at, reviewed_at from creatives where deal_id = $1 order by version`,
      `select items, note, submitted_at from proofs where deal_id = $1 order by submitted_at desc limit 1`,
      `select reason, note, offer, status, opened_at, closed_at from issues where deal_id = $1 order by opened_at desc limit 1`,
      `select requested_at, buyer_confirmed_at from prerun_checks where deal_id = $1`,
      `select id, type, number, total, currency, issued_at from documents where deal_id = $1 and recipient_id = (select buyer_id from deals where id = $1) order by issued_at`,
    ])
    const proof = proofs[0]
    return { ...buyerDeal(d), channel: d.channel, placement: d.placement, kind: d.kind, creativeDueAt: d.creative_due_at, campaignId: d.campaign_id, clientId: d.client_id,
      timeline: events.map(e => ({ at: e.at, event: e.event, status: e.to_status })),
      creatives: creatives.map(c => ({ version: c.version, status: c.status, reason: c.reason, fileId: c.file_key.replace(/^files\//, ''),
        fileType: c.file_type, uploadedAt: c.uploaded_at, reviewedAt: c.reviewed_at })),
      proof: proof ? { submittedAt: proof.submitted_at, note: proof.note,
        items: checklistFor(d.channel, (await db.query(`select brief from bids where id = $1`, [d.bid_id])).rows[0]?.brief)
          .map(i => ({ key: i.key, label: i.label, value: proof.items[i.key] ?? null })) } : null,
      issue: issues[0] ? { reason: issues[0].reason, note: issues[0].note, offer: issues[0].offer, status: issues[0].status, openedAt: issues[0].opened_at } : null,
      dispute: issues[0] || d.decide_by ? await disputeView(db, d.id) : null,
      prerun: prerun[0] ? { requestedAt: prerun[0].requested_at, confirmedAt: prerun[0].buyer_confirmed_at } : null,
      documents: docs.map(x => ({ id: x.id, type: x.type, number: x.number, total: x.total, currency: x.currency, issuedAt: x.issued_at })),
      rating: await dealRating(db, d.id) }
  })

  route('POST', '/api/deals/:id/prerun', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await confirmPreRun(db, req.params.id, me.actAs.companyId, at)
    return { ok: true }
  })

  route('POST', '/api/deals/:id/pay', BUYER, async ({ db, at, me, provider }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await requireTwoStepForMoney(db, me.userId, 'pay', at) // the founder's setting: paying needs two-step sign-in
    return confirmPayment(provider, { dealId: req.params.id, buyerId: me.actAs.companyId, paymentMethod: req.body.paymentMethod }, at)
  }, { type: 'object', required: ['paymentMethod'], properties: { paymentMethod: { type: 'string', maxLength: 100 } } })

  route('POST', '/api/deals/:id/creative', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    // Type and size come from the stored upload, not from what the screen claims.
    const f = (await db.query(`select * from files where id = $1 and company_id = $2`, [req.body.fileId, me.actAs.companyId])).rows[0]
    if (!f) throw new MarketError('Upload the file first.')
    const c = await uploadCreative(db, { dealId: req.params.id, buyerId: me.actAs.companyId, fileKey: `files/${f.id}`, fileType: f.type, fileSize: f.size }, at)
    return { version: c.version, status: c.status, reason: c.reason }
  }, { type: 'object', required: ['fileId'], properties: { fileId: { type: 'string', format: 'uuid' } } })

  route('POST', '/api/deals/:id/approve', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await approve(db, req.params.id, `buyer:${me.actAs.companyId}`, at)
    return buyerDeal(await ownDeal(db, req.params.id, me.actAs.companyId))
  })

  // What a cancellation would refund, shown before the buyer confirms (scenario 25).
  route('GET', '/api/deals/:id/cancel-preview', BUYER, async ({ db, at, me }, req) => {
    const d = await ownDeal(db, req.params.id, me.actAs.companyId)
    return buyerCancelTerms(db, d, at)
  })

  // The buyer's answer to a publisher's counter offer: agree (accepted at that price, pay next) or keep the first offer.
  route('POST', '/api/deals/:id/counter', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await answerCounter(db, req.params.id, me.actAs.companyId, req.body.agree, `buyer:${me.actAs.companyId}`, at)
    return buyerDeal(await ownDeal(db, req.params.id, me.actAs.companyId))
  }, { type: 'object', required: ['agree'], additionalProperties: false, properties: { agree: { type: 'boolean' } } })

  route('POST', '/api/deals/:id/cancel', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await cancelByBuyer(db, req.params.id, me.actAs.companyId, at)
    return buyerDeal(await ownDeal(db, req.params.id, me.actAs.companyId))
  })

  route('POST', '/api/deals/:id/statements', BUYER, async ({ db, at, me }, req) => {
    await addStatement(db, { dealId: req.params.id, companyId: me.actAs.companyId, userId: me.userId, text: req.body.text, files: req.body.files }, at)
    return { ok: true }
  }, { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string', maxLength: 4000 },
    files: { type: 'array', maxItems: 10, items: { type: 'string', pattern: '^files/[0-9a-f-]{36}$' } } } })

  route('POST', '/api/deals/:id/issues', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await reportIssue(db, { reason: req.body.reason, note: req.body.note, evidence: req.body.evidence, dealId: req.params.id, buyerId: me.actAs.companyId }, at)
    return { ok: true }
  }, { type: 'object', required: ['reason', 'note'], additionalProperties: false, properties: { reason: { type: 'string', maxLength: 40 }, note: { type: 'string', maxLength: 2000 }, evidence: { type: 'object' } } })

  route('POST', '/api/deals/:id/issues/respond', BUYER, async ({ db, at, me }, req) => {
    await ownDeal(db, req.params.id, me.actAs.companyId)
    await respondToOffer(db, { dealId: req.params.id, buyerId: me.actAs.companyId, accept: req.body.accept }, at)
    return { ok: true }
  }, { type: 'object', required: ['accept'], properties: { accept: { type: 'boolean' } } })

}
