import { useEffect, useState } from 'react'
import { api } from './api'
import { LangSwitch, isAr, t } from './i18n'
import { Logo } from './Logo'
import './prelaunch.css'

/*
 * The page visitors see before release (owner's "Nashr landing page", wording from Home3): what Nashr is, the audiences
 * it reaches, what changes, and "Let's talk". The form is a real request for access (Access, for Nashr's team to
 * approve): once approved the person gets an invitation, signs in, and sees the whole site.
 */
const REACH: [string, string, string][] = [
  ['I', 'Drivers', 'Drive-time radio'],
  ['II', 'Commuters', 'Roadside and street outdoor'],
  ['III', 'Readers', 'Newspapers and magazines'],
  ['IV', 'Online', 'Publishers’ own sites'],
  ['V', 'The room', 'Events and sponsorships'],
]
const CHANGES: [string, string, string][] = [
  ['I', 'Live calendars', 'Every outlet’s openings, as they open.'],
  ['II', 'Paid on proof', 'Buyers pay for what runs. Outlets are paid when it does.'],
  ['III', 'Reach you can trust', 'Every audience figure labelled, audited or reported.'],
  ['IV', 'One booking', 'Many outlets. One brief, one booking, one invoice.'],
]

export function PrelaunchPage() {
  // "Request access" elsewhere (the sign-in page) lands on the form
  useEffect(() => { if (location.pathname === '/request-access' || location.hash === '#request') document.getElementById('request')?.scrollIntoView() }, [])
  return <div className="pl" lang={isAr ? 'ar' : 'en'}>
    <header className="pl-top">
      <Logo href="/" height={24} />
      <nav className="pl-nav" aria-label={t('Menu')}>
        <LangSwitch className="pl-lang" />
        <a href="/sign-in" className="pl-signin">{t('Sign in')}</a>
        <a href="#request" className="pl-cta">{t('Let’s talk')}</a>
      </nav>
    </header>

    <main>
      <div className="pl-rule"><span dir="ltr">N° 01</span><span>{t('The marketplace for premium media buying')}</span><span>{t('UAE')}</span></div>

      <section className="pl-hero" aria-label={t('Nashr')}>
        <h1 lang="en" dir="ltr">media moves differently here.</h1>
        <p className="pl-h1-ar" lang="ar" dir="rtl" aria-hidden={!isAr || undefined}>الإعلام يتحرّك بشكلٍ مختلف هنا</p>
      </section>

      <p className="pl-intro">{t('Radio, outdoor, print, publishers and the room, bought direct from the people who make them.')}</p>

      <section className="pl-buy" aria-labelledby="pl-buy-h">
        <h2 id="pl-buy-h" className="pl-label-h">{t('Reach programmatic can’t buy')}</h2>
        <div className="pl-buy-grid">{REACH.map(([n, k, d]) => <div key={n}><span className="pl-kicker">{n}</span><b className="pl-reach">{t(k)}</b><p>{t(d)}</p></div>)}</div>
      </section>

      <section className="pl-changes" aria-labelledby="pl-changes-h">
        <div className="pl-label"><h2 id="pl-changes-h">{t('What changes')}</h2><span>{t('For buyers and media outlets')}</span></div>
        {CHANGES.map(([n, w, d]) => <div key={n} className="pl-step">
          <span className="pl-n" aria-hidden>{n}</span>
          <b className="pl-word">{t(w)}{n === 'I' && <i className="pl-dot" aria-hidden />}</b>
          <p className="pl-step-d">{t(d)}</p>
        </div>)}
      </section>

      <RequestForm />
    </main>

    <footer className="pl-foot">
      <nav className="pl-foot-links" aria-label={t('Nashr')}>
        <a href="#request">{t('Let’s talk')}</a><a href="/privacy">{t('Privacy')}</a><a href="/terms">{t('Terms')}</a>
      </nav>
      <div className="pl-foot-end"><span dir="ltr">© Nashr {new Date().getFullYear()}</span><span lang="ar" dir="rtl">نشر</span></div>
    </footer>
  </div>
}

/** "Let's talk": who they are, name, company, work email and phone; Nashr's team approves and emails an invitation. */
function RequestForm() {
  const [side, setSide] = useState<'brand' | 'media_outlet'>('brand')
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '' })
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try { await api('/access-requests', { method: 'POST', body: { ...f, companyType: side } }); setSent(true) }
    catch (err: any) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <section className="pl-join" id="request" aria-labelledby="pl-join-h">
    <div className="pl-join-text">
      <h2 id="pl-join-h">{sent ? t('Request sent.') : t('Let’s talk')}</h2>
      {sent && <p>{t("Thanks. Nashr's team reviews every request and will email you an invite link once approved.")}</p>}
    </div>
    {!sent && <form className="pl-form" onSubmit={submit}>
      <div className="pl-field"><span className="pl-kicker" id="pl-iam">{t('I am')}</span>
        <div className="pl-tabs" role="radiogroup" aria-labelledby="pl-iam">
          {([['brand', t('Buyer')], ['media_outlet', t('Media outlet')]] as const).map(([v, l]) =>
            <button key={v} type="button" role="radio" aria-checked={side === v} className={side === v ? 'on' : ''} onClick={() => setSide(v)}>{l}</button>)}
        </div></div>
      <div className="pl-pair">
        <label className="pl-field"><span className="pl-kicker">{t('Name')}</span><input required autoComplete="name" value={f.name} onChange={set('name')} /></label>
        <label className="pl-field"><span className="pl-kicker">{t('Company')}</span><input required autoComplete="organization" value={f.company} onChange={set('company')} /></label>
        <label className="pl-field"><span className="pl-kicker">{t('Work email')}</span>
          <input type="email" dir="ltr" required autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} /></label>
        <label className="pl-field"><span className="pl-kicker">{t('Phone')}</span><input type="tel" dir="ltr" required autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
      </div>
      {error && <p className="pl-error" role="alert">{error}</p>}
      <button type="submit" className="pl-submit" disabled={busy}>{busy ? t('Sending…') : t('Submit')}</button>
    </form>}
  </section>
}
