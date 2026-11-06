import { navigate } from '../nav'
import { useEffect, useState } from 'react'
import { api, type Campaign, type Outlet } from '../api'
import { dayLabel, money } from '../format'
import { dubai } from '../calendar/layout'
import { Status } from '../bookings/Bookings'
import '../directory/directory.css'
import { PhotoBand } from '../PhotoBand'

const toFils = (aed: string) => Math.round(Number(aed.replace(/,/g, '')) * 100)
const pct = (n: number, of: number) => `${Math.min(100, of ? (n / of) * 100 : 0)}%`
const Bar = ({ c }: { c: Campaign }) => <div className="bar" title="Committed and pending against the budget"><i className="c" style={{ width: pct(c.committed, c.budget) }} /><i className="p" style={{ width: pct(c.pending, c.budget) }} /></div>

export function CampaignsPage() {
  const [list, setList] = useState<Campaign[] | null>(null), [error, setError] = useState('')
  const [form, setForm] = useState<null | { name: string; budget: string; launchDate: string; objective: string }>(null), [busy, setBusy] = useState(false)
  const load = () => api<Campaign[]>('/campaigns').then(setList, e => setError(e.message))
  useEffect(() => { load() }, [])
  async function create() {
    setBusy(true); setError('')
    try {
      const { id } = await api('/campaigns', { method: 'POST', body: { name: form!.name, budget: toFils(form!.budget),
        ...(form!.launchDate ? { launchDate: form!.launchDate } : {}), ...(form!.objective ? { objective: form!.objective } : {}) } })
      navigate(`/campaigns/${id}`)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <main>
      <PhotoBand img="/brand/campaigns-wide.jpg" title="Campaigns" sub="Plan outlets against a budget. Bids and requests tagged to a campaign count against it.">
        <button className="btn primary" onClick={() => setForm({ name: '', budget: '', launchDate: '', objective: '' })}>New campaign</button>
      </PhotoBand>
      {form && <section className="card pad form" style={{ maxWidth: 560, marginBottom: 20 }}>
        <h3>New campaign</h3>
        <div className="field"><label htmlFor="cn">Name</label><input id="cn" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="cb">Budget (AED, excl. VAT)</label><input id="cb" inputMode="decimal" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} /></div>
        <div className="field"><label htmlFor="cl">Launch date</label><input id="cl" type="date" value={form.launchDate} onChange={e => setForm({ ...form, launchDate: e.target.value })} /></div>
        <div className="field"><label htmlFor="co">Objective</label><input id="co" value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })} placeholder="Awareness, launch, footfall…" /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-flex"><button className="btn primary" disabled={busy || !form.name || !(toFils(form.budget) > 0)} onClick={create}>Create</button>
          <button className="btn" onClick={() => setForm(null)}>Cancel</button></div>
      </section>}
      {!form && error && <p className="error">{error}</p>}
      {list && !list.length && !form && <p className="muted empty">No campaigns yet. Create one to plan outlets and track spend against a budget.</p>}
      {list && list.length > 0 && <div className="table-wrap card"><table className="table"><thead><tr><th>Campaign</th><th>Launch</th><th className="r">Budget</th><th className="r">Committed</th><th style={{ width: 200 }} /><th>Status</th></tr></thead>
        <tbody>{list.map(c => <tr key={c.id} onClick={() => (navigate(`/campaigns/${c.id}`))}>
          <td><b>{c.name}</b>{c.objective && <div className="small muted">{c.objective}</div>}</td><td className="num">{c.launchDate ? dayLabel(c.launchDate) : '—'}</td>
          <td className="r num">{money(c.budget)}</td><td className="r num">{money(c.committed)}</td><td><Bar c={c} /></td>
          <td className="small">{c.status === 'active' ? 'Active' : 'Completed'}</td></tr>)}</tbody></table></div>}
    </main>
  )
}

type Detail = Campaign & { items: { outletId: string; outlet: string; channel: string; planned: number; committed: number }[]
  bookings: { id: string; ref: string; status: string; price: number; label: string; startsAt: string; outlet: string }[] }

