import { useEffect, useState } from 'react'
import { api } from '../api'
import { navigate } from '../nav'
import { t } from '../i18n'
import { tm } from '../i18n-server'
import { ICON } from '../media'
import { INDUSTRIES } from '../calendar/BidDrawer'
import { CoverPicker } from '../CoverPicker'
import { MEDIA, MEDIA_LABEL } from '../../../server/shared/media'
import { HAS_PROGRAMMES, LANGUAGES, MARKETS, OTHER, PROGRAMME_FIELDS, REACH_UNITS, SPEC_TYPES, TYPE_FIELDS, WEEKDAY_SETS, deadlineProblem, fieldProblems, mediaProblems,
  type Field, type MediaInput, type Opt } from '../../../server/shared/products'
import { ListingPanel, mediaName, type Media, type Product, type Sellable } from './Listing'
import './products.css'
import './editor.css'

/*
 * Add or edit a product (owner's rules): the product (name, description, anything else buyers should know), then each media type
 * with the fields every type has plus only its own, and for Radio, TV and Podcast its programmes if it sells by programme.
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
  closeDays: m.closeDays ?? 5, specType: m.specType ?? '', specDetail: m.specDetail ?? '', notes: m.notes ?? '', details: m.details ?? {} })

function MediaForm({ product, m, onSaved, onCancel }: { product: Product; m?: Media; onSaved: (id: string) => void; onCancel: () => void }) {
  const [f, setF] = useState<MediaInput>(m ? fromMedia(m) : blank()), [tried, setTried] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [allSectors, setAllSectors] = useState(!(m?.sectors?.length))
  const set = (patch: Partial<MediaInput>) => setF(x => ({ ...x, ...patch })), setD = (patch: Record<string, any>) => setF(x => ({ ...x, details: { ...x.details, ...patch } }))
  const byProgramme = HAS_PROGRAMMES.includes(f.channel) && !!f.details.programmes
  const problems = mediaProblems({ ...f, details: byProgramme ? { programmes: true } : f.details }), err = (k: string) => tried ? problems.find(p => p[0] === k)?.[1] : undefined
  const dl = deadlineProblem(f.creativeDays, f.closeDays), idp = m?.id ?? 'new'
  const sectorOpts: Opt[] = INDUSTRIES.filter(x => x !== 'Other').map(x => [x, x])
  async function save() {
    setTried(true); setError('')
    if (problems.length) { setError(t('Fix the {n} highlighted fields, then save.', { n: problems.length })); return }
    setBusy(true)
    try {
      const body = { ...f, sectors: allSectors ? [] : f.sectors, reach: f.reach || null, reachUnit: f.reach ? f.reachUnit || null : null, channelOther: f.channel === OTHER ? f.channelOther : undefined,
        specDetail: f.specDetail || undefined, notes: f.notes || undefined }
      const r = m ? await api<{ id: string }>(`/seller/media/${m.id}`, { method: 'PUT', body }) : await api<{ id: string }>(`/seller/products/${product.id}/media`, { method: 'POST', body })
      onSaved(r.id)
    } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  const aed = (v: string) => Math.round(Number(v.replace(/,/g, '')) * 100) || 0
  return <section className="card pad ed-form form">
    <div className="ed-fh"><h2>{m ? t('Edit {name}', { name: mediaName(m) }) : t('Add a media type')}</h2><span className="spacer" /><button type="button" className="btn" onClick={onCancel}>{t('Cancel')}</button></div>
    <div className="field"><span className="lbl">{t('Media type')} <span className="req">*</span></span>
      <div className="ed-types" role="radiogroup" aria-label={t('Media type')}>{MEDIA.map(c => <button key={c} type="button" role="radio" aria-checked={f.channel === c} disabled={!!m && m.channel !== c}
        className={f.channel === c ? 'on' : ''} onClick={() => set({ channel: c, details: c === f.channel ? f.details : {}, specType: '' })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[c] ?? ICON.digital} /></svg>{t(MEDIA_LABEL[c])}</button>)}</div>
      {f.channel === OTHER && <input className="ed-mt" dir="auto" maxLength={60} aria-label={t('Other: say what it is')} placeholder={t('Say what it is')} value={f.channelOther ?? ''} onChange={e => set({ channelOther: e.target.value })} />}
      <Err m={err('channel') ?? err('channelOther')} /></div>
    {f.channel && <>
      <h3 className="ed-sec">{t('About it')}</h3>
      <div className="grid2">
        <div className="field"><label htmlFor={`${idp}-name`}>{t('Name buyers see')} <span className="req">*</span></label><input id={`${idp}-name`} dir="auto" maxLength={80} value={f.name} onChange={e => set({ name: e.target.value })} placeholder={t('For example: Skyline FM 92.4')} /><Err m={err('name')} /></div>
        <div className="field"><label htmlFor={`${idp}-lang`}>{t('Language')} <span className="req">*</span></label><Pick id={`${idp}-lang`} value={f.language} options={LANGUAGES} onChange={v => set({ language: v })} /><Err m={err('language')} /></div>
      </div>
      <div className="field"><label htmlFor={`${idp}-desc`}>{t('Description')} <span className="req">*</span></label><textarea id={`${idp}-desc`} dir="auto" rows={3} maxLength={1000} value={f.description} onChange={e => set({ description: e.target.value })} /><Err m={err('description')} /></div>
      {m && <div className="field"><span className="lbl">{t('Cover image (optional)')}</span><CoverPicker url={m.coverUrl ?? null} channel={m.channel} endpoint={`/seller/outlets/${m.id}/cover`} /></div>}

      {HAS_PROGRAMMES.includes(f.channel) && <label className="ed-switch"><input type="checkbox" checked={byProgramme} onChange={e => setD({ programmes: e.target.checked })} />
        <span><b>{t('Sell it by programme')}</b><span className="small muted">{t('Each show, for example Morning Markets, gets its own days, airtime and breaks. Leave off to sell it as one.')}</span></span></label>}
      {!byProgramme && TYPE_FIELDS[f.channel] && <><h3 className="ed-sec">{t('{type} details', { type: f.channel === OTHER ? f.channelOther || t('Other') : t(MEDIA_LABEL[f.channel]) })}</h3>
        <div className="ed-type"><TypeFields idp={idp} fields={TYPE_FIELDS[f.channel]} d={f.details} set={setD} err={err} /></div>
        {f.channel === 'magazine' && <p className="small muted">{t('No time field: the date the magazine comes out is picked when you list it.')}</p>}</>}

      <h3 className="ed-sec">{t('Who it reaches')}</h3>
      <div className="field"><label htmlFor={`${idp}-aud`}>{t('Audience')} <span className="req">*</span></label><input id={`${idp}-aud`} dir="auto" maxLength={300} value={f.audience} onChange={e => set({ audience: e.target.value })} placeholder={t('Business commuters, 25-45')} /><Err m={err('audience')} /></div>
      <div className="field"><span className="lbl">{t('Markets')} <span className="req">*</span></span><Multi idp={`${idp}-mk`} label={t('Markets')} value={f.markets} options={MARKETS} onChange={v => set({ markets: v })} /><Err m={err('markets')} /></div>
      <div className="grid2">
        <div className="field"><label htmlFor={`${idp}-reach`}>{t('Reach (optional)')}</label><input id={`${idp}-reach`} inputMode="numeric" value={f.reach ? f.reach.toLocaleString('en-US') : ''} onChange={e => set({ reach: Number(e.target.value.replace(/\D/g, '')) || null })} placeholder="120,000" /></div>
        <div className="field"><label htmlFor={`${idp}-ru`}>{t('What it counts')}</label><Pick id={`${idp}-ru`} value={f.reachUnit ?? ''} options={REACH_UNITS} onChange={v => set({ reachUnit: v })} /></div>
      </div>
      <div className="field"><span className="lbl">{t('Sectors accepted')} <span className="req">*</span></span>
        <label className="check"><input type="checkbox" checked={allSectors} onChange={e => setAllSectors(e.target.checked)} /> {t('All sectors')}</label>
        {!allSectors && <Multi idp={`${idp}-sec`} label={t('Sectors accepted')} value={f.sectors} options={sectorOpts} onChange={v => set({ sectors: v })} />}</div>
      <div className="field"><span className="lbl">{t('Sectors not accepted (optional)')}</span><Multi idp={`${idp}-blk`} label={t('Sectors not accepted')} value={f.blocked} options={sectorOpts} onChange={v => set({ blocked: v })} /></div>

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
      <button type="button" className="btn primary" disabled={busy || !f.channel} onClick={save}>{m ? t('Save') : t('Add media type')}</button></div>
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
      <p className="small muted">{t('Left empty, they come from the media type: {price}, creative {c} days and bidding {b} days before.', { price: media.defaultPrice ? `AED ${(media.defaultPrice / 100).toLocaleString('en-US')}` : '—', c: media.creativeDays ?? '—', b: media.closeDays ?? '—' })}</p>
      <div className="ed-3"><div className="field"><label htmlFor={`${idp}-pp`}>{t('Default price (AED)')}</label><input id={`${idp}-pp`} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></div>
        <div className="field"><label htmlFor={`${idp}-pc`}>{t('Creative due (days before it runs)')}</label><input id={`${idp}-pc`} inputMode="numeric" value={cd} onChange={e => setCd(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="field"><label htmlFor={`${idp}-pb`}>{t('Bidding closes (days before it runs)')}</label><input id={`${idp}-pb`} inputMode="numeric" value={bc} onChange={e => setBc(e.target.value.replace(/\D/g, ''))} /></div></div></details>
    <div className="ed-save">{error && <p className="error" role="alert">{error}</p>}<span className="spacer" /><button type="button" className="btn primary" disabled={busy} onClick={save}>{p ? t('Save') : t('Add programme')}</button></div>
  </section>
}

export function ProductEditorPage({ id }: { id?: string }) {
  const q = new URLSearchParams(location.search)
  const [all, setAll] = useState<Product[] | null>(null), [error, setError] = useState(''), [note, setNote] = useState('')
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(q.get('add') ? 'new' : q.get('media')), [prog, setProg] = useState<string | null>(null), [listing, setListing] = useState<string | null>(null)
  // a product's own id, or any of its programmes' or media types' placements (the calendar's Edit opens the product that way)
  const find = (r: Product[]) => r.find(x => x.id === id) ?? r.find(x => x.media.some(m => m.id === id || m.sellable.some(s => s.id === id)))
  const load = () => api<Product[]>('/seller/products').then(r => { setAll(r); return r }, e => { setError(e.message); return [] as Product[] })
  useEffect(() => { load().then(r => { const p = find(r); if (p) { setName(p.name); setDescription(p.description ?? ''); setNotes(p.notes ?? '') } }) }, [id])
  const p = all ? find(all) : undefined
  async function saveProduct() {
    setBusy(true); setError(''); setNote('')
    try {
      const body = { name, description, ...(notes.trim() ? { notes } : {}) }
      if (p) { await api(`/seller/products/${p.id}`, { method: 'PUT', body }); setNote(t('Product saved.')); await load() }
      else { const r = await api<{ id: string }>('/seller/products', { method: 'POST', body }); navigate(`/listings/p/${r.id}?add=1`) }
    } catch (e: any) { setError(tm(e.message)) } finally { setBusy(false) }
  }
  if (id && !all) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  return <main className="ed">
    <p className="small"><a href="/listings">{t('Products')}</a> › {p ? p.name : t('Add product')}</p>
    <div className="pt-head"><div><h1>{p ? p.name : t('Add product')}</h1><p className="muted">{t('The product is your brand. Add each media type it has; for radio, TV and podcasts, add programmes if you sell by show.')}</p></div></div>
    <ol className="ed-steps" aria-label={t('Steps')}><li className={p ? 'done' : 'now'}>{t('Product')}</li><li className={p && p.media.length ? 'done' : p ? 'now' : ''}>{t('Media types')}</li><li className={p?.media.some(m => m.sellable.some(s => s.openSlots > 0)) ? 'done' : ''}>{t('List it')}</li></ol>
    {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}

    <section className="card pad form ed-prod">
      <h2>{t('1. Product')}</h2>
      <div className="grid2"><div className="field"><label htmlFor="pr-n">{t('Name')} <span className="req">*</span></label><input id="pr-n" dir="auto" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t('For example: Skyline FM')} /></div></div>
      <div className="field"><label htmlFor="pr-d">{t('Description')} <span className="req">*</span></label><textarea id="pr-d" dir="auto" rows={2} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="field"><label htmlFor="pr-x">{t('Anything else buyers should know (optional)')}</label><textarea id="pr-x" dir="auto" rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
        <span className="small muted">{notes.length}/500 · {t('Emails and phone numbers are not allowed.')}</span></div>
      <div className="ed-save"><span className="spacer" /><button type="button" className="btn primary" disabled={busy || !name.trim() || !description.trim()} onClick={saveProduct}>{p ? t('Save product') : t('Save and add media types')}</button></div>
    </section>

    {p && <section className="ed-media">
      <div className="ed-mh"><h2>{t('2. Media types')}</h2>{editing !== 'new' && <button type="button" className="btn primary" onClick={() => setEditing('new')}>+ {t('Add a media type')}</button>}</div>
      {editing === 'new' && <MediaForm product={p} onCancel={() => setEditing(null)} onSaved={async mid => { await load(); setEditing(null); setNote(t('Media type saved.')); setListing(mid) }} />}
      {!p.media.length && editing !== 'new' && <p className="muted">{t('No media types yet. Add the first one: radio, TV, newspaper, magazine, website, newsletter, podcast or social media.')}</p>}
      {p.media.map(m => editing === m.id ? <MediaForm key={m.id} product={p} m={m} onCancel={() => setEditing(null)} onSaved={async () => { await load(); setEditing(null); setNote(t('Media type saved.')) }} />
        : <article key={m.id} className="card ed-mcard">
          <div className="ed-mrow"><span className="pd-mic" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[m.channel] ?? ICON.digital} /></svg></span>
            <div className="pd-mt"><b>{mediaName(m)} · {m.name}</b><span className="small muted">{m.defaultPrice ? t('default {amount}', { amount: `AED ${(m.defaultPrice / 100).toLocaleString('en-US')}` }) : ''}{m.closeDays != null ? ` · ${t('bidding closes {n} days before', { n: m.closeDays })}` : ''}</span></div>
            <button type="button" className="btn" onClick={() => setEditing(m.id)}>{t('Edit')}</button></div>
          {listing === m.id && m.sellable.length > 0 && <div className="ed-listnow"><p><b>{t('Saved. List it now?')}</b></p>
            <ListingPanel products={[{ ...p, media: [m] }]} onClose={() => setListing(null)} onDone={load} /></div>}
          {HAS_PROGRAMMES.includes(m.channel) && m.details.programmes && <div className="ed-progs">
            <div className="ed-mh"><h3>{t('Programmes')}</h3>{prog !== `new-${m.id}` && <button type="button" className="btn" onClick={() => setProg(`new-${m.id}`)}>+ {t('Add a programme')}</button>}</div>
            {prog === `new-${m.id}` && <ProgrammeForm media={m} onCancel={() => setProg(null)} onSaved={async () => { await load(); setProg(null); setNote(t('Programme saved.')) }} />}
            {m.sellable.filter(s => s.kind === 'programme').map(s => prog === s.id ? <ProgrammeForm key={s.id} media={m} p={s} onCancel={() => setProg(null)} onSaved={async () => { await load(); setProg(null); setNote(t('Programme saved.')) }} />
              : <div key={s.id} className="ed-prow"><span><b>{s.name}</b><span className="small muted">{s.days?.length ? s.days.map(x => t(DAYS[x - 1])).join(', ') : ''}{s.startsAt ? ` · ${s.startsAt}–${s.endsAt}` : ''}{s.breaks?.length ? ` · ${t(s.breaks.length === 1 ? '1 break' : '{n} breaks', { n: s.breaks.length })}` : ''}</span></span>
                <button type="button" className="btn" onClick={() => setProg(s.id)}>{t('Edit')}</button><button type="button" className="btn primary" onClick={() => setListing(`p-${s.id}`)}>{t('List')}</button></div>)}
            {m.sellable.filter(s => s.kind === 'programme').map(s => listing === `p-${s.id}` && <ListingPanel key={`l-${s.id}`} products={[p]} placementId={s.id} onClose={() => setListing(null)} onDone={load} />)}
          </div>}
          {!(HAS_PROGRAMMES.includes(m.channel) && m.details.programmes) && m.sellable[0] && listing !== m.id && <div className="ed-prow"><span className="small muted">{t('Sold as one: {name}', { name: m.sellable[0].name })}</span>
            <button type="button" className="btn primary" onClick={() => setListing(`p-${m.sellable[0].id}`)}>{t('List')}</button></div>}
          {!(HAS_PROGRAMMES.includes(m.channel) && m.details.programmes) && m.sellable[0] && listing === `p-${m.sellable[0].id}` && <ListingPanel products={[p]} placementId={m.sellable[0].id} onClose={() => setListing(null)} onDone={load} />}
        </article>)}
    </section>}
  </main>
}
