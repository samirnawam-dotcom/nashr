import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { addDays, todayInDubai } from '../calendar/layout'
import { money } from './common'
import { PhotoBand } from '../PhotoBand'
import { ltr, sep, t } from '../i18n'
import { tm } from '../i18n-server'

type Placement = { id: string; outlet: string; outletId: string; name: string; saleType: string; days: number[]; startsAt: string | null; endsAt: string | null
  breaks: { label: string; at?: string; seconds?: number }[]; startingPrice: number; anyBreakPrice: number | null; packagePrice: number | null
  buyNowPrice: number | null; reservePrice: number | null; archived: boolean; openSlots: number; listedUntil: string | null }
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
        <a className="btn primary" href="/listings/new">{t("Add placement")}</a>
      </PhotoBand>
      {!p.company.payoutsEnabled && <p className="warn">{t('Slots go on sale once your payout account is verified.')} <a href="/profile">{t("Connect it")}</a></p>}
      {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
      {!p.placements.length ? <p className="muted empty">{t("No placements yet.")}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Placement")}</th><th>{t("When")}</th><th>{t("Sold as")}</th><th className="r">{t("From")}</th><th className="r">{t("On sale")}</th><th>{t("Listed until")}</th><th /></tr></thead>
          <tbody>{p.placements.map(x => <tr key={x.id} style={x.archived ? { opacity: .55 } : undefined}>
            <td><b>{x.name}</b><div className="small muted">{x.outlet}{x.breaks.length ? ` · ${t('{n} breaks', { n: x.breaks.length })}` : ''}</div></td>
            <td className="small">{x.days.map(d => t(DAYS[d - 1])).join(sep)}{x.startsAt ? ` · ${ltr(x.startsAt.slice(0, 5) + (x.endsAt ? `–${x.endsAt.slice(0, 5)}` : ''))}` : ''}</td>
            <td className="small">{x.saleType === 'auction' ? t('Auction') : t('Quick sale')}{x.reservePrice ? ` · ${t('reserve {price}', { price: money(x.reservePrice) })}` : ''}</td>
            <td className="r num">{money(x.startingPrice)}</td><td className="r num">{x.openSlots}</td><td className="num small">{x.listedUntil ?? '—'}</td>
            <td className="r"><div className="row-flex" style={{ justifyContent: 'flex-end' }}>
              {!x.archived && <button className="btn" disabled={busy || !p.company.payoutsEnabled} onClick={() => {
                const from = x.listedUntil && x.listedUntil >= todayInDubai() ? addDays(x.listedUntil, 1) : todayInDubai()
                act(`/seller/placements/${x.id}/slots`, { from, days: 28 }, r => t('{n} new slots listed from {from}.', { n: r.slots, from })) }}>{t("List 4 more weeks")}</button>}
              <button className="btn" disabled={busy} onClick={() => act(`/seller/placements/${x.id}/archive`, { archived: !x.archived }, () => x.archived ? t('Restored.') : t('Archived. Slots already on sale stay on sale.'))}>
                {x.archived ? t('Restore') : t('Archive')}</button></div></td>
          </tr>)}</tbody></table></div>}
    </main>
  )
}

const aed = (v: string) => v.trim() ? Math.round(Number(v.replace(/,/g, '')) * 100) : undefined

