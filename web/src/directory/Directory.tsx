import { navigate } from '../nav'
import { PAGES, breadcrumb, siteUrl, useMeta } from '../seo'
import { useEffect, useState } from 'react'
import { api, type Price } from '../api'
import { money } from '../format'
import './directory.css'
import { SignInPrompt, rememberPlace, useGuest } from '../guest'
import { PhotoBand } from '../PhotoBand'
import { Stars } from '../Stars'
import { isAr, locale, t } from '../i18n'
import { art, CHANNELS, CHANNEL_NAME, ICON } from '../media'
import { OutletMark } from '../LogoPicker'
import { ProductSummary, daysText, mediaName, type SummaryProduct } from '../products/Summary'
import { AddToCampaign } from '../campaigns/AddToCampaign'
import { setCurrentCampaign, useCampaigns, useCurrentCampaign } from '../calendar/CampaignDrawer'
import { saleLabel, SaleIcon } from '../calendar/CalendarPage'

/*
 * The Directory (owner's buyer-side fixes): the same structure as the publisher's Products page, outlets first, then their
 * products. Sort by popularity, price or newest; filter by media type, price range, "fits my budget" and saved outlets.
 */
export const Logo = ({ o, size = 44 }: { o: { name: string; logoUrl: string | null }; size?: number }) => <OutletMark name={o.name} url={o.logoUrl} size={size} />

/** The label always says where a price comes from (brief section 7). Kept for pages that still show a range. */
export const PriceTag = ({ p }: { p: Price }) => !p ? <span className="small muted">{t("Price on request")}</span> : (
  <span className="price-tag"><b className="num">{p.from === p.to ? money(p.from, p.currency) : isAr ? `${(p.from / 100).toLocaleString('en-US')}–${money(p.to, p.currency)}` : `${money(p.from, p.currency)}–${(p.to / 100).toLocaleString('en-US')}`}</b>
    <span className={`level ${p.level}`}>{t(p.label)}</span></span>)

/** "Tell me when it opens" for KSA and Athena (brief sections 14, 21). */
export function Waitlist({ topic, label }: { topic: 'KSA' | 'Athena'; label: string }) {
  const guest = useGuest()
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => { if (guest) return void setOn(false); api<string[]>('/waitlist').then(t => setOn(t.includes(topic)), () => setOn(false)) }, [topic])
  if (on === null) return null
  if (guest) return <a className="btn" href="/sign-in" onClick={rememberPlace}>{label}</a>
  return on ? <span className="small ok">{t("You're on the list. We'll tell you when it opens.")}</span>
    : <button className="btn" onClick={() => api('/waitlist', { method: 'POST', body: { topic } }).then(() => setOn(true))}>{label}</button>
}

export type Brand = { id: string; slug: string; name: string; nameAr: string | null; logoUrl: string | null; coverUrl: string | null; channels: string[]; sectors: string[]
  audiences: string[]; audience: string | null; market: string; comingSoon: boolean; onNashr: boolean; fromPrice: number | null; currency: string; onSale: number; products: number
  rating: { average: number | null; count: number }; saved: boolean; popularRank: number; newestRank: number }
