import { navigate } from '../nav'
import { tm } from '../i18n-server'
import { useEffect, useState } from 'react'
import { api, upload, type Campaign, type CampaignBrief, type Client } from '../api'
import { dayLabel, money, slotWhen } from '../format'
import { Status } from '../bookings/Bookings'
import '../directory/directory.css'
import './campaigns.css'
import { PhotoBand } from '../PhotoBand'
import { IndustryPick } from '../IndustryPick'
import { OutletMark } from '../LogoPicker'
import { MEDIA_LABEL } from '../../../server/shared/media'
import { isAr, t } from '../i18n'

/*
 * Campaigns (owner's buyer-side fixes): the campaign is the plan. It has dates, an optional budget (the buyer's only) and one
 * brief that goes with every bid or request tagged to it. The plan lists products, each costed at its default price, and shows
 * how far each has got: Added, Bid placed, Accepted, Paid, Ran.
 */
const toFils = (aed: string) => Math.round(Number(aed.replace(/,/g, '')) * 100)
const dates = (c: Campaign) => c.startDate && c.endDate ? `${dayLabel(c.startDate, { day: 'numeric', month: 'short' })} – ${dayLabel(c.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''
const pct = (n: number, of: number | null) => `${Math.min(100, of ? (n / of) * 100 : 0)}%`

type Form = { name: string; clientId: string; budget: string; startDate: string; endDate: string; objective: string; brief: CampaignBrief & { fileName?: string } }
const BLANK_BRIEF: Form['brief'] = { advertiser: '', industry: '', message: '', language: 'english', languageOther: '', creativeToFollow: true, disclaimer: '', landingUrl: '' }
const formOf = (c?: Campaign): Form => c ? { name: c.name, clientId: c.clientId ?? '', budget: c.budget ? String(c.budget / 100) : '', startDate: c.startDate ?? '', endDate: c.endDate ?? '',
  objective: c.objective ?? '', brief: { ...BLANK_BRIEF, ...(c.brief ?? {}), fileName: c.brief?.draftFileKey ? t('File on record') : undefined } }
  : { name: '', clientId: '', budget: '', startDate: '', endDate: '', objective: '', brief: BLANK_BRIEF }

/** What is still missing before the campaign can be saved, in the order the form asks. */
function missing(f: Form): string | null {
  const b = f.brief
  if (!f.name.trim()) return t('Add the campaign name.')
  if (!f.startDate || !f.endDate) return t('Add the start and end dates.')
  if (f.endDate < f.startDate) return t('The end date must be on or after the start date.')
  if (f.budget && !(toFils(f.budget) > 0)) return t('The budget must be a number above zero, or left empty.')
  if (!b.advertiser.trim()) return t('Add the advertiser or brand.')
  if (!b.industry.trim()) return t('Choose the industry.')
  if (!b.message.trim()) return t('Say what the ad will say.')
  if (b.language === 'other' && !b.languageOther?.trim()) return t('Say which language the creative is in.')
  if (!b.draftFileKey && !b.creativeToFollow) return t('Upload the creative or tick "Creative to follow".')
  if (b.landingUrl && !/^https:\/\/\S+$/.test(b.landingUrl)) return t('The landing page link must start with https://.')
  return null
}

const bodyOf = (f: Form) => {
  const { fileName: _, ...b } = f.brief
  return { name: f.name.trim(), clientId: f.clientId || null, budget: f.budget ? toFils(f.budget) : null, startDate: f.startDate, endDate: f.endDate, objective: f.objective.trim() || null,
    brief: { ...b, languageOther: b.language === 'other' ? b.languageOther?.trim() : undefined, disclaimer: b.disclaimer?.trim() || undefined, landingUrl: b.landingUrl?.trim() || undefined,
      draftFileKey: b.draftFileKey || undefined, creativeToFollow: !b.draftFileKey || !!b.creativeToFollow } }
}

/** The campaign form: the campaign itself (buyer only), then the campaign brief (what publishers see). */
function CampaignForm({ initial, clients, onSaved, onCancel, id }: { initial: Form; clients: Client[]; onSaved: (id: string) => void; onCancel: () => void; id?: string }) {
  const [f, setF] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [tried, setTried] = useState(false), [uploading, setUploading] = useState(false)
  const b = f.brief, setB = (x: Partial<Form['brief']>) => setF({ ...f, brief: { ...b, ...x } }), problem = missing(f)
  function pickClient(cid: string) {
    const c = clients.find(x => x.id === cid)
    // a client fills in the advertiser (and its industry) when those are still empty
    setF({ ...f, clientId: cid, brief: c ? { ...b, advertiser: b.advertiser || c.name, industry: b.industry || c.industry || '' } : b })
  }
  async function file(x: File) {
    setUploading(true); setError('')
    try { const u = await upload(x); setB({ draftFileKey: `files/${u.id}`, fileName: u.name, creativeToFollow: false }) } catch (e: any) { setError(e.message) } finally { setUploading(false) }
  }
  async function save() {
    setTried(true); setError(''); if (problem) return
    setBusy(true)
    try {
      if (id) { await api(`/campaigns/${id}`, { method: 'PUT', body: bodyOf(f) }); onSaved(id) }
      else { const r = await api<{ id: string }>('/campaigns', { method: 'POST', body: bodyOf(f) }); onSaved(r.id) }
    } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  return <section className="card pad form cp-form">
    <h2>{id ? t('Edit campaign') : t('New campaign')}</h2>
    <div className="cp-sec"><h3>{t('The campaign')}</h3><p className="small muted">{t('Only your team sees these.')}</p></div>
    <div className="grid2">
      <div className="field"><label htmlFor="cp-n">{t('Name')} <span className="req">*</span></label><input id="cp-n" dir="auto" maxLength={200} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={t('Q4 business cards launch')} /></div>
      <div className="field"><label htmlFor="cp-c">{t('Client (optional)')}</label><select id="cp-c" value={f.clientId} onChange={e => pickClient(e.target.value)}>
        <option value="">{t('No client')}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <span className="small muted">{t('Publishers see the client as the advertiser.')}</span></div>
      <div className="field"><label htmlFor="cp-s">{t('Start date')} <span className="req">*</span></label><input id="cp-s" type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} /></div>
      <div className="field"><label htmlFor="cp-e">{t('End date')} <span className="req">*</span></label><input id="cp-e" type="date" min={f.startDate || undefined} value={f.endDate} onChange={e => setF({ ...f, endDate: e.target.value })} /></div>
      <div className="field"><label htmlFor="cp-b">{t('Budget (AED, excl. VAT, optional)')}</label><input id="cp-b" inputMode="decimal" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="150,000" />
        <span className="small muted">{t('Yours only: publishers never see it.')}</span></div>
      <div className="field"><label htmlFor="cp-o">{t('Objective (optional)')}</label><input id="cp-o" dir="auto" maxLength={500} value={f.objective} onChange={e => setF({ ...f, objective: e.target.value })} placeholder={t('Awareness, launch, footfall…')} /></div>
    </div>

    <div className="cp-sec"><h3>{t('Campaign brief')}</h3><p className="small muted">{t('Filled in once and sent with every bid or request in this campaign. Publishers see it before they decide.')}</p></div>
    <div className="grid2">
      <div className="field"><label htmlFor="cp-adv">{t('Advertiser or brand')} <span className="req">*</span></label><input id="cp-adv" dir="auto" maxLength={200} value={b.advertiser} onChange={e => setB({ advertiser: e.target.value })} /></div>
      <div className="field"><label htmlFor="cp-ind">{t('Industry')} <span className="req">*</span></label><IndustryPick id="cp-ind" value={b.industry} onChange={v => setB({ industry: v })} /></div>
    </div>
    <div className="field"><label htmlFor="cp-msg">{t('What the ad will say')} <span className="req">*</span> <span className="muted small">({b.message.length}/280)</span></label>
      <textarea id="cp-msg" dir="auto" rows={2} maxLength={280} value={b.message} onChange={e => setB({ message: e.target.value })} /></div>
    <div className="grid2">
      <div className="field"><label htmlFor="cp-lang">{t('Creative language')} <span className="req">*</span></label>
        <div className="ed-pick"><select id="cp-lang" value={b.language} onChange={e => setB({ language: e.target.value as CampaignBrief['language'] })}>
          <option value="english">{t('English')}</option><option value="arabic">{t('Arabic')}</option><option value="bilingual">{t('Bilingual')}</option><option value="other">{t('Other')}</option></select>
          {b.language === 'other' && <input aria-label={t('Which language')} placeholder={t('Which language')} dir="auto" maxLength={60} value={b.languageOther ?? ''} onChange={e => setB({ languageOther: e.target.value })} />}</div></div>
      <div className="field"><span className="label">{t('Creative')} <span className="req">*</span></span>
        <div className="cp-creative">
          <label className={`btn ${uploading ? 'disabled' : ''}`}><input type="file" className="visually-hidden" disabled={uploading} onChange={e => e.target.files?.[0] && file(e.target.files[0])} />
            {uploading ? t('Uploading…') : b.draftFileKey ? t('Replace file') : t('Upload a file')}</label>
          {b.draftFileKey && <span className="small"><bdi>{b.fileName}</bdi> <button type="button" className="linkish" onClick={() => setB({ draftFileKey: undefined, fileName: undefined, creativeToFollow: true })}>{t('Remove')}</button></span>}
          {!b.draftFileKey && <label className="check"><input type="checkbox" checked={!!b.creativeToFollow} onChange={e => setB({ creativeToFollow: e.target.checked })} /> {t('Creative to follow')}</label>}
        </div></div>
    </div>
    <div className="grid2">
      <div className="field"><label htmlFor="cp-dis">{t('Required disclaimer or licence number (optional)')}</label><input id="cp-dis" dir="auto" maxLength={500} value={b.disclaimer ?? ''} onChange={e => setB({ disclaimer: e.target.value })} /></div>
      <div className="field"><label htmlFor="cp-url">{t('Landing page link (optional, needed for websites)')}</label><input id="cp-url" dir="ltr" maxLength={500} placeholder="https://" value={b.landingUrl ?? ''} onChange={e => setB({ landingUrl: e.target.value })} /></div>
    </div>
    {(error || (tried && problem)) && <p className="error" role="alert">{error || problem}</p>}
    <div className="row-flex"><button className="btn primary" disabled={busy || uploading} onClick={save}>{busy ? t('Saving…') : id ? t('Save') : t('Create campaign')}</button>
      <button className="btn" onClick={onCancel}>{t('Cancel')}</button></div>
  </section>
}

export function CampaignsPage() {
  const [list, setList] = useState<Campaign[] | null>(null), [error, setError] = useState(''), [form, setForm] = useState(() => new URLSearchParams(location.search).get('new') === '1')
  const [clients, setClients] = useState<Client[]>([])
  useEffect(() => { api<Campaign[]>('/campaigns').then(setList, e => setError(e.message)); api<Client[]>('/clients').then(c => setClients(c.filter(x => x.status === 'active')), () => {}) }, [])
  return (
    <main>
      <PhotoBand img="/brand/campaigns-wide.jpg" title={t("Campaigns")} sub={t("Optional: plan products, dates and a budget, with one brief sent with every bid. You can always just bid.")}>
        {!form && <button className="btn primary" onClick={() => setForm(true)}>{t("New campaign")}</button>}
      </PhotoBand>
      {form && <CampaignForm initial={formOf()} clients={clients} onSaved={id => navigate(`/campaigns/${id}`)} onCancel={() => setForm(false)} />}
      {error && <p className="error">{error}</p>}
      {list && !list.length && !form && <p className="muted empty">{t("No campaigns yet. A campaign holds your dates, budget and brief; add products to it from the Directory or the Calendar.")}</p>}
      {list && list.length > 0 && <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Campaign")}</th><th>{t("Dates")}</th><th className="r">{t("Products")}</th>
        <th className="r">{t("Budget")}</th><th className="r">{t("Estimated")}</th><th className="r">{t("Committed")}</th><th>{t("Status")}</th></tr></thead>
        <tbody>{list.map(c => <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}>
          <td><a href={`/campaigns/${c.id}`} onClick={e => e.stopPropagation()}><b dir="auto">{c.name}</b></a>{(c.client || c.objective) && <div className="small muted">{[c.client, c.objective].filter(Boolean).join(' · ')}</div>}</td>
          <td className="num small">{dates(c) || '—'}</td><td className="r num">{c.lines}</td>
          <td className="r num">{c.budget ? money(c.budget) : '—'}</td><td className="r num">{money(c.estimated)}</td><td className="r num">{money(c.committed)}</td>
          <td className="small">{c.status === 'active' ? t('Active') : t('Completed')}</td></tr>)}</tbody></table></div>}
    </main>
  )
}

export type PlanLine = { placementId: string; productId: string; title: string; brand: string | null; name: string; kind: string; channel: string; logoUrl: string | null
  estimated: number; committed: number; stage: 'added' | 'bid' | 'accepted' | 'paid' | 'ran'; openSlots: number }
export type CampaignDetail = Campaign & { plan: PlanLine[]
  bookings: { id: string; ref: string; status: string; price: number; label: string; startsAt: string; outlet: string; channel: string; placement: string }[] }

export const STAGES: [PlanLine['stage'], string][] = [['added', 'Added'], ['bid', 'Bid placed'], ['accepted', 'Accepted'], ['paid', 'Paid'], ['ran', 'Ran']]
/** Where a product in the plan is: Added → Bid placed → Accepted → Paid → Ran. */
export const Stage = ({ s }: { s: PlanLine['stage'] }) => { const at = STAGES.findIndex(x => x[0] === s)
  return <ol className="cp-stage" aria-label={t('Stage: {stage}', { stage: t(STAGES[at][1]) })}>{STAGES.map(([k, l], i) =>
    <li key={k} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}><span>{t(l)}</span></li>)}</ol> }

/** Budget · Estimated · Committed · Remaining, and a bar of committed and estimated against the budget. */
export function Totals({ c }: { c: Campaign }) {
  return <><dl className="kpis cp-kpis">
    <div className="card"><dt>{t('Budget')}</dt><dd className="num">{c.budget ? money(c.budget) : '—'}</dd></div>
    <div className="card"><dt>{t('Estimated')}</dt><dd className="num">{money(c.estimated)}</dd></div>
    <div className="card"><dt>{t('Committed')}</dt><dd className="num">{money(c.committed)}</dd>{c.pending > 0 && <span className="small muted">{t('{amount} waiting for publishers', { amount: money(c.pending) })}</span>}</div>
    <div className="card"><dt>{t('Remaining')}</dt><dd className={`num ${c.remaining != null && c.remaining < 0 ? 'over' : ''}`}>{c.remaining == null ? '—' : money(c.remaining)}</dd></div>
  </dl>
  {c.budget ? <div className="bar cp-bar" role="img" aria-label={t('{a} committed and {b} estimated of a {c} budget', { a: money(c.committed), b: money(c.estimated), c: money(c.budget) })}>
    <i className="c" style={{ width: pct(c.committed, c.budget) }} /><i className="p" style={{ width: pct(Math.max(0, c.estimated - c.committed), c.budget) }} /></div> : null}</>
}

export function CampaignPage({ id }: { id: string }) {
  const [c, setC] = useState<CampaignDetail | null>(null), [error, setError] = useState(''), [editing, setEditing] = useState(false), [clients, setClients] = useState<Client[]>([]), [note, setNote] = useState('')
  const load = () => api<CampaignDetail>(`/campaigns/${id}`).then(setC, e => setError(e.message))
  useEffect(() => { load(); api<Client[]>('/clients').then(x => setClients(x.filter(y => y.status === 'active')), () => {}) }, [id])
  async function setStatus(status: 'active' | 'completed') { await api(`/campaigns/${id}`, { method: 'PUT', body: { status } }); load() }
  async function remove(l: PlanLine) { await api(`/campaigns/${id}/lines/${l.placementId}`, { method: 'DELETE' }); setNote(t('{name} taken out of the plan.', { name: l.title })); load() }
  if (!c) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  const book = `/calendar?campaign=${c.id}${c.startDate ? `&date=${c.startDate}` : ''}`
  return (
    <main className="narrow wide">
      <p className="small"><a href="/campaigns">{t("Campaigns")}</a> {isAr ? '‹' : '›'} <bdi>{c.name}</bdi></p>
      <div className="profile-h"><div><h1 dir="auto">{c.name}</h1><p className="muted">{[dates(c), c.client, c.objective].filter(Boolean).join(' · ')}</p></div>
        <div className="spacer" />
        {!editing && <button className="btn" onClick={() => setEditing(true)}>{t('Edit')}</button>}
        <a className="btn" href={`/campaigns/${c.id}/plan`}>{t("Media plan (PDF)")}</a>
        {c.status === 'active' ? <button className="btn" onClick={() => setStatus('completed')}>{t("Mark completed")}</button> : <button className="btn" onClick={() => setStatus('active')}>{t("Reopen")}</button>}
        {c.status === 'active' && <a className="btn primary" href={book}>{t("Book slots")}</a>}</div>
      {editing && <CampaignForm id={c.id} initial={formOf(c)} clients={clients} onSaved={() => { setEditing(false); setNote(t('Campaign saved.')); load() }} onCancel={() => setEditing(false)} />}
      {note && <p className="ok" role="status">{note}</p>}
      <Totals c={c} />
      <p className="small muted">{t('Prices excl. VAT. Estimated uses each product\'s default price; committed is what publishers accepted.')}</p>

      <div className="cp-h"><h2 className="sec-h">{t("Plan")}</h2><span className="spacer" /><a className="btn" href={`/directory?campaign=${c.id}`}>+ {t('Add products')}</a></div>
      {!c.plan.length ? <p className="muted empty">{t('No products yet. Add them from the Directory, or with "Add to campaign" when you open a slot in the Calendar.')}</p>
        : <div className="table-wrap card"><table className="table cp-plan"><thead><tr><th>{t("Product")}</th><th className="r">{t("Estimated cost")}</th><th>{t("Where it is")}</th><th className="r">{t("Committed")}</th><th><span className="sr-only">{t('Remove')}</span></th></tr></thead>
          <tbody>{c.plan.map(l => <tr key={l.placementId}>
            <td><span className="cp-prod"><OutletMark name={l.brand ?? l.name} url={l.logoUrl} size={34} /><span><b dir="auto">{l.title}</b>
              <span className="small muted">{t(MEDIA_LABEL[l.channel] ?? 'Other')}{l.openSlots > 0 ? ` · ${t('{n} on sale', { n: l.openSlots })}` : ''}</span></span></span></td>
            <td className="r num">{money(l.estimated)}</td><td><Stage s={l.stage} /></td><td className="r num">{l.committed ? money(l.committed) : '—'}</td>
            <td className="r">{l.stage === 'added' && <button className="btn sm" onClick={() => remove(l)} aria-label={t('Remove {name}', { name: l.title })}>{t('Remove')}</button>}</td>
          </tr>)}</tbody></table></div>}
      {c.plan.length > 0 && c.status === 'active' && <p className="small"><a href={book}>{t('See their dates in the Calendar')}</a></p>}

      <h2 className="sec-h">{t("Bookings")}</h2>
      {!c.bookings.length ? <p className="muted">{t("Nothing booked yet.")}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Order")}</th><th>{t("Listing")}</th><th>{t("Runs")}</th><th className="r">{t("Price")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{c.bookings.map(b => <tr key={b.id} onClick={() => (navigate(`/bookings/${b.id}`))}>
            <td className="num">{b.ref}</td><td><b>{b.outlet}</b> · {tm(b.label)}</td><td className="num">{slotWhen(b.startsAt, b.channel)}</td>
            <td className="r num">{money(b.price)}</td><td><Status s={b.status} /></td></tr>)}</tbody></table></div>}
      {c.bookings.length > 0 && <p className="small"><a href={`/results?campaign=${c.id}`}>{t('Results for this campaign')}</a></p>}
    </main>
  )
}
