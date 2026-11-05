// Demo data for local development. Never runs in production (brief section 20: demo data must never reach the live system).
import { pool, tx } from './core/db.js'
import { migrate } from './core/migrate.js'
import { hashPassword } from './auth/crypto.js'
import { createPlacement, generateSlots } from './catalog/placements.js'
import { accept, placeBid, requestBuyNow, showInterest } from './marketplace/market.js'
import { localDay } from './core/market.js'

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production.')

const AED = (n: number) => n * 100
const PASSWORD = 'nashr-demo-2026'
const BRIEF = { advertiser: 'Demo brand', industry: 'Banking', message: 'Demo campaign', language: 'english', landingUrl: 'https://example.com', creativeToFollow: true }

await migrate()
await pool.query(`truncate files, quote_requests, campaign_items, campaigns, sessions, invites, users, access_requests, notifications, documents, document_series, creatives, proofs, issues,
  prerun_checks, money_ops, ledger_entries, deal_events, deals, bids, slots, placements, outlets, companies, provider_events restart identity cascade`)
await pool.query(`delete from settings where valid_from > '2000-01-01'`)

const now = new Date()
const company = async (name: string, type: string) =>
  (await pool.query(`insert into companies (name, type, vat_registered, payouts_enabled, provider_account, trn) values ($1, $2, $3, $3, $4, '100000000000003') returning id`,
    [name, type, type === 'publisher', type === 'publisher' ? 'acct_demo' : null])).rows[0].id as string
const user = (companyId: string, email: string, name: string, role: string) =>
  pool.query(`insert into users (company_id, email, name, role, status, password_hash, created_at) values ($1, $2, $3, $4, 'active', $5, now())`,
    [companyId, email, name, role, hashPassword(PASSWORD)])
const outlet = async (companyId: string, name: string, nameAr: string, channel: string, sectors: string[]) =>
  (await pool.query(`insert into outlets (company_id, name, name_ar, channel, sectors) values ($1, $2, $3, $4, $5) returning id`,
    [companyId, name, nameAr, channel, sectors])).rows[0].id as string

const buyer = await company('Northwind Fintech', 'buyer')
const rivals = [await company('Al Futtaim Group', 'buyer'), await company('Emirates NBD', 'buyer'), await company('Etihad Holidays', 'buyer')]
await user(buyer, 'demo@northwind.ae', 'Sara Al Mansoori', 'buyer')

const skyline = await company('Skyline FM', 'publisher'); await user(skyline, 'sales@skyline.ae', 'Tariq', 'seller')
const dubaiOne = await company('Dubai One TV', 'publisher')
const gulfNews = await company('Gulf News', 'publisher')
const khaleej = await company('Khaleej Times', 'publisher')
const majlis = await company('The Majlis Podcast', 'publisher')

// List from next Monday for four weeks (bidding closes days before air, so the near days are already closed).
const today = localDay(now, 'AE')
const offset = ((8 - today.weekday) % 7) || 7
const from = new Date(Date.parse(today.date + 'T00:00:00Z') + offset * 86_400_000).toISOString().slice(0, 10)
const list = async (outletId: string, p: any) => tx(async c => {
  const id = await createPlacement(c, { outletId, creativeLeadHours: 48, closeLeadHours: 120, ...p }, 'seed', now)
  await generateSlots(c, id, from, 28, now)
  return id
})

await list(await outlet(skyline, 'Skyline FM', 'سكاي لاين', 'radio', ['Banking', 'Retail', 'Real estate']), {
  name: 'Morning Markets', saleType: 'auction', days: [1, 2, 3, 4, 5], startsAt: '06:30', endsAt: '09:00', startingPrice: AED(3_500),
  anyBreakPrice: AED(3_500), packagePrice: AED(15_000), buyNowPrice: AED(5_500), reservePrice: AED(4_000),
  breaks: [{ label: 'Break 1', at: '06:45', seconds: 30 }, { label: 'Break 2', at: '07:15', seconds: 30 }, { label: 'Break 3', at: '07:45', seconds: 30 }, { label: 'Break 4', at: '08:15', seconds: 30 }],
})
await list((await pool.query(`select id from outlets where company_id = $1`, [skyline])).rows[0].id, {
  name: 'Drive Home', saleType: 'quick_sale', days: [1, 2, 3, 4, 5], startsAt: '16:00', endsAt: '19:00', startingPrice: AED(4_200),
  breaks: [{ label: 'Break 1', at: '16:20', seconds: 30 }, { label: 'Break 2', at: '17:20', seconds: 30 }],
})
await list(await outlet(dubaiOne, 'Dubai One TV', 'دبي ون', 'tv', ['Banking', 'Hospitality']), {
  name: 'Market Open', saleType: 'auction', days: [1, 2, 3, 4, 5], startsAt: '10:00', endsAt: '10:30', startingPrice: AED(12_000), buyNowPrice: AED(18_000),
  breaks: [{ label: 'Break 1', at: '10:10', seconds: 30 }, { label: 'Break 2', at: '10:25', seconds: 30 }],
})
await list(await outlet(gulfNews, 'Gulf News', 'غلف نيوز', 'print', ['Banking', 'Real estate', 'Retail']), {
  name: 'Full page', saleType: 'auction', days: [1, 3, 5], startingPrice: AED(20_000), buyNowPrice: AED(32_000), closeLeadHours: 144, creativeLeadHours: 48,
})
await list(await outlet(khaleej, 'Khaleej Times', 'خليج تايمز', 'digital', ['Technology', 'Banking']), {
  name: 'Homepage takeover', saleType: 'quick_sale', days: [2, 4], startingPrice: AED(9_000), closeLeadHours: 96, creativeLeadHours: 24,
})
await list(await outlet(majlis, 'The Majlis Podcast', 'المجلس', 'podcast', ['Banking', 'Technology']), {
  name: 'Weekly episode', saleType: 'auction', days: [4], startsAt: '06:00', startingPrice: AED(2_500),
  breaks: [{ label: 'Pre-roll' }, { label: 'Mid-roll' }, { label: 'Post-roll' }],
})

