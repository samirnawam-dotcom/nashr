import { useState } from 'react'
import { Loading, useAct, useLoad, when } from './common'
import { PhotoBand } from '../PhotoBand'
import { navigate } from '../nav'
import { t } from '../i18n'
import { money } from '../format'
import { CoverageStatus, CoverageSummary, type Coverage } from '../seller/Coverage'
import { coverageTotal } from '../../../server/shared/coverage'

/** Nashr's review of media coverage submissions: waiting first. Approve puts it on sale on its dates. */
export function CoverageReviewPage() {
  const [status, setStatus] = useState('submitted')
  const { data, error } = useLoad<Coverage[]>(`/admin/coverage${status ? `?status=${status}` : ''}`, [status])
  return <main>
    <PhotoBand img="/brand/campaigns-wide.jpg" title={t('Coverage review')} sub={t('Programmes and coverage that publishers want to sell. Approve and it goes on sale on its dates.')} />
    <div className="toolbar"><div className="seg" role="radiogroup" aria-label={t('Show')}>
      {[['submitted', t('Waiting')], ['changes_requested', t('Changes asked')], ['approved', t('Approved')], ['rejected', t('Declined')], ['', t('All')]].map(([k, label]) =>
        <button key={k} type="button" role="radio" aria-checked={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{label}</button>)}</div></div>
    {!data ? <p className={error ? 'error' : 'muted'}>{error || t('Loading…')}</p> : !data.length ? <p className="muted empty">{status === 'submitted' ? t('Nothing waiting for review.') : t('Nothing here.')}</p>
      : <div className="card table-wrap"><table className="table"><thead><tr><th>{t('Programme')}</th><th>{t('Publisher')}</th><th>{t('Dates')}</th><th className="r">{t('Total price')}</th><th>{t('Submitted')}</th><th>{t('Status')}</th></tr></thead>
        <tbody>{data.map(c => <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/coverage-review/${c.id}`)}>
          <td><a href={`/coverage-review/${c.id}`}><b>{c.data.name}</b></a></td><td>{c.company}<div className="small muted">{c.outlet}</div></td>
          <td className="small">{(c.data.dates ?? []).length}</td><td className="r num">{money(coverageTotal(c.data))}</td>
          <td className="small">{c.submittedAt ? when(c.submittedAt) : '—'}</td><td><CoverageStatus s={c.status} /></td></tr>)}</tbody></table></div>}
  </main>
}

export function CoverageReviewItem({ id }: { id: string }) {
  const { data: c, error, load } = useLoad<Coverage>(`/admin/coverage/${id}`, [id])
  const { act, busy, msg } = useAct(load)
  const [note, setNote] = useState('')
  if (!c) return <Loading error={error} />
  return <main className="narrow">
    <p className="small"><a href="/coverage-review">{t('Coverage review')}</a></p>
    <h1>{c.data.name}</h1>
    <p className="muted">{c.company}{c.outlet && c.outlet !== c.company ? ` · ${c.outlet}` : ''} · <CoverageStatus s={c.status} /></p>
    {c.decisionNote && <p className="muted">{t('Note from Nashr: {note}', { note: c.decisionNote })}</p>}
    {c.status === 'approved' && c.placementId && <p className="ok">{t('On sale as a product.')} <a href="/calendar">{t('See the calendar')}</a></p>}
    <CoverageSummary c={c} />
    {c.status === 'submitted' && <section className="card pad section form">
      <h2>{t('Your decision')}</h2>
      <div className="field"><label htmlFor="cr-n">{t('Note to the publisher (needed to ask for changes or decline)')}</label>
        <textarea id="cr-n" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></div>
      <div className="row-flex">
        <button className="btn primary" disabled={busy} onClick={() => act('POST', `/admin/coverage/${c.id}/decide`, { decision: 'approve', ...(note.trim() ? { note: note.trim() } : {}) }, t('Approved. It is on sale on its dates.'))}>{t('Approve and put on sale')}</button>
        <button className="btn" disabled={busy || !note.trim()} onClick={() => act('POST', `/admin/coverage/${c.id}/decide`, { decision: 'changes', note: note.trim() }, t('Sent back for changes.'))}>{t('Ask for changes')}</button>
        <button className="btn" disabled={busy || !note.trim()} onClick={() => act('POST', `/admin/coverage/${c.id}/decide`, { decision: 'reject', note: note.trim() }, t('Declined.'))}>{t('Decline')}</button>
      </div>
      <p className="small muted">{t('Approving makes it a product at the total price, with one slot on each coverage date that is still far enough ahead to sell.')}</p>
    </section>}
    {msg}
  </main>
}
