import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { LogoImage } from './Logo'
import { LangSwitch, t } from './i18n'
import { tm } from './i18n-server'
import './join.css'

/*
 * Event registration (owner's request for a conference): register interest only, no account and no access request.
 * A simple form: I am Buyer / Media outlet, then name, company, email (any address) and phone. Nothing on the page leads into the
 * website: no links, no site header or menu, not listed by search engines. After a sign-up it thanks the person, then clears itself for the next visitor (a stand with one tablet).
 * /join/<event> tags the sign-ups with the event; Nashr's team sees them in Registrations.
 * Before release (`soon`) the same form is the whole site for anyone not signed in: "Coming soon" above it, sign-ups tagged "website".
 */
export function JoinPage({ soon = false }: { soon?: boolean }) {
  useEffect(() => { document.title = 'Nashr'; let m = document.querySelector('meta[name=robots]') as HTMLMetaElement | null
    if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m) } m.content = 'noindex, nofollow' }, [])
  const tag = /^\/join\//.test(location.pathname) ? location.pathname.split('/')[2]?.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) : ''
  const event = tag || (soon ? 'website' : 'general')
  const blank = { side: 'buyer' as 'buyer' | 'media_outlet', name: '', company: '', email: '', phone: '' }
  const [f, setF] = useState(blank), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  const set = (k: 'name' | 'company' | 'email' | 'phone') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try { await api('/registrations', { method: 'POST', body: { ...f, event } }); setDone(true) }
    catch (err: any) { setError(tm(err.message)) } finally { setBusy(false) }
  }
  const next = () => { setF(blank); setDone(false); setError(''); setTimeout(() => first.current?.focus(), 0) }
  // the thank-you shows for a few seconds, then the empty form is back for the next person
  useEffect(() => { if (!done) return; const x = setTimeout(next, 5000); return () => clearTimeout(x) }, [done])

  const body = <>
      {done ? <div className="join-done" aria-live="polite">
        {soon ? <h2>{t('Thank you')}</h2> : <h1>{t('Thank you')}</h1>}
        <p>{t("You're registered. Nashr's team will be in touch.")}</p>
        <span className="join-countdown" aria-hidden="true" />
      </div>
      : <form className="join-form" onSubmit={submit}>
        <p className="join-label join-iam">{t('I am')}</p>
        <div className="join-tabs" role="radiogroup" aria-label={t('I am')}>
          {(['buyer', 'media_outlet'] as const).map(k => <button key={k} type="button" role="radio" aria-checked={f.side === k} className={f.side === k ? 'on' : ''}
            onClick={() => setF({ ...f, side: k })}>{k === 'buyer' ? t('Buyer') : t('Media outlet')}</button>)}
        </div>
        <div className="join-grid">
          <label className="join-field"><span className="join-label">{t('Name')}</span>
            <input ref={first} autoComplete="name" required maxLength={200} value={f.name} onChange={set('name')} /></label>
          <label className="join-field"><span className="join-label">{t('Company')}</span>
            <input autoComplete="organization" required maxLength={200} value={f.company} onChange={set('company')} /></label>
          <label className="join-field"><span className="join-label">{t('Email')}</span>
            <input type="email" dir="ltr" autoComplete="email" inputMode="email" required maxLength={200} value={f.email} onChange={set('email')} /></label>
          <label className="join-field"><span className="join-label">{t('Phone')}</span>
            <input type="tel" dir="ltr" autoComplete="tel" inputMode="tel" required maxLength={40} value={f.phone} onChange={set('phone')} /></label>
        </div>
        {error && <p className="join-error" role="alert">{error}</p>}
        <button className="join-submit" disabled={busy}>{busy ? t('Sending…') : t('Submit')}</button>
      </form>}
  </>
  if (soon) return <div className="join join--soon">
    <header className="join-top"><LogoImage height={26} tone="reversed" /><LangSwitch /></header>
    <main>
      <section className="soon-hero">
        <SoonMark />
        <p className="soon-slogan">{t('Premium media buying marketplace')}<span aria-hidden="true" /> {t('UAE')}</p>
        <h1>{t('Coming soon')}</h1>
      </section>
      <section className="soon-panel" aria-label={t('Register your interest')}>{body}</section>
    </main>
    <footer className="soon-foot"><bdi dir="ltr">© {new Date().getFullYear()} Nashr</bdi></footer>
  </div>

  return <div className="join">
    <header className="join-top"><LogoImage height={26} tone="reversed" /><LangSwitch /></header>
    <main>
      {body}
    </main>
  </div>
}

/** The noon of the logo, drawn large: the bowl draws itself, the red dot lands, then sends out slow rings, like a light that is on air. */
function SoonMark() {
  return <svg className="soon-mark" viewBox="0 0 480 300" aria-hidden="true" focusable="false">
    <g className="soon-rings">{[0, 1, 2].map(i => <circle key={i} cx="240" cy="62" r="34" />)}</g>
    <path className="soon-bowl" d="M 52 120 A 188 158 0 0 0 428 120" pathLength={1} />
    <circle className="soon-dot" cx="240" cy="62" r="34" />
  </svg>
}
