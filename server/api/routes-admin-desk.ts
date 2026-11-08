import { NotFound, type RouteFn } from './app.js'
import { MarketError } from '../marketplace/market.js'
import { audit } from '../core/audit.js'
import { checklistFor } from '../fulfilment/proof.js'
import { met, scorecard } from './scorecard.js'
import { resetTwoStep } from '../auth/two-step.js'
import { disputeView } from '../fulfilment/issues.js'
import { split } from '../core/money.js'
import { balance } from '../payments/ledger.js'
import { reconcile } from '../payments/payments.js'
import type { PaymentProvider } from '../payments/provider.js'
import { allowExtraRound } from '../fulfilment/creative.js'
import { inviteStaff, issueReset } from '../auth/access.js'
import { FOUNDER_ONLY } from './routes-admin.js'
import { coverUrl, logoUrl } from './routes-covers.js'
import { dealRating } from './routes-ratings.js'
import { staffTwoStep } from '../auth/access.js'
import { byDay, byOutlet, listSlots, scopedQuery } from '../marketplace/search.js'
import { sellerSlot } from './shapes.js'

const STAFF: ['admin'] = ['admin'] // founders pass every admin check (app.ts)
const LIVE = `('secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out')` // paid bookings
const liability = async (db: any, account: string) => 0 - await balance(db, account, 'AED')
const sumLike = async (db: any, prefix: string) => (await db.query(
  `select (coalesce(sum(case when debit like $1 then amount else 0 end), 0) - coalesce(sum(case when credit like $1 then amount else 0 end), 0))::bigint b
   from ledger_entries where (debit like $1 or credit like $1) and currency = 'AED'`, [`${prefix}%`])).rows[0].b as number

