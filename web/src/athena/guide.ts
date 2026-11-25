import { t } from '../i18n'
import { accountQA, buyerQA, sellerQA, type Rules } from '../Help'
import { readRequest } from '../../../server/shared/athena'
import { audienceLabel } from '../../../server/shared/audiences'
import { CHANNEL_NAME } from '../media'

/*
 * Athena's chat, built from rules (no outside AI): it answers "how do I…" questions for the person's role, takes them to the
 * right page, turns a campaign sentence into a Directory search, and knows what the page they are on is for. Answers about
 * rules come from the Help page's own answers (built from the live settings), so the two never disagree. When Athena does
 * not know, it says so and offers Nashr's team.
 */
export type Role = 'buyer' | 'seller' | 'admin'
export type Link = { label: string; href: string }
export type Reply = { text: string; links?: Link[]; chips?: string[] }

/** Lower case, Western digits, no accents, one space. */
export const norm = (s: string) => s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '').replace(/\s+/g, ' ').trim()
const STOP = new Set(['the', 'a', 'an', 'to', 'i', 'do', 'how', 'can', 'my', 'is', 'are', 'what', 'where', 'of', 'for', 'in', 'on', 'it', 'me', 'and', 'or', 'with', 'please',
  'you', 'does', 'did', 'will', 'should', 'want', 'need', 'get', 'be', 'this', 'that', 'there', 'when', 'which', 'who', 'why', 'kann', 'كيف', 'ماذا', 'اين', 'هل', 'في', 'من', 'على', 'الى', 'عن', 'ما', 'انا', 'اريد'])
const tokens = (s: string) => norm(s).split(/[^a-z0-9؀-ۿ]+/).filter(w => w.length > 1 && !STOP.has(w))

/** Edit distance, capped: enough to forgive one or two typos ("raido", "auciton"). */
function near(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 9
  const d = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i
    for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp } }
  return d[b.length]
}
/** How well the words match one keyword (a word, a phrase, or Arabic stem). */
function hit(words: string[], text: string, k: string) {
  if (k.includes(' ') || /[؀-ۿ]/.test(k)) return text.includes(norm(k)) ? 3 : 0
  let best = 0
  for (const w of words) {
    if (w === k) return 2
    if (k.length >= 4 && w.length >= 4 && (w.startsWith(k) || k.startsWith(w))) best = Math.max(best, 1.6)
    else if (k.length >= 5 && near(w, k) <= (k.length >= 8 ? 2 : 1)) best = Math.max(best, 1.3)
  }
  return best
}

type Topic = { id: string; roles: Role[]; words: string[]; answer: (r: Rules | null) => string; go?: () => Link; chips?: () => string[] }
const qa = (list: (r: Rules) => [string, string][], i: number) => (r: Rules | null) => r ? list(r)[i][1] : t('See Help for the details.')

