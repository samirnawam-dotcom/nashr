import { useEffect, useState } from 'react'
import { api } from '../api'

type Outlet = { id: string; name: string; nameAr: string | null; channel: string; sectors: string[]; description: string | null; website: string | null; audience: string | null }
type P = { company: { name: string; trn: string | null; vatRegistered: boolean; invoiceMode: string; payoutsEnabled: boolean }; outlets: Outlet[] }
const CHANNELS = [['radio', 'Radio'], ['tv', 'TV'], ['print', 'Print'], ['digital', 'Digital'], ['podcast', 'Podcast']]

export function ProfilePage() {
  const [p, setP] = useState<P | null>(null), [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [tax, setTax] = useState({ trn: '', vatRegistered: false, invoiceMode: 'generate' })
  const load = () => api<P>('/seller/profile').then(x => { setP(x); setTax({ trn: x.company.trn ?? '', vatRegistered: x.company.vatRegistered, invoiceMode: x.company.invoiceMode }) }, e => setError(e.message))
  useEffect(() => { load() }, [])
  async function act(method: string, path: string, body: object, done: string) {
    setBusy(true); setError(''); setNote('')
    try { await api(path, { method, body }); setNote(done); await load() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</main>
  return (
    <main className="narrow">
      <h1>Profile</h1>
      {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
      <section className="card pad section">
        <h2>Payout account</h2>
        {p.company.payoutsEnabled ? <p className="lead">● Verified. Released money is transferred to it automatically.</p> : <>
          <p>Connect the bank account Nashr pays you into. Verification is done by the payment provider; Nashr never sees your bank login.</p>
          <button className="btn primary" disabled={busy} onClick={() => act('POST', '/seller/payouts/connect', {}, 'Payout account verified.')}>Connect payout account</button></>}
      </section>
      <section className="card pad section form">
        <h2>Tax and invoices</h2>
        <label className="check"><input type="checkbox" checked={tax.vatRegistered} onChange={e => setTax({ ...tax, vatRegistered: e.target.checked })} /> We are VAT-registered (5% VAT is added for buyers)</label>
        <div className="field"><label htmlFor="trn">TRN (15 digits)</label><input id="trn" inputMode="numeric" maxLength={15} value={tax.trn} onChange={e => setTax({ ...tax, trn: e.target.value.replace(/\D/g, '') })} /></div>
        <div className="field"><label htmlFor="im">Tax invoices to buyers</label><select id="im" value={tax.invoiceMode} onChange={e => setTax({ ...tax, invoiceMode: e.target.value })}>
          <option value="generate">Nashr issues them in our name and TRN</option><option value="upload">We upload our own</option></select></div>
        <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => act('PUT', '/seller/company', { ...tax, trn: tax.trn || undefined }, 'Tax details saved.')}>Save</button>
      </section>
      {p.outlets.map(o => <OutletForm key={o.id} o={o} busy={busy} onSave={b => act('PUT', `/seller/outlets/${o.id}`, b, `${o.name} saved.`)} />)}
      <OutletForm busy={busy} onSave={b => act('POST', '/seller/outlets', b, 'Outlet added.')} />
    </main>
  )
}

function OutletForm({ o, busy, onSave }: { o?: Outlet; busy: boolean; onSave: (b: object) => void }) {
  const [f, setF] = useState({ name: o?.name ?? '', nameAr: o?.nameAr ?? '', channel: o?.channel ?? 'radio', sectors: o?.sectors.join(', ') ?? '',
    description: o?.description ?? '', website: o?.website ?? '', audience: o?.audience ?? '' })
  const [open, setOpen] = useState(!!o)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  if (!open) return <button className="btn section" onClick={() => setOpen(true)}>Add another outlet</button>
  const body = { name: f.name, ...(o ? {} : { channel: f.channel }), sectors: f.sectors.split(',').map(s => s.trim()).filter(Boolean),
    ...(f.nameAr ? { nameAr: f.nameAr } : {}), ...(f.description ? { description: f.description } : {}), ...(f.website ? { website: f.website } : {}), ...(f.audience ? { audience: f.audience } : {}) }
  const id = o?.id ?? 'new'
  return <section className="card pad section form">
    <h2>{o ? o.name : 'New outlet'}</h2>
    <div className="grid2">
      <div className="field"><label htmlFor={`n-${id}`}>Name</label><input id={`n-${id}`} value={f.name} onChange={set('name')} /></div>
      <div className="field"><label htmlFor={`a-${id}`}>Name in Arabic</label><input id={`a-${id}`} dir="rtl" lang="ar" value={f.nameAr} onChange={set('nameAr')} /></div>
    </div>
    {!o && <div className="field"><label htmlFor={`c-${id}`}>Channel</label><select id={`c-${id}`} value={f.channel} onChange={set('channel')}>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
    <div className="field"><label htmlFor={`s-${id}`}>Sectors you accept (comma-separated; add your own)</label><input id={`s-${id}`} value={f.sectors} onChange={set('sectors')} placeholder="Banking, Retail, Real estate" /></div>
    <div className="field"><label htmlFor={`au-${id}`}>Audience</label><input id={`au-${id}`} value={f.audience} onChange={set('audience')} placeholder="Business commuters, 25-45" /></div>
    <div className="field"><label htmlFor={`d-${id}`}>Description</label><textarea id={`d-${id}`} rows={3} value={f.description} onChange={set('description')} /></div>
    <div className="field"><label htmlFor={`w-${id}`}>Website</label><input id={`w-${id}`} placeholder="https://" value={f.website} onChange={set('website')} /></div>
    <span className="small muted">Buyers see this in the directory. Emails and phone numbers are not allowed.</span>
    <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || !f.name} onClick={() => onSave(body)}>{o ? 'Save' : 'Add outlet'}</button>
  </section>
}
