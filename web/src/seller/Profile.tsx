import { useEffect, useState } from 'react'
import { api } from '../api'
import { PhotoBand } from '../PhotoBand'
import { CoverPicker } from '../CoverPicker'
import { t } from '../i18n'

type Outlet = { id: string; name: string; nameAr: string | null; channel: string; sectors: string[]; description: string | null; website: string | null; audience: string | null; coverUrl: string | null }
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
  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  return (
    <main className="narrow">
      <PhotoBand img="/brand/print-wide.jpg" title={t("Profile")} sub={t("Your payout account, tax details and outlet as buyers see it.")} />
      {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
      <section className="card pad section">
        <h2>{t("Payout account")}</h2>
        {p.company.payoutsEnabled ? <p className="lead">{t("● Verified. Released money is transferred to it automatically.")}</p> : <>
          <p>{t("Connect the bank account Nashr pays you into. Verification is done by the payment provider; Nashr never sees your bank login.")}</p>
          <button className="btn primary" disabled={busy} onClick={() => act('POST', '/seller/payouts/connect', {}, t("Payout account verified."))}>{t("Connect payout account")}</button></>}
      </section>
      <section className="card pad section form">
        <h2>{t("Tax and invoices")}</h2>
        <label className="check"><input type="checkbox" checked={tax.vatRegistered} onChange={e => setTax({ ...tax, vatRegistered: e.target.checked })} />{t(" We are VAT-registered (5% VAT is added for buyers)")}</label>
        <div className="field"><label htmlFor="trn">{t("TRN (15 digits)")}</label><input id="trn" inputMode="numeric" maxLength={15} value={tax.trn} onChange={e => setTax({ ...tax, trn: e.target.value.replace(/\D/g, '') })} /></div>
        <div className="field"><label htmlFor="im">{t("Tax invoices to buyers")}</label><select id="im" value={tax.invoiceMode} onChange={e => setTax({ ...tax, invoiceMode: e.target.value })}>
          <option value="generate">{t("Nashr issues them in our name and TRN")}</option><option value="upload">{t("We upload our own")}</option></select></div>
        <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => act('PUT', '/seller/company', { ...tax, trn: tax.trn || undefined }, t("Tax details saved."))}>{t("Save")}</button>
      </section>
      {p.outlets.map(o => <OutletForm key={o.id} o={o} busy={busy} onSave={b => act('PUT', `/seller/outlets/${o.id}`, b, t('{name} saved.', { name: o.name }))} />)}
      <OutletForm busy={busy} onSave={b => act('POST', '/seller/outlets', b, t("Outlet added."))} />
    </main>
  )
}

function OutletForm({ o, busy, onSave }: { o?: Outlet; busy: boolean; onSave: (b: object) => void }) {
  const [f, setF] = useState({ name: o?.name ?? '', nameAr: o?.nameAr ?? '', channel: o?.channel ?? 'radio', sectors: o?.sectors.join(', ') ?? '',
    description: o?.description ?? '', website: o?.website ?? '', audience: o?.audience ?? '' })
  const [open, setOpen] = useState(!!o)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  if (!open) return <button className="btn section" onClick={() => setOpen(true)}>{t("Add another outlet")}</button>
  const body = { name: f.name, ...(o ? {} : { channel: f.channel }), sectors: f.sectors.split(',').map(s => s.trim()).filter(Boolean),
    ...(f.nameAr ? { nameAr: f.nameAr } : {}), ...(f.description ? { description: f.description } : {}), ...(f.website ? { website: f.website } : {}), ...(f.audience ? { audience: f.audience } : {}) }
  const id = o?.id ?? 'new'
  return <section className="card pad section form">
    <h2>{o ? o.name : t('New outlet')}</h2>
    {o && <CoverPicker url={o.coverUrl ?? null} channel={o.channel} endpoint={`/seller/outlets/${o.id}/cover`} />}
    <div className="grid2">
      <div className="field"><label htmlFor={`n-${id}`}>{t("Name")}</label><input dir="auto" id={`n-${id}`} value={f.name} onChange={set('name')} /></div>
      <div className="field"><label htmlFor={`a-${id}`}>{t("Name in Arabic")}</label><input id={`a-${id}`} dir="rtl" lang="ar" value={f.nameAr} onChange={set('nameAr')} /></div>
    </div>
    {!o && <div className="field"><label htmlFor={`c-${id}`}>{t("Channel")}</label><select id={`c-${id}`} value={f.channel} onChange={set('channel')}>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div>}
    <div className="field"><label htmlFor={`s-${id}`}>{t("Sectors you accept (comma-separated; add your own)")}</label><input dir="auto" id={`s-${id}`} value={f.sectors} onChange={set('sectors')} placeholder={t("Banking, Retail, Real estate")} /></div>
    <div className="field"><label htmlFor={`au-${id}`}>{t("Audience")}</label><input dir="auto" id={`au-${id}`} value={f.audience} onChange={set('audience')} placeholder={t("Business commuters, 25-45")} /></div>
    <div className="field"><label htmlFor={`d-${id}`}>{t("Description")}</label><textarea dir="auto" id={`d-${id}`} rows={3} value={f.description} onChange={set('description')} /></div>
    <div className="field"><label htmlFor={`w-${id}`}>{t("Website")}</label><input dir="auto" id={`w-${id}`} placeholder="https://" value={f.website} onChange={set('website')} /></div>
    <span className="small muted">{t("Buyers see this in the directory. Emails and phone numbers are not allowed.")}</span>
    <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || !f.name} onClick={() => onSave(body)}>{o ? t("Save") : t('Add outlet')}</button>
  </section>
}