/** What Athena knows how to explain. Words in English and Arabic; typos are forgiven. */
const TOPICS: Topic[] = [
  // ---- buyers
  { id: 'book', roles: ['buyer'], words: ['book', 'booking', 'buy', 'reserve', 'purchase', 'slot', 'احجز', 'حجز', 'شراء'], answer: qa(buyerQA, 0),
    go: () => ({ label: t('Open the Directory'), href: '/directory' }), chips: () => [t('What is auto-bid?'), t('When do I pay?')] },
  { id: 'bid', roles: ['buyer'], words: ['bid', 'bidding', 'auction', 'outbid', 'highest', 'مزاد', 'مزايدة', 'عرض سعر'], answer: () => t('Open a slot from the Directory or your Calendar and choose Bid. The highest bid when bidding closes wins. In the bid drawer, Athena shows what similar slots sold for and suggests a bid.'),
    go: () => ({ label: t('Open my Calendar'), href: '/calendar' }), chips: () => [t('What is auto-bid?'), t('Where are my bids?')] },
  { id: 'autobid', roles: ['buyer'], words: ['auto-bid', 'autobid', 'auto bid', 'automatic', 'maximum', 'تلقائي'], answer: qa(buyerQA, 1), chips: () => [t('When do I pay?')] },
  { id: 'mybids', roles: ['buyer'], words: ['my bids', 'bids', 'leading', 'winning', 'won', 'lost', 'مزايداتي'], answer: () => t('Your bids are in the My bids bar on your Calendar: leading, outbid, won and lost. You also get a bell when someone outbids you.'),
    go: () => ({ label: t('Open my Calendar'), href: '/calendar' }) },
  { id: 'pay', roles: ['buyer'], words: ['pay', 'payment', 'card', 'paying', 'owe', 'دفع', 'الدفع', 'بطاقة'], answer: qa(buyerQA, 2), go: () => ({ label: t('Open my bookings'), href: '/reports' }), chips: () => [t('Where does my money go?')] },
  { id: 'escrow', roles: ['buyer'], words: ['money', 'held', 'escrow', 'safe', 'refund', 'اموال', 'استرداد'], answer: qa(buyerQA, 3), chips: () => [t('What if the ad did not run?')] },
  { id: 'issue', roles: ['buyer'], words: ['issue', 'problem', 'did not run', 'didnt run', 'wrong', 'dispute', 'complain', 'مشكلة', 'شكوى', 'نزاع'], answer: qa(buyerQA, 4), go: () => ({ label: t('Open my bookings'), href: '/reports' }) },
  { id: 'cancel', roles: ['buyer'], words: ['cancel', 'cancellation', 'withdraw', 'الغاء', 'إلغاء'], answer: qa(buyerQA, 5) },
  { id: 'receipts', roles: ['buyer'], words: ['receipt', 'receipts', 'invoice', 'invoices', 'tax', 'vat', 'trn', 'فاتورة', 'فواتير', 'ايصال', 'ضريبة'], answer: qa(buyerQA, 6),
    go: () => ({ label: t('Open receipts and invoices'), href: '/documents' }) },
  { id: 'campaign', roles: ['buyer'], words: ['campaign', 'campaigns', 'plan', 'planner', 'budget', 'حملة', 'حملات', 'خطة', 'ميزانية'], answer: () => t('A campaign holds your dates, budget, brief and the products you are considering. Open it and choose "Plan with Athena": I suggest a split by media type and the best products for each part, and you keep what you like.'),
    go: () => ({ label: t('Open Campaigns'), href: '/campaigns' }), chips: () => [t('How do I book a slot?')] },
  { id: 'clients', roles: ['buyer'], words: ['client', 'clients', 'agency', 'brand', 'عميل', 'عملاء', 'وكالة'], answer: () => t('Agencies add each brand they buy for under Clients, with its industry and budget. Then choose the client when you bid, and receipts and reports are kept per client.'),
    go: () => ({ label: t('Open Clients'), href: '/clients' }) },
  { id: 'brief', roles: ['buyer'], words: ['brief', 'creative', 'artwork', 'file', 'upload', 'material', 'تصميم', 'ملف', 'الإعلان'], answer: () => t('Add the brief and your creative in the bid drawer before you bid or book; the publisher sees them before accepting. Changes go through the booking, before the creative deadline.'),
    go: () => ({ label: t('Open my bookings'), href: '/reports' }) },
  { id: 'proof', roles: ['buyer'], words: ['proof', 'approve', 'review', 'evidence', 'screenshot', 'اثبات', 'إثبات', 'موافقة'], answer: () => t('When the ad has run, the publisher sends proof. Open the booking, check it, and approve it or report an issue. The publisher is paid only after that.'),
    go: () => ({ label: t('Open my bookings'), href: '/reports' }) },
  { id: 'saved', roles: ['buyer'], words: ['saved search', 'alert', 'alerts', 'notify me', 'favourite', 'favorite', 'save', 'star', 'تنبيه', 'حفظ', 'المفضلة'], answer: () => t('In the Directory, star an outlet to save it, or save a search: Nashr tells you when new slots match it.'),
    go: () => ({ label: t('Open the Directory'), href: '/directory' }) },
  { id: 'compare', roles: ['buyer'], words: ['compare', 'comparison', 'side by side', 'قارن', 'مقارنة'], answer: () => t('In the Directory, tick Compare on up to four products and open Compare to see them side by side: price, reach, audience and dates.'),
    go: () => ({ label: t('Open the Directory'), href: '/directory?view=products' }) },
  { id: 'company', roles: ['buyer'], words: ['company', 'address', 'logo', 'industry', 'profile', 'شركة', 'شعار', 'عنوان'], answer: () => t('Your company details, TRN, address, industry and logo are under Company. They appear on your receipts and on your profile for publishers.'),
    go: () => ({ label: t('Open Company'), href: '/company' }) },
  { id: 'results', roles: ['buyer'], words: ['results', 'report', 'reports', 'performance', 'spend', 'spent', 'نتائج', 'تقارير', 'تقرير'], answer: () => t('Reports shows your bookings, spending and results by campaign, client and media type, with a CSV for each.'),
    go: () => ({ label: t('Open Reports'), href: '/reports' }) },
  // ---- publishers
  { id: 'requests', roles: ['seller'], words: ['request', 'requests', 'booking', 'bookings', 'accept', 'decline', 'inbox', 'طلب', 'طلبات', 'قبول', 'رفض'], answer: qa(sellerQA, 0),
    go: () => ({ label: t('Open Inbox'), href: '/inbox' }), chips: () => [t('When am I paid?'), t('When is proof due?')] },
  { id: 'paid', roles: ['seller'], words: ['paid', 'payout', 'payouts', 'money', 'earnings', 'balance', 'bank', 'تحويل', 'أرباح', 'ارباح', 'رصيد', 'بنك'], answer: qa(sellerQA, 1),
    go: () => ({ label: t('Open Balances'), href: '/earnings' }) },
  { id: 'proofdue', roles: ['seller'], words: ['proof', 'evidence', 'screenshot', 'aired', 'اثبات', 'إثبات'], answer: qa(sellerQA, 2), go: () => ({ label: t('Open Inbox'), href: '/inbox' }) },
  { id: 'changes', roles: ['seller'], words: ['creative', 'changes', 'revision', 'artwork', 'تعديل', 'تصميم'], answer: qa(sellerQA, 3) },
  { id: 'invoices', roles: ['seller'], words: ['invoice', 'invoices', 'tax', 'vat', 'trn', 'فاتورة', 'فواتير', 'ضريبة'], answer: qa(sellerQA, 4), go: () => ({ label: t('Open Your business'), href: '/profile' }) },
  { id: 'cantrun', roles: ['seller'], words: ['cannot run', 'cant run', 'cancel', 'الغاء', 'إلغاء'], answer: qa(sellerQA, 5) },
  { id: 'product', roles: ['seller'], words: ['product', 'products', 'listing', 'listings', 'add', 'new', 'programme', 'program', 'placement', 'منتج', 'منتجات', 'برنامج', 'إضافة', 'اضافة'], answer: () => t('Under Products, add a product: choose its media type, describe it for buyers, then list it with how it sells (auction, fixed price or quick sale), its price and its dates.'),
    go: () => ({ label: t('Open Products'), href: '/listings' }), chips: () => [t('How should I price it?')] },
  { id: 'price', roles: ['seller'], words: ['price', 'pricing', 'prices', 'cheap', 'expensive', 'rate', 'rates', 'سعر', 'اسعار', 'أسعار', 'تسعير'], answer: () => t('Set the price when you list a product. Athena compares it with what similar products sold for on Nashr, so you can see if it is above or below the market.'),
    go: () => ({ label: t('Open Products'), href: '/listings' }) },
  { id: 'autoaccept', roles: ['seller'], words: ['auto-accept', 'auto accept', 'automatic', 'تلقائي'], answer: () => t('Switch on auto-accept on a product, and its bookings are accepted for you as they come in. You can switch it off any time.'),
    go: () => ({ label: t('Open Products'), href: '/listings' }) },
  { id: 'schedule', roles: ['seller'], words: ['calendar', 'schedule', 'dates', 'slots', 'availability', 'تقويم', 'جدول', 'مواعيد'], answer: () => t('Your Calendar shows every date you have on sale, sold and running, by day, week or month.'),
    go: () => ({ label: t('Open my Calendar'), href: '/schedule' }) },
  { id: 'business', roles: ['seller'], words: ['business', 'profile', 'logo', 'rate card', 'about', 'شعار', 'ملف'], answer: () => t('Your business profile, logo, rate card and tax details are under Your business. Buyers see the profile before they book.'),
    go: () => ({ label: t('Open Your business'), href: '/profile' }) },
  // ---- Nashr's team
  { id: 'access', roles: ['admin'], words: ['access', 'approve', 'requests', 'join', 'signup', 'sign up', 'وصول', 'طلبات'], answer: () => t('New companies ask to join under Access. Approve one and Nashr sends them an invitation.'),
    go: () => ({ label: t('Open Access'), href: '/access' }) },
  { id: 'registrations', roles: ['admin'], words: ['registration', 'registrations', 'registered', 'event', 'conference', 'qr', 'تسجيل', 'مسجلين'], answer: () => t('Everyone who registered their interest is under Registrations, with a filter by event and a CSV download.'),
    go: () => ({ label: t('Open Registrations'), href: '/registrations' }) },
  { id: 'disputes', roles: ['admin'], words: ['dispute', 'disputes', 'issue', 'issues', 'complaint', 'نزاع', 'شكوى'], answer: () => t('Open disputes are under Disputes: both sides, the proof and the timeline, and your written decision.'),
    go: () => ({ label: t('Open Disputes'), href: '/disputes' }) },
  { id: 'signinas', roles: ['admin'], words: ['sign in as', 'impersonate', 'help a user', 'view as'], answer: () => t('Open the account, choose Sign in as, and give a reason. It lasts an hour and every step is logged under your name.'),
    go: () => ({ label: t('Open Accounts'), href: '/accounts' }) },
  { id: 'emails', roles: ['admin'], words: ['email', 'emails', 'smtp', 'sent', 'outbox', 'بريد'], answer: () => t('Every email Nashr sends is on the Emails page, sent or waiting, with the reason when one fails.'),
    go: () => ({ label: t('Open Emails'), href: '/emails' }) },
  // ---- everyone
  { id: 'password', roles: ['buyer', 'seller', 'admin'], words: ['password', 'forgot', 'reset', 'كلمة المرور', 'كلمة السر'], answer: () => accountQA()[0][1] + ' ' + t('To change it while signed in, open Your account.'),
    go: () => ({ label: t('Open Your account'), href: '/account' }) },
  { id: 'team', roles: ['buyer', 'seller'], words: ['colleague', 'team', 'invite', 'user', 'users', 'member', 'staff', 'زميل', 'فريق', 'دعوة'], answer: () => t('The account owner invites colleagues from Your account, Team, and chooses what each may do: pay, decide on bookings, manage the team.'),
    go: () => ({ label: t('Open Your account'), href: '/account' }) },
  { id: 'twostep', roles: ['buyer', 'seller', 'admin'], words: ['two-step', 'two step', '2fa', 'authenticator', 'security', 'code', 'رمز', 'التحقق'], answer: () => t('Turn on two-step sign-in under Your account: scan the code with an authenticator app, then enter its 6-digit code each time you sign in.'),
    go: () => ({ label: t('Open Your account'), href: '/account' }) },
  { id: 'language', roles: ['buyer', 'seller', 'admin'], words: ['arabic', 'english', 'language', 'عربي', 'العربية', 'انجليزي', 'اللغة'], answer: () => t('Switch between English and Arabic with the language button at the top. Your emails follow the language you use.') },
  { id: 'notifications', roles: ['buyer', 'seller', 'admin'], words: ['notification', 'notifications', 'bell', 'emails', 'email', 'اشعار', 'إشعارات', 'اشعارات'], answer: () => t('The bell shows everything that needs you. Choose which emails you get under Your account.'),
    go: () => ({ label: t('Open Your account'), href: '/account' }) },
  { id: 'contact', roles: ['buyer', 'seller'], words: ['contact', 'support', 'human', 'person', 'team', 'talk', 'call', 'تواصل', 'دعم', 'مساعدة'], answer: () => t('Nashr\'s team answers on the Help page, usually within one working day, and you get a bell when they reply.'),
    go: () => ({ label: t('Contact Nashr'), href: '/help' }) },
]

