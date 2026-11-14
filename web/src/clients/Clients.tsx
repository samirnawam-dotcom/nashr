import { navigate } from '../nav'
import { tm } from '../i18n-server'
import { useEffect, useState } from 'react'
import { api, type Client } from '../api'
import { dayLabel, money } from '../format'
import { dubai } from '../calendar/layout'
import { Status } from '../bookings/Bookings'
import { IndustryPick } from '../IndustryPick'
import { LogoPicker, OutletMark } from '../LogoPicker'
import { DOC_TYPE } from '../documents/Documents'
import '../directory/directory.css'
import { PhotoBand } from '../PhotoBand'
import { isAr, t } from '../i18n'

const day = (iso: string) => dayLabel(dubai(iso).date, { day: 'numeric', month: 'short', year: 'numeric' })

// owner's buyer-side fixes: no budget here; budgets live on campaigns only, so there is never a second one to keep in step
type Form = { name: string; industry: string; trn: string; billingEmail: string; address: string }
const blank: Form = { name: '', industry: '', trn: '', billingEmail: '', address: '' }
const bodyOf = (f: Form) => ({ name: f.name, industry: f.industry, trn: f.trn, billingEmail: f.billingEmail.trim(), address: f.address })
const emailOk = (e: string) => !e.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())

/** The client's details: name, industry (brand safety), TRN, billing email and address (shown on documents). The logo is set on the client's page. */
function ClientForm({ form, setForm, busy, error, onSave, onCancel, saveLabel }: { form: Form; setForm: (f: Form) => void; busy: boolean; error: string
  onSave: () => void; onCancel: () => void; saveLabel: string }) {
  return <section className="card pad form" style={{ maxWidth: 620, marginBottom: 20 }}>
    <div className="grid2">
      <div className="field"><label htmlFor="cl-n">{t('Client name')} <span className="req">*</span></label><input id="cl-n" dir="auto" maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
      <div className="field"><label htmlFor="cl-i">{t('Industry (optional)')}</label><IndustryPick id="cl-i" value={form.industry} onChange={v => setForm({ ...form, industry: v })} /></div>
      <div className="field"><label htmlFor="cl-t">{t('TRN (optional)')}</label><input id="cl-t" inputMode="numeric" dir="ltr" maxLength={20} value={form.trn} onChange={e => setForm({ ...form, trn: e.target.value })} /></div>
      <div className="field"><label htmlFor="cl-e">{t('Billing email (optional)')}</label><input id="cl-e" type="email" dir="ltr" maxLength={200} value={form.billingEmail} onChange={e => setForm({ ...form, billingEmail: e.target.value })} />
        <span className="small muted">{t("For the client's receipts and report. Only your team sees it.")}</span>{!emailOk(form.billingEmail) && <span className="small error">{t('This email address is not complete.')}</span>}</div>
    </div>
    <div className="field"><label htmlFor="cl-a">{t('Address (optional)')}</label><textarea id="cl-a" rows={2} dir="auto" maxLength={500} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
    <p className="small muted">{t('Outlets that do not accept the client\'s industry, or refuse its name, are blocked before you bid. The client\'s name and TRN appear on your orders, receipts and invoices for its bookings.')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="row-flex"><button className="btn primary" disabled={busy || !form.name.trim() || !emailOk(form.billingEmail)} onClick={onSave}>{saveLabel}</button>
      <button className="btn" onClick={onCancel}>{t('Cancel')}</button></div>
  </section>
}

export function ClientsPage() {
  const [list, setList] = useState<Client[] | null>(null), [error, setError] = useState(''), [form, setForm] = useState<Form | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => { api<Client[]>('/clients').then(setList, e => setError(e.message)) }, [])
  async function create() {
    setBusy(true); setError('')
    try { const { id } = await api<{ id: string }>('/clients', { method: 'POST', body: bodyOf(form!) }); navigate(`/clients/${id}`) }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <main>
      <PhotoBand img="/brand/desk-wide.jpg" title={t('Clients')} sub={t("Optional: book for each client and send it its own receipts and report. Picking a client is never required.")}>
        <button className="btn primary" onClick={() => setForm(blank)}>{t('Add a client')}</button>
      </PhotoBand>
      {form && <ClientForm form={form} setForm={setForm} busy={busy} error={error} onSave={create} onCancel={() => setForm(null)} saveLabel={t('Add client')} />}
      {!form && error && <p className="error">{error}</p>}
      {list && !list.length && !form && <p className="muted empty">{t('No clients yet. Add one, then choose it when you bid or book, so its spend, receipts and report stay together.')}</p>}
      {list && list.length > 0 && <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Client')}</th><th className="r">{t('Bookings')}</th>
        <th className="r">{t('Committed')}</th><th>{t('Status')}</th></tr></thead>
        <tbody>{list.map(c => <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)}>
          <td><span className="cl-name"><OutletMark name={c.name} url={c.logoUrl} size={32} /><span><a href={`/clients/${c.id}`} onClick={e => e.stopPropagation()}><b dir="auto">{c.name}</b></a>{c.industry && <div className="small muted">{t(c.industry)}</div>}</span></span></td>
          <td className="r num">{c.bookings}</td><td className="r num">{money(c.committed)}</td>
          <td className="small">{c.status === 'active' ? t('Active') : t('Archived')}</td></tr>)}</tbody></table></div>}
    </main>
  )
}