type Sort = 'popular' | 'price_asc' | 'price_desc' | 'newest'
const SORTS: [Sort, string][] = [['popular', 'Most popular'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['newest', 'Newest on Nashr']]
const toFils = (v: string) => v.trim() === '' ? null : Math.round(Number(v.replace(/,/g, '')) * 100)
const channelsText = (cs: string[]) => cs.map(c => CHANNEL_NAME[c] ?? c).join(' · ')

/** The star on every outlet card and outlet page: tap to save, tap again to remove (no campaign needed). */
function SaveStar({ b, onChange }: { b: { id: string; name: string; saved: boolean }; onChange: (saved: boolean) => void }) {
  const guest = useGuest(), [busy, setBusy] = useState(false)
  if (guest) return null
  return <button type="button" className={`star-btn ${b.saved ? 'on' : ''}`} aria-pressed={b.saved} disabled={busy}
    aria-label={b.saved ? t('Remove {name} from saved', { name: b.name }) : t('Save {name}', { name: b.name })} title={b.saved ? t('Saved') : t('Save')}
    onClick={async e => { e.preventDefault(); e.stopPropagation(); setBusy(true)
      try { const r = await api<{ saved: boolean }>(`/directory/${b.id}/saved`, { method: b.saved ? 'DELETE' : 'PUT' }); onChange(r.saved) } finally { setBusy(false) } }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill={b.saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
  </button>
}

export function DirectoryPage() {
  useMeta({ ...PAGES['/directory'], jsonLd: [breadcrumb([['Nashr', '/'], [t("Directory"), '/directory']])] })
  const guest = useGuest(), params = new URLSearchParams(location.search)
  const [list, setList] = useState<Brand[] | null>(null), [error, setError] = useState('')
  const [q, setQ] = useState(''), [channel, setChannel] = useState(() => params.get('channel') ?? ''), [onlyNashr, setOnlyNashr] = useState(false), [market, setMarket] = useState('AE')
  const [sort, setSort] = useState<Sort>('popular'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [fits, setFits] = useState(false), [saved, setSaved] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>(() => { try { return (localStorage.getItem('nashr:dir-view') as any) || 'grid' } catch { return 'grid' } })
  // arriving from a campaign's "Add products": that campaign is the one products are added to
  useEffect(() => { const c = params.get('campaign'); if (c && !guest) setCurrentCampaign(c) }, [])
  const [campaignId] = useCurrentCampaign(), { list: campaigns } = useCampaigns(!guest), campaign = campaigns.find(c => c.id === campaignId)
  useEffect(() => { api<Brand[]>('/directory').then(setList, e => setError(e.message)) }, [])
  useEffect(() => { try { localStorage.setItem('nashr:dir-view', view) } catch { /* fine */ } }, [view])
  useMeta(list && { ...PAGES['/directory'], jsonLd: [breadcrumb([['Nashr', '/'], [t("Directory"), '/directory']]), { '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'UAE media outlets on Nashr', itemListElement: list.filter(o => o.market === 'AE').map((o, k) => ({ '@type': 'ListItem', position: k + 1, name: o.name, url: `${siteUrl()}/directory/${o.slug}` })) }] }, [list])
  const lo = toFils(from), hi = toFils(to), left = fits && campaign?.remaining != null ? campaign.remaining : null
  const shown = (list ?? []).filter(o => o.market === market && (!channel || o.channels.includes(channel)) && (!onlyNashr || o.onNashr) && (!saved || o.saved)
    && (lo == null || (o.fromPrice != null && o.fromPrice >= lo)) && (hi == null || (o.fromPrice != null && o.fromPrice <= hi))
    && (left == null || o.fromPrice == null || o.fromPrice <= left)
    && (!q || `${o.name} ${o.nameAr ?? ''} ${o.sectors.join(' ')} ${o.audience ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  // price sorts put outlets with no price on Nashr ("Request a quote") last
  const price = (o: Brand) => o.fromPrice ?? null
  shown.sort((a, b) => sort === 'popular' ? a.popularRank - b.popularRank : sort === 'newest' ? a.newestRank - b.newestRank
    : price(a) == null ? 1 : price(b) == null ? -1 : sort === 'price_asc' ? price(a)! - price(b)! : price(b)! - price(a)!)
  const setOne = (id: string, v: boolean) => setList(l => l && l.map(x => x.id === id ? { ...x, saved: v } : x))
  return (
    <main>
      <PhotoBand img="/brand/skyline.jpg" title={t("Directory")} sub={t("UAE radio, TV, print, digital and podcasts. Outlets on Nashr can be booked; others take a quote request.")} />
      <div className="dir-bar">
        <input className="search" type="search" placeholder={t("Search outlets, sectors, audiences")} aria-label={t("Search")} value={q} onChange={e => setQ(e.target.value)} />
        <label className="dir-sort"><span>{t('Sort by:')}</span><select value={sort} onChange={e => setSort(e.target.value as Sort)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></label>
      </div>
      <div className="dir-row"><span className="dir-label">{t('Media type:')}</span>
        <div className="seg" role="group" aria-label={t('Media type')}>
          <button className={!channel ? 'on' : ''} onClick={() => setChannel('')}>{t("All")}</button>
          {CHANNELS.map(c => <button key={c} className={channel === c ? 'on' : ''} onClick={() => setChannel(c)}>{CHANNEL_NAME[c]}</button>)}</div></div>
      <div className="dir-row">
        <span className="dir-label">{t('Price:')}</span>
        <span className="dir-range"><input className="search" inputMode="decimal" aria-label={t('AED from')} placeholder={t('AED from')} value={from} onChange={e => setFrom(e.target.value.replace(/[^\d.,]/g, ''))} />
          <span aria-hidden>–</span><input className="search" inputMode="decimal" aria-label={t('to')} placeholder={t('to')} value={to} onChange={e => setTo(e.target.value.replace(/[^\d.,]/g, ''))} /></span>
        {campaign && campaign.remaining != null && <label className="switch-l"><input type="checkbox" role="switch" checked={fits} onChange={e => setFits(e.target.checked)} />
          <span>{t('Fits my budget')} <span className="small muted">({t('{amount} left in {name}', { amount: money(campaign.remaining), name: campaign.name })})</span></span></label>}
        {!guest && <label className="check"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /> {t('Saved')}</label>}
        <label className="check"><input type="checkbox" checked={onlyNashr} onChange={e => setOnlyNashr(e.target.checked)} /> {t('On Nashr only')}</label>
        <div className="seg" role="group" aria-label={t("Market")}><button className={market === 'AE' ? 'on' : ''} onClick={() => setMarket('AE')}>{t("UAE")}</button>
          <button className={market === 'SA' ? 'on' : ''} onClick={() => setMarket('SA')}>{t('KSA · coming soon')}</button></div>
        <div className="spacer" />
        <div className="seg" role="group" aria-label={t("View")}>
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>{t("Grid")}</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>{t("List")}</button></div>
      </div>
      {market === 'SA' && <p className="warn row-flex">{t('Saudi Arabia opens soon. You can add Saudi outlets to a campaign plan now; booking opens with the market.')} <Waitlist topic="KSA" label={t("Tell me when KSA opens")} /></p>}
      {error && <p className="error">{error}</p>}
      {list && !shown.length && <p className="muted empty">{saved ? t('No saved outlets match. Tap the star on an outlet to save it.') : t("No outlets match. Clear the filters to see everything.")}</p>}
      {view === 'grid'
        ? <div className="outlet-grid">{shown.map(o => <article key={o.id} className="card outlet-card" onClick={() => navigate(`/directory/${o.slug}`)}>
            <img className="outlet-cover" src={o.coverUrl ?? art(o.channels[0], 'card')} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = `/brand/${o.channels[0]}-card.jpg` }} width={800} height={250} alt="" loading="lazy" decoding="async" />
            <div className="row-flex oc-head"><Logo o={o} /><div className="oc-name"><a href={`/directory/${o.slug}`} onClick={e => e.stopPropagation()}><b>{o.name}</b></a>{o.nameAr && <div className="small muted" lang="ar" dir="rtl">{o.nameAr}</div>}</div>
              <SaveStar b={o} onChange={v => setOne(o.id, v)} /></div>
            <div className="small muted">{channelsText(o.channels)}{o.sectors.length ? ` · ${o.sectors.slice(0, 3).map(x => t(x)).join(', ')}` : ''}</div>
            {o.comingSoon ? <span className="badge">{t("Coming soon")}</span>
              : o.fromPrice != null ? <span className="oc-price"><span className="small muted">{t('From')}</span> <b className="num">{money(o.fromPrice, o.currency)}</b></span>
              : <span className="badge">{t("Request a quote")}</span>}
            {o.rating.count > 0 && <Stars value={o.rating.average!} count={o.rating.count} />}
            {o.onNashr && !o.comingSoon && <a className="badge on" href={`/calendar?product=${o.id}&pname=${encodeURIComponent(o.name)}`} onClick={e => e.stopPropagation()}>{t('See dates')}</a>}
          </article>)}</div>
        : shown.length > 0 && <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Outlet")}</th><th>{t("Media type")}</th><th>{t("Sectors")}</th><th className="r">{t("Starting price")}</th><th /></tr></thead>
            <tbody>{shown.map(o => <tr key={o.id} onClick={() => navigate(`/directory/${o.slug}`)}>
              <td><div className="row-flex"><Logo o={o} size={28} /><b>{o.name}</b><SaveStar b={o} onChange={v => setOne(o.id, v)} /></div></td><td className="small">{channelsText(o.channels)}</td>
              <td className="small">{o.sectors.map(x => t(x)).join(', ')}</td><td className="r num">{o.fromPrice != null ? t('From {amount}', { amount: money(o.fromPrice, o.currency) }) : '—'}</td>
              <td className="small">{o.comingSoon ? t("Coming soon") : o.onNashr ? <a href={`/calendar?product=${o.id}&pname=${encodeURIComponent(o.name)}`} onClick={e => e.stopPropagation()}>{t("See dates")}</a> : t("Request a quote")}</td></tr>)}</tbody></table></div>}
      <CompareBar />
    </main>
  )
}

// ---- Compare: tick 2 or 3 products, from any outlet ----------------------------------------------------------------------
export type CompareItem = { placementId: string; outlet: string; logoUrl: string | null; product: string; channel: string; saleType: string; price: number
  creativeDays: number | null; audience: string | null; reach: number | null; reachUnit: string | null }
const CMP = 'nashr:compare', MAX_COMPARE = 3
let compared: CompareItem[] = (() => { try { return JSON.parse(sessionStorage.getItem(CMP) ?? '[]') } catch { return [] } })()
const cmpSubs = new Set<() => void>()
const setCompared = (next: CompareItem[]) => { compared = next; try { sessionStorage.setItem(CMP, JSON.stringify(next)) } catch { /* fine */ } cmpSubs.forEach(f => f()) }
function useCompare() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n => n + 1); cmpSubs.add(f); return () => { cmpSubs.delete(f) } }, [])
  return compared
}
function CompareTick({ item }: { item: CompareItem }) {
  const list = useCompare(), on = list.some(x => x.placementId === item.placementId), [full, setFull] = useState(false)
  return <span className="cmp-tick"><label className="check small"><input type="checkbox" checked={on} onChange={() => {
    if (on) { setCompared(list.filter(x => x.placementId !== item.placementId)); setFull(false) }
    else if (list.length >= MAX_COMPARE) setFull(true)
    else setCompared([...list, item]) }} /> {t('Compare')}</label>
    {full && <span className="small error" role="alert">{t('You can compare up to 3.')}</span>}</span>
}
function CompareBar() {
  const list = useCompare(), guest = useGuest(), [open, setOpen] = useState(false)
  if (list.length < 1) return null
  return <>
    <div className="cmp-bar" role="region" aria-label={t('Compare')}>
      <span className="small">{list.map(x => x.product).join(' · ')}</span><span className="spacer" />
      <button className="btn" onClick={() => setCompared([])}>{t('Clear')}</button>
      <button className="btn primary" disabled={list.length < 2} onClick={() => setOpen(true)}>{t('Compare ({n})', { n: list.length })}</button></div>
    {open && <div className="scrim" onClick={() => setOpen(false)}><section className="cmp-modal card" role="dialog" aria-label={t('Compare')} onClick={e => e.stopPropagation()}>
      <header className="drawer-h"><h2>{t('Compare')}</h2><button className="btn" onClick={() => setOpen(false)} aria-label={t('Close')}>✕</button></header>
      <div className="table-wrap"><table className="table cmp-table"><tbody>
        <tr><th scope="row">{t('Outlet')}</th>{list.map(x => <td key={x.placementId}><span className="row-flex"><OutletMark name={x.outlet} url={x.logoUrl} size={30} /><b>{x.outlet}</b></span></td>)}</tr>
        <tr><th scope="row">{t('Product')}</th>{list.map(x => <td key={x.placementId}>{x.product}</td>)}</tr>
        <tr><th scope="row">{t('Media type')}</th>{list.map(x => <td key={x.placementId}>{CHANNEL_NAME[x.channel] ?? x.channel}</td>)}</tr>
        <tr><th scope="row">{t('Sale type')}</th>{list.map(x => <td key={x.placementId}><span className="tag"><SaleIcon k={x.saleType} />{saleLabel(x.saleType)}</span></td>)}</tr>
        <tr><th scope="row">{t('Starting price')}</th>{list.map(x => <td key={x.placementId} className="num">{money(x.price)}</td>)}</tr>
        <tr><th scope="row">{t('Creative due')}</th>{list.map(x => <td key={x.placementId}>{x.creativeDays != null ? t('{n} days before it runs', { n: x.creativeDays }) : '—'}</td>)}</tr>
        <tr><th scope="row">{t('Target audience')}</th>{list.map(x => <td key={x.placementId} dir="auto">{x.audience ?? '—'}</td>)}</tr>
        <tr><th scope="row">{t('Reach')}</th>{list.map(x => <td key={x.placementId} className="num">{x.reach ? x.reach.toLocaleString('en-US') + (x.reachUnit ? ` ${t(x.reachUnit)}` : '') : '—'}</td>)}</tr>
        {!guest && <tr><th scope="row"><span className="sr-only">{t('Add to campaign')}</span></th>{list.map(x => <td key={x.placementId}><AddToCampaign placementId={x.placementId} small /></td>)}</tr>}
      </tbody></table></div>
    </section></div>}
  </>
}

// ---- One outlet: its products grouped by media type ----------------------------------------------------------------------
type Sell = { id: string; kind: string; name: string; days: number[]; saleType: string; startsAt: string | null; endsAt: string | null; price: number; startingPrice: number
  creativeDays: number; openSlots: number; nextAt: string | null; description: string | null }
type BuyerProduct = Omit<SummaryProduct, 'sellable'> & { id: string; description: string | null; coverUrl: string | null; onSale: number; sellable: Sell[] }
type Profile = Brand & { description: string | null; website: string | null; recent: { score: number; comment: string; at: string }[]; products: BuyerProduct[] }

export function OutletPage({ id }: { id: string }) {
  const guest = useGuest()
  const [o, setO] = useState<Profile | null>(null), [error, setError] = useState('')
  const [message, setMessage] = useState(''), [sent, setSent] = useState(''), [busy, setBusy] = useState(false), [open, setOpen] = useState<string | null>(null)
  useEffect(() => { api<Profile>(`/directory/${id}`).then(setO, e => setError(e.message)) }, [id])
  async function quote() {
    setBusy(true); setError('')
    try { await api(`/outlets/${o!.products[0].id}/quote`, { method: 'POST', body: { message } }); setSent(t("Sent. Nashr will come back to you with a quote.")); setMessage('') }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  useMeta(o && {
    title: `${o.name} advertising: ${channelsText(o.channels).toLowerCase()} rates and booking in the UAE | Nashr`,
    description: `Advertise with ${o.name}${o.nameAr ? ` (${o.nameAr})` : ''} in the UAE${o.audience ? `, reaching ${o.audience}` : ''}.${o.fromPrice != null ? ` From ${money(o.fromPrice, o.currency)}.` : ''} ${o.onNashr ? 'See open dates and book online on Nashr.' : 'Request a quote through Nashr.'}`.slice(0, 300),
    path: `/directory/${o.slug}`,
    jsonLd: [breadcrumb([['Nashr', '/'], [t("Directory"), '/directory'], [o.name, `/directory/${o.slug}`]]),
      { '@context': 'https://schema.org', '@type': 'Organization', name: o.name, ...(o.nameAr ? { alternateName: o.nameAr } : {}), ...(o.website ? { url: o.website } : {}), ...(o.description ? { description: o.description } : {}) }],
  }, [o])
  if (!o) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const groups = [...new Set(o.products.map(p => p.channel))]
  const seeDates = (p: BuyerProduct, s?: Sell) => s ? `/calendar?item=${s.id}&pname=${encodeURIComponent(`${o.name} · ${s.name}`)}` : `/calendar?product=${p.id}&pname=${encodeURIComponent(p.name)}`
  const cmp = (p: BuyerProduct, s: Sell): CompareItem => ({ placementId: s.id, outlet: o.name, logoUrl: o.logoUrl, product: s.kind === 'main' ? p.name : `${p.name} · ${s.name}`, channel: p.channel,
    saleType: s.saleType, price: s.price, creativeDays: s.creativeDays, audience: p.audience, reach: p.reach, reachUnit: p.reachUnit })
  const quoteOnly = !o.onNashr && !o.comingSoon
  return (
    <main className="narrow wide">
      <p className="small"><a href="/directory">{t("Directory")}</a> {isAr ? '‹' : '›'} {o.name}</p>
      <div className="profile-cover" aria-hidden><img src={o.coverUrl ?? art(o.channels[0])} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = `/brand/${o.channels[0]}-wide.jpg` }} width={1600} height={500} alt="" decoding="async" /></div>
      <div className="profile-h">
        <Logo o={o} size={64} />
        <div><h1>{o.name}</h1>{o.nameAr && <p className="profile-ar" lang="ar" dir="rtl">{o.nameAr}</p>}
          <p className="muted">{channelsText(o.channels)}{o.sectors.length ? ` · ${o.sectors.slice(0, 4).map(x => t(x)).join(', ')}` : ''}</p>
          {o.rating.count > 0 && <Stars value={o.rating.average!} count={o.rating.count} size={16} />}</div>
        <div className="spacer" />
        <SaveStar b={o} onChange={v => setO({ ...o, saved: v })} />
        {o.comingSoon && <Waitlist topic="KSA" label={t("Tell me when KSA opens")} />}
      </div>
      {o.comingSoon && <p className="warn">{t("Coming soon: this market is not open yet. You can plan it in a campaign; booking opens with the market.")}</p>}
      {(o.description || o.website || quoteOnly) && <div className="cols">
        {(o.description || o.website) && <section className="card pad">
          {o.description && <p>{o.description}</p>}
          {o.website && <p className="small"><a href={o.website} target="_blank" rel="noreferrer noopener">{o.website.replace(/^https?:\/\//, '')}</a></p>}
        </section>}
        {quoteOnly && <section className="card pad form">
          <h3>{t('Request a quote')}</h3>
          <p className="small muted">{t("This outlet isn't on Nashr yet. Tell us what you need and Nashr's team will get you a price.")}</p>
          {guest ? <SignInPrompt to="request a quote" compact /> : <>
          <div className="field"><label htmlFor="q">{t("What you'd like to book")}</label><textarea id="q" rows={4} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder={t("Dates, formats, budget")} /></div>
          <span className="small muted">{t("Emails and phone numbers are not allowed.")}</span>
          {error && <p className="error" role="alert">{error}</p>}
          {sent && <p className="ok" role="status">{sent}</p>}
          <button className="btn primary" disabled={busy || !message.trim()} onClick={quote}>{t("Send request")}</button></>}
        </section>}
      </div>}

      {!quoteOnly && <>
        <h2 className="sec-h">{t("Products")}</h2>
        {groups.map(c => <section key={c} className="pr-group">
          <h3 className="pr-gh"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[c] ?? ICON.digital} /></svg>{CHANNEL_NAME[c] ?? c}</h3>
          {o.products.filter(p => p.channel === c).map(p => { const one = p.sellable.length === 1 ? p.sellable[0] : undefined, isOpen = open === p.id
            return <article key={p.id} className={`card dp-row ${isOpen ? 'open' : ''}`}>
              <div className="dp-main">
                <button type="button" className="dp-open" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                  <img className="dp-cover" src={p.coverUrl ?? art(p.channel, 'card')} alt="" width={96} height={60} loading="lazy" />
                  <span className="dp-what"><b dir="auto">{p.name}</b>{p.description && <span className="small muted dp-desc" dir="auto">{p.description}</span>}
                    <span className="small muted">{mediaName(p)}{p.onSale > 0 ? ` · ${t('{n} on sale', { n: p.onSale })}` : ` · ${t('Nothing on sale now')}`}</span></span></button>
                <span className="dp-price num">{p.defaultPrice != null ? money(p.defaultPrice) : '—'}<small>{t('Starting price')}</small></span>
                <span className="dp-acts">
                  {one && !guest && <AddToCampaign placementId={one.id} small />}
                  {p.onSale > 0 && <a className="btn sm" href={seeDates(p, one)}>{t('See dates')}</a>}
                  {one && <CompareTick item={cmp(p, one)} />}</span>
              </div>
              {!one && p.sellable.length > 0 && <ul className="dp-items">{p.sellable.map(s => <li key={s.id}>
                <span><b dir="auto">{s.name}</b><span className="small muted">{[s.days?.length ? daysText(s.days) : '', s.startsAt ? `${s.startsAt}–${s.endsAt ?? ''}` : '', saleLabel(s.saleType), s.openSlots ? t('{n} on sale', { n: s.openSlots }) : ''].filter(Boolean).join(' · ')}</span></span>
                <span className="num">{money(s.price)}</span>
                <span className="dp-acts">{!guest && <AddToCampaign placementId={s.id} small />}{s.openSlots > 0 && <a className="btn sm" href={seeDates(p, s)}>{t('See dates')}</a>}<CompareTick item={cmp(p, s)} /></span>
              </li>)}</ul>}
              {isOpen && <ProductSummary m={p} buyer />}
            </article> })}
        </section>)}
      </>}

      {o.recent.length > 0 && <section className="section reviews"><h2 className="sec-h">{t("What buyers say")}</h2>
        <ul className="review-list">{o.recent.map((r, i) => <li key={i} className="card pad"><Stars value={r.score} /><p>“{r.comment}”</p>
          <span className="small muted">{t('Verified booking')} · {new Date(r.at).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}</span></li>)}</ul></section>}
      <CompareBar />
    </main>
  )
}