/** The main places, by what people call them, for "take me to…" / "where is…". */
const PLACES: { roles: Role[]; words: string[]; label: () => string; href: string }[] = [
  { roles: ['buyer'], words: ['dashboard', 'home', 'الرئيسية', 'لوحة'], label: () => t('Dashboard'), href: '/dashboard' },
  { roles: ['seller'], words: ['dashboard', 'home', 'الرئيسية', 'لوحة'], label: () => t('Dashboard'), href: '/home' },
  { roles: ['admin'], words: ['overview', 'dashboard', 'home'], label: () => t('Overview'), href: '/admin' },
  { roles: ['buyer'], words: ['directory', 'shop', 'outlets', 'publishers', 'دليل', 'المنصات'], label: () => t('Directory'), href: '/directory' },
  { roles: ['buyer', 'admin'], words: ['calendar', 'تقويم'], label: () => t('Calendar'), href: '/calendar' },
  { roles: ['seller'], words: ['calendar', 'schedule', 'تقويم'], label: () => t('Calendar'), href: '/schedule' },
  { roles: ['buyer'], words: ['campaigns', 'campaign', 'حملات'], label: () => t('Campaigns'), href: '/campaigns' },
  { roles: ['buyer'], words: ['clients', 'عملاء'], label: () => t('Clients'), href: '/clients' },
  { roles: ['buyer', 'seller'], words: ['inbox', 'messages', 'الوارد', 'رسائل'], label: () => t('Inbox'), href: '/inbox' },
  { roles: ['buyer', 'seller', 'admin'], words: ['reports', 'تقارير'], label: () => t('Reports'), href: '/reports' },
  { roles: ['seller'], words: ['products', 'listings', 'منتجات'], label: () => t('Products'), href: '/listings' },
  { roles: ['buyer', 'seller', 'admin'], words: ['account', 'settings', 'حسابي', 'الحساب'], label: () => t('Your account'), href: '/account' },
  { roles: ['buyer', 'seller'], words: ['help', 'مساعدة'], label: () => t('Help'), href: '/help' },
  { roles: ['admin'], words: ['deals'], label: () => t('Deals'), href: '/deals' },
  { roles: ['admin'], words: ['accounts', 'companies'], label: () => t('Accounts'), href: '/accounts' },
  { roles: ['admin'], words: ['payouts'], label: () => t('Payouts'), href: '/payouts' },
]

