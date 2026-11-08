import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import { DEAL_STATUS, DealStatus } from '../seller/common'
import '../directory/directory.css'
import '../seller/seller.css'
import './admin.css'
import { t } from '../i18n'

export { money, DealStatus, DEAL_STATUS }
export const when = (iso: string | null) => iso ? `${dayLabel(dubai(iso).date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${time(iso)}` : '—'
export const date = (iso: string | null) => iso ? dayLabel(dubai(iso).date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** Load once, reload on demand; every admin page has the same loading and error states. */
export function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState('')
  const load = () => api<T>(path).then(d => { setData(d); setError('') }, e => setError(e.message))
  useEffect(() => { load() }, [path, ...deps])
  return { data, error, load }
}

/** A POST/PUT with busy, error and confirmation message. */
export function useAct(after: () => unknown) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('')
  async function act(method: string, path: string, body: object, done: string | ((r: any) => string)) {
    setBusy(true); setError(''); setNote('')
    try { const r = await api(path, { method, body }); setNote(typeof done === 'string' ? done : done(r)); await after() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const msg = <>{error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}</>
  return { act, busy, msg }
}

export const Loading = ({ error }: { error: string }) => <main>{error ? <p className="error">{error}</p> : <p className="muted">{t('Loading…')}</p>}</main>

/** Download rows as CSV from the browser (reports, audit). */
export function csv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0]), esc = (v: unknown) => { const s = String(v ?? ''); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` } // no formulas in a spreadsheet
  const blob = new Blob([[cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
}
