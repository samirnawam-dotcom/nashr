/**
 * Athena, Nashr's assistant (owner's "Buying moves to the Directory"), built from rules: no outside AI service.
 * It reads a buyer's sentence ("Radio in Dubai for a fintech launch in the first week of December, about AED 20,000") and turns it
 * into the Directory's own filters, plus what it uses only to rank (who to reach, the language, the other words). It only uses what
 * the buyer wrote and what is on Nashr: it never invents prices, reach or dates. Shared by the server and the screens.
 */
import { AUDIENCE_KEYS } from './audiences.js'
import { arNorm, speller, wordsOf, type Fix } from './spell.js'

export type AthenaRead = {
  channels: string[]; sectors: string[]; dateFrom?: string; dateTo?: string
  amount?: number                      // fils: a budget (planning) or the most to spend on one product (search)
  audiences: string[]; languages: string[]; dayparts: string[]
  words: string[]                      // what is left, matched against what sellers wrote
  signals: number; request: boolean    // a sentence for Athena, not a name to search
  missing: ('dates' | 'amount')[]
  fixes: Fix[]                         // words Athena read differently ("raido" → radio), to show the buyer
}

/** Arabic-Indic digits to Western, lower case, one space. */
const norm = (s: string) => arNorm(s).replace(R(/[٠-٩]/g), d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(R(/[۰-۹]/g), d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase()

// Arabic in the patterns is written as people write it; it is matched in one spelling (see arNorm), like the text
const R = (re: RegExp) => new RegExp(arNorm(re.source), re.flags)
const RX = (src: string, flags?: string) => new RegExp(arNorm(src), flags)

// each list: words (as written, lower case; Arabic too) → what they mean
const CHANNELS: [string, RegExp][] = [
  ['radio', R(/\b(radio|fm|radio stations?)\b|إذاع|راديو/)],
  ['tv', R(/\b(tv|television|tv shows?|channels?)\b|تلفزيون|تلفاز|قناة/)],
  ['digital', R(/\b(websites?|online|digital|web|news sites?|sites?|internet)\b|مواقع|موقع|إلكتروني|الكتروني|رقمي/)],
  ['newspaper', R(/\b(newspapers?|press|dailies)\b|صحيفة|صحف|جريدة|جرائد/)],
  ['magazine', R(/\b(magazines?|glossies)\b|مجلة|مجلات/)],
  ['newsletter', R(/\b(newsletters?|email|e-mail|mailers?)\b|نشرة|نشرات|بريد/)],
  ['podcast', R(/\b(podcasts?)\b|بودكاست/)],
  ['social', R(/\b(social|social media|instagram|tiktok|snapchat|x\.com|twitter|youtube|influencers?)\b|تواصل|انستغرام|تيك توك/)],
]
const PRINT = R(/\b(print)\b|مطبوع/)
const SECTORS: [string, RegExp][] = [
  ['Banking', R(/\b(bank(s|ing)?|fintech|credit cards?|debit cards?|cards? launch|loans?|mortgages?|finance|financial|payments?|insurance|wallets?)\b|بنك|بنوك|مصرف|مصرفي|بطاقة|بطاقات|تمويل|قرض/)],
  ['Real estate', R(/\b(real estate|property|properties|apartments?|villas?|developers?|off-plan)\b|عقار|عقارات|شقق|فلل/)],
  ['Retail', R(/\b(retail|shops?|stores?|fashion|supermarkets?|e-commerce|ecommerce|sale season)\b|تجزئة|متجر|متاجر|أزياء|تسوق/)],
  ['Technology', R(/\b(tech company|technology|software|apps?|app launch|startups?|saas|telecom|gadgets?)\b|تقنية|تكنولوجيا|تطبيق|برمجيات/)],
  ['Hospitality', R(/\b(hotels?|hospitality|restaurants?|cafes?|resorts?|tourism|travel|airlines?)\b|فندق|فنادق|مطعم|مطاعم|سياحة|سفر/)],
  ['Health', R(/\b(health|healthcare|clinics?|hospitals?|pharmacy|medical|wellness|dental)\b|صحة|صحي|عيادة|مستشفى|طبي/)],
  ['Automotive', R(/\b(cars?|auto|automotive|vehicles?|dealerships?|motors?)\b|سيارة|سيارات/)],
  ['Education', R(/\b(schools?|universit(y|ies)|education|courses?|academy|colleges?)\b|تعليم|مدرسة|مدارس|جامعة/)],
  ['Government', R(/\b(government|ministry|authority|public sector)\b|حكومة|حكومي|وزارة|هيئة/)],
  ['Crypto & trading', R(/\b(crypto|bitcoin|trading|forex|brokers?|exchange)\b|عملات رقمية|تداول/)],
  ['Alcohol & nightlife', R(/\b(alcohol|nightlife|bars?|clubs?|beer|wine)\b|خمور|ملاهي/)],
  ['Lottery & gaming', R(/\b(lottery|gaming|casino|betting|raffle)\b|يانصيب|مقامرة/)],
]
const AUD: [string, RegExp][] = [
  ['executives', R(/\b(business ?(people|owners|men|women|audience|leaders)|executives?|founders?|decision[- ]makers?|c-suite|ceos?|smes?|professionals in business)\b|رجال الأعمال|سيدات الأعمال|التنفيذيين|أصحاب الأعمال/)],
  ['affluent_expats', R(/\b(expats?|expatriates?|affluent)\b|الوافدين|المغتربين/)],
  ['arabic_families', R(/\b(emiratis?|arab families|arabic[- ]speaking|locals|nationals)\b|الأسر العربية|المواطنين|الإماراتيين/)],
  ['commuters', R(/\b(commuters?|drivers?|drive[- ]time|on the road|rush hour)\b|السائقين|الطريق/)],
  ['property_investors', R(/\b(investors?|property buyers?|home ?buyers?)\b|المستثمرين/)],
  ['young_professionals', R(/\b(young professionals?|millennials?|gen ?z|young adults?|graduates?|22-35)\b|الشباب|الشابات/)],
  ['students', R(/\b(students?|university students?)\b|الطلاب|طلاب/)],
  ['parents', R(/\b(parents?|mothers?|mums?|moms?|fathers?|families)\b|الآباء|الأمهات|العائلات/)],
  ['tech_adopters', R(/\b(early adopters?|tech[- ]savvy|gadget lovers?|gamers?)\b|محبي التقنية/)],
  ['luxury_shoppers', R(/\b(luxury|high[- ]net[- ]worth|hnwi?s?|premium shoppers?)\b|فاخر|الفاخرة/)],
  ['south_asian_community', R(/\b(south asians?|indians?|pakistanis?|filipinos?|hindi|urdu|malayalam|keralites?)\b|الجالية الهندية/)],
  ['sports_fans', R(/\b(sports?( fans)?|football|cricket|motorsport|f1|fans)\b|الرياضة|كرة القدم/)],
]
const LANG: [string, RegExp][] = [['english', R(/\b(english)\b|انجليزي|إنجليزي|الإنجليزية/)], ['arabic', R(/\b(arabic)\b|عربي|العربية/)]]
const DAYPART: [string, RegExp][] = [['morning', R(/\b(morning|breakfast|am show)\b|صباح|الصباحي/)], ['afternoon', R(/\b(afternoon|lunch)\b|الظهر|بعد الظهر/)],
  ['evening', R(/\b(evening|drive[- ]home|night|prime ?time)\b|مساء|المسائي/)]]

const MONTHS: [RegExp, number][] = [
  [R(/\b(jan(uary)?)\b|يناير|كانون الثاني/), 0], [R(/\b(feb(ruary)?)\b|فبراير|شباط/), 1], [R(/\b(mar(ch)?)\b|مارس|آذار/), 2], [R(/\b(apr(il)?)\b|أبريل|ابريل|نيسان/), 3],
  [R(/\b(may)\b|مايو|أيار/), 4], [R(/\b(jun(e)?)\b|يونيو|حزيران/), 5], [R(/\b(jul(y)?)\b|يوليو|تموز/), 6], [R(/\b(aug(ust)?)\b|أغسطس|اغسطس|آب/), 7],
  [R(/\b(sep(t|tember)?)\b|سبتمبر|أيلول/), 8], [R(/\b(oct(ober)?)\b|أكتوبر|اكتوبر|تشرين الأول/), 9], [R(/\b(nov(ember)?)\b|نوفمبر|تشرين الثاني/), 10],
  [R(/\b(dec(ember)?)\b|ديسمبر|كانون الأول/), 11],
]
const MONTH_WORD = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)'
const monthOf = (w: string) => MONTHS.find(([re]) => re.test(w))?.[1]
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

/** Dates the buyer named, from today in Dubai: "1-14 Dec", "Dec 1 to 14", "first week of December", "December", "next week". */
export function readDates(text: string, today: string): { from: string; to: string } | null {
  const s = norm(text), [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1]
  const yearFor = (m: number) => (m < tm ? ty + 1 : ty) // a month already past means next year
  let r: RegExpMatchArray | null
  // 1-14 dec · 1 to 14 december · from 1 to 14 dec
  if ((r = s.match(RX(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|until|till|إلى|الى|حتى)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_WORD}`)))) {
    const m = monthOf(r[3])!, y = yearFor(m), a = Math.min(+r[1], lastDay(y, m)), b = Math.min(+r[2], lastDay(y, m))
    return { from: iso(y, m, Math.min(a, b)), to: iso(y, m, Math.max(a, b)) }
  }
  // dec 1-14 · december 1 to 14
  if ((r = s.match(RX(`${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|until|till)\\s*(\\d{1,2})\\b`)))) {
    const m = monthOf(r[1])!, y = yearFor(m)
    return { from: iso(y, m, Math.min(+r[2], +r[3])), to: iso(y, m, Math.min(Math.max(+r[2], +r[3]), lastDay(y, m))) }
  }
  // first / second / third / fourth / last week of december
  if ((r = s.match(RX(`\\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\\s+(?:week|wk)\\s+(?:of|in)\\s+${MONTH_WORD}`)))
    || (r = s.match(RX(`(الأسبوع|الاسبوع)\\s+(الأول|الاول|الثاني|الثالث|الرابع|الأخير|الاخير)\\s+(?:من\\s+)?${MONTH_WORD}`)))) {
    const ar = r[1].startsWith('الأ') || r[1].startsWith('الا'), word = ar ? r[2] : r[1], month = ar ? r[3] : r[2]
    const n = R(/first|1st|الأول|الاول/).test(word) ? 0 : R(/second|2nd|الثاني/).test(word) ? 1 : R(/third|3rd|الثالث/).test(word) ? 2 : R(/fourth|4th|الرابع/).test(word) ? 3 : -1
    const m = monthOf(month)!, y = yearFor(m), end = lastDay(y, m)
    return n < 0 ? { from: iso(y, m, end - 6), to: iso(y, m, end) } : { from: iso(y, m, 1 + n * 7), to: iso(y, m, Math.min(7 + n * 7, end)) }
  }
  // on 5 december · 5 dec
  if ((r = s.match(RX(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_WORD}`)))) {
    const m = monthOf(r[2])!, y = yearFor(m), d = Math.min(+r[1], lastDay(y, m))
    return { from: iso(y, m, d), to: iso(y, m, d) }
  }
  if (R(/\b(next week)\b|الأسبوع القادم|الاسبوع القادم|الأسبوع المقبل/).test(s)) { const wd = new Date(today + 'T12:00:00Z').getUTCDay() || 7, mon = addDays(today, 8 - wd); return { from: mon, to: addDays(mon, 6) } }
  if (R(/\b(this week)\b|هذا الأسبوع/).test(s)) { const wd = new Date(today + 'T12:00:00Z').getUTCDay() || 7; return { from: today, to: addDays(today, 7 - wd) } }
  if (R(/\b(next month)\b|الشهر القادم|الشهر المقبل/).test(s)) { const m = (tm + 1) % 12, y = tm === 11 ? ty + 1 : ty; return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) } }
  if (R(/\b(this month)\b|هذا الشهر/).test(s)) return { from: today, to: iso(ty, tm, lastDay(ty, tm)) }
  // a month named on its own: the whole month (from today if it is this month)
  for (const [re, m] of MONTHS) if (re.test(s) && !(m === 4 && /\bmay (be|i|we|you)\b/.test(s))) {
    const y = yearFor(m), from = m === tm && y === ty ? today : iso(y, m, 1)
    return { from, to: iso(y, m, lastDay(y, m)) }
  }
  return null
}

