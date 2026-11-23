import { GLOSSARY, Tip } from '../onboarding/Onboarding'
import { navigate } from '../nav'
import { tm } from '../i18n-server'
import { useEffect, useState } from 'react'
import { api, upload, type Campaign, type CampaignBrief, type Client } from '../api'
import { dayLabel, money, slotWhen } from '../format'
import { addDays, dubai, todayInDubai } from '../calendar/layout'
import { BidDrawer } from '../calendar/BidDrawer'
import { STATUS, type TrackStatus } from '../calendar/Tracker'
import { DatesPanel } from '../directory/Shop'
import { ResultsPage } from '../insights/Results'
import '../calendar/tracker.css'
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
const BLANK_BRIEF: Form['brief'] = { advertiser: '', industry: '', message: '', language: 'english', languageOther: '', disclaimer: '', landingUrl: '' }
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
  if (!b.draftFileKey) return t('Upload the creative.') // it goes with every bid: a seller never accepts something blind
  if (b.landingUrl && !/^https:\/\/\S+$/.test(b.landingUrl)) return t('The landing page link must start with https://.')
  return null
}

const bodyOf = (f: Form) => {
  const { fileName: _, ...b } = f.brief
  return { name: f.name.trim(), clientId: f.clientId || null, budget: f.budget ? toFils(f.budget) : null, startDate: f.startDate, endDate: f.endDate, objective: f.objective.trim() || null,
    brief: { ...b, languageOther: b.language === 'other' ? b.languageOther?.trim() : undefined, disclaimer: b.disclaimer?.trim() || undefined, landingUrl: b.landingUrl?.trim() || undefined,
      draftFileKey: b.draftFileKey || undefined, creativeToFollow: undefined } }
}

