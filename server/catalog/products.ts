import { type Db, one } from '../core/db.js'
import { audit } from '../core/audit.js'
import { MarketError } from '../marketplace/market.js'
import { containsContactDetails } from '../core/contact.js'
import { checkDeadlines, checkTimes, createPlacement, generateSlots, type Break } from './placements.js'
import { AUDIENCES } from '../shared/audiences.js'
import { HAS_PROGRAMMES, PROGRAMME_FIELDS, SPEC_TYPES, TYPE_FIELDS, deadlineProblem, fieldProblems, label, mediaProblems, type MediaInput, type ProgrammeInput } from '../shared/products.js'

/*
 * Products (the brand), their media types (outlets) and programmes (placements), and listing them for dates (owner's rules).
 * A media type sells through one placement of its own ('main'), unless it is Radio, TV or Podcast sold by programme; then each
 * programme is a placement. Listing sets how it is sold and its prices, then puts slots on sale for the chosen dates.
 */
const noContacts = (...texts: (string | null | undefined)[]) => {
  if (containsContactDetails(texts.filter(Boolean).join(' \n '))) throw new MarketError('Emails and phone numbers are not allowed in what buyers see.')
}
const first = (problems: [string, string][]) => { if (problems.length) throw new MarketError(problems[0][1]) }
const lang = (l?: string) => l === 'bilingual' ? 'both' : l === 'english' || l === 'arabic' ? l : l ? 'other' : null
/** "30 seconds", "1 min", "45s": the length in seconds when it reads as one, for the break's end time. */
export function seconds(adLength?: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(m|min|minute|minutes|s|sec|secs|second|seconds)?\b/i.exec(adLength ?? '')
  if (!m) return undefined
  const n = Number(m[1]) * (/^m/i.test(m[2] ?? '') ? 60 : 1)
  return n > 0 && n <= 3600 ? Math.round(n) : undefined
}
const breaksOf = (d: Record<string, any>): Break[] => (d.breaks ?? []).map((b: any, i: number) => ({ label: b.label?.trim() || `Break ${i + 1}`, at: b.at, ...(seconds(d.adLength) ? { seconds: seconds(d.adLength) } : {}) }))

/** Outlets made before products existed (or by the older forms) each become a product of their own. */
export async function ensureProducts(db: Db, companyId: string) {
  for (const o of (await db.query(`select id, name, description, logo_key from outlets where company_id = $1 and product_id is null`, [companyId])).rows) {
    const p = await one(db, `insert into products (company_id, name, description, logo_key) values ($1, $2, $3, $4) returning id`, [companyId, o.name, o.description, o.logo_key])
    await db.query(`update outlets set product_id = $2 where id = $1`, [o.id, p.id])
  }
  await completeOlder(db, companyId)
}

/**
 * Products made before the product form have no default price, deadlines, language or file type of their own, so the form asked
 * for all of them on the first edit. What it sells already carries them, so they are filled in from there, once: the lowest
 * starting price, the deadlines its items use, their language, the file type their specs name. Nothing is made up: a product
 * with nothing on sale is left alone, and a missing description or audience (with no audience tags to read) is still asked for.
 */
const LANG: Record<string, string> = { english: 'english', arabic: 'arabic', both: 'bilingual', hindi: 'Hindi', urdu: 'Urdu' }
async function completeOlder(db: Db, companyId: string) {
  const older = (await db.query(`select o.* from outlets o where o.company_id = $1 and not o.archived and o.default_price is null
      and exists (select 1 from placements p where p.outlet_id = o.id and not p.archived)`, [companyId])).rows
  for (const o of older) {
    const items = (await db.query(`select language, starting_price, creative_lead_hours, close_lead_hours, specs from placements where outlet_id = $1 and not archived`, [o.id])).rows
    const creative = Math.max(0, Math.round(Math.min(...items.map(i => i.creative_lead_hours)) / 24))
    const close = Math.max(Math.round(Math.min(...items.map(i => i.close_lead_hours)) / 24), creative + 3)
    const langs = items.map(i => LANG[i.language]).filter(Boolean), language = langs.sort((a, b) => langs.filter(x => x === b).length - langs.filter(x => x === a).length)[0] ?? null
    const specs = items.map(i => i.specs ?? '').join(' ').toLowerCase(), types = SPEC_TYPES[o.channel] ?? SPEC_TYPES.other
    const tags = (o.audiences ?? []).map((k: string) => AUDIENCES.find(a => a[0] === k)?.[1]).filter(Boolean).join(', ')
    await db.query(`update outlets set default_price = $2, creative_days = coalesce(creative_days, $3), close_days = coalesce(close_days, $4), language = coalesce(language, $5),
        spec_type = coalesce(spec_type, $6), audience = coalesce(nullif(audience, ''), $7), details = details || '{"programmes": true}'::jsonb where id = $1`,
      [o.id, Math.min(...items.map(i => Number(i.starting_price))), creative, close, language, (types.find(t => specs.includes(t[0].toLowerCase())) ?? types[0])[0], tags || null])
  }
}

