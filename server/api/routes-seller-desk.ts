import { inTurn } from '../core/db.js'
import type pg from 'pg'
import { NotFound, type RouteFn } from './app.js'
import { MarketError } from '../marketplace/market.js'
import { addStatement, disputeView } from '../fulfilment/issues.js'
import { requireTwoStepForMoney } from '../auth/two-step.js'
import { split } from '../core/money.js'
import { audit } from '../core/audit.js'
import { balance } from '../payments/ledger.js'
import { FakeProvider, type PaymentProvider } from '../payments/provider.js'
import { generateSlots } from '../catalog/placements.js'
import { confirmPreRun } from '../fulfilment/prerun.js'
import { checklistFor } from '../fulfilment/proof.js'
import { REJECT_REASONS } from '../fulfilment/creative.js'
import { uploadMediaInvoice, payoutStatement, statement } from '../documents/documents.js'
import { containsContactDetails } from '../core/contact.js'
import { setting } from '../core/settings.js'
import { companyProfile } from './profiles.js'
import { AUDIENCE_KEYS } from '../shared/audiences.js'
import { coverUrl, logoUrl } from './routes-covers.js'

const SELLER: ['seller'] = ['seller']
const HELD = `('secured', 'in_review', 'issue_open', 'disputed')`
const payoutOf = (d: any) => split(d.amount, { commissionBp: d.commission_bp ?? 0, mediaVatBp: d.media_vat_bp ?? 0, feeVatBp: d.fee_vat_bp ?? 0 })
const fileId = (key: string | null) => key ? key.replace(/^files\//, '') : null

/** What the seller has to do now, oldest deadline first (the inbox and the dashboard count). */
async function inbox(db: pg.PoolClient, me: string, at: Date) {
  const q = async (sql: string) => (await db.query(sql, [me, at])).rows
  const base = `from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
                join companies b on b.id = d.buyer_id where d.seller_id = $1`
  const cols = `d.id deal_id, d.ref, s.id slot_id, s.label, s.starts_at, o.name outlet, b.name buyer, d.amount, coalesce(d.amount < s.reserve_price, false) below_reserve`
  const rows = [
    ...(await q(`select 'decide' type, ${cols}, d.next_deadline_at due, d.kind ${base} and d.status = 'awaiting_seller' and $2::timestamptz is not null`)),
    ...(await q(`select 'choose' type, null deal_id, null ref, s.id slot_id, s.label, s.starts_at, o.name outlet, null buyer, s.top_amount amount, false below_reserve, s.choice_deadline_at due, null kind
                 from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
                 where o.company_id = $1 and s.status = 'awaiting_choice' and s.choice_deadline_at > $2`)),
    ...(await q(`select 'interest' type, null deal_id, null ref, s.id slot_id, s.label, s.starts_at, o.name outlet,
                 (select case when count(*) = 1 then max(c.name) end from bids b join companies c on c.id = b.buyer_id
                   where b.slot_id = s.id and b.kind = 'interest' and b.status = 'active') buyer,
                 (select count(*)::int from bids b where b.slot_id = s.id and b.kind = 'interest' and b.status = 'active') interested,
                 (select max(b.amount) from bids b where b.slot_id = s.id and b.kind = 'interest' and b.status = 'active') amount,
                 false below_reserve, s.closes_at due, 'interest' kind
                 from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
                 where o.company_id = $1 and s.status = 'open' and s.sale_type = 'quick_sale' and s.closes_at > $2
                 and exists (select 1 from bids b where b.slot_id = s.id and b.kind = 'interest' and b.status = 'active')`)),
    ...(await q(`select 'creative' type, ${cols}, s.creative_due_at due, null kind ${base} and d.status in ('awaiting_payment', 'secured') and $2::timestamptz is not null
                 and (select c.status from creatives c where c.deal_id = d.id order by c.version desc limit 1) = 'pending'`)),
    ...(await q(`select 'creative_missing' type, ${cols}, s.creative_due_at due, null kind ${base} and d.status = 'secured' and s.creative_due_at <= $2
                 and d.placeholder is not true and not exists (select 1 from creatives c where c.deal_id = d.id and c.status = 'approved')`)),
    ...(await q(`select 'proof' type, ${cols}, d.next_deadline_at due, null kind ${base} and d.status = 'secured' and coalesce(d.make_good_at, s.starts_at) <= $2`)),
    ...(await q(`select 'issue' type, ${cols}, d.next_deadline_at due, null kind ${base} and d.status = 'issue_open' and $2::timestamptz is not null
                 and exists (select 1 from issues i where i.deal_id = d.id and i.status = 'open' and i.offer is null)`)),
    ...(await q(`select 'prerun' type, ${cols}, coalesce(d.make_good_at, s.starts_at) due, null kind ${base} and d.status = 'secured' and $2::timestamptz is not null
                 and exists (select 1 from prerun_checks r where r.deal_id = d.id and r.seller_confirmed_at is null)`)),
    ...(await q(`select 'invoice' type, ${cols}, null::timestamptz due, null kind ${base} and $2::timestamptz is not null
                 and (select invoice_mode from companies where id = $1) = 'upload' and d.status in ('secured', 'in_review', 'released', 'paid_out')
                 and not exists (select 1 from documents x where x.deal_id = d.id and x.type = 'media_invoice')`)),
  ]
  return rows.sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity)).map(r => ({
    type: r.type, dealId: r.deal_id, ref: r.ref, slotId: r.slot_id, outlet: r.outlet, label: r.label, startsAt: r.starts_at,
    buyer: r.buyer, amount: r.amount, dueAt: r.due, kind: r.kind, belowReserve: r.type === 'decide' && r.below_reserve, ...(r.type === 'interest' ? { interested: r.interested } : {}) }))
}

