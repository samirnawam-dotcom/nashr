import { useEffect, useState } from 'react'
import { api } from './api'
import { AuthShell } from './Login'
import { PhotoBand } from './PhotoBand'
import { t } from './i18n'

/** Forgotten password: always the same answer, so nobody can find out who has an account. Nashr's team sends the link. */
export function ForgotPassword() {
  const [email, setEmail] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('/auth/forgot', { method: 'POST', body: { email } }); setSent(true) } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return <AuthShell photo="/brand/auth-invite.jpg"><form onSubmit={submit}>
    <div className="auth-title"><h1>{sent ? t('Check your email') : t('Reset your password')}</h1>
      <p>{sent ? t("If an account uses {email}, Nashr's team will send it a reset link shortly. The link works for 24 hours.", { email })
        : t('Enter your work email. We will send a link to choose a new password.')}</p></div>
    {!sent && <><div className="field"><label htmlFor="fe">{t('Work email')}</label><input id="fe" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="btn primary lg auth-submit" disabled={busy}>{busy ? t('Sending…') : t('Send me a reset link')}</button></>}
    <div className="auth-alt"><a className="btn auth-alt-btn" href="/sign-in">{t('Back to sign in')}</a></div>
  </form></AuthShell>
}

/** The link from Nashr: choose a new password. Every other session is signed out. */
export function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (pw !== pw2) return setError(t('The passwords do not match.'))
    setBusy(true)
    try { await api('/auth/reset', { method: 'POST', body: { token, password: pw } }); setDone(true) } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return <AuthShell photo="/brand/auth-invite.jpg"><form onSubmit={submit}>
    <div className="auth-title"><h1>{done ? t('Password changed') : t('Choose a new password')}</h1>
      <p>{done ? t('Sign in with your new password. You have been signed out everywhere else.') : t('Use at least 12 characters.')}</p></div>
    {done ? <button type="button" className="btn primary lg auth-submit" onClick={() => { history.replaceState(null, '', '/'); onDone() }}>{t('Sign in')}</button> : <>
      <div className="field"><label htmlFor="np">{t('New password')}</label><input id="np" type="password" autoComplete="new-password" minLength={12} value={pw} onChange={e => setPw(e.target.value)} required /></div>
      <div className="field"><label htmlFor="np2">{t('Repeat password')}</label><input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required /></div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="btn primary lg auth-submit" disabled={busy}>{t('Save new password')}</button></>}
  </form></AuthShell>
}

type A = { name: string; email: string; role: string; emails: { bids: boolean; alerts: boolean; messages: boolean; news: boolean } }

/** Your own account, for every role: your name, your password and which emails you get. */
export function MyAccountPage() {
  const [a, setA] = useState<A | null>(null), [name, setName] = useState(''), [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', again: '' })
  useEffect(() => { api<A>('/me/account').then(x => { setA(x); setName(x.name) }, e => setError(e.message)) }, [])
  async function save(body: object, done: string) {
    setBusy(true); setError(''); setNote('')
    try { await api('/me/account', { method: 'PUT', body }); setNote(done) } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNote('')
    if (pw.next !== pw.again) return setError(t('The passwords do not match.'))
    setBusy(true)
    try { await api('/me/password', { method: 'PUT', body: { current: pw.current, password: pw.next } }); setPw({ current: '', next: '', again: '' }); setNote(t('Password changed. You have been signed out everywhere else.')) }
    catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  if (!a) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const EMAILS: [keyof A['emails'], string, string][] = [
    ['bids', t('Bids and requests'), t('Outbid, auto-bid at its maximum, a request accepted or declined.')],
    ['alerts', t('Saved-search alerts'), t('New slots that match a search you saved.')],
    ['messages', t('Messages'), t('A new message on one of your bookings.')],
    ['news', t('News from Nashr'), t('New features and guides, at most once a month.')],
  ]
  return <main className="narrow">
    <PhotoBand img="/brand/auth-invite.jpg" title={t('Your account')} sub={a.email} />
    {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
    <section className="card pad section form"><h2>{t('Your name')}</h2>
      <div className="field"><label htmlFor="an">{t('Name')}</label><input id="an" dir="auto" maxLength={120} value={name} onChange={e => setName(e.target.value)} /></div>
      <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || !name.trim() || name === a.name} onClick={() => save({ name }, t('Saved.'))}>{t('Save')}</button></section>
    <form className="card pad section form" onSubmit={changePw}><h2>{t('Password')}</h2>
      <input type="text" autoComplete="username" value={a.email} readOnly hidden />
      <div className="field"><label htmlFor="pc">{t('Current password')}</label><input id="pc" type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} required /></div>
      <div className="grid2"><div className="field"><label htmlFor="pn">{t('New password')}</label><input id="pn" type="password" autoComplete="new-password" minLength={12} value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} required /></div>
        <div className="field"><label htmlFor="pa">{t('Repeat password')}</label><input id="pa" type="password" autoComplete="new-password" value={pw.again} onChange={e => setPw({ ...pw, again: e.target.value })} required /></div></div>
      <span className="small muted">{t('At least 12 characters. Changing it signs you out on every other device.')}</span>
      <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy}>{t('Change password')}</button></form>
    <section className="card pad section form"><h2>{t('Emails')}</h2>
      <p className="small muted">{t('Emails about payments, bookings you must act on and deadlines always go, so nothing is missed.')}</p>
      {EMAILS.map(([k, label, help]) => <label key={k} className="switch"><input type="checkbox" role="switch" checked={a.emails[k]} onChange={e => { const emails = { ...a.emails, [k]: e.target.checked }; setA({ ...a, emails }); save({ emails }, t('Email choices saved.')) }} />
        <span className="switch-track" aria-hidden><span /></span><span><b>{label}</b><span className="small muted" style={{ display: 'block' }}>{help}</span></span></label>)}
    </section>
  </main>
}