export async function saveProduct(db: Db, a: { id?: string; companyId: string; name: string; description: string; notes?: string | null }, actor: string, at: Date) {
  if (!a.name?.trim()) throw new MarketError('Add the outlet name.')
  if (!a.description?.trim()) throw new MarketError('Add a description.')
  if ((a.notes ?? '').length > 500) throw new MarketError('Keep it to 500 characters.')
  noContacts(a.name, a.description, a.notes)
  if (a.id) {
    const r = await db.query(`update products set name = $3, description = $4, notes = $5 where id = $1 and company_id = $2 and not archived`, [a.id, a.companyId, a.name.trim(), a.description.trim(), a.notes?.trim() || null])
    if (!r.rowCount) throw new MarketError('This outlet was not found.')
    await audit(db, actor, 'product.updated', 'product', a.id, null, at)
    return a.id
  }
  const p = await one(db, `insert into products (company_id, name, description, notes, created_at) values ($1, $2, $3, $4, $5) returning id`, [a.companyId, a.name.trim(), a.description.trim(), a.notes?.trim() || null, at])
  await audit(db, actor, 'product.created', 'product', p.id, { name: a.name }, at)
  return p.id as string
}

/** Delete a product: what is not yet sold stops being sold; bookings already made carry on. */
export async function archiveProduct(db: Db, id: string, companyId: string, actor: string, at: Date) {
  const r = await db.query(`update products set archived = true where id = $1 and company_id = $2 and not archived`, [id, companyId])
  if (!r.rowCount) throw new MarketError('This outlet was not found.')
  await db.query(`update outlets set archived = true where product_id = $1`, [id])
  await db.query(`update placements p set archived = true from outlets o where o.id = p.outlet_id and o.product_id = $1`, [id])
  await db.query(`update slots s set status = 'blocked' from placements p, outlets o where p.id = s.placement_id and o.id = p.outlet_id and o.product_id = $1
    and s.status = 'open' and not exists (select 1 from bids b where b.slot_id = s.id)`, [id])
  await audit(db, actor, 'product.deleted', 'product', id, null, at)
}

export async function saveMedia(db: Db, a: { id?: string; productId: string; companyId: string; m: MediaInput }, actor: string, at: Date) {
  const m = a.m
  first(mediaProblems(m))
  noContacts(m.name, m.nameAr, m.description, m.audience, m.notes, m.specDetail, m.channelOther, ...(m.blockedAdvertisers ?? []))
  await checkDeadlines(db, { creativeLeadHours: m.creativeDays * 24, closeLeadHours: m.closeDays * 24 }, at)
  const product = (await db.query(`select id from products where id = $1 and company_id = $2 and not archived`, [a.productId, a.companyId])).rows[0]
  if (!product) throw new MarketError('This outlet was not found.')
  const cols = [m.name.trim(), m.channel, m.channel === 'other' ? m.channelOther?.trim() : null, m.description.trim(), m.language, m.audience.trim(), m.markets,
    m.reach ?? null, m.reach ? m.reachUnit ?? null : null, m.sectors, m.blocked, m.defaultPrice, m.creativeDays, m.closeDays, m.specType, m.specDetail?.trim() || null,
    m.notes?.trim() || null, JSON.stringify(m.details ?? {})]
  let id = a.id
  if (id) {
    const own = (await db.query(`select channel from outlets where id = $1 and company_id = $2`, [id, a.companyId])).rows[0]
    if (!own) throw new MarketError('This product was not found.')
    if (own.channel !== m.channel) throw new MarketError('The media type cannot change once it is added. Add a new one instead.')
    await db.query(`update outlets set name = $3, channel = $4, channel_other = $5, description = $6, language = $7, audience = $8, markets = $9, reach = $10, reach_unit = $11,
      sectors = $12, blocked_industries = $13, default_price = $14, creative_days = $15, close_days = $16, spec_type = $17, spec_detail = $18, notes = $19, details = $20
      where id = $1 and company_id = $2`, [id, a.companyId, ...cols])
  } else {
    id = (await one(db, `insert into outlets (company_id, product_id, name, channel, channel_other, description, language, audience, markets, reach, reach_unit, sectors,
      blocked_industries, default_price, creative_days, close_days, spec_type, spec_detail, notes, details)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) returning id`, [a.companyId, a.productId, ...cols])).id
    await audit(db, actor, 'media.created', 'outlet', id!, { channel: m.channel }, at)
  }
  if (m.website && !/^https?:\/\/\S+\.\S+/.test(m.website.trim())) throw new MarketError('The website must start with https:// or http://.')
  if (m.nameAr !== undefined || m.website !== undefined) await db.query(`update outlets set name_ar = case when $4 then nullif($2, '') else name_ar end, website = case when $5 then nullif($3, '') else website end where id = $1`,
    [id, m.nameAr?.trim() ?? '', m.website?.trim() ?? '', m.nameAr !== undefined, m.website !== undefined])
  if (m.audiences || m.blockedAdvertisers) await db.query(`update outlets set audiences = coalesce($2, audiences), blocked_advertisers = coalesce($3, blocked_advertisers) where id = $1`,
    [id, m.audiences ?? null, m.blockedAdvertisers ?? null])
  await syncMain(db, id!, actor, at)
  return id!
}