export function sellerDeskRoutes(route: RouteFn, deps: { provider: PaymentProvider }) {
  route('GET', '/api/seller/inbox', SELLER, async ({ db, at, me }) => inbox(db, me.actAs.companyId, at))

  route('GET', '/api/seller/overview', SELLER, async ({ db, at, me }) => {
    const id = me.actAs.companyId
    const c = (await db.query(`select name, trn, vat_registered, invoice_mode, payouts_enabled from companies where id = $1`, [id])).rows[0]
    const counts = (await db.query(`select (select count(*)::int from outlets where company_id = $1) outlets,
        (select count(*)::int from placements p join outlets o on o.id = p.outlet_id where o.company_id = $1 and not p.archived) placements,
        (select count(*)::int from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where o.company_id = $1 and s.status = 'open' and s.starts_at > $2) open_slots`,
      [id, at])).rows[0]
    const held = (await db.query(`select * from deals where seller_id = $1 and status in ${HELD}`, [id])).rows
    const upcoming = (await db.query(`select d.id, d.ref, d.status, s.label, s.starts_at, o.name outlet, b.name buyer from deals d join slots s on s.id = d.slot_id
        join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id join companies b on b.id = d.buyer_id
        where d.seller_id = $1 and d.status in ('awaiting_payment', 'secured') and s.starts_at > $2 order by s.starts_at limit 6`, [id, at])).rows
    const todo = await inbox(db, id, at)
    return {
      company: c.name, todo: todo.length, todoByType: todo.reduce((m: any, t) => ({ ...m, [t.type]: (m[t.type] ?? 0) + 1 }), {}),
      money: { available: 0 - await balance(db, `seller_payable:${id}`, 'AED'), held: held.reduce((n, d) => n + payoutOf(d).payout, 0),
        owed: await balance(db, `seller_receivable:${id}`, 'AED') },
      onboarding: { outlet: counts.outlets > 0, payouts: c.payouts_enabled, tax: c.trn != null, placement: counts.placements > 0, live: counts.open_slots > 0 },
      upcoming: upcoming.map(u => ({ id: u.id, ref: u.ref, status: u.status, label: u.label, startsAt: u.starts_at, outlet: u.outlet, buyer: u.buyer })),
    }
  })

  // One slot for the seller's calendar panel: bids by company (buyers' contact details never), deals, reserve.
  route('GET', '/api/seller/slots/:id', SELLER, async ({ db, me, at }, req) => {
    const s = (await db.query(`select s.*, p.name placement, o.name outlet, o.channel from slots s join placements p on p.id = s.placement_id
        join outlets o on o.id = p.outlet_id where s.id = $1 and o.company_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!s) throw new NotFound()
    const bids = (await db.query(`select b.id, b.kind, b.amount, b.status, b.created_at, b.brief, b.buyer_id, c.name from bids b join companies c on c.id = b.buyer_id
        where b.slot_id = $1 and b.status <> 'withdrawn' order by b.amount desc, b.seq`, [s.id])).rows
    const deals = (await db.query(`select id, ref, status, amount, kind from deals where slot_id = $1 order by created_at desc`, [s.id])).rows
    const profiles = new Map<string, unknown>()
    for (const b of bids) if (!profiles.has(b.buyer_id)) profiles.set(b.buyer_id, await companyProfile(db, b.buyer_id))
    return { id: s.id, outlet: s.outlet, channel: s.channel, placement: s.placement, label: s.label, kind: s.kind, saleType: s.sale_type, status: s.status,
      startsAt: s.starts_at, endsAt: s.ends_at, closesAt: s.closes_at, creativeDueAt: s.creative_due_at, choiceDeadlineAt: s.choice_deadline_at,
      startingPrice: s.starting_price, buyNowPrice: s.buy_now_price, reservePrice: s.reserve_price, topBid: s.top_amount,
      bids: bids.map(b => ({ id: b.id, kind: b.kind, amount: b.amount, status: b.status, at: b.created_at, company: b.name,
        choosable: s.status === 'awaiting_choice' && ['active', 'outbid'].includes(b.status),
        acceptable: s.status === 'open' && s.sale_type === 'quick_sale' && b.kind === 'interest' && b.status === 'active' && new Date(s.closes_at) > at,
        profile: profiles.get(b.buyer_id), brief: b.brief ? { advertiser: b.brief.advertiser ?? null, industry: b.brief.industry ?? null, message: b.brief.message ?? null, language: b.brief.language ?? null, notes: b.brief.notes ?? null } : null })),
      deals: deals.map(d => ({ id: d.id, ref: d.ref, status: d.status, amount: d.amount, kind: d.kind })) }
  })

  // A seller can take a slot off sale while nobody has bid on it, and put it back.
  route('POST', '/api/seller/slots/:id/block', SELLER, async ({ db, at, me }, req) => {
    const r = await db.query(`update slots s set status = case when $3 then 'blocked' else 'open' end from placements p, outlets o
        where s.id = $1 and p.id = s.placement_id and o.id = p.outlet_id and o.company_id = $2
          and s.status = case when $3 then 'open' else 'blocked' end and not exists (select 1 from bids b where b.slot_id = s.id)
          and ($3 or s.closes_at > $4) returning s.id`, [req.params.id, me.actAs.companyId, req.body.blocked, at])
    if (!r.rowCount) throw new MarketError(req.body.blocked ? 'Only open slots with no bids can be taken off sale.' : 'This slot cannot be put back on sale.')
    await audit(db, `seller:${me.actAs.companyId}`, req.body.blocked ? 'slot.blocked' : 'slot.unblocked', 'slot', req.params.id, null, at)
    return { ok: true }
  }, { type: 'object', required: ['blocked'], properties: { blocked: { type: 'boolean' } } })

  // The deal page: everything the seller needs to fulfil one booking.
  route('GET', '/api/seller/deals/:id/detail', SELLER, async ({ db, at, me }, req) => {
    const d = (await db.query(`select d.*, s.creative_due_at, s.status slot_status, s.choice_deadline_at, s.starts_at, o.channel, c.invoice_mode
        from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
        join companies c on c.id = d.seller_id where d.id = $1 and d.seller_id = $2`, [req.params.id, me.actAs.companyId])).rows[0]
    if (!d) throw new NotFound()
    const q = async (sql: string) => (await db.query(sql, [d.id])).rows
    const [events, creatives, proofs, issues, prerun, docs] = await inTurn(q, [
      `select at, event, to_status, note from deal_events where deal_id = $1 order by id`,
      `select version, status, reason, file_key, file_type, file_size, uploaded_at from creatives where deal_id = $1 order by version`,
      `select items, note, submitted_at from proofs where deal_id = $1 order by submitted_at desc limit 1`,
      `select reason, note, evidence, offer, status, opened_at from issues where deal_id = $1 order by opened_at desc limit 1`,
      `select requested_at, seller_confirmed_at from prerun_checks where deal_id = $1`,
      `select id, type, number, total, currency, issued_at from documents where deal_id = $1 and (issuer_id = (select seller_id from deals where id = $1)
           or recipient_id = (select seller_id from deals where id = $1) or (type = 'media_invoice' and on_behalf) or type = 'order') order by issued_at`,
    ])
    const p = proofs[0], i = issues[0]
    return {
      channel: d.channel, creativeDueAt: d.creative_due_at, slotId: d.slot_id, slotStatus: d.slot_status, choiceDeadlineAt: d.choice_deadline_at,
      invoiceMode: d.invoice_mode, placeholder: d.placeholder, rejectReasons: REJECT_REASONS,
      proofChecklist: checklistFor(d.channel, (await db.query(`select brief from bids where id = $1`, [d.bid_id])).rows[0]?.brief), adHasRun: at >= (d.make_good_at ?? d.ends_at ?? d.starts_at),
      timeline: events.map(e => ({ at: e.at, event: e.event, status: e.to_status, note: e.note })),
      creatives: creatives.map(c => ({ version: c.version, status: c.status, reason: c.reason, fileId: fileId(c.file_key), fileType: c.file_type, fileSize: c.file_size, uploadedAt: c.uploaded_at })),
      proof: p ? { submittedAt: p.submitted_at, note: p.note, items: p.items } : null,
      issue: i ? { reason: i.reason, note: i.note, evidence: i.evidence, offer: i.offer, status: i.status, openedAt: i.opened_at } : null,
      dispute: i || d.decide_by ? await disputeView(db, d.id) : null,
      prerun: prerun[0] ? { requestedAt: prerun[0].requested_at, confirmedAt: prerun[0].seller_confirmed_at } : null,
      documents: docs.map(x => ({ id: x.id, type: x.type, number: x.number, total: x.total, currency: x.currency, issuedAt: x.issued_at })),
    }
  })

  route('POST', '/api/seller/deals/:id/prerun', SELLER, async ({ db, at, me }, req) => {
    await confirmPreRun(db, req.params.id, me.actAs.companyId, at)
    return { ok: true }
  })

  // After the provider's pages: ask whether the account can receive payouts yet (the webhook also tells us).
  route('POST', '/api/seller/payouts/refresh', SELLER, async ({ db, at, me }) => {
    const c = (await db.query(`select provider_account, payouts_enabled from companies where id = $1`, [me.actAs.companyId])).rows[0]
    if (!deps.provider.payoutAccount || !c.provider_account) return { payoutsEnabled: c.payouts_enabled }
    const ready = await deps.provider.payoutAccount.ready(c.provider_account)
    if (ready !== c.payouts_enabled) {
      await db.query(`update companies set payouts_enabled = $2 where id = $1`, [me.actAs.companyId, ready])
      await audit(db, `seller:${me.actAs.companyId}`, ready ? 'payouts.connected' : 'payouts.disabled', 'company', me.actAs.companyId, null, at)
    }
    return { payoutsEnabled: ready }
  })

  route('POST', '/api/seller/deals/:id/invoice', SELLER, async ({ db, at, me }, req) => {
    const f = (await db.query(`select id from files where id = $1 and company_id = $2`, [req.body.fileId, me.actAs.companyId])).rows[0]
    if (!f) throw new MarketError('Upload the invoice file first.')
    const x = await uploadMediaInvoice(db, { dealId: req.params.id, sellerId: me.actAs.companyId, number: req.body.number, fileKey: `files/${f.id}` }, at)
    return { id: x.id }
  }, { type: 'object', required: ['number', 'fileId'], properties: { number: { type: 'string', minLength: 1, maxLength: 60 }, fileId: { type: 'string', format: 'uuid' } } })

  // Earnings: what is held for bookings in progress, what is released and waiting for transfer, and every payout.
  route('GET', '/api/seller/earnings', SELLER, async ({ db, me }) => {
    const id = me.actAs.companyId
    const deals = (await db.query(`select d.*, s.label, s.starts_at, o.name outlet from deals d join slots s on s.id = d.slot_id
        join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
        where d.seller_id = $1 and d.status in ${HELD.slice(0, -1)}, 'released', 'paid_out') order by s.starts_at desc limit 500`, [id])).rows
    const payouts = (await db.query(`select at, amount, currency, ref from ledger_entries where debit = $1 and credit = 'cash' order by id desc limit 100`,
      [`seller_payable:${id}`])).rows
    return {
      available: 0 - await balance(db, `seller_payable:${id}`, 'AED'), owed: await balance(db, `seller_receivable:${id}`, 'AED'),
      deals: deals.map(d => { const s = payoutOf(d); return { id: d.id, ref: d.ref, status: d.status, outlet: d.outlet, label: d.label, startsAt: d.starts_at,
        price: d.amount, mediaVat: s.mediaVat, fee: s.fee, feeVat: s.feeVat, payout: s.payout, held: HELD.includes(`'${d.status}'`) } }),
      payouts: payouts.map(p => ({ at: p.at, amount: p.amount, currency: p.currency, ref: p.ref })),
    }
  })

  route('GET', '/api/seller/statement/:month', SELLER, async ({ db, me }, req, reply) => {
    if (!/^\d{4}-\d{2}$/.test(req.params.month)) throw new NotFound()
    return reply.type('text/csv').header('content-disposition', `attachment; filename="nashr-statement-${req.params.month}.csv"`)
      .send(await payoutStatement(db, me.actAs.companyId, req.params.month))
  })
  route('GET', '/api/seller/statements/:month', SELLER, async ({ db, me }, req) => {
    if (!/^\d{4}-\d{2}$/.test(req.params.month)) throw new NotFound()
    return statement(db, me.actAs.companyId, req.params.month)
  })

  // The rate card the publisher shares at onboarding (SPEC 12.1): any file it uploaded; the Nashr team reads it on the account page.
  route('PUT', '/api/seller/rate-card', SELLER, async ({ db, at, me }, req) => {
    const f = (await db.query(`select id, name from files where id = $1 and company_id = $2`, [req.body.fileId, me.actAs.companyId])).rows[0]
    if (!f) throw new MarketError('Upload the file first.')
    await db.query(`update companies set rate_card_file = $2 where id = $1`, [me.actAs.companyId, f.id])
    await audit(db, `seller:${me.actAs.companyId}`, 'company.rate_card_set', 'company', me.actAs.companyId, { file: f.id }, at)
    return { fileId: f.id, name: f.name }
  }, { type: 'object', required: ['fileId'], additionalProperties: false, properties: { fileId: { type: 'string', format: 'uuid' } } })
  route('DELETE', '/api/seller/rate-card', SELLER, async ({ db, at, me }) => {
    await db.query(`update companies set rate_card_file = null where id = $1`, [me.actAs.companyId])
    await audit(db, `seller:${me.actAs.companyId}`, 'company.rate_card_removed', 'company', me.actAs.companyId, null, at)
    return { ok: true }
  })

  // Listings and profile.
  route('GET', '/api/seller/profile', SELLER, async ({ db, me, at }) => {
    const c = (await db.query(`select c.name, c.trn, c.address, c.vat_registered, c.invoice_mode, c.payouts_enabled, f.id rate_card_id, f.name rate_card_name
      from companies c left join files f on f.id = c.rate_card_file where c.id = $1`, [me.actAs.companyId])).rows[0]
    const outlets = (await db.query(`select * from outlets where company_id = $1 order by name`, [me.actAs.companyId])).rows
    const placements = (await db.query(`select p.*, o.name outlet,
        (select count(*)::int from slots s where s.placement_id = p.id and s.status = 'open' and s.starts_at > now()) open_slots,
        (select max(s.air_date)::text from slots s where s.placement_id = p.id) listed_until
        from placements p join outlets o on o.id = p.outlet_id where o.company_id = $1 order by p.archived, o.name, p.name`, [me.actAs.companyId])).rows
    return {
      // the placement form works out the earliest closing time from these (SPEC 12.1 "deadlines must fit")
      windows: { sellerHours: await setting<number>(db, 'seller_window_hours', at), paymentHours: await setting<number>(db, 'payment_window_hours', at) },
      company: { name: c.name, trn: c.trn, address: c.address, vatRegistered: c.vat_registered, invoiceMode: c.invoice_mode, payoutsEnabled: c.payouts_enabled,
        rateCard: c.rate_card_id ? { fileId: c.rate_card_id, name: c.rate_card_name } : null },
      outlets: outlets.map(o => ({ id: o.id, name: o.name, nameAr: o.name_ar, channel: o.channel, sectors: o.sectors, description: o.description,
        website: o.website, audience: o.audience, coverUrl: coverUrl(o), logoUrl: logoUrl(o), audiences: o.audiences, blockedIndustries: o.blocked_industries,
        blockedAdvertisers: o.blocked_advertisers, reach: o.reach })),
      placements: placements.map(p => ({ id: p.id, outlet: p.outlet, outletId: p.outlet_id, name: p.name, saleType: p.sale_type, days: p.days,
        startsAt: p.starts_at_local, endsAt: p.ends_at_local, breaks: p.breaks, startingPrice: p.starting_price, anyBreakPrice: p.any_break_price,
        packagePrice: p.package_price, buyNowPrice: p.buy_now_price, reservePrice: p.reserve_price, creativeLeadHours: p.creative_lead_hours,
        closeLeadHours: p.close_lead_hours, autoAccept: p.auto_accept, archived: p.archived, openSlots: p.open_slots, listedUntil: p.listed_until,
        format: p.format, description: p.description, specs: p.specs, language: p.language, unit: p.unit, listing: p.listing, horizonWeeks: p.horizon_weeks,
        separation: p.separation, audiences: p.audiences })),
    }
  })

  const outletBody = { type: 'object', additionalProperties: false, properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 }, nameAr: { type: 'string', maxLength: 200 }, channel: { enum: ['print', 'digital', 'radio', 'tv', 'podcast'] },
    sectors: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 60 } }, description: { type: 'string', maxLength: 2000 },
    website: { type: 'string', maxLength: 300, pattern: '^https?://' }, audience: { type: 'string', maxLength: 300 },
    audiences: { type: 'array', maxItems: 12, uniqueItems: true, items: { enum: AUDIENCE_KEYS } },
    blockedIndustries: { type: 'array', maxItems: 30, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 60 } },
    blockedAdvertisers: { type: 'array', maxItems: 30, uniqueItems: true, items: { type: 'string', minLength: 2, maxLength: 80 } },
    reach: { type: 'integer', minimum: 1, maximum: 50_000_000 } } }
  const checkText = (b: any) => { if (containsContactDetails([b.name, b.nameAr, b.description, b.audience, ...(b.sectors ?? [])].filter(Boolean).join(' \n ')))
    throw new MarketError('Emails and phone numbers are not allowed in the profile.') }

  route('POST', '/api/seller/outlets', SELLER, async ({ db, at, me }, req) => {
    const b = req.body; checkText(b)
    const o = (await db.query(`insert into outlets (company_id, name, name_ar, channel, sectors, description, website, audience, audiences, blocked_industries, blocked_advertisers, reach)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [me.actAs.companyId, b.name, b.nameAr ?? null, b.channel, b.sectors ?? [], b.description ?? null, b.website ?? null, b.audience ?? null,
       b.audiences ?? [], b.blockedIndustries ?? [], b.blockedAdvertisers ?? [], b.reach ?? null])).rows[0]
    await audit(db, `seller:${me.actAs.companyId}`, 'outlet.created', 'outlet', o.id, { name: b.name }, at)
    return { id: o.id }
  }, { ...outletBody, required: ['name', 'channel'] })

  // Sectors are free text and live straight away (owner, SPEC 12.3).
  route('PUT', '/api/seller/outlets/:id', SELLER, async ({ db, at, me }, req) => {
    const b = req.body; checkText(b)
    const cols: Record<string, string> = { name: 'name', nameAr: 'name_ar', sectors: 'sectors', description: 'description', website: 'website', audience: 'audience',
      audiences: 'audiences', blockedIndustries: 'blocked_industries', blockedAdvertisers: 'blocked_advertisers', reach: 'reach' }
    const set = Object.keys(cols).filter(k => k in b)
    if (!set.length) throw new MarketError('Nothing to change.')
    const r = await db.query(`update outlets set ${set.map((k, i) => `${cols[k]} = $${i + 3}`).join(', ')} where id = $1 and company_id = $2`,
      [req.params.id, me.actAs.companyId, ...set.map(k => b[k])])
    if (!r.rowCount) throw new NotFound()
    await audit(db, `seller:${me.actAs.companyId}`, 'outlet.updated', 'outlet', req.params.id, { fields: set }, at)
    return { ok: true }
  }, (({ channel, ...properties }) => ({ ...outletBody, properties }))(outletBody.properties))

  route('PUT', '/api/seller/company', SELLER, async ({ db, at, me }, req) => {
    const b = req.body
    if (b.vatRegistered && !b.trn) throw new MarketError('A VAT-registered publisher needs its TRN on invoices.')
    if (containsContactDetails(b.address)) throw new MarketError('Emails and phone numbers are not allowed in the address.')
    await db.query(`update companies set trn = $2, vat_registered = $3, invoice_mode = $4, address = case when $5 then $6 else address end where id = $1`,
      [me.actAs.companyId, b.trn || null, b.vatRegistered, b.invoiceMode, 'address' in b, b.address?.trim() || null])
    await audit(db, `seller:${me.actAs.companyId}`, 'company.tax_updated', 'company', me.actAs.companyId, b, at)
    return { ok: true }
  }, { type: 'object', required: ['vatRegistered', 'invoiceMode'], additionalProperties: false, properties: {
    trn: { type: 'string', pattern: '^(\\d{15})?$' }, vatRegistered: { type: 'boolean' }, invoiceMode: { enum: ['generate', 'upload'] }, address: { type: 'string', maxLength: 300 } } })

  // ponytail: payout onboarding is the provider's hosted flow (Stripe Connect, B5). With the test provider it verifies at once.
  // Real provider: open (or continue) the publisher's onboarding on the provider's own pages; we come back to the profile.
  // the publisher's side of a dispute while Nashr decides
  route('POST', '/api/seller/deals/:id/statements', SELLER, async ({ db, at, me }, req) => {
    await addStatement(db, { dealId: req.params.id, companyId: me.actAs.companyId, userId: me.userId, text: req.body.text, files: req.body.files }, at)
    return { ok: true }
  }, { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string', maxLength: 4000 },
    files: { type: 'array', maxItems: 10, items: { type: 'string', pattern: '^files/[0-9a-f-]{36}$' } } } })

  route('POST', '/api/seller/payouts/connect', SELLER, async ({ db, at, me }, req) => {
    await requireTwoStepForMoney(db, me.userId, 'payouts', at) // where money goes out, two-step sign-in first (founder's setting)
    const pa = deps.provider.payoutAccount
    if (pa) {
      const c = (await db.query(`select id, name, provider_account from companies where id = $1`, [me.actAs.companyId])).rows[0]
      const email = (await db.query(`select email from users where id = $1`, [me.userId])).rows[0]?.email
      const account = c.provider_account ?? await pa.create({ companyId: c.id, name: c.name, email })
      if (!c.provider_account) {
        await db.query(`update companies set provider_account = $2 where id = $1`, [c.id, account])
        await audit(db, `seller:${c.id}`, 'payouts.started', 'company', c.id, { account }, at)
      }
      const origin = `${req.protocol}://${req.headers.host}`
      return { url: await pa.link(account, `${origin}/profile?payouts=back`, `${origin}/profile?payouts=retry`) }
    }
    if (!(deps.provider instanceof FakeProvider)) throw new MarketError('Payout onboarding opens with the payment provider. It is not connected yet.')
    await db.query(`update companies set provider_account = coalesce(provider_account, 'acct_test_' || substr(md5(id::text), 1, 8)), payouts_enabled = true where id = $1`, [me.actAs.companyId])
    await audit(db, `seller:${me.actAs.companyId}`, 'payouts.connected', 'company', me.actAs.companyId, { provider: 'test' }, at)
    return { ok: true }
  })

  route('POST', '/api/seller/placements/:id/slots', SELLER, async ({ db, at, me }, req) => {
    const p = (await db.query(`select p.id from placements p join outlets o on o.id = p.outlet_id where p.id = $1 and o.company_id = $2 and not p.archived`,
      [req.params.id, me.actAs.companyId])).rows[0]
    if (!p) throw new NotFound()
    return { slots: await generateSlots(db, p.id, req.body.from, req.body.days, at) }
  }, { type: 'object', required: ['from', 'days'], properties: { from: { type: 'string', format: 'date' }, days: { type: 'integer', minimum: 1, maximum: 120 } } })

  // Archiving stops new listings; slots already on sale stay as they are.
  route('POST', '/api/seller/placements/:id/archive', SELLER, async ({ db, at, me }, req) => {
    const r = await db.query(`update placements p set archived = $3 from outlets o where p.id = $1 and o.id = p.outlet_id and o.company_id = $2`,
      [req.params.id, me.actAs.companyId, req.body.archived])
    if (!r.rowCount) throw new NotFound()
    await audit(db, `seller:${me.actAs.companyId}`, req.body.archived ? 'placement.archived' : 'placement.restored', 'placement', req.params.id, null, at)
    return { ok: true }
  }, { type: 'object', required: ['archived'], properties: { archived: { type: 'boolean' } } })
}
