import { useEffect, useState, type ReactNode } from 'react'
import { api, upload } from '../api'
import { dayLabel } from '../format'
import { navigate } from '../nav'
import { t } from '../i18n'
import { tm } from '../i18n-server'
import { AudiencePicker } from '../Audiences'
import { todayInDubai } from '../calendar/layout'
import { money, when } from './common'
import { COVERAGE_DELIVERABLES, COVERAGE_FORMATS, COVERAGE_FREQUENCY, COVERAGE_KINDS, COVERAGE_MARKETS, COVERAGE_PLATFORMS, COVERAGE_SOCIAL, COVERAGE_TYPES,
  coverageProblems, coverageTotal, type CoverageData } from '../../../server/shared/coverage'
import './portal.css'
import './coverage.css'

/*
 * Media coverage submission (owner's prototype): a publisher offers a programme, show or coverage opportunity with its
 * details, audience, deliverables, platforms and price; Nashr's team reviews it; once approved it goes on sale on its dates.
 */
export type Coverage = { id: string; outletId: string; outlet: string | null; company?: string | null; status: string; data: CoverageData
  createdAt: string; updatedAt: string; submittedAt: string | null; decidedAt: string | null; decisionNote: string | null; placementId: string | null }

export const COVERAGE_STATUS: Record<string, [string, string]> = {
  draft: ['Draft', 'mute'], submitted: ['With Nashr for review', 'warn'], changes_requested: ['Changes asked', 'bad'], approved: ['Approved, on sale', 'good'], rejected: ['Declined', 'mute'],
}
export const CoverageStatus = ({ s }: { s: string }) => <span className={`pt-pill ${COVERAGE_STATUS[s]?.[1] ?? 'mute'}`}>{t(COVERAGE_STATUS[s]?.[0] ?? s)}</span>
export const fileSize = (n: number) => n < 1_048_576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1_048_576).toFixed(1)} MB`
const name = (l: readonly (readonly [string, string])[], k?: string) => t(l.find(x => x[0] === k)?.[1] ?? k ?? '')

export function CoverageListPage() {
  const [list, setList] = useState<Coverage[] | null>(null), [error, setError] = useState('')
  useEffect(() => { api<Coverage[]>('/seller/coverage').then(setList, e => setError(e.message)) }, [])
  return <main className="cov">
    <header className="cov-head"><div><h1>{t('Media coverage')}</h1>
      <p className="muted">{t('Offer a programme, show or coverage opportunity. Nashr reviews it, then it goes on sale on its dates.')}</p></div>
      <a className="btn primary" href="/coverage/new">+ {t('New coverage submission')}</a></header>
    {error && <p className="error">{error}</p>}
    {list && !list.length && <div className="card pad cov-empty"><p><b>{t('No coverage submissions yet.')}</b></p>
      <p className="muted">{t('Sponsored interviews, event coverage, feature segments: describe it once and Nashr puts it in front of buyers.')}</p>
      <a className="btn primary" href="/coverage/new">{t('New coverage submission')}</a></div>}
    {list && list.length > 0 && <div className="card table-wrap"><table className="table cov-table">
      <thead><tr><th>{t('Programme')}</th><th>{t('Outlet')}</th><th>{t('Dates')}</th><th className="r">{t('Total price')}</th><th>{t('Status')}</th></tr></thead>
      <tbody>{list.map(c => <tr key={c.id} onClick={() => navigate(`/coverage/${c.id}`)}>
        <td><a href={`/coverage/${c.id}`}><b>{c.data.name || t('Untitled')}</b></a><div className="small muted">{name(COVERAGE_TYPES, c.data.type)}</div></td>
        <td>{c.outlet}</td>
        <td className="small">{(c.data.dates ?? []).slice(0, 3).map(d => dayLabel(d, { day: 'numeric', month: 'short' })).join(', ')}{(c.data.dates?.length ?? 0) > 3 ? ` +${c.data.dates!.length - 3}` : ''}</td>
        <td className="r num">{c.data.price ? money(coverageTotal(c.data)) : '—'}</td>
        <td><CoverageStatus s={c.status} /></td></tr>)}</tbody></table></div>}
  </main>
}

const Sec = ({ title, children }: { title: string; children: ReactNode }) => <section className="cov-sec card"><h2>{title}</h2>{children}</section>
const Err = ({ msg }: { msg?: string }) => msg ? <p className="field-err" role="alert">{t(msg)}</p> : null
const Count = ({ n, max }: { n: number; max: number }) => <span className={`small ${n > max ? 'warn-t' : 'muted'} cov-count`}>{n}/{max}</span>

export function CoverageFormPage({ id }: { id?: string }) {
  const [c, setC] = useState<Coverage | null>(null), [d, setD] = useState<CoverageData>({ saleType: 'fixed', markets: ['UAE'] })
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]), [outletId, setOutletId] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState(''), [tried, setTried] = useState(false), [newDate, setNewDate] = useState('')
  const [socialOn, setSocialOn] = useState(false)
  useEffect(() => {
    api<{ outlets: { id: string; name: string }[] }>('/seller/profile').then(p => { setOutlets(p.outlets); setOutletId(o => o || p.outlets[0]?.id || '') }, () => {})
    if (id) api<Coverage>(`/seller/coverage/${id}`).then(r => { setC(r); setD(r.data); setOutletId(r.outletId); setSocialOn(Object.keys(r.data.social ?? {}).length > 0) }, e => setError(e.message))
  }, [id])
  const locked = !!c && !['draft', 'changes_requested'].includes(c.status)
  const today = todayInDubai(), problems = coverageProblems(d, today), err = (f: string) => tried ? problems.find(p => p[0] === f)?.[1] : undefined
  const set = <K extends keyof CoverageData>(k: K, v: CoverageData[K]) => setD(x => ({ ...x, [k]: v }))
  const toggle = (k: 'kinds' | 'deliverables' | 'platforms' | 'markets', v: string) => set(k, (d[k] ?? []).includes(v) ? (d[k] ?? []).filter(x => x !== v) : [...(d[k] ?? []), v])
  const num = (v: string) => v === '' ? undefined : Math.max(0, Math.round(Number(v.replace(/,/g, ''))))
  const aed = (v: string) => v === '' ? undefined : Math.round(Number(v.replace(/,/g, '')) * 100)

  async function save(submit: boolean) {
    setError(''); setNote('')
    if (submit) { setTried(true); if (problems.length) { setError(t('Fix the {n} highlighted fields, then submit.', { n: problems.length })); document.querySelector('.field-err')?.scrollIntoView({ block: 'center' }); return } }
    if (!outletId) { setError(t('Choose one of your outlets.')); return }
    setBusy(true)
    try {
      const body = { outletId, data: { ...d, social: socialOn ? d.social : undefined } }
      let r = c ? await api<Coverage>(`/seller/coverage/${c.id}`, { method: 'PUT', body }) : await api<Coverage>('/seller/coverage', { method: 'POST', body })
      if (submit) r = await api<Coverage>(`/seller/coverage/${r.id}/submit`, { method: 'POST', body: {} })
      setC(r); setD(r.data)
      if (!c) history.replaceState(null, '', `/coverage/${r.id}`)
      setNote(submit ? t('Submitted. Nashr reviews it and tells you here and by email.') : t('Draft saved.'))
    } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true); setError('')
    try { const added = []; for (const f of [...files].slice(0, 10 - (d.files?.length ?? 0))) { const u = await upload(f); added.push({ id: u.id, name: u.name, size: u.size }) }
      set('files', [...(d.files ?? []), ...added]) } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  if (id && !c) return <main className="cov">{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const outletName = outlets.find(o => o.id === outletId)?.name ?? c?.outlet ?? ''
  const step = !c || c.status === 'draft' || c.status === 'changes_requested' ? 0 : c.status === 'submitted' ? 1 : 2

  return <main className="cov">
    <p className="small"><a href="/coverage">{t('Media coverage')}</a></p>
    <header className="cov-head"><div><h1>{t('Media coverage submission')}</h1>
      <p className="muted">{outletName ? t('Add a programme, show or coverage opportunity for {outlet}.', { outlet: outletName }) : t('Add a programme, show or coverage opportunity.')}</p></div>
      {c && <CoverageStatus s={c.status} />}</header>
    <ol className="cov-steps" aria-label={t('Where this submission is')}>
      {[t('Draft'), t('With Nashr for review'), c?.status === 'rejected' ? t('Declined') : t('Approved, on sale')].map((l, i) => <li key={i} className={i < step ? 'done' : i === step ? 'now' : ''}>{l}</li>)}</ol>
    {c?.decisionNote && <p className={c.status === 'approved' ? 'ok' : 'warn'}>{t('Note from Nashr: {note}', { note: c.decisionNote })}</p>}
    {c?.status === 'approved' && c.placementId && <p className="ok">{t('It is on sale as a product.')} <a href={`/listings/${c.placementId}/edit`}>{t('Open the product')}</a> · <a href="/schedule?view=list">{t('See it on the calendar')}</a></p>}

    <fieldset className="cov-grid" disabled={locked || busy}>
      <div className="cov-col">
        <Sec title={t('Programme')}>
          {outlets.length > 1 && <div className="field"><label htmlFor="cv-o">{t('Outlet')}</label><select id="cv-o" value={outletId} onChange={e => setOutletId(e.target.value)}>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
          <div className="field"><label htmlFor="cv-n">{t('Programme or show name')} <span className="req">*</span></label>
            <input id="cv-n" dir="auto" maxLength={120} value={d.name ?? ''} onChange={e => set('name', e.target.value)} placeholder={t('Market Close')} /><Err msg={err('name')} /></div>
          <div className="cov-2">
            <div className="field"><label htmlFor="cv-t">{t('Type')} <span className="req">*</span></label><select id="cv-t" value={d.type ?? ''} onChange={e => set('type', e.target.value || undefined)}>
              <option value="">{t('Choose…')}</option>{COVERAGE_TYPES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select><Err msg={err('type')} /></div>
            <div className="field"><label htmlFor="cv-e">{t('Episode or edition')}</label><input id="cv-e" dir="auto" maxLength={120} value={d.episode ?? ''} onChange={e => set('episode', e.target.value)} /></div>
          </div>
          <div className="cov-3">
            <div className="field"><label htmlFor="cv-f">{t('Format')} <span className="req">*</span></label><select id="cv-f" value={d.format ?? ''} onChange={e => set('format', e.target.value || undefined)}>
              <option value="">{t('Choose…')}</option>{COVERAGE_FORMATS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select><Err msg={err('format')} /></div>
            <div className="field"><label htmlFor="cv-du">{t('Duration (min)')} <span className="req">*</span></label>
              <input id="cv-du" inputMode="numeric" value={d.durationMin ?? ''} onChange={e => set('durationMin', num(e.target.value) || undefined)} placeholder="30" /><Err msg={err('durationMin')} /></div>
            <div className="field"><label htmlFor="cv-fr">{t('Frequency')} <span className="req">*</span></label><select id="cv-fr" value={d.frequency ?? ''} onChange={e => set('frequency', e.target.value || undefined)}>
              <option value="">{t('Choose…')}</option>{COVERAGE_FREQUENCY.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select><Err msg={err('frequency')} /></div>
          </div>
          <div className="field"><label htmlFor="cv-l">{t('Language')}</label><select id="cv-l" value={d.language ?? ''} onChange={e => set('language', (e.target.value || undefined) as any)}>
            <option value="">{t('Choose…')}</option>{[['english', 'English'], ['arabic', 'Arabic'], ['both', 'English and Arabic']].map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></div>
        </Sec>

        <Sec title={t('Coverage details')}>
          <div className="field"><span className="lbl">{t('Coverage dates')} <span className="req">*</span></span>
            <div className="row-flex"><input type="date" aria-label={t('Add a date')} min={today} value={newDate} onChange={e => setNewDate(e.target.value)} />
              <button type="button" className="btn" disabled={!newDate || (d.dates ?? []).includes(newDate) || (d.dates?.length ?? 0) >= 31}
                onClick={() => { set('dates', [...(d.dates ?? []), newDate].sort()); setNewDate('') }}>{t('Add date')}</button></div>
            {(d.dates?.length ?? 0) > 0 && <ul className="cov-chips">{d.dates!.map(x => <li key={x}>{dayLabel(x, { weekday: 'short', day: 'numeric', month: 'short' })}
              <button type="button" aria-label={t('Remove {date}', { date: dayLabel(x) })} onClick={() => set('dates', d.dates!.filter(y => y !== x))}>×</button></li>)}</ul>}
            <Err msg={err('dates')} /></div>
          <div className="cov-2">
            <div className="field"><label htmlFor="cv-tm">{t('Time (UAE)')} <span className="req">*</span></label><input id="cv-tm" type="time" value={d.time ?? ''} onChange={e => set('time', e.target.value || undefined)} /><Err msg={err('time')} /></div>
            <div className="field"><label htmlFor="cv-v">{t('Venue or location')}</label><input id="cv-v" dir="auto" maxLength={160} value={d.venue ?? ''} onChange={e => set('venue', e.target.value)} placeholder={t('Dubai studio')} /></div>
          </div>
          <div className="field"><span className="lbl">{t('Coverage type')} <span className="req">*</span></span>
            <div className="aud-pick" role="group" aria-label={t('Coverage type')}>{COVERAGE_KINDS.map(([k, l]) => <Chip key={k} on={(d.kinds ?? []).includes(k)} onChange={() => toggle('kinds', k)} id={`cv-k-${k}`}>{t(l)}</Chip>)}</div>
            <Err msg={err('kinds')} /></div>
        </Sec>

        <Sec title={t('Editorial angle and description')}>
          <div className="field"><label htmlFor="cv-a">{t('Editorial angle or key message')} <span className="req">*</span></label>
            <textarea id="cv-a" dir="auto" rows={2} maxLength={300} value={d.angle ?? ''} onChange={e => set('angle', e.target.value)} placeholder={t('UAE economic outlook and private sector growth.')} />
            <Count n={d.angle?.length ?? 0} max={300} /><Err msg={err('angle')} /></div>
          <div className="field"><label htmlFor="cv-d">{t('Full description')}</label>
            <textarea id="cv-d" dir="auto" rows={4} maxLength={1000} value={d.description ?? ''} onChange={e => set('description', e.target.value)} />
            <Count n={d.description?.length ?? 0} max={1000} /></div>
        </Sec>
      </div>

      <div className="cov-col">
        <Sec title={t('Audience and reach')}>
          <div className="field"><label htmlFor="cv-r">{t('Estimated reach')} <span className="req">*</span></label>
            <input id="cv-r" inputMode="numeric" value={d.reach ? d.reach.toLocaleString('en-US') : ''} onChange={e => set('reach', num(e.target.value) || undefined)} placeholder="250,000" />
            <span className="small muted">{t('Average viewers, listeners or readers per airing or edition.')}</span><Err msg={err('reach')} /></div>
          <div className="field"><label htmlFor="cv-ap">{t('Audience profile')}</label><input id="cv-ap" dir="auto" maxLength={200} value={d.audienceProfile ?? ''} onChange={e => set('audienceProfile', e.target.value)} placeholder={t('Business professionals')} /></div>
          <div className="field"><span className="lbl">{t('Markets')}</span><div className="aud-pick" role="group" aria-label={t('Markets')}>
            {COVERAGE_MARKETS.map(([k, l]) => <Chip key={k} on={(d.markets ?? []).includes(k)} onChange={() => toggle('markets', k)} id={`cv-m-${k}`}>{t(l)}</Chip>)}</div></div>
          <div className="field"><span className="lbl">{t('Who it reaches (buyers filter by these)')}</span>
            <AudiencePicker idPrefix="cv-aud" value={d.audiences ?? []} onChange={v => set('audiences', v)} /></div>
        </Sec>

        <Sec title={t('Deliverables')}>
          <div className="field"><span className="lbl">{t('What the buyer gets')} <span className="req">*</span></span>
            <div className="cov-checks" role="group" aria-label={t('Deliverables')}>{COVERAGE_DELIVERABLES.map(([k, l]) =>
              <label key={k} htmlFor={`cv-dl-${k}`}><input id={`cv-dl-${k}`} type="checkbox" checked={(d.deliverables ?? []).includes(k)} onChange={() => toggle('deliverables', k)} />{t(l)}</label>)}</div>
            <Err msg={err('deliverables')} /></div>
          {(d.deliverables ?? []).includes('other') && <div className="field"><label htmlFor="cv-do">{t('Other deliverable')}</label>
            <input id="cv-do" dir="auto" maxLength={160} value={d.deliverablesOther ?? ''} onChange={e => set('deliverablesOther', e.target.value)} /><Err msg={err('deliverablesOther')} /></div>}
        </Sec>

        <Sec title={t('Platforms')}>
          <div className="field"><span className="lbl">{t('Where will this coverage appear?')} <span className="req">*</span></span>
            <div className="aud-pick" role="group" aria-label={t('Platforms')}>{COVERAGE_PLATFORMS.map(([k, l]) => <Chip key={k} on={(d.platforms ?? []).includes(k)} onChange={() => toggle('platforms', k)} id={`cv-p-${k}`}>{t(l)}</Chip>)}</div>
            <Err msg={err('platforms')} /></div>
          <label className="cov-switch" htmlFor="cv-so"><input id="cv-so" type="checkbox" role="switch" checked={socialOn} onChange={e => setSocialOn(e.target.checked)} />
            <span><b>{t('Add social media coverage')}</b><span className="small muted">{t('Extend it across Instagram, TikTok, X and YouTube. Each price is added to the total.')}</span></span></label>
          {socialOn && <div className="cov-social">{COVERAGE_SOCIAL.map(([k, l]) => <div className="field" key={k}><label htmlFor={`cv-s-${k}`}>{t('{platform} (AED)', { platform: l })}</label>
            <input id={`cv-s-${k}`} inputMode="decimal" value={d.social?.[k] != null ? String(d.social[k] / 100) : ''} placeholder={t('Not offered')}
              onChange={e => { const v = aed(e.target.value), next = { ...(d.social ?? {}) }; if (v) next[k] = v; else delete next[k]; set('social', next) }} /></div>)}</div>}
        </Sec>
      </div>

      <div className="cov-col">
        <Sec title={t('Pricing')}>
          <div className="field"><label htmlFor="cv-pr">{t('Base price (AED, excl. VAT)')} <span className="req">*</span></label>
            <input id="cv-pr" inputMode="decimal" value={d.price != null ? String(d.price / 100) : ''} onChange={e => set('price', aed(e.target.value))} placeholder="20000" /><Err msg={err('price')} /></div>
          <div className="field"><span className="lbl">{t('Sells as')} <span className="req">*</span></span>
            <div className="seg cov-seg" role="radiogroup" aria-label={t('Sells as')}>{([['fixed', t('Fixed price')], ['auction', t('Bidding')]] as const).map(([k, l]) =>
              <button type="button" key={k} role="radio" aria-checked={d.saleType === k} className={d.saleType === k ? 'on' : ''} onClick={() => set('saleType', k)}>{l}</button>)}</div>
            <span className="small muted">{d.saleType === 'auction' ? t('Buyers bid up from the total price.') : t('The first buyer to book at the total price gets it, once you confirm.')}</span></div>
          <div className="field"><label htmlFor="cv-sp">{t('Sponsorship type')}</label><input id="cv-sp" dir="auto" maxLength={120} value={d.sponsorship ?? ''} onChange={e => set('sponsorship', e.target.value)} placeholder={t('Segment sponsorship')} /></div>
          <div className="cov-total"><span>{socialOn && Object.keys(d.social ?? {}).length ? t('Total price, social included') : t('Total price')}</span><b className="num">{money(coverageTotal({ ...d, social: socialOn ? d.social : {} }))}</b></div>
        </Sec>

        <Sec title={t('Attachments')}>
          {(d.files?.length ?? 0) > 0 && <ul className="sp-files">{d.files!.map(f => <li key={f.id}><span className="sp-ic" aria-hidden>{f.name.split('.').pop()?.slice(0, 4).toUpperCase()}</span>
            <span><b className="cov-fname">{f.name}</b><span className="small muted">{fileSize(f.size)}</span></span>
            {!locked ? <button type="button" className="btn" onClick={() => set('files', d.files!.filter(x => x.id !== f.id))}>{t('Remove')}</button> : <a className="btn" href={`/api/files/${f.id}`}>{t('Download')}</a>}</li>)}</ul>}
          {!locked && (d.files?.length ?? 0) < 10 && <label className="cov-drop" htmlFor="cv-files"
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
            <input id="cv-files" type="file" multiple accept=".pdf,.ppt,.pptx,.jpg,.jpeg,.png,.doc,.docx" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            <b>{t('Drop files here, or choose them')}</b><span className="small muted">{t('Media kit, audience data, past coverage. PDF, PowerPoint, Word, JPG or PNG; up to 10 files.')}</span></label>}
        </Sec>

        <Sec title={t('Internal notes')}>
          <div className="field"><label htmlFor="cv-in" className="small muted">{t('Only Nashr’s team sees these.')}</label>
            <textarea id="cv-in" dir="auto" rows={3} maxLength={500} value={d.notes ?? ''} onChange={e => set('notes', e.target.value)} /><Count n={d.notes?.length ?? 0} max={500} /></div>
        </Sec>
      </div>
    </fieldset>

    {!locked && <div className="cov-bar">
      <div className="cov-bar-msg">{error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
        {!error && !note && <span className="small muted">{t('Fields marked * are needed to submit. Drafts can be saved any time.')}</span>}</div>
      <button type="button" className="btn" disabled={busy} onClick={() => save(false)}>{t('Save draft')}</button>
      <button type="button" className="btn primary" disabled={busy} onClick={() => save(true)}>{t('Submit for approval')}</button></div>}
    {locked && (error || note) && <div className="cov-bar">{error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}</div>}
  </main>
}

const Chip = ({ on, onChange, id, children }: { on: boolean; onChange: () => void; id: string; children: ReactNode }) =>
  <label className={`aud-chip ${on ? 'on' : ''}`} htmlFor={id}><input id={id} type="checkbox" checked={on} onChange={onChange} />{children}</label>

/** A read-only summary for Nashr's review page: every answer, grouped as the form groups them. */
export function CoverageSummary({ c }: { c: Coverage }) {
  const d = c.data, list = (l: readonly (readonly [string, string])[], ks?: string[]) => (ks ?? []).map(k => name(l, k)).join(', ') || '—'
  const row = (k: string, v: ReactNode) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>
  return <div className="cov-summary">
    <section className="card pad"><h2>{t('Programme')}</h2><dl className="facts">
      {row(t('Name'), [d.name, d.episode].filter(Boolean).join(' · '))}{row(t('Type'), name(COVERAGE_TYPES, d.type))}{row(t('Format'), name(COVERAGE_FORMATS, d.format))}
      {row(t('Duration'), d.durationMin ? t('{n} min', { n: d.durationMin }) : '')}{row(t('Frequency'), name(COVERAGE_FREQUENCY, d.frequency))}</dl></section>
    <section className="card pad"><h2>{t('Coverage details')}</h2><dl className="facts">
      {row(t('Dates'), (d.dates ?? []).map(x => dayLabel(x)).join(', '))}{row(t('Time (UAE)'), d.time)}{row(t('Venue or location'), d.venue)}{row(t('Coverage type'), list(COVERAGE_KINDS, d.kinds))}
      {row(t('Editorial angle or key message'), d.angle)}{row(t('Full description'), d.description)}</dl></section>
    <section className="card pad"><h2>{t('Audience, deliverables and platforms')}</h2><dl className="facts">
      {row(t('Estimated reach'), d.reach?.toLocaleString('en-US'))}{row(t('Audience profile'), d.audienceProfile)}{row(t('Markets'), list(COVERAGE_MARKETS, d.markets))}
      {row(t('Deliverables'), [list(COVERAGE_DELIVERABLES, (d.deliverables ?? []).filter(x => x !== 'other')), d.deliverablesOther].filter(Boolean).join(', '))}
      {row(t('Platforms'), list(COVERAGE_PLATFORMS, d.platforms))}
      {row(t('Social add-ons'), COVERAGE_SOCIAL.filter(([k]) => d.social?.[k]).map(([k, l]) => `${l} ${money(d.social![k])}`).join(', '))}</dl></section>
    <section className="card pad"><h2>{t('Pricing')}</h2><dl className="facts">
      {row(t('Base price'), d.price ? money(d.price) : '')}{row(t('Total price'), money(coverageTotal(d)))}{row(t('Sells as'), d.saleType === 'auction' ? t('Bidding') : t('Fixed price'))}{row(t('Sponsorship type'), d.sponsorship)}</dl></section>
    {(d.files?.length ?? 0) > 0 && <section className="card pad"><h2>{t('Attachments')}</h2><ul className="sp-files">{d.files!.map(f => <li key={f.id}><span className="sp-ic" aria-hidden>{f.name.split('.').pop()?.slice(0, 4).toUpperCase()}</span>
      <span><b className="cov-fname">{f.name}</b><span className="small muted">{fileSize(f.size)}</span></span><a className="btn" href={`/api/files/${f.id}`}>{t('Download')}</a></li>)}</ul></section>}
    {d.notes && <section className="card pad"><h2>{t('Internal notes')}</h2><p>{d.notes}</p></section>}
    <p className="small muted">{c.submittedAt ? t('Submitted {when}', { when: when(c.submittedAt) }) : ''}</p>
  </div>
}
