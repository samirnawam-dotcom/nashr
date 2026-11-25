import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { navigate } from '../nav'
import { money } from '../format'
import { isAr, t } from '../i18n'
import { tm } from '../i18n-server'
import { todayInDubai } from '../calendar/layout'
import { toDo } from '../messages/ToDo'
import { CHANNEL_NAME } from '../media'
import { audienceLabel } from '../../../server/shared/audiences'
import type { Rules } from '../Help'
import { answer, greet, queryReply, type Link, type Query, type Reply, type Role } from './guide'
import { Owl } from './Owl'

/*
 * Athena on every signed-in page (rules and Nashr's own records only). An owl button, the Athena menu item or ⌘K's "ask" open a
 * panel on the reading end of the page; on wide screens the page makes room for it instead of being covered.
 *  Ask: answers how Nashr works and takes people where they need to go. A campaign comes back as facts (chips) the person can
 *  remove, with fact rows from the market, the source, follow-ups that change it ("add TV", "make it cheaper") and the
 *  buttons to search or plan it. "Ask Athena about this" on a product answers with that product's prices and timing.
 *  Words appear as Athena writes them; 👍/👎 and the questions it could not answer go to Nashr's team.
 *  For you: what Athena noticed, grouped by urgency, each with a time, Dismiss and Remind me later.
 * Anything can open it: openAthena({ tab, ask, about }).
 */
type About = { placementId: string; title: string }
type Insight = { title: string; channel: string; saleType: string; slug: string; onSale: number; next: { at: string; closes: string; price: number } | null
  sold: { n: number; low: number; high: number; median: number } | null; media: { n: number; low: number; high: number } | null; days: number
  forecast: { expected: number; ratio: number; late: number } | null; season: { name: string; nameAr: string } | null }
type Msg = { id: string; from: 'you' | 'athena'; text: string; links?: Link[]; chips?: string[]; query?: Query; insight?: Insight; unknown?: boolean
  q?: string; rated?: boolean; typed?: boolean }
type Noticed = { key: string; kind: string; text: string; action?: string; href: string; at: string | null; post?: { path: string; body: unknown; done: string } }
type ServerItem = { key: string; kind: string; data: any; href: string; at: string | null }

import { openAthena } from './open'
export { openAthena }

const store = { get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* private mode */ } } }
const local = { get: <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }, set: (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } } }
const uid = () => Math.random().toString(36).slice(2, 10)
const dateFmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString(isAr ? 'ar-AE-u-nu-latn' : 'en-GB', { ...o, timeZone: 'Asia/Dubai' })

/** "in 5 hours", "tomorrow", "on 3 Dec" */
function when(iso: string | null) {
  if (!iso) return ''
  const h = (Date.parse(iso) - Date.now()) / 3_600_000
  if (h < 1) return t('within the hour')
  if (h < 24) return t('in {n} hours', { n: Math.round(h) })
  if (h < 48) return t('tomorrow')
  return t('on {date}', { date: dateFmt(iso, { day: 'numeric', month: 'short' }) })
}
/** short time label for a For you item: "in 16 h", "28 Nov" */
const short = (iso: string | null) => { if (!iso) return ''; const h = (Date.parse(iso) - Date.now()) / 3_600_000
  return h > 0 && h < 24 ? t('in {n} h', { n: Math.max(1, Math.round(h)) }) : dateFmt(iso, { day: 'numeric', month: 'short' }) }
