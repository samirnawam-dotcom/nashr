import { useEffect, useState } from 'react'
import { api } from './api'
import { dayLabel } from './format'
import { dubai } from './calendar/layout'
import { t } from './i18n'

type Member = { id: string; name: string; email: string; status: 'invited' | 'active' | 'suspended'; canPay: boolean; canDecide: boolean; canManage: boolean
  twoStep: boolean; lastSeen: string | null; since: string; you: boolean }
const date = (iso: string) => dayLabel(dubai(iso).date, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * The company's team, run by the company: team managers invite colleagues, choose what each may do (buyers: pay; publishers:
 * decide on bookings; everyone: manage the team), and remove people who leave. Everyone else sees who is on the team.
 */
export function Team({ side }: { side: 'buyer' | 'publisher' }) {
  const [data, setData] = useState<{ youManage: boolean; members: Member[] } | null>(null), [error, setError] = useState(''), [note, setNote] = useState('')
  const [form, setForm] = useState<null | { name: string; email: string; canPay: boolean; canDecide: boolean; canManage: boolean }>(null)
  const [link, setLink] = useState(''), [busy, setBusy] = useState(false)
  const load = () => api<{ youManage: boolean; members: Member[] }>('/team').then(setData, e => setError(e.message))
  useEffect(() => { load() }, [])
  async function run(fn: () => Promise<unknown>, done: string) { setBusy(true); setError(''); setNote(''); try { await fn(); setNote(done); await load() } catch (e: any) { setError(e.message) } finally { setBusy(false) } }
  const right = side === 'buyer' ? 'canPay' : 'canDecide'
  const rightLabel = side === 'buyer' ? t('Can pay and cancel') : t('Can accept and decline bookings')
  if (!data) return <section className="card pad section">{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</section>
  const manage = data.youManage
  return <section className="card pad section team-section" id="team">
    <div className="row-flex"><h2>{t('Your team')}</h2><div className="spacer" />
      {manage && !form && <button className="btn" onClick={() => { setForm({ name: '', email: '', canPay: side === 'buyer', canDecide: side === 'publisher', canManage: false }); setLink('') }}>{t('Invite a colleague')}</button>}</div>
    {!manage && <p className="small muted">{t('Your company\'s team managers invite colleagues and choose what each may do.')}</p>}
    {form && <form className="form team-invite" onSubmit={e => { e.preventDefault()
        run(async () => { const r = await api<{ inviteLink: string; emailed: boolean }>('/team', { method: 'POST', body: form }); setLink(r.emailed ? '' : r.inviteLink); setForm(null) },
          t('Invited. They get a link to set a password and accept the terms.')) }}>
      <div className="grid2"><div className="field"><label htmlFor="tm-n">{t('Name')}</label><input id="tm-n" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="field"><label htmlFor="tm-e">{t('Work email')}</label><input id="tm-e" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div></div>
      <fieldset className="rights"><legend>{t('What they may do')}</legend>
        <label className="check"><input type="checkbox" checked={form[right]} onChange={e => setForm({ ...form, [right]: e.target.checked })} /> {rightLabel}</label>
        <label className="check"><input type="checkbox" checked={form.canManage} onChange={e => setForm({ ...form, canManage: e.target.checked })} /> {t('Can manage the team, company details and payouts')}</label>
        <p className="small muted">{t('Everyone on the team can see bookings, send messages and book.')}</p></fieldset>
      <div className="row-flex"><button className="btn primary" disabled={busy}>{t('Send the invite')}</button><button type="button" className="btn" onClick={() => setForm(null)}>{t('Cancel')}</button></div>
    </form>}
    {link && <p className="ok">{t('Email is not set up yet, so send them this link yourself (it works once):')} <input className="search mono" style={{ width: '100%' }} readOnly value={location.origin + link} onFocus={e => e.target.select()} /></p>}
    {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
    <ul className="team">{data.members.map(m => <li key={m.id} className={m.status === 'suspended' ? 'gone' : ''}>
      <span className="conv-avatar" aria-hidden>{m.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>
      <span className="who"><b>{m.name}{m.you && <span className="muted"> ({t('you')})</span>}</b>
        <span className="small muted"><bdi>{m.email}</bdi> · {m.status === 'invited' ? t('invited, not joined yet') : m.status === 'suspended' ? t('removed') : t('since {date}', { date: date(m.since) })}</span>
        <span className="small rights-now">{[m[right] && rightLabel, m.canManage && t('Team manager'), m.twoStep && t('Two-step on')].filter(Boolean).join(' · ') || t('Can see and book')}</span></span>
      {manage && !m.you && m.status !== 'suspended' && <span className="team-actions">
        <label className="switch small"><input type="checkbox" role="switch" checked={m[right]} disabled={busy}
          onChange={e => run(() => api(`/team/${m.id}`, { method: 'PUT', body: { [right]: e.target.checked } }), t('Saved.'))} /><span className="switch-track" aria-hidden><span /></span><span>{rightLabel}</span></label>
        <label className="switch small"><input type="checkbox" role="switch" checked={m.canManage} disabled={busy}
          onChange={e => run(() => api(`/team/${m.id}`, { method: 'PUT', body: { canManage: e.target.checked } }), t('Saved.'))} /><span className="switch-track" aria-hidden><span /></span><span>{t('Team manager')}</span></label>
        {m.status === 'invited' && <button className="btn" disabled={busy} onClick={() => run(async () => { const r = await api<{ inviteLink: string; emailed: boolean }>(`/team/${m.id}/invite`, { method: 'POST' }); setLink(r.emailed ? '' : r.inviteLink) }, t('A new invite is on its way. The old link no longer works.'))}>{t('New invite')}</button>}
        <button className="btn" disabled={busy} onClick={() => confirm(t('Remove {name} from the team? They are signed out at once and cannot sign in again. Their past work stays with the company.', { name: m.name }))
          && run(() => api(`/team/${m.id}/remove`, { method: 'POST' }), t('{name} was removed.', { name: m.name }))}>{t('Remove')}</button></span>}
      {manage && m.status === 'suspended' && <span className="team-actions"><button className="btn" disabled={busy} onClick={() => run(() => api(`/team/${m.id}/restore`, { method: 'POST' }), t('{name} is back on the team.', { name: m.name }))}>{t('Restore')}</button></span>}
    </li>)}</ul>
  </section>
}
