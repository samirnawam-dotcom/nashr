import { navigate } from '../nav'
import { tm } from '../i18n-server'
import { useEffect, useState } from 'react'
import { api, type Client } from '../api'
import { dayLabel, money } from '../format'
import { dubai } from '../calendar/layout'
import { Status } from '../bookings/Bookings'
import { INDUSTRIES } from '../calendar/BidDrawer'
import { DOC_TYPE } from '../documents/Documents'
import '../directory/directory.css'
import { PhotoBand } from '../PhotoBand'
import { isAr, t } from '../i18n'

const toFils = (aed: string) => Math.round(Number(aed.replace(/,/g, '')) * 100)
const pct = (n: number, of: number) => `${Math.min(100, of ? (n / of) * 100 : 0)}%`
const Bar = ({ c }: { c: Client }) => c.budget ? <div className="bar" title={t('Committed and pending against the budget')}>
  <i className="c" style={{ width: pct(c.committed, c.budget) }} /><i className="p" style={{ width: pct(c.pending, c.budget) }} /></div> : null
const day = (iso: string) => dayLabel(dubai(iso).date, { day: 'numeric', month: 'short', year: 'numeric' })

type Form = { name: string; industry: string; trn: string; address: string; budget: string; budgetStop: boolean }
const blank: Form = { name: '', industry: '', trn: '', address: '', budget: '', budgetStop: false }
const bodyOf = (f: Form) => ({ name: f.name, industry: f.industry, trn: f.trn, address: f.address, budget: f.budget ? toFils(f.budget) : null, budgetStop: f.budgetStop })