type Detail = Client & { bookingsList: { id: string; ref: string; status: string; price: number; currency: string; label: string; startsAt: string; outlet: string; channel: string }[]
  documents: { id: string; type: string; number: string; total: number; currency: string; issuedAt: string; dealRef: string }[]
  campaigns: { id: string; name: string; budget: number; status: string }[] }

export function ClientPage({ id }: { id: string }) {
  const [c, setC] = useState<Detail | null>(null), [error, setError] = useState(''), [form, setForm] = useState<Form | null>(null), [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const load = () => api<Detail>(`/clients/${id}`).then(setC, e => setError(e.message))
  useEffect(() => { load() }, [id])
  async function save(body: object, done: string) {
    setBusy(true); setError(''); setNote('')
    try { await api(`/clients/${id}`, { method: 'PUT', body }); setForm(null); setNote(done); await load() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  if (!c) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  return (
    <main className="narrow wide">
      <p className="small"><a href="/clients">{t('Clients')}</a> {isAr ? '‹' : '›'} <bdi>{c.name}</bdi></p>
      <div className="profile-h"><div><h1 dir="auto">{c.name}</h1>
          <p className="muted">{[c.industry && t(c.industry), c.trn && `${t('TRN')} ${c.trn}`, c.billingEmail, c.status === 'archived' && t('Archived')].filter(Boolean).join(' · ') || t('No industry set')}</p></div>
        <div className="spacer" />
        <a className="btn" href={`/api/clients/${c.id}/report`}>{t('Report (CSV)')}</a>
        <a className="btn" href={`/results?client=${c.id}`}>{t('Results')}</a>
        {!form && <button className="btn" onClick={() => setForm({ name: c.name, industry: c.industry ?? '', trn: c.trn ?? '', billingEmail: c.billingEmail ?? '', address: c.address ?? '' })}>{t('Edit')}</button>}
        {c.status === 'active' ? <button className="btn" disabled={busy} onClick={() => save({ status: 'archived' }, t('Archived. Its bookings and documents stay.'))}>{t('Archive')}</button>
          : <button className="btn" disabled={busy} onClick={() => save({ status: 'active' }, t('Active again.'))}>{t('Make active')}</button>}
        {c.status === 'active' && <a className="btn primary" href="/calendar">{t('Book slots')}</a>}</div>
      {form && <><section className="card pad" style={{ maxWidth: 620, marginBottom: 12 }}><LogoPicker name={c.name} url={c.logoUrl} endpoint={`/clients/${c.id}/logo`} saved={t('Logo saved.')} /></section>
        <ClientForm form={form} setForm={setForm} busy={busy} error={error} onSave={() => save(bodyOf(form), t('Saved.'))} onCancel={() => setForm(null)} saveLabel={t('Save')} /></>}
      {!form && error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
      <dl className="kpis">
        <div className="card"><dt>{t('Committed')}</dt><dd className="num">{money(c.committed)}</dd></div>
        <div className="card"><dt>{t('Awaiting publishers')}</dt><dd className="num">{money(c.pending)}</dd></div>
        <div className="card"><dt>{t('Paid')}</dt><dd className="num">{money(c.paid)}</dd></div>
      </dl>
      <p className="small muted">{t('Prices excl. VAT. Budgets are set on campaigns.')}</p>

      {c.campaigns.length > 0 && <><h2 className="sec-h">{t('Campaigns')}</h2>
        <ul>{c.campaigns.map(x => <li key={x.id}><a href={`/campaigns/${x.id}`}>{x.name}</a> <span className="small muted">· {x.budget ? `${money(x.budget)} · ` : ''}{x.status === 'active' ? t('Active') : t('Completed')}</span></li>)}</ul></>}

      <h2 className="sec-h">{t('Bookings')}</h2>
      {!c.bookingsList.length ? <p className="muted">{t('Nothing booked for this client yet. Choose it in the bid panel when you bid or book.')}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Order')}</th><th>{t('Listing')}</th><th>{t('Runs')}</th><th className="r">{t('Price')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>{c.bookingsList.map(b => <tr key={b.id} onClick={() => navigate(`/bookings/${b.id}`)}>
            <td className="num">{b.ref}</td><td><b>{b.outlet}</b> · {tm(b.label)}</td><td className="num">{dayLabel(dubai(b.startsAt).date)}</td>
            <td className="r num">{money(b.price, b.currency)}</td><td><Status s={b.status} /></td></tr>)}</tbody></table></div>}

      <h2 className="sec-h">{t('Receipts and invoices')}</h2>
      {!c.documents.length ? <p className="muted">{t('Documents appear here once a booking for this client is accepted and paid.')}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Document')}</th><th>{t('Number')}</th><th>{t('Order')}</th><th>{t('Date')}</th><th className="r">{t('Total')}</th><th><span className="sr-only">{t('PDF')}</span></th></tr></thead>
          <tbody>{c.documents.map(r => <tr key={r.id} onClick={() => navigate(`/documents/${r.id}`)}>
            <td>{DOC_TYPE[r.type]}</td><td className="num">{r.number}</td><td className="num">{r.dealRef}</td><td className="num">{day(r.issuedAt)}</td>
            <td className="r num">{money(r.total, r.currency)}</td>
            <td className="r"><a className="small" href={`/api/documents/${r.id}/pdf${isAr ? '?lang=ar' : ''}`} onClick={e => e.stopPropagation()} aria-label={t('PDF of {number}', { number: r.number })}>{t('PDF')}</a></td></tr>)}</tbody></table></div>}
    </main>
  )
}
