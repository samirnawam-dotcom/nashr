import { useEffect, useState } from 'react'
import { api, type Slot } from '../api'
import { closesIn, dayLabel, money, time } from '../format'
import { addDays, dubai, todayInDubai } from '../calendar/layout'
import { ChannelMark, CHANNEL_NAME, CHANNELS } from '../calendar/CalendarPage'
import { AUDIENCES } from '../../../server/shared/audiences'
import { outletSlug, useMeta } from '../seo'
import { useGuest } from '../guest'
import { isAr, t } from '../i18n'
import { INDUSTRY_PAGES } from './industries'
import './segments.css'

/*
 * Pages that start from who the buyer wants to reach (an audience) or what they sell (an industry): what is open for it in the next
 * eight weeks, which publishers reach it, the next slots to book, and help to plan. Public, so search engines and the sales team can
 * send people straight here; signed-in buyers reach them from the menu.
 */
export { INDUSTRY_PAGES }

type Row = { outletId: string; outlet: string; channel: string; logoUrl: string | null; slots: number; fromPrice: number }
type Reach = { audience: string; slots: number; outlets: number; fromPrice: number; channels: string[] }
const WEEKS = 8
const range = () => { const from = todayInDubai(), to = addDays(from, WEEKS * 7); return `from=${from}T00:00:00%2B04:00&to=${to}T00:00:00%2B04:00&open=1` }

// The audiences in three families, so twelve choices read as three short lists.
const FAMILIES: [string, string, string[]][] = [
  [t('Business and affluent'), t('Decision makers, high earners and investors.'), ['executives', 'affluent_expats', 'luxury_shoppers', 'property_investors', 'young_professionals']],
  [t('Families and communities'), t('Households and the communities that make up the UAE.'), ['arabic_families', 'parents', 'south_asian_community', 'students']],
  [t('Habits and interests'), t('People defined by what they do every day.'), ['commuters', 'tech_adopters', 'sports_fans']],
]

const plural = (n: number, one: string, many: string) => n === 1 ? t(one) : t(many, { n: n.toLocaleString('en-US') })

/** How booking on Nashr works, in the order it happens. */
function HowItWorks() {
  return <ol className="seg-steps" aria-label={t('How booking works')}>
    <li><b>{t('Choose who to reach')}</b><span>{t('See the radio, TV, print, digital and podcast slots that reach them, with real prices.')}</span></li>
    <li><b>{t('Bid or book')}</b><span>{t('Bid in an auction, book at a fixed price, or ask for a quick sale. The publisher confirms.')}</span></li>
    <li><b>{t('Pay safely')}</b><span>{t('Your payment is held by Nashr and released to the publisher only after proof that your ad ran.')}</span></li>
  </ol>
}

/** Help to plan, for guests and for buyers: always a next step, never a dead end. */
function HelpPanel({ calendarHref }: { calendarHref: string }) {
  const guest = useGuest()
  return <aside className="card pad seg-help" aria-label={t('Help planning')}>
    <h2>{t('Planning a campaign?')}</h2>
    <ul>
      <li><b>{t('Get told about new slots.')}</b> {t('Open the calendar with this filter and save the search; Nashr sends an alert when something new matches.')} <a href={calendarHref}>{t('Open the calendar')}</a></li>
      {!guest && <li><b>{t('Plan against a budget.')}</b> {t('A campaign keeps your outlets, budget and bookings together, and makes a media plan PDF to share.')} <a href="/campaigns">{t('Campaigns')}</a></li>}
      <li><b>{t('Not sure where to start?')}</b> {t("Tell Nashr's team who you want to reach and your budget; we will suggest outlets and dates.")} <a href={guest ? '/help' : '/help#contact'}>{t('Ask Nashr')}</a></li>
    </ul>
    {guest && <div className="row-flex"><a className="btn primary" href="/request-access">{t('Request access to book')}</a><a className="btn" href="/sign-in">{t('Sign in')}</a></div>}
  </aside>
}

/** The numbers at the top of a page: what is open, from how many publishers, from what price, on which channels. */
function Stats({ slots, outlets, fromPrice, channels }: { slots: number; outlets: number; fromPrice: number | null; channels: string[] }) {
  return <dl className="seg-stats">
    <div><dt>{t('Open slots, next {n} weeks', { n: WEEKS })}</dt><dd className="num">{slots.toLocaleString('en-US')}</dd></div>
    <div><dt>{t('Publishers')}</dt><dd className="num">{outlets}</dd></div>
    <div><dt>{t('Starting from')}</dt><dd className="num">{fromPrice != null ? money(fromPrice) : '—'}</dd></div>
    <div><dt>{t('Channels')}</dt><dd className="seg-chs">{channels.length ? channels.map(c => <ChannelMark key={c} c={c} label />) : '—'}</dd></div>
  </dl>
}

