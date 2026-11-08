import { useState } from 'react'
import { api } from './api'
import { ltr, t } from './i18n'

/**
 * The terms changed (or this person has never accepted them): before carrying on, they read and accept the version in force.
 * The acceptance is recorded with its version and time. Nashr staff signed in as someone never accept for them.
 */
export function TermsGate({ version, onDone }: { version: string; onDone: () => void }) {
  const [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function accept(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('/me/accept-terms', { method: 'POST', body: { version } }); onDone() } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return <main className="narrow terms-gate">
    <form className="card pad section form" onSubmit={accept}>
      <h1>{t('Our terms have been updated')}</h1>
      <p>{t('Please read and accept them to carry on using Nashr. They cover how bookings, payments and refunds work, and how an issue between a buyer and a publisher is resolved while the payment is held.')}</p>
      <ul className="gate-links">
        <li><a href="/terms" target="_blank" rel="noopener">{t('Terms of use')}</a></li>
        <li><a href="/dispute-policy" target="_blank" rel="noopener">{t('Disputes and payment protection')}</a></li>
        <li><a href="/refunds" target="_blank" rel="noopener">{t('Refunds and cancellations')}</a></li>
        <li><a href="/privacy" target="_blank" rel="noopener">{t('Privacy policy')}</a></li>
      </ul>
      <label className="check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> {t('I have read the terms and accept them for myself and the company I act for.')}</label>
      <p className="small muted">{t('Version {v}', { v: ltr(version) })}</p>
      <button className="btn primary" style={{ justifySelf: 'start' }} disabled={!agree || busy}>{t('Accept and continue')}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </main>
}