/** An amount in dirhams: "AED 20,000", "20k", "20,000 dirhams", "55 ألف درهم", "budget 50000". In fils. */
export function readAmount(text: string): number | null {
  const s = norm(text)
  const m = s.match(R(/(?:aed|dhs?|درهم)\s*([\d][\d,.]*)\s*(k|m|thousand|million|ألف|الف|مليون)?/))
    ?? s.match(R(/([\d][\d,.]*)\s*(k|m|thousand|million|ألف|الف|مليون)?\s*(?:aed|dhs?|dirhams?|درهم)/))
    ?? s.match(R(/([\d][\d,.]*)\s*(k|thousand|ألف|الف)\b/))
    ?? s.match(R(/(?:budget|spend|ميزانية|بميزانية)\s*(?:of|is|:|around|about|حوالي)?\s*([\d][\d,.]*)\s*(k|m|thousand|million|ألف|الف|مليون)?/))
  if (!m) return null
  const n = Number(m[1].replace(/,/g, '')), unit = m[2] ?? ''
  if (!Number.isFinite(n) || n <= 0) return null
  const mult = R(/^(k|thousand|ألف|الف)$/).test(unit) ? 1_000 : R(/^(m|million|مليون)$/).test(unit) ? 1_000_000 : 1
  const aed = n * mult
  return aed >= 100 && aed <= 100_000_000 ? Math.round(aed * 100) : null
}

