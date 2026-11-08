import { useEffect, useState } from 'react'
import { api } from './api'
import { locale, sep, t } from './i18n'

/*
 * The other side's business profile, shown before a deal is agreed (owner decision): who they are and their record on Nashr.
 * Never contact details: emails, phone numbers and people's names stay inside a paid booking's messages.
 */
export type CompanyProfile = {
  name: string; type: 'brand' | 'agency' | 'publisher'; industry: string | null; website: string | null; about: string | null
  memberSince: string; verified: true; taxRegistered: boolean; vatRegistered: boolean
  record: { completed: number; payRate?: number; acceptRate?: number; rating?: { average: number; count: number } }
  outlets?: string[]
}

const TYPE: Record<string, string> = { brand: 'Brand', agency: 'Agency', publisher: 'Publisher' }
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const since = (iso: string) => new Date(iso).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' })
const safeUrl = (u: string | null) => u && /^https?:\/\//i.test(u) ? u : null

/** One line under a name: type, industry, how long on Nashr and the record that matters to the other side. */
export function companySummary(p: CompanyProfile) {
  const bits = [t(TYPE[p.type]), p.industry ? t(p.industry) : null, t('on Nashr since {date}', { date: since(p.memberSince) }),
    p.record.completed === 1 ? t('1 booking completed') : t('{n} bookings completed', { n: p.record.completed })]
  if (p.record.payRate != null) bits.push(t('pays {n}% of accepted bookings', { n: p.record.payRate }))
  if (p.record.acceptRate != null) bits.push(t('accepts {n}% of requests', { n: p.record.acceptRate }))
  if (p.record.rating) bits.push(t('rated {score} by {n} buyers', { score: p.record.rating.average.toFixed(1), n: p.record.rating.count }))
  return bits.filter(Boolean).join(sep)
}

export function CompanyCard({ p, title, compact }: { p: CompanyProfile | null | undefined; title?: string; compact?: boolean }) {
  if (!p) return null
  const url = safeUrl(p.website)
  if (compact) return <details className="co-mini">
    <summary><span className="co-badge" aria-hidden>{initials(p.name)}</span><b>{p.name}</b><span className="co-verified">{t('Verified')}</span></summary>
    <p className="small muted">{companySummary(p)}</p>{p.about && <p className="small" dir="auto">{p.about}</p>}</details>
  return <div className="co-card">
    {title && <span className="small muted">{title}</span>}
    <div className="co-head"><span className="co-badge lg" aria-hidden>{initials(p.name)}</span>
      <div><h3>{p.name}</h3><span className="co-verified">{t('Verified by Nashr')}</span></div></div>
    {p.about && <p dir="auto">{p.about}</p>}
    <dl className="co-facts">
      <div><dt>{t('Type')}</dt><dd>{t(TYPE[p.type])}{p.industry ? `${sep}${t(p.industry)}` : ''}</dd></div>
      <div><dt>{t('On Nashr since')}</dt><dd>{since(p.memberSince)}</dd></div>
      <div><dt>{t('Bookings completed')}</dt><dd className="num">{p.record.completed}</dd></div>
      {p.record.payRate != null && <div><dt>{t('Pays accepted bookings')}</dt><dd className="num">{p.record.payRate}%</dd></div>}
      {p.record.acceptRate != null && <div><dt>{t('Accepts requests')}</dt><dd className="num">{p.record.acceptRate}%</dd></div>}
      {p.record.rating && <div><dt>{t('Buyer rating')}</dt><dd className="num">{p.record.rating.average.toFixed(1)} <span className="muted small">({p.record.rating.count})</span></dd></div>}
      <div><dt>{t('Tax')}</dt><dd>{p.vatRegistered ? t('VAT registered') : p.taxRegistered ? t('TRN on file') : t('No TRN on file')}</dd></div>
      {p.outlets?.length ? <div><dt>{t('Outlets')}</dt><dd>{p.outlets.join(sep)}</dd></div> : null}
      {url && <div><dt>{t('Website')}</dt><dd><a href={url} target="_blank" rel="noopener noreferrer nofollow">{url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></dd></div>}
    </dl>
    <p className="small muted">{t('Contact details are shared inside the booking once it is paid.')}</p>
  </div>
}

/** Edit your own business profile, with a live preview of what the other side sees. */
export function CompanyProfileEditor({ audience }: { audience: 'buyers' | 'publishers' }) {
  const [p, setP] = useState<CompanyProfile | null>(null), [f, setF] = useState({ industry: '', website: '', about: '' })
  const [busy, setBusy] = useState(false), [note, setNote] = useState(''), [error, setError] = useState('')
  useEffect(() => { api<CompanyProfile>('/company/profile').then(x => { setP(x); setF({ industry: x.industry ?? '', website: x.website ?? '', about: x.about ?? '' }) }, e => setError(e.message)) }, [])
  if (!p) return error ? <p className="error">{error}</p> : null
  async function save() {
    setBusy(true); setError(''); setNote('')
    try { setP(await api<CompanyProfile>('/company/profile', { method: 'PUT', body: f })); setNote(t('Profile saved.')) } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const preview = { ...p, industry: f.industry || p.industry, website: f.website || null, about: f.about || null }
  return <section className="card pad section form co-editor">
    <h2>{t('Business profile')}</h2>
    <p className="small muted">{audience === 'publishers' ? t('Publishers see this when you bid or book, before they decide. Contact details are never shown.')
      : t('Buyers see this when they look at your slots, before they book. Contact details are never shown.')}</p>
    <div className="co-edit-grid">
      <div className="form">
        {p.type !== 'publisher' && <div className="field"><label htmlFor="cp-i">{t('Industry')}</label><input id="cp-i" dir="auto" maxLength={80} value={f.industry} onChange={e => setF({ ...f, industry: e.target.value })} placeholder={t('Banking')} /></div>}
        <div className="field"><label htmlFor="cp-w">{t('Website')}</label><input id="cp-w" dir="ltr" maxLength={300} placeholder="https://" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} /></div>
        <div className="field"><label htmlFor="cp-a">{t('About the company')}</label><textarea id="cp-a" dir="auto" rows={4} maxLength={600} value={f.about} onChange={e => setF({ ...f, about: e.target.value })} /></div>
        {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
        <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || (!!f.website && !/^https?:\/\//.test(f.website))} onClick={save}>{t('Save')}</button>
      </div>
      <div className="co-preview"><CompanyCard p={preview} title={audience === 'publishers' ? t('How publishers see you') : t('How buyers see you')} /></div>
    </div>
  </section>
}