function SegmentBody({ filter, calendarBase }: { filter: string; calendarBase: string }) {
  const [rows, setRows] = useState<Row[] | null>(null), [next, setNext] = useState<Slot[]>([]), [byChannel, setByChannel] = useState<Record<string, number>>({})
  useEffect(() => {
    setRows(null)
    api<{ items: Row[] }>(`/slots/outlets?${range()}&sort=slots&limit=24&${filter}`).then(r => setRows(r.items), () => setRows([]))
    api<{ items: Slot[] }>(`/slots/list?${range()}&sort=closing&limit=6&${filter}`).then(r => setNext(r.items), () => setNext([]))
    // open slots per channel, for the "where to reach them" row
    Promise.all(CHANNELS.map(c => api<{ items: Row[] }>(`/slots/outlets?${range()}&limit=200&ch=${c}&${filter}`)
      .then(r => [c, r.items.reduce((n, i) => n + i.slots, 0)] as const, () => [c, 0] as const)))
      .then(pairs => setByChannel(Object.fromEntries(pairs.filter(([, n]) => n > 0))))
  }, [filter])
  if (!rows) return <p className="muted">{t('Loading…')}</p>
  const total = rows.reduce((n, i) => n + i.slots, 0)
  const channels = Object.keys(byChannel)
  if (!rows.length) return <div className="card pad seg-empty">
    <h2>{t('Nothing open for this right now')}</h2>
    <p>{t('Publishers add new dates every day. Save this search on the calendar and Nashr tells you as soon as something matches, or ask our team to find you options.')}</p>
    <div className="row-flex"><a className="btn primary" href={calendarBase}>{t('Get alerts on the calendar')}</a><a className="btn" href="/help">{t('Ask Nashr')}</a></div>
  </div>
  return <>
    <Stats slots={total} outlets={rows.length} fromPrice={Math.min(...rows.map(r => r.fromPrice))} channels={channels} />

    {channels.length > 1 && <section className="section"><h2 className="sec-h">{t('Where to reach them')}</h2>
      <div className="seg-channels">{channels.map(c => <a key={c} className="card seg-channel" href={`${calendarBase}&ch=${c}`}>
        <ChannelMark c={c} label /><span className="num small">{plural(byChannel[c], '1 open slot', '{n} open slots')}</span></a>)}</div></section>}

    <section className="section"><h2 className="sec-h">{t('Publishers that reach them')}</h2>
      <ul className="seg-grid">{rows.map(r => <li key={r.outletId} className="card">
        <a href={`/directory/${outletSlug({ id: r.outletId, name: r.outlet })}`} className="seg-card">
          <span className="seg-logo">{r.logoUrl ? <img src={r.logoUrl} alt="" width={40} height={40} loading="lazy" /> : <span aria-hidden>{r.outlet.slice(0, 2).toUpperCase()}</span>}</span>
          <span className="seg-body"><b>{r.outlet}</b><ChannelMark c={r.channel} label /></span>
          <span className="seg-meta"><span className="num">{t('from {price}', { price: money(r.fromPrice) })}</span><span className="small muted">{plural(r.slots, '1 slot open', '{n} slots open')}</span></span>
        </a></li>)}</ul></section>

    {next.length > 0 && <section className="section"><h2 className="sec-h">{t('Book soon: closing first')}</h2>
      <div className="table-wrap card"><table className="table seg-next"><thead><tr><th>{t('Publisher')}</th><th>{t('Slot')}</th><th>{t('Airs')}</th><th>{t('Closes')}</th><th className="r">{t('Price now')}</th></tr></thead>
        <tbody>{next.map(s => <tr key={s.id}>
          <td><b>{s.outlet}</b> <ChannelMark c={s.channel} /></td>
          <td>{s.label && s.label !== s.placement ? `${s.placement} · ${s.label}` : s.placement}</td>
          <td className="num">{dayLabel(dubai(s.startsAt).date)} · {time(s.startsAt)}</td>
          <td className="small">{closesIn(s.closesAt) ?? dayLabel(dubai(s.closesAt).date)}</td>
          <td className="r num">{money(s.topBid ?? s.startingPrice)}</td></tr>)}</tbody></table></div>
      <div className="row-flex section"><a className="btn primary" href={calendarBase}>{t('See all {n} open slots on the calendar', { n: total.toLocaleString('en-US') })}</a></div></section>}
  </>
}

function SegmentShell({ crumb, crumbHref, title, intro, children, others, othersTitle, calendarHref }: { crumb: string; crumbHref: string; title: string; intro: string
  children: React.ReactNode; others: React.ReactNode; othersTitle: string; calendarHref: string }) {
  return <main className="seg-page">
    <p className="small seg-crumb"><a href="/">{t('Home')}</a> {isAr ? '‹' : '›'} <a href={crumbHref}>{crumb}</a></p>
    <header className="seg-head"><h1>{title}</h1><p className="lead seg-intro">{intro}</p></header>
    <div className="seg-layout"><div className="seg-main">{children}</div><HelpPanel calendarHref={calendarHref} /></div>
    <section className="section seg-others"><h2 className="sec-h">{othersTitle}</h2>{others}</section>
  </main>
}