/** What each page is for, and what people usually ask there. */
const PAGES: { re: RegExp; roles?: Role[]; say: () => string; chips: () => string[] }[] = [
  { re: /^\/directory/, say: () => t('This is the Directory: every outlet and product on Nashr. Type what you need in a sentence, like "radio in Dubai for a bank launch in December, about AED 20,000", and I rank the best fits first.'),
    chips: () => [t('How do I compare products?'), t('How do I save a search?')] },
  { re: /^\/calendar/, roles: ['buyer'], say: () => t('Your Calendar tracks the dates you are following and bidding on. My bids shows where you lead and where you were outbid.'), chips: () => [t('What is auto-bid?'), t('When do I pay?')] },
  { re: /^\/campaigns/, say: () => t('Campaigns hold your plans. Open one and choose "Plan with Athena" for a suggested split and the best products for your budget.'), chips: () => [t('How do I book a slot?')] },
  { re: /^\/(reports|results|documents|bookings)/, roles: ['buyer'], say: () => t('Here are your bookings and what each one needs: payment, creative, proof to approve. Receipts and invoices are in the last tab.'), chips: () => [t('What if the ad did not run?'), t('Can I cancel?')] },
  { re: /^\/inbox/, roles: ['seller'], say: () => t('Your Inbox holds booking requests to accept or decline, and messages from buyers.'), chips: () => [t('When am I paid?'), t('When is proof due?')] },
  { re: /^\/listings/, say: () => t('Products is your catalogue. Add a product, then list it with its sale type, price and dates.'), chips: () => [t('How should I price it?'), t('What is auto-accept?')] },
  { re: /^\/(earnings|reports)/, roles: ['seller'], say: () => t('Your sales, balances and payouts. Money is released after the buyer approves proof.'), chips: () => [t('When am I paid?')] },
  { re: /^\/(dashboard|home)$/, say: () => t('Your dashboard shows what needs you today. Ask me anything about Nashr, or type a campaign in a sentence and I will find the best fits.'), chips: () => [] },
]