/** The campaign form: the campaign itself (buyer only), then the campaign brief (what publishers see). */
function CampaignForm({ initial, clients, onSaved, onCancel, id, title }: { initial: Form; clients: Client[]; onSaved: (id: string) => void; onCancel: () => void; id?: string; title?: string }) {
  const [f, setF] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [tried, setTried] = useState(false), [uploading, setUploading] = useState(false)
  const b = f.brief, setB = (x: Partial<Form['brief']>) => setF({ ...f, brief: { ...b, ...x } }), problem = missing(f)
  function pickClient(cid: string) {
    const c = clients.find(x => x.id === cid)
    // a client fills in the advertiser (and its industry) when those are still empty
    setF({ ...f, clientId: cid, brief: c ? { ...b, advertiser: b.advertiser || c.name, industry: b.industry || c.industry || '' } : b })
  }
  async function file(x: File) {
    setUploading(true); setError('')
    try { const u = await upload(x); setB({ draftFileKey: `files/${u.id}`, fileName: u.name }) } catch (e: any) { setError(e.message) } finally { setUploading(false) }
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
    <h2>{title ?? (id ? t('Edit campaign') : t('New campaign'))}</h2>
    <div className="cp-sec"><h3>{t('The campaign')}</h3><p className="small muted">{t('Only your team sees these.')}</p></div>
    <div className="grid2">
      <div className="field"><label htmlFor="cp-n">{t('Name')} <span className="req">*</span></label><input id="cp-n" dir="auto" maxLength={200} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={t('Q4 business cards launch')} /></div>
      <div className="field"><label htmlFor="cp-c">{t('Client (optional)')}</label><select id="cp-c" value={f.clientId} onChange={e => pickClient(e.target.value)}>
        <option value="">{t('No client')}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <span className="small muted">{t('Publishers see the client as the advertiser.')}</span></div>
      <div className="field"><label htmlFor="cp-s">{t('Start date')} <span className="req">*</span></label><input id="cp-s" type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} /></div>
      <div className="field"><label htmlFor="cp-e">{t('End date')} <span className="req">*</span></label><input id="cp-e" type="date" min={f.startDate || undefined} value={f.endDate} onChange={e => setF({ ...f, endDate: e.target.value })} /></div>
      <div className="field"><label htmlFor="cp-b">{t('Budget (AED, excl. VAT, optional)')}</label><input id="cp-b" inputMode="decimal" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="150,000" />
        <span className="small muted">{t('Only you see this. Sellers never see your budget.')}</span></div>
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
          {b.draftFileKey && <span className="small"><bdi>{b.fileName}</bdi> <button type="button" className="linkish" onClick={() => setB({ draftFileKey: undefined, fileName: undefined })}>{t('Remove')}</button></span>}
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

// ---- the list: Cards | List, Active · Upcoming · Finished · All (owner's "Buying moves to the Directory") ----------------
export type Phase = 'upcoming' | 'active' | 'finished'
/** Status from the dates, never typed: Upcoming before the start, Active between the dates, Finished after the end (or marked done). */
export function phaseOf(c: Campaign, today = todayInDubai()): Phase {
  if (c.status === 'completed' || (c.endDate && c.endDate < today)) return 'finished'
  return c.startDate && c.startDate > today ? 'upcoming' : 'active'
}
const PHASE: Record<Phase, string> = { upcoming: t('Upcoming'), active: t('Active'), finished: t('Finished') }
export const PhasePill = ({ c }: { c: Campaign }) => { const p = phaseOf(c); return <span className={`cp-phase ph-${p}`}>{PHASE[p]}</span> }

/** One bar in three parts: committed (solid), estimated (light), what is left (empty), with the numbers under it. */
export function BudgetBar({ c, big }: { c: Campaign; big?: boolean }) {
  const extra = Math.max(0, c.estimated - c.committed), scale = c.budget ?? Math.max(c.committed + extra, 1)
  const w = (n: number) => `${Math.min(100, (n / scale) * 100)}%`
  return <div className={`cp-budget ${big ? 'big' : ''}`}>
    <div className="cp-track" role="img" aria-label={c.budget ? t('{a} committed and {b} estimated of a {c} budget', { a: money(c.committed), b: money(c.estimated), c: money(c.budget) })
      : t('{a} committed and {b} estimated, no budget set', { a: money(c.committed), b: money(c.estimated) })}>
      <i className="c" style={{ width: w(c.committed) }} /><i className="e" style={{ width: w(extra) }} /></div>
    <p className="small"><span><b className="num">{money(c.committed)}</b> {t('committed')}<Tip text={GLOSSARY.committed} label={t('Committed')} /></span> · <span><b className="num">{money(c.estimated)}</b> {t('estimated')}<Tip text={GLOSSARY.estimated} label={t('Estimated')} /></span>
      {' · '}{c.budget ? <span><b className="num">{money(c.budget)}</b> {t('budget')}</span> : <span className="muted">{t('No budget set')}</span>}</p>
  </div>
}
/** Where things are, in small counts: "3 added · 2 bids · 1 paid · 1 ran". */
const countsText = (c: Campaign) => { const n = c.counts; if (!n) return ''
  return [n.added && t('{n} added', { n: n.added }), n.bids && (n.bids === 1 ? t('1 bid') : t('{n} bids', { n: n.bids })), n.pay && t('{n} to pay', { n: n.pay }),
    n.paid && t('{n} paid', { n: n.paid }), n.ran && t('{n} ran', { n: n.ran })].filter(Boolean).join(' · ') }
/** The next thing to do, if any: "Pay Skyline FM by Thu", "Bid closes in 6h", "Check proof from Gulf News". */
export const nextText = (c: Campaign) => { const x = c.next; if (!x) return null
  const day = x.due ? dayLabel(dubai(x.due).date, { weekday: 'short' }) : ''
  if (x.kind === 'pay') return x.due ? t('Pay {outlet} by {day}', { outlet: x.outlet, day }) : t('Pay {outlet}', { outlet: x.outlet })
  if (x.kind === 'proof') return t('Check proof from {outlet}', { outlet: x.outlet })
  const h = x.due ? Math.max(0, Math.round((new Date(x.due).getTime() - Date.now()) / 3_600_000)) : null
  return h != null && h < 48 ? t('Bid closes in {h}h', { h }) : t('Bid closes {day}', { day }) }

export function CampaignsPage() {
  const [list, setList] = useState<Campaign[] | null>(null), [error, setError] = useState(''), [form, setForm] = useState(() => new URLSearchParams(location.search).get('new') === '1')
  const [clients, setClients] = useState<Client[]>([])
  const [tab, setTab] = useState<Phase | 'all'>('active')
  const [layout, setLayout] = useState<'cards' | 'list'>(() => { try { return localStorage.getItem('nashr:cp-view') === 'list' ? 'list' : 'cards' } catch { return 'cards' } })
  useEffect(() => { try { localStorage.setItem('nashr:cp-view', layout) } catch { /* fine */ } }, [layout])
  useEffect(() => { api<Campaign[]>('/campaigns').then(l => { setList(l)
      // open on a tab that has something: Active, else Upcoming, else All
      if (!l.some(c => phaseOf(c) === 'active')) setTab(l.some(c => phaseOf(c) === 'upcoming') ? 'upcoming' : 'all') }, e => setError(e.message))
    api<Client[]>('/clients').then(c => setClients(c.filter(x => x.status === 'active')), () => {}) }, [])
  const shown = (list ?? []).filter(c => tab === 'all' || phaseOf(c) === tab)
  const n = (p: Phase) => (list ?? []).filter(c => phaseOf(c) === p).length
  const TABS: [Phase | 'all', string][] = [['active', t('Active')], ['upcoming', t('Upcoming')], ['finished', t('Finished')], ['all', t('All')]]
  return (
    <main>
      <PhotoBand img="/brand/campaigns-wide.jpg" title={t("Campaigns")} sub={t("A campaign keeps one budget and one brief for many bids.")}>
        {!form && <button className="btn primary" onClick={() => setForm(true)}>{t("New campaign")}</button>}
      </PhotoBand>
      {form && <CampaignForm initial={formOf()} clients={clients} onSaved={id => navigate(`/campaigns/${id}`)} onCancel={() => setForm(false)} />}
      {error && <p className="error">{error}</p>}
      {list && !list.length && !form && <div className="card cp-empty"><p>{t('No campaigns yet. A campaign keeps one budget and one brief for many bids.')}</p>
        <button className="btn primary" onClick={() => setForm(true)}>{t('New campaign')}</button></div>}
      {list && list.length > 0 && <>
        <div className="cp-bar-row">
          <div className="tabs profile-tabs" role="tablist" aria-label={t('Campaigns')}>{TABS.map(([k, l]) =>
            <button key={k} role="tab" type="button" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k !== 'all' && n(k) > 0 && <span className="count">{n(k)}</span>}</button>)}</div>
          <span className="spacer" />
          <div className="seg" role="group" aria-label={t('View')}>
            <button className={layout === 'cards' ? 'on' : ''} onClick={() => setLayout('cards')}>{t('Cards')}</button>
            <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}>{t('List')}</button></div>
        </div>
        {!shown.length && <p className="muted">{tab === 'upcoming' ? t('No upcoming campaigns.') : tab === 'finished' ? t('No finished campaigns yet.') : t('No active campaigns right now.')}</p>}
        {layout === 'cards' ? <div className="cp-cards">{shown.map(c => <article key={c.id} className="card cp-card" onClick={() => navigate(`/campaigns/${c.id}`)}>
            <div className="cp-card-h">
              {c.client ? <OutletMark name={c.client} url={c.clientLogoUrl} size={36} /> : null}
              <div className="cp-card-name"><a href={`/campaigns/${c.id}`} onClick={e => e.stopPropagation()}><b dir="auto">{c.name}</b></a>
                {c.client && <span className="small muted" dir="auto">{c.client}</span>}</div>
              <PhasePill c={c} /></div>
            {c.objective && <p className="small muted cp-obj" dir="auto">{c.objective}</p>}
            <p className="cp-dates num">{dates(c)}</p>
            <BudgetBar c={c} />
            {countsText(c) && <p className="small">{countsText(c)}</p>}
            {nextText(c) && <p className="cp-next small"><b>{nextText(c)}</b></p>}
          </article>)}</div>
        : shown.length > 0 && <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Campaign")}</th><th>{t("Dates")}</th><th>{t('Budget')}</th>
            <th className="r">{t("Committed")}</th><th className="r">{t("Estimated")}</th><th className="r">{t("Remaining")}</th><th>{t('Next thing to do')}</th><th>{t("Status")}</th></tr></thead>
            <tbody>{shown.map(c => <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}>
              <td><a href={`/campaigns/${c.id}`} onClick={e => e.stopPropagation()}><b dir="auto">{c.name}</b></a>{c.client && <div className="small muted">{c.client}</div>}</td>
              <td className="num small">{dates(c)}</td><td className="cp-mini"><MiniBar c={c} /></td>
              <td className="r num">{money(c.committed)}</td><td className="r num">{money(c.estimated)}</td><td className="r num">{c.remaining == null ? '—' : money(c.remaining)}</td>
              <td className="small">{nextText(c) ?? <span className="muted">—</span>}</td><td><PhasePill c={c} /></td></tr>)}</tbody></table></div>}
      </>}
    </main>
  )
}
const MiniBar = ({ c }: { c: Campaign }) => { const extra = Math.max(0, c.estimated - c.committed), scale = c.budget ?? Math.max(c.committed + extra, 1)
  return <div className="cp-track mini" aria-hidden><i className="c" style={{ width: `${Math.min(100, c.committed / scale * 100)}%` }} /><i className="e" style={{ width: `${Math.min(100, extra / scale * 100)}%` }} /></div> }

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

