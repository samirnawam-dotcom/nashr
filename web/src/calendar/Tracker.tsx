import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { dayLabel, money, time } from '../format'
import { navigate } from '../nav'
import { OutletMark } from '../LogoPicker'
import { PAGES, useMeta } from '../seo'
import { t } from '../i18n'
import { useLive } from '../live'
import { addDays, dubai, monthGrid, todayInDubai, weekOf } from './layout'
import { BidDrawer } from './BidDrawer'
import { MyBids } from './MyBids'
import { useCampaigns } from './CampaignDrawer'
import { Chevron, Popover, useLatest, useNarrow } from './CalendarPage'
import { DatesPanel } from '../directory/Shop'
import './calendar.css'
import './tracker.css'

/*
 * The buyer's Calendar (owner's "Buying moves to the Directory"): a tracker of the buyer's own items only. Shopping moved to the
 * Directory; here are the products planned in campaigns, the bids, and the bookings, each with its price, status and next deadline.
 * Rows: outlet, then only the products the buyer has items on. Clicking an Added item or an open bid opens the bid drawer; anything
 * the publisher accepted opens the booking (Reports → Bookings).
 */
export type TrackStatus = 'added' | 'lead' | 'outbid' | 'waiting' | 'pay' | 'paid' | 'ran' | 'completed'
type Item = { placementId: string; product: string; brand: string; brandKey: string; channel: string; logoUrl: string | null; label: string | null
  campaignId: string | null; clientId: string | null; status: TrackStatus; at: string; price: number | null; deadline: string | null; slotId: string | null; dealId: string | null }
type View = 'day' | 'week' | 'month'

/** The status words and what each one means (the colour key's "?"). */
export const STATUS: [TrackStatus, string, string][] = [
  ['added', t('Added'), t('In a campaign plan. No bid or booking yet.')],
  ['lead', t('You lead'), t('Your bid is the highest so far.')],
  ['outbid', t('Outbid'), t('Someone bid more. Bid again before it closes.')],
  ['waiting', t('Waiting for seller'), t('The publisher has your request or offer and has not answered yet.')],
  ['pay', t('Accepted, pay now'), t('The publisher accepted. Pay before the deadline to keep it.')],
  ['paid', t('Paid'), t('Booked and paid. Nashr holds the money until the ad has run.')],
  ['ran', t('Ran, check proof'), t('The ad ran and the publisher sent proof. Check it.')],
  ['completed', t('Completed'), t('Done. The publisher has been paid.')],
]
const label = (s: TrackStatus) => STATUS.find(x => x[0] === s)![1]
const BOOKED = new Set<TrackStatus>(['pay', 'paid', 'ran', 'completed'])

/** The next deadline in a few words: "Pay by Thu 26 Nov · 10:00", "Closes Wed 25 Nov · 10:10". */
function deadline(i: Item) {
  if (!i.deadline) return null
  const d = dubai(i.deadline), when = `${dayLabel(d.date)} · ${time(i.deadline)}`
  return i.status === 'pay' ? t('Pay by {when}', { when }) : i.status === 'waiting' ? t('Answer by {when}', { when })
    : i.status === 'ran' ? t('Check by {when}', { when }) : i.status === 'paid' ? t('Next step by {when}', { when }) : t('Closes {when}', { when })
}