/** Keep the media type's own placement in step with its fields (or set it aside while it is sold by programme). */
async function syncMain(db: Db, outletId: string, actor: string, at: Date) {
  const o = await one(db, `select * from outlets where id = $1`, [outletId])
  const d = o.details ?? {}, byProgramme = HAS_PROGRAMMES.includes(o.channel) && !!d.programmes
  const main = (await db.query(`select id from placements where outlet_id = $1 and kind = 'main' order by archived, id limit 1`, [outletId])).rows[0]
  if (byProgramme) { if (main) await db.query(`update placements set archived = true where id = $1`, [main.id]); return }
  // an older newspaper, website and so on is sold through the items it already had; it gets no unit of its own until those are gone
  if (d.programmes && !main) return
  const f = TYPE_FIELDS[o.channel] ?? [], opt = (k: string) => f.find(x => x.key === k)?.options
  // named by its format (a social product by its platform too); screens put the outlet's name in front: "The National · Custom"
  const fmt = label(opt('format'), d.format), name = [o.channel === 'social' ? label(opt('platform'), d.platform) : '', fmt].filter(Boolean).join(' · ') || o.name
  const week = o.channel === 'digital' && d.runs === '1w'
  const days: number[] = ['magazine', 'social'].includes(o.channel) ? [1, 2, 3, 4, 5, 6, 7] : (d.days?.length ? d.days : [1, 2, 3, 4, 5, 6, 7])
  const timed = ['radio', 'tv'].includes(o.channel)
  const p = {
    name: name.slice(0, 80), days: week ? [days[0]] : days, startsAt: timed ? d.airStart : undefined, endsAt: timed ? d.airEnd : undefined,
    breaks: timed ? breaksOf(d) : [], format: fmt.slice(0, 40) || null, unit: (week ? 'week' : 'day') as 'day' | 'week',
    specs: [label(SPEC_TYPES[o.channel], o.spec_type), o.spec_detail, o.channel === 'digital' && d.size ? label(opt('size'), d.size) : '', d.adLength].filter(Boolean).join(', ').slice(0, 400),
    description: (o.description ?? '').slice(0, 600), language: lang(o.language),
  }
  checkTimes(p)
  if (main) {
    await db.query(`update placements set name = $2, days = $3, starts_at_local = $4, ends_at_local = $5, breaks = $6, format = $7, unit = $8, specs = $9, description = $10,
      language = $11, default_price = $12, creative_lead_hours = $13, close_lead_hours = $14, archived = false, details = $15 where id = $1`,
      [main.id, p.name, p.days, p.startsAt ?? null, p.endsAt ?? null, JSON.stringify(p.breaks), p.format, p.unit, p.specs || null, p.description || null, p.language,
       o.default_price, o.creative_days * 24, o.close_days * 24, JSON.stringify(d)])
    return
  }
  const id = await createPlacement(db, { outletId, name: p.name, saleType: 'auction', days: p.days, startsAt: p.startsAt, endsAt: p.endsAt, breaks: p.breaks,
    startingPrice: Number(o.default_price), creativeLeadHours: o.creative_days * 24, closeLeadHours: o.close_days * 24, format: p.format ?? undefined,
    description: p.description || undefined, specs: p.specs || undefined, language: p.language ?? undefined, unit: p.unit, listing: 'manual' }, actor, at)
  await db.query(`update placements set kind = 'main', default_price = $2, details = $3 where id = $1`, [id, o.default_price, JSON.stringify(d)])
}

