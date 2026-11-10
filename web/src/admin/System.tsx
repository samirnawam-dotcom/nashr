import { CHANNELS, CHANNEL_NAME } from '../media'
import { useState } from 'react'
import { Loading, csv, date, money, useAct, useLoad, when } from './common'
import { PhotoBand } from '../PhotoBand'
import { CoverPicker } from '../CoverPicker'
import { t } from '../i18n'

type S = { key: string; value: unknown; founderOnly: boolean; history: { value: unknown; from: string; by: string }[] }
// What each setting means, in the owner's words (SPEC 11, 12). Unlisted keys show their raw name.
const LABEL: Record<string, [string, string?]> = {
  default_commission_bp: ['Default commission'], media_vat_bp: ['VAT on media'], nashr_vat_registered: ['Nashr is VAT-registered'],
  nashr_vat_bp: ['VAT on Nashr commission'], nashr_legal_name: ['Nashr legal name on documents'], nashr_address: ['Nashr registered address on documents', 'as on the trade licence'], two_step_for_money: ['Two-step sign-in before paying or connecting payouts'], nashr_trn: ["Nashr's TRN"],
  seller_window_hours: ['Publisher decision window'], payment_window_hours: ['Payment window', 'capped by the creative deadline'],
  min_step_bp: ['Minimum bid step'], max_choice_rounds: ['Next-bid choices before relisting'], review_working_days: ['Buyer proof review'],
  proof_due_working_days: ['Proof due after the run'], max_creative_rounds: ['Creative change rounds'], issue_response_hours: ['Publisher response to an issue'],
  prerun_hours: ['Pre-run check before air'], free_cancel_hours: ['Free cancellation after payment'], cancel_fee_bp: ['Publisher keeps on late cancellation'],
  processing_fee_bp: ['Card processing estimate'], processing_fee_fixed: ['Card processing fixed part'], media_invoice_timing: ['Media invoice issued at'],
  holidays_AE: ['UAE public holidays', 'list of dates, affects working days'], question_extension_hours: ['Question extension'], open_markets: ['Markets open for booking', 'country codes'],
}

Object.assign(LABEL, { dispute_decision_working_days: ['Nashr decision on a dispute'], terms_version: ['Terms version', 'date of the current terms'] })
/** A setting's value the way a person reads it; the raw value is what the Change box edits. */
function shown(key: string, v: unknown): string {
  if (v == null || v === '') return t('Not set')
  if (typeof v === 'boolean') return t(v ? 'Yes' : 'No')
  if (Array.isArray(v)) return v.length ? v.join(', ') : t('None')
  if (typeof v === 'number') return key.endsWith('_bp') ? `${v / 100}%` : key === 'processing_fee_fixed' ? money(v)
    : key.endsWith('_hours') ? t('{n} hours', { n: v }) : key.endsWith('_days') ? t('{n} working days', { n: v }) : String(v)
  return key === 'media_invoice_timing' ? t(v === 'run' ? 'When the ad has run' : 'At payment') : String(v)
}