export function TrackerPage() {
  useMeta(PAGES['/calendar'])
  const narrow = useNarrow(), latest = useLatest()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const [view, setView] = useState<View>(() => { const v = params.get('view'); return v === 'day' || v === 'month' ? v : 'week' })
  const [date, setDate] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : todayInDubai())
  const [campaign, setCampaign] = useState(params.get('campaign') ?? ''), [client, setClient] = useState(params.get('client') ?? '')
  const [status, setStatus] = useState<TrackStatus | ''>((params.get('status') as TrackStatus) ?? ''), [q, setQ] = useState(params.get('q') ?? '')
  const [items, setItems] = useState<Item[] | null>(null), [any, setAny] = useState<boolean | null>(null), [error, setError] = useState('')
  const [slot, setSlot] = useState<string | null>(() => params.get('slot')), [pick, setPick] = useState<{ placementId: string; title: string } | null>(null)
  const [reload, setReload] = useState(0), [live, setLive] = useState(0)
  const { list: campaigns } = useCampaigns(), [clients, setClients] = useState<{ id: string; name: string }[]>([])
  useEffect(() => { api<{ id: string; name: string }[]>('/clients').then(setClients, () => setClients([])) }, [])
  useLive('slot', () => setLive(n => n + 1), 1500); useLive('notification', () => setLive(n => n + 1), 1500)

  const cols = view === 'day' ? [date] : view === 'week' ? weekOf(date) : monthGrid(date).map(w => w[0])
  const from = cols[0], to = view === 'month' ? addDays(cols.at(-1)!, 7) : addDays(cols.at(-1)!, 1)
  // the address keeps the view, date and filters, so Back and a shared link land on the same screen
  useEffect(() => {
    const p = new URLSearchParams(); const put = (k: string, v: string) => v && p.set(k, v)
    put('view', view === 'week' ? '' : view); put('date', date === todayInDubai() ? '' : date); put('campaign', campaign); put('client', client); put('status', status); put('q', q)
    history.replaceState(history.state, '', `${location.pathname}${p.size ? `?${p}` : ''}`)
  }, [view, date, campaign, client, status, q])
  useEffect(() => {
    const p = new URLSearchParams({ from: `${from}T00:00:00+04:00`, to: `${to}T00:00:00+04:00` })
    if (campaign) p.set('campaign', campaign); if (client) p.set('client', client); if (status) p.set('status', status); if (q.trim()) p.set('q', q.trim())
    const k = setTimeout(() => latest(api<{ items: Item[] }>(`/buyer/tracker?${p}`), r => { setItems(r.items); setError('') }, e => setError(e.message)), q ? 250 : 0)
    return () => clearTimeout(k)
  }, [from, to, campaign, client, status, q, reload, live])
  // "Nothing planned yet": the buyer has nothing at all, in any period (not just this week)
  // and on a first visit with no date in the address, open on the first period with something coming up
  const [jumped, setJumped] = useState(!!params.get('date'))
  useEffect(() => { api<{ items: Item[] }>(`/buyer/tracker?from=${addDays(todayInDubai(), -365)}T00:00:00%2B04:00&to=${addDays(todayInDubai(), 365)}T00:00:00%2B04:00`)
    .then(r => { setAny(r.items.length > 0)
      if (!jumped) { setJumped(true); const next = r.items.map(i => dubai(i.at).date).find(d => d >= todayInDubai()); if (next && next >= to) setDate(next) } }, () => setAny(true)) }, [reload])

  const step = (n: number) => {
    if (view === 'month') { const d = new Date(date + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); return setDate(d.toISOString().slice(0, 10)) }
    setDate(addDays(date, n * (view === 'day' ? 1 : 7)))
  }
  const title = view === 'month' ? dayLabel(date, { month: 'long', year: 'numeric' }) : view === 'day' ? dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : t('{from} – {to}', { from: dayLabel(from, { day: 'numeric', month: 'short' }), to: dayLabel(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' }) })
  const open = (i: Item) => {
    if (BOOKED.has(i.status) && i.dealId) return navigate(`/bookings/${i.dealId}`)
    if (i.slotId) return setSlot(i.slotId)
    setPick({ placementId: i.placementId, title: `${i.brand} · ${i.product}` }) // planned with no date on sale yet: pick one
  }
  const c = campaigns.find(x => x.id === campaign)
  const filtered = !!(campaign || client || status || q)

  return (
    <main className="cv tk">
      <header className="cv-head">
        <div className="cv-title"><h1>{t('Calendar')}</h1><p className="cv-range"><b>{title}</b></p></div>
        <div className="cv-nav" role="group" aria-label={t('Dates')}>
          <button className="btn" onClick={() => setDate(todayInDubai())}>{t('Today')}</button>
          <button className="btn icon" aria-label={t('Previous')} onClick={() => step(-1)}><Chevron dir="back" /></button>
          <button className="btn icon" aria-label={t('Next')} onClick={() => step(1)}><Chevron dir="fwd" /></button>
        </div>
        <ColourKey />
        <div className="seg cv-views" role="tablist" aria-label={t('View')}>{([['day', t('Day')], ['week', t('Week')], ['month', t('Month')]] as [View, string][]).map(([v, l]) =>
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>)}</div>
      </header>

      <div className="tk-filters">
        <input className="search" type="search" placeholder={t('Search outlets, products')} aria-label={t('Search')} value={q} onChange={e => setQ(e.target.value)} />
        <label className="cv-sortby"><span>{t('Campaign:')}</span><select className="cal-input" value={campaign} onChange={e => setCampaign(e.target.value)}>
          <option value="">{t('All campaigns')}</option>{campaigns.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        {clients.length > 0 && <label className="cv-sortby"><span>{t('Client:')}</span><select className="cal-input" value={client} onChange={e => setClient(e.target.value)}>
          <option value="">{t('All clients')}</option>{clients.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <label className="cv-sortby"><span>{t('Status:')}</span><select className="cal-input" value={status} onChange={e => setStatus(e.target.value as TrackStatus | '')}>
          <option value="">{t('All statuses')}</option>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {filtered && <button type="button" className="text-link small" onClick={() => { setCampaign(''); setClient(''); setStatus(''); setQ('') }}>{t('Clear all')}</button>}
      </div>
      {c && <p className="tk-budget small" role="status"><b dir="auto">{c.name}</b>
        <span>{t('Budget')} <b className="num">{c.budget != null ? money(c.budget) : t('Not set')}</b></span>
        <span>{t('Estimated')} <b className="num">{money(c.estimated)}</b></span>
        <span>{t('Committed')} <b className="num">{money(c.committed)}</b></span>
        {c.remaining != null && <span>{t('Remaining')} <b className="num">{money(c.remaining)}</b></span>}</p>}
      {error && <p className="error">{error}</p>}

      {any === false && !filtered ? <div className="tk-empty card">
        <h2>{t('Nothing planned yet.')}</h2>
        <p className="muted">{t('Find media in the Directory, add it to a campaign or place a bid, and it shows here with its status and next deadline.')}</p>
        <a className="btn primary" href="/directory?view=products">{t('Find media')}</a>
      </div>
      : <div className="cv-body with-bids">
        {narrow && <MyBids onOpen={setSlot} reload={reload} narrow />}
        {items && !items.length ? <p className="card pad muted tk-none">{filtered ? t('Nothing matches these filters in this period.') : t('Nothing in this period. Use the arrows to see other dates.')}</p>
          : narrow ? <ByDate items={items} onOpen={open} /> : <Rows items={items} view={view} cols={cols} onOpen={open} />}
        {!narrow && <MyBids onOpen={setSlot} reload={reload} narrow={false} />}
      </div>}

      {pick && <DatesPanel placementId={pick.placementId} title={pick.title} onClose={() => setPick(null)} onPick={id => { setPick(null); setSlot(id) }} />}
      {slot && <BidDrawer slotId={slot} onClose={() => setSlot(null)} onDone={() => setReload(n => n + 1)} />}
    </main>
  )
}

/** The colour key, with a "?" that says what each status means. */
function ColourKey() {
  return <Popover label={<span className="tk-key-l"><span className="tk-swatches" aria-hidden>{STATUS.map(([k]) => <i key={k} className={`s-${k}`} />)}</span>{t('Colour key')} ?</span>} wide align="end">
    <ul className="tk-key">{STATUS.map(([k, l, help]) => <li key={k}><span className={`tk-item s-${k} demo`}>{l}</span><span className="small muted">{help}</span></li>)}</ul>
  </Popover>
}

function Chip({ i, onOpen, compact }: { i: Item; onOpen: (i: Item) => void; compact?: boolean }) {
  const d = deadline(i)
  return <button type="button" className={`tk-item s-${i.status}`} onClick={() => onOpen(i)} title={`${i.brand} · ${i.product}${i.label ? ` · ${i.label}` : ''}`}>
    <b className="num">{i.price != null ? money(i.price) : '—'}</b>
    <span className="tk-st">{label(i.status)}</span>
    {d && !compact && <span className="tk-dl">{d}</span>}
  </button>
}

/** Outlet, then the products the buyer has items on; a column per day (Day, Week) or per week (Month). */
function Rows({ items, view, cols, onOpen }: { items: Item[] | null; view: View; cols: string[]; onOpen: (i: Item) => void }) {
  const today = todayInDubai()
  const groups = useMemo(() => {
    const m = new Map<string, { brand: string; logoUrl: string | null; products: Map<string, { name: string; items: Item[] }> }>()
    for (const i of items ?? []) {
      const g = m.get(i.brandKey) ?? m.set(i.brandKey, { brand: i.brand, logoUrl: i.logoUrl, products: new Map() }).get(i.brandKey)!
      const p = g.products.get(i.placementId) ?? g.products.set(i.placementId, { name: i.product, items: [] }).get(i.placementId)!
      p.items.push(i)
    }
    return [...m.entries()].sort((a, b) => a[1].brand.localeCompare(b[1].brand))
  }, [items])
  const colOf = (i: Item) => { const d = dubai(i.at).date; return view === 'month' ? cols.filter(c => c <= d).at(-1)! : d }
  const colLabel = (c: string) => view === 'month'
    ? t('{from} – {to}', { from: dayLabel(c, { day: 'numeric', month: 'short' }), to: dayLabel(addDays(c, 6), { day: 'numeric', month: 'short' }) })
    : dayLabel(c, view === 'day' ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric' })
  const isNow = (c: string) => view === 'month' ? today >= c && today < addDays(c, 7) : c === today
  return <section className={`card cv-rows rv-${view}`}>
    <div className="table-wrap"><table className="table cv-rtable tk-table" style={{ minWidth: view === 'day' ? 560 : 180 + cols.length * 96 }}>
      <colgroup><col className="c-p" />{cols.map(c => <col key={c} className="c-d" />)}</colgroup>
      <thead><tr><th className="cv-pcol">{t('Outlet')}</th>{cols.map(c => <th key={c} className={`num ${isNow(c) ? 'today' : ''}`}>{colLabel(c)}</th>)}</tr></thead>
      {groups.map(([key, g]) => <tbody key={key} className="cv-outlet-group">
        <tr className="cv-orow"><th scope="rowgroup" colSpan={cols.length + 1}><span className="cv-fold tk-oname"><OutletMark name={g.brand} url={g.logoUrl} size={28} /><b dir="auto">{g.brand}</b></span></th></tr>
        {[...g.products.entries()].map(([pid, p]) => <tr key={pid} className="cv-prow">
          <th scope="row" className="cv-pcol"><span className="cv-pname"><b dir="auto">{p.name}</b></span></th>
          {cols.map(c => { const here = p.items.filter(i => colOf(i) === c)
            return <td key={c} className={`cv-rcell tk-cell ${view !== 'month' && c < today ? 'past' : ''}`}>
              {here.length ? <div className="tk-stack">{here.map(i => <Chip key={`${i.status}-${i.slotId ?? i.placementId}-${i.dealId ?? ''}`} i={i} onOpen={onOpen} compact={view === 'month'} />)}</div> : null}
            </td> })}
        </tr>)}
      </tbody>)}
    </table></div>
    {!items && <p className="muted pad">{t('Loading…')}</p>}
  </section>
}

/** On a phone the calendar is a list by date. */
function ByDate({ items, onOpen }: { items: Item[] | null; onOpen: (i: Item) => void }) {
  if (!items) return <p className="muted">{t('Loading…')}</p>
  const days = [...new Set(items.map(i => dubai(i.at).date))]
  return <div className="tk-days">{days.map(d => <section key={d} className="tk-day">
    <h3>{dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    <ul>{items.filter(i => dubai(i.at).date === d).map(i => <li key={`${i.status}-${i.slotId ?? i.placementId}-${i.dealId ?? ''}`}>
      <span className="row-flex tk-dhead"><OutletMark name={i.brand} url={i.logoUrl} size={24} /><b dir="auto">{i.brand} · {i.product}</b></span>
      <Chip i={i} onOpen={onOpen} /></li>)}</ul>
  </section>)}</div>
}
