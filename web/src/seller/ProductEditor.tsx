import { useEffect, useState } from 'react'
import { api } from '../api'
import { navigate } from '../nav'
import { t } from '../i18n'
import { tm } from '../i18n-server'
import { ICON, art } from '../media'
import { money } from './common'
import { LogoPicker, OutletMark } from '../LogoPicker'
import { INDUSTRIES } from '../calendar/BidDrawer'
import { AudiencePicker } from '../Audiences'
import { AUDIENCES } from '../../../server/shared/audiences'
import { CoverPicker } from '../CoverPicker'
import { MEDIA, MEDIA_LABEL } from '../../../server/shared/media'
import { HAS_PROGRAMMES, LANGUAGES, MARKETS, OTHER, PROGRAMME_FIELDS, REACH_UNITS, SPEC_TYPES, TYPE_FIELDS, WEEKDAY_SETS, deadlineProblem, fieldProblems, label, mediaProblems,
  type Field, type MediaInput, type Opt } from '../../../server/shared/products'
import { ListingPanel, byProgramme as soldByProgramme, mediaName, productTitle, type Media, type Product, type Sellable } from './Listing'
import { Ic, daysText, onSale } from './Products'
import './products.css'
import './editor.css'

/*
 * An outlet's page (owner's fixes round 2). The outlet is the brand: its name, logo, description and anything else buyers should
 * know. Under it are its products, one per media type it sells (a radio station, a newspaper, a website), grouped by media type;
 * a product row opens into a summary of what the publisher filled in. Radio, TV and podcast products can be sold by programme.
 * Every pick-list ends with Other, which opens a box for the publisher's own words.
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const Err = ({ m }: { m?: string }) => m ? <p className="field-err" role="alert">{/^Fill in /.test(m) ? t('Fill this in.') : t(m)}</p> : null
const keys = (o: Opt[]) => o.map(x => x[0])

/** A single pick with Other: a value that is not one of the options is the publisher's own text. */
function Pick({ id, value, options, onChange, placeholder }: { id: string; value: string; options: Opt[]; onChange: (v: string) => void; placeholder?: string }) {
  const known = keys(options).includes(value), other = !!value && !known || value === OTHER
  const [own, setOwn] = useState(other && value !== OTHER ? value : '')
  return <div className="ed-pick">
    <select id={id} value={other ? OTHER : value} onChange={e => { const v = e.target.value; onChange(v === OTHER ? (own || OTHER) : v) }}>
      <option value="">{t('Choose…')}</option>{options.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
    {other && <input aria-label={t('Other: say what it is')} placeholder={placeholder ?? t('Say what it is')} dir="auto" maxLength={60} value={own}
      onChange={e => { setOwn(e.target.value); onChange(e.target.value.trim() || OTHER) }} />}
  </div>
}
/** Several picks with Other: ticked options plus the publisher's own words as extra chips. */
function Multi({ idp, value, options, onChange, label }: { idp: string; value: string[]; options: Opt[]; onChange: (v: string[]) => void; label: string }) {
  const [own, setOwn] = useState(''), [open, setOpen] = useState(false), list = options.filter(o => o[0] !== OTHER)
  const extra = value.filter(v => !keys(list).includes(v))
  const add = () => { const v = own.trim(); if (v && !value.includes(v)) onChange([...value, v]); setOwn('') }
  return <div className="aud-pick" role="group" aria-label={label}>
    {list.map(([k, l]) => { const on = value.includes(k)
      return <label key={k} className={`aud-chip ${on ? 'on' : ''}`} htmlFor={`${idp}-${k}`}><input id={`${idp}-${k}`} type="checkbox" checked={on} onChange={() => onChange(on ? value.filter(x => x !== k) : [...value, k])} />{t(l)}</label> })}
    {extra.map(v => <span key={v} className="aud-chip on">{v}<button type="button" className="ed-x" aria-label={t('Remove {name}', { name: v })} onClick={() => onChange(value.filter(x => x !== v))}>×</button></span>)}
    {!open ? <button type="button" className="aud-chip" onClick={() => setOpen(true)}>+ {t('Other')}</button>
      : <span className="ed-own"><input autoFocus dir="auto" maxLength={60} placeholder={t('Say what it is')} value={own} onChange={e => setOwn(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} aria-label={t('Other: say what it is')} /><button type="button" className="btn" onClick={add}>{t('Add')}</button></span>}
  </div>
}
function Days({ idp, value, onChange }: { idp: string; value: number[]; onChange: (v: number[]) => void }) {
  return <div className="ed-days"><div className="pl-days" role="group">{DAYS.map((d, i) => { const n = i + 1, on = value.includes(n)
    return <button key={d} type="button" id={`${idp}-${n}`} aria-pressed={on} className={`chipf ${on ? 'on' : ''}`} onClick={() => onChange(on ? value.filter(x => x !== n) : [...value, n].sort())}>{t(d)}</button> })}</div>
    <div className="ed-quick"><button type="button" onClick={() => onChange([1, 2, 3, 4, 5])}>{t('Mon–Fri')}</button><button type="button" onClick={() => onChange([1, 2, 3, 4, 5, 6, 7])}>{t('Every day')}</button>
      <button type="button" onClick={() => onChange([6, 7])}>{t('Weekend')}</button></div></div>
}
function Breaks({ idp, value, onChange }: { idp: string; value: { at: string; label?: string }[]; onChange: (v: { at: string; label?: string }[]) => void }) {
  return <div className="ed-breaks">{value.map((b, i) => <span key={i} className="ed-break"><span className="small">{t('Break {n}', { n: i + 1 })}</span>
    <input id={`${idp}-${i}`} type="time" aria-label={t('Break {n} time', { n: i + 1 })} value={b.at} onChange={e => onChange(value.map((x, j) => j === i ? { ...x, at: e.target.value } : x))} />
    <button type="button" className="ed-x" aria-label={t('Remove break {n}', { n: i + 1 })} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button></span>)}
    <button type="button" className="btn" onClick={() => onChange([...value, { at: '' }])}>+ {t('Add break')}</button></div>
}

/** One media type's or programme's own fields, as TYPE_FIELDS lists them. */
function TypeFields({ idp, fields, d, set, err }: { idp: string; fields: Field[]; d: Record<string, any>; set: (patch: Record<string, any>) => void; err: (k: string) => string | undefined }) {
  return <>{fields.filter(f => !f.when || f.when(d)).map(f => {
    const id = `${idp}-${f.key}`, req = f.required ? <span className="req">*</span> : null
    if (f.kind === 'days') return <div className="field" key={f.key}><span className="lbl">{t(f.label)} {req}</span><Days idp={id} value={d.days ?? []} onChange={v => set({ days: v })} /><Err m={err('days')} /></div>
    if (f.kind === 'airtime') return <div className="field" key={f.key}><span className="lbl">{t('Airtime')} {req}</span>
      <div className="ed-air"><input id={`${idp}-air1`} type="time" aria-label={t('Starts')} value={d.airStart ?? ''} onChange={e => set({ airStart: e.target.value })} /><span>–</span>
        <input id={`${idp}-air2`} type="time" aria-label={t('Ends')} value={d.airEnd ?? ''} onChange={e => set({ airEnd: e.target.value })} /></div>
      <span className="small muted">{t('Dubai time. Overnight like 23:00–02:00 works.')}</span><Err m={err('airtime')} /></div>
    if (f.kind === 'breaks') return <div className="field" key={f.key}><span className="lbl">{t('Breaks')} {req}</span><Breaks idp={id} value={d.breaks ?? []} onChange={v => set({ breaks: v })} />
      <span className="small muted">{t('Each break is sold on its own.')}</span><Err m={err('breaks')} /></div>
    if (f.kind === 'pick') return <div className="field" key={f.key}><label htmlFor={id}>{t(f.label)} {req}</label>
      <Pick id={id} value={d[f.key] ?? ''} options={f.options!} onChange={v => set({ [f.key]: v, ...(f.key === 'frequency' && WEEKDAY_SETS[v] ? { days: WEEKDAY_SETS[v] } : {}) })} /><Err m={err(f.key)} /></div>
    if (f.kind === 'suggest') return <div className="field" key={f.key}><label htmlFor={id}>{t(f.label)} {req}</label>
      <input id={id} dir="auto" list={`${id}-l`} maxLength={60} value={d[f.key] ?? ''} onChange={e => set({ [f.key]: e.target.value })} placeholder={t(f.options![0][1])} />
      <datalist id={`${id}-l`}>{f.options!.map(([k, l]) => <option key={k} value={t(l)} />)}</datalist>
      <div className="ed-sugg">{f.options!.map(([k, l]) => <button type="button" key={k} className={`chipf ${d[f.key] === t(l) ? 'on' : ''}`} onClick={() => set({ [f.key]: t(l) })}>{t(l)}</button>)}</div><Err m={err(f.key)} /></div>
    return <div className="field" key={f.key}><label htmlFor={id}>{t(f.label)} {req}</label><input id={id} dir="auto" maxLength={60} value={d[f.key] ?? ''} onChange={e => set({ [f.key]: e.target.value })}
      placeholder={f.help ? t(f.help) : undefined} /><Err m={err(f.key)} /></div>
  })}</>
}

const blank = (): MediaInput => ({ channel: '', name: '', description: '', language: '', audience: '', markets: ['UAE'], reach: null, reachUnit: null, sectors: [], blocked: [],
  defaultPrice: 0, creativeDays: 2, closeDays: 5, specType: '', specDetail: '', notes: '', details: {} })
const fromMedia = (m: Media): MediaInput => ({ channel: m.channel, channelOther: m.channelOther ?? '', name: m.name, description: m.description ?? '', language: m.language ?? '', audience: m.audience ?? '',
  markets: m.markets ?? [], reach: m.reach, reachUnit: m.reachUnit, sectors: m.sectors ?? [], blocked: m.blocked ?? [], defaultPrice: m.defaultPrice ?? 0, creativeDays: m.creativeDays ?? 2,
  closeDays: m.closeDays ?? 5, specType: m.specType ?? '', specDetail: m.specDetail ?? '', notes: m.notes ?? '', details: m.details ?? {}, audiences: m.audiences ?? [], blockedAdvertisers: m.blockedAdvertisers ?? [], nameAr: m.nameAr ?? '', website: m.website ?? '' })

function MediaForm({ product, m, onSaved, onCancel }: { product: Product; m?: Media; onSaved: (id: string) => void; onCancel: () => void }) {
  const [f, setF] = useState<MediaInput>(m ? fromMedia(m) : blank()), [tried, setTried] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [allSectors, setAllSectors] = useState(!(m?.sectors?.length)), [notRun, setNotRun] = useState((m?.blockedAdvertisers ?? []).join(', '))
  const set = (patch: Partial<MediaInput>) => setF(x => ({ ...x, ...patch })), setD = (patch: Record<string, any>) => setF(x => ({ ...x, details: { ...x.details, ...patch } }))
  const byProgramme = HAS_PROGRAMMES.includes(f.channel) && !!f.details.programmes
  // a product made before this form (a newspaper, a website…) that is sold through the items it already had
  const older = !HAS_PROGRAMMES.includes(f.channel) && !!f.details.programmes
  const noDesc = !!m && !m.description?.trim()   // made before this form and never described: the description stays optional
  const site = (f.website ?? '').trim(), siteBad = !!site && !/^https?:\/\/\S+\.\S+/.test(site)
  const problems = [...mediaProblems({ ...f, details: byProgramme ? { programmes: true } : f.details }).filter(x => !(x[0] === 'description' && noDesc)), ...(siteBad ? [['website', 'The website must start with https:// or http://.']] as [string, string][] : [])], err = (k: string) => tried ? problems.find(p => p[0] === k)?.[1] : undefined
  const dl = deadlineProblem(f.creativeDays, f.closeDays), idp = m?.id ?? 'new'
  const sectorOpts: Opt[] = INDUSTRIES.filter(x => x !== 'Other').map(x => [x, x])
  async function save() {
    setTried(true); setError('')
    if (problems.length) { setError(t('Fix the {n} highlighted fields, then save.', { n: problems.length })); return }
    setBusy(true)
    try {
      const body = { ...f, sectors: allSectors ? [] : f.sectors, reach: f.reach || null, reachUnit: f.reach ? f.reachUnit || null : null, channelOther: f.channel === OTHER ? f.channelOther : undefined,
        specDetail: f.specDetail || undefined, notes: f.notes || undefined, nameAr: (f.nameAr ?? '').trim(), website: (f.website ?? '').trim(),
        audiences: f.audiences ?? [], blockedAdvertisers: [...new Set(notRun.split(',').map(x => x.trim()).filter(x => x.length > 1))] }
      const r = m ? await api<{ id: string }>(`/seller/media/${m.id}`, { method: 'PUT', body }) : await api<{ id: string }>(`/seller/products/${product.id}/media`, { method: 'POST', body })
      onSaved(r.id)
    } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  const aed = (v: string) => Math.round(Number(v.replace(/,/g, '')) * 100) || 0
  return <section className="card pad ed-form form">
    <div className="ed-fh"><h2>{m ? t('Edit {name}', { name: m.name }) : t('Add a product')}</h2><span className="spacer" /><button type="button" className="btn" onClick={onCancel}>{t('Cancel')}</button></div>
    <div className="field"><span className="lbl">{t('Media type')} <span className="req">*</span></span>
      <div className="ed-types" role="radiogroup" aria-label={t('Media type')}>{MEDIA.map(c => <button key={c} type="button" role="radio" aria-checked={f.channel === c} disabled={!!m && m.channel !== c}
        className={f.channel === c ? 'on' : ''} onClick={() => set({ channel: c, details: c === f.channel ? f.details : {}, specType: '' })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[c] ?? ICON.other} /></svg>{t(MEDIA_LABEL[c])}</button>)}</div>
      {f.channel === OTHER && <input className="ed-mt" dir="auto" maxLength={60} aria-label={t('Other: say what it is')} placeholder={t('Say what it is')} value={f.channelOther ?? ''} onChange={e => set({ channelOther: e.target.value })} />}
      <Err m={err('channel') ?? err('channelOther')} /></div>
    {f.channel && <>
      <h3 className="ed-sec">{t('About it')}</h3>
      <div className="grid2">
        <div className="field"><label htmlFor={`${idp}-name`}>{t('Name buyers see')} <span className="req">*</span></label><input id={`${idp}-name`} dir="auto" maxLength={80} value={f.name} onChange={e => set({ name: e.target.value })} placeholder={t('For example: Skyline FM Radio')} /><Err m={err('name')} /></div>
        <div className="field"><label htmlFor={`${idp}-lang`}>{t('Language')} <span className="req">*</span></label><Pick id={`${idp}-lang`} value={f.language} options={LANGUAGES} onChange={v => set({ language: v })} /><Err m={err('language')} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor={`${idp}-ar`}>{t('Name in Arabic (optional)')}</label><input id={`${idp}-ar`} dir="rtl" lang="ar" maxLength={200} value={f.nameAr ?? ''} onChange={e => set({ nameAr: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${idp}-web`}>{t('Website (optional)')}</label><input id={`${idp}-web`} type="url" dir="ltr" maxLength={300} placeholder="https://" value={f.website ?? ''} onChange={e => set({ website: e.target.value })} /><Err m={err('website')} /></div>
      </div>
      <div className="field"><label htmlFor={`${idp}-desc`}>{noDesc ? t('Description (optional)') : t('Description')} {!noDesc && <span className="req">*</span>}</label><textarea id={`${idp}-desc`} dir="auto" rows={3} maxLength={1000} value={f.description} onChange={e => set({ description: e.target.value })} /><Err m={err('description')} /></div>
      {m && <div className="field"><span className="lbl">{t('Cover image (optional)')}</span><CoverPicker url={m.coverUrl ?? null} channel={m.channel} endpoint={`/seller/outlets/${m.id}/cover`} /></div>}

      {HAS_PROGRAMMES.includes(f.channel) && <label className="ed-switch"><input type="checkbox" checked={byProgramme} onChange={e => setD({ programmes: e.target.checked })} />
        <span><b>{t('Sell it by programme')}</b><span className="small muted">{t('Each show, for example Morning Markets, gets its own days, airtime and breaks. Leave off to sell it as one.')}</span></span></label>}
      {byProgramme && <p className="ed-after small">{t("You'll add each programme after saving.")}</p>}
      {older && <p className="ed-after small">{t('This product is sold through what you added before: {names}. List them from the product\'s row.', { names: (m?.sellable ?? []).map(x => x.name).join(', ') })}</p>}
      {!byProgramme && !older && TYPE_FIELDS[f.channel] && <><h3 className="ed-sec">{t('{type} details', { type: f.channel === OTHER ? f.channelOther || t('Other') : t(MEDIA_LABEL[f.channel]) })}</h3>
        <div className="ed-type"><TypeFields idp={idp} fields={TYPE_FIELDS[f.channel]} d={f.details} set={setD} err={err} /></div>
        {f.channel === 'magazine' && <p className="small muted">{t('No time field: the date the magazine comes out is picked when you list it.')}</p>}</>}

      <h3 className="ed-sec">{t('Who it reaches')}</h3>
      <div className="field"><label htmlFor={`${idp}-aud`}>{t('Audience')} <span className="req">*</span></label><input id={`${idp}-aud`} dir="auto" maxLength={300} value={f.audience} onChange={e => set({ audience: e.target.value })} placeholder={t('Business commuters, 25-45')} /><Err m={err('audience')} /></div>
      <div className="field"><span className="lbl">{t('Audience tags (optional)')}</span><AudiencePicker idPrefix={`${idp}-tag`} value={f.audiences ?? []} onChange={v => set({ audiences: v })} />
        <span className="small muted">{t('Buyers filter the calendar by these, and the product shows on the matching Audiences pages.')}</span></div>
      <div className="field"><span className="lbl">{t('Markets')} <span className="req">*</span></span><Multi idp={`${idp}-mk`} label={t('Markets')} value={f.markets} options={MARKETS} onChange={v => set({ markets: v })} /><Err m={err('markets')} /></div>
      <div className="grid2">
        <div className="field"><label htmlFor={`${idp}-reach`}>{t('Reach (optional)')}</label><input id={`${idp}-reach`} inputMode="numeric" value={f.reach ? f.reach.toLocaleString('en-US') : ''} onChange={e => set({ reach: Number(e.target.value.replace(/\D/g, '')) || null })} placeholder="120,000" /></div>
        <div className="field"><label htmlFor={`${idp}-ru`}>{t('What it counts')}</label><Pick id={`${idp}-ru`} value={f.reachUnit ?? ''} options={REACH_UNITS} onChange={v => set({ reachUnit: v })} /></div>
      </div>
      <div className="field"><span className="lbl">{t('Sectors accepted')} <span className="req">*</span></span>
        <label className="check"><input type="checkbox" checked={allSectors} onChange={e => setAllSectors(e.target.checked)} /> {t('All sectors')}</label>
        {!allSectors && <Multi idp={`${idp}-sec`} label={t('Sectors accepted')} value={f.sectors} options={sectorOpts} onChange={v => set({ sectors: v })} />}</div>
      <div className="field"><span className="lbl">{t('Sectors not accepted (optional)')}</span><Multi idp={`${idp}-blk`} label={t('Sectors not accepted')} value={f.blocked} options={sectorOpts} onChange={v => set({ blocked: v })} /></div>
      <div className="field"><label htmlFor={`${idp}-notrun`}>{t('Advertisers you will not run (comma-separated, e.g. competitors)')}</label><input id={`${idp}-notrun`} dir="auto" value={notRun} onChange={e => setNotRun(e.target.value)} /></div>

      <h3 className="ed-sec">{t('Price and deadlines')}</h3>
      <div className="ed-3">
        <div className="field"><label htmlFor={`${idp}-dp`}>{t('Default price (AED)')} <span className="req">*</span></label><input id={`${idp}-dp`} inputMode="decimal" value={f.defaultPrice ? String(f.defaultPrice / 100) : ''} onChange={e => set({ defaultPrice: aed(e.target.value) })} />
          <span className="small muted">{t('Pre-fills the price when you list it.')}</span><Err m={err('defaultPrice')} /></div>
        <div className="field"><label htmlFor={`${idp}-cd`}>{t('Creative due (days before it runs)')} <span className="req">*</span></label><input id={`${idp}-cd`} inputMode="numeric" value={String(f.creativeDays)} onChange={e => set({ creativeDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} /><Err m={err('creativeDays')} /></div>
        <div className="field"><label htmlFor={`${idp}-bc`}>{t('Bidding closes (days before it runs)')} <span className="req">*</span></label><input id={`${idp}-bc`} inputMode="numeric" value={String(f.closeDays)} onChange={e => set({ closeDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></div>
      </div>
      {dl && <p className="warn" role="alert">{t(dl)} {t('Bidding must close {n} days or more before it runs.', { n: f.creativeDays + 3 })}</p>}
      <h3 className="ed-sec">{t('Creative specs')}</h3>
      <div className="grid2">
        <div className="field"><label htmlFor={`${idp}-st`}>{t('File type')} <span className="req">*</span></label><Pick id={`${idp}-st`} value={f.specType} options={SPEC_TYPES[f.channel] ?? SPEC_TYPES.other} onChange={v => set({ specType: v })} /><Err m={err('specType')} /></div>
        <div className="field"><label htmlFor={`${idp}-sd`}>{t('Length or size')}</label><input id={`${idp}-sd`} dir="auto" maxLength={120} value={f.specDetail ?? ''} onChange={e => set({ specDetail: e.target.value })} placeholder={t('For example: 30 seconds, or 300×250')} /></div>
      </div>
      <div className="field"><label htmlFor={`${idp}-notes`}>{t('Anything else buyers should know (optional)')}</label><textarea id={`${idp}-notes`} dir="auto" rows={2} maxLength={500} value={f.notes ?? ''} onChange={e => set({ notes: e.target.value })} />
        <span className="small muted">{(f.notes ?? '').length}/500 · {t('Emails and phone numbers are not allowed.')}</span><Err m={err('notes')} /></div>
    </>}
    <div className="ed-save">{error && <p className="error" role="alert">{error}</p>}<span className="spacer" />
      <button type="button" className="btn primary" disabled={busy || !f.channel} onClick={save}>{m ? t('Save') : t('Add product')}</button></div>
  </section>
}

function ProgrammeForm({ media, p, onSaved, onCancel }: { media: Media; p?: Sellable; onSaved: () => void; onCancel: () => void }) {
  const ov = p?.details?.overrides ?? {}
  const [name, setName] = useState(p?.name ?? ''), [notes, setNotes] = useState(p?.details?.notes ?? ''), [d, setDd] = useState<Record<string, any>>(p ? { days: p.days, airStart: p.startsAt ?? '', airEnd: p.endsAt ?? '',
    breaks: (p.breaks ?? []).map(b => ({ at: b.at ?? '' })), format: p.details?.format ?? p.format ?? '', adLength: p.details?.adLength ?? '' } : { days: [1, 2, 3, 4, 5], breaks: [] })
  const [price, setPrice] = useState(ov.price ? String(ov.price / 100) : ''), [cd, setCd] = useState(ov.creativeDays != null ? String(ov.creativeDays) : ''), [bc, setBc] = useState(ov.closeDays != null ? String(ov.closeDays) : '')
  const [tried, setTried] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const fields = PROGRAMME_FIELDS(media.channel), problems = [...(name.trim() ? [] : [['name', 'Add the programme name.']] as [string, string][]), ...fieldProblems(fields, d)]
  const err = (k: string) => tried ? problems.find(x => x[0] === k)?.[1] : undefined, idp = p?.id ?? `np-${media.id}`
  async function save() {
    setTried(true); setError(''); if (problems.length) return
    setBusy(true)
    try {
      const body = { name, notes: notes || undefined, details: d, defaultPrice: price ? Math.round(Number(price) * 100) : null, creativeDays: cd ? Number(cd) : null, closeDays: bc ? Number(bc) : null }
      if (p) await api(`/seller/programmes/${p.id}`, { method: 'PUT', body }); else await api(`/seller/media/${media.id}/programmes`, { method: 'POST', body })
      onSaved()
    } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  return <section className="card pad ed-form form ed-prog">
    <div className="ed-fh"><h3>{p ? t('Edit {name}', { name: p.name }) : t('Add a programme')}</h3><span className="spacer" /><button type="button" className="btn" onClick={onCancel}>{t('Cancel')}</button></div>
    <div className="field"><label htmlFor={`${idp}-pn`}>{t('Programme name')} <span className="req">*</span></label><input id={`${idp}-pn`} dir="auto" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t('Morning Markets')} /><Err m={err('name')} /></div>
    <div className="ed-type"><TypeFields idp={idp} fields={fields} d={d} set={x => setDd(y => ({ ...y, ...x }))} err={err} /></div>
    <div className="field"><label htmlFor={`${idp}-pnotes`}>{t('Anything else buyers should know (optional)')}</label><textarea id={`${idp}-pnotes`} dir="auto" rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} /></div>
    <details className="pl-more"><summary>{t('Price and deadlines for this programme (optional)')}</summary>
      <p className="small muted">{t('Left empty, they come from the product: {price}, creative {c} days and bidding {b} days before.', { price: media.defaultPrice ? `AED ${(media.defaultPrice / 100).toLocaleString('en-US')}` : '—', c: media.creativeDays ?? '—', b: media.closeDays ?? '—' })}</p>
      <div className="ed-3"><div className="field"><label htmlFor={`${idp}-pp`}>{t('Default price (AED)')}</label><input id={`${idp}-pp`} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></div>
        <div className="field"><label htmlFor={`${idp}-pc`}>{t('Creative due (days before it runs)')}</label><input id={`${idp}-pc`} inputMode="numeric" value={cd} onChange={e => setCd(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="field"><label htmlFor={`${idp}-pb`}>{t('Bidding closes (days before it runs)')}</label><input id={`${idp}-pb`} inputMode="numeric" value={bc} onChange={e => setBc(e.target.value.replace(/\D/g, ''))} /></div></div></details>
    <div className="ed-save">{error && <p className="error" role="alert">{error}</p>}<span className="spacer" /><button type="button" className="btn primary" disabled={busy} onClick={save}>{p ? t('Save') : t('Add programme')}</button></div>
  </section>
}

/** One line of the summary: shown only when the publisher filled it in. */
const Fact = ({ k, v }: { k: string; v?: string | number | null }) => v == null || v === '' ? null : <div><dt>{k}</dt><dd dir="auto">{v}</dd></div>
const TABS: [string, string][] = [['details', 'Details'], ['audience', 'Audience'], ['sectors', 'Sectors'], ['requirements', 'Requirements']]

/** A product's summary, made only from what the publisher filled in on its form: details, audience, sectors, requirements. */
function ProductSummary({ m }: { m: Media }) {
  const [tab, setTab] = useState('details'), d = m.details ?? {}, byProgramme = HAS_PROGRAMMES.includes(m.channel) && soldByProgramme(m)
  const main = m.sellable.find(s => s.kind === 'main'), timed = ['radio', 'tv'].includes(m.channel)
  const fields = byProgramme ? [] : TYPE_FIELDS[m.channel] ?? []
  const value = (f: Field): string => f.kind === 'days' ? (d.days?.length ? daysText(d.days) : '') : f.kind === 'airtime' ? (timed && d.airStart ? `${d.airStart}–${d.airEnd ?? ''}` : '')
    : f.kind === 'breaks' ? (timed ? (d.breaks ?? []).map((b: any) => b.at).filter(Boolean).join(', ') : '') : f.options ? t(label(f.options, d[f.key])) : String(d[f.key] ?? '')
  const list = (v?: string[] | null) => (v ?? []).map(x => t(x)).join(', ')
  return <div className="pr-sum">
    <div className="seg pr-tabs" role="tablist" aria-label={m.name}>{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
    {tab === 'details' && <dl className="pr-facts">
      <Fact k={t('Media type')} v={mediaName(m)} />
      {fields.map(f => <Fact key={f.key} k={f.kind === 'airtime' ? t('Airtime') : f.kind === 'breaks' ? t('Breaks') : t(f.label)} v={value(f)} />)}
      {byProgramme && <Fact k={t('Sold by')} v={t(m.sellable.length === 1 ? '1 programme' : '{n} programmes', { n: m.sellable.length })} />}
      {!byProgramme && !fields.some(f => f.kind === 'days') && main?.days?.length ? <Fact k={t('Days')} v={daysText(main.days)} /> : null}
      <Fact k={t('Language')} v={m.language ? t(label(LANGUAGES, m.language)) : ''} />
      <Fact k={t('Name in Arabic')} v={m.nameAr} />
      <Fact k={t('Website')} v={m.website} />
    </dl>}
    {tab === 'audience' && <dl className="pr-facts">
      <Fact k={t('Audience')} v={m.audience} />
      <Fact k={t('Reach')} v={m.reach ? `${m.reach.toLocaleString('en-US')}${m.reachUnit ? ` ${t(label(REACH_UNITS, m.reachUnit)).toLowerCase()}` : ''}` : ''} />
      <Fact k={t('Audience tags')} v={(m.audiences ?? []).map(k => t(AUDIENCES.find(a => a[0] === k)?.[1] ?? k)).join(', ')} />
      <Fact k={t('Markets')} v={(m.markets ?? []).map(x => t(label(MARKETS, x))).join(', ')} />
    </dl>}
    {tab === 'sectors' && <dl className="pr-facts">
      <Fact k={t('Sectors accepted')} v={m.sectors?.length ? list(m.sectors) : t('All sectors')} />
      <Fact k={t('Sectors not accepted')} v={list(m.blocked)} />
      <Fact k={t('Advertisers not run')} v={(m.blockedAdvertisers ?? []).join(', ')} />
    </dl>}
    {tab === 'requirements' && <dl className="pr-facts">
      <Fact k={t('Creative specs')} v={[m.specType ? t(label(SPEC_TYPES[m.channel] ?? SPEC_TYPES.other, m.specType)) : '', m.specDetail].filter(Boolean).join(', ')} />
      <Fact k={t('Creative due')} v={m.creativeDays != null ? t('{n} days before it runs', { n: m.creativeDays }) : ''} />
      <Fact k={t('Bidding closes')} v={m.closeDays != null ? t('{n} days before it runs', { n: m.closeDays }) : ''} />
      <Fact k={t('Default price')} v={m.defaultPrice ? money(m.defaultPrice) : ''} />
      <Fact k={t('Anything else buyers should know')} v={m.notes} />
    </dl>}
  </div>
}

export function ProductEditorPage({ id }: { id?: string }) {
  const q = new URLSearchParams(location.search)
  const [all, setAll] = useState<Product[] | null>(null), [error, setError] = useState(''), [note, setNote] = useState('')
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(q.get('add') ? 'new' : q.get('media')), [prog, setProg] = useState<string | null>(null), [listing, setListing] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(q.get('open')), [outletForm, setOutletForm] = useState(!id), [newLogo, setNewLogo] = useState<Blob | null>(null)
  // an outlet's own id, or any of its products' or programmes' ids (the calendar's Edit opens the outlet that way)
  const find = (r: Product[]) => r.find(x => x.id === id) ?? r.find(x => x.media.some(m => m.id === id || m.sellable.some(s => s.id === id)))
  const load = () => api<Product[]>('/seller/products').then(r => { setAll(r); return r }, e => { setError(e.message); return [] as Product[] })
  useEffect(() => { load().then(r => { const p = find(r); if (p) { setName(p.name); setDescription(p.description ?? ''); setNotes(p.notes ?? '')
    const m = p.media.find(m => m.id === id || m.sellable.some(s => s.id === id)); if (m) setOpen(m.id) } }) }, [id])
  const p = all ? find(all) : undefined
  async function saveOutlet() {
    setBusy(true); setError(''); setNote('')
    try {
      const body = { name, description, ...(notes.trim() ? { notes } : {}) }
      if (p) { await api(`/seller/products/${p.id}`, { method: 'PUT', body }); setNote(t('Outlet saved.')); setOutletForm(false); await load() }
      else { const r = await api<{ id: string }>('/seller/products', { method: 'POST', body })
        // the logo chosen on the form goes up with the new outlet (if it fails the outlet is still saved, and the logo can be added from Edit outlet)
        if (newLogo) await fetch(`/api/seller/products/${r.id}/logo`, { method: 'PUT', credentials: 'same-origin', body: newLogo, headers: { 'content-type': 'image/png' } }).catch(() => {})
        navigate(`/listings/p/${r.id}?add=1`) }
    } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  async function remove() {
    if (!p || !confirm(t('Delete {name}? What is not yet sold stops being sold; bookings already made carry on.', { name: p.name }))) return
    try { await api(`/seller/products/${p.id}/delete`, { method: 'POST', body: {} }); navigate('/listings') } catch (e: any) { setError(tm(e.message)) }
  }
  if (id && !all) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  // an address for an outlet that is not there (deleted, or an old link): say so rather than offer a blank form
  if (id && !p) return <main className="nf"><span className="nf-code num" aria-hidden>404</span><h1>{t('Not found')}</h1><p className="muted">{t('This page does not exist, or it has moved.')}</p><a className="btn primary" href="/listings">{t('Products')}</a></main>
  const groups = p ? MEDIA.filter(c => p.media.some(m => m.channel === c)) : []
  const saved = async (mid: string, isNew: boolean) => { await load(); setEditing(null); setNote(t('Product saved.')); setOpen(mid); if (isNew) setListing(mid) }
  return <main className="ed">
    <p className="small"><a href="/listings">{t('Products')}</a> › {p ? p.name : t('Add outlet')}</p>
    <div className="pt-head"><div><h1>{p ? p.name : t('Add outlet')}</h1><p className="muted">{t('The outlet is your brand. Add each product it sells; for radio, TV and podcasts, add programmes if you sell by show.')}</p></div></div>
    <ol className="ed-steps" aria-label={t('Steps')}><li className={p ? 'done' : 'now'}>{t('Outlet')}</li><li className={p && p.media.length ? 'done' : p ? 'now' : ''}>{t('Products')}</li><li className={p?.media.some(m => m.sellable.some(s => s.openSlots > 0)) ? 'done' : ''}>{t('List it')}</li></ol>
    {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}

    {p && !outletForm ? <section className="card ed-outlet">
      <OutletMark name={p.name} url={p.logoUrl} size={56} />
      <div className="ed-ot"><h2>{t('1. Outlet')}</h2><b>{p.name}</b>{p.description && <span className="small muted" dir="auto">{p.description}</span>}</div>
      <button type="button" className="btn" onClick={() => setOutletForm(true)}><Ic d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" size={16} />{t('Edit outlet')}</button>
      <button type="button" className="btn danger" onClick={remove}>{t('Delete')}</button>
    </section> : <section className="card pad form ed-prod">
      <div className="ed-fh"><h2>{t('1. Outlet')}</h2><span className="spacer" />{p && <button type="button" className="btn" onClick={() => setOutletForm(false)}>{t('Cancel')}</button>}</div>
      <div className="grid2"><div className="field"><label htmlFor="pr-n">{t('Name')} <span className="req">*</span></label><input id="pr-n" dir="auto" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t('For example: Skyline FM')} /></div></div>
      {p ? <LogoPicker name={p.name} url={p.logoUrl} endpoint={`/seller/products/${p.id}/logo`} />
        : <LogoPicker name={name.trim() || t('Outlet')} url={null} endpoint="" onBlob={setNewLogo} />}
      <div className="field"><label htmlFor="pr-d">{p && !p.description?.trim() ? t('Description (optional)') : t('Description')} {!(p && !p.description?.trim()) && <span className="req">*</span>}</label><textarea id="pr-d" dir="auto" rows={2} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="field"><label htmlFor="pr-x">{t('Anything else buyers should know (optional)')}</label><textarea id="pr-x" dir="auto" rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
        <span className="small muted">{notes.length}/500 · {t('Emails and phone numbers are not allowed.')}</span></div>
      <div className="ed-save"><span className="spacer" /><button type="button" className="btn primary" disabled={busy || !name.trim() || (!description.trim() && !(p && !p.description?.trim()))} onClick={saveOutlet}>{p ? t('Save outlet') : t('Save and add products')}</button></div>
    </section>}

    {p && <section className="ed-media">
      <div className="ed-mh"><h2>{t('2. Products')}</h2>{editing !== 'new' && <button type="button" className="btn primary" onClick={() => setEditing('new')}>+ {t('Add a product')}</button>}</div>
      {editing === 'new' && <MediaForm product={p} onCancel={() => setEditing(null)} onSaved={mid => saved(mid, true)} />}
      {!p.media.length && editing !== 'new' && <p className="empty">{t('No products yet. Add the first one: a radio station, a TV channel, a newspaper, a magazine, a website, a newsletter, a podcast or a social media account.')}</p>}
      {groups.map(c => { const rows = p.media.filter(m => m.channel === c)
        return <div key={c} className="pr-group">
          <h3 className="pr-gh"><Ic d={ICON[c] ?? ICON.other} size={17} />{t(MEDIA_LABEL[c])} <span className="num">({rows.length})</span></h3>
          {rows.map(m => { const byProgramme = HAS_PROGRAMMES.includes(m.channel) && soldByProgramme(m), s = onSale(m), isOpen = open === m.id
            const items = !byProgramme && soldByProgramme(m), one = byProgramme || items ? undefined : m.sellable[0]   // items: an older product sold through what it already had
            if (editing === m.id) return <MediaForm key={m.id} product={p} m={m} onCancel={() => setEditing(null)} onSaved={mid => saved(mid, false)} />
            return <article key={m.id} className={`card pr-row ${isOpen ? 'open' : ''}`}>
              <div className="pr-main">
                <button type="button" className="pr-open" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.id)}>
                  <i className="pr-chev" aria-hidden><Ic d={isOpen ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={16} /></i>
                  <img className="pr-cover" src={m.coverUrl ?? art(m.channel, 'card')} alt="" width={96} height={60} loading="lazy" />
                  <span className="pr-what"><b dir="auto">{productTitle(p, m)}</b>{m.description && <span className="small muted" dir="auto">{m.description}</span>}</span></button>
                <span className="pr-price num">{m.defaultPrice ? money(m.defaultPrice) : '—'}<small>{t('default')}</small></span>
                <span className={`pt-pill ${s.open ? 'good' : 'mute'}`}>{s.text}</span>
                <span className="pr-acts"><a className="btn sm" href={`/schedule?view=week&q=${encodeURIComponent(p.name)}`}>{t('Calendar')}</a>
                  {(one || m.sellable.length > 0) && <button type="button" className="btn primary sm" onClick={() => { setOpen(m.id); setListing(listing === m.id ? null : m.id) }}>{t('List')}</button>}
                  <button type="button" className="btn sm" onClick={() => setEditing(m.id)}>{t('Edit')}</button></span>
              </div>
              {listing === m.id && m.sellable.length > 0 && <div className="ed-listnow"><ListingPanel products={[{ ...p, media: [m] }]} placementId={one?.id} onClose={() => setListing(null)} onDone={load} /></div>}
              {isOpen && <ProductSummary m={m} />}
              {isOpen && items && <div className="ed-progs">
                <div className="ed-mh"><h3>{t('What it sells')}</h3></div>
                {m.sellable.map(s => <div key={s.id} className="ed-prow"><span><b dir="auto">{p.name} · {s.name}</b><span className="small muted">{s.days?.length ? daysText(s.days) : ''}{s.openSlots > 0 ? ` · ${t('{n} on sale', { n: s.openSlots })}` : ''}</span></span>
                  <button type="button" className="btn primary" onClick={() => setListing(`p-${s.id}`)}>{t('List')}</button></div>)}
                {m.sellable.map(s => listing === `p-${s.id}` && <ListingPanel key={`l-${s.id}`} products={[p]} placementId={s.id} onClose={() => setListing(null)} onDone={load} />)}
              </div>}
              {isOpen && byProgramme && <div className="ed-progs">
                <div className="ed-mh"><h3>{t('Programmes')}</h3>{prog !== `new-${m.id}` && <button type="button" className="btn" onClick={() => setProg(`new-${m.id}`)}>+ {t('Add a programme')}</button>}</div>
                {!m.sellable.length && prog !== `new-${m.id}` && <p className="small muted">{t('Sold by programme, but no programme added yet.')}</p>}
                {prog === `new-${m.id}` && <ProgrammeForm media={m} onCancel={() => setProg(null)} onSaved={async () => { await load(); setProg(null); setNote(t('Programme saved.')) }} />}
                {m.sellable.filter(s => s.kind === 'programme').map(s => prog === s.id ? <ProgrammeForm key={s.id} media={m} p={s} onCancel={() => setProg(null)} onSaved={async () => { await load(); setProg(null); setNote(t('Programme saved.')) }} />
                  : <div key={s.id} className="ed-prow"><span><b dir="auto">{p.name} · {s.name}</b><span className="small muted">{s.days?.length ? daysText(s.days) : ''}{s.startsAt ? ` · ${s.startsAt}–${s.endsAt}` : ''}{s.breaks?.length ? ` · ${t(s.breaks.length === 1 ? '1 break' : '{n} breaks', { n: s.breaks.length })}` : ''}
                    {s.openSlots > 0 ? ` · ${t('{n} on sale', { n: s.openSlots })}` : ''}</span></span>
                    <button type="button" className="btn" onClick={() => setProg(s.id)}>{t('Edit')}</button><button type="button" className="btn primary" onClick={() => setListing(`p-${s.id}`)}>{t('List')}</button></div>)}
                {m.sellable.filter(s => s.kind === 'programme').map(s => listing === `p-${s.id}` && <ListingPanel key={`l-${s.id}`} products={[p]} placementId={s.id} onClose={() => setListing(null)} onDone={load} />)}
              </div>}
            </article> })}
        </div> })}
    </section>}
  </main>
}
