import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { audit } from '../core/audit.js'
import { notify } from '../core/notify.js'
import { setting } from '../core/settings.js'
import { MarketError } from '../marketplace/market.js'

const TOPICS = ['booking', 'payment', 'listing', 'account', 'other']
const row = (r: any) => ({ id: r.id, topic: r.topic, dealId: r.deal_id, dealRef: r.ref ?? null, message: r.message, status: r.status, reply: r.reply,
  createdAt: r.created_at, answeredAt: r.answered_at, company: r.company ?? undefined, companyId: r.company_id, user: r.user_name ?? undefined })

/*
 * Contact Nashr and help. A request goes to every staff member's bell; the answer goes to the asker's company bell.
 * The help page reads the marketplace's rules from settings, so what it promises is what the system does.
 */
export function supportRoutes(route: RouteFn) {
  route('GET', '/api/help/rules', 'public', async ({ db, at }) => {
    const keys = ['seller_window_hours', 'payment_window_hours', 'proof_due_working_days', 'review_working_days', 'issue_response_hours',
      'free_cancel_hours', 'cancel_fee_bp', 'max_creative_rounds', 'dispute_decision_working_days']
    return Object.fromEntries(await Promise.all(keys.map(async k => [k, await setting(db, k, at)])))
  })

  route('POST', '/api/support', ['buyer', 'seller'], async ({ db, at, me }, req) => {
    const b = req.body, message = String(b.message ?? '').trim()
    if (message.length < 10) throw new MarketError('Tell us a little more, so we can help the first time.')
    if (b.dealId && !(await db.query(`select 1 from deals where id = $1 and $2 in (buyer_id, seller_id)`, [b.dealId, me.actAs.companyId])).rowCount)
      throw new MarketError('This booking is not yours.')
    const open = (await db.query(`select count(*)::int n from support_requests where company_id = $1 and status = 'open'`, [me.actAs.companyId])).rows[0].n
    if (open >= 10) throw new MarketError('You have 10 open requests. Nashr will answer those first.')
    const r = (await db.query(`insert into support_requests (company_id, user_id, topic, deal_id, message, created_at) values ($1, $2, $3, $4, $5, $6) returning *`,
      [me.actAs.companyId, me.userId, b.topic, b.dealId ?? null, message, at])).rows[0]
    await audit(db, `user:${me.userId}`, 'support.requested', 'support', r.id, { topic: b.topic, dealId: b.dealId ?? null }, at)
    const company = (await db.query(`select name from companies where id = $1`, [me.actAs.companyId])).rows[0].name
    for (const s of (await db.query(`select distinct company_id from users where role in ('admin', 'founder')`)).rows)
      await notify(db, s.company_id, 'support.new', b.dealId ?? null, { requestId: r.id, company, topic: b.topic }, at)
    return row(r)
  }, { type: 'object', required: ['topic', 'message'], additionalProperties: false, properties: {
    topic: { enum: TOPICS }, dealId: { type: 'string', format: 'uuid' }, message: { type: 'string', maxLength: 4000 } } })

  route('GET', '/api/support', ['buyer', 'seller'], async ({ db, me }) =>
    (await db.query(`select s.*, d.ref from support_requests s left join deals d on d.id = s.deal_id where s.company_id = $1 order by s.created_at desc limit 50`,
      [me.actAs.companyId])).rows.map(row))

  // Nashr's side: open requests first, then the most recent.
  route('GET', '/api/admin/support', ['admin'], async ({ db }, req) =>
    (await db.query(`select s.*, d.ref, c.name company, u.name user_name from support_requests s join companies c on c.id = s.company_id
       join users u on u.id = s.user_id left join deals d on d.id = s.deal_id
       where ($1::text is null or s.status = $1) order by (s.status = 'open') desc, s.created_at desc limit 300`, [req.query.status || null])).rows.map(row))

  route('POST', '/api/admin/support/:id/reply', ['admin'], async ({ db, at, me }, req) => {
    const reply = String(req.body.reply ?? '').trim()
    if (reply.length < 2) throw new MarketError('Write the answer.')
    const r = (await db.query(`update support_requests set reply = $2, status = $3, answered_by = $4, answered_at = $5 where id = $1 returning *`,
      [req.params.id, reply, req.body.close ? 'closed' : 'answered', me.userId, at])).rows[0]
    if (!r) throw new NotFound()
    await audit(db, `admin:${me.userId}`, 'support.answered', 'support', r.id, { closed: !!req.body.close }, at)
    await notify(db, r.company_id, 'support.replied', r.deal_id, { requestId: r.id, topic: r.topic }, at)
    return row(r)
  }, { type: 'object', required: ['reply'], additionalProperties: false, properties: { reply: { type: 'string', maxLength: 4000 }, close: { type: 'boolean' } } })

  route('POST', '/api/admin/support/:id/close', ['admin'], async ({ db, at, me }, req) => {
    const r = await db.query(`update support_requests set status = 'closed' where id = $1`, [req.params.id])
    if (!r.rowCount) throw new NotFound()
    await audit(db, `admin:${me.userId}`, 'support.closed', 'support', req.params.id, null, at)
    return { ok: true }
  })
}
