import { useState } from 'react'
import { api } from './api'
import { PAGES, useMeta } from './seo'
import { LangSwitch, t } from './i18n'

/** Sign-in, request access and invites share one layout: the studio hero (the brand's one bold moment) and the form. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const points = [t('Every slot and price is open to browse'), t('You pay only when a publisher accepts'), t('Your money is held until the ad has run')]
  return (
    <div className="auth">
      <section className="auth-hero" aria-label={t("About Nashr")}>
        <a className="logo" href="/" aria-label={t("Nashr home")}><span className="latin">Nashr</span><span className="arabic" lang="ar" aria-hidden>نشر</span></a>
        <div className="auth-pitch">
          <h2>{t("Book UAE airtime and pages in one place.")}</h2>
          <p>{t("Bid on radio breaks, TV spots, print pages, homepages and podcasts. Your money is held until the publisher proves the ad ran.")}</p>
          <ul className="auth-points">{points.map(x => <li key={x}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{x}</li>)}</ul>
        </div>
        {/* the booking's five steps, as on the home page: the one picture of how Nashr works */}
        <ol className="auth-steps" aria-label={t("Where this booking is")}>
          {[t("Bid"), t("Accepted"), t("Paid, held"), t("On air"), t("Released")].map((x, i) => <li key={x} className={i < 2 ? 'done' : i === 2 ? 'now' : ''}>{x}</li>)}</ol>
      </section>
      <section className="auth-form">
        <header className="auth-top"><a href="/"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>{t('Back to home')}</a><LangSwitch className="auth-lang" /></header>
        {children}
        <footer className="auth-foot"><a href="/calendar">{t("Browse the calendar")}</a><nav aria-label={t("Legal")}><a href="/terms">{t("Terms")}</a><a href="/privacy">{t("Privacy")}</a><a href="/refunds">{t("Refunds")}</a></nav></footer>
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
    catch (err: any) { if (/authenticator/.test(err.raw ?? err.message)) setNeedCode(true); setError(err.message) }
    finally { setBusy(false) }
  }
  return (
    <AuthShell>
      <form onSubmit={submit}>
        <div className="auth-title"><h1>{t("Sign in")}</h1><p>{t("Welcome back. Bid, book and follow every payment in one place.")}</p></div>
        {note && <p className="auth-note" role="status">{note}</p>}
        <div className="field"><label htmlFor="email">{t("Work email")}</label>
          <input id="email" type="email" autoComplete="username" placeholder="name@company.ae" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pw">{t("Password")}</label>
          <div className="pw-wrap"><input id="pw" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="button" className="pw-toggle" aria-pressed={show} aria-controls="pw" onClick={() => setShow(!show)}>{show ? t("Hide") : t("Show")}</button></div>
          <a className="small" style={{ justifySelf: 'end' }} href="/forgot">{t('Forgot your password?')}</a></div>
        {needCode && <div className="field"><label htmlFor="code">{t("Code from your authenticator app")}</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder={t("6 digits")} maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn primary lg auth-submit" disabled={busy}>{busy ? t("Signing in…") : t("Sign in")}</button>
        <div className="auth-alt"><span>{t("New to Nashr?")}</span><p>{t("Nashr is invite-only for UAE brands, agencies and media outlets.")}</p>
          <a className="btn auth-alt-btn" href="/request-access">{t("Request access")}</a></div>
      </form>
    </AuthShell>
  )
}
