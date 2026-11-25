import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { navigate } from '../nav'
import { money } from '../format'
import { isAr, t } from '../i18n'
import { tm } from '../i18n-server'
import { todayInDubai } from '../calendar/layout'
import { toDo } from '../messages/ToDo'
import { CHANNEL_NAME } from '../media'
import type { Rules } from '../Help'
import { answer, greet, type Link, type Reply, type Role } from './guide'
import { AthenaTag, Owl } from './Owl'

/*
 * Athena on every signed-in page: an owl button at the bottom corner opens a panel on the right with two tabs.
 * Ask: a chat that explains how Nashr works, takes people where they need to go and turns a campaign sentence into a
 * Directory search (rules only, guide.ts). Noticed: what Athena spotted for this person (bids to answer, bookings to pay,
 * products priced above the market, dates closing unsold; for the team, the queues), with a dot while something is unseen.
 * Anything can open it: window.dispatchEvent(new CustomEvent('athena:open', { detail: { tab, ask } })).
 */
type Msg = { from: 'you' | 'athena'; text: string; links?: Link[]; chips?: string[] }
type Noticed = { key: string; text: string; action?: string; href: string; at: string | null; post?: { path: string; body: unknown; done: string } }
type ServerItem = { key: string; kind: string; data: any; href: string; at: string | null }

export const openAthena = (detail: { tab?: 'ask' | 'noticed'; ask?: string } = {}) => window.dispatchEvent(new CustomEvent('athena:open', { detail }))

const store = { get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* private mode */ } } }
const seenStore = { get: (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? '[]') } catch { return [] } }, set: (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v.slice(-200))) } catch { /* private mode */ } } }

