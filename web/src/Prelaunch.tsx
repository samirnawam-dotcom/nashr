import { useEffect, useState } from 'react'
import { api } from './api'
import { LangSwitch, isAr, t } from './i18n'
import { Logo } from './Logo'
import './prelaunch.css'

/*
 * The page visitors see before release (owner's "Nashr landing page"): what Nashr is, what changes for buyers and media
 * outlets, what you can buy, and a request for access. The request is a real one (Access, for Nashr's team to approve):
 * once approved the person gets an invitation, signs in, and sees the whole site.
 */
const STEPS: [string, string, string, string][] = [
  ['I', 'Find', 'Every open date in one place.', 'Fill your dates faster.'],
  ['II', 'Book', 'Bid, buy or make an offer.', 'Sell your way.'],
  ['III', 'Brief', 'Send it once, with every bid.', 'Know what you\'re accepting.'],
  ['IV', 'Pay', 'Only when they say yes.', 'Guaranteed once it runs.'],
]
const BUY: [string, string, string][] = [
  ['I', 'Radio', 'Ad breaks and sponsored shows'],
  ['II', 'TV', 'Ad spots and sponsored shows'],
  ['III', 'Print', 'Newspapers and magazines'],
  ['IV', 'Digital', 'Websites and newsletters'],
  ['V', 'Audio & social', 'Podcasts and social media'],
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
        <a href="#request" className="pl-cta">{t('Request access')}</a>
      </nav>
    </header>

    <main>
      <section className="pl-hero" aria-label={t('Nashr')}>
        <h1 lang="en" dir="ltr">media moves differently here.</h1>
        <p className="pl-h1-ar" lang="ar" dir="rtl" aria-hidden={!isAr || undefined}>الإعلام يتحرّك بشكلٍ مختلف هنا</p>
      </section>

      <div className="pl-rule"><span>{t('The marketplace for premium media buying')}</span><span>{t('United Arab Emirates · KSA soon')}</span></div>
      <p className="pl-intro">{t('Nashr is where brands, agencies and PR teams book advertising with UAE media, and where media outlets sell it. No rate cards to chase, no back-and-forth on email.')}</p>

      <section className="pl-changes" aria-labelledby="pl-changes-h">
        <div className="pl-label"><h2 id="pl-changes-h">{t('What changes')}</h2><span>{t('For buyers and media outlets')}</span></div>
        {STEPS.map(([n, w, buyers, outlets]) => <div key={n} className="pl-step">
          <span className="pl-n" aria-hidden>{n}</span>
          <b className="pl-word">{t(w)}{n === 'I' && <i className="pl-dot" aria-hidden />}</b>
          <div><span className="pl-kicker">{t('Buyers')}</span><p>{t(buyers)}</p></div>
          <div><span className="pl-kicker">{t('Outlets')}</span><p>{t(outlets)}</p></div>
        </div>)}
      </section>

      <section className="pl-buy" aria-labelledby="pl-buy-h">
        <h2 id="pl-buy-h" className="pl-label-h">{t('What you can buy')}</h2>
        <div className="pl-buy-grid">{BUY.map(([n, k, d]) => <div key={n}><span className="pl-kicker">{n} · {t(k)}</span><p>{t(d)}</p></div>)}</div>
      </section>

      <RequestForm />
    </main>

    <footer className="pl-foot"><span dir="ltr">© {new Date().getFullYear()} Nashr</span><span dir="ltr">nashr.pro</span></footer>
  </div>
}

/** "Be first in.": who they are and a work email first; then the few details Nashr's team needs to approve them. */
function RequestForm() {
  const [side, setSide] = useState<'brand' | 'media_outlet'>('brand')
  const [f, setF] = useState({ email: '', name: '', company: '', phone: '', role: '' })
  const [step, setStep] = useState<1 | 2 | 3>(1), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (step === 1) { setStep(2); return }
    setBusy(true)
    try { await api('/access-requests', { method: 'POST', body: { ...f, companyType: side } }); setStep(3) }
    catch (err: any) { setError(err.message); if (/email/i.test(err.message)) setStep(1) }
    finally { setBusy(false) }
  }
  return <section className="pl-join" id="request" aria-labelledby="pl-join-h">
    <div className="pl-join-text">
      <h2 id="pl-join-h">{step === 3 ? t('Request sent.') : t('Be first in.')}</h2>
      <p>{step === 3 ? t("Thanks. Nashr's team reviews every request and will email you an invite link once approved.")
        : t('Nashr is opening to buyers and media outlets in the UAE. Request early access and we\'ll be in touch.')}</p>
    </div>
    {step !== 3 && <form className="pl-form" onSubmit={submit}>
      <div className="pl-field"><span className="pl-kicker" id="pl-iam">{t('I am')}</span>
        <div className="pl-tabs" role="radiogroup" aria-labelledby="pl-iam">
          {([['brand', t('Buyer')], ['media_outlet', t('Media outlet')]] as const).map(([v, l]) =>
            <button key={v} type="button" role="radio" aria-checked={side === v} className={side === v ? 'on' : ''} onClick={() => setSide(v)}>{l}</button>)}
        </div></div>
      <label className="pl-field"><span className="pl-kicker">{t('Work email')}</span>
        <input type="email" dir="ltr" required autoComplete="email" inputMode="email" placeholder="you@company.com" value={f.email} onChange={set('email')} /></label>
      {step === 2 && <>
        <label className="pl-field"><span className="pl-kicker">{t('Full name')}</span><input required autoComplete="name" value={f.name} onChange={set('name')} autoFocus /></label>
        <label className="pl-field"><span className="pl-kicker">{t('Company')}</span><input required autoComplete="organization" value={f.company} onChange={set('company')} /></label>
        <label className="pl-field"><span className="pl-kicker">{t('Your role')}</span><input required autoComplete="organization-title" value={f.role} onChange={set('role')} /></label>
        <label className="pl-field"><span className="pl-kicker">{t('Phone')}</span><input type="tel" dir="ltr" required autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
      </>}
      {error && <p className="pl-error" role="alert">{error}</p>}
      <button type="submit" className="pl-submit" disabled={busy}>{busy ? t('Sending…') : step === 1 ? t('Request access') : t('Send request')}</button>
      {step === 2 && <p className="pl-note">{t('Nashr is invite-only. We review every request and email you an invitation.')}</p>}
    </form>}
  </section>
}
