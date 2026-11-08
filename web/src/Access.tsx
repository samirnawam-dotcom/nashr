import { useState } from 'react'
import { api } from './api'
import { AuthShell } from './Login'
import { PAGES, useMeta } from './seo'
import { t } from './i18n'

/** Invite-only: five fields, business email; Nashr's team approves (brief scenario 14). */
export function RequestAccess() {
  useMeta(PAGES['/request-access'])
  // Who is asking decides the pitch and the account type (as the best marketplaces do): advertisers and publishers each get their own route.
  const [side, setSide] = useState<'' | 'advertiser' | 'publisher'>(() => { const a = new URLSearchParams(location.search).get('as'); return a === 'publisher' || a === 'advertiser' ? a : '' })
  const [f, setF] = useState({ name: '', email: '', phone: '', role: '', company: '', companyType: new URLSearchParams(location.search).get('as') === 'publisher' ? 'media_outlet' : 'brand' })
  const [error, setError] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('/access-requests', { method: 'POST', body: f }); setSent(true) } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <AuthShell photo="/brand/auth-request.jpg">
      <form onSubmit={submit}>
        <div className="auth-title"><h1>{sent ? t("Request sent") : !side ? t("Request access") : side === 'publisher' ? t('Sell your airtime on Nashr') : t('Book UAE media on Nashr')}</h1>
          <p>{sent ? t("Thanks. Nashr's team reviews every request and will email you an invite link once approved.")
            : !side ? t("Nashr is invite-only for UAE brands, agencies and media outlets. Tell us who you are and we will be in touch.")
            : side === 'publisher' ? t('List your breaks, pages and placements, choose how each one sells, and get paid once the buyer approves proof. Onboarding happens on a short call.')
            : t('Bid on and book radio, TV, print, digital and podcast slots from UAE publishers. You pay only once a publisher accepts, and the money is held until the ad runs.')}</p></div>
        {!sent && !side && <div className="side-pick" role="group" aria-label={t('You are')}>
          <button type="button" className="side-card" onClick={() => { setSide('advertiser'); setF({ ...f, companyType: 'brand' }) }}>
            <b>{t('I want to advertise')}</b><span>{t('A brand or an agency booking media')}</span></button>
          <button type="button" className="side-card" onClick={() => { setSide('publisher'); setF({ ...f, companyType: 'media_outlet' }) }}>
            <b>{t('I sell airtime or ad space')}</b><span>{t('A radio or TV station, publication, website or podcast')}</span></button>
        </div>}
        {!sent && side && <>
          <div className="field"><label htmlFor="n">{t("Full name")}</label><input id="n" autoComplete="name" value={f.name} onChange={set('name')} required /></div>
          <div className="field"><label htmlFor="e">{t("Work email")}</label><input id="e" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></div>
          <div className="field"><label htmlFor="p">{t("Phone")}</label><input id="p" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} required /></div>
          <div className="field"><label htmlFor="c">{t("Company")}</label><input id="c" autoComplete="organization" value={f.company} onChange={set('company')} required /></div>
          <div className="field"><label htmlFor="r">{t("Your role")}</label><input id="r" autoComplete="organization-title" value={f.role} onChange={set('role')} required /></div>
          {side === 'advertiser' && <div className="field"><label htmlFor="t">{t("You are")}</label><select id="t" value={f.companyType} onChange={set('companyType')}>
            <option value="brand">{t("A brand")}</option><option value="agency">{t("An agency")}</option></select></div>}
          <button type="button" className="text-link small" style={{ justifySelf: 'start' }} onClick={() => setSide('')}>{side === 'publisher' ? t('I want to advertise instead') : t('I sell airtime instead')}</button>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="btn primary lg auth-submit" disabled={busy}>{busy ? t("Sending…") : t("Send request")}</button>
          <p className="small muted">{t("By sending, you agree to Nashr's")} <a href="/terms">{t('terms of use')}</a> {t('and')} <a href="/privacy">{t('privacy policy')}</a>.</p>
        </>}
        <div className="auth-alt"><span>{t("Already invited?")}</span><a className="btn auth-alt-btn" href="/sign-in">{t("Sign in")}</a></div>
      </form>
    </AuthShell>
  )
}

/** The invite link: set a password; staff also link an authenticator app. */
export function AcceptInvite({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [code, setCode] = useState('')
  const [secret, setSecret] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [agree, setAgree] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (password !== confirm) return setError(t('The passwords do not match.'))
    setBusy(true)
    try {
      const r = await api('/auth/invite', { method: 'POST', body: { token, password, acceptTerms: agree, ...(code ? { totpCode: code } : {}) } })
      if (r.needsTotp) setSecret(r.totpSecret); else setDone(true)
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <AuthShell photo="/brand/auth-invite.jpg">
      <form onSubmit={submit}>
        <div className="auth-title"><h1>{done ? t("You are in") : t("Set your password")}</h1>
          <p>{done ? t("Your account is ready. Sign in with your work email and new password.") : t("Choose a password for your Nashr account. Use at least 12 characters.")}</p></div>
        {done ? <><button type="button" className="btn primary lg auth-submit" onClick={() => { history.replaceState(null, '', '/'); onDone() }}>{t("Sign in")}</button></> : <>
          <div className="field"><label htmlFor="pw">{t("Password")}</label><input id="pw" type="password" autoComplete="new-password" minLength={12} value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <div className="field"><label htmlFor="pw2">{t("Repeat password")}</label><input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
          {secret && <>
            <p className="small">{t("Staff accounts need an authenticator app. Add this key to your app, then enter the 6-digit code.")}</p>
            <code className="num" style={{ wordBreak: 'break-all' }}>{secret}</code>
            <div className="field"><label htmlFor="code">{t("Code from your authenticator app")}</label><input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required /></div>
          </>}
          <label className="check small"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} required /> <span>{t('I accept the')} <a href="/terms" target="_blank" rel="noopener">{t('terms of use')}</a>, {t('the')} <a href="/dispute-policy" target="_blank" rel="noopener">{t('disputes and payment protection policy')}</a> {t('and the')} <a href="/privacy" target="_blank" rel="noopener">{t('privacy policy')}</a>, {t('for myself and the company I act for.')}</span></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="btn primary lg auth-submit" disabled={busy || !agree}>{secret ? t("Activate") : t("Continue")}</button>
        </>}
      </form>
    </AuthShell>
  )
}
