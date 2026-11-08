import { useEffect, useState } from 'react'
import { api, upload } from '../api'
import { PhotoBand } from '../PhotoBand'
import { CoverPicker } from '../CoverPicker'
import { t } from '../i18n'
import { LogoPicker } from '../LogoPicker'
import { CompanyProfileEditor } from '../CompanyCard'
import { AudiencePicker } from '../Audiences'
import { INDUSTRIES } from '../calendar/BidDrawer'

type Outlet = { id: string; name: string; nameAr: string | null; channel: string; sectors: string[]; description: string | null; website: string | null; audience: string | null; coverUrl: string | null; logoUrl: string | null
  audiences: string[]; blockedIndustries: string[]; blockedAdvertisers: string[]; reach: number | null }
type P = { company: { name: string; trn: string | null; vatRegistered: boolean; invoiceMode: string; payoutsEnabled: boolean; rateCard: { fileId: string; name: string } | null }; outlets: Outlet[] }
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
      <CompanyProfileEditor audience="buyers" />
      <RateCard card={p.company.rateCard} onChange={load} />
      {p.outlets.map(o => <OutletForm key={o.id} o={o} busy={busy} onSave={b => act('PUT', `/seller/outlets/${o.id}`, b, t('{name} saved.', { name: o.name }))} />)}
      <OutletForm key={p.outlets.length} first={!p.outlets.length} busy={busy} onSave={b => act('POST', '/seller/outlets', b, t("Outlet added."))} />
    </main>
  )
}

