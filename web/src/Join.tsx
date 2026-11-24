import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { LogoImage } from './Logo'
import { LangSwitch, t } from './i18n'
import { tm } from './i18n-server'
import './join.css'

/*
 * Event registration (owner's request for a conference): register interest only, no account and no access request.
 * A simple form: I am Buyer / Media outlet, then name, company, email (any address) and phone. Nothing on the page leads into the
 * website: no links, no site header or menu, not listed by search engines. "Next person" clears it for the next visitor at the stand.
 * /join/<event> tags the sign-ups with the event; Nashr's team sees them in Registrations.
 */
export function JoinPage() {
  useEffect(() => { document.title = 'Nashr'; let m = document.querySelector('meta[name=robots]') as HTMLMetaElement | null
    if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m) } m.content = 'noindex, nofollow' }, [])
  const event = location.pathname.split('/')[2]?.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'general'
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

  return <div className="join">
    <header className="join-top"><LogoImage height={26} tone="reversed" /><LangSwitch /></header>
    <main>
      {done ? <div className="join-done" aria-live="polite">
        <h1>{t('Thank you')}</h1>
        <p>{t("You're registered. Nashr's team will be in touch.")}</p>
        <button type="button" className="join-submit" onClick={next}>{t('Next person')}</button>
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
    </main>
  </div>
}