export function SettingsPage({ isFounder }: { isFounder: boolean }) {
  const { data, error, load } = useLoad<S[]>('/admin/settings')
  const { act, busy, msg } = useAct(load)
  const [edit, setEdit] = useState<Record<string, string>>({}), [open, setOpen] = useState('')
  if (!data) return <Loading error={error} />
  function save(key: string) {
    let value: unknown
    try { value = JSON.parse(edit[key]) } catch { value = edit[key] } // plain text is saved as a string
    act('PUT', `/admin/settings/${key}`, { value }, t('{name} saved. It applies from now on; the old value stays in the history.', { name: LABEL[key] ? t(LABEL[key][0]) : key })).then(() => setEdit(({ [key]: _, ...rest }) => rest))
  }
  return (
    <main>
      <PhotoBand img="/brand/radio-wide.jpg" title={t("Settings")} sub={t("Changes take effect immediately and are kept with their history. Financial settings are the founder's.")} />
      {msg}
      <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Setting")}</th><th>{t("Value")}</th><th>{t("Changed")}</th><th /></tr></thead>
        <tbody>{data.map(s => { const locked = s.founderOnly && !isFounder; return [
          <tr key={s.key}>
            <td><b>{LABEL[s.key] ? t(LABEL[s.key][0]) : s.key}</b><div className="small muted">{[LABEL[s.key]?.[1] && t(LABEL[s.key][1]!), s.founderOnly && t('founder only')].filter(Boolean).join(' · ')}</div></td>
            <td>{s.key in edit ? <input className="search mono" style={{ minWidth: 220 }} aria-label={t('New value for {name}', { name: s.key })} value={edit[s.key]} onChange={e => setEdit({ ...edit, [s.key]: e.target.value })} />
              : <b className="set-val num">{shown(s.key, s.value)}</b>}</td>
            <td className="small muted">{s.history[0].by === 'system' ? t('Initial value') : `${date(s.history[0].from)} · ${s.history[0].by}`}</td>
            <td className="r"><div className="row-flex" style={{ justifyContent: 'flex-end' }}>
              {s.history.length > 1 && <button className="btn" onClick={() => setOpen(open === s.key ? '' : s.key)}>{t('History ({n})', { n: s.history.length })}</button>}
              {s.key in edit ? <><button className="btn primary" disabled={busy} onClick={() => save(s.key)}>{t("Save")}</button><button className="btn" onClick={() => setEdit(({ [s.key]: _, ...r }) => r)}>{t("Cancel")}</button></>
                : <button className="btn" disabled={locked} title={locked ? t('Only the founder can change this') : undefined} onClick={() => setEdit({ ...edit, [s.key]: JSON.stringify(s.value) })}>{t("Change")}</button>}
            </div></td></tr>,
          open === s.key && <tr key={`${s.key}-h`}><td colSpan={4}><ul className="timeline">{s.history.map((h, i) => <li key={i}><span className="small num">{when(h.from)}</span>
            <span><b className="num">{shown(s.key, h.value)}</b> <span className="small muted">{t('by {name}', { name: h.by })}</span></span></li>)}</ul></td></tr>] })}</tbody></table></div>
      <Staff isFounder={isFounder} />
    </main>
  )
}

type U = { id: string; name: string; email: string; role: string; status: string; twoFactor: boolean; twoStepOff?: boolean; createdAt: string }
function Staff({ isFounder }: { isFounder: boolean }) {
  const { data, load } = useLoad<U[]>('/admin/staff')
  const { act, busy, msg } = useAct(load)
  const [f, setF] = useState({ name: '', email: '', role: 'admin' }), [link, setLink] = useState('')
  return <section className="section">
    <h2 className="sec-h">{t("Nashr team")}</h2>
    <div className="table-wrap card"><table className="table"><tbody>{(data ?? []).map(u => <tr key={u.id}><td><b>{u.name}</b><div className="small muted"><bdi>{u.email}</bdi></div></td><td>{t(u.role)}</td>
      <td className="small">{t(u.status)}{u.twoFactor ? ` · ${t('authenticator on')}` : u.twoStepOff ? ` · ${t('authenticator off (switched off for testing)')}` : ''}</td><td className="small num">{date(u.createdAt)}</td></tr>)}</tbody></table></div>
    <div className="card pad form section" style={{ maxWidth: 560 }}>
      <h3>{t("Invite a team member")}</h3>
      <div className="field"><label htmlFor="sn">{t("Name")}</label><input id="sn" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="se">{t("Work email")}</label><input id="se" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
      <div className="field"><label htmlFor="sr">{t("Role")}</label><select id="sr" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
        <option value="admin">{t("Admin (operations)")}</option>{isFounder && <option value="founder">{t("Founder (financial settings too)")}</option>}</select></div>
      <p className="small muted">{t("They set a password and link an authenticator app from the invite link.")}</p>
      {msg}{link && <input className="search mono" readOnly value={location.origin + link} onFocus={e => e.target.select()} aria-label={t("Invite link")} />}
      <button className="btn primary" style={{ justifySelf: 'start' }} disabled={busy || !f.name || !f.email}
        onClick={() => act('POST', '/admin/staff', f, r => { setLink(r.inviteLink); setF({ name: '', email: '', role: 'admin' }); return t('Invite created. Send them the link.') })}>{t("Create invite")}</button>
    </div>
  </section>
}

