import { useState } from 'react'
import { Loading, csv, date, money, useAct, useLoad, when } from './common'

type S = { key: string; value: unknown; founderOnly: boolean; history: { value: unknown; from: string; by: string }[] }
// What each setting means, in the owner's words (SPEC 11, 12). Unlisted keys show their raw name.
const LABEL: Record<string, [string, string?]> = {
  default_commission_bp: ['Default commission', 'basis points: 1200 = 12%'], media_vat_bp: ['VAT on media', 'basis points'], nashr_vat_registered: ['Nashr is VAT-registered', 'true / false'],
  nashr_vat_bp: ['VAT on Nashr commission', 'basis points'], nashr_legal_name: ['Nashr legal name on documents'], nashr_trn: ["Nashr's TRN", 'null until registered'],
  seller_window_hours: ['Publisher decision window', 'hours'], payment_window_hours: ['Payment window', 'hours, capped by the creative deadline'],
  min_step_bp: ['Minimum bid step', 'basis points: 300 = 3%'], max_choice_rounds: ['Next-bid choices before relisting'], review_working_days: ['Buyer proof review', 'working days'],
  proof_due_working_days: ['Proof due after the run', 'working days'], max_creative_rounds: ['Creative change rounds'], issue_response_hours: ['Publisher response to an issue', 'hours'],
  prerun_hours: ['Pre-run check before air', 'hours'], free_cancel_hours: ['Free cancellation after payment', 'hours'], cancel_fee_bp: ['Publisher keeps on late cancellation', 'basis points'],
  processing_fee_bp: ['Card processing estimate', 'basis points'], processing_fee_fixed: ['Card processing fixed part', 'fils'], media_invoice_timing: ['Media invoice issued at', '"payment" or "run"'],
  holidays_AE: ['UAE public holidays', 'list of dates, affects working days'], question_extension_hours: ['Question extension', 'hours'],
}

export function SettingsPage({ isFounder }: { isFounder: boolean }) {
  const { data, error, load } = useLoad<S[]>('/admin/settings')
  const { act, busy, msg } = useAct(load)
  const [edit, setEdit] = useState<Record<string, string>>({}), [open, setOpen] = useState('')
  if (!data) return <Loading error={error} />
  function save(key: string) {
    let value: unknown
    try { value = JSON.parse(edit[key]) } catch { value = edit[key] } // plain text is saved as a string
    act('PUT', `/admin/settings/${key}`, { value }, `${LABEL[key]?.[0] ?? key} saved. It applies from now on; the old value stays in the history.`).then(() => setEdit(({ [key]: _, ...rest }) => rest))
  }
  return (
    <main>
      <div className="page-h"><h1>Settings</h1><span className="muted small">Changes take effect immediately and are kept with their history. Financial settings are the founder's.</span></div>
      {msg}
      <table className="table card"><thead><tr><th>Setting</th><th>Value</th><th>Changed</th><th /></tr></thead>
        <tbody>{data.map(s => { const locked = s.founderOnly && !isFounder; return [
          <tr key={s.key}>
            <td><b>{LABEL[s.key]?.[0] ?? s.key}</b><div className="small muted">{LABEL[s.key]?.[1]}{s.founderOnly ? ' · founder only' : ''}</div></td>
            <td>{s.key in edit ? <input className="search mono" style={{ minWidth: 220 }} aria-label={`New value for ${s.key}`} value={edit[s.key]} onChange={e => setEdit({ ...edit, [s.key]: e.target.value })} />
              : <span className="mono">{JSON.stringify(s.value)}</span>}</td>
            <td className="small muted">{s.history[0].by === 'system' ? 'Initial value' : `${date(s.history[0].from)} · ${s.history[0].by}`}</td>
            <td className="r"><div className="row-flex" style={{ justifyContent: 'flex-end' }}>
              {s.history.length > 1 && <button className="btn" onClick={() => setOpen(open === s.key ? '' : s.key)}>History ({s.history.length})</button>}
              {s.key in edit ? <><button className="btn primary" disabled={busy} onClick={() => save(s.key)}>Save</button><button className="btn" onClick={() => setEdit(({ [s.key]: _, ...r }) => r)}>Cancel</button></>
                : <button className="btn" disabled={locked} title={locked ? 'Only the founder can change this' : undefined} onClick={() => setEdit({ ...edit, [s.key]: JSON.stringify(s.value) })}>Change</button>}
            </div></td></tr>,
          open === s.key && <tr key={`${s.key}-h`}><td colSpan={4}><ul className="timeline">{s.history.map((h, i) => <li key={i}><span className="small num">{when(h.from)}</span>
            <span><span className="mono">{JSON.stringify(h.value)}</span> <span className="small muted">by {h.by}</span></span></li>)}</ul></td></tr>] })}</tbody></table>
      <Staff isFounder={isFounder} />
    </main>
  )
}

