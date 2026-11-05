import { useState } from 'react'
import { api } from './api'

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
    <div className="login">
      <form className="card pad login-card" onSubmit={submit}>
        <span className="logo">Nashr</span>
        <h1>Sign in</h1>
        <div className="field"><label htmlFor="email">Work email</label><input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        {needCode && <div className="field"><label htmlFor="code">Code from your authenticator app</label><input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></div>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>Sign in</button>
        <p className="small muted">Nashr is invite-only. <a href="#/request-access">Request access</a></p>
      </form>
    </div>
  )
}