export function AudiencesPage() {
  useMeta({ title: t('Audiences you can reach in the UAE | Nashr'), description: t('Pick who you want to reach and see every radio, TV, print, digital and podcast slot that reaches them.') })
  const [reach, setReach] = useState<Record<string, Reach> | null>(null), [ch, setCh] = useState('')
  useEffect(() => { api<Reach[]>(`/slots/audiences?${range()}`).then(r => setReach(Object.fromEntries(r.map(x => [x.audience, x]))), () => setReach({})) }, [])
  const label = (k: string) => AUDIENCES.find(a => a[0] === k)!
  return <main className="seg-page aud-index">
    <header className="aud-hero">
      <p className="aud-kicker">{t('Audiences')}</p>
      <h1>{t('Who do you want to reach?')}</h1>
      <p className="aud-lead">{t('Start from the people, not the media. Pick an audience to see every radio, TV, print, digital and podcast slot that reaches them, with real prices and dates.')}</p>
      <HowItWorks />
    </header>
    <div className="seg-filter" role="group" aria-label={t('Channel')}>
      <span className="small muted">{t('Show audiences reachable on')}</span>
      {['', ...CHANNELS].map(c => <button key={c} type="button" className={`aud-chip ${ch === c ? 'on' : ''}`} aria-pressed={ch === c} onClick={() => setCh(c)}>
        {c ? CHANNEL_NAME[c] : t('Any channel')}</button>)}
    </div>
    {FAMILIES.map(([name, sub, keys]) => {
      const shown = keys.filter(k => !ch || reach?.[k]?.channels.includes(ch))
      if (!shown.length) return null
      return <section key={name} className="section seg-family"><div className="seg-family-h"><h2>{name}</h2><p className="small muted">{sub}</p></div>
        <ul className="aud-grid">{shown.map(k => { const [, l, blurb] = label(k), r = reach?.[k]
          return <li key={k}><a href={`/audiences/${k}`} className="card aud-card">
            <span className="aud-top"><b>{t(l)}</b><i className="aud-go" aria-hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg></i></span>
            <span className="aud-blurb">{t(blurb)}</span>
            {!reach ? <span className="aud-live muted small">{t('Loading…')}</span>
              : r ? <span className="aud-live">
                  <span className="aud-count num"><b>{r.slots.toLocaleString('en-US')}</b><span>{t('open slots')} · {plural(r.outlets, '1 publisher', '{n} publishers')}</span></span>
                  <span className="aud-from"><span className="num">{t('from {price}', { price: money(r.fromPrice) })}</span><span className="seg-chs">{r.channels.map(c => <ChannelMark key={c} c={c} />)}</span></span></span>
              : <span className="aud-live muted small">{t('Nothing open right now. Get an alert when there is.')}</span>}
          </a></li> })}</ul></section>
    })}
    <aside className="card pad seg-help seg-help-wide">
      <h2>{t('Not sure who to reach?')}</h2>
      <p>{t("Tell Nashr's team what you sell, who buys it and your budget. We will suggest the audiences, outlets and dates that fit, at no cost.")}</p>
      <div className="row-flex"><a className="btn primary" href="/help">{t('Ask Nashr')}</a><a className="btn" href="/calendar">{t('Browse the calendar')}</a></div>
    </aside>
  </main>
}

export function AudiencePage({ id }: { id: string }) {
  const a = AUDIENCES.find(x => x[0] === id)
  useMeta(a ? { title: t('Advertise to {who} in the UAE | Nashr', { who: t(a[1]) }), description: t(a[2]) } : null, [id])
  if (!a) return <main><p>{t('Not found')}</p><a href="/audiences">{t('All audiences')}</a></main>
  const calendarHref = `/calendar?view=list&aud=${id}`
  return <SegmentShell crumb={t('Audiences')} crumbHref="/audiences" title={t(a[1])} intro={t(a[2])} calendarHref={calendarHref} othersTitle={t('Other audiences')}
    others={<div className="aud-pick">{AUDIENCES.filter(x => x[0] !== id).map(([k, l]) => <a key={k} className="aud-chip" href={`/audiences/${k}`}>{t(l)}</a>)}</div>}>
    <SegmentBody filter={`aud=${id}`} calendarBase={calendarHref} />
  </SegmentShell>
}

export function IndustryPage({ id }: { id: string }) {
  const p = INDUSTRY_PAGES.find(x => x[0] === id)
  useMeta(p ? { title: t('{industry} advertising in the UAE | Nashr', { industry: t(p[2]) }), description: t(p[3]) } : null, [id])
  if (!p) return <main><p>{t('Not found')}</p><a href="/">{t('Home')}</a></main>
  const calendarHref = `/calendar?view=list&sector=${encodeURIComponent(p[1])}`
  return <SegmentShell crumb={t('Industries')} crumbHref="/" title={t('{industry} advertising in the UAE', { industry: t(p[2]) })} intro={t(p[3])} calendarHref={calendarHref}
    othersTitle={t('Other industries')}
    others={<div className="aud-pick">{INDUSTRY_PAGES.filter(x => x[0] !== id).map(([k, , l]) => <a key={k} className="aud-chip" href={`/advertise/${k}`}>{t(l)}</a>)}</div>}>
    <SegmentBody filter={`sector=${encodeURIComponent(p[1])}`} calendarBase={calendarHref} />
  </SegmentShell>
}