type U = { id: string; name: string; email: string; role: string; status: string; twoFactor: boolean; createdAt: string }
function Staff({ isFounder }: { isFounder: boolean }) {
  const { data, load } = useLoad<U[]>('/admin/staff')
  const { act, busy, msg } = useAct(load)
  const [f, setF] = useState({ name: '', email: '', role: 'admin' }), [link, setLink] = useState('')
  return <section className="section">
    <h2 className="sec-h">Nashr team</h2>
    <table className="table card"><tbody>{(data ?? []).map(u => <tr key={u.id}><td><b>{u.name}</b><div className="small muted">{u.email}</div></td><td>{u.role}</td>
      <td className="small">{u.status}{u.twoFactor ? ' · authenticator on' : ''}</td><td className="small num">{date(u.createdAt)}</td></tr>)}</tbody></table>
    <div className="card pad form section" style={{ maxWidth: 560 }}>
      <h3>Invite a team member</h3>
      <div className="field"><label htmlFor="sn">Name</label><input id="sn" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="se">Work email</label><input id="se" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
      <div className="field"><label htmlFor="sr">Role</label><select id="sr" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
        <option value="admin">Admin (operations)</option>{isFounder && <option value="founder">Founder (financial settings too)</option>}</select></div>
      <p className="small muted">They set a password and link an authenticator app from the invite link.</p>
      {msg}{link && <input className="search mono" readOnly value={location.origin + link} onFocus={e => e.target.select()} aria-label="Invite link" />}
      <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || !f.name || !f.email}
        onClick={() => act('POST', '/admin/staff', f, r => { setLink(r.inviteLink); setF({ name: '', email: '', role: 'admin' }); return 'Invite created. Send them the link.' })}>Create invite</button>
    </div>
  </section>
}

