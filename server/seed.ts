// Demo data for local development. Never runs in production (brief section 20: demo data must never reach the live system).
import { pool, tx } from './core/db.js'
import { migrate } from './core/migrate.js'
import { hashPassword } from './auth/crypto.js'
import { createPlacement, generateSlots } from './catalog/placements.js'
import { accept, placeBid, requestBuyNow, showInterest } from './marketplace/market.js'
import { localDay } from './core/market.js'
import { seedHistory } from './seed-history.js'

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production.')

const AED = (n: number) => n * 100
const PASSWORD = 'nashr-demo-2026'
const BRIEF = { advertiser: 'Demo brand', industry: 'Banking', message: 'Demo campaign', language: 'english', landingUrl: 'https://example.com', creativeToFollow: true }

await migrate()
await pool.query(`truncate reminders, waitlist, files, quote_requests, campaign_items, campaigns, sessions, invites, users, access_requests, notifications, documents, document_series, creatives, proofs, issues,
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
// What buyers read before they bid, by channel (Omar's brief: what the buyer gets, specs, language)
const DETAILS: Record<string, { description: string; specs: string }> = {
  radio: { description: 'A 30-second spot in one ad break of the programme.', specs: 'MP3 or WAV, 30 seconds, broadcast-ready.' },
  tv: { description: 'A 30-second spot in one ad break of the programme.', specs: 'MP4 (H.264), 1920 × 1080, 30 seconds, loudness −23 LUFS.' },
  print: { description: 'A page in one edition.', specs: 'PDF/X-1a, 300 dpi, sizes on the rate card.' },
  digital: { description: 'Your brand on the site for the day.', specs: 'JPG, PNG or HTML5, up to 150 KB.' },
  podcast: { description: 'A host-read or produced ad in one position of the episode.', specs: 'MP3, 48 kHz, or a script for the host to read.' },
}
const list = async (outletId: string, p: any) => tx(async c => {
  const { channel } = (await c.query(`select channel from outlets where id = $1`, [outletId])).rows[0]
  const id = await createPlacement(c, { outletId, creativeLeadHours: 48, closeLeadHours: 120, ...DETAILS[channel], language: 'english', listing: 'rolling', horizonWeeks: 4, ...p }, 'seed', now)
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
await list((await pool.query(`select id from outlets where name = 'Khaleej Times'`)).rows[0].id, {
  name: 'Banner for a week', saleType: 'fixed', unit: 'week', days: [1], startingPrice: AED(6_500), closeLeadHours: 96, creativeLeadHours: 24,
  description: 'Your banners across the site for seven days.', specs: 'MPU 300 × 250 and leaderboard 728 × 90, JPG, PNG or HTML5, up to 150 KB.',
})
await list((await pool.query(`select id from outlets where name = 'Gulf News'`)).rows[0].id, {
  name: 'Half page', saleType: 'fixed', autoAccept: true, days: [2, 4], startingPrice: AED(11_000), closeLeadHours: 144, creativeLeadHours: 48,
  description: 'A horizontal half page in one edition.', specs: '26 × 17 cm, PDF/X-1a, 300 dpi.',
})
await list(await outlet(majlis, 'The Majlis Podcast', 'المجلس', 'podcast', ['Banking', 'Technology']), {
  name: 'Weekly episode', saleType: 'auction', days: [4], startsAt: '06:00', startingPrice: AED(2_500),
  breaks: [{ label: 'Pre-roll' }, { label: 'Mid-roll' }, { label: 'Post-roll' }],
})

// Who each demo outlet reaches, its declared reach, and one brand-safety rule, so buyers can filter by audience.
for (const [name, audiences, reach, blocked] of [
  ['Skyline FM', ['commuters', 'young_professionals', 'affluent_expats'], 180_000, ['Alcohol & nightlife']],
  ['Dubai One TV', ['arabic_families', 'affluent_expats', 'sports_fans'], 650_000, ['Alcohol & nightlife', 'Lottery & gaming']],
  ['Gulf News', ['executives', 'property_investors', 'affluent_expats'], 420_000, []],
  ['Khaleej Times', ['executives', 'tech_adopters', 'young_professionals'], 900_000, ['Crypto & trading']],
  ['The Majlis Podcast', ['executives', 'young_professionals'], 35_000, []],
] as [string, string[], number, string[]][])
  await pool.query(`update outlets set audiences = $2, reach = $3, blocked_industries = $4 where name = $1`, [name, audiences, reach, blocked])

// Some activity so the calendar shows bids, a lead and an outbid.
const slots = (await pool.query(`select id, sale_type, starting_price from slots where status = 'open' order by starts_at limit 60`)).rows
for (const [i, s] of slots.entries()) {
  if (i % 3) continue
  await tx(async c => {
    if (s.sale_type === 'quick_sale') return showInterest(c, { slotId: s.id, buyerId: rivals[i % 3], brief: BRIEF }, now)
    if (s.sale_type === 'fixed') return // a fixed-price slot is booked outright, not bid on
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

// Saudi outlets stay in the directory as "Coming soon" until KSA opens (brief section 14).
for (const [name, nameAr, channel, low, high] of [['Rotana FM', 'روتانا إف إم', 'radio', 4_000, 7_000], ['Arab News', 'عرب نيوز', 'print', 15_000, 25_000]] as const)
  await pool.query(`insert into outlets (name, name_ar, channel, market, sectors, est_low, est_high, est_currency) values ($1, $2, $3, 'SA', '{Banking,Retail}', $4, $5, 'SAR')`,
    [name, nameAr, channel, low * 100, high * 100])

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

// Twelve weeks of past activity, so every dashboard has a history to show.
const booked = await seedHistory({ now, demoBuyer: buyer, rivals, campaignId: campaign })

// A couple of conversations on paid bookings, so the Messages pages show how buyer and publisher talk (only after payment).
const paid = `select d.id, d.buyer_id, d.seller_id from deals d where d.status in ('secured', 'in_review') and`
const forBuyer = (await pool.query(`${paid} d.buyer_id = $1 order by d.created_at desc limit 1`, [buyer])).rows
// Skyline FM (the demo publisher): an open conversation if it has a paid booking in progress, else the record on its latest finished deal.
const forSeller = (await pool.query(`select d.id, d.buyer_id, d.seller_id from deals d where d.status in ('secured', 'in_review', 'released')
  and d.seller_id = (select id from companies where name = 'Skyline FM') and d.id <> all($1::uuid[])
  order by d.status <> 'released' desc, d.buyer_id = $2 desc, d.created_at desc limit 1`, [forBuyer.map(d => d.id), buyer])).rows
const talk = [...forBuyer, ...forSeller]
const SCRIPTS = [
  [['b', 'Hi, our creative is a 30-second spot in Arabic and English. Is a bilingual read fine for this break?'],
   ['s', 'Yes, bilingual works well in this slot. Please keep it to 30 seconds including the tag line.'],
   ['b', 'Great. Can the spot run as the first ad in the break?'], ['s', 'We can place it first. Our traffic team will confirm the running order the day before.']],
  [['s', 'Thanks for booking. We received your brief; the final file is due two days before air.'], ['b', 'Noted. We will send the final version on Sunday morning.']],
]
for (const [i, d] of talk.entries()) {
  const lines = SCRIPTS[i] ?? []
  for (const [j, [who, body]] of lines.entries())
    await pool.query(`insert into messages (deal_id, company_id, body, created_at) values ($1, $2, $3, $4)`,
      [d.id, who === 'b' ? d.buyer_id : d.seller_id, body, new Date(now.getTime() - (lines.length - j) * 47 * 60_000)])
  // the buyer has read everything; the publisher has the last buyer message still to read
  await pool.query(`insert into message_reads (deal_id, company_id, read_at) values ($1, $2, $3)`, [d.id, d.buyer_id, now])
}

// Nashr staff. Staff sign in with an authenticator code; this fixed key is for development only.
const DEMO_TOTP = 'JBSWY3DPEHPK3PXP'
const nashr = (await pool.query(`insert into companies (name, type) values ('Nashr', 'nashr') returning id`)).rows[0].id
for (const [email, name, role] of [['omar@nashr.ae', 'Omar', 'founder'], ['ops@nashr.ae', 'Nashr Operations', 'admin']])
  await pool.query(`insert into users (company_id, email, name, role, status, password_hash, totp_secret, totp_enabled, created_at) values ($1, $2, $3, $4, 'active', $5, $6, true, now())`,
    [nashr, email, name, role, hashPassword(PASSWORD), DEMO_TOTP])
await pool.query(`insert into access_requests (name, email, phone, role, company, company_type, created_at) values
  ('Huda Al Suwaidi', 'huda@brightagency.ae', '+971501234567', 'Media director', 'Bright Agency', 'agency', now()),
  ('Karim Haddad', 'karim@city1016.ae', '+971559876543', 'Sales manager', 'City 101.6', 'media_outlet', now())`)
await pool.query(`insert into quote_requests (outlet_id, buyer_id, message, created_at) select id, $1, 'Full page in the first week of December, banking section.', now() from outlets where name = 'Arabian Business'`, [buyer])

const n = (await pool.query(`select count(*)::int n from slots`)).rows[0].n
await pool.query(`update users set can_manage = true where role in ('buyer', 'seller')`) // demo users manage their own teams
// demo accounts have accepted the current terms (real people accept them when they join, and again when they change)
await pool.query(`update users set terms_version = (select value #>> '{}' from settings where key = 'terms_version' order by valid_from desc limit 1), terms_accepted_at = now()`)
console.log(`Seeded ${n} slots from ${from} and ${booked} past bookings. Sign in as demo@northwind.ae (buyer), sales@skyline.ae (seller) or ops@nashr.ae / omar@nashr.ae (staff), password ${PASSWORD}.\nStaff authenticator key (development only): ${DEMO_TOTP}`)
await pool.end()
