import { Fragment, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { addDays, todayInDubai } from '../calendar/layout'
import { money } from './common'
import { ltr, sep, t } from '../i18n'
import { tm } from '../i18n-server'
import { LANGUAGE } from '../calendar/BidDrawer'
import { ChannelMark, saleLabel } from '../calendar/CalendarPage'
import { art, CHANNELS, CHANNEL_NAME, ICON } from '../media'
import { audienceLabel } from '../../../server/shared/audiences'
import './portal.css'
import './products.css'

/*
 * The product catalogue as the owner drew it: every product a publisher sells, grouped by media type, each one opening to its
 * details, audience, sectors, requirements and timing. A product is described once; the calendar then puts it on sale by date.
 */
type Placement = { id: string; outlet: string; outletId: string; name: string; saleType: string; days: number[]; startsAt: string | null; endsAt: string | null
  breaks: { label: string; at?: string; seconds?: number }[]; startingPrice: number; anyBreakPrice: number | null; packagePrice: number | null
  buyNowPrice: number | null; reservePrice: number | null; autoAccept: boolean; creativeLeadHours: number; closeLeadHours: number
  archived: boolean; openSlots: number; listedUntil: string | null; audiences?: string[]
  description: string | null; specs: string | null; language: string | null; unit: 'day' | 'week'; listing: 'rolling' | 'manual'; horizonWeeks: number; separation: boolean }
type Outlet = { id: string; name: string; channel: string; sectors: string[]; audience: string | null; audiences: string[]; blockedIndustries: string[]
  blockedAdvertisers: string[]; reach: number | null; coverUrl: string | null }
type Profile = { company: { payoutsEnabled: boolean }; outlets: Outlet[]; placements: Placement[] }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TABS = ['details', 'audience', 'sectors', 'requirements', 'timing'] as const
const TAB_LABEL: Record<string, string> = { details: 'Details', audience: 'Audience', sectors: 'Sectors', requirements: 'Requirements', timing: 'Timing' }
const status = (p: Placement) => p.archived ? 'archived' : p.openSlots > 0 ? 'live' : 'idle'
const STATUS: Record<string, [string, string]> = { live: ['On sale', 'good'], idle: ['Nothing on sale', 'warn'], archived: ['Archived', 'mute'] }
const unitOf = (p: Placement, channel: string) => p.unit === 'week' ? t('week') : p.breaks.length ? t('break')
  : ['newspaper', 'magazine'].includes(channel) ? t('edition') : channel === 'newsletter' ? t('send') : channel === 'social' ? t('post') : t('day')
const hrs = (h: number) => h % 24 === 0 ? t('{n} days', { n: h / 24 }) : t('{n} hours', { n: h })

function Icon({ c }: { c: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d={ICON[c] ?? ICON.digital} /></svg>
}

/** One product opened: five short sections, one at a time on narrow screens, side by side on wide ones. */
function Detail({ p, o }: { p: Placement; o: Outlet }) {
  const [tab, setTab] = useState<typeof TABS[number]>('details')
  const auds = p.audiences?.length ? p.audiences : o.audiences
  const when = p.unit === 'week' ? t('A whole week from {day}', { day: t(DAYS[p.days[0] - 1]) }) : p.days.map(d => t(DAYS[d - 1])).join(sep)
  const sections: Record<string, React.ReactNode> = {
    details: <dl><dt>{t('Format')}</dt><dd>{p.description ? tm(p.description) : p.name}</dd>
      <dt>{t('Sold as')}</dt><dd>{saleLabel(p.saleType)}{p.breaks.length ? ` · ${t('{n} breaks', { n: p.breaks.length })}` : ''}</dd>
      <dt>{t('Language')}</dt><dd>{t(LANGUAGE[p.language ?? 'english'] ?? p.language ?? '')}</dd>
      {p.packagePrice != null && <><dt>{t('Package')}</dt><dd className="num">{money(p.packagePrice)}</dd></>}
      {p.buyNowPrice != null && <><dt>{t('Buy now')}</dt><dd className="num">{money(p.buyNowPrice)}</dd></>}</dl>,
    audience: <dl><dt>{t('Who it reaches')}</dt><dd>{o.audience || <span className="muted">{t('Not described yet')}</span>}</dd>
      <dt>{t('Audiences')}</dt><dd>{auds.length ? auds.map(a => t(audienceLabel(a))).join(sep) : <span className="muted">{t('None ticked')}</span>}</dd>
      <dt>{t('Reach')}</dt><dd className="num">{o.reach ? t('{n} per airing or edition', { n: o.reach.toLocaleString('en-US') }) : '—'}</dd></dl>,
    sectors: <ul className="pr-sectors">{o.sectors.length ? o.sectors.map(s => <li key={s} className="ok-s">{t(s)}</li>) : <li className="muted">{t('Every sector welcome')}</li>}
      {o.blockedIndustries.map(s => <li key={s} className="no-s">{t(s)}</li>)}{o.blockedAdvertisers.length > 0 && <li className="no-s">{t('Competitors refused: {names}', { names: o.blockedAdvertisers.join(sep) })}</li>}</ul>,
    requirements: <dl><dt>{t('Creative specs')}</dt><dd>{p.specs ? tm(p.specs) : '—'}</dd>
      <dt>{t('Creative deadline')}</dt><dd>{t('{time} before it runs', { time: hrs(p.creativeLeadHours) })}</dd>
      <dt>{t('Bidding closes')}</dt><dd>{t('{time} before it runs', { time: hrs(p.closeLeadHours) })}</dd></dl>,
    timing: <dl><dt>{t('Runs')}</dt><dd>{when}{p.startsAt ? ` · ${ltr(p.startsAt.slice(0, 5) + (p.endsAt ? `–${p.endsAt.slice(0, 5)}` : ''))}` : ''}</dd>
      {p.breaks.length > 0 && <><dt>{t('Breaks')}</dt><dd>{p.breaks.map(b => `${b.label}${b.at ? ` ${ltr(b.at.slice(0, 5))}` : ''}`).join(sep)}</dd></>}
      <dt>{t('Listing')}</dt><dd>{p.listing === 'rolling' ? t('Kept {n} weeks ahead', { n: p.horizonWeeks }) : t('Listed until {date}', { date: p.listedUntil ?? '—' })}</dd></dl>,
  }
  return <div className="pr-detail">
    <div className="seg pr-tabs" role="tablist">{TABS.map(k => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(TAB_LABEL[k])}</button>)}</div>
    <div className="pr-sections">{TABS.map(k => <section key={k} className={tab === k ? 'on' : ''}><h4>{t(TAB_LABEL[k])}</h4>{sections[k]}</section>)}</div>
  </div>
}

export function ProductsPage() {
  const [p, setP] = useState<Profile | null>(null), [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [type, setType] = useState(''), [q, setQ] = useState(''), [outlet, setOutlet] = useState(''), [st, setSt] = useState('active'), [sort, setSort] = useState('name')
  const [open, setOpen] = useState<string | null>(null), [closed, setClosed] = useState<Record<string, boolean>>({})
  const load = () => api<Profile>('/seller/profile').then(setP, e => setError(e.message))
  useEffect(() => { load() }, [])
  async function act(path: string, body: object, done: (r: any) => string) {
    setBusy(true); setError(''); setNote('')
    try { const r = await api(path, { method: 'POST', body }); setNote(done(r)); await load() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const outlets = useMemo(() => Object.fromEntries((p?.outlets ?? []).map(o => [o.id, o])), [p])
  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const all = p.placements.filter(x => outlets[x.outletId])
  const chOf = (x: Placement) => outlets[x.outletId].channel
  const counts = CHANNELS.map(c => [c, all.filter(x => chOf(x) === c && !x.archived).length] as const).filter(([, n]) => n > 0)
  const shown = all.filter(x => (!type || chOf(x) === type) && (!outlet || x.outletId === outlet)
      && (st === 'all' || (st === 'active' ? !x.archived : status(x) === st))
      && (!q.trim() || `${x.name} ${x.description ?? ''} ${x.outlet}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => sort === 'price' ? a.startingPrice - b.startingPrice : sort === 'open' ? b.openSlots - a.openSlots : a.name.localeCompare(b.name))
  const live = all.filter(x => status(x) === 'live')
  const value = all.filter(x => !x.archived).reduce((n, x) => n + x.openSlots * x.startingPrice, 0)
  const groups = CHANNELS.filter(c => shown.some(x => chOf(x) === c))
  return <main className="pr">
    <div className="pt-head"><div><h1>{t('All listings')}</h1><p className="muted">{t('Everything you sell, across every outlet and media type. Describe a placement once; the calendar puts it on sale by date.')}</p></div>
      <div className="pt-filters"><a className="btn" href="/listings/import">{t('Import rate card')}</a><a className="btn primary" href="/listings/new">+ {t('Add placement')}</a></div></div>
    {!p.company.payoutsEnabled && <p className="warn">{t('Slots go on sale once your payout account is verified.')} <a href="/profile">{t('Connect it')}</a></p>}

    <div className="pr-kpis">
      <div><b className="num">{all.filter(x => !x.archived).length}</b><span>{t('Listings')}</span></div>
      <div><b className="num">{live.length}</b><span>{t('On sale now')}</span></div>
      <div><b className="num">{all.reduce((n, x) => n + x.openSlots, 0).toLocaleString('en-US')}</b><span>{t('Open slots')}</span></div>
      <div><b className="num">{all.filter(x => x.archived).length}</b><span>{t('Archived')}</span></div>
      <div><b className="num">{money(value)}</b><span>{t('Open slots at starting price')}</span></div>
    </div>

    <div className="pr-types" role="tablist" aria-label={t('Media type')}>
      <button type="button" role="tab" aria-selected={!type} className={!type ? 'on' : ''} onClick={() => setType('')}>{t('All ({n})', { n: all.filter(x => !x.archived).length })}</button>
      {counts.map(([c, n]) => <button key={c} type="button" role="tab" aria-selected={type === c} className={type === c ? 'on' : ''} onClick={() => setType(c)}><Icon c={c} />{CHANNEL_NAME[c]} ({n})</button>)}
    </div>
    <div className="pr-tools">
      <input className="search" type="search" placeholder={t('Search listings…')} aria-label={t('Search listings')} value={q} onChange={e => setQ(e.target.value)} />
      {p.outlets.length > 1 && <select className="btn" aria-label={t('Outlet')} value={outlet} onChange={e => setOutlet(e.target.value)}><option value="">{t('All outlets')}</option>
        {p.outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
      <select className="btn" aria-label={t('Status')} value={st} onChange={e => setSt(e.target.value)}>
        <option value="active">{t('Not archived')}</option><option value="live">{t('On sale')}</option><option value="idle">{t('Nothing on sale')}</option><option value="archived">{t('Archived')}</option><option value="all">{t('All')}</option></select>
      <select className="btn" aria-label={t('Sort by')} value={sort} onChange={e => setSort(e.target.value)}>
        <option value="name">{t('Sort: name')}</option><option value="price">{t('Sort: price')}</option><option value="open">{t('Sort: most open slots')}</option></select>
    </div>
    {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}

    {!shown.length ? <div className="card pad empty"><p><b>{all.length ? t('No listings match.') : t('No listings yet.')}</b></p>
      <p className="muted">{t('Add a placement once, with its audience, pricing and timing; then put it on sale from the calendar.')}</p><a className="btn primary" href="/listings/new">{t('Add placement')}</a></div>
      : <div className="pr-list">{groups.map(c => { const items = shown.filter(x => chOf(x) === c)
        return <section key={c} className="pr-group">
          <button type="button" className="pr-group-h" aria-expanded={!closed[c]} onClick={() => setClosed({ ...closed, [c]: !closed[c] })}>
            <span className="pr-caret" aria-hidden>{closed[c] ? '›' : '⌄'}</span><Icon c={c} /><b>{CHANNEL_NAME[c]}</b><span className="muted">({items.length})</span></button>
          {!closed[c] && items.map(x => { const o = outlets[x.outletId], [sl, sc] = STATUS[status(x)], isOpen = open === x.id
            return <Fragment key={x.id}><div className={`pr-row ${isOpen ? 'open' : ''} ${x.archived ? 'gone' : ''}`}>
              <button type="button" className="pr-caret" aria-expanded={isOpen} aria-label={isOpen ? t('Close {name}', { name: x.name }) : t('Open {name}', { name: x.name })} onClick={() => setOpen(isOpen ? null : x.id)}>{isOpen ? '⌃' : '›'}</button>
              <img className="pr-thumb" src={o.coverUrl ?? art(c, 'card')} alt="" width={96} height={60} loading="lazy" />
              <span className="pr-name"><b>{x.name}</b><span className="small muted">{x.description ? tm(x.description) : ''}</span></span>
              <span className="pr-where small"><ChannelMark c={c} /> {o.name}<span className="muted">{saleLabel(x.saleType)}</span></span>
              <span className="pr-price"><b className="num">{money(x.startingPrice)}</b><span className="small muted">/ {unitOf(x, c)}</span>
                {x.reservePrice != null && <span className="small muted">{t('Min. accepted: {price}', { price: money(x.reservePrice) })}</span>}</span>
              <span><span className={`pt-pill ${sc}`}>{t(sl)}</span><span className="small muted pr-open">{t('{n} open', { n: x.openSlots })}</span></span>
              <span className="pr-acts">
                <a className="btn icon" href={`/schedule?view=list&q=${encodeURIComponent(x.name)}`} title={t('See it on the calendar')} aria-label={t('See {name} on the calendar', { name: x.name })}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg></a>
                {!x.archived && <a className="btn icon" href={`/listings/${x.id}/edit`} title={t('Edit')} aria-label={t('Edit {name}', { name: x.name })}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg></a>}
                <details className="pr-more"><summary className="btn icon" aria-label={t('More for {name}', { name: x.name })}>⋯</summary>
                  <div className="pr-menu card">
                    <a href={`/listings/new?from=${x.id}`}>{t('Duplicate')}</a>
                    {!x.archived && x.listing !== 'rolling' && <button type="button" disabled={busy || !p.company.payoutsEnabled} onClick={() => {
                      const from = x.listedUntil && x.listedUntil >= todayInDubai() ? addDays(x.listedUntil, 1) : todayInDubai()
                      act(`/seller/placements/${x.id}/slots`, { from, days: 28 }, r => t('{n} new slots listed from {from}.', { n: r.slots, from })) }}>{t('List 4 more weeks')}</button>}
                    <button type="button" disabled={busy} onClick={() => act(`/seller/placements/${x.id}/archive`, { archived: !x.archived }, () => x.archived ? t('Restored.') : t('Archived. Slots already on sale stay on sale.'))}>
                      {x.archived ? t('Restore') : t('Archive')}</button></div></details>
              </span>
            </div>{isOpen && <Detail p={x} o={o} />}</Fragment> })}
        </section> })}</div>}
  </main>
}
