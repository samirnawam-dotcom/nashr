import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel } from '../format'
import { dubai } from '../calendar/layout'
import '../messages/messages.css'
import { PhotoBand } from '../PhotoBand'
import { t } from '../i18n'
import { CompanyProfileEditor } from '../CompanyCard'

const date = (iso: string) => dayLabel(dubai(iso).date, { day: 'numeric', month: 'short', year: 'numeric' })

type C = { name: string; trn: string | null; address: string | null; team: { name: string; email: string; status: string; since: string }[] }

/** The buyer's company: the TRN that goes on its tax invoices, and who in the company uses Nashr. */
export function CompanyPage() {
  const [c, setC] = useState<C | null>(null), [trn, setTrn] = useState(''), [address, setAddress] = useState(''), [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { api<C>('/buyer/company').then(x => { setC(x); setTrn(x.trn ?? ''); setAddress(x.address ?? '') }, e => setError(e.message)) }, [])
  if (!c) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const valid = trn === '' || /^\d{15}$/.test(trn), changed = trn !== (c.trn ?? '') || address.trim() !== (c.address ?? '')
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNote('')
    try { await api('/buyer/company', { method: 'PUT', body: { trn, address: address.trim() } }); setC({ ...c!, trn: trn || null, address: address.trim() || null }); setNote(t('Saved. New invoices and receipts carry these details.')) }
    catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <main className="narrow">
      <PhotoBand img="/brand/dash-buyer.jpg" title={c.name} sub={t('Your company on Nashr: tax details and the people who book.')} />
      <CompanyProfileEditor audience="publishers" />
      <section className="card pad section form">
        <h2>{t('Invoice details')}</h2>
        <p className="muted">{t('Publishers put your TRN on the tax invoices they send you, so you can reclaim the VAT. Leave it empty if your company is not VAT-registered.')}</p>
        <form className="form" onSubmit={save}>
          <div className="field"><label htmlFor="trn">{t('TRN (15 digits)')}</label>
            <input id="trn" inputMode="numeric" autoComplete="off" maxLength={15} value={trn} aria-invalid={!valid} aria-describedby="trn-help"
              onChange={e => { setTrn(e.target.value.replace(/\D/g, '')); setNote('') }} />
            <span id="trn-help" className={`small ${valid ? 'muted' : 'error'}`}>{valid ? t('{n} of 15 digits', { n: trn.length }) : t('A TRN has 15 digits.')}</span></div>
          <div className="field"><label htmlFor="addr">{t('Registered address')}</label>
            <textarea id="addr" rows={3} maxLength={300} value={address} aria-describedby="addr-help" onChange={e => { setAddress(e.target.value); setNote('') }} />
            <span id="addr-help" className="small muted">{t('As on your trade licence. It is printed on the invoices and receipts you receive.')}</span></div>
          <div className="row-flex"><button className="btn primary" disabled={busy || !valid || !changed}>{t('Save')}</button>
            {changed && <button type="button" className="btn" onClick={() => { setTrn(c.trn ?? ''); setAddress(c.address ?? '') }}>{t('Undo')}</button>}</div>
          {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
        </form>
      </section>
      <section className="card pad section">
        <h2>{t('Your team')}</h2>
        <ul className="team">{c.team.map(u => <li key={u.email}><span className="conv-avatar" aria-hidden>{u.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>
          <span><b>{u.name}</b><span className="small muted"><bdi>{u.email}</bdi> · {t('since {date}', { date: date(u.since) })}</span></span>
          {u.status !== 'active' && <span className="badge">{t(u.status)}</span>}</li>)}</ul>
        <p className="small muted">{t('To add a colleague, ask Nashr: everyone joins by invitation.')}</p>
      </section>
    </main>
  )
}