/** The client's details: name, industry (brand safety), TRN and address (shown on documents), and an optional budget. */
function ClientForm({ form, setForm, busy, error, onSave, onCancel, saveLabel }: { form: Form; setForm: (f: Form) => void; busy: boolean; error: string
  onSave: () => void; onCancel: () => void; saveLabel: string }) {
  return <section className="card pad form" style={{ maxWidth: 620, marginBottom: 20 }}>
    <div className="grid2">
      <div className="field"><label htmlFor="cl-n">{t('Client name')}</label><input id="cl-n" dir="auto" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
      <div className="field"><label htmlFor="cl-i">{t('Industry')}</label><select id="cl-i" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })}>
        <option value="">{t('Not set')}</option>{INDUSTRIES.map(i => <option key={i} value={i}>{t(i)}</option>)}</select></div>
      <div className="field"><label htmlFor="cl-t">{t('TRN (optional)')}</label><input id="cl-t" inputMode="numeric" dir="ltr" value={form.trn} onChange={e => setForm({ ...form, trn: e.target.value })} /></div>
      <div className="field"><label htmlFor="cl-b">{t('Budget (AED, excl. VAT, optional)')}</label><input id="cl-b" inputMode="decimal" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} /></div>
    </div>
    <div className="field"><label htmlFor="cl-a">{t('Address (optional)')}</label><textarea id="cl-a" rows={2} dir="auto" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
    {form.budget && <label className="check"><input type="checkbox" checked={form.budgetStop} onChange={e => setForm({ ...form, budgetStop: e.target.checked })} /> {t('Stop bids and bookings that would go over this budget')}</label>}
    <p className="small muted">{t('Outlets that do not accept the client\'s industry, or refuse its name, are blocked before you bid. The client\'s name and TRN appear on your orders, receipts and invoices for its bookings.')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="row-flex"><button className="btn primary" disabled={busy || !form.name.trim() || (!!form.budget && !(toFils(form.budget) > 0))} onClick={onSave}>{saveLabel}</button>
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
      <PhotoBand img="/brand/desk-wide.jpg" title={t('Clients')} sub={t('For agencies: book for each client, keep to its budget, and send it its own receipts and report.')}>
        <button className="btn primary" onClick={() => setForm(blank)}>{t('Add a client')}</button>
      </PhotoBand>
      {form && <ClientForm form={form} setForm={setForm} busy={busy} error={error} onSave={create} onCancel={() => setForm(null)} saveLabel={t('Add client')} />}
      {!form && error && <p className="error">{error}</p>}
      {list && !list.length && !form && <p className="muted empty">{t('No clients yet. Add one, then choose it when you bid or book, so its spend, receipts and report stay together.')}</p>}
      {list && list.length > 0 && <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Client')}</th><th className="r">{t('Bookings')}</th>
        <th className="r">{t('Budget')}</th><th className="r">{t('Committed')}</th><th style={{ width: 180 }} /><th>{t('Status')}</th></tr></thead>
        <tbody>{list.map(c => <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)}>
          <td><a href={`/clients/${c.id}`} onClick={e => e.stopPropagation()}><b dir="auto">{c.name}</b></a>{c.industry && <div className="small muted">{t(c.industry)}</div>}</td>
          <td className="r num">{c.bookings}</td><td className="r num">{c.budget ? money(c.budget) : '—'}</td><td className="r num">{money(c.committed)}</td>
          <td><Bar c={c} /></td><td className="small">{c.status === 'active' ? t('Active') : t('Archived')}</td></tr>)}</tbody></table></div>}
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
          <p className="muted">{[c.industry && t(c.industry), c.trn && `${t('TRN')} ${c.trn}`, c.status === 'archived' && t('Archived')].filter(Boolean).join(' · ') || t('No industry set')}</p></div>
        <div className="spacer" />
        <a className="btn" href={`/api/clients/${c.id}/report`}>{t('Report (CSV)')}</a>
        <a className="btn" href={`/results?client=${c.id}`}>{t('Results')}</a>
        {!form && <button className="btn" onClick={() => setForm({ name: c.name, industry: c.industry ?? '', trn: c.trn ?? '', address: c.address ?? '', budget: c.budget ? String(c.budget / 100) : '', budgetStop: c.budgetStop })}>{t('Edit')}</button>}
        {c.status === 'active' ? <button className="btn" disabled={busy} onClick={() => save({ status: 'archived' }, t('Archived. Its bookings and documents stay.'))}>{t('Archive')}</button>
          : <button className="btn" disabled={busy} onClick={() => save({ status: 'active' }, t('Active again.'))}>{t('Make active')}</button>}
        {c.status === 'active' && <a className="btn primary" href="/calendar">{t('Book slots')}</a>}</div>
      {form && <ClientForm form={form} setForm={setForm} busy={busy} error={error} onSave={() => save(bodyOf(form), t('Saved.'))} onCancel={() => setForm(null)} saveLabel={t('Save')} />}
      {!form && error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
      <dl className="kpis">
        <div className="card"><dt>{t('Budget')}</dt><dd className="num">{c.budget ? money(c.budget) : '—'}</dd></div>
        <div className="card"><dt>{t('Committed')}</dt><dd className="num">{money(c.committed)}</dd></div>
        <div className="card"><dt>{t('Awaiting publishers')}</dt><dd className="num">{money(c.pending)}</dd></div>
        <div className="card"><dt>{t('Remaining')}</dt><dd className="num" style={{ color: (c.remaining ?? 0) < 0 ? 'var(--red)' : undefined }}>{c.remaining == null ? '—' : money(c.remaining)}</dd></div>
      </dl>
      <Bar c={c} />
      <p className="small muted">{c.budget ? (c.budgetStop ? t('Prices excl. VAT. Bids and bookings that would go over the budget are refused.') : t('Prices excl. VAT. The budget is a guide: Nashr shows it when you bid but does not stop you.'))
        : t('Prices excl. VAT. Add a budget to track spend against it.')}</p>

      {c.campaigns.length > 0 && <><h2 className="sec-h">{t('Campaigns')}</h2>
        <ul>{c.campaigns.map(x => <li key={x.id}><a href={`/campaigns/${x.id}`}>{x.name}</a> <span className="small muted">· {money(x.budget)} · {x.status === 'active' ? t('Active') : t('Completed')}</span></li>)}</ul></>}

      <h2 className="sec-h">{t('Bookings')}</h2>
      {!c.bookingsList.length ? <p className="muted">{t('Nothing booked for this client yet. Choose it in the bid panel when you bid or book.')}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Order')}</th><th>{t('Slot')}</th><th>{t('Airs')}</th><th className="r">{t('Price')}</th><th>{t('Status')}</th></tr></thead>
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