export function CampaignPage({ id }: { id: string }) {
  const [c, setC] = useState<Detail | null>(null), [error, setError] = useState(''), [outlets, setOutlets] = useState<Outlet[]>([])
  const [plan, setPlan] = useState<{ outletId: string; planned: string }[]>([]), [saved, setSaved] = useState(''), [pick, setPick] = useState('')
  const load = () => api<Detail>(`/campaigns/${id}`).then(d => { setC(d); setPlan(d.items.map(i => ({ outletId: i.outletId, planned: i.planned ? String(i.planned / 100) : '' }))) }, e => setError(e.message))
  useEffect(() => { load(); api<Outlet[]>('/directory').then(setOutlets, () => {}) }, [id])
  async function save(next = plan) {
    setError(''); setSaved('')
    try { await api(`/campaigns/${id}/items`, { method: 'PUT', body: { items: next.map(p => ({ outletId: p.outletId, planned: p.planned ? toFils(p.planned) : 0 })) } }); await load(); setSaved('Plan saved.') }
    catch (e: any) { setError(e.message) }
  }
  async function setStatus(status: 'active' | 'completed') { await api(`/campaigns/${id}`, { method: 'PUT', body: { status } }); load() }
  if (!c) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  const name = (oid: string) => outlets.find(o => o.id === oid)
  const committedFor = (oid: string) => c.items.find(i => i.outletId === oid)?.committed ?? 0
  return (
    <main className="narrow wide">
      <p className="small"><a href="/campaigns">Campaigns</a> › {c.name}</p>
      <div className="profile-cover slim" aria-hidden><img src="/brand/campaigns-wide.jpg" width={1600} height={500} alt="" decoding="async" /></div>
      <div className="profile-h"><div><h1>{c.name}</h1><p className="muted">{[c.objective, c.launchDate && `Launches ${dayLabel(c.launchDate)}`].filter(Boolean).join(' · ')}</p></div>
        <div className="spacer" />
        <a className="btn" href={`/campaigns/${c.id}/plan`}>Media plan (PDF)</a>
        {c.status === 'active' ? <button className="btn" onClick={() => setStatus('completed')}>Mark completed</button> : <button className="btn" onClick={() => setStatus('active')}>Reopen</button>}
        {c.status === 'active' && <a className="btn primary" href="/calendar">Book slots</a>}</div>
      <dl className="kpis">
        <div className="card"><dt>Budget</dt><dd className="num">{money(c.budget)}</dd></div>
        <div className="card"><dt>Committed</dt><dd className="num">{money(c.committed)}</dd></div>
        <div className="card"><dt>Awaiting publishers</dt><dd className="num">{money(c.pending)}</dd></div>
        <div className="card"><dt>Remaining</dt><dd className="num" style={{ color: c.remaining < 0 ? 'var(--red)' : undefined }}>{money(c.remaining)}</dd></div>
      </dl>
      <Bar c={c} />
      <p className="small muted">Prices excl. VAT. Committed means accepted by the publisher; tag bids to this campaign from the bid drawer.</p>

      <h2 className="sec-h">Plan</h2>
      <div className="table-wrap card"><table className="table"><thead><tr><th>Outlet</th><th>Status</th><th className="r">Planned (AED)</th><th className="r">Committed</th><th /></tr></thead>
        <tbody>{plan.map((p, i) => { const o = name(p.outletId); return <tr key={p.outletId}>
          <td><a href={`/directory/${p.outletId}`}><b>{o?.name ?? c.items.find(x => x.outletId === p.outletId)?.outlet}</b></a></td>
          <td className="small">{o ? (o.onNashr ? 'On Nashr' : 'Quote needed') : ''}</td>
          <td className="r"><input className="search num" style={{ minWidth: 0, width: 130, textAlign: 'right' }} aria-label="Planned amount" inputMode="decimal" value={p.planned}
            onChange={e => setPlan(plan.map((x, j) => j === i ? { ...x, planned: e.target.value } : x))} /></td>
          <td className="r num">{money(committedFor(p.outletId))}</td>
          <td className="r"><button className="btn" aria-label={`Remove ${o?.name}`} onClick={() => save(plan.filter((_, j) => j !== i))}>Remove</button></td>
        </tr> })}
        <tr><td colSpan={5}><div className="row-flex">
          <select className="btn" aria-label="Add outlet" value={pick} onChange={e => setPick(e.target.value)}><option value="">Add an outlet…</option>
            {outlets.filter(o => !plan.some(p => p.outletId === o.id)).map(o => <option key={o.id} value={o.id}>{o.name}{o.onNashr ? '' : ' (quote)'}</option>)}</select>
          <button className="btn" disabled={!pick} onClick={() => { const next = [...plan, { outletId: pick, planned: '' }]; setPick(''); save(next) }}>Add</button>
          <div className="spacer" /><button className="btn primary" onClick={() => save()}>Save plan</button></div></td></tr></tbody></table></div>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="ok" role="status">{saved}</p>}

      <h2 className="sec-h">Bookings</h2>
      {!c.bookings.length ? <p className="muted">Nothing booked yet.</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>Order</th><th>Slot</th><th>Airs</th><th className="r">Price</th><th>Status</th></tr></thead>
          <tbody>{c.bookings.map(b => <tr key={b.id} onClick={() => (navigate(`/bookings/${b.id}`))}>
            <td className="num">{b.ref}</td><td><b>{b.outlet}</b> · {b.label}</td><td className="num">{dayLabel(dubai(b.startsAt).date)}</td>
            <td className="r num">{money(b.price)}</td><td><Status s={b.status} /></td></tr>)}</tbody></table></div>}
    </main>
  )
}
