import { useState } from 'react'
import { api } from './api'
import { AuthShell } from './Login'
import { PAGES, useMeta } from './seo'

/** Invite-only: five fields, business email; Nashr's team approves (brief scenario 14). */
export function RequestAccess() {
  useMeta(PAGES['/request-access'])
  const [f, setF] = useState({ name: '', email: '', phone: '', role: '', company: '', companyType: 'brand' })
  const [error, setError] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('/access-requests', { method: 'POST', body: f }); setSent(true) } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1>Request access</h1>
        {sent ? <p>Thanks. Nashr's team reviews every request and will email you an invite link once approved.</p> : <>
          <p className="small muted">Nashr is invite-only for UAE brands, agencies and media outlets.</p>
          <div className="field"><label htmlFor="n">Full name</label><input id="n" autoComplete="name" value={f.name} onChange={set('name')} required /></div>
          <div className="field"><label htmlFor="e">Work email</label><input id="e" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></div>
          <div className="field"><label htmlFor="p">Phone</label><input id="p" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} required /></div>
          <div className="field"><label htmlFor="c">Company</label><input id="c" autoComplete="organization" value={f.company} onChange={set('company')} required /></div>
          <div className="field"><label htmlFor="r">Your role</label><input id="r" autoComplete="organization-title" value={f.role} onChange={set('role')} required /></div>
          <div className="field"><label htmlFor="t">You are</label><select id="t" value={f.companyType} onChange={set('companyType')}>
            <option value="brand">A brand</option><option value="agency">An agency</option><option value="media_outlet">A media outlet</option></select></div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>Send request</button>
          <p className="small muted">By sending, you agree to Nashr's <a href="/terms">terms of use</a> and <a href="/privacy">privacy policy</a>.</p>
        </>}
        <p className="small muted"><a href="/sign-in">Sign in</a> · <a href="/">Back to Nashr</a></p>
      </form>
    </AuthShell>
  )
}

/** The invite link: set a password; staff also link an authenticator app. */
export function AcceptInvite({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [code, setCode] = useState('')
  const [secret, setSecret] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (password !== confirm) return setError('The passwords do not match.')
    setBusy(true)
    try {
      const r = await api('/auth/invite', { method: 'POST', body: { token, password, ...(code ? { totpCode: code } : {}) } })
      if (r.needsTotp) setSecret(r.totpSecret); else setDone(true)
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1>{done ? 'You are in' : 'Set your password'}</h1>
        {done ? <><p>Your account is ready.</p><button type="button" className="btn primary" onClick={() => { history.replaceState(null, '', '/'); onDone() }}>Sign in</button></> : <>
          <div className="field"><label htmlFor="pw">Password (at least 12 characters)</label><input id="pw" type="password" autoComplete="new-password" minLength={12} value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <div className="field"><label htmlFor="pw2">Repeat password</label><input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
          {secret && <>
            <p className="small">Staff accounts need an authenticator app. Add this key to your app, then enter the 6-digit code.</p>
            <code className="num" style={{ wordBreak: 'break-all' }}>{secret}</code>
            <div className="field"><label htmlFor="code">Code from your authenticator app</label><input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required /></div>
          </>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{secret ? 'Activate' : 'Continue'}</button>
        </>}
      </form>
    </AuthShell>
  )
}