const STOP = new Set(('a an the and or for to in on of at by with about around approx approximately roughly from until till my our we i me us need want looking ' +
  'launch launching campaign campaigns ad ads advert advertising advertise promote promoting budget aed dhs dirhams week weeks month in dubai uae abu dhabi sharjah ' +
  'first second third last next this mostly some please show find me like would something people audience reach reaching between only ' +
  'في من إلى على عن مع أو و ل لـ ب حملة إعلان اعلان أريد نريد ميزانية درهم دبي الإمارات').split(' '))

// What Athena knows how to spell: every word in its lists, plus the words people use around them.
const EXTRA = ('january february march april may june july august september october november december week weeks month months next first second third fourth last ' +
  'launch launching campaign budget dirhams thousand million dubai abu dhabi sharjah ajman fujairah khaimah emirates about around approximately under between ' +
  'business people audience morning evening afternoon breakfast weekend ramadan eid national christmas summer winter school opening sale ' +
  'ميزانية حملة إطلاق الأسبوع الشهر القادم المقبل الأول الثاني الثالث الرابع الأخير حوالي ألف مليون درهم دبي أبوظبي الشارقة عجمان رمضان العيد صباحا مساء').split(' ')
let FIX: ReturnType<typeof speller> | null = null
/** The text with misspelled words read as the nearest word Athena knows, and what was changed. */
export function fixSpelling(text: string) {
  FIX ??= speller([...wordsOf([...[CHANNELS, SECTORS, AUD, LANG, DAYPART].flat().map(([, re]) => re), PRINT, ...MONTHS.map(([re]) => re)]), ...EXTRA])
  return FIX(text)
}