type A = { at: string; actor: string; action: string; entity: string; entity_id: string; detail: unknown }
export function AuditPage() {
  // a link can open the log already filtered (?entityId=… from a user or company page)
  const start = () => { const q = new URLSearchParams(location.search); return { entityId: q.get('entityId') ?? '', actor: q.get('actor') ?? '', action: q.get('action') ?? '', from: '', to: '' } }
  const [f, setF] = useState(start), [draft, setDraft] = useState(f)
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const { data, error } = useLoad<A[]>(`/admin/audit?${qs}`, [qs])
  const field = (k: keyof typeof f) => ({ value: draft[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value }) })
  return (
    <main>
      <PhotoBand img="/brand/tv-wide.jpg" title={t("Audit log")} sub={t("Append-only. Filter by who, what, when or one record to see its whole history; the CSV holds every match.")} />
      <form className="toolbar admin-filters" onSubmit={e => { e.preventDefault(); setF({ ...draft, entityId: draft.entityId.trim() }) }}>
        <input className="search" aria-label={t("Who")} placeholder={t('Who (e.g. admin:, seller:, system)')} {...field('actor')} />
        <input className="search" aria-label={t("Action")} placeholder={t('Action (e.g. deal., password.)')} {...field('action')} />
        <input className="search mono" aria-label={t("Record id")} placeholder={t("Record id (deal, company, user…)")} {...field('entityId')} />
        <label className="small muted" htmlFor="af">{t('From')}</label><input id="af" className="search" type="date" {...field('from')} />
        <label className="small muted" htmlFor="at">{t('to')}</label><input id="at" className="search" type="date" {...field('to')} />
        <button className="btn">{t("Show")}</button><div className="spacer" />
        <a className="btn" href={`/api/admin/audit?${qs}&format=csv`}>{t('Download CSV')}</a></form>
      {!data ? <Loading error={error} /> : !data.length ? <p className="muted empty">{t('Nothing matches.')}</p> : <div className="table-wrap card"><table className="table"><thead><tr><th>{t("When")}</th><th>{t("Who")}</th><th>{t("Action")}</th><th>{t("Record")}</th><th>{t("Detail")}</th></tr></thead>
        <tbody>{data.map((a, i) => <tr key={i}><td className="small num">{when(a.at)}</td><td className="mono nw" title={a.actor}>{a.actor.replace(/^(\w+:[0-9a-f]{8})[0-9a-f-]{20,}$/, '$1…')}</td><td className="nw">{a.action}</td>
          <td className="mono"><a href="/audit" onClick={e => { e.preventDefault(); setDraft({ ...draft, entityId: a.entity_id }); setF({ ...f, entityId: a.entity_id }) }}>{a.entity}:{a.entity_id?.slice(0, 8)}</a></td>
          <td className="mono small">{a.detail ? JSON.stringify(a.detail).slice(0, 160) : ''}</td></tr>)}</tbody></table></div>}
    </main>
  )
}

type Q = { id: string; message: string; status: string; createdAt: string; outlet: string; outletId: string; buyer: string }
type O = { id: string; name: string; nameAr: string | null; channel: string; sectors: string[]; company: string | null; tier: string | null; audience: string | null
  website: string | null; description: string | null; estLow: number | null; estHigh: number | null; onNashr: boolean; coverUrl: string | null }