export function NewPlacementPage() {
  const [p, setP] = useState<Profile | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [warnings, setWarnings] = useState<string[]>([])
  const [f, setF] = useState({ outletId: '', name: '', saleType: 'auction', days: [1, 2, 3, 4, 5], startsAt: '', endsAt: '', startingPrice: '', anyBreakPrice: '', packagePrice: '',
    buyNowPrice: '', reservePrice: '', creativeLeadHours: '48', closeLeadDays: '5', listDays: '28' })
  const [breaks, setBreaks] = useState<{ label: string; at: string; seconds: string }[]>([])
  useEffect(() => { api<Profile>('/seller/profile').then(x => { setP(x); setF(v => ({ ...v, outletId: x.outlets[0]?.id ?? '' })) }, e => setError(e.message)) }, [])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const channel = p?.outlets.find(o => o.id === f.outletId)?.channel
  async function save() {
    setBusy(true); setError('')
    try {
      const body = { outletId: f.outletId, name: f.name, saleType: f.saleType, days: f.days, ...(f.startsAt ? { startsAt: f.startsAt } : {}), ...(f.endsAt ? { endsAt: f.endsAt } : {}),
        breaks: breaks.filter(b => b.label).map(b => ({ label: b.label, ...(b.at ? { at: b.at } : {}), ...(b.seconds ? { seconds: Number(b.seconds) } : {}) })),
        startingPrice: aed(f.startingPrice), anyBreakPrice: aed(f.anyBreakPrice), packagePrice: aed(f.packagePrice), buyNowPrice: aed(f.buyNowPrice), reservePrice: aed(f.reservePrice),
        creativeLeadHours: Number(f.creativeLeadHours), closeLeadHours: Number(f.closeLeadDays) * 24,
        ...(p!.company.payoutsEnabled && Number(f.listDays) ? { listFrom: todayInDubai(), listDays: Number(f.listDays) } : {}) }
      const r = await api('/seller/placements', { method: 'POST', body: JSON.parse(JSON.stringify(body)) })
      if (r.warnings?.length) setWarnings(r.warnings); else navigate('/listings')
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  if (warnings.length) return <main className="narrow"><h1>{t("Placement saved")}</h1>
    {warnings.map(w => <p key={w} className="warn">{tm(w)} {t("Check the times if that's not intended.")}</p>)}<a className="btn primary" href="/listings">{t("Go to listings")}</a></main>
  if (!p.outlets.length) return <main className="narrow"><h1>{t("Add placement")}</h1><p>{t('Add your outlet first.')} <a href="/profile">{t("Outlet profile")}</a></p></main>
  const slotted = breaks.length > 0
  return (
    <main className="narrow">
      <p className="small"><a href="/listings">{t("Listings")}</a> › {t("Add placement")}</p>
      <h1>{t("Add placement")}</h1>
      <div className="card pad form section">
        <div className="field"><label htmlFor="o">{t("Outlet")}</label><select id="o" value={f.outletId} onChange={set('outletId')}>{p.outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="field"><label htmlFor="n">{t("Name")}</label><input id="n" value={f.name} onChange={set('name')} placeholder={channel === 'print' ? t('Full page') : channel === 'podcast' ? t('Weekly episode') : t('Morning show')} /></div>
        <div className="field"><label htmlFor="st">{t("Sold as")}</label><select id="st" value={f.saleType} onChange={set('saleType')}>
          <option value="auction">{t("Auction (buyers bid; you accept the winner)")}</option><option value="quick_sale">{t("Quick sale (fixed price; you pick a buyer)")}</option></select></div>
        <div className="field"><span className="small muted">{t("Days")}</span><div className="days">{DAYS.map((d, i) => <label key={d} className={f.days.includes(i + 1) ? 'on' : ''}>
          <input type="checkbox" hidden checked={f.days.includes(i + 1)} onChange={() => setF({ ...f, days: f.days.includes(i + 1) ? f.days.filter(x => x !== i + 1) : [...f.days, i + 1].sort() })} />{t(d)}</label>)}</div></div>
        <div className="row-flex"><div className="field"><label htmlFor="sa">{t("Starts (Dubai time, empty for all day; overnight like 23:00–02:00 works)")}</label><input id="sa" type="time" value={f.startsAt} onChange={set('startsAt')} /></div>
          <div className="field"><label htmlFor="ea">{t("Ends")}</label><input id="ea" type="time" value={f.endsAt} onChange={set('endsAt')} /></div></div>
        <div className="field"><span className="small muted">{channel === 'podcast' ? t('Positions (each one is sold on its own; leave empty to sell the whole slot)') : t('Breaks (each one is sold on its own; leave empty to sell the whole slot)')}</span>
          {breaks.map((b, i) => <div className="breaks-row" key={i}>
            <div className="field"><label htmlFor={`bl${i}`}>{t("Label")}</label><input id={`bl${i}`} value={b.label} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></div>
            <div className="field"><label htmlFor={`bt${i}`}>{t("Time")}</label><input id={`bt${i}`} type="time" value={b.at} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, at: e.target.value } : x))} /></div>
            <div className="field"><label htmlFor={`bs${i}`}>{t("Seconds")}</label><input id={`bs${i}`} inputMode="numeric" value={b.seconds} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, seconds: e.target.value } : x))} /></div>
            <button className="btn" aria-label={t('Remove {name}', { name: b.label || t('break') })} onClick={() => setBreaks(breaks.filter((_, j) => j !== i))}>✕</button></div>)}
          <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setBreaks([...breaks, { label: t(channel === 'podcast' ? 'Position {n}' : 'Break {n}', { n: breaks.length + 1 }), at: '', seconds: channel === 'podcast' ? '' : '30' }])}>
            {channel === 'podcast' ? t('Add position') : t('Add break')}</button></div>
      </div>
      <div className="card pad form section">
        <h3>{t("Prices (AED, excl. VAT)")}</h3>
        <div className="grid2">
          <div className="field"><label htmlFor="sp">{slotted ? (f.saleType === 'auction' ? t('Starting price per break') : t('Price per break')) : f.saleType === 'auction' ? t('Starting price') : t('Price')}</label><input id="sp" inputMode="decimal" value={f.startingPrice} onChange={set('startingPrice')} /></div>
          {slotted && <div className="field"><label htmlFor="ab">{t('“Any break” price (optional)')}</label><input id="ab" inputMode="decimal" value={f.anyBreakPrice} onChange={set('anyBreakPrice')} /></div>}
          {slotted && breaks.length > 1 && <div className="field"><label htmlFor="pk">{t('All {n} breaks, package (optional)', { n: breaks.length })}</label><input id="pk" inputMode="decimal" value={f.packagePrice} onChange={set('packagePrice')} /></div>}
          {f.saleType === 'auction' && <div className="field"><label htmlFor="bn">{t("Buy-now price (optional)")}</label><input id="bn" inputMode="decimal" value={f.buyNowPrice} onChange={set('buyNowPrice')} /></div>}
          {f.saleType === 'auction' && <div className="field"><label htmlFor="rp">{t("Reserve (optional, hidden from buyers)")}</label><input id="rp" inputMode="decimal" value={f.reservePrice} onChange={set('reservePrice')} /></div>}
        </div>
      </div>
      <div className="card pad form section">
        <h3>{t("Deadlines")}</h3>
        <div className="grid2">
          <div className="field"><label htmlFor="cl">{t("Creative due (hours before air)")}</label><input id="cl" inputMode="numeric" value={f.creativeLeadHours} onChange={set('creativeLeadHours')} /></div>
          <div className="field"><label htmlFor="cd">{t("Bidding closes (days before air)")}</label><input id="cd" inputMode="numeric" value={f.closeLeadDays} onChange={set('closeLeadDays')} /></div>
        </div>
        <p className="small muted">{t("Bidding must close early enough for you to decide (24h), the buyer to pay (48h) and the creative to arrive.")}</p>
        {p.company.payoutsEnabled && <div className="field"><label htmlFor="ld">{t("List on the calendar for (days from today)")}</label><input id="ld" inputMode="numeric" value={f.listDays} onChange={set('listDays')} /></div>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-flex section"><button className="btn primary" disabled={busy || !f.name || !aed(f.startingPrice) || !f.days.length} onClick={save}>{t("Save placement")}</button>
        <a className="btn" href="/listings">{t("Cancel")}</a></div>
    </main>
  )
}