type PlanItem = { placementId: string; product: string; brand: string; brandKey: string; channel: string; logoUrl: string | null; label: string | null
  status: TrackStatus; at: string; price: number | null; deadline: string | null; slotId: string | null; dealId: string | null }

export function CampaignPage({ id }: { id: string }) {
  const [c, setC] = useState<CampaignDetail | null>(null), [error, setError] = useState(''), [clients, setClients] = useState<Client[]>([]), [note, setNote] = useState('')
  const [tab, setTabRaw] = useState<'plan' | 'brief' | 'results'>(() => { const v = new URLSearchParams(location.search).get('tab'); return v === 'brief' || v === 'results' ? v : 'plan' })
  const setTab = (v: typeof tab) => { setTabRaw(v); const q = new URLSearchParams(location.search); v === 'plan' ? q.delete('tab') : q.set('tab', v); history.replaceState(history.state, '', `${location.pathname}${q.size ? `?${q}` : ''}`) }
  const [items, setItems] = useState<PlanItem[] | null>(null), [slot, setSlot] = useState<string | null>(null), [pick, setPick] = useState<{ placementId: string; title: string } | null>(null)
  const [reload, setReload] = useState(0), [formKey, setFormKey] = useState(0)
  const load = () => api<CampaignDetail>(`/campaigns/${id}`).then(setC, e => setError(e.message))
  useEffect(() => { load(); api<Client[]>('/clients').then(x => setClients(x.filter(y => y.status === 'active')), () => {}) }, [id, reload])
  // the plan: this campaign's products, bids and bookings, each with its date, price and status (the Calendar's words)
  useEffect(() => { if (!c) return
    const from = addDays(c.startDate ?? todayInDubai(), -400), to = addDays(c.endDate ?? todayInDubai(), 400)
    api<{ items: PlanItem[] }>(`/buyer/tracker?campaign=${id}&from=${from}T00:00:00%2B04:00&to=${to}T00:00:00%2B04:00`).then(r => setItems(r.items), () => setItems([])) }, [c?.id, c?.lines, reload])
  async function remove(i: PlanItem) { await api(`/campaigns/${id}/lines/${i.placementId}`, { method: 'DELETE' }); setNote(t('{name} taken out of the plan.', { name: `${i.brand} · ${i.product}` })); setReload(n => n + 1) }
  if (!c) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>
  // + Add products: the Directory's products, on sale within the campaign's dates, for its industry
  const add = `/directory?view=products&campaign=${c.id}${c.startDate ? `&df=${c.startDate}` : ''}${c.endDate ? `&dt=${c.endDate}` : ''}${c.brief?.industry ? `&sectors=${encodeURIComponent(c.brief.industry)}` : ''}`
  const groups = [...new Set((items ?? []).map(i => i.brandKey))].map(k => (items ?? []).filter(i => i.brandKey === k))
  const step = (i: PlanItem) => i.status === 'added' || i.status === 'outbid' ? <button className="btn sm primary" onClick={() => i.slotId ? setSlot(i.slotId) : setPick({ placementId: i.placementId, title: `${i.brand} · ${i.product}` })}>{t('Bid')}</button>
    : i.status === 'pay' && i.dealId ? <a className="btn sm primary" href={`/bookings/${i.dealId}`}>{t('Pay now')}</a>
    : i.status === 'ran' && i.dealId ? <a className="btn sm primary" href={`/bookings/${i.dealId}`}>{t('Check proof')}</a>
    : i.dealId ? <a className="btn sm" href={`/bookings/${i.dealId}`}>{t('Open')}</a> : i.slotId ? <button className="btn sm" onClick={() => setSlot(i.slotId)}>{t('Open')}</button> : null
  return (
    <main className="narrow wide">
      <p className="small"><a href="/campaigns">{t("Campaigns")}</a> {isAr ? '‹' : '›'} <bdi>{c.name}</bdi></p>
      <header className="cp-head">
        <div className="cp-head-t">{c.client && <OutletMark name={c.client} url={c.clientLogoUrl} size={48} />}
          <div><h1 dir="auto">{c.name}</h1><p className="muted">{[c.client, dates(c), c.objective].filter(Boolean).join(' · ')}</p></div>
          <PhasePill c={c} /><span className="spacer" />
          <a className="btn" href={`/campaigns/${c.id}/plan`}>{t("Media plan (PDF)")}</a></div>
        <BudgetBar c={c} big />
        {nextText(c) && <p className="cp-next"><b>{nextText(c)}</b></p>}
      </header>
      {note && <p className="ok" role="status">{note}</p>}
      <div className="tabs profile-tabs" role="tablist" aria-label={c.name}>{([['plan', t('Plan')], ['brief', t('Brief')], ['results', t('Results')]] as [typeof tab, string][]).map(([k, l]) =>
        <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'plan' && <>
        <div className="cp-h"><a className="btn primary" href={add}>+ {t('Add products')}</a><span className="spacer" /><a href={`/calendar?campaign=${c.id}${c.startDate ? `&date=${c.startDate}` : ''}`}>{t('View in Calendar')}</a></div>
        {!items ? <p className="muted">{t('Loading…')}</p> : !items.length ? <div className="card cp-empty"><p>{t('No products yet. Add them from the Directory: they show here with their dates, prices and status.')}</p>
            <a className="btn primary" href={add}>+ {t('Add products')}</a></div>
          : groups.map(g => <section key={g[0].brandKey} className="card cp-group">
            <h3 className="cp-gh"><OutletMark name={g[0].brand} url={g[0].logoUrl} size={30} /><bdi>{g[0].brand}</bdi></h3>
            <ul className="cp-lines">{g.map(i => <li key={`${i.status}-${i.slotId ?? i.placementId}-${i.dealId ?? ''}`}>
              <span className="cp-l-what"><b dir="auto">{i.product}</b><span className="small muted">{slotWhen(i.at, i.channel)}{i.label && i.label !== i.product ? ` · ${tm(i.label)}` : ''}</span></span>
              <span className="num cp-l-price">{i.price != null ? money(i.price) : '—'}{i.status === 'added' && <small>{t('Estimated')}</small>}</span>
              <span className={`tk-item s-${i.status} demo cp-l-st`}>{STATUS.find(x => x[0] === i.status)![1]}</span>
              <span className="cp-l-act">{step(i)}{i.status === 'added' && <button className="btn sm" onClick={() => remove(i)} aria-label={t('Remove {name}', { name: `${i.brand} · ${i.product}` })}>{t('Remove')}</button>}</span>
            </li>)}</ul></section>)}
        <p className="small muted">{t("Prices excl. VAT. Estimated is a product's listed price; committed is what publishers accepted.")}</p>
      </>}
      {tab === 'brief' && <CampaignForm key={formKey} id={c.id} title={t('Brief')} initial={formOf(c)} clients={clients}
        onSaved={() => { setNote(t('Campaign saved.')); setReload(n => n + 1) }} onCancel={() => setFormKey(k => k + 1)} />}
      {tab === 'results' && <ResultsPage fixedCampaign={c.id} />}

      {pick && <DatesPanel placementId={pick.placementId} title={pick.title} onClose={() => setPick(null)} onPick={sid => { setPick(null); setSlot(sid) }} />}
      {slot && <BidDrawer slotId={slot} onClose={() => setSlot(null)} onDone={() => setReload(n => n + 1)} />}
    </main>
  )
}