/** Read a sentence. `today` is the Dubai date (YYYY-MM-DD). */
export function readRequest(text: string, today: string): AthenaRead {
  const { text: s, fixes } = fixSpelling(norm(text))
  const pick = (list: [string, RegExp][]) => list.filter(([, re]) => re.test(s)).map(([k]) => k)
  let channels = pick(CHANNELS)
  if (PRINT.test(s)) channels = [...new Set([...channels, 'newspaper', 'magazine'])]
  // "online" news sites and "social" both say "online"-ish: keep what was asked
  const sectors = pick(SECTORS), audiences = pick(AUD).filter(a => AUDIENCE_KEYS.includes(a)), languages = pick(LANG), dayparts = pick(DAYPART)
  const dates = readDates(s, today), amount = readAmount(s) ?? undefined
  const signals = (channels.length ? 1 : 0) + (sectors.length ? 1 : 0) + (dates ? 1 : 0) + (amount ? 1 : 0) + (audiences.length ? 1 : 0) + (languages.length ? 1 : 0)
  const words = s.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(' ').filter(w => w.length > 2 && !STOP.has(w) && !/^\d/.test(w))
  const count = s.split(' ').filter(Boolean).length
  // a name ("Skyline", "Gulf News") searches as normal; a sentence asks Athena
  const request = signals >= 2 || (signals >= 1 && count >= 3)
  const missing: AthenaRead['missing'] = []
  if (!dates) missing.push('dates'); if (!amount) missing.push('amount')
  return { channels, sectors, dateFrom: dates?.from, dateTo: dates?.to, amount, audiences, languages, dayparts, words, signals, request, missing, fixes }
}

/** How well a product fits what was asked (higher is better), and the reasons, for the one line Athena shows. */
export type Candidate = { channel: string; placement: string; brand: string; kind: string; audiences: string[]; audienceText: string | null; text: string
  language: string | null; reach: number | null; price: number; onSale: number; popular: number; sectors: string[]; blocked: string[]; dayparts?: string[] }