function OutletForm({ o, first, busy, onSave }: { o?: Outlet; first?: boolean; busy: boolean; onSave: (b: object) => void }) {
  const [f, setF] = useState({ name: o?.name ?? '', nameAr: o?.nameAr ?? '', channel: o?.channel ?? 'radio', sectors: o?.sectors.join(', ') ?? '',
    description: o?.description ?? '', website: o?.website ?? '', audience: o?.audience ?? '', reach: o?.reach ? String(o.reach) : '', blockedAdvertisers: o?.blockedAdvertisers.join(', ') ?? '' })
  const [audiences, setAudiences] = useState<string[]>(o?.audiences ?? []), [blocked, setBlocked] = useState<string[]>(o?.blockedIndustries ?? [])
  const [open, setOpen] = useState(!!o || !!first) // a new publisher starts with the form open
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  if (!open) return <button className="btn section" onClick={() => setOpen(true)}>{t("Add another outlet")}</button>
  const body = { name: f.name, ...(o ? {} : { channel: f.channel }), sectors: f.sectors.split(',').map(s => s.trim()).filter(Boolean),
    ...(f.nameAr ? { nameAr: f.nameAr } : {}), ...(f.description ? { description: f.description } : {}), ...(f.website ? { website: f.website } : {}), ...(f.audience ? { audience: f.audience } : {}),
    audiences, blockedIndustries: blocked, blockedAdvertisers: [...new Set(f.blockedAdvertisers.split(',').map(x => x.trim()).filter(x => x.length > 1))],
    ...(Number(f.reach) > 0 ? { reach: Math.round(Number(f.reach)) } : {}) }
  const id = o?.id ?? 'new'
  return <section className="card pad section form">
    <h2>{o ? o.name : first ? t('Your outlet') : t('New outlet')}</h2>
    {first && <p className="small muted">{t('The station, channel, publication or show buyers book with. You can add more later.')}</p>}
    {o && <LogoPicker name={o.name} url={o.logoUrl ?? null} endpoint={`/seller/outlets/${o.id}/logo`} />}
    {o && <CoverPicker url={o.coverUrl ?? null} channel={o.channel} endpoint={`/seller/outlets/${o.id}/cover`} />}
    <div className="grid2">
      <div className="field"><label htmlFor={`n-${id}`}>{t("Name")}</label><input dir="auto" id={`n-${id}`} value={f.name} onChange={set('name')} /></div>
      <div className="field"><label htmlFor={`a-${id}`}>{t("Name in Arabic")}</label><input id={`a-${id}`} dir="rtl" lang="ar" value={f.nameAr} onChange={set('nameAr')} /></div>
    </div>
    {!o && <div className="field"><label htmlFor={`c-${id}`}>{t("Channel")}</label><select id={`c-${id}`} value={f.channel} onChange={set('channel')}>{CHANNELS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div>}
    <div className="field"><label htmlFor={`s-${id}`}>{t("Sectors you accept (comma-separated; add your own)")}</label><input dir="auto" id={`s-${id}`} value={f.sectors} onChange={set('sectors')} placeholder={t("Banking, Retail, Real estate")} /></div>
    <div className="field"><label htmlFor={`au-${id}`}>{t("Audience")}</label><input dir="auto" id={`au-${id}`} value={f.audience} onChange={set('audience')} placeholder={t("Business commuters, 25-45")} /></div>
    <div className="field"><span className="small muted">{t('Who it reaches (buyers filter by these)')}</span><AudiencePicker idPrefix={`aud-${id}`} value={audiences} onChange={setAudiences} /></div>
    <div className="field"><label htmlFor={`r-${id}`}>{t('People reached per airing or edition (your estimate, optional)')}</label><input id={`r-${id}`} inputMode="numeric" value={f.reach} onChange={e => setF({ ...f, reach: e.target.value.replace(/\D/g, '') })} placeholder="120000" /></div>
    <details className="pl-more" open={blocked.length > 0 || !!f.blockedAdvertisers}><summary>{t('Brand safety')}</summary>
      <span className="small muted">{t("Buyers in these industries can't bid on or book this outlet. They see it before they try.")}</span>
      <div className="aud-pick" role="group" aria-label={t('Industries you do not accept')}>{INDUSTRIES.filter(i => i !== 'Other').map(i => { const on = blocked.includes(i)
        return <label key={i} className={`aud-chip ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => setBlocked(on ? blocked.filter(x => x !== i) : [...blocked, i])} />{t(i)}</label> })}</div>
      <div className="field"><label htmlFor={`ba-${id}`}>{t('Advertisers you will not run (comma-separated, e.g. competitors)')}</label><input dir="auto" id={`ba-${id}`} value={f.blockedAdvertisers} onChange={set('blockedAdvertisers')} /></div>
    </details>
    <div className="field"><label htmlFor={`d-${id}`}>{t("Description")}</label><textarea dir="auto" id={`d-${id}`} rows={3} value={f.description} onChange={set('description')} /></div>
    <div className="field"><label htmlFor={`w-${id}`}>{t("Website")}</label><input dir="auto" id={`w-${id}`} placeholder="https://" value={f.website} onChange={set('website')} /></div>
    <span className="small muted">{t("Buyers see this in the directory. Emails and phone numbers are not allowed.")}</span>
    <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || !f.name} onClick={() => onSave(body)}>{o ? t("Save") : t('Add outlet')}</button>
  </section>
}

/** The rate card the publisher shares with Nashr: any file (PDF, spreadsheet or image), replaceable at any time. Buyers don't see it. */
function RateCard({ card, onChange }: { card: { fileId: string; name: string } | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('')
  async function pick(file: File) {
    setBusy(true); setError(''); setNote('')
    try { const f = await upload(file); await api('/seller/rate-card', { method: 'PUT', body: { fileId: f.id } }); setNote(t('Rate card saved. Nashr uses it to set up your placements.')); onChange() }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError(''); setNote('')
    try { await api('/seller/rate-card', { method: 'DELETE' }); setNote(t('Rate card removed.')); onChange() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="card pad section">
    <h2>{t('Rate card')}</h2>
    <p className="muted">{t('Share your current rate card so Nashr can help set up your placements and prices. Only Nashr sees it.')}</p>
    {card ? <div className="file-row"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg>
      <a href={`/api/files/${card.fileId}`}><bdi>{card.name}</bdi></a><span className="spacer" />
      <label className={`btn ${busy ? 'disabled' : ''}`}><input type="file" className="visually-hidden" disabled={busy} accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg" onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />{t('Replace')}</label>
      <button className="btn" disabled={busy} onClick={remove}>{t('Remove')}</button></div>
    : <label className={`dropzone ${busy ? 'disabled' : ''}`}><input type="file" className="visually-hidden" disabled={busy} accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg" onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />
        <b>{busy ? t('Uploading…') : t('Upload your rate card')}</b><span className="small muted">{t('PDF, spreadsheet or image')}</span></label>}
    {error && <p className="error small" role="alert">{error}</p>}{note && <p className="ok small" role="status">{note}</p>}
  </section>
}