export function DirectoryAdminPage() {
  const quotes = useLoad<Q[]>('/admin/quotes'), outlets = useLoad<O[]>('/admin/outlets')
  const { act, busy, msg } = useAct(() => Promise.all([quotes.load(), outlets.load()]))
  const blank = { id: '', name: '', channel: 'newspaper', sectors: '', tier: '', audience: '', website: '', estLow: '', estHigh: '' }
  const [f, setF] = useState(blank)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const aed = (v: string) => v ? Math.round(Number(v) * 100) : undefined
  function save() {
    const body = JSON.parse(JSON.stringify({ name: f.name, ...(f.id ? {} : { channel: f.channel }), sectors: f.sectors.split(',').map(s => s.trim()).filter(Boolean),
      tier: f.tier || undefined, audience: f.audience || undefined, website: f.website || undefined, estLow: aed(f.estLow), estHigh: aed(f.estHigh) }))
    act(f.id ? 'PUT' : 'POST', f.id ? `/admin/outlets/${f.id}` : '/admin/outlets', body, f.id ? t('Saved.') : t('Added to the directory.')).then(() => setF(blank))
  }
  return (
    <main>
      <PhotoBand img="/brand/skyline.jpg" title={t("Directory")} sub={t("Outlets not on Nashr show Nashr's estimate, marked “unconfirmed”. Publishers on Nashr manage their own profile.")} />
      {msg}
      <h2 className="sec-h">{t("Quote requests")}</h2>
      {!quotes.data ? <Loading error={quotes.error} /> : !quotes.data.length ? <p className="muted">{t("None yet.")}</p> : <div className="table-wrap card"><table className="table"><tbody>{quotes.data.map(q => <tr key={q.id}>
        <td><b>{q.outlet}</b><div className="small muted">{q.buyer} · {date(q.createdAt)}</div></td><td>{q.message}</td><td className="small">{t(q.status)}</td>
        <td className="r">{q.status === 'open' ? <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/quotes/${q.id}`, { status: 'answered' }, t("Marked answered."))}>{t("Mark answered")}</button>
          : <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/quotes/${q.id}`, { status: 'open' }, t("Reopened."))}>{t("Reopen")}</button>}</td></tr>)}</tbody></table></div>}
      <h2 className="sec-h">{t("Outlets")}</h2>
      <div className="grid2" style={{ alignItems: 'start' }}>
        {!outlets.data ? <Loading error={outlets.error} /> : <div className="table-wrap card"><table className="table"><tbody>{outlets.data.map(o => <tr key={o.id}>
          <td><b>{o.name}</b><div className="small muted">{t(o.channel)}{o.tier ? ` · ${o.tier}` : ''}</div></td>
          <td className="small">{o.onNashr ? <>{t('On Nashr')} · {o.company}</> : o.estLow ? t('Estimate {low}–{high}', { low: money(o.estLow), high: money(o.estHigh) }) : t('No estimate')}</td>
          <td className="r">{!o.onNashr && <button className="btn" onClick={() => setF({ id: o.id, name: o.name, channel: o.channel, sectors: o.sectors.join(', '), tier: o.tier ?? '', audience: o.audience ?? '',
            website: o.website ?? '', estLow: o.estLow ? String(o.estLow / 100) : '', estHigh: o.estHigh ? String(o.estHigh / 100) : '' })}>{t("Edit")}</button>}</td></tr>)}</tbody></table></div>}
        <section className="card pad form">
          <h3>{f.id ? t('Edit {name}', { name: f.name }) : t('Add an outlet not on Nashr')}</h3>
          {f.id && (() => { const cur = outlets.data?.find(x => x.id === f.id); return cur && <CoverPicker key={cur.id} url={cur.coverUrl} channel={cur.channel} endpoint={`/admin/outlets/${cur.id}/cover`} onChange={() => outlets.load()} /> })()}
          <div className="field"><label htmlFor="on">{t("Name")}</label><input id="on" value={f.name} onChange={set('name')} /></div>
          {!f.id && <div className="field"><label htmlFor="oc">{t("Channel")}</label><select id="oc" value={f.channel} onChange={set('channel')}>{CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_NAME[c]}</option>)}</select></div>}
          <div className="field"><label htmlFor="os">{t("Sectors (comma-separated)")}</label><input id="os" value={f.sectors} onChange={set('sectors')} /></div>
          <div className="grid2"><div className="field"><label htmlFor="ot">{t("Tier")}</label><input id="ot" value={f.tier} onChange={set('tier')} /></div>
            <div className="field"><label htmlFor="oa">{t("Audience")}</label><input id="oa" value={f.audience} onChange={set('audience')} /></div></div>
          <div className="field"><label htmlFor="ow">{t("Website")}</label><input id="ow" placeholder="https://" value={f.website} onChange={set('website')} /></div>
          <div className="grid2"><div className="field"><label htmlFor="ol">{t("Estimate from (AED)")}</label><input id="ol" inputMode="decimal" value={f.estLow} onChange={set('estLow')} /></div>
            <div className="field"><label htmlFor="oh">{t("Estimate to (AED)")}</label><input id="oh" inputMode="decimal" value={f.estHigh} onChange={set('estHigh')} /></div></div>
          <div className="row-flex"><button className="btn primary" disabled={busy || !f.name} onClick={save}>{f.id ? t("Save") : t('Add')}</button>{f.id && <button className="btn" onClick={() => setF(blank)}>{t("Cancel")}</button>}</div>
        </section>
      </div>
    </main>
  )
}
