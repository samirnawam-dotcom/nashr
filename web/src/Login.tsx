import { useState } from 'react'
import { api } from './api'
import { PAGES, useMeta } from './seo'

/** Sign-in, request access and invites share one layout: the studio hero (the brand's one bold moment) and the form. */
export function AuthShell({ children, photo = '/brand/studio.jpg' }: { children: React.ReactNode; photo?: string }) {
  return (
    <div className="auth">
      <section className="auth-hero" aria-label="About Nashr">
        <img className="auth-photo" src={photo} width={1080} height={1440} alt="" decoding="async" />
        <a className="logo" href="/" aria-label="Nashr home"><span className="latin">Nashr</span></a>
        <div className="auth-mark" lang="ar" aria-hidden>نشر</div>
        <h2>Book UAE airtime and pages in one place.</h2>
        <p>Bid on radio breaks, TV spots, print pages, homepages and podcasts. Your money is held until the publisher proves the ad ran.</p>
        <div className="auth-channels" aria-label="Channels">{['Radio', 'TV', 'Print', 'Digital', 'Podcasts'].map(c => <span key={c}>{c}</span>)}</div>
      </section>
      <section className="auth-form">{children}
        <footer className="auth-foot"><a href="/calendar">Browse the calendar</a><nav aria-label="Legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a></nav></footer>
      </section>
    </div>
  )
}

export function Login({ onIn, note }: { onIn: () => void; note?: string }) {
  useMeta(PAGES['/sign-in'])
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState('')
  const [needCode, setNeedCode] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('/auth/login', { method: 'POST', body: { email, password, ...(code ? { totpCode: code } : {}) } }); onIn() }
    catch (err: any) { if (/authenticator/.test(err.message)) setNeedCode(true); setError(err.message) }
    finally { setBusy(false) }
  }
  return (
    <AuthShell>
      <form onSubmit={submit}>
        <div className="auth-title"><h1>Sign in</h1><p>Welcome back. Bid, book and follow every payment in one place.</p></div>
        {note && <p className="auth-note" role="status">{note}</p>}
        <div className="field"><label htmlFor="email">Work email</label>
          <input id="email" type="email" autoComplete="username" placeholder="name@company.ae" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pw">Password</label>
          <div className="pw-wrap"><input id="pw" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="pw-toggle" aria-pressed={show} aria-controls="pw" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div></div>
        {needCode && <div className="field"><label htmlFor="code">Code from your authenticator app</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn primary lg auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="auth-alt"><span>New to Nashr?</span><p>Nashr is invite-only for UAE brands, agencies and media outlets.</p>
          <a className="btn auth-alt-btn" href="/request-access">Request access</a></div>
      </form>
    </AuthShell>
  )
}