/** A programme under Radio, TV or Podcast: its own days, airtime, breaks and format; price and deadlines from the media type unless changed. */
export async function saveProgramme(db: Db, a: { id?: string; outletId: string; companyId: string; p: ProgrammeInput }, actor: string, at: Date) {
  const o = (await db.query(`select * from outlets where id = $1 and company_id = $2 and not archived`, [a.outletId, a.companyId])).rows[0]
  if (!o) throw new MarketError('This product was not found.')
  if (!HAS_PROGRAMMES.includes(o.channel)) throw new MarketError('Only Radio, TV and Podcast have programmes.')
  const p = a.p, d = p.details ?? {}
  if (!p.name?.trim()) throw new MarketError('Add the programme name.')
  first(fieldProblems(PROGRAMME_FIELDS(o.channel), d))
  if ((p.notes ?? '').length > 500) throw new MarketError('Keep it to 500 characters.')
  noContacts(p.name, p.notes, d.format, d.adLength)
  const creative = p.creativeDays ?? o.creative_days, close = p.closeDays ?? o.close_days, price = p.defaultPrice ?? Number(o.default_price)
  const dl = deadlineProblem(creative, close); if (dl) throw new MarketError(dl)
  await checkDeadlines(db, { creativeLeadHours: creative * 24, closeLeadHours: close * 24 }, at)
  const timed = ['radio', 'tv'].includes(o.channel)
  const fields = { name: p.name.trim().slice(0, 80), days: d.days, startsAt: timed ? d.airStart : undefined, endsAt: timed ? d.airEnd : undefined, breaks: timed ? breaksOf(d) : [],
    format: String(d.format ?? '').slice(0, 40) || undefined, specs: [label(SPEC_TYPES[o.channel], o.spec_type), o.spec_detail, d.adLength].filter(Boolean).join(', ').slice(0, 400) || undefined,
    description: p.notes?.trim() || o.description || undefined, language: lang(o.language) ?? undefined }
  checkTimes(fields)
  let id = a.id
  if (id) {
    const r = await db.query(`update placements set name = $3, days = $4, starts_at_local = $5, ends_at_local = $6, breaks = $7, format = $8, specs = $9, description = $10,
      default_price = $11, creative_lead_hours = $12, close_lead_hours = $13, details = $14 where id = $1 and outlet_id = $2 and kind = 'programme'`,
      [id, a.outletId, fields.name, fields.days, fields.startsAt ?? null, fields.endsAt ?? null, JSON.stringify(fields.breaks), fields.format ?? null, fields.specs ?? null,
       fields.description ?? null, p.defaultPrice ?? null, creative * 24, close * 24, JSON.stringify({ ...d, notes: p.notes ?? null, overrides: { price: p.defaultPrice ?? null, creativeDays: p.creativeDays ?? null, closeDays: p.closeDays ?? null } })])
    if (!r.rowCount) throw new MarketError('This programme was not found.')
  } else {
    id = await createPlacement(db, { outletId: a.outletId, ...fields, saleType: 'auction', startingPrice: price, creativeLeadHours: creative * 24, closeLeadHours: close * 24, listing: 'manual' }, actor, at)
    await db.query(`update placements set kind = 'programme', default_price = $2, details = $3 where id = $1`,
      [id, p.defaultPrice ?? null, JSON.stringify({ ...d, notes: p.notes ?? null, overrides: { price: p.defaultPrice ?? null, creativeDays: p.creativeDays ?? null, closeDays: p.closeDays ?? null } })])
  }
  return id!
}

export type ListingInput = { placementId: string; from: string; length: 'once' | 'weeks' | 'rolling'; weeks?: number; saleType: 'auction' | 'fixed' | 'quick_sale'
  startingPrice: number; buyNowPrice?: number | null; reservePrice?: number | null; anyBreakPrice?: number | null; packagePrice?: number | null }