type A = { at: string; actor: string; action: string; entity: string; entity_id: string; detail: unknown }
export function AuditPage() {
  const [entity, setEntity] = useState(''), [applied, setApplied] = useState(''), [q, setQ] = useState('')
  const { data, error } = useLoad<A[]>(`/admin/audit${applied ? `?entityId=${applied}` : ''}`, [applied])
  const shown = (data ?? []).filter(a => !q || `${a.actor} ${a.action} ${a.entity}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <main>
      <div className="page-h"><h1>Audit log</h1><span className="muted small">Append-only. Latest 500 entries; filter by record to see its whole history.</span></div>
      <form className="toolbar" onSubmit={e => { e.preventDefault(); setApplied(entity.trim()) }}>
        <input className="search" type="search" aria-label="Filter" placeholder="Filter by actor or action" value={q} onChange={e => setQ(e.target.value)} />
        <input className="search mono" aria-label="Record id" placeholder="Record id (deal, company, user…)" value={entity} onChange={e => setEntity(e.target.value)} />
        <button className="btn">Show</button><div className="spacer" />
        <button type="button" className="btn" disabled={!shown.length} onClick={() => csv('nashr-audit.csv', shown.map(a => ({ ...a, detail: JSON.stringify(a.detail) })))}>CSV</button></form>
      {!data ? <Loading error={error} /> : <table className="table card"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead>
        <tbody>{shown.map((a, i) => <tr key={i}><td className="small num">{when(a.at)}</td><td className="mono">{a.actor}</td><td>{a.action}</td>
          <td className="mono"><a href="/audit" onClick={e => { e.preventDefault(); setEntity(a.entity_id); setApplied(a.entity_id) }}>{a.entity}:{a.entity_id?.slice(0, 8)}</a></td>
          <td className="mono small">{a.detail ? JSON.stringify(a.detail).slice(0, 160) : ''}</td></tr>)}</tbody></table>}
    </main>
  )
}

type Q = { id: string; message: string; status: string; createdAt: string; outlet: string; outletId: string; buyer: string }
type O = { id: string; name: string; nameAr: string | null; channel: string; sectors: string[]; company: string | null; tier: string | null; audience: string | null
  website: string | null; description: string | null; estLow: number | null; estHigh: number | null; onNashr: boolean }

export function DirectoryAdminPage() {
  const quotes = useLoad<Q[]>('/admin/quotes'), outlets = useLoad<O[]>('/admin/outlets')
  const { act, busy, msg } = useAct(() => Promise.all([quotes.load(), outlets.load()]))
  const blank = { id: '', name: '', channel: 'print', sectors: '', tier: '', audience: '', website: '', estLow: '', estHigh: '' }
  const [f, setF] = useState(blank)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const aed = (v: string) => v ? Math.round(Number(v) * 100) : undefined
  function save() {
    const body = JSON.parse(JSON.stringify({ name: f.name, ...(f.id ? {} : { channel: f.channel }), sectors: f.sectors.split(',').map(s => s.trim()).filter(Boolean),
      tier: f.tier || undefined, audience: f.audience || undefined, website: f.website || undefined, estLow: aed(f.estLow), estHigh: aed(f.estHigh) }))
    act(f.id ? 'PUT' : 'POST', f.id ? `/admin/outlets/${f.id}` : '/admin/outlets', body, f.id ? 'Saved.' : 'Added to the directory.').then(() => setF(blank))
  }
  return (
    <main>
      <div className="page-h"><h1>Directory</h1><span className="muted small">Outlets not on Nashr show Nashr's estimate, marked "unconfirmed". Publishers on Nashr manage their own profile.</span></div>
      {msg}
      <h2 className="sec-h">Quote requests</h2>
      {!quotes.data ? <Loading error={quotes.error} /> : !quotes.data.length ? <p className="muted">None yet.</p> : <table className="table card"><tbody>{quotes.data.map(q => <tr key={q.id}>
        <td><b>{q.outlet}</b><div className="small muted">{q.buyer} · {date(q.createdAt)}</div></td><td>{q.message}</td><td className="small">{q.status}</td>
        <td className="r">{q.status === 'open' ? <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/quotes/${q.id}`, { status: 'answered' }, 'Marked answered.')}>Mark answered</button>
          : <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/quotes/${q.id}`, { status: 'open' }, 'Reopened.')}>Reopen</button>}</td></tr>)}</tbody></table>}
      <h2 className="sec-h">Outlets</h2>
      <div className="grid2" style={{ alignItems: 'start' }}>
        {!outlets.data ? <Loading error={outlets.error} /> : <table className="table card"><tbody>{outlets.data.map(o => <tr key={o.id}>
          <td><b>{o.name}</b><div className="small muted">{o.channel}{o.tier ? ` · ${o.tier}` : ''}</div></td>
          <td className="small">{o.onNashr ? <>On Nashr · {o.company}</> : o.estLow ? `Estimate ${money(o.estLow)}–${money(o.estHigh)}` : 'No estimate'}</td>
          <td className="r">{!o.onNashr && <button className="btn" onClick={() => setF({ id: o.id, name: o.name, channel: o.channel, sectors: o.sectors.join(', '), tier: o.tier ?? '', audience: o.audience ?? '',
            website: o.website ?? '', estLow: o.estLow ? String(o.estLow / 100) : '', estHigh: o.estHigh ? String(o.estHigh / 100) : '' })}>Edit</button>}</td></tr>)}</tbody></table>}
        <section className="card pad form">
          <h3>{f.id ? `Edit ${f.name}` : 'Add an outlet not on Nashr'}</h3>
          <div className="field"><label htmlFor="on">Name</label><input id="on" value={f.name} onChange={set('name')} /></div>
          {!f.id && <div className="field"><label htmlFor="oc">Channel</label><select id="oc" value={f.channel} onChange={set('channel')}>{['print', 'digital', 'radio', 'tv', 'podcast'].map(c => <option key={c}>{c}</option>)}</select></div>}
          <div className="field"><label htmlFor="os">Sectors (comma-separated)</label><input id="os" value={f.sectors} onChange={set('sectors')} /></div>
          <div className="grid2"><div className="field"><label htmlFor="ot">Tier</label><input id="ot" value={f.tier} onChange={set('tier')} /></div>
            <div className="field"><label htmlFor="oa">Audience</label><input id="oa" value={f.audience} onChange={set('audience')} /></div></div>
          <div className="field"><label htmlFor="ow">Website</label><input id="ow" placeholder="https://" value={f.website} onChange={set('website')} /></div>
          <div className="grid2"><div className="field"><label htmlFor="ol">Estimate from (AED)</label><input id="ol" inputMode="decimal" value={f.estLow} onChange={set('estLow')} /></div>
            <div className="field"><label htmlFor="oh">Estimate to (AED)</label><input id="oh" inputMode="decimal" value={f.estHigh} onChange={set('estHigh')} /></div></div>
          <div className="row-flex"><button className="btn primary" disabled={busy || !f.name} onClick={save}>{f.id ? 'Save' : 'Add'}</button>{f.id && <button className="btn" onClick={() => setF(blank)}>Cancel</button>}</div>
        </section>
      </div>
    </main>
  )
}
