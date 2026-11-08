import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { addDays, todayInDubai } from '../calendar/layout'
import { money } from './common'
import { PhotoBand } from '../PhotoBand'
import { ltr, sep, t } from '../i18n'
import { tm } from '../i18n-server'
import { LANGUAGE } from '../calendar/BidDrawer'
import { saleLabel } from '../calendar/CalendarPage'

type Placement = { id: string; outlet: string; outletId: string; name: string; saleType: string; days: number[]; startsAt: string | null; endsAt: string | null
  breaks: { label: string; at?: string; seconds?: number }[]; startingPrice: number; anyBreakPrice: number | null; packagePrice: number | null
  buyNowPrice: number | null; reservePrice: number | null; autoAccept: boolean; creativeLeadHours: number; closeLeadHours: number
  archived: boolean; openSlots: number; listedUntil: string | null
  description: string | null; specs: string | null; language: string | null; unit: 'day' | 'week'; listing: 'rolling' | 'manual'; horizonWeeks: number; separation: boolean }
type Profile = { company: { payoutsEnabled: boolean }; outlets: { id: string; name: string; channel: string }[]; placements: Placement[] }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ListingsPage() {
  const [p, setP] = useState<Profile | null>(null), [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const load = () => api<Profile>('/seller/profile').then(setP, e => setError(e.message))
  useEffect(() => { load() }, [])
  async function act(path: string, body: object, done: (r: any) => string) {
    setBusy(true); setError(''); setNote('')
    try { const r = await api(path, { method: 'POST', body }); setNote(done(r)); await load() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  return (
    <main>
      <PhotoBand img="/brand/podcast-wide.jpg" title={t("Listings")} sub={t("What you sell repeatedly. Each airing becomes slots on the calendar.")}>
        <div className="row-flex"><a className="btn primary" href="/listings/new">{t("Add placement")}</a><a className="btn" href="/listings/import">{t('Import a rate card file')}</a></div>
      </PhotoBand>
      {!p.company.payoutsEnabled && <p className="warn">{t('Slots go on sale once your payout account is verified.')} <a href="/profile">{t("Connect it")}</a></p>}
      {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
      {!p.placements.length ? <p className="muted empty">{t("No placements yet.")}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Placement")}</th><th>{t("When")}</th><th>{t("Sold as")}</th><th className="r">{t("From")}</th><th className="r">{t("On sale")}</th><th>{t("Listed until")}</th><th /></tr></thead>
          <tbody>{p.placements.map(x => <tr key={x.id} style={x.archived ? { opacity: .55 } : undefined}>
            <td><b>{x.name}</b><div className="small muted">{x.outlet}{x.breaks.length ? ` · ${t('{n} breaks', { n: x.breaks.length })}` : ''}</div></td>
            <td className="small">{x.unit === 'week' ? t('A whole week from {day}', { day: t(DAYS[x.days[0] - 1]) }) : x.days.map(d => t(DAYS[d - 1])).join(sep)}{x.startsAt ? ` · ${ltr(x.startsAt.slice(0, 5) + (x.endsAt ? `–${x.endsAt.slice(0, 5)}` : ''))}` : ''}</td>
            <td className="small">{saleLabel(x.saleType)}{x.reservePrice ? ` · ${t('reserve {price}', { price: money(x.reservePrice) })}` : ''}{x.autoAccept && <div className="small lead">{t('Accepts automatically at the reserve')}</div>}</td>
            <td className="r num">{money(x.startingPrice)}</td><td className="r num">{x.openSlots}</td>
            <td className="small">{x.listing === 'rolling' && !x.archived ? <span className="lead">{t('Kept {n} weeks ahead', { n: x.horizonWeeks })}</span> : <span className="num">{x.listedUntil ?? '—'}</span>}</td>
            <td className="r"><div className="row-flex" style={{ justifyContent: 'flex-end' }}>
              {!x.archived && <a className="btn" href={`/listings/${x.id}/edit`}>{t('Edit')}</a>}
              <a className="btn" href={`/listings/new?from=${x.id}`}>{t('Duplicate')}</a>
              {!x.archived && x.listing !== 'rolling' && <button className="btn" disabled={busy || !p.company.payoutsEnabled} onClick={() => {
                const from = x.listedUntil && x.listedUntil >= todayInDubai() ? addDays(x.listedUntil, 1) : todayInDubai()
                act(`/seller/placements/${x.id}/slots`, { from, days: 28 }, r => t('{n} new slots listed from {from}.', { n: r.slots, from })) }}>{t("List 4 more weeks")}</button>}
              <button className="btn" disabled={busy} onClick={() => act(`/seller/placements/${x.id}/archive`, { archived: !x.archived }, () => x.archived ? t('Restored.') : t('Archived. Slots already on sale stay on sale.'))}>
                {x.archived ? t('Restore') : t('Archive')}</button></div></td>
          </tr>)}</tbody></table></div>}
    </main>
  )
}

const aed = (v: string) => v.trim() ? Math.round(Number(v.replace(/,/g, '')) * 100) : undefined

export { NewPlacementPage, ImportPlacementsPage } from './PlacementForm'

/** A switch that only makes sense with a reserve: when bidding closes at or above it, the winner is accepted without waiting for the publisher. */
function AutoAccept({ on, reserve, onChange }: { on: boolean; reserve: boolean; onChange: (v: boolean) => void }) {
  return <div className="field span-2 auto-accept">
    <label className="switch"><input type="checkbox" role="switch" checked={on && reserve} disabled={!reserve} onChange={e => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden><span /></span><b>{t('Accept automatically at the reserve')}</b></label>
    <span className="small muted">{reserve ? t('When bidding closes at or above your reserve, the top bid is accepted for you and the buyer is asked to pay. Below the reserve, you still decide.')
      : t('Set a reserve price first.')}</span></div>
}

type Edit = { name: string; startingPrice: string; anyBreakPrice: string; packagePrice: string; buyNowPrice: string; reservePrice: string; autoAccept: boolean; creativeLeadHours: string; closeLeadDays: string
  description: string; specs: string; language: string; listing: 'rolling' | 'manual'; horizonWeeks: string; separation: boolean }
const toAed = (fils: number | null) => fils == null ? '' : String(fils / 100)

/**
 * Change a placement's name, prices, auto-accept and deadlines. What the publisher changes reaches every future slot nobody has bid on,
 * at once; a slot with a bid keeps the terms its buyers bid on. Days, times and breaks make new slots, so they are not edited here.
 */
export function EditPlacementPage({ id }: { id: string }) {
  const [p, setP] = useState<Placement | null>(null), [f, setF] = useState<Edit | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState<number | null>(null)
  useEffect(() => { api<Profile>('/seller/profile').then(x => { const pl = x.placements.find(y => y.id === id); if (!pl) return setError(t('Not found'))
    setP(pl); setF({ name: pl.name, startingPrice: toAed(pl.startingPrice), anyBreakPrice: toAed(pl.anyBreakPrice), packagePrice: toAed(pl.packagePrice), buyNowPrice: toAed(pl.buyNowPrice),
      reservePrice: toAed(pl.reservePrice), autoAccept: pl.autoAccept, creativeLeadHours: String(pl.creativeLeadHours), closeLeadDays: String(pl.closeLeadHours / 24),
      description: pl.description ?? '', specs: pl.specs ?? '', language: pl.language ?? 'english', listing: pl.listing, horizonWeeks: String(pl.horizonWeeks), separation: pl.separation }) }, e => setError(e.message)) }, [id])
  if (!p || !f) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const set = (k: keyof Edit) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setSaved(null) }
  const auction = p.saleType === 'auction', slotted = p.breaks.length > 0
  const reserve = aed(f.reservePrice), buyNow = aed(f.buyNowPrice)
  const problem = !f.name.trim() ? t('Give the placement a name.') : !aed(f.startingPrice) ? t('Set a price.')
    : reserve && buyNow && reserve > buyNow ? t('The reserve cannot be above the buy-now price.') : ''
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const r = await api<{ slotsUpdated: number }>(`/seller/placements/${id}`, { method: 'PUT', body: JSON.parse(JSON.stringify({ name: f!.name.trim(),
        startingPrice: aed(f!.startingPrice), anyBreakPrice: slotted ? aed(f!.anyBreakPrice) : undefined, packagePrice: slotted ? aed(f!.packagePrice) : undefined,
        buyNowPrice: auction ? buyNow : undefined, reservePrice: auction ? reserve : undefined, autoAccept: p!.saleType === 'fixed' ? f!.autoAccept : auction && !!reserve && f!.autoAccept,
        creativeLeadHours: Number(f!.creativeLeadHours), closeLeadHours: Math.round(Number(f!.closeLeadDays) * 24),
        description: f!.description, specs: f!.specs, language: f!.language, listing: f!.listing, horizonWeeks: Number(f!.horizonWeeks), separation: f!.separation })) })
      setSaved(r.slotsUpdated)
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <main className="narrow">
      <p className="small"><a href="/listings">{t('Listings')}</a> › {p.name}</p>
      <h1>{t('Edit {name}', { name: p.name })}</h1>
      <p className="muted">{p.outlet} · {saleLabel(p.saleType)} · {p.days.map(d => t(DAYS_SHORT[d - 1])).join(sep)}{p.startsAt ? ` · ${ltr(p.startsAt.slice(0, 5) + (p.endsAt ? `–${p.endsAt.slice(0, 5)}` : ''))}` : ''}
        {slotted ? ` · ${t('{n} breaks', { n: p.breaks.length })}` : ''}</p>
      <p className="notice">{t('Changes reach every future slot nobody has bid on, straight away. Slots with bids keep the terms their buyers bid on. To change days, times or breaks, add a new placement and archive this one.')}</p>
      <form className="form" onSubmit={save}>
        <div className="card pad form section">
          <div className="field"><label htmlFor="en">{t('Name')}</label><input id="en" value={f.name} maxLength={200} onChange={set('name')} /></div>
          <div className="field"><label htmlFor="eds">{t('What the buyer gets')}</label><textarea id="eds" dir="auto" rows={2} maxLength={600} value={f.description} onChange={set('description')} /></div>
          <div className="grid2">
            <div className="field"><label htmlFor="esx">{t('Creative specs')}</label><input id="esx" dir="auto" maxLength={400} value={f.specs} onChange={set('specs')} /></div>
            <div className="field"><label htmlFor="elg">{t('Ad language')}</label><select id="elg" value={f.language} onChange={set('language')}>
              {Object.entries(LANGUAGE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></div>
          </div>
        </div>
        <div className="card pad form section">
          <h3>{t('Prices (AED, excl. VAT)')}</h3>
          <div className="grid2">
            <div className="field"><label htmlFor="esp">{slotted ? (auction ? t('Starting price per break') : t('Price per break')) : auction ? t('Starting price') : t('Price')}</label>
              <input id="esp" inputMode="decimal" value={f.startingPrice} onChange={set('startingPrice')} /></div>
            {slotted && <div className="field"><label htmlFor="eab">{t('“Any break” price (optional)')}</label><input id="eab" inputMode="decimal" value={f.anyBreakPrice} onChange={set('anyBreakPrice')} /></div>}
            {slotted && p.breaks.length > 1 && <div className="field"><label htmlFor="epk">{t('All {n} breaks, package (optional)', { n: p.breaks.length })}</label><input id="epk" inputMode="decimal" value={f.packagePrice} onChange={set('packagePrice')} /></div>}
            {auction && <div className="field"><label htmlFor="ebn">{t('Buy-now price (optional)')}</label><input id="ebn" inputMode="decimal" value={f.buyNowPrice} onChange={set('buyNowPrice')} /></div>}
            {auction && <div className="field"><label htmlFor="erp">{t('Reserve (optional, hidden from buyers)')}</label><input id="erp" inputMode="decimal" value={f.reservePrice} onChange={set('reservePrice')} /></div>}
            {auction && <AutoAccept on={f.autoAccept} reserve={!!reserve} onChange={v => { setF({ ...f, autoAccept: v }); setSaved(null) }} />}
            {p.saleType === 'fixed' && <div className="field span-2 auto-accept"><label className="switch"><input type="checkbox" role="switch" checked={f.autoAccept} onChange={e => { setF({ ...f, autoAccept: e.target.checked }); setSaved(null) }} />
              <span className="switch-track" aria-hidden><span /></span><b>{t('Confirm bookings automatically')}</b></label>
              <span className="small muted">{t('A booking at your price is confirmed at once and the buyer is asked to pay. Off: you confirm each one within 24 hours.')}</span></div>}
          </div>
        </div>
        <div className="card pad form section">
          <h3>{t('Deadlines')}</h3>
          <div className="grid2">
            <div className="field"><label htmlFor="ecl">{t('Creative due (hours before air)')}</label><input id="ecl" inputMode="numeric" value={f.creativeLeadHours} onChange={set('creativeLeadHours')} /></div>
            <div className="field"><label htmlFor="ecd">{t('Bidding closes (days before air)')}</label><input id="ecd" inputMode="numeric" value={f.closeLeadDays} onChange={set('closeLeadDays')} /></div>
          </div>
          <p className="small muted">{t('Bidding must close early enough for you to decide (24h), the buyer to pay (48h) and the creative to arrive.')}</p>
        </div>
        <div className="card pad form section">
          <h3>{t('Listing')}</h3>
          <div className="grid2">
            <div className="field"><label htmlFor="eli">{t('How long it stays on sale')}</label><select id="eli" value={f.listing} onChange={set('listing')}>
              <option value="rolling">{t('Keep it on sale')}</option><option value="manual">{t('I list weeks myself')}</option></select></div>
            {f.listing === 'rolling' && <div className="field"><label htmlFor="ehz">{t('Weeks ahead')}</label><select id="ehz" value={f.horizonWeeks} onChange={set('horizonWeeks')}>
              {[4, 8, 12, 26].map(n => <option key={n} value={n}>{t('{n} weeks', { n })}</option>)}</select></div>}
          </div>
          <label className="switch"><input type="checkbox" role="switch" checked={f.separation} onChange={e => { setF({ ...f, separation: e.target.checked }); setSaved(null) }} />
            <span className="switch-track" aria-hidden><span /></span><b>{t('Competitive separation')}</b></label>
          <span className="small muted">{t('Warn me before I accept a booking when an advertiser in the same industry is already booked on that day.')}</span>
        </div>
        {(problem || error) && <p className="error" role="alert">{problem || error}</p>}
        {saved != null && <p className="ok" role="status">{saved === 1 ? t('Saved. 1 future slot now has the new terms.') : t('Saved. {n} future slots now have the new terms.', { n: saved })} <a href="/listings">{t('Back to listings')}</a></p>}
        <div className="row-flex section"><button className="btn primary" disabled={busy || !!problem}>{t('Save changes')}</button><a className="btn" href="/listings">{t('Cancel')}</a></div>
      </form>
    </main>
  )
}
