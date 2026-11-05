import { useState } from 'react'
import { api } from './api'

/** Sign-in, request access and invites share one layout: the studio hero (the brand's one bold moment) and the form. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-hero" aria-label="About Nashr">
        <span className="logo"><span className="latin">Nashr</span></span>
        <div className="auth-mark" lang="ar" aria-hidden>نشر</div>
        <h2>Book UAE airtime and pages in one place.</h2>
        <p>Bid on radio breaks, TV spots, print pages, homepages and podcasts. Your money is held until the publisher proves the ad ran.</p>
        <div className="auth-channels" aria-label="Channels">{['Radio', 'TV', 'Print', 'Digital', 'Podcasts'].map(c => <span key={c}>{c}</span>)}</div>
      </section>
      <section className="auth-form">{children}</section>
    </div>
  )
}

export function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState('')
  const [needCode, setNeedCode] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('/auth/login', { method: 'POST', body: { email, password, ...(code ? { totpCode: code } : {}) } }); onIn() }
    catch (err: any) { if (/authenticator/.test(err.message)) setNeedCode(true); setError(err.message) }
    finally { setBusy(false) }
  }
  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1>Sign in</h1>
        <div className="field"><label htmlFor="email">Work email</label><input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        {needCode && <div className="field"><label htmlFor="code">Code from your authenticator app</label><input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></div>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>Sign in</button>
        <p className="small muted">Nashr is invite-only for UAE brands, agencies and media outlets. <a href="#/request-access">Request access</a></p>
      </form>
    </AuthShell>
  )
}