/** "30 Nov – 3 Dec" */
const range = (a: string, b: string) => { const f = (x: string, o: Intl.DateTimeFormatOptions) => new Date(`${x}T12:00:00Z`).toLocaleDateString(isAr ? 'ar-AE-u-nu-latn' : 'en-GB', { ...o, timeZone: 'UTC' })
  return a === b ? f(a, { day: 'numeric', month: 'short' }) : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}–${f(b, { day: 'numeric', month: 'short' })}` : `${f(a, { day: 'numeric', month: 'short' })} – ${f(b, { day: 'numeric', month: 'short' })}` }
const media = (c: string) => t(CHANNEL_NAME[c] ?? c)

// For you: how pressing each kind is
const URGENT = new Set(['pay', 'creative', 'proof', 'outbid', 'requests', 'unsold', 'disputes', 'guard_linked', 'guard_shill', 'guard_price', 'guard_proof', 'guard_new'])
const CHANCE = new Set(['swap', 'price_high', 'sale_type', 'at_risk', 'access', 'registrations'])
const groupOf = (kind: string) => URGENT.has(kind) ? 'now' : CHANCE.has(kind) ? 'chance' : 'know'

/** Athena's words for one thing it noticed. */
function word(i: ServerItem): Noticed {
  const d = i.data, what = d.placement && d.outlet ? `${d.outlet} · ${d.placement}` : d.outlet ?? ''
  const say: Record<string, () => [string, string?]> = {
    outbid: () => [t('You were outbid on {what} ({label}). Bidding closes {when}.', { what, label: d.label, when: when(d.closes) }), t('Bid again')],
    requests: () => [t(d.n === 1 ? '1 booking request is waiting for your answer.' : '{n} booking requests are waiting for your answer.', { n: d.n }), t('Open Inbox')],
    unsold: () => [t(d.n === 1 ? '1 date of {what} closes {when} with no bids yet. A lower starting price or a fixed price may help.' : '{n} dates of {what} start closing {when} with no bids yet. A lower starting price or a fixed price may help.', { n: d.n, what, when: when(d.closes) }), t('Open Calendar')],
    price_high: () => [t('{what} asks {price}. Similar {media} products sold for {low}–{high} lately, and it has had no bids for 3 weeks.', { what, price: money(d.price), media: media(d.channel).toLowerCase(), low: money(d.low), high: money(d.high) }), t('Review the price')],
    access: () => [t(d.n === 1 ? '1 company is waiting for access.' : '{n} companies are waiting for access.', { n: d.n }), t('Open Access')],
    registrations: () => [t(d.n === 1 ? '1 new registration in the last day.' : '{n} new registrations in the last day.', { n: d.n }), t('Open Registrations')],
    disputes: () => [t(d.n === 1 ? '1 dispute is open.' : '{n} disputes are open.', { n: d.n }), t('Open Disputes')],
    emails_failed: () => [t(d.n === 1 ? '1 email failed to send this week.' : '{n} emails failed to send this week.', { n: d.n }), t('Open Emails')],
    questions: () => [t('{n} questions Athena could not answer or that got a thumbs down this week, for example: {samples}.', { n: d.n, samples: d.samples.map((x: string) => `“${x}”`).join(', ') })],
    season: () => [d.from <= new Date().toISOString().slice(0, 10) ? t('{season} is on now, until {to}. You have {n} dates on sale in it: check their prices while demand is high.', { n: d.n, season: isAr ? d.season.nameAr : t(d.season.name), to: range(d.to, d.to) })
      : (d.uplift && d.uplift > 2 ? t('{season} is coming ({dates}). Auctions in it have ended about {pct}% higher than usual. You have {n} dates on sale then: review their prices.', { pct: d.uplift, n: d.n, season: isAr ? d.season.nameAr : t(d.season.name), dates: range(d.from, d.to) })
      : t('{season} is coming ({dates}). Demand usually rises then. You have {n} dates on sale in it: review their prices.', { n: d.n, season: isAr ? d.season.nameAr : t(d.season.name), dates: range(d.from, d.to) })), t('Open Calendar')],
    sale_type: () => [d.to === 'fixed' ? t('{what} sold {sold} of {closed} dates by auction, with {bidders} bidders on average. A fixed price may sell more of them.', { what, sold: d.sold, closed: d.closed, bidders: d.bidders })
      : t('{what} sold {sold} of {closed} dates at a fixed price. Demand is strong: an auction, or a higher price, could earn more.', { what, sold: d.sold, closed: d.closed }), t('Open Products')],
    at_risk: () => [t('{n} dates of {what} have no bids yet and close {when}. Similar dates that sold had their first bid about {days} days before closing: lower the starting price or switch them to a fixed price.', { n: d.n, what, when: when(d.closes), days: d.days }), t('Open Calendar')],
    guard_linked: () => [t('Worth a look: {a} and {b} sign in from the same address and both bid on {outlet}.', { a: d.a, b: d.b, outlet: d.outlet }), t('Open the account')],
    guard_shill: () => [t('Worth a look: {buyer} bids on {seller}, and both sign in from the same address.', { buyer: d.buyer, seller: d.seller }), t('Open the account')],
    guard_price: () => [t('Worth a look: {what} asks {price}, against a middle sale of {median} for its media type. A typo?', { what, price: money(d.price), median: money(d.median) }), t('Open the account')],
    guard_proof: () => [t('Worth a look: proof for {ref} was sent before the ad was due to run.', { ref: d.ref }), t('Open the deal')],
    guard_new: () => [t('Worth a look: {name} joined this week and has bid {amount} ({n} bids in one day at most).', { name: d.name, amount: money(d.total), n: d.perDay }), t('Open the account')],
    swap: () => [t('In "{campaign}", {what} is no longer available in your dates. Closest replacement: {alt}, {price}, {when}.', { campaign: d.campaign, what,
      alt: `${d.to.outlet} · ${d.to.placement}`, price: money(d.to.price), when: when(d.to.at) }), t('Swap it in')],
    lost: () => [t('In "{campaign}", {what} is no longer available in your dates, and nothing similar is on sale in your budget. Look at other dates or media types.', { campaign: d.campaign, what }), t('Open the campaign')],
  }
  const [text, action] = say[i.kind]?.() ?? [i.kind]
  const post = i.kind === 'swap' ? { path: '/athena/swap', done: t('Swapped. The new date is in your campaign plan.'),
    body: { campaignId: d.campaignId, fromPlacement: d.from.placementId, fromSlot: d.from.slotId, toPlacement: d.to.placementId, toSlot: d.to.slotId } } : undefined
  return { key: i.key, kind: i.kind, text, action, href: i.href, at: i.at, post }
}

/** Words that appear as Athena writes them (once per answer); Stop shows the rest at once. */
function Writing({ text, onDone }: { text: string; onDone: () => void }) {
  const words = text.split(/(\s+)/), [n, setN] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(words.length); onDone(); return }
    const step = Math.max(8, Math.min(28, 1400 / words.length))
    const x = setInterval(() => setN(k => { if (k + 2 >= words.length) { clearInterval(x); setTimeout(onDone, 0); return words.length } return k + 2 }), step)
    return () => clearInterval(x)
  }, [])
  return <p dir="auto">{words.slice(0, n).join('')}{n < words.length && <><span className="ath-caret" aria-hidden />
    <button type="button" className="ath-stop" onClick={() => { setN(words.length); onDone() }}>{t('Stop')}</button></>}</p>
}

/** The market under a campaign Athena read: what is on sale, how auctions usually end, the season, the source. */
function Facts({ q }: { q: Query }) {
  const [f, setF] = useState<{ products: number; dates: number; n: number; low: number | null; high: number | null; days: number; seasons: { name: string; nameAr: string }[] } | null>(null)
  useEffect(() => { const p = new URLSearchParams(); if (q.channels.length) p.set('channel', q.channels.join(',')); if (q.sectors.length) p.set('sectors', q.sectors.join(','))
    if (q.dateFrom) p.set('df', q.dateFrom); if (q.dateTo) p.set('dt', q.dateTo); if (q.amount) p.set('max', String(q.amount / 100))
    api<any>(`/athena/summary?${p}`).then(setF, () => setF(null)) }, [JSON.stringify(q)])
  if (!f) return null
  return <><dl className="ath-facts">
    <div><dt>{q.dateFrom ? t('On sale in your dates') : t('On sale now')}</dt><dd>{t('{n} products, {d} dates', { n: f.products, d: f.dates })}</dd></div>
    {f.low != null && <div><dt>{t('Usual auction finish')}</dt><dd>{money(f.low)}–{money(f.high!)}</dd></div>}
    {f.seasons.length > 0 && <div><dt>{t('Season')}</dt><dd>{f.seasons.map(s => isAr ? s.nameAr : t(s.name)).join(', ')}</dd></div>}
  </dl>{f.n > 0 && <p className="ath-src">{t('Based on {n} sales in the last {days} days, on Nashr.', { n: f.n, days: f.days })}</p>}</>
}

/** Chips for a campaign Athena read; × takes one out. */
function Chips({ q, onChange, onAdd }: { q: Query; onChange: (q: Query) => void; onAdd: () => void }) {
  const items: [string, () => Query][] = [
    ...q.channels.map(c => [media(c), () => ({ ...q, channels: q.channels.filter(x => x !== c) })] as [string, () => Query]),
    ...q.sectors.map(s => [t(s), () => ({ ...q, sectors: q.sectors.filter(x => x !== s) })] as [string, () => Query]),
    ...q.audiences.map(a => [t(audienceLabel(a)), () => ({ ...q, audiences: q.audiences.filter(x => x !== a) })] as [string, () => Query]),
    ...q.dayparts.map(d => [d === 'morning' ? t('Morning shows') : d === 'evening' ? t('Evening shows') : t('Afternoon shows'), () => ({ ...q, dayparts: q.dayparts.filter(x => x !== d) })] as [string, () => Query]),
    ...(q.dateFrom && q.dateTo ? [[range(q.dateFrom, q.dateTo), () => ({ ...q, dateFrom: undefined, dateTo: undefined })] as [string, () => Query]] : []),
    ...(q.amount ? [[t('Up to {amount}', { amount: money(q.amount) }), () => ({ ...q, amount: undefined })] as [string, () => Query]] : []),
  ]
  return <div className="ath-qchips">{items.map(([label, without]) => <span key={label} className="ath-qchip">{label}
    <button type="button" aria-label={t('Remove {what}', { what: label })} onClick={() => onChange(without())}>×</button></span>)}
    <button type="button" className="ath-qchip add" onClick={onAdd}>+ {t('Add')}</button></div>
}

/** "Ask Athena about this": a product's prices and timing, as fact rows. */
function InsightView({ x }: { x: Insight }) {
  return <dl className="ath-facts">
    <div><dt>{t('On sale')}</dt><dd>{x.onSale ? t('{n} dates · next {when}', { n: x.onSale, when: x.next ? dateFmt(x.next.at, { day: 'numeric', month: 'short' }) : '' }) : t('Nothing on sale now')}</dd></div>
    {x.next && <div><dt>{x.saleType === 'auction' ? t('Next bid from') : t('Price')}</dt><dd>{money(x.next.price)}</dd></div>}
    {x.sold && <div><dt>{t('Sold for (last {days} days)', { days: x.days })}</dt><dd>{money(x.sold.low)}–{money(x.sold.high)}</dd></div>}
    {!x.sold && x.media && <div><dt>{t('Similar {media} sold for', { media: media(x.channel).toLowerCase() })}</dt><dd>{money(x.media.low)}–{money(x.media.high)}</dd></div>}
    {x.forecast && <div><dt>{t('Usual auction finish')}</dt><dd>{money(Math.max(x.forecast.expected, x.sold?.median ?? 0))}</dd></div>}
    {x.season && <div><dt>{t('Season')}</dt><dd>{isAr ? x.season.nameAr : t(x.season.name)}</dd></div>}
  </dl>
}
/** Athena's one-line advice on a product, from its numbers. */
function insightText(x: Insight) {
  if (!x.onSale) return t('{title} has nothing on sale right now. Save the outlet and Nashr tells you when new dates are listed.', { title: x.title })
  const parts = [t('Here is {title} in numbers.', { title: x.title })]
  if (x.next && x.sold) parts.push(x.next.price < x.sold.low ? t('The next date starts below what it usually sells for: a good moment to bid.') : x.next.price > x.sold.high ? t('The next date already asks more than it usually sells for.') : t('Its price is within what it usually sells for.'))
  if (x.forecast?.late && x.forecast.late >= 0.4) parts.push(t('Most bids come in the last day: set an auto-bid maximum rather than waiting.'))
  if (x.season) parts.push(t('It runs during {season}, when demand usually rises: bid early.', { season: isAr ? x.season.nameAr : t(x.season.name) }))
  return parts.join(' ')
}

export function AthenaDock({ role, name, companyId }: { role: Role; name: string; companyId: string }) {
  const path = location.pathname
  const [open, setOpen] = useState(() => store.get('nashr:athena:open') === '1')
  const [tab, setTab] = useState<'ask' | 'noticed'>('ask')
  const chatKey = `nashr:athena:chat:${companyId}`, seenKey = `nashr:athena:seen:${companyId}`, hideKey = `nashr:athena:hide:${companyId}`
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return (JSON.parse(store.get(chatKey) ?? '[]') as Msg[]).map(m => ({ ...m, typed: true })) } catch { return [] } })
  const [text, setText] = useState(''), [thinking, setThinking] = useState(false)
  const [rules, setRules] = useState<Rules | null>(null), [noticed, setNoticed] = useState<Noticed[] | null>(null)
  const [seen, setSeen] = useState<string[]>(() => local.get(seenKey, [] as string[])), [hidden, setHidden] = useState<Record<string, number>>(() => local.get(hideKey, {}))
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null), fab = useRef<HTMLButtonElement>(null)

  useEffect(() => { store.set('nashr:athena:open', open ? '1' : '0') }, [open])
  useEffect(() => { store.set(chatKey, JSON.stringify(msgs.slice(-40))) }, [msgs])
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length, thinking, tab])
  // wide screens: the page makes room for the panel
  useEffect(() => { document.body.classList.toggle('ath-open', open); return () => document.body.classList.remove('ath-open') }, [open])

  // what Athena noticed: loaded now and every two minutes (the dot), and when the panel opens
  const loadNoticed = useCallback(async () => {
    const server = await api<{ items: ServerItem[] }>('/athena/noticed').then(r => r.items.map(word), () => [] as Noticed[])
    const deals = role === 'buyer' ? await api<any[]>('/deals').then(d => toDo(d).map(x => ({
      key: `${x.what}:${x.d.id}`, kind: x.what, href: `/bookings/${x.d.id}`, at: x.by,
      text: x.what === 'pay' ? t('Pay for {what} {when} to keep the booking.', { what: `${x.d.outlet} · ${x.d.label}`, when: when(x.by) })
        : x.what === 'creative' ? t('Send the creative for {what} {when}.', { what: `${x.d.outlet} · ${x.d.label}`, when: when(x.by) })
        : t('The proof for {what} is ready to approve.', { what: `${x.d.outlet} · ${x.d.label}` }),
      action: x.what === 'pay' ? t('Pay now') : x.what === 'creative' ? t('Send creative') : t('Review proof') }) as Noticed), () => []) : []
    setNoticed([...deals, ...server].sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity)))
  }, [role])
  useEffect(() => { loadNoticed(); const x = setInterval(loadNoticed, 120_000); return () => clearInterval(x) }, [loadNoticed])
  const shown = (noticed ?? []).filter(n => !(hidden[n.key] && (hidden[n.key] === -1 || hidden[n.key] > Date.now())))
  const unseen = shown.filter(n => !seen.includes(n.key)).length
  useEffect(() => { window.dispatchEvent(new CustomEvent('athena:unseen', { detail: unseen })) }, [unseen])
  const [fresh, setFresh] = useState<string[]>([])
  useEffect(() => { if (open && tab === 'noticed' && noticed) { setFresh(f => [...new Set([...f, ...shown.filter(n => !seen.includes(n.key)).map(n => n.key)])]); const all = [...new Set([...seen, ...noticed.map(n => n.key)])].slice(-300); setSeen(all); local.set(seenKey, all) } }, [open, tab, noticed])
  const hide = (key: string, until: number) => { const h = { ...hidden, [key]: until }; setHidden(h); local.set(hideKey, h) }

  useEffect(() => { if (open && !msgs.length) setMsgs([{ id: uid(), from: 'athena', ...greet(role, path, name.split(' ')[0]) }]) }, [open])
  useEffect(() => { if (open && !rules) api<Rules>('/help/rules').then(setRules, () => {}) }, [open])

  const lastQuery = () => [...msgs].reverse().find(m => m.from === 'athena' && m.query)?.query
  const say = (r: Reply & { insight?: Insight }, q: string) => {
    setMsgs(m => [...m, { id: uid(), from: 'athena', ...r, q }]); setThinking(false)
    if (r.unknown) api('/athena/feedback', { method: 'POST', body: { question: q, unknown: true } }).catch(() => {}) // for Nashr's team to teach Athena next
  }
  const ask = (raw: string) => {
    const said = raw.trim(); if (!said) return
    setMsgs(m => [...m, { id: uid(), from: 'you', text: said }]); setText(''); setThinking(true)
    setTimeout(() => say(answer(said, role, location.pathname, rules, todayInDubai(), lastQuery()), said), 350)
  }
  const askAbout = async (a: About) => {
    const q = t('Is {title} a good buy? When should I book?', { title: a.title })
    setMsgs(m => [...m, { id: uid(), from: 'you', text: q }]); setThinking(true)
    try { const x = await api<Insight>(`/athena/product/${a.placementId}`)
      say({ text: insightText(x), insight: x, links: [{ label: t('Open {page}', { page: x.title }), href: `/directory/${x.slug}` },
        { label: t('Similar for less'), href: `/directory?view=products&channel=${x.channel}&sort=price_asc${x.next ? `&max=${Math.round(x.next.price / 100)}` : ''}` }],
        chips: [t('When should I bid?'), t('What is auto-bid?')] }, q) }
    catch { say({ text: t('I could not look this product up just now. Try again in a moment.') }, q) }
  }
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; setOpen(true); setTab(d.tab ?? 'ask')
      if (d.about) setTimeout(() => askAbout(d.about), 50); else if (d.ask) setTimeout(() => ask(d.ask), 50); setTimeout(() => input.current?.focus(), 80) }
    window.addEventListener('athena:open', h); return () => window.removeEventListener('athena:open', h)
  }, [rules, msgs])
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.cmdk')) { setOpen(false); fab.current?.focus() } }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [open])
  useEffect(() => { if (open && tab === 'ask') setTimeout(() => input.current?.focus(), 60) }, [open, tab])

  const [busyKey, setBusyKey] = useState(''), [done, setDone] = useState<Record<string, string>>({})
  async function act(n: Noticed) {
    setBusyKey(n.key)
    try { await api(n.post!.path, { method: 'POST', body: n.post!.body }); setDone(d => ({ ...d, [n.key]: n.post!.done })); setTimeout(loadNoticed, 1500) }
    catch (e: any) { setDone(d => ({ ...d, [n.key]: tm(e.message) })) } finally { setBusyKey('') }
  }
  const rate = (m: Msg, helpful: boolean) => { setMsgs(all => all.map(x => x.id === m.id ? { ...x, rated: true } : x))
    api('/athena/feedback', { method: 'POST', body: { question: m.q ?? '', answer: m.text.slice(0, 1000), helpful } }).catch(() => {}) }
  const changeQuery = (m: Msg, q: Query) => setMsgs(all => all.map(x => x.id === m.id ? { ...x, ...queryReply(q), typed: true } : x))
  const go = (href: string) => { navigate(href); if (matchMedia('(max-width: 1199px)').matches) setOpen(false) }
  const restart = () => setMsgs([{ id: uid(), from: 'athena', ...greet(role, location.pathname, name.split(' ')[0]) }])
  const lastId = [...msgs].reverse().find(m => m.from === 'athena')?.id

  const groups: [string, string][] = [['now', t('Needs you now')], ['chance', t('Opportunities')], ['know', t('Worth knowing')]]
  return <>
    {!open && <button ref={fab} type="button" className="ath-fab" onClick={() => setOpen(true)} aria-label={unseen ? t('Ask Athena ({n} new)', { n: unseen }) : t('Ask Athena')}>
      <Owl size={24} />{unseen > 0 && <span className="ath-dot" aria-hidden />}<span className="ath-fab-l">{t('Ask Athena')}</span></button>}
    {open && <aside className="ath-dock" aria-label={t('Athena')}>
      <header className="ath-dock-h">
        <Owl size={22} busy={thinking} wake />
        <div className="ath-dock-t"><b>{t('Athena')}</b><span>{t("Knows Nashr's rules and records")}</span></div>
        <div className="ath-seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'ask'} className={tab === 'ask' ? 'on' : ''} onClick={() => setTab('ask')}>{t('Ask')}</button>
          <button type="button" role="tab" aria-selected={tab === 'noticed'} className={tab === 'noticed' ? 'on' : ''} onClick={() => { setTab('noticed'); loadNoticed() }}>
            {t('For you')}{shown.length > 0 && <span className={`ath-count ${unseen ? '' : 'seen'}`}>{shown.length}</span>}</button>
        </div>
        <button type="button" className="ath-x" onClick={() => { setOpen(false); setTimeout(() => fab.current?.focus(), 0) }} aria-label={t('Close Athena')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </header>

      {tab === 'ask' ? <>
        <div className="ath-log" ref={list} aria-live="polite">
          {msgs.map(m => m.from === 'you' ? <p key={m.id} className="ath-you" dir="auto">{m.text}</p>
            : <div key={m.id} className="ath-ans">
              <div className="ath-who"><Owl size={15} wake={m.id === lastId && !m.typed} />{t('Athena')}</div>
              {m.typed ? <p dir="auto">{m.text}</p> : <Writing text={m.text} onDone={() => setMsgs(all => all.map(x => x.id === m.id ? { ...x, typed: true } : x))} />}
              {m.typed && <>
                {m.query && <Chips q={m.query} onChange={q => changeQuery(m, q)} onAdd={() => { setText(t('Add ')); input.current?.focus() }} />}
                {m.query && m.query.fixes.length > 0 && <p className="ath-src">{t('Read {words}.', { words: m.query.fixes.slice(0, 5).map(f => t('“{from}” as “{to}”', { from: f.from, to: f.to })).join(', ') })}</p>}
                {m.query && <Facts q={m.query} />}
                {m.insight && <InsightView x={m.insight} />}
                {(m.links?.length || m.q) && <div className="ath-acts">
                  {m.links?.map((l, i) => <button key={l.href} type="button" className={`btn sm ${i === 0 ? 'primary' : ''}`} onClick={() => go(l.href)}>{l.label}</button>)}
                  {m.q && !m.unknown && <span className="ath-rate">{m.rated ? <span className="small muted">{t('Thanks')}</span> : <>
                    <button type="button" aria-label={t('Helpful')} onClick={() => rate(m, true)}>👍</button>
                    <button type="button" aria-label={t('Not helpful')} onClick={() => rate(m, false)}>👎</button></>}</span>}
                </div>}
                {m.id === lastId && m.chips && m.chips.length > 0 && <div className="ath-follow">{m.chips.map(c => <button key={c} type="button" onClick={() => ask(c)}>{c}</button>)}</div>}
              </>}
            </div>)}
          {thinking && <div className="ath-ans"><div className="ath-who"><Owl size={15} busy />{t('Athena')} · {t('writing')}</div><div className="ath-typing" aria-label={t('Athena is thinking')}><i /><i /><i /></div></div>}
        </div>
        <form className="ath-in" onSubmit={e => { e.preventDefault(); ask(text) }}>
          <div className="ath-box"><input ref={input} value={text} onChange={e => setText(e.target.value)} placeholder={t('Ask Athena…')} aria-label={t('Ask Athena')} dir="auto" maxLength={400} />
            <button className="ath-send" disabled={!text.trim() || thinking} aria-label={t('Send')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg></button></div>
        </form>
        <p className="ath-foot">{t("Athena uses Nashr's own rules and records. It never bids or pays for you.")} <button type="button" className="text-link" onClick={restart}>{t('Start again')}</button></p>
      </> : <div className="ath-log" ref={list}>
        {noticed === null ? <p className="muted"><Owl busy /> {t('Looking…')}</p>
          : !shown.length ? <div className="ath-empty"><Owl size={44} wake /><p>{t('Nothing needs you right now. I will put a dot on my owl when something does.')}</p></div>
          : groups.map(([g, label]) => { const items = shown.filter(n => groupOf(n.kind) === g); if (!items.length) return null
            return <section key={g} className="ath-group"><h3><span>{label}</span><span>{items.length}</span></h3>
              <ul className="ath-noticed">{items.map(n => <li key={n.key} className={fresh.includes(n.key) || !seen.includes(n.key) ? 'new' : ''}>
                <div className="ath-ni-h"><span className={`ath-pip ${g}`} aria-hidden />{n.at && <span className="ath-time">{short(n.at)}</span>}</div>
                <p dir="auto">{n.text}</p>
                <div className="ath-acts">
                  {n.action && (n.post ? <button type="button" className="btn sm primary" disabled={busyKey === n.key} onClick={() => act(n)}>{n.action}</button>
                    : <button type="button" className={`btn sm ${g === 'now' ? 'primary' : ''}`} onClick={() => go(n.href)}>{n.action}</button>)}
                  {n.post && <button type="button" className="btn sm" onClick={() => go(n.href)}>{t('Open the campaign')}</button>}
                  {g !== 'now' && <button type="button" className="ath-link" onClick={() => hide(n.key, -1)}>{t('Dismiss')}</button>}
                  <button type="button" className="ath-link" onClick={() => hide(n.key, Date.now() + 24 * 3_600_000)}>{t('Remind me later')}</button>
                </div>
                {done[n.key] && <p className="small ok" role="status">{done[n.key]}</p>}</li>)}</ul></section> })}
      </div>}
    </aside>}
  </>
}

/** "Athena" in the side menu: opens the panel, with the count of what is new. */
export function AthenaMenuItem() {
  const [n, setN] = useState(0)
  useEffect(() => { const h = (e: Event) => setN((e as CustomEvent).detail ?? 0); window.addEventListener('athena:unseen', h); return () => window.removeEventListener('athena:unseen', h) }, [])
  return <button type="button" className="side-ath" onClick={() => openAthena({ tab: n ? 'noticed' : 'ask' })} title={t('Athena')}>
    <Owl size={18} /><span className="side-l">{t('Athena')}</span>{n > 0 && <span className="ath-count" aria-label={t('{n} new', { n })}>{n}</span>}</button>
}
