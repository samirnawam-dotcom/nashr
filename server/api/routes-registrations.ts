import type { RouteFn } from './app.js'
import { rateLimit } from './app.js'
import { MarketError } from '../marketplace/market.js'
import { notify } from '../core/notify.js'
import { queueRegistrationEmails } from '../core/mail.js'

/*
 * Event registrations (owner's request): a short public form at /join or /join/<event>. People register their interest only;
 * nothing gives them an account. Nashr's team sees the list and downloads it as CSV for follow-up.
 */
const text = (max: number) => ({ type: 'string', minLength: 1, maxLength: max })

export function registrationRoutes(route: RouteFn) {
  route('POST', '/api/registrations', 'public', async ({ db, at }, req, reply) => {
    // generous: at a conference many people share one Wi-Fi address
    if (!(await rateLimit(`register:${req.ip}`, 30, at.getTime()))) return reply.code(429).send({ error: 'Too many requests. Try again in a minute.' })
    const b = req.body, email = String(b.email).trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new MarketError('Enter a valid email.')
    if (!/[0-9]{6,}/.test(String(b.phone).replace(/[\s()+-]/g, ''))) throw new MarketError('Enter a valid phone number.')
    const event = /^[a-z0-9-]{1,40}$/.test(b.event ?? '') ? b.event : 'general'
    await db.query(`insert into registrations (event, side, name, company, email, phone, created_at) values ($1, $2, $3, $4, $5, $6, $7)`,
      [event, b.side, b.name.trim(), b.company.trim(), email, String(b.phone).trim(), at])
    // Nashr's team hears at once: on the bell and by email, with what they need to follow up
    const who = { name: b.name.trim(), company: b.company.trim(), side: b.side, event, email, phone: String(b.phone).trim() }
    for (const s of (await db.query(`select distinct company_id from users where role in ('admin', 'founder') and status = 'active'`)).rows)
      await notify(db, s.company_id, 'registration.new', null, who, at)
    await queueRegistrationEmails(db, who, at) // and the extra inboxes named in REGISTRATION_EMAILS
    return { ok: true }
  }, { type: 'object', required: ['side', 'name', 'company', 'email', 'phone'], additionalProperties: false, properties: {
    side: { enum: ['buyer', 'media_outlet'] }, name: text(200), company: text(200), email: text(200), phone: text(40), event: { type: 'string', maxLength: 40 } } })

  route('GET', '/api/admin/registrations', ['admin'], async ({ db }, req) => {
    const event = (req.query as any).event as string | undefined
    const rows = (await db.query(`select id, event, side, name, company, email, phone, created_at from registrations
      where ($1::text is null or event = $1) order by created_at desc limit 5000`, [event || null])).rows
    const events = (await db.query(`select event, count(*)::int n from registrations group by event order by max(created_at) desc`)).rows
    return { events, items: rows.map((r: any) => ({ id: r.id, event: r.event, side: r.side, name: r.name, company: r.company, email: r.email, phone: r.phone, at: r.created_at })) }
  })
}
