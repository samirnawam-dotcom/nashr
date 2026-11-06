import { navigate } from '../nav'
import { PAGES, breadcrumb, outletSlug, siteUrl, useMeta } from '../seo'
import { useEffect, useState } from 'react'
import { api, type Campaign, type Outlet, type Price } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import './directory.css'
import { SignInPrompt, rememberPlace, useGuest } from '../guest'
import { PhotoBand } from '../PhotoBand'

const CHANNELS = ['tv', 'radio', 'print', 'digital', 'podcast']
const CHANNEL: Record<string, string> = { tv: 'TV', radio: 'Radio', print: 'Print', digital: 'Digital', podcast: 'Podcast' }
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const Logo = ({ o, size = 44 }: { o: { name: string; logoUrl: string | null }; size?: number }) => o.logoUrl
  ? <img className="logo-img" src={o.logoUrl} alt="" width={size} height={size} />
  : <span className="logo-img initials" style={{ width: size, height: size }} aria-hidden>{o.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('')}</span>

/** The label always says where a price comes from (brief section 7). */
export const PriceTag = ({ p }: { p: Price }) => !p ? <span className="small muted">Price on request</span> : (
  <span className="price-tag"><b className="num">{p.from === p.to ? money(p.from, p.currency) : `${money(p.from, p.currency)}–${(p.to / 100).toLocaleString('en-US')}`}</b>
    <span className={`level ${p.level}`}>{p.label}</span></span>)

/** "Tell me when it opens" for KSA and Athena (brief sections 14, 21). */
export function Waitlist({ topic, label }: { topic: 'KSA' | 'Athena'; label: string }) {
  const guest = useGuest()
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => { if (guest) return void setOn(false); api<string[]>('/waitlist').then(t => setOn(t.includes(topic)), () => setOn(false)) }, [topic])
  if (on === null) return null
  if (guest) return <a className="btn" href="/sign-in" onClick={rememberPlace}>{label}</a>
  return on ? <span className="small ok">You're on the list. We'll tell you when it opens.</span>
    : <button className="btn" onClick={() => api('/waitlist', { method: 'POST', body: { topic } }).then(() => setOn(true))}>{label}</button>
}

