import type { RouteFn } from './app.js'
import { NotFound } from './app.js'
import { audit } from '../core/audit.js'
import { smtpConfig, sendMail } from '../core/smtp.js'
import { renderEmail } from '../core/mail.js'
import { MarketError } from '../marketplace/market.js'

/* Nashr's team sees every email: whether email is set up, what went out or is held, any failure, and the email itself. */
const STAFF: ['admin'] = ['admin']

export function mailRoutes(route: RouteFn) {
  route('GET', '/api/admin/emails', STAFF, async ({ db }, req) => {
    const q = req.query, cfg = smtpConfig()
    const rows = (await db.query(`select o.id, o.to_email, o.kind, o.subject, o.status, o.attempts, o.last_error, o.created_at, o.sent_at, c.name company
      from outbox o left join companies c on c.id = o.company_id
      where ($1::text is null or o.status = $1) and ($2::text is null or o.to_email ilike '%' || $2 || '%' or o.subject ilike '%' || $2 || '%')
      order by o.created_at desc limit 200`, [q.status || null, q.q || null])).rows
    const counts = Object.fromEntries((await db.query(`select status, count(*)::int n from outbox group by status`)).rows.map(r => [r.status, r.n]))
    return { smtp: cfg ? { host: cfg.host, port: cfg.port, from: cfg.from, user: cfg.user ?? null } : null, counts,
      items: rows.map(r => ({ id: r.id, to: r.to_email, kind: r.kind, subject: r.subject, status: r.status, attempts: r.attempts, error: r.last_error,
        createdAt: r.created_at, sentAt: r.sent_at, company: r.company })) }
  })

  // The email itself, to read in the app (shown in a sandboxed frame).
  route('GET', '/api/admin/emails/:id', STAFF, async ({ db }, req, reply) => {
    const m = (await db.query(`select html_body from outbox where id = $1`, [req.params.id])).rows[0]
    if (!m) throw new NotFound()
    return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(m.html_body) // framing rules: app.ts onSend
  })

  route('POST', '/api/admin/emails/:id/resend', STAFF, async ({ db, at, me }, req) => {
    if (!smtpConfig()) throw new MarketError('Email is not set up yet: add the SMTP details to the server settings first.')
    const r = await db.query(`update outbox set status = 'queued', attempts = 0, last_error = null, next_attempt_at = $2 where id = $1 and status in ('failed', 'held', 'sent')`, [req.params.id, at])
    if (!r.rowCount) throw new NotFound()
    await audit(db, `admin:${me.userId}`, 'email.resent', 'email', req.params.id, null, at)
    return { ok: true }
  })

  // A test email, sent at once, so whoever sets up SMTP sees straight away whether it works.
  route('POST', '/api/admin/emails/test', STAFF, async ({ db, at, me }, req) => {
    const cfg = smtpConfig()
    if (!cfg) throw new MarketError('Email is not set up yet: add the SMTP details to the server settings first.')
    const { html, text } = renderEmail('en', { title: 'Nashr email works', paragraphs: ['This is a test email from Nashr. If you can read it, email is set up correctly.', 'هذه رسالة تجريبية من نشر.'],
      footer: `Sent from the Emails page on Nashr, ${at.toISOString().slice(0, 16).replace("T", " ")} UTC.` })
    try { await sendMail(cfg, { to: req.body.to, subject: 'Nashr email test', text, html }) }
    catch (e: any) { throw new MarketError(`The email server refused: ${String(e?.message ?? e).slice(0, 200)}`) }
    await audit(db, `admin:${me.userId}`, 'email.test_sent', 'email', null, { to: req.body.to }, at)
    return { ok: true }
  }, { type: 'object', required: ['to'], additionalProperties: false, properties: { to: { type: 'string', format: 'email', maxLength: 200 } } })
}