export function adminDeskRoutes(route: RouteFn, deps: { provider: PaymentProvider }) {
  route('GET', '/api/admin/overview', STAFF, async ({ db, at }) => {
    const month = `date_trunc('month', $1::timestamptz at time zone 'Asia/Dubai')`
    const k = (await db.query(`select
        (select count(*)::int from access_requests where status = 'pending') access_pending,
        (select count(distinct user_id)::int from password_resets where issued_at is null and used_at is null) resets_pending,
        -- money held 60+ days (SPEC G4): release or refund it before the provider's holding limits bite
        (select count(*)::int from deals d where d.status in ('secured', 'in_review', 'issue_open', 'disputed')
          and exists (select 1 from money_ops m where m.deal_id = d.id and m.kind = 'charge' and m.status = 'succeeded' and m.created_at < $1::timestamptz - interval '60 days')) held_60,
        (select count(*)::int from quote_requests where status = 'open') quotes_open,
        (select count(*)::int from support_requests where status = 'open') support_open,
        (select count(*)::int from deals where status = 'disputed') disputes,
        (select count(*)::int from deals where status = 'disputed' and decide_by < $1 and coalesce(chargeback, '') <> 'open') disputes_overdue,
        (select count(*)::int from deals where status = 'issue_open') issues,
        (select count(*)::int from money_ops where status = 'failed') failed_ops,
        (select count(*)::int from money_ops where status = 'pending' and kind <> 'charge') pending_ops,
        (select coalesce(sum(d.amount), 0)::bigint from deals d where d.status in ${LIVE} and d.created_at at time zone 'Asia/Dubai' >= ${month}) gmv_month,
        (select count(*)::int from deals d where d.status in ${LIVE} and d.created_at at time zone 'Asia/Dubai' >= ${month}) bookings_month,
        (select count(*)::int from companies where type = 'publisher' and payouts_enabled) publishers_live,
        (select count(*)::int from companies where type = 'buyer') buyers`, [at])).rows[0]
    const byStatus = (await db.query(`select status, count(*)::int n from deals group by status`)).rows
    const r = await reconcile(deps.provider, 'AED')
    return { ...k, revenue: await liability(db, 'nashr_revenue'), held: await liability(db, 'held'), reconcile: r,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s.n])) }
  })

  // Accounts: every buyer and publisher company, with users.
  route('GET', '/api/admin/companies', STAFF, async ({ db }, req) => (await db.query(
    `select c.id, c.name, c.type, c.trn, c.vat_registered, c.payouts_enabled, c.invoice_mode, c.created_at,
       (select count(*)::int from users u where u.company_id = c.id) users,
       (select count(*)::int from users u where u.company_id = c.id and u.status = 'suspended') suspended,
       (select coalesce(sum(d.amount), 0)::bigint from deals d where (d.buyer_id = c.id or d.seller_id = c.id) and d.status in ${LIVE}) gmv,
       (select (value)::int from settings where key = 'commission:' || c.id order by valid_from desc limit 1) commission_bp
     from companies c where c.type <> 'nashr' and ($1::text is null or c.type = $1) order by c.name`, [req.query.type ?? null])).rows
    .map(c => ({ id: c.id, name: c.name, type: c.type, trn: c.trn, vatRegistered: c.vat_registered, payoutsEnabled: c.payouts_enabled,
      invoiceMode: c.invoice_mode, createdAt: c.created_at, users: c.users, suspended: c.suspended, gmv: c.gmv, commissionBp: c.commission_bp })))

  route('GET', '/api/admin/companies/:id', STAFF, async ({ db }, req) => {
    const c = (await db.query(`select * from companies where id = $1 and type <> 'nashr'`, [req.params.id])).rows[0]
    if (!c) throw new NotFound()
    const users = (await db.query(`select id, name, email, phone, role, status, totp_enabled, created_at,
        exists (select 1 from password_resets r where r.user_id = users.id and r.issued_at is null and r.used_at is null) reset_requested
      from users where company_id = $1 order by created_at`, [c.id])).rows
    const outlets = (await db.query(`select id, name, channel, sectors, logo_key from outlets where company_id = $1 order by name`, [c.id])).rows
    const deals = (await db.query(`select d.id, d.ref, d.status, d.amount, d.created_at, s.label, o.name outlet from deals d join slots s on s.id = d.slot_id
        join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id where d.buyer_id = $1 or d.seller_id = $1 order by d.created_at desc limit 50`, [c.id])).rows
    const commission = (await db.query(`select value, valid_from, changed_by from settings where key = $1 order by valid_from desc`, [`commission:${c.id}`])).rows
    return { id: c.id, name: c.name, type: c.type, trn: c.trn, vatRegistered: c.vat_registered, payoutsEnabled: c.payouts_enabled,
      invoiceMode: c.invoice_mode, providerAccount: c.provider_account, createdAt: c.created_at,
      rateCard: c.rate_card_file ? (await db.query(`select id "fileId", name from files where id = $1`, [c.rate_card_file])).rows[0] : null,
      balance: c.type === 'publisher' ? { payable: await liability(db, `seller_payable:${c.id}`), owed: await balance(db, `seller_receivable:${c.id}`, 'AED') } : null,
      users: users.map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, twoFactor: u.totp_enabled && (!['admin', 'founder'].includes(u.role) || staffTwoStep()), createdAt: u.created_at, resetRequested: u.reset_requested })),
      outlets: outlets.map(o => ({ id: o.id, name: o.name, channel: o.channel, sectors: o.sectors, logoUrl: logoUrl(o) })),
      deals: deals.map(d => ({ id: d.id, ref: d.ref, status: d.status, amount: d.amount, createdAt: d.created_at, label: d.label, outlet: d.outlet })),
      commissionHistory: commission.map(h => ({ bp: h.value, from: h.valid_from, by: h.changed_by })) }
  })

  // Calendar oversight (brief section 17): every slot on the platform, in every status, filtered, sorted and paged on the server.
  route('GET', '/api/admin/slots/list', STAFF, async ({ db, at }, req) => {
    const { total, rows } = await listSlots(db, scopedQuery(req.query, 'admin', null), req.query.sort ?? 'time', Number(req.query.offset ?? 0), Number(req.query.limit ?? 50), at)
    return { total, items: rows.map(r => ({ ...sellerSlot(r), outletId: r.outlet_id, company: r.company, dealId: r.deal_id })) }
  })
  route('GET', '/api/admin/slots/days', STAFF, async ({ db, at }, req) => byDay(db, scopedQuery(req.query, 'admin', null), at))
  route('GET', '/api/admin/slots/outlets', STAFF, async ({ db, at }, req) => {
    const { total, rows } = await byOutlet(db, scopedQuery(req.query, 'admin', null), req.query.sort ?? 'name', Number(req.query.offset ?? 0), Number(req.query.limit ?? 50), at)
    return { total, items: rows.map(r => ({ outletId: r.outlet_id, outlet: r.outlet, channel: r.channel, logoUrl: logoUrl({ id: r.outlet_id, logo_key: r.logo_key }),
      slots: r.slots, fromPrice: Number(r.from_price), days: r.days.map((d: any) => ({ date: d.date, slots: d.slots, fromPrice: Number(d.fromPrice) })) })) }
  })

  // Suspending signs the user out everywhere; their company's bookings carry on.
  route('POST', '/api/admin/users/:id/status', STAFF, async ({ db, at, me }, req) => {
    // admins manage buyer and seller users; the founder can also suspend an admin (never themselves)
    const roles = me.role === 'founder' ? ['buyer', 'seller', 'admin'] : ['buyer', 'seller']
    const u = (await db.query(`update users set status = $2 where id = $1 and role = any($3) and status <> 'invited' and id <> $4 returning id`,
      [req.params.id, req.body.status, roles, me.userId])).rows[0]
    if (!u) throw new MarketError(me.role === 'founder' ? 'This user cannot be suspended or restored.' : 'Only active buyer or seller users can be suspended or restored.')
    if (req.body.status === 'suspended') await db.query(`delete from sessions where user_id = $1`, [u.id])
    await audit(db, `admin:${me.userId}`, `user.${req.body.status}`, 'user', u.id, { reason: req.body.reason ?? null }, at)
    return { ok: true }
  }, { type: 'object', required: ['status'], properties: { status: { enum: ['active', 'suspended'] }, reason: { type: 'string', maxLength: 500 } } })

  // A buyer or publisher who forgot their password: Nashr issues a one-day link (emailed once email is connected).
  // Lost phone: turn off a buyer's or publisher's two-step sign-in, with a reason. They are signed out and their company is told.
  route('POST', '/api/admin/users/:id/two-step-reset', STAFF, async ({ db, at, me }, req) => {
    await resetTwoStep(db, req.params.id, req.body.reason, `admin:${me.userId}`, at)
    return { ok: true }
  }, { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string', maxLength: 500 } } })

  route('POST', '/api/admin/users/:id/reset-link', STAFF, async ({ db, at, me }, req) =>
    ({ link: `/reset#${await issueReset(db, req.params.id, `${me.role}:${me.userId}`, at)}` }))

  route('GET', '/api/admin/staff', STAFF, async ({ db }) => (await db.query(
    `select id, name, email, role, status, totp_enabled, created_at from users where role in ('admin', 'founder') order by created_at`)).rows
    .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, twoFactor: u.totp_enabled && staffTwoStep(), twoStepOff: !staffTwoStep(), createdAt: u.created_at })))

  // Only the founder adds another founder.
  route('POST', '/api/admin/staff', STAFF, async ({ db, at, me }, req, reply) => {
    if (req.body.role === 'founder' && me.role !== 'founder') return reply.code(403).send({ error: 'Only the founder can add a founder.' })
    const r = await inviteStaff(db, req.body, `${me.role}:${me.userId}`, at)
    return { inviteLink: `/invite#${r.inviteToken}` }
  }, { type: 'object', required: ['email', 'name', 'role'], additionalProperties: false, properties: {
    email: { type: 'string', format: 'email', maxLength: 200 }, name: { type: 'string', minLength: 1, maxLength: 200 }, role: { enum: ['admin', 'founder'] } } })

  // The full file on one deal, for operations and disputes: every event with its actor, the money, the ledger.
  route('GET', '/api/admin/deals/:id', STAFF, async ({ db }, req) => {
    const d = (await db.query(`select d.*, s.label, s.starts_at, s.creative_due_at, o.name outlet, o.channel, bc.name buyer, sc.name seller, b.brief,
        coalesce(d.media_vat_bp, case when sc.vat_registered then (select (value)::int from settings where key = 'media_vat_bp' order by valid_from desc limit 1) else 0 end) vat_preview
        from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
        join companies bc on bc.id = d.buyer_id join companies sc on sc.id = d.seller_id join bids b on b.id = d.bid_id where d.id = $1`, [req.params.id])).rows[0]
    if (!d) throw new NotFound()
    const q = async (sql: string) => (await db.query(sql, [d.id])).rows
    const [events, ledger, ops, creatives, proofs, issues, docs] = await Promise.all([
      q(`select at, event, from_status, to_status, actor, note from deal_events where deal_id = $1 order by id`),
      q(`select at, debit, credit, amount, currency, ref from ledger_entries where deal_id = $1 order by id`),
      q(`select ref, kind, amount, currency, status, failure, provider_id, created_at, updated_at from money_ops where deal_id = $1 order by created_at`),
      q(`select version, status, reason, file_key, uploaded_at from creatives where deal_id = $1 order by version`),
      q(`select items, note, submitted_at from proofs where deal_id = $1 order by submitted_at`),
      q(`select reason, note, evidence, offer, status, opened_at, closed_at from issues where deal_id = $1 order by opened_at`),
      q(`select id, type, number, total, issued_at from documents where deal_id = $1 order by issued_at`),
    ])
    const s = split(d.amount, { commissionBp: d.commission_bp ?? 0, mediaVatBp: d.media_vat_bp ?? d.vat_preview, feeVatBp: d.fee_vat_bp ?? 0 })
    return { rating: await dealRating(db, d.id), id: d.id, ref: d.ref, status: d.status, kind: d.kind, outlet: d.outlet, channel: d.channel, label: d.label, startsAt: d.starts_at,
      creativeDueAt: d.creative_due_at, buyer: { id: d.buyer_id, name: d.buyer }, seller: { id: d.seller_id, name: d.seller }, brief: d.brief, slotId: d.slot_id,
      proofChecklist: checklistFor(d.channel, d.brief),
      nextDeadlineAt: d.next_deadline_at, extraCreativeRounds: d.extra_creative_rounds, ratesFrozen: d.commission_bp != null,
      money: { price: d.amount, mediaVat: s.mediaVat, buyerPays: s.buyerPays, commissionBp: d.commission_bp, fee: s.fee, feeVat: s.feeVat, payout: s.payout, held: 0 - await balance(db, 'held', d.currency, d.id) },
      events, ledger, moneyOps: ops, creatives: creatives.map(c => ({ ...c, fileId: c.file_key.replace(/^files\//, '') })), proofs, issues, documents: docs, dispute: await disputeView(db, d.id), chargeback: d.chargeback }
  })

  route('POST', '/api/admin/deals/:id/extra-round', STAFF, async ({ db, at, me }, req) => {
    await allowExtraRound(db, req.params.id, `admin:${me.userId}`, at)
    return { ok: true }
  })

  route('GET', '/api/admin/disputes', STAFF, async ({ db }) => (await db.query(
    `select d.id, d.ref, d.status, d.amount, d.next_deadline_at, d.decide_by, d.chargeback,
       (select count(*)::int from dispute_statements ds where ds.deal_id = d.id) statements, bc.name buyer, sc.name seller, o.name outlet, s.label, i.reason, i.note, i.offer, i.opened_at
     from deals d join companies bc on bc.id = d.buyer_id join companies sc on sc.id = d.seller_id join slots s on s.id = d.slot_id
     join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
     left join lateral (select * from issues i where i.deal_id = d.id order by opened_at desc limit 1) i on true
     where d.status in ('disputed', 'issue_open') order by (d.status = 'disputed') desc, d.decide_by nulls last, i.opened_at`)).rows
    .map(r => ({ id: r.id, ref: r.ref, status: r.status, amount: r.amount, dueAt: r.next_deadline_at, buyer: r.buyer, seller: r.seller, outlet: r.outlet,
      label: r.label, reason: r.reason, note: r.note, offer: r.offer, openedAt: r.opened_at, decideBy: r.decide_by, chargeback: r.chargeback, statements: r.statements })))

  // Funds: every ledger account, and whether the ledger agrees with the provider's balance.
  route('GET', '/api/admin/funds', STAFF, async ({ db }) => {
    const recent = (await db.query(`select l.at, l.debit, l.credit, l.amount, l.currency, l.ref, d.ref deal from ledger_entries l left join deals d on d.id = l.deal_id
                                    order by l.id desc limit 100`)).rows
    return {
      accounts: { cash: await balance(db, 'cash', 'AED'), held: await liability(db, 'held'), sellerPayable: 0 - await sumLike(db, 'seller_payable:'),
        sellerReceivable: await sumLike(db, 'seller_receivable:'), revenue: await liability(db, 'nashr_revenue'), vatPayable: await liability(db, 'vat_payable'),
        refundCosts: await balance(db, 'refund_costs', 'AED') },
      reconcile: await reconcile(deps.provider, 'AED'),
      recent: recent.map(r => ({ at: r.at, debit: r.debit, credit: r.credit, amount: r.amount, currency: r.currency, ref: r.ref, deal: r.deal })),
    }
  })

  // Payouts and refunds as they go out; failed ones need a person (B5: a seller without a working payout account fails loudly here).
  route('GET', '/api/admin/money-ops', STAFF, async ({ db }, req) => (await db.query(
    `select m.id, m.ref, m.kind, m.amount, m.currency, m.status, m.failure, m.created_at, m.updated_at, d.ref deal, d.id deal_id, c.name company, c.payouts_enabled
     from money_ops m left join deals d on d.id = m.deal_id left join companies c on c.id = m.company_id
     where ($1::text is null or m.status = $1) and m.kind <> 'charge' order by (m.status = 'failed') desc, m.created_at desc limit 300`, [req.query.status ?? null])).rows
    .map(m => ({ id: m.id, ref: m.ref, kind: m.kind, amount: m.amount, currency: m.currency, status: m.status, failure: m.failure, createdAt: m.created_at,
      updatedAt: m.updated_at, deal: m.deal, dealId: m.deal_id, company: m.company, payoutsEnabled: m.payouts_enabled })))

  // Retry keeps the same idempotency key, so the provider can never pay twice.
  route('POST', '/api/admin/money-ops/:id/retry', STAFF, async ({ db, at, me }, req) => {
    const r = await db.query(`update money_ops set status = 'pending', failure = null, updated_at = $2 where id = $1 and status = 'failed' and kind <> 'charge' returning id`, [req.params.id, at])
    if (!r.rowCount) throw new MarketError('Only a failed payout or refund can be retried.')
    await audit(db, `admin:${me.userId}`, 'money_op.retried', 'money_op', req.params.id, null, at)
    return { ok: true }
  })

  // Settings: current value and full history of each key.
  route('GET', '/api/admin/settings', STAFF, async ({ db }) => {
    const { rows } = await db.query(`select key, value, valid_from, changed_by from settings where key not like 'commission:%' order by key, valid_from desc`)
    const by = new Map<string, any[]>()
    for (const r of rows) by.set(r.key, [...(by.get(r.key) ?? []), { value: r.value, from: r.valid_from, by: r.changed_by }])
    return [...by].map(([key, history]) => ({ key, value: history[0].value, founderOnly: FOUNDER_ONLY.test(key), history }))
  })

  // Reports: bookings and revenue by month, channel and outlet over a period (Dubai dates).
  route('GET', '/api/admin/reports', STAFF, async ({ db, at }, req) => {
    const from = req.query.from ?? `${at.getUTCFullYear()}-01-01`, to = req.query.to ?? new Date(at.getTime() + 86_400_000).toISOString().slice(0, 10)
    const base = `from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      where d.status in ${LIVE} and (d.created_at at time zone 'Asia/Dubai')::date between $1::date and $2::date`
    const agg = `count(*)::int bookings, sum(d.amount)::bigint gmv, sum(round(d.amount * coalesce(d.commission_bp, 0) / 10000.0))::bigint commission`
    const q = async (sql: string) => (await db.query(sql, [from, to])).rows
    const outstanding = await sumLike(db, 'seller_receivable:')
    return { from, to, sellersStillOwe: outstanding, scorecard: (await scorecard(db, from, to)).map(m => ({ ...m, met: met(m) })),
      byMonth: await q(`select to_char(d.created_at at time zone 'Asia/Dubai', 'YYYY-MM') as month, ${agg} ${base} group by 1 order by 1`),
      byChannel: await q(`select o.channel, ${agg} ${base} group by 1 order by gmv desc`),
      byOutlet: await q(`select o.name outlet, o.channel, ${agg} ${base} group by 1, 2 order by gmv desc limit 50`),
      bySaleType: await q(`select d.kind, ${agg} ${base} group by 1 order by gmv desc`),
      // Refund losses (brief 12A): refunds sent, card costs recovered from buyers and sellers, what sellers still owe.
      // ponytail: the provider's own refund fees are recorded with Stripe (B5); until then "card costs" are Nashr's estimate.
      refundLosses: (await db.query(`select
          (select count(*)::int from money_ops where kind = 'refund' and (created_at at time zone 'Asia/Dubai')::date between $1::date and $2::date) refunds,
          (select coalesce(sum(amount), 0)::bigint from money_ops where kind = 'refund' and (created_at at time zone 'Asia/Dubai')::date between $1::date and $2::date) refunded,
          (select coalesce(sum(amount), 0)::bigint from ledger_entries where ref = 'card cost kept from refund' and (at at time zone 'Asia/Dubai')::date between $1::date and $2::date) from_buyers,
          (select coalesce(sum(amount), 0)::bigint from ledger_entries where ref = 'card cost recoverable from seller' and (at at time zone 'Asia/Dubai')::date between $1::date and $2::date) charged_to_sellers,
          (select coalesce(sum(amount), 0)::bigint from ledger_entries where ref = 'deducted from payout' and (at at time zone 'Asia/Dubai')::date between $1::date and $2::date) recovered_from_sellers`,
        [from, to])).rows[0] }
  })

  // Quote requests from the directory, and the directory entries for outlets not on Nashr.
  route('GET', '/api/admin/quotes', STAFF, async ({ db }) => (await db.query(
    `select q.id, q.message, q.status, q.created_at, o.name outlet, o.id outlet_id, c.name buyer from quote_requests q join outlets o on o.id = q.outlet_id
     join companies c on c.id = q.buyer_id order by (q.status = 'open') desc, q.created_at desc limit 300`)).rows
    .map(r => ({ id: r.id, message: r.message, status: r.status, createdAt: r.created_at, outlet: r.outlet, outletId: r.outlet_id, buyer: r.buyer })))

  route('POST', '/api/admin/quotes/:id', STAFF, async ({ db, at, me }, req) => {
    const r = await db.query(`update quote_requests set status = $2 where id = $1`, [req.params.id, req.body.status])
    if (!r.rowCount) throw new NotFound()
    await audit(db, `admin:${me.userId}`, `quote.${req.body.status}`, 'quote_request', req.params.id, null, at)
    return { ok: true }
  }, { type: 'object', required: ['status'], properties: { status: { enum: ['open', 'answered', 'closed'] } } })

  route('GET', '/api/admin/outlets', STAFF, async ({ db }) => (await db.query(
    `select o.*, c.name company from outlets o left join companies c on c.id = o.company_id order by o.company_id is not null, o.name`)).rows
    .map(o => ({ id: o.id, name: o.name, nameAr: o.name_ar, channel: o.channel, sectors: o.sectors, company: o.company, tier: o.tier, audience: o.audience,
      website: o.website, description: o.description, estLow: o.est_low, estHigh: o.est_high, onNashr: !!o.company_id, coverUrl: coverUrl(o), logoUrl: logoUrl(o) })))

  const outletBody = { type: 'object', additionalProperties: false, properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 }, nameAr: { type: 'string', maxLength: 200 }, channel: { enum: ['print', 'digital', 'radio', 'tv', 'podcast'] },
    sectors: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 60 } }, tier: { type: 'string', maxLength: 60 }, audience: { type: 'string', maxLength: 300 },
    website: { type: 'string', maxLength: 300, pattern: '^https?://' }, description: { type: 'string', maxLength: 2000 },
    estLow: { type: 'integer', minimum: 1 }, estHigh: { type: 'integer', minimum: 1 } } }
  const COLS: Record<string, string> = { name: 'name', nameAr: 'name_ar', channel: 'channel', sectors: 'sectors', tier: 'tier', audience: 'audience', website: 'website',
    description: 'description', estLow: 'est_low', estHigh: 'est_high' }

  route('POST', '/api/admin/outlets', STAFF, async ({ db, at, me }, req) => {
    const keys = Object.keys(COLS).filter(k => k in req.body)
    if (req.body.estLow && req.body.estHigh && req.body.estHigh < req.body.estLow) throw new MarketError('The high estimate must not be below the low one.')
    const o = (await db.query(`insert into outlets (${keys.map(k => COLS[k]).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      keys.map(k => req.body[k]))).rows[0]
    await audit(db, `admin:${me.userId}`, 'outlet.listed_off_platform', 'outlet', o.id, { name: req.body.name }, at)
    return { id: o.id }
  }, { ...outletBody, required: ['name', 'channel'] })

  // Nashr edits directory entries for outlets not on Nashr; a publisher's own outlet stays theirs.
  route('PUT', '/api/admin/outlets/:id', STAFF, async ({ db, at, me }, req) => {
    const keys = Object.keys(COLS).filter(k => k in req.body)
    if (!keys.length) throw new MarketError('Nothing to change.')
    const r = await db.query(`update outlets set ${keys.map((k, i) => `${COLS[k]} = $${i + 2}`).join(', ')} where id = $1 and company_id is null`,
      [req.params.id, ...keys.map(k => req.body[k])])
    if (!r.rowCount) throw new MarketError('Only outlets not on Nashr can be edited here.')
    await audit(db, `admin:${me.userId}`, 'outlet.updated', 'outlet', req.params.id, { fields: keys }, at)
    return { ok: true }
  }, outletBody)
}