const DEFAULT_CHIPS: Record<Role, () => string[]> = {
  buyer: () => [t('How do I book a slot?'), t('What is auto-bid?'), t('When do I pay?'), t('Radio in Dubai for a bank launch next month, about AED 20,000')],
  seller: () => [t('How do I add a product?'), t('When am I paid?'), t('When is proof due?')],
  admin: () => [t('Where are the registrations?'), t('How do I sign in as a user?'), t('Where are the emails?')],
}

/** Athena's first words on a page. */
export function greet(role: Role, path: string, name?: string): Reply {
  const page = PAGES.find(p => p.re.test(path) && (!p.roles || p.roles.includes(role)))
  const hello = name ? t('Hello {name}, I am Athena.', { name }) : t('Hello, I am Athena.')
  return { text: `${hello} ${page ? page.say() : t('Ask me how anything on Nashr works, or where to find it.')}`, chips: [...(page?.chips() ?? []), ...DEFAULT_CHIPS[role]()].slice(0, 4) }
}

/** The Directory address for a campaign sentence: the filters Athena read, best fit first. */
export function directoryHref(text: string, today: string) {
  const r = readRequest(text, today), p = new URLSearchParams({ view: 'products', sort: 'fit', ask: text })
  if (r.channels.length) p.set('channel', r.channels.join(','))
  if (r.sectors.length) p.set('sectors', r.sectors.join(','))
  if (r.dateFrom) p.set('df', r.dateFrom); if (r.dateTo) p.set('dt', r.dateTo)
  if (r.amount) p.set('max', String(r.amount / 100))
  return `/directory?${p}`
}