// Some activity so the calendar shows bids, a lead and an outbid.
const slots = (await pool.query(`select id, sale_type, starting_price from slots where status = 'open' order by starts_at limit 60`)).rows
for (const [i, s] of slots.entries()) {
  if (i % 3) continue
  await tx(async c => {
    if (s.sale_type === 'quick_sale') return showInterest(c, { slotId: s.id, buyerId: rivals[i % 3], brief: BRIEF }, now)
    await placeBid(c, { slotId: s.id, buyerId: rivals[i % 3], amount: s.starting_price, brief: BRIEF }, now)
    if (i % 2 === 0) await placeBid(c, { slotId: s.id, buyerId: buyer, amount: Math.ceil(s.starting_price * 1.03 / 100) * 100, brief: BRIEF }, now)
    if (i % 4 === 0) await placeBid(c, { slotId: s.id, buyerId: rivals[(i + 1) % 3], amount: Math.ceil(s.starting_price * 1.07 / 100) * 100, brief: BRIEF }, now)
  })
}

// Directory profiles, and outlets not on Nashr yet with Nashr's estimated range (brief section 7, level 3).
await pool.query(`update outlets set tier = 'Tier 1', audience = 'Business commuters, 25-45', description = 'Dubai''s business radio. Markets, money and the morning drive.', website = 'https://example.com/skyline' where name = 'Skyline FM'`)
await pool.query(`update outlets set tier = 'Tier 1', audience = 'Decision makers, UAE nationals and expats', description = 'English-language daily with a strong business section.' where name = 'Gulf News'`)
for (const [name, channel, sectors, low, high] of [['Arabian Business', 'print', ['Banking', 'Real estate'], 18_000, 26_000], ['Dubai Eye 103.8', 'radio', ['Retail', 'Hospitality'], 2_500, 4_000],
  ['The National', 'digital', ['Technology', 'Banking'], 7_000, 12_000]] as const)
  await pool.query(`insert into outlets (name, channel, sectors, est_low, est_high) values ($1, $2, $3, $4, $5)`, [name, channel, sectors, AED(low), AED(high)])

// A campaign with a plan, and one buy-now the publisher has accepted (pay it from Bookings).
const campaign = (await pool.query(`insert into campaigns (buyer_id, name, budget, launch_date, objective, created_at) values ($1, 'Q4 business cards launch', $2, $3, 'Awareness', now()) returning id`,
  [buyer, AED(150_000), from])).rows[0].id
await pool.query(`insert into campaign_items (campaign_id, outlet_id, planned_amount) select $1, id, $2 from outlets where name in ('Skyline FM', 'Gulf News', 'Arabian Business')`, [campaign, AED(40_000)])
const buyNow = (await pool.query(`select s.id from slots s where s.status = 'open' and s.buy_now_price is not null and s.kind = 'single'
  and not exists (select 1 from bids b where b.slot_id = s.id) order by s.starts_at limit 1`)).rows[0]
if (buyNow) await tx(async c => {
  const deal = await requestBuyNow(c, { slotId: buyNow.id, buyerId: buyer, brief: BRIEF, campaignId: campaign }, now)
  await accept(c, deal.id, 'seller:seed', now)
})

const n = (await pool.query(`select count(*)::int n from slots`)).rows[0].n
console.log(`Seeded ${n} slots from ${from}. Sign in as demo@northwind.ae (buyer) or sales@skyline.ae (seller), password ${PASSWORD}`)
await pool.end()
