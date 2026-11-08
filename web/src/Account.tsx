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

type A = { name: string; email: string; role: string; emails: { bids: boolean; alerts: boolean; messages: boolean; news: boolean }
  twoStep: { on: boolean; staff: boolean; requiredForMoney: boolean } }

/**
 * Two-step sign-in: turn it on with any authenticator app (a key to type, or a link that opens the app on a phone), confirm
 * with a code; turning it off asks for the password and a code. Staff set theirs up when they join.
 */
function TwoStep({ a, onChange, role }: { a: A['twoStep']; onChange: (on: boolean) => void; role: string }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null), [code, setCode] = useState(''), [password, setPassword] = useState('')
  const [off, setOff] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('')
  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(''); setNote(''); try { await fn() } catch (e: any) { setError(e.message) } finally { setBusy(false) } }
  const money = role === 'seller' ? t('connecting your payout account') : t('paying for a booking')
  return <section className="card pad section form two-step"><h2>{t('Two-step sign-in')}</h2>
    {a.staff ? <p className="muted">{t('Your authenticator was set up when you joined Nashr.')}</p>
    : a.on ? <>
      <p><span className="pill-state is-lead">{t('On')}</span> {t('Signing in asks for a code from your authenticator app.')}</p>
      {!off ? <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setOff(true)}>{t('Turn off')}</button> : <form className="form" onSubmit={e => { e.preventDefault()
        run(async () => { await api('/me/two-step/off', { method: 'POST', body: { password, code } }); setOff(false); setPassword(''); setCode(''); onChange(false); setNote(t('Two-step sign-in is off.')) }) }}>
        <div className="grid2"><div className="field"><label htmlFor="tp">{t('Current password')}</label><input id="tp" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <div className="field"><label htmlFor="tc">{t('Code from your authenticator app')}</label><input id="tc" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required /></div></div>
        {a.requiredForMoney && <p className="small warn">{t('Without it you cannot go on {what}.', { what: money })}</p>}
        <div className="row-flex"><button className="btn primary" disabled={busy || code.length !== 6 || !password}>{t('Turn off two-step sign-in')}</button><button type="button" className="btn" onClick={() => setOff(false)}>{t('Keep it on')}</button></div></form>}
    </> : !setup ? <>
      <p>{t('Protect your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and others) each time you sign in.')}</p>
      {a.requiredForMoney && <p className="small warn">{t('Nashr asks for it before {what}.', { what: money })}</p>}
      <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => run(async () => setSetup(await api('/me/two-step/start', { method: 'POST' })))}>{t('Turn on two-step sign-in')}</button>
    </> : <form className="form" onSubmit={e => { e.preventDefault()
        run(async () => { await api('/me/two-step/confirm', { method: 'POST', body: { code } }); setSetup(null); setCode(''); onChange(true); setNote(t('Two-step sign-in is on. Next time you sign in, have your authenticator app ready.')) }) }}>
      <ol className="steps">
        <li>{t('In your authenticator app, add an account and type this key:')}<div className="key" dir="ltr"><code>{setup.secret.match(/.{1,4}/g)!.join(' ')}</code></div>
          <a className="small" href={setup.uri}>{t('On this phone? Open it in your authenticator app')}</a></li>
        <li><label htmlFor="tcode">{t('Enter the 6-digit code the app shows:')}</label>
          <input id="tcode" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required /></li>
      </ol>
      <div className="row-flex"><button className="btn primary" disabled={busy || code.length !== 6}>{t('Confirm and turn on')}</button><button type="button" className="btn" onClick={() => { setSetup(null); setCode('') }}>{t('Cancel')}</button></div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
  </section>
}

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
    <TwoStep a={a.twoStep} role={a.role} onChange={on => setA({ ...a, twoStep: { ...a.twoStep, on } })} />
    <section className="card pad section form"><h2>{t('Emails')}</h2>
      <p className="small muted">{t('Emails about payments, bookings you must act on and deadlines always go, so nothing is missed.')}</p>
      {EMAILS.map(([k, label, help]) => <label key={k} className="switch"><input type="checkbox" role="switch" checked={a.emails[k]} onChange={e => { const emails = { ...a.emails, [k]: e.target.checked }; setA({ ...a, emails }); save({ emails }, t('Email choices saved.')) }} />
        <span className="switch-track" aria-hidden><span /></span><span><b>{label}</b><span className="small muted" style={{ display: 'block' }}>{help}</span></span></label>)}
    </section>
  </main>
}
