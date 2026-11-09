import { type Db, pool } from './db.js'
import { sendMail, smtpConfig } from './smtp.js'
import { AR } from '../../web/src/i18n-ar.js'
import { noticeHref, noticeTexts } from '../../web/src/notices.js'

/*
 * Email. Everything goes through the outbox table, inside the same transaction as the change it reports (so a refused step
 * sends nothing). With SMTP set up the worker sends it, retrying with growing gaps; without SMTP it is held, and Nashr's
 * team can read it on the Emails page. Each person gets email in the language they use Nashr in, with the same wording as
 * the bell. Emails about money, bookings to act on, deadlines, disputes and account security always go; bids, saved-search
 * alerts and messages follow each person's choices on their account page.
 */
type Lang = 'en' | 'ar'
const site = () => (process.env.SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const tr = (lang: Lang) => (en: string, vars: Record<string, string | number> = {}) =>
  (lang === 'ar' ? AR[en] ?? en : en).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
const money = (lang: Lang) => (fils: number) => {
  const n = (fils / 100).toLocaleString('en-US', { maximumFractionDigits: fils % 100 ? 2 : 0, minimumFractionDigits: fils % 100 ? 2 : 0 })
  return lang === 'ar' ? `${n} درهم` : `AED ${n}`
}
const day = (lang: Lang) => (iso: string) => new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' })
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** One email, both versions: a short HTML page that reads well in every mail app (right to left in Arabic), and plain text. */
export function renderEmail(lang: Lang, e: { title: string; paragraphs: string[]; cta?: { label: string; url: string }; footer: string }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr', align = lang === 'ar' ? 'right' : 'left'
  const font = lang === 'ar' ? "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif" : "'IBM Plex Sans', Arial, Helvetica, sans-serif"
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(e.title)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f3;font-family:${font};color:#0f2322">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden" dir="${dir}">
<tr><td style="background:#082528;padding:18px 24px;text-align:${align};color:#ffffff;font-size:18px;font-weight:700">Nashr <span style="color:#e3a52b">نشر</span></td></tr>
<tr><td style="padding:24px;text-align:${align};font-size:15px;line-height:1.6">
<h1 dir="auto" style="margin:0 0 12px;font-size:20px;line-height:1.35">${esc(e.title)}</h1>
${e.paragraphs.map(p => `<p dir="auto" style="margin:0 0 12px">${esc(p)}</p>`).join('\n')}
${e.cta ? `<p style="margin:20px 0 4px"><a href="${esc(e.cta.url)}" style="display:inline-block;background:#106b63;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600">${esc(e.cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e3e8e6;text-align:${align};font-size:12px;color:#5b6b69;line-height:1.5">${esc(e.footer)}</td></tr>
</table></td></tr></table></body></html>`
  const text = [e.title, '', ...e.paragraphs, ...(e.cta ? ['', `${e.cta.label}: ${e.cta.url}`] : []), '', '—', e.footer].join('\n')
  return { html, text }
}

async function queue(db: Db, m: { to: string; userId?: string | null; companyId?: string | null; kind: string; subject: string; text: string; html: string }, at: Date) {
  const on = !!smtpConfig()
  await db.query(`insert into outbox (to_email, user_id, company_id, kind, subject, text_body, html_body, status, next_attempt_at, created_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`, [m.to, m.userId ?? null, m.companyId ?? null, m.kind, m.subject.slice(0, 200), m.text, m.html, on ? 'queued' : 'held', at])
  return on
}

// Which emails a person can switch off (on their account page); everything else always goes.
function choice(kind: string): 'bids' | 'alerts' | 'messages' | null {
  if (kind === 'message.new') return 'messages'
  if (kind === 'search.match') return 'alerts'
  if (['bid.outbid', 'bid.auto_raised', 'bid.auto_cap', 'bid.closed_lost', 'bid.not_selected', 'interest.not_selected', 'interest.expired'].includes(kind)) return 'bids'
  return null
}

/** A notification for a company becomes an email to each active person there who wants it. Called by notify(). */
export async function queueNoticeEmails(db: Db, companyId: string, kind: string, dealId: string | null, data: any, at: Date) {
  const people = (await db.query(`select id, email, role, lang, email_prefs from users where company_id = $1 and status = 'active'`, [companyId])).rows
  if (!people.length) return
  const ref = dealId ? (await db.query(`select ref from deals where id = $1`, [dealId])).rows[0]?.ref ?? null : null
  const pick = choice(kind)
  for (const p of people) {
    if (pick && { bids: true, alerts: true, messages: true, ...p.email_prefs }[pick] === false) continue
    const lang: Lang = p.lang === 'ar' ? 'ar' : 'en', t = tr(lang)
    const said = noticeTexts(t, money(lang), day(lang))[kind]?.({ kind, dealId, data }) ?? t('You have a new notification on Nashr.')
    const href = noticeHref({ kind, dealId, data }, p.role) ?? '/'
    const title = said.length > 90 ? said.slice(0, 87).replace(/\s+\S*$/, '') + '…' : said
    const { html, text } = renderEmail(lang, {
      title, paragraphs: [said, ...(ref ? [t('Order {ref}', { ref })] : [])], cta: { label: t('Open in Nashr'), url: site() + href },
      footer: pick ? t('You get these emails because of your choices on Nashr. Change them under Your account.') : t('Nashr sends this email about your bookings, payments or account. It cannot be switched off.'),
    })
    await queue(db, { to: p.email, userId: p.id, companyId, kind, subject: title, text, html }, at)
  }
}

/** The invite link, by email. Returns whether it will actually be sent (SMTP set up) or only kept in the outbox. */
export async function queueInviteEmail(db: Db, a: { userId: string; to: string; name: string; company: string; link: string }, at: Date) {
  const lang: Lang = 'en', t = tr(lang) // a new person has not chosen a language yet: English with an Arabic line
  const { html, text } = renderEmail(lang, { title: t('You are invited to Nashr'),
    paragraphs: [t('Hello {name},', { name: a.name }), t('{company} has invited you to Nashr, the marketplace for booking advertising across the UAE. Choose a password to join. The link works once.', { company: a.company }),
      tr('ar')('{company} has invited you to Nashr, the marketplace for booking advertising across the UAE. Choose a password to join. The link works once.', { company: a.company })],
    cta: { label: t('Join Nashr'), url: site() + a.link }, footer: t('If you did not expect this, you can ignore it.') })
  return queue(db, { to: a.to, userId: a.userId, kind: 'access.invite', subject: t('You are invited to Nashr'), text, html }, at)
}

/** A password reset link, by email (only when SMTP is set up: otherwise Nashr's team issues it). */
export async function queueResetEmail(db: Db, a: { userId: string; to: string; name: string; lang: Lang; link: string }, at: Date) {
  const t = tr(a.lang)
  const { html, text } = renderEmail(a.lang, { title: t('Reset your password'),
    paragraphs: [t('Hello {name},', { name: a.name }), t('Someone asked to reset the password of your Nashr account. Use the link to choose a new one. It works once, for 24 hours.')],
    cta: { label: t('Choose a new password'), url: site() + a.link }, footer: t('If you did not ask, ignore this email: your password stays the same.') })
  return queue(db, { to: a.to, userId: a.userId, kind: 'access.reset_link', subject: t('Reset your password'), text, html }, at)
}

const RETRY_MINUTES = [1, 5, 30, 120, 480]
/** The worker: send what is due, a few at a time; a failure waits longer each time and gives up after five tries. */
export async function runOutbox(at: Date, send = sendMail) {
  const cfg = smtpConfig()
  if (!cfg) return 0
  const due = (await pool.query(`update outbox set next_attempt_at = $1::timestamptz + interval '10 minutes' where id in (
      select id from outbox where status = 'queued' and next_attempt_at <= $1 order by created_at limit 20 for update skip locked) returning *`, [at])).rows
  for (const m of due) {
    try {
      const id = await send(cfg, { to: m.to_email, subject: m.subject, text: m.text_body, html: m.html_body })
      await pool.query(`update outbox set status = 'sent', sent_at = $2, message_id = $3, attempts = attempts + 1, last_error = null where id = $1`, [m.id, at, id])
    } catch (e: any) {
      const tries = m.attempts + 1, gap = RETRY_MINUTES[tries - 1]
      await pool.query(`update outbox set attempts = $2, last_error = $3, status = $4, next_attempt_at = $5 where id = $1`,
        [m.id, tries, String(e?.message ?? e).slice(0, 500), gap ? 'queued' : 'failed', gap ? new Date(at.getTime() + gap * 60_000) : null])
    }
  }
  return due.length
}
