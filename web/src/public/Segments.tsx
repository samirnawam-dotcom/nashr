import { useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../format'
import { addDays, todayInDubai } from '../calendar/layout'
import { ChannelMark } from '../calendar/CalendarPage'
import { AUDIENCES } from '../../../server/shared/audiences'
import { outletSlug, useMeta } from '../seo'
import { t } from '../i18n'

/*
 * Pages that start from who the buyer wants to reach (an audience) or what they sell (an industry), as ad networks like Dianomi sell:
 * every outlet with open slots for it, the starting price and a way into the calendar already filtered. Public, so search engines and
 * the sales team can send people straight here.
 */
export const INDUSTRY_PAGES = [
  ['banking', 'Banking', 'Banking and finance', 'Reach the people choosing a bank, a card or a business account.'],
  ['real-estate', 'Real estate', 'Real estate', 'Reach buyers, tenants and investors following the UAE property market.'],
  ['retail', 'Retail', 'Retail', 'Reach shoppers before the weekend, the sale and the season.'],
  ['automotive', 'Automotive', 'Automotive', 'Reach drivers on their commute and families choosing their next car.'],
  ['technology', 'Technology', 'Technology', 'Reach early adopters and the teams buying software and devices.'],
  ['hospitality', 'Hospitality', 'Hospitality and travel', 'Reach residents and visitors planning where to stay, eat and go.'],
  ['health', 'Health', 'Health', 'Reach families and professionals making health decisions.'],
  ['education', 'Education', 'Education', 'Reach parents, students and professionals choosing what to learn next.'],
] as const

type Row = { outletId: string; outlet: string; channel: string; logoUrl: string | null; slots: number; fromPrice: number }

function SegmentBody({ filter, calendarHref }: { filter: string; calendarHref: string }) {
  const [rows, setRows] = useState<Row[] | null>(null), [total, setTotal] = useState(0)
  useEffect(() => {
    const from = todayInDubai(), to = addDays(from, 56)
    api<{ total: number; items: Row[] }>(`/slots/outlets?from=${from}T00:00:00%2B04:00&to=${to}T00:00:00%2B04:00&open=1&sort=slots&limit=24&${filter}`)
      .then(r => { setRows(r.items); setTotal(r.items.reduce((n, i) => n + i.slots, 0)) }, () => setRows([]))
  }, [filter])
  if (!rows) return <p className="muted">{t('Loading…')}</p>
  if (!rows.length) return <div className="card pad empty"><p><b>{t('Nothing open for this yet.')}</b></p>
    <p className="muted">{t('Publishers add new dates every day. Save a search on the calendar and Nashr tells you when something matches.')}</p>
    <a className="btn primary" href={calendarHref}>{t('Open the calendar')}</a></div>
  return <>
    <p className="seg-sum">{t('{n} slots open in the next 8 weeks across {m} outlets.', { n: total, m: rows.length })}</p>
    <ul className="seg-grid">{rows.map(r => <li key={r.outletId} className="card">
      <a href={`/directory/${outletSlug({ id: r.outletId, name: r.outlet })}`} className="seg-card">
        <span className="seg-logo">{r.logoUrl ? <img src={r.logoUrl} alt="" width={40} height={40} loading="lazy" /> : <span aria-hidden>{r.outlet.slice(0, 2).toUpperCase()}</span>}</span>
        <span className="seg-body"><b>{r.outlet}</b><ChannelMark c={r.channel} label /></span>
        <span className="seg-meta"><span className="num">{t('from {price}', { price: money(r.fromPrice) })}</span><span className="small muted">{r.slots === 1 ? t('1 slot open') : t('{n} slots open', { n: r.slots })}</span></span>
      </a></li>)}</ul>
    <div className="row-flex section"><a className="btn primary" href={calendarHref}>{t('See every open slot on the calendar')}</a><a className="btn" href="/request-access">{t('Request access to book')}</a></div>
  </>
}

function SegmentShell({ eyebrow, title, intro, children, others }: { eyebrow: string; title: string; intro: string; children: React.ReactNode; others: React.ReactNode }) {
  return <main className="seg-page">
    <p className="small"><a href="/">{t('Home')}</a> › {eyebrow}</p>
    <h1>{title}</h1><p className="lead seg-intro">{intro}</p>
    {children}
    <section className="section seg-others"><h2 className="sec-h">{eyebrow === t('Audiences') ? t('Other audiences') : t('Other industries')}</h2>{others}</section>
  </main>
}

export function AudiencesPage() {
  useMeta({ title: t('Audiences you can reach in the UAE | Nashr'), description: t('Pick who you want to reach and see every radio, TV, print, digital and podcast slot that reaches them.') })
  return <main className="seg-page">
    <h1>{t('Who do you want to reach?')}</h1>
    <p className="lead seg-intro">{t('Pick an audience and see every slot that reaches it, across radio, TV, print, digital and podcasts, from every publisher on Nashr.')}</p>
    <ul className="aud-grid">{AUDIENCES.map(([k, label, blurb]) => <li key={k}><a href={`/audiences/${k}`} className="card aud-card"><b>{t(label)}</b><span>{t(blurb)}</span></a></li>)}</ul>
  </main>
}

export function AudiencePage({ id }: { id: string }) {
  const a = AUDIENCES.find(x => x[0] === id)
  useMeta(a ? { title: t('Advertise to {who} in the UAE | Nashr', { who: t(a[1]) }), description: t(a[2]) } : null, [id])
  if (!a) return <main><p>{t('Not found')}</p><a href="/audiences">{t('All audiences')}</a></main>
  return <SegmentShell eyebrow={t('Audiences')} title={t('Reach {who}', { who: t(a[1]) })} intro={t(a[2])}
    others={<div className="aud-pick">{AUDIENCES.filter(x => x[0] !== id).map(([k, l]) => <a key={k} className="aud-chip" href={`/audiences/${k}`}>{t(l)}</a>)}</div>}>
    <SegmentBody filter={`aud=${id}`} calendarHref={`/calendar?view=list&aud=${id}`} />
  </SegmentShell>
}

export function IndustryPage({ id }: { id: string }) {
  const p = INDUSTRY_PAGES.find(x => x[0] === id)
  useMeta(p ? { title: t('{industry} advertising in the UAE | Nashr', { industry: t(p[2]) }), description: t(p[3]) } : null, [id])
  if (!p) return <main><p>{t('Not found')}</p><a href="/">{t('Home')}</a></main>
  return <SegmentShell eyebrow={t('Industries')} title={t('{industry} advertising in the UAE', { industry: t(p[2]) })} intro={t(p[3])}
    others={<div className="aud-pick">{INDUSTRY_PAGES.filter(x => x[0] !== id).map(([k, , l]) => <a key={k} className="aud-chip" href={`/advertise/${k}`}>{t(l)}</a>)}</div>}>
    <SegmentBody filter={`sector=${encodeURIComponent(p[1])}`} calendarHref={`/calendar?view=list&sector=${encodeURIComponent(p[1])}`} />
  </SegmentShell>
}