export function score(c: Candidate, r: Pick<AthenaRead, 'audiences' | 'languages' | 'words' | 'dayparts' | 'sectors'>) {
  let s = 0
  const hitAud = r.audiences.filter(a => c.audiences.includes(a))
  s += hitAud.length * 3
  const hay = norm(`${c.text} ${c.audienceText ?? ''} ${c.placement}`)
  const hitWords = r.words.filter(w => hay.includes(w))
  s += Math.min(hitWords.length, 4)
  const lang = (c.language ?? '').toLowerCase()
  if (r.languages.length && lang && r.languages.some(l => lang.includes(l) || lang === 'bilingual')) s += 2
  if (r.dayparts.length && c.dayparts?.some(d => r.dayparts.includes(d))) s += 2
  // more reach for the price, where the seller gave reach (people per dirham, on a gentle scale)
  if (c.reach && c.price > 0) s += Math.min(3, Math.log10(1 + (c.reach / (c.price / 100)) * 10))
  s += Math.min(1, c.onSale / 10) + Math.min(1, c.popular / 20)
  return { score: s, audiences: hitAud }
}

// ---- planning a campaign: the best way to spend a budget (owner's doc, "Athena's main job") --------------------------------
export type PlanCandidate = Candidate & { placementId: string; brandKey: string; slotId: string; slotAt: string; saleType: string; fit: number; why: string[] }
export type PlanPick = { placementId: string; slotId: string; estimate: number }
export type PlanPart = { channel: string; share: number; amount: number; count: number; picks: PlanCandidate[]; spare: PlanCandidate[] }

/** What a product will likely cost: its price now, with a little room for an auction going above its starting price. */
export const estimate = (c: { price: number; saleType: string }) => Math.round(c.saleType === 'auction' ? c.price * 1.1 : c.price)

/**
 * Split a budget across media types and pick the best products for each part. Only what is on sale (the candidates already are),
 * within the budget, best fit first, mixing outlets rather than putting everything on one. `shares` (percent per media type) is
 * the buyer's own split when they adjust it; otherwise the split follows where the best fits are.
 */
export function planBudget(cands: PlanCandidate[], budget: number, opts: { channels?: string[]; shares?: Record<string, number>; max?: number } = {}): PlanPart[] {
  const by = new Map<string, PlanCandidate[]>()
  for (const c of cands) (by.get(c.channel) ?? by.set(c.channel, []).get(c.channel)!).push(c)
  for (const l of by.values()) l.sort((a, b) => b.fit - a.fit || a.price - b.price)
  // which media types: the buyer's split, else the ones they named, else the three with the strongest fits
  const strength = (ch: string) => { const seen = new Set<string>(), top = by.get(ch)!.filter(c => !seen.has(c.placementId) && seen.add(c.placementId)).slice(0, 3)
    return top.reduce((n, c) => n + c.fit + 1, 0) }
  let chans = opts.shares ? Object.keys(opts.shares).filter(c => by.has(c) && opts.shares![c] > 0)
    : opts.channels?.length ? opts.channels.filter(c => by.has(c)) : []
  if (!chans.length) chans = [...by.keys()].sort((a, b) => strength(b) - strength(a)).slice(0, 3)
  if (!chans.length) return []
  // shares in steps of 5%, adding up to 100
  const raw = chans.map(c => opts.shares?.[c] ?? strength(c)), sum = raw.reduce((a, b) => a + b, 0) || 1
  const shares = raw.map(v => Math.max(5, Math.round((v / sum) * 20) * 5))
  shares[0] += 100 - shares.reduce((a, b) => a + b, 0)
  const max = opts.max ?? 8
  return chans.map((ch, i) => {
    const amount = Math.round(budget * shares[i] / 100), list = by.get(ch)!, picks: PlanCandidate[] = [], brands = new Set<string>()
    let left = amount
    // first one product per outlet, then more from the same outlets if money is left
    for (const pass of [0, 1]) for (const c of list) {
      if (picks.length >= max) break
      if (picks.includes(c) || (pass === 0 && brands.has(c.brandKey))) continue
      const e = estimate(c); if (e > left) continue
      picks.push(c); brands.add(c.brandKey); left -= e
    }
    picks.sort((a, b) => a.slotAt.localeCompare(b.slotAt))
    // to swap with: other products (not other dates of the ones picked), best fit first
    const used = new Set(picks.map(p => p.placementId)), spare: PlanCandidate[] = []
    for (const c of list) if (!used.has(c.placementId) && !spare.some(x => x.placementId === c.placementId) && spare.length < 3) spare.push(c)
    return { channel: ch, share: shares[i], amount, count: new Set(list.map(c => c.placementId)).size, picks, spare }
  })
}