/** List it: how it is sold and its prices for these dates, then the slots go on sale (the rest of the calendar keeps its own). */
export async function listIt(db: Db, companyId: string, l: ListingInput, actor: string, at: Date) {
  const p = (await db.query(`select p.* from placements p join outlets o on o.id = p.outlet_id where p.id = $1 and o.company_id = $2 and not p.archived`, [l.placementId, companyId])).rows[0]
  if (!p) throw new MarketError('This product was not found.')
  if (l.saleType !== 'auction' && (l.buyNowPrice || l.reservePrice)) throw new MarketError('Buy-now and minimum accepted prices are for auctions only.')
  if (l.buyNowPrice && l.buyNowPrice <= l.startingPrice) throw new MarketError('The buy-now price must be above the starting price.')
  if (l.reservePrice && l.buyNowPrice && l.reservePrice > l.buyNowPrice) throw new MarketError('The minimum accepted cannot be above the buy-now price.')
  const breaks = (p.breaks ?? []).length > 0
  await db.query(`update placements set sale_type = $2, starting_price = $3, buy_now_price = $4, reserve_price = $5, any_break_price = $6, package_price = $7,
    listing = $8, horizon_weeks = $9 where id = $1`, [p.id, l.saleType, l.startingPrice, l.buyNowPrice || null, l.reservePrice || null,
      breaks ? l.anyBreakPrice || null : null, breaks ? l.packagePrice || null : null, l.length === 'rolling' ? 'rolling' : 'manual', l.length === 'rolling' ? Math.min(26, l.weeks ?? 8) : p.horizon_weeks])
  const days = l.length === 'once' ? 1 : Math.min(26, l.weeks ?? 8) * 7
  const made = await generateSlots(db, p.id, l.from, days, at)
  if (l.length === 'rolling') await db.query(`update placements set listed_through = $2::date + $3::int - 1 where id = $1`, [p.id, l.from, days])
  await audit(db, actor, 'listing.created', 'placement', p.id, { from: l.from, length: l.length, weeks: l.weeks ?? null, saleType: l.saleType, startingPrice: l.startingPrice, slots: made }, at)
  return { slots: made }
}

/**
 * Several slots at once from the publisher's calendar: take off sale, put back, or set one starting price. The same rule as for one
 * slot applies to each: only slots nobody has bid on change, and a price goes on single slots only (packages keep the product's
 * own prices). What cannot change is counted as skipped, never an error, so a mixed selection still does its work.
 */
export async function bulkSlots(db: Db, companyId: string, b: { ids: string[]; action: 'block' | 'unblock' | 'price'; startingPrice?: number }, actor: string, at: Date) {
  const ids = [...new Set(b.ids)]
  const mine = `s.id = any($1::uuid[]) and p.id = s.placement_id and o.id = p.outlet_id and o.company_id = $2 and not exists (select 1 from bids x where x.slot_id = s.id)`
  let changed = 0
  if (b.action === 'price') {
    if (!b.startingPrice) throw new MarketError('Enter the new price.')
    changed = (await db.query(`update slots s set starting_price = $3 from placements p, outlets o where ${mine} and s.status = 'open' and s.kind = 'single' and s.closes_at > $4
        and s.starting_price <> $3 and (s.buy_now_price is null or s.buy_now_price > $3)`, [ids, companyId, b.startingPrice, at])).rowCount ?? 0
  } else {
    const off = b.action === 'block'
    changed = (await db.query(`update slots s set status = $3 from placements p, outlets o where ${mine} and s.status = $4 and ($5 or s.closes_at > $6)`,
      [ids, companyId, off ? 'blocked' : 'open', off ? 'open' : 'blocked', off, at])).rowCount ?? 0
  }
  if (changed) await audit(db, actor, `slots.bulk_${b.action}`, 'company', companyId, { asked: ids.length, changed, ...(b.action === 'price' ? { startingPrice: b.startingPrice } : {}) }, at)
  return { changed, skipped: ids.length - changed }
}

/**
 * "Repeat this week": every programme and media type that has something listed in the week starting `from` is listed again for the
 * following weeks, on the days it runs, at its current way of selling and prices. Dates already listed are left as they are.
 */
export async function repeatWeek(db: Db, companyId: string, from: string, weeks: number, actor: string, at: Date) {
  const places = (await db.query(`select distinct p.id, p.name from placements p join outlets o on o.id = p.outlet_id join slots s on s.placement_id = p.id
      where o.company_id = $1 and not p.archived and s.air_date >= $2::date and s.air_date < $2::date + 7 and s.status <> 'blocked' order by p.name`, [companyId, from])).rows
  if (!places.length) throw new MarketError('Nothing is listed in this week to repeat.')
  let slots = 0
  for (const p of places) slots += await generateSlots(db, p.id, (await one(db, `select ($1::date + 7)::text d`, [from])).d, weeks * 7, at)
  await audit(db, actor, 'listing.repeated', 'company', companyId, { from, weeks, programmes: places.length, slots }, at)
  return { slots, programmes: places.length }
}
