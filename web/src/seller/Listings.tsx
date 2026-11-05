import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { addDays, todayInDubai } from '../calendar/layout'
import { money } from './common'

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
  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  return (
    <main>
      <div className="page-h"><h1>Listings</h1><span className="muted small">What you sell repeatedly. Each airing becomes slots on the calendar.</span><div className="spacer" />
        <a className="btn primary" href="/listings/new">Add placement</a></div>
      {!p.company.payoutsEnabled && <p className="warn">Slots go on sale once your payout account is verified. <a href="/profile">Connect it</a></p>}
      {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
      {!p.placements.length ? <p className="muted empty">No placements yet.</p>
        : <table className="table card"><thead><tr><th>Placement</th><th>When</th><th>Sold as</th><th className="r">From</th><th className="r">On sale</th><th>Listed until</th><th /></tr></thead>
          <tbody>{p.placements.map(x => <tr key={x.id} style={x.archived ? { opacity: .55 } : undefined}>
            <td><b>{x.name}</b><div className="small muted">{x.outlet}{x.breaks.length ? ` · ${x.breaks.length} breaks` : ''}</div></td>
            <td className="small">{x.days.map(d => DAYS[d - 1]).join(', ')}{x.startsAt ? ` · ${x.startsAt.slice(0, 5)}${x.endsAt ? `–${x.endsAt.slice(0, 5)}` : ''}` : ''}</td>
            <td className="small">{x.saleType === 'auction' ? 'Auction' : 'Quick sale'}{x.reservePrice ? ` · reserve ${money(x.reservePrice)}` : ''}</td>
            <td className="r num">{money(x.startingPrice)}</td><td className="r num">{x.openSlots}</td><td className="num small">{x.listedUntil ?? '—'}</td>
            <td className="r"><div className="row-flex" style={{ justifyContent: 'flex-end' }}>
              {!x.archived && <button className="btn" disabled={busy || !p.company.payoutsEnabled} onClick={() => {
                const from = x.listedUntil && x.listedUntil >= todayInDubai() ? addDays(x.listedUntil, 1) : todayInDubai()
                act(`/seller/placements/${x.id}/slots`, { from, days: 28 }, r => `${r.slots} new slots listed from ${from}.`) }}>List 4 more weeks</button>}
              <button className="btn" disabled={busy} onClick={() => act(`/seller/placements/${x.id}/archive`, { archived: !x.archived }, () => x.archived ? 'Restored.' : 'Archived. Slots already on sale stay on sale.')}>
                {x.archived ? 'Restore' : 'Archive'}</button></div></td>
          </tr>)}</tbody></table>}
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
  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  if (warnings.length) return <main className="narrow"><h1>Placement saved</h1>
    {warnings.map(w => <p key={w} className="warn">{w} Check the times if that's not intended.</p>)}<a className="btn primary" href="/listings">Go to listings</a></main>
  if (!p.outlets.length) return <main className="narrow"><h1>Add placement</h1><p>Add your outlet first. <a href="/profile">Outlet profile</a></p></main>
  const slotted = breaks.length > 0
  return (
    <main className="narrow">
      <p className="small"><a href="/listings">Listings</a> › Add placement</p>
      <h1>Add placement</h1>
      <div className="card pad form section">
        <div className="field"><label htmlFor="o">Outlet</label><select id="o" value={f.outletId} onChange={set('outletId')}>{p.outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="field"><label htmlFor="n">Name</label><input id="n" value={f.name} onChange={set('name')} placeholder={channel === 'print' ? 'Full page' : channel === 'podcast' ? 'Weekly episode' : 'Morning show'} /></div>
        <div className="field"><label htmlFor="st">Sold as</label><select id="st" value={f.saleType} onChange={set('saleType')}>
          <option value="auction">Auction (buyers bid; you accept the winner)</option><option value="quick_sale">Quick sale (fixed price; you pick a buyer)</option></select></div>
        <div className="field"><span className="small muted">Days</span><div className="days">{DAYS.map((d, i) => <label key={d} className={f.days.includes(i + 1) ? 'on' : ''}>
          <input type="checkbox" hidden checked={f.days.includes(i + 1)} onChange={() => setF({ ...f, days: f.days.includes(i + 1) ? f.days.filter(x => x !== i + 1) : [...f.days, i + 1].sort() })} />{d}</label>)}</div></div>
        <div className="row-flex"><div className="field"><label htmlFor="sa">Starts (Dubai time, empty for all day; overnight like 23:00–02:00 works)</label><input id="sa" type="time" value={f.startsAt} onChange={set('startsAt')} /></div>
          <div className="field"><label htmlFor="ea">Ends</label><input id="ea" type="time" value={f.endsAt} onChange={set('endsAt')} /></div></div>
        <div className="field"><span className="small muted">{channel === 'podcast' ? 'Positions' : 'Breaks'} (each one is sold on its own; leave empty to sell the whole slot)</span>
          {breaks.map((b, i) => <div className="breaks-row" key={i}>
            <div className="field"><label htmlFor={`bl${i}`}>Label</label><input id={`bl${i}`} value={b.label} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></div>
            <div className="field"><label htmlFor={`bt${i}`}>Time</label><input id={`bt${i}`} type="time" value={b.at} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, at: e.target.value } : x))} /></div>
            <div className="field"><label htmlFor={`bs${i}`}>Seconds</label><input id={`bs${i}`} inputMode="numeric" value={b.seconds} onChange={e => setBreaks(breaks.map((x, j) => j === i ? { ...x, seconds: e.target.value } : x))} /></div>
            <button className="btn" aria-label={`Remove ${b.label || 'break'}`} onClick={() => setBreaks(breaks.filter((_, j) => j !== i))}>✕</button></div>)}
          <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setBreaks([...breaks, { label: `${channel === 'podcast' ? 'Position' : 'Break'} ${breaks.length + 1}`, at: '', seconds: channel === 'podcast' ? '' : '30' }])}>
            Add {channel === 'podcast' ? 'position' : 'break'}</button></div>
      </div>
      <div className="card pad form section">
        <h3>Prices (AED, excl. VAT)</h3>
        <div className="grid2">
          <div className="field"><label htmlFor="sp">{f.saleType === 'auction' ? 'Starting price' : 'Price'}{slotted ? ' per break' : ''}</label><input id="sp" inputMode="decimal" value={f.startingPrice} onChange={set('startingPrice')} /></div>
          {slotted && <div className="field"><label htmlFor="ab">"Any break" price (optional)</label><input id="ab" inputMode="decimal" value={f.anyBreakPrice} onChange={set('anyBreakPrice')} /></div>}
          {slotted && breaks.length > 1 && <div className="field"><label htmlFor="pk">All {breaks.length} breaks, package (optional)</label><input id="pk" inputMode="decimal" value={f.packagePrice} onChange={set('packagePrice')} /></div>}
          {f.saleType === 'auction' && <div className="field"><label htmlFor="bn">Buy-now price (optional)</label><input id="bn" inputMode="decimal" value={f.buyNowPrice} onChange={set('buyNowPrice')} /></div>}
          {f.saleType === 'auction' && <div className="field"><label htmlFor="rp">Reserve (optional, hidden from buyers)</label><input id="rp" inputMode="decimal" value={f.reservePrice} onChange={set('reservePrice')} /></div>}
        </div>
      </div>
      <div className="card pad form section">
        <h3>Deadlines</h3>
        <div className="grid2">
          <div className="field"><label htmlFor="cl">Creative due (hours before air)</label><input id="cl" inputMode="numeric" value={f.creativeLeadHours} onChange={set('creativeLeadHours')} /></div>
          <div className="field"><label htmlFor="cd">Bidding closes (days before air)</label><input id="cd" inputMode="numeric" value={f.closeLeadDays} onChange={set('closeLeadDays')} /></div>
        </div>
        <p className="small muted">Bidding must close early enough for you to decide (24h), the buyer to pay (48h) and the creative to arrive.</p>
        {p.company.payoutsEnabled && <div className="field"><label htmlFor="ld">List on the calendar for (days from today)</label><input id="ld" inputMode="numeric" value={f.listDays} onChange={set('listDays')} /></div>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-flex section"><button className="btn primary" disabled={busy || !f.name || !aed(f.startingPrice) || !f.days.length} onClick={save}>Save placement</button>
        <a className="btn" href="/listings">Cancel</a></div>
    </main>
  )
}
