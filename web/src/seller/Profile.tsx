import { useEffect, useState } from 'react'
import './business.css'
import { api, upload } from '../api'
import { navigate } from '../nav'
import { PhotoBand } from '../PhotoBand'
import { Team } from '../Team'
import { useNeedsTwoStep } from '../twoStep'
import { t } from '../i18n'
import { CompanyProfileEditor } from '../CompanyCard'

type Outlet = { id: string; name: string; nameAr: string | null; channel: string; sectors: string[]; description: string | null; website: string | null; audience: string | null; coverUrl: string | null; logoUrl: string | null
  audiences: string[]; blockedIndustries: string[]; blockedAdvertisers: string[]; reach: number | null }
type P = { company: { name: string; trn: string | null; address: string | null; vatRegistered: boolean; invoiceMode: string; payoutsEnabled: boolean; rateCard: { fileId: string; name: string } | null }; outlets: Outlet[] }

type Sec = 'profile' | 'outlets' | 'payouts' | 'tax' | 'ratecard' | 'team'
const SECTIONS: [Sec, string, string][] = [
  ['profile', 'Business profile', 'M4 21V5a2 2 0 0 1 2-2h8l6 6v12zM9 13h6M9 17h6'],
  ['payouts', 'Payout account', 'M3 7h18v10H3zM3 11h18M7 15h3'],
  ['tax', 'Tax and invoices', 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6'],
  ['ratecard', 'Rate card', 'M7 3h7l5 5v13H7zM14 3v5h5'],
  ['team', 'Team', 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15 3.1a3.5 3.5 0 0 1 0 6.8'],
]
const Ic = ({ d }: { d: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>

/**
 * Your business (owner's feedback: less scrolling, easier to use): a status strip of what is set up, a menu of sections on the
 * side, and one section at a time. Outlets show as cards; each opens its own form in short tabs.
 */
export function ProfilePage() {
  const [p, setP] = useState<P | null>(null), [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const [tax, setTax] = useState({ trn: '', vatRegistered: false, invoiceMode: 'generate', address: '' })
  const [sec, setSecState] = useState<Sec | null>(() => (new URLSearchParams(location.search).get('s') as Sec) || null)
  const setSec = (x: Sec) => { setSecState(x); setNote(''); setError(''); const u = new URL(location.href); u.searchParams.set('s', x); history.replaceState(null, '', u) }
  const load = () => api<P>('/seller/profile').then(x => { setP(x); setTax({ trn: x.company.trn ?? '', vatRegistered: x.company.vatRegistered, invoiceMode: x.company.invoiceMode, address: x.company.address ?? '' }) }, e => setError(e.message))
  useEffect(() => { load() }, [])
  // products are added and edited on the Products page; an old address for the outlet form here goes there
  useEffect(() => { if (sec === 'outlets') navigate('/listings', true) }, [sec])
  async function act(method: string, path: string, body: object, done: string) {
    setBusy(true); setError(''); setNote('')
    try { await api(path, { method, body }); setNote(done); await load(); return true } catch (e: any) { setError(e.message); return false } finally { setBusy(false) }
  }
  // With Stripe, connecting opens Stripe's own pages (bank details and identity), then comes back here; without it (the demo),
  // the account is verified at once.
  async function connect() {
    setBusy(true); setError(''); setNote('')
    try {
      const r = await api<{ url?: string; ok?: boolean }>('/seller/payouts/connect', { method: 'POST', body: {} })
      if (r.url) { location.href = r.url; return }
      setNote(t('Payout account verified.')); await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  useEffect(() => {
    const back = new URLSearchParams(location.search).get('payouts')
    if (!back) return
    setSecState('payouts'); history.replaceState(null, '', location.pathname + '?s=payouts')
    if (back === 'retry') { setError(t('The payout set-up link expired. Press Connect payout account to continue where you left off.')); return }
    api<{ payoutsEnabled: boolean }>('/seller/payouts/refresh', { method: 'POST', body: {} }).then(r => {
      setNote(r.payoutsEnabled ? t('Payout account verified.') : t('Thanks. Stripe is checking your details; this page updates once your payout account is verified.')); load()
    }, e => setError(e.message))
  }, [])
  const needsTwoStep = useNeedsTwoStep(!!p && !p.company.payoutsEnabled)
  if (!p) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const done: Record<Sec, boolean | null> = { profile: null, outlets: p.outlets.length > 0, payouts: p.company.payoutsEnabled, tax: !!p.company.trn || !p.company.vatRegistered ? !!p.company.address : false, ratecard: !!p.company.rateCard, team: null }
  const first = (['payouts', 'tax'] as Sec[]).find(k => !done[k])
  const cur: Sec = sec ?? first ?? 'profile'
  const STATUS: [Sec, string, string, boolean][] = [
    ['payouts', t('Payout account'), p.company.payoutsEnabled ? t('Verified') : t('Not connected'), p.company.payoutsEnabled],
    ['tax', t('Tax details'), p.company.trn ? t('TRN {trn}', { trn: p.company.trn }) : p.company.vatRegistered ? t('TRN missing') : t('Not VAT-registered'), !!done.tax],
    ['outlets', t('Products'), p.outlets.length ? (p.outlets.length === 1 ? p.outlets[0].name : t('{n} products', { n: p.outlets.length })) : t('None yet'), p.outlets.length > 0],
    ['ratecard', t('Rate card'), p.company.rateCard ? t('Shared with Nashr') : t('Not shared'), !!p.company.rateCard],
  ]
  return (
    <main className="biz">
      <PhotoBand title={t('Your business')} sub={t('How buyers see you, where your money goes, and who works with you. Pick a section.')} />
      <ul className="biz-status">{STATUS.map(([k, l, v, ok]) =>
        <li key={k}><button type="button" className={`${ok ? 'ok' : 'todo'} ${cur === k ? 'on' : ''}`} onClick={() => k === 'outlets' ? navigate('/listings') : setSec(k)}>
          <span className="biz-dot" aria-hidden>{ok ? '✓' : '!'}</span><span><b>{l}</b><span className="small">{v}</span></span></button></li>)}</ul>
      <div className="biz-grid">
        <nav className="biz-nav card" aria-label={t('Sections')}>{SECTIONS.map(([k, l, d]) =>
          <button key={k} type="button" className={cur === k ? 'on' : ''} aria-current={cur === k ? 'page' : undefined} onClick={() => setSec(k)}>
            <Ic d={d} /><span>{t(l)}</span>{done[k] === false && <span className="biz-need" aria-label={t('Needs setting up')} />}</button>)}</nav>
        <div className="biz-body">
          {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
          {cur === 'profile' && <CompanyProfileEditor audience="buyers" />}

          {cur === 'payouts' && <section className="card pad biz-sec">
            <h2>{t("Payout account")}</h2>
            {p.company.payoutsEnabled ? <div className="biz-ok"><span className="biz-dot ok" aria-hidden>✓</span><div><b>{t('Verified')}</b><p className="muted">{t('Released money is transferred to it automatically. See what is held and paid under Balances.')}</p>
              <a className="btn" href="/earnings">{t('Open Balances')}</a></div></div> : <>
              <p>{t("Connect the bank account Nashr pays you into. Verification is done by the payment provider; Nashr never sees your bank login.")}</p>
              {needsTwoStep ? <p className="warn small">{t('Before connecting where your money goes, turn on two-step sign-in to protect your account.')} <a href="/account">{t('Turn it on')}</a></p>
              : <button className="btn primary" disabled={busy} onClick={connect}>{t("Connect payout account")}</button>}</>}
          </section>}

          {cur === 'tax' && <section className="card pad biz-sec form">
            <h2>{t("Tax and invoices")}</h2>
            <label className="check"><input type="checkbox" checked={tax.vatRegistered} onChange={e => setTax({ ...tax, vatRegistered: e.target.checked })} />{t(" We are VAT-registered (5% VAT is added for buyers)")}</label>
            <div className="grid2">
              <div className="field"><label htmlFor="trn">{t("TRN (15 digits)")}</label><input id="trn" inputMode="numeric" maxLength={15} value={tax.trn} onChange={e => setTax({ ...tax, trn: e.target.value.replace(/\D/g, '') })} /></div>
              <div className="field"><label htmlFor="im">{t("Tax invoices to buyers")}</label><select id="im" value={tax.invoiceMode} onChange={e => setTax({ ...tax, invoiceMode: e.target.value })}>
                <option value="generate">{t("Nashr issues them in our name and TRN")}</option><option value="upload">{t("We upload our own")}</option></select></div>
            </div>
            <div className="field"><label htmlFor="addr">{t('Registered address')}</label>
              <textarea id="addr" rows={3} maxLength={300} value={tax.address} aria-describedby="addr-help" onChange={e => setTax({ ...tax, address: e.target.value })} />
              <span id="addr-help" className="small muted">{t('As on your trade licence. It is printed on the tax invoices issued in your name.')}</span></div>
            <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => act('PUT', '/seller/company', { ...tax, trn: tax.trn || undefined }, t("Tax details saved."))}>{t("Save")}</button>
          </section>}

          {cur === 'ratecard' && <RateCard card={p.company.rateCard} onChange={load} />}
          {cur === 'team' && <Team side="publisher" />}
        </div>
      </div>
    </main>
  )
}

/** The rate card the publisher shares with Nashr: any file (PDF, spreadsheet or image), replaceable at any time. Buyers don't see it. */
function RateCard({ card, onChange }: { card: { fileId: string; name: string } | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('')
  async function pick(file: File) {
    setBusy(true); setError(''); setNote('')
    try { const f = await upload(file); await api('/seller/rate-card', { method: 'PUT', body: { fileId: f.id } }); setNote(t('Rate card saved. Nashr uses it to set up your placements.')); onChange() }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError(''); setNote('')
    try { await api('/seller/rate-card', { method: 'DELETE' }); setNote(t('Rate card removed.')); onChange() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="card pad biz-sec">
    <h2>{t('Rate card')}</h2>
    <p className="muted">{t('Share your current rate card so Nashr can help set up your placements and prices. Only Nashr sees it.')}</p>
    {card ? <div className="file-row"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M7 3h7l5 5v13H7zM14 3v5h5" /></svg>
      <a href={`/api/files/${card.fileId}`}><bdi>{card.name}</bdi></a><span className="spacer" />
      <label className={`btn ${busy ? 'disabled' : ''}`}><input type="file" className="visually-hidden" disabled={busy} accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg" onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />{t('Replace')}</label>
      <button className="btn" disabled={busy} onClick={remove}>{t('Remove')}</button></div>
    : <label className={`dropzone ${busy ? 'disabled' : ''}`}><input type="file" className="visually-hidden" disabled={busy} accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg" onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />
        <b>{busy ? t('Uploading…') : t('Upload your rate card')}</b><span className="small muted">{t('PDF, spreadsheet or image')}</span></label>}
    {error && <p className="error small" role="alert">{error}</p>}{note && <p className="ok small" role="status">{note}</p>}
  </section>
}