/** "10–20 Dec", "28 Nov – 3 Dec" */
function span(from: string, to: string) {
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString((typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB'), { ...o, timeZone: 'UTC' })
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${f(to, { day: 'numeric', month: 'short' })}` : `${f(from, { day: 'numeric', month: 'short' })} – ${f(to, { day: 'numeric', month: 'short' })}`
}

/** Athena's answer to one message. */
export function answer(text: string, role: Role, path: string, rules: Rules | null, today: string): Reply {
  const n = norm(text), words = tokens(text)
  if (!n) return greet(role, path)
  if (/^(hi|hello|hey|salam|مرحبا|السلام عليكم|اهلا|hala|هلا)\b/.test(n) && words.length <= 3) return greet(role, path)
  if (/^(thanks|thank you|thx|شكرا|شكرًا|merci)\b/.test(n)) return { text: t('You are welcome. I am here whenever you need me.') }
  if (/\b(what can you do|who are you|help me|what do you do)\b|من انت|ماذا تستطيع/.test(n))
    return { text: t('I know how Nashr works and where everything is. Ask me how to do something, ask me to take you to a page, or describe a campaign in a sentence and I will find the best fits.'), chips: DEFAULT_CHIPS[role]() }
  if (/\b(this page|here|what is this|what can i do here)\b|هذه الصفحة|هنا/.test(n)) return greet(role, path)

  // a campaign in a sentence: search the Directory with what Athena read
  if (role === 'buyer') {
    const r = readRequest(text, today)
    if (r.request && r.signals >= 2) {
      const bits = [r.channels.map(c => t(CHANNEL_NAME[c] ?? c)).join(t(' or ')), r.sectors.map(s => t(s)).join(', '),
        r.audiences.map(a => t(audienceLabel(a)).toLowerCase()).join(', '), r.dateFrom && r.dateTo ? span(r.dateFrom, r.dateTo) : '',
        r.amount ? t('up to AED {n}', { n: (r.amount / 100).toLocaleString('en-US') }) : ''].filter(Boolean)
      return { text: t('I read: {what}. I can show the products that fit best, first.', { what: bits.join(' · ') }) + (r.missing.includes('dates') ? ' ' + t('Tell me the dates too, and I will only show what is on sale then.') : ''),
        links: [{ label: t('Show the best fits'), href: directoryHref(text, today) }] }
    }
  }

  // "take me to / where is / open" a place
  const goWords = /\b(go to|take me|open|show me|where is|where are|find the|navigate)\b|خذني|افتح|وين|اين/.test(n)
  const place = PLACES.filter(p => p.roles.includes(role)).map(p => ({ p, s: Math.max(0, ...p.words.map(k => hit(words, n, k))) })).sort((a, b) => b.s - a.s)[0]

  // the best "how do I" answer
  const scored = TOPICS.filter(x => x.roles.includes(role)).map(x => ({ x, s: x.words.reduce((sum, k) => sum + hit(words, n, k), 0) })).sort((a, b) => b.s - a.s)
  const best = scored[0]
  if (goWords && place && place.s >= 1.6 && (!best || best.s < place.s + 2.5)) return { text: t('Here is {page}.', { page: place.p.label() }), links: [{ label: t('Open {page}', { page: place.p.label() }), href: place.p.href }] }
  if (best && best.s >= 1.6) {
    const close = scored.slice(1, 3).filter(o => o.s >= 1.6 && o.s >= best.s * .8)
    return { text: best.x.answer(rules), links: best.x.go ? [best.x.go()] : undefined,
      chips: close.length ? close.map(o => QUESTION[o.x.id]?.() ?? '').filter(Boolean) : best.x.chips?.() }
  }
  if (place && place.s >= 1.6) return { text: t('Here is {page}.', { page: place.p.label() }), links: [{ label: t('Open {page}', { page: place.p.label() }), href: place.p.href }] }
  return { text: t('I am not sure I understood. Try asking it another way, or ask Nashr\'s team: they answer within one working day.'),
    links: role === 'admin' ? undefined : [{ label: t('Contact Nashr'), href: '/help' }], chips: DEFAULT_CHIPS[role]() }
}

/** The question a topic answers, offered as a chip when two topics are close ("Did you mean…"). */
const QUESTION: Record<string, () => string> = {
  book: () => t('How do I book a slot?'), autobid: () => t('What is auto-bid?'), pay: () => t('When do I pay?'), escrow: () => t('Where does my money go?'),
  issue: () => t('What if the ad did not run?'), cancel: () => t('Can I cancel?'), receipts: () => t('Where are my receipts?'), campaign: () => t('How do campaigns work?'),
  mybids: () => t('Where are my bids?'), bid: () => t('How does bidding work?'), proof: () => t('How do I approve proof?'), brief: () => t('Where do I add the creative?'),
  requests: () => t('How do bookings reach me?'), paid: () => t('When am I paid?'), proofdue: () => t('When is proof due?'), product: () => t('How do I add a product?'),
  price: () => t('How should I price it?'), invoices: () => t('Who issues the tax invoices?'), team: () => t('How do I add a colleague?'), password: () => t('I forgot my password'),
}