/** "in 5 hours", "tomorrow", "on 3 Dec" */
function when(iso: string | null) {
  if (!iso) return ''
  const h = (Date.parse(iso) - Date.now()) / 3_600_000
  if (h < 1) return t('within the hour')
  if (h < 24) return t('in {n} hours', { n: Math.round(h) })
  if (h < 48) return t('tomorrow')
  return t('on {date}', { date: new Date(iso).toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' }) })
}

/** "30 Nov – 3 Dec" */
const range = (a: string, b: string) => { const f = (x: string) => new Date(`${x}T12:00:00Z`).toLocaleDateString(isAr ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); return `${f(a)} – ${f(b)}` }

/** Athena's words for one thing it noticed. */
function word(i: ServerItem): Noticed {
  const d = i.data, what = d.placement && d.outlet ? `${d.outlet} · ${d.placement}` : d.outlet ?? ''
  const say: Record<string, () => [string, string?]> = {
    outbid: () => [t('You were outbid on {what} ({label}). Bidding closes {when}.', { what, label: d.label, when: when(d.closes) }), t('Bid again')],
    requests: () => [t(d.n === 1 ? '1 booking request is waiting for your answer.' : '{n} booking requests are waiting for your answer.', { n: d.n }), t('Open Inbox')],
    unsold: () => [t(d.n === 1 ? '1 date of {what} closes {when} with no bids yet. A lower starting price or a fixed price may help.' : '{n} dates of {what} start closing {when} with no bids yet. A lower starting price or a fixed price may help.', { n: d.n, what, when: when(d.closes) }), t('Open Calendar')],
    price_high: () => [t('{what} asks {price}. Similar {media} products sold for {low}–{high} lately, and it has had no bids for 3 weeks.', { what, price: money(d.price), media: t(CHANNEL_NAME[d.channel] ?? d.channel).toLowerCase(), low: money(d.low), high: money(d.high) }), t('Review the price')],
    access: () => [t(d.n === 1 ? '1 company is waiting for access.' : '{n} companies are waiting for access.', { n: d.n }), t('Open Access')],
    registrations: () => [t(d.n === 1 ? '1 new registration in the last day.' : '{n} new registrations in the last day.', { n: d.n }), t('Open Registrations')],
    disputes: () => [t(d.n === 1 ? '1 dispute is open.' : '{n} disputes are open.', { n: d.n }), t('Open Disputes')],
    emails_failed: () => [t(d.n === 1 ? '1 email failed to send this week.' : '{n} emails failed to send this week.', { n: d.n }), t('Open Emails')],
    season: () => [d.from <= new Date().toISOString().slice(0, 10) ? t('{season} is on now, until {to}. You have {n} dates on sale in it: check their prices while demand is high.', { n: d.n, season: isAr ? d.season.nameAr : t(d.season.name), to: range(d.to, d.to).split(' – ')[0] })
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
  return { key: i.key, text, action, href: i.href, at: i.at, post }
}

export function AthenaDock({ role, name, companyId }: { role: Role; name: string; companyId: string }) {
  const path = location.pathname
  const [open, setOpen] = useState(() => store.get('nashr:athena:open') === '1')
  const [tab, setTab] = useState<'ask' | 'noticed'>('ask')
  const chatKey = `nashr:athena:chat:${companyId}`, seenKey = `nashr:athena:seen:${companyId}`
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(store.get(chatKey) ?? '[]') } catch { return [] } })
  const [text, setText] = useState(''), [thinking, setThinking] = useState(false)
  const [rules, setRules] = useState<Rules | null>(null), [noticed, setNoticed] = useState<Noticed[] | null>(null), [seen, setSeen] = useState<string[]>(() => seenStore.get(seenKey))
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null), fab = useRef<HTMLButtonElement>(null)

  useEffect(() => { store.set('nashr:athena:open', open ? '1' : '0') }, [open])
  useEffect(() => { store.set(chatKey, JSON.stringify(msgs.slice(-40))) }, [msgs])
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [msgs, thinking, tab])

  // what Athena noticed: loaded now and every two minutes (the dot), and when the panel opens
  const loadNoticed = useCallback(async () => {
    const server = await api<{ items: ServerItem[] }>('/athena/noticed').then(r => r.items.map(word), () => [] as Noticed[])
    const deals = role === 'buyer' ? await api<any[]>('/deals').then(d => toDo(d).map(x => ({
      key: `${x.what}:${x.d.id}`, href: `/bookings/${x.d.id}`, at: x.by,
      text: x.what === 'pay' ? t('Pay for {what} {when} to keep the booking.', { what: `${x.d.outlet} · ${x.d.label}`, when: when(x.by) })
        : x.what === 'creative' ? t('Send the creative for {what} {when}.', { what: `${x.d.outlet} · ${x.d.label}`, when: when(x.by) })
        : t('The proof for {what} is ready to approve.', { what: `${x.d.outlet} · ${x.d.label}` }),
      action: x.what === 'pay' ? t('Pay now') : x.what === 'creative' ? t('Send creative') : t('Review proof') }) as Noticed), () => []) : []
    const all = [...deals, ...server].sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity))
    setNoticed(all)
  }, [role])
  useEffect(() => { loadNoticed(); const x = setInterval(loadNoticed, 120_000); return () => clearInterval(x) }, [loadNoticed])
  const unseen = (noticed ?? []).filter(n => !seen.includes(n.key)).length
  useEffect(() => { window.dispatchEvent(new CustomEvent('athena:unseen', { detail: unseen })) }, [unseen])
  // what was new when the list was opened stays marked while it is on screen
  const [fresh, setFresh] = useState<string[]>([])
  useEffect(() => { if (open && tab === 'noticed' && noticed) { setFresh(f => [...new Set([...f, ...noticed.filter(n => !seen.includes(n.key)).map(n => n.key)])]); const all = [...new Set([...seen, ...noticed.map(n => n.key)])]; setSeen(all); seenStore.set(seenKey, all) } }, [open, tab, noticed])

  // first words: a greeting about this page
  useEffect(() => { if (open && !msgs.length) setMsgs([{ from: 'athena', ...greet(role, path, name.split(' ')[0]) }]) }, [open])
  useEffect(() => { if (open && !rules) api<Rules>('/help/rules').then(setRules, () => {}) }, [open])

  const ask = (q: string) => {
    const said = q.trim(); if (!said) return
    setMsgs(m => [...m, { from: 'you', text: said }]); setText(''); setThinking(true)
    // a short pause while the owl thinks: the answer is instant, the pause makes the turn readable
    setTimeout(() => { const r: Reply = answer(said, role, location.pathname, rules, todayInDubai()); setMsgs(m => [...m, { from: 'athena', ...r }]); setThinking(false) }, 550 + Math.min(600, said.length * 8))
  }
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; setOpen(true); setTab(d.tab ?? 'ask'); if (d.ask) setTimeout(() => ask(d.ask), 50); setTimeout(() => input.current?.focus(), 80) }
    window.addEventListener('athena:open', h); return () => window.removeEventListener('athena:open', h)
  }, [rules])
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); fab.current?.focus() } }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [open])
  useEffect(() => { if (open && tab === 'ask') setTimeout(() => input.current?.focus(), 60) }, [open, tab])

  // an action Athena can take for the person, on their tap (a swap): it runs, then the list refreshes
  const [busyKey, setBusyKey] = useState(''), [done, setDone] = useState<Record<string, string>>({})
  async function act(n: Noticed) {
    setBusyKey(n.key)
    try { await api(n.post!.path, { method: 'POST', body: n.post!.body }); setDone(d => ({ ...d, [n.key]: n.post!.done })); setTimeout(loadNoticed, 1500) }
    catch (e: any) { setDone(d => ({ ...d, [n.key]: tm(e.message) })) } finally { setBusyKey('') }
  }
  const go = (href: string) => { navigate(href); if (matchMedia('(max-width: 760px)').matches) setOpen(false) }
  const restart = () => { setMsgs([{ from: 'athena', ...greet(role, location.pathname, name.split(' ')[0]) }]) }

  return <>
    {!open && <button ref={fab} type="button" className="ath-fab" onClick={() => setOpen(true)} aria-label={unseen ? t('Ask Athena ({n} new)', { n: unseen }) : t('Ask Athena')}>
      <Owl size={26} />{unseen > 0 && <span className="ath-dot" aria-hidden />}<span className="ath-fab-l">{t('Ask Athena')}</span></button>}
    {open && <aside className="ath-dock" aria-label={t('Athena')}>
      <header className="ath-dock-h">
        <AthenaTag size={20} busy={thinking} />
        <div className="seg ath-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'ask'} className={tab === 'ask' ? 'on' : ''} onClick={() => setTab('ask')}>{t('Ask')}</button>
          <button type="button" role="tab" aria-selected={tab === 'noticed'} className={tab === 'noticed' ? 'on' : ''} onClick={() => { setTab('noticed'); loadNoticed() }}>
            {t('Noticed')}{unseen > 0 && <span className="ath-count">{unseen}</span>}</button>
        </div>
        <button type="button" className="ath-x" onClick={() => { setOpen(false); setTimeout(() => fab.current?.focus(), 0) }} aria-label={t('Close Athena')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </header>

      {tab === 'ask' ? <>
        <div className="ath-log" ref={list} aria-live="polite">
          {msgs.map((m, i) => m.from === 'you'
            ? <p key={i} className="ath-you" dir="auto">{m.text}</p>
            : <div key={i} className="ath-msg"><Owl size={18} wake={i === msgs.length - 1} />
              <div className={`ath-bubble ${i === msgs.length - 1 ? 'ath-say' : ''}`}>
                <p dir="auto">{m.text}</p>
                {m.links && <div className="ath-act">{m.links.map(l => <button key={l.href} type="button" className="btn sm primary" onClick={() => go(l.href)}>{l.label}</button>)}</div>}
                {m.chips && m.chips.length > 0 && i === msgs.length - 1 && <div className="ath-chips">{m.chips.map(c => <button key={c} type="button" className="ath-chip" onClick={() => ask(c)}>{c}</button>)}</div>}
              </div></div>)}
          {thinking && <div className="ath-msg"><Owl size={18} busy /><div className="ath-bubble ath-typing" aria-label={t('Athena is thinking')}><i /><i /><i /></div></div>}
        </div>
        <form className="ath-in" onSubmit={e => { e.preventDefault(); ask(text) }}>
          <input ref={input} className="search" value={text} onChange={e => setText(e.target.value)} placeholder={t('Ask Athena anything about Nashr')} aria-label={t('Ask Athena')} dir="auto" maxLength={400} />
          <button className="btn primary" disabled={!text.trim() || thinking} aria-label={t('Send')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
        </form>
        <p className="ath-foot small muted">{t('Athena uses Nashr\'s own rules and records. It never bids or pays for you.')} <button type="button" className="text-link" onClick={restart}>{t('Start again')}</button></p>
      </> : <div className="ath-log" ref={list}>
        {noticed === null ? <p className="muted"><Owl busy /> {t('Looking…')}</p>
          : !noticed.length ? <div className="ath-empty"><Owl size={44} wake /><p>{t('Nothing needs you right now. I will put a dot on my owl when something does.')}</p></div>
          : <ul className="ath-noticed">{noticed.map(n => <li key={n.key} className={fresh.includes(n.key) || !seen.includes(n.key) ? 'new' : ''}>
              <p dir="auto">{n.text}</p>
              {n.action && <div className="ath-act">
                {n.post ? <button type="button" className="btn sm primary" disabled={busyKey === n.key} onClick={() => act(n)}>{n.action}</button>
                  : <button type="button" className="btn sm" onClick={() => go(n.href)}>{n.action}</button>}
                {n.post && <button type="button" className="btn sm" onClick={() => go(n.href)}>{t('Open the campaign')}</button>}</div>}
              {done[n.key] && <p className="small ok" role="status">{done[n.key]}</p>}</li>)}</ul>}
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
