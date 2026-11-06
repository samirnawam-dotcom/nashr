import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { usePath } from '../nav'
import { describe, type SlotFilter } from '../../../server/shared/slot-filter'

export type Saved = { id: string; name: string; filter: SlotFilter; alerts: boolean }

/** The same filter written in a fixed key order, so "is this saved search the one on screen?" is a string compare. */
const canonical = (f: SlotFilter) => JSON.stringify(Object.keys(f).sort().reduce((o, k) => {
  const v = (f as any)[k]; if (v != null && v !== '') o[k] = Array.isArray(v) ? [...v].sort() : v; return o }, {} as Record<string, unknown>))

/**
 * A buyer's saved calendar searches: apply one, switch its alerts on or off, delete it, or save what is on screen.
 * Alerts arrive in the bell ("3 new slots match …") and open the calendar with that search applied (?search=id).
 */
export function SavedSearches({ filter, active, names, onApply }: { filter: SlotFilter; active: number; names: Record<string, string>; onApply: (f: SlotFilter) => void }) {
  const [list, setList] = useState<Saved[] | null>(null), [error, setError] = useState(''), [note, setNote] = useState('')
  const [saving, setSaving] = useState(false), [name, setName] = useState(''), [alerts, setAlerts] = useState(true), [busy, setBusy] = useState(false)
  const path = usePath(), applied = useRef('')
  useEffect(() => { api<Saved[]>('/searches').then(setList, e => setError(e.message)) }, [])
  // Opened from an alert: apply that search once.
  useEffect(() => {
    const id = new URLSearchParams(path.split('?')[1] ?? '').get('search')
    const hit = id && list?.find(s => s.id === id)
    if (!id || !list || applied.current === id) return
    applied.current = id
    if (hit) onApply(hit.filter)
    else setNote('That saved search was deleted, so the calendar shows every slot.')
  }, [path, list])

  const current = canonical(filter)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const s = await api<Saved>('/searches', { method: 'POST', body: { name: name.trim(), filter, alerts } })
      setList([...(list ?? []), s]); setSaving(false)
      setNote(alerts ? 'Saved. We will alert you when new slots match.' : 'Saved.')
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  async function toggle(s: Saved) {
    setError(''); setNote('')
    try { const u = await api<Saved>(`/searches/${s.id}`, { method: 'PUT', body: { alerts: !s.alerts } }); setList(list!.map(x => x.id === s.id ? u : x)) }
    catch (err: any) { setError(err.message) }
  }
  async function remove(s: Saved) {
    setError(''); setNote('')
    try { await api(`/searches/${s.id}`, { method: 'DELETE' }); setList(list!.filter(x => x.id !== s.id)); setNote(`Deleted “${s.name}”.`) }
    catch (err: any) { setError(err.message) }
  }

  return (
    <section className="saved" aria-label="Saved searches">
      <h3 className="side-h">Saved searches</h3>
      {list && !list.length && !saving && <p className="small muted">Set the filters below, then save the search to get an alert when new slots match.</p>}
      {list && list.length > 0 && <ul className="saved-list">{list.map(s => {
        const on = canonical(s.filter) === current
        return <li key={s.id} className={on ? 'on' : ''}>
          <button type="button" className="saved-name" aria-current={on || undefined} title={describe(s.filter, names)} onClick={() => onApply(s.filter)}>
            <b>{s.name}</b><span>{describe(s.filter, names)}</span></button>
          <button type="button" className={`saved-bell ${s.alerts ? 'is-on' : ''}`} aria-pressed={s.alerts} onClick={() => toggle(s)}
            aria-label={`${s.alerts ? 'Turn off' : 'Turn on'} alerts for ${s.name}`} title={s.alerts ? 'Alerts on' : 'Alerts off'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />{!s.alerts && <path d="M3 3l18 18" />}</svg>
          </button>
          <button type="button" className="saved-del" onClick={() => remove(s)} aria-label={`Delete ${s.name}`} title="Delete">×</button>
        </li> })}</ul>}
      {active > 0 && !saving && !list?.some(x => canonical(x.filter) === current) && <button type="button" className="btn saved-save" onClick={() => { setName(describe(filter, names).slice(0, 80)); setAlerts(true); setSaving(true); setNote('') }}>Save this search</button>}
      {saving && <form className="saved-form" onSubmit={save}>
        <label className="small" htmlFor="saved-name">Name</label>
        <input id="saved-name" className="cal-input" value={name} maxLength={80} onChange={e => setName(e.target.value)} required autoFocus />
        <label className="check"><input type="checkbox" checked={alerts} onChange={e => setAlerts(e.target.checked)} />Alert me when new slots match</label>
        <div className="row-flex"><button className="btn primary" disabled={busy || !name.trim()}>Save</button><button type="button" className="btn" onClick={() => setSaving(false)}>Cancel</button></div>
      </form>}
      {error && <p className="error small" role="alert">{error}</p>}
      {note && <p className="ok small" role="status">{note}</p>}
    </section>
  )
}
