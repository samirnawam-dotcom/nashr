import { pool, tx, type Db } from './db.js'
import { money, queue, renderEmail, site, tr } from './mail.js'
import { SEASONS, dubaiDay } from '../shared/seasons.js'

/*
 * Athena's monthly report (rules and Nashr's own records only): on the 1st of each month (Dubai), every buyer and publisher that
 * did something on Nashr last month gets one email per person, in their language: their month in numbers, how prices moved in
 * their market, the UAE seasons ahead, and what to do next. People switch it off under Your account ("Athena's monthly report").
 * One report per company per month (athena_reports), however often the job runs.
 */
type Lang = 'en' | 'ar'
const BOOKED = `('awaiting_payment', 'secured', 'in_review', 'issue_open', 'disputed', 'released', 'paid_out')`

/** The month just ended, as YYYY-MM, and its first and last Dubai days. */
export function lastMonth(at: Date) {
  const today = dubaiDay(at), y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1
  const py = m === 0 ? y - 1 : y, pm = m === 0 ? 12 : m
  const month = `${py}-${String(pm).padStart(2, '0')}`, from = `${month}-01`, to = new Date(Date.UTC(py, pm, 0)).toISOString().slice(0, 10)
  return { month, from, to, today }
}

/** What goes in one company's report. Null when the company did nothing last month (no email). */
export async function reportFor(db: Db, companyId: string, type: string, at: Date) {
  const { from, to, today } = lastMonth(at)
  const range = [companyId, from, to]
  const inMonth = `d.created_at >= $2::date::timestamp at time zone 'Asia/Dubai' and d.created_at < ($3::date + 1)::timestamp at time zone 'Asia/Dubai'`
  const seasons = SEASONS.filter(s => s.to >= today && s.from <= new Date(Date.parse(`${today}T00:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10)).slice(0, 3)
  if (type === 'publisher') {
    const m = (await db.query(`select count(*)::int n, coalesce(sum(d.amount), 0)::bigint gross, count(distinct d.buyer_id)::int buyers
      from deals d where d.seller_id = $1 and d.status in ${BOOKED} and ${inMonth}`, range)).rows[0]
    const closed = (await db.query(`select count(*)::int closed, count(*) filter (where s.status = 'booked')::int sold from slots s join placements p on p.id = s.placement_id
      join outlets o on o.id = p.outlet_id where o.company_id = $1 and s.closes_at >= $2::date::timestamp at time zone 'Asia/Dubai' and s.closes_at < ($3::date + 1)::timestamp at time zone 'Asia/Dubai'`, range)).rows[0]
    const open = (await db.query(`select count(*)::int n from slots s join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      where o.company_id = $1 and s.status = 'open' and s.closes_at > $2`, [companyId, at])).rows[0].n
    if (!m.n && !closed.closed && !open) return null
    return { kind: 'seller' as const, sales: m.n, gross: Number(m.gross), buyers: m.buyers, closed: closed.closed, sold: closed.sold, open, seasons }
  }
  const m = (await db.query(`select count(*)::int n, coalesce(sum(d.amount), 0)::bigint spend, count(distinct s.placement_id)::int products
    from deals d join slots s on s.id = d.slot_id where d.buyer_id = $1 and d.status in ${BOOKED} and ${inMonth}`, range)).rows[0]
  const bids = (await db.query(`select count(*)::int n from bids b where b.buyer_id = $1 and b.created_at >= $2::date::timestamp at time zone 'Asia/Dubai'
    and b.created_at < ($3::date + 1)::timestamp at time zone 'Asia/Dubai'`, range)).rows[0].n
  const campaigns = (await db.query(`select count(*)::int n from campaigns where buyer_id = $1 and status = 'active' and end_date >= $2::date`, [companyId, today])).rows[0].n
  if (!m.n && !bids && !campaigns) return null
  // how prices moved in the media types they buy: last month's middle sale against the month before
  const moves = (await db.query(`with mine as (select distinct o.channel from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id
        join outlets o on o.id = p.outlet_id where d.buyer_id = $1 and d.created_at > $3::date - interval '120 days')
      select o.channel, percentile_cont(0.5) within group (order by d.amount) filter (where d.created_at >= $2::date::timestamp at time zone 'Asia/Dubai') now_p,
        percentile_cont(0.5) within group (order by d.amount) filter (where d.created_at < $2::date::timestamp at time zone 'Asia/Dubai') before_p
      from deals d join slots s on s.id = d.slot_id join placements p on p.id = s.placement_id join outlets o on o.id = p.outlet_id
      where o.channel in (select channel from mine) and d.status in ${BOOKED} and d.created_at >= ($2::date - interval '1 month')::timestamp at time zone 'Asia/Dubai'
        and d.created_at < ($3::date + 1)::timestamp at time zone 'Asia/Dubai' group by o.channel`, range)).rows
    .filter((r: any) => r.now_p && r.before_p).map((r: any) => ({ channel: r.channel, change: Math.round((Number(r.now_p) / Number(r.before_p) - 1) * 100) }))
  return { kind: 'buyer' as const, bookings: m.n, spend: Number(m.spend), products: m.products, bids, campaigns, moves, seasons }
}

const CHANNEL: Record<string, string> = { radio: 'Radio', tv: 'TV / Shows', digital: 'Website', newspaper: 'Newspaper', magazine: 'Magazine', newsletter: 'Newsletter',
  podcast: 'Podcast', social: 'Social media', print: 'Print', other: 'Other' }

/** The email for one person. */
export function reportEmail(lang: Lang, r: NonNullable<Awaited<ReturnType<typeof reportFor>>>, monthLabel: string) {
  const t = tr(lang), aed = money(lang)
  const season = (s: { name: string; nameAr: string; from: string; to: string }) => `${lang === 'ar' ? s.nameAr : t(s.name)} (${s.from.slice(8)}/${s.from.slice(5, 7)} – ${s.to.slice(8)}/${s.to.slice(5, 7)})`
  const p: string[] = []
  if (r.kind === 'buyer') {
    p.push(r.bookings ? t('Last month you booked {n} slots on {products} products, for {amount}.', { n: r.bookings, products: r.products, amount: aed(r.spend) })
      : t('You placed {n} bids last month and have no new bookings yet.', { n: r.bids }))
    for (const m of r.moves.slice(0, 3)) p.push(m.change > 2 ? t('{media} prices rose about {pct}% on the month before.', { media: t(CHANNEL[m.channel] ?? m.channel), pct: m.change })
      : m.change < -2 ? t('{media} prices fell about {pct}% on the month before: a good time to book.', { media: t(CHANNEL[m.channel] ?? m.channel), pct: -m.change })
      : t('{media} prices held steady.', { media: t(CHANNEL[m.channel] ?? m.channel) }))
    if (r.seasons.length) p.push(t('Coming up: {seasons}. Demand and prices usually rise then, so plan and bid early.', { seasons: r.seasons.map(season).join(', ') }))
    p.push(r.campaigns ? t('You have {n} campaigns running. Athena watches them and tells you when a date is lost, with a replacement.', { n: r.campaigns })
      : t('Tell Athena your next campaign in one sentence and it plans it for you.'))
  } else {
    const rate = r.closed ? Math.round(r.sold / r.closed * 100) : null
    p.push(r.sales ? t('Last month you sold {n} slots to {buyers} buyers, for {amount}.', { n: r.sales, buyers: r.buyers, amount: aed(r.gross) }) : t('No sales last month.'))
    if (rate != null) p.push(t('{pct}% of your dates that closed last month were sold ({sold} of {closed}).', { pct: rate, sold: r.sold, closed: r.closed }))
    if (rate != null && rate < 40) p.push(t('Many dates went unsold: Athena\'s price check on each product shows where your price sits against similar sales.'))
    if (r.seasons.length) p.push(t('Coming up: {seasons}. Buyers spend more then: review prices for those dates and list them early.', { seasons: r.seasons.map(season).join(', ') }))
    p.push(t('You have {n} dates on sale now.', { n: r.open }))
  }
  return renderEmail(lang, { title: t('Your month on Nashr: {month}', { month: monthLabel }), paragraphs: p,
    cta: { label: t('Open Nashr'), url: site() + (r.kind === 'buyer' ? '/dashboard' : '/home') },
    footer: t('Athena writes this report from your activity on Nashr. Switch it off under Your account.') })
}

/** The job: on the 1st (Dubai) from 8am, each company's report once. Returns how many emails were queued. */
export async function runMonthlyReports(at: Date) {
  const { month, today } = lastMonth(at)
  const hourDubai = (at.getUTCHours() + 4) % 24
  if (today.slice(8) !== '01' || hourDubai < 8) return 0
  const companies = (await pool.query(`select c.id, c.type from companies c where c.type in ('buyer', 'publisher')
    and not exists (select 1 from athena_reports r where r.company_id = c.id and r.month = $1) limit 200`, [month])).rows
  let queued = 0
  const label = (lang: Lang) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-GB', { month: 'long', year: 'numeric' })
  for (const c of companies) await tx(async db => {
    // claim it first, so two copies of the app never send the same report
    if (!(await db.query(`insert into athena_reports (company_id, month, sent_at) values ($1, $2, $3) on conflict do nothing`, [c.id, month, at])).rowCount) return
    const r = await reportFor(db, c.id, c.type, at)
    if (!r) return
    const people = (await db.query(`select id, email, lang, email_prefs from users where company_id = $1 and status = 'active'`, [c.id])).rows
    for (const u of people) {
      if (u.email_prefs?.reports === false) continue
      const lang: Lang = u.lang === 'ar' ? 'ar' : 'en', { html, text } = reportEmail(lang, r, label(lang))
      await queue(db, { to: u.email, userId: u.id, companyId: c.id, kind: 'athena.report', subject: tr(lang)('Your month on Nashr: {month}', { month: label(lang) }), text, html }, at)
      queued++
    }
  })
  return queued
}