export function DirectoryPage() {
  useMeta({ ...PAGES['/directory'], jsonLd: [breadcrumb([['Nashr', '/'], ['Directory', '/directory']])] })
  const [outlets, setOutlets] = useState<Outlet[] | null>(null), [error, setError] = useState('')
  const [q, setQ] = useState(''), [channel, setChannel] = useState(''), [onlyNashr, setOnlyNashr] = useState(false), [market, setMarket] = useState('AE')
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('nashr:dir-view') as any) || 'grid')
  useEffect(() => { api<Outlet[]>('/directory').then(setOutlets, e => setError(e.message)) }, [])
  useEffect(() => { try { localStorage.setItem('nashr:dir-view', view) } catch { /* fine */ } }, [view])
  // The directory as a list of outlets for search engines (ItemList), once it has loaded.
  useMeta(outlets && { ...PAGES['/directory'], jsonLd: [breadcrumb([['Nashr', '/'], ['Directory', '/directory']]), { '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'UAE media outlets on Nashr', itemListElement: outlets.filter(o => o.market === 'AE').map((o, k) => ({ '@type': 'ListItem', position: k + 1, name: o.name, url: `${siteUrl()}/directory/${outletSlug(o)}` })) }] }, [outlets])
  const shown = (outlets ?? []).filter(o => o.market === market && (!channel || o.channel === channel) && (!onlyNashr || o.onNashr)
    && (!q || `${o.name} ${o.nameAr ?? ''} ${o.sectors.join(' ')} ${o.audience ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <main>
      <PhotoBand img="/brand/skyline.jpg" title="Directory" sub="UAE radio, TV, print, digital and podcasts. Outlets on Nashr can be booked; others take a quote request." />
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search outlets, sectors, audiences" aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />
        <div className="seg" role="group" aria-label="Channel">
          <button className={!channel ? 'on' : ''} onClick={() => setChannel('')}>All</button>
          {CHANNELS.map(c => <button key={c} className={channel === c ? 'on' : ''} onClick={() => setChannel(c)}>{CHANNEL[c]}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Market"><button className={market === 'AE' ? 'on' : ''} onClick={() => setMarket('AE')}>UAE</button>
          <button className={market === 'SA' ? 'on' : ''} onClick={() => setMarket('SA')}>KSA · coming soon</button></div>
        <label className="check"><input type="checkbox" checked={onlyNashr} onChange={e => setOnlyNashr(e.target.checked)} /> On Nashr only</label>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>Grid</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        </div>
      </div>
      {market === 'SA' && <p className="warn row-flex">Saudi Arabia opens soon. You can add Saudi outlets to a campaign plan now; booking opens with the market. <Waitlist topic="KSA" label="Tell me when KSA opens" /></p>}
      {error && <p className="error">{error}</p>}
      {outlets && !shown.length && <p className="muted empty">No outlets match. Clear the filters to see everything.</p>}
      {view === 'grid'
        ? <div className="outlet-grid">{shown.map(o => <a key={o.id} className="card outlet-card" href={`/directory/${outletSlug(o)}`}>
            <img className="outlet-cover" src={o.coverUrl ?? `/brand/${o.channel}-card.jpg`} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = `/brand/${o.channel}-card.jpg` }} width={800} height={250} alt="" loading="lazy" decoding="async" />
            <div className="row-flex"><Logo o={o} /><div><b>{o.name}</b>{o.nameAr && <div className="small muted" lang="ar" dir="rtl">{o.nameAr}</div>}</div></div>
            <div className="small muted">{CHANNEL[o.channel]}{o.tier ? ` · ${o.tier}` : ''}{o.sectors.length ? ` · ${o.sectors.slice(0, 3).join(', ')}` : ''}</div>
            <PriceTag p={o.price} />
            <span className={o.onNashr ? 'badge on' : 'badge'}>{o.comingSoon ? 'Coming soon' : o.onNashr ? 'On Nashr · book slots' : 'Not on Nashr yet · request a quote'}</span>
          </a>)}</div>
        : shown.length > 0 && <div className="table-wrap card"><table className="table"><thead><tr><th>Outlet</th><th>Channel</th><th>Sectors</th><th>Price</th><th /></tr></thead>
            <tbody>{shown.map(o => <tr key={o.id} onClick={() => (navigate(`/directory/${outletSlug(o)}`))}>
              <td><div className="row-flex"><Logo o={o} size={28} /><b>{o.name}</b></div></td><td>{CHANNEL[o.channel]}</td>
              <td className="small">{o.sectors.join(', ')}</td><td><PriceTag p={o.price} /></td>
              <td className="small">{o.comingSoon ? 'Coming soon' : o.onNashr ? 'Book slots' : 'Request quote'}</td></tr>)}</tbody></table></div>}
    </main>
  )
}

type Profile = Outlet & { website: string | null; description: string | null; completedSales: number; placements: {
  id: string; name: string; saleType: string; days: number[]; startsAt: string | null; endsAt: string | null; breaks: number
  startingPrice: number; anyBreakPrice: number | null; packagePrice: number | null; buyNowPrice: number | null; openSlots: number; nextSlotAt: string | null }[] }

export function OutletPage({ id }: { id: string }) {
  const guest = useGuest()
  const [o, setO] = useState<Profile | null>(null), [error, setError] = useState('')
  const [message, setMessage] = useState(''), [sent, setSent] = useState(''), [busy, setBusy] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[]>([]), [added, setAdded] = useState('')
  useEffect(() => { api<Profile>(`/outlets/${id}`).then(setO, e => setError(e.message)); if (!guest) api<Campaign[]>('/campaigns').then(c => setCampaigns(c.filter(x => x.status === 'active')), () => {}) }, [id])

  async function quote() {
    setBusy(true); setError('')
    try { await api(`/outlets/${o!.id}/quote`, { method: 'POST', body: { message } }); setSent('Sent. Nashr will come back to you with a quote.'); setMessage('') }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function addToCampaign(cid: string) {
    const c = await api<{ items: { outletId: string; planned: number }[] }>(`/campaigns/${cid}`)
    if (!c.items.some(i => i.outletId === o!.id)) await api(`/campaigns/${cid}/items`, { method: 'PUT', body: { items: [...c.items.map(i => ({ outletId: i.outletId, planned: i.planned })), { outletId: o!.id, planned: 0 }] } })
    setAdded(campaigns.find(x => x.id === cid)!.name)
  }
  const price = o?.price ? (o.price.from === o.price.to ? money(o.price.from, o.price.currency) : `${money(o.price.from, o.price.currency)} to ${money(o.price.to, o.price.currency)}`) : null
  useMeta(o && {
    title: `${o.name} advertising: ${CHANNEL[o.channel] === 'TV' ? 'TV' : CHANNEL[o.channel].toLowerCase()} rates and booking in the UAE | Nashr`,
    description: `Advertise with ${o.name}${o.nameAr ? ` (${o.nameAr})` : ''}, ${CHANNEL[o.channel].toLowerCase()} in the UAE${o.audience ? ` reaching ${o.audience}` : ''}.${price ? ` ${o.price!.label}: ${price}.` : ''} ${o.onNashr ? 'See open slots and book online on Nashr.' : 'Request a quote through Nashr.'}`.slice(0, 300),
    path: `/directory/${outletSlug(o)}`,
    jsonLd: [breadcrumb([['Nashr', '/'], ['Directory', '/directory'], [o.name, `/directory/${outletSlug(o)}`]]),
      { '@context': 'https://schema.org', '@type': 'Organization', name: o.name, ...(o.nameAr ? { alternateName: o.nameAr } : {}), ...(o.website ? { url: o.website } : {}), ...(o.description ? { description: o.description } : {}) }],
  }, [o])
  if (!o) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  return (
    <main className="narrow wide">
      <p className="small"><a href="/directory">Directory</a> › {o.name}</p>
      <div className="profile-cover" aria-hidden><img src={o.coverUrl ?? `/brand/${o.channel}-wide.jpg`} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = `/brand/${o.channel}-wide.jpg` }} width={1600} height={500} alt="" decoding="async" /></div>
      <div className="profile-h">
        <Logo o={o} size={64} />
        <div><h1>{o.name}</h1><p className="muted">{CHANNEL[o.channel]}{o.tier ? ` · ${o.tier}` : ''}{o.audience ? ` · ${o.audience}` : ''}</p></div>
        <div className="spacer" />
        {campaigns.length > 0 && <select className="btn" aria-label="Add to campaign" value="" onChange={e => e.target.value && addToCampaign(e.target.value)}>
          <option value="">Add to campaign…</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        {o.onNashr && <a className="btn primary" href="/calendar">Book slots</a>}
        {o.comingSoon && <Waitlist topic="KSA" label="Tell me when KSA opens" />}
      </div>
      {added && <p className="ok" role="status">Added to {added}.</p>}
      {o.comingSoon && <p className="warn">Coming soon: this market is not open yet. You can plan it in a campaign; booking opens with the market.</p>}
      <div className="cols">
        <section className="card pad">
          {o.description && <p>{o.description}</p>}
          <dl className="facts">
            <div><dt>Price</dt><dd><PriceTag p={o.price} /></dd></div>
            {o.sectors.length > 0 && <div><dt>Sectors</dt><dd>{o.sectors.join(', ')}</dd></div>}
            {o.onNashr && <div><dt>On Nashr</dt><dd>{o.completedSales ? `${o.completedSales} completed bookings` : 'New on Nashr'}</dd></div>}
            {o.website && <div><dt>Website</dt><dd><a href={o.website} target="_blank" rel="noreferrer noopener">{o.website.replace(/^https?:\/\//, '')}</a></dd></div>}
          </dl>
          {o.price?.level === 'estimate' && <p className="small muted">This range is Nashr's estimate. The outlet has not confirmed it.</p>}
        </section>
        {!o.onNashr && !o.comingSoon && <section className="card pad form">
          <h3>Request a quote</h3>
          <p className="small muted">This outlet isn't on Nashr yet. Tell us what you need and Nashr's team will get you a price.</p>
          {guest ? <SignInPrompt to="request a quote" compact /> : <>
          <div className="field"><label htmlFor="q">What you'd like to book</label><textarea id="q" rows={4} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Dates, formats, budget" /></div>
          <span className="small muted">Emails and phone numbers are not allowed.</span>
          {error && <p className="error" role="alert">{error}</p>}
          {sent && <p className="ok" role="status">{sent}</p>}
          <button className="btn primary" disabled={busy || !message.trim()} onClick={quote}>Send request</button></>}
        </section>}
      </div>
      {o.placements.length > 0 && <>
        <h2 className="sec-h">What you can book</h2>
        <div className="table-wrap card"><table className="table"><thead><tr><th>Placement</th><th>When</th><th>Sold as</th><th className="r">From</th><th className="r">Options</th><th>Next open</th></tr></thead>
          <tbody>{o.placements.map(p => <tr key={p.id}>
            <td><b>{p.name}</b>{p.breaks > 0 && <div className="small muted">{p.breaks} {o.channel === 'podcast' ? 'positions' : 'breaks'}</div>}</td>
            <td className="small">{p.days.map(d => DAYS[d]).join(', ')}{p.startsAt ? ` · ${p.startsAt.slice(0, 5)}${p.endsAt ? `–${p.endsAt.slice(0, 5)}` : ''}` : ''}</td>
            <td className="small">{p.saleType === 'auction' ? 'Auction' : 'Quick sale'}{p.buyNowPrice ? ` · buy now ${money(p.buyNowPrice)}` : ''}</td>
            <td className="r num">{money(p.startingPrice)}</td>
            <td className="r small">{[p.anyBreakPrice && `Any break ${money(p.anyBreakPrice)}`, p.packagePrice && `All breaks ${money(p.packagePrice)}`].filter(Boolean).join(' · ') || '—'}</td>
            <td className="small">{p.nextSlotAt ? `${dayLabel(dubai(p.nextSlotAt).date)} ${time(p.nextSlotAt)} · ${p.openSlots} open` : 'Nothing open'}</td>
          </tr>)}</tbody></table></div>
      </>}
    </main>
  )
}
