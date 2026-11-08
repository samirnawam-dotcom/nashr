import { useState } from 'react'
import { Loading, useAct, useLoad, when } from './common'
import { PhotoBand } from '../PhotoBand'
import { t } from '../i18n'
import { TOPIC } from '../Help'

type Req = { id: string; topic: string; dealId: string | null; dealRef: string | null; message: string; status: 'open' | 'answered' | 'closed'
  reply: string | null; createdAt: string; answeredAt: string | null; company: string; companyId: string; user: string }

/** Questions from buyers and publishers: open ones first; the answer goes to their bell and their Help page. */
export function SupportPage() {
  const [status, setStatus] = useState('open')
  const { data, error, load } = useLoad<Req[]>(`/admin/support${status ? `?status=${status}` : ''}`, [status])
  const { act, busy, msg } = useAct(load)
  const [reply, setReply] = useState<Record<string, string>>({})
  return (
    <main>
      <PhotoBand img="/brand/campaigns-wide.jpg" title={t('Support')} sub={t('Questions sent from the Help page. Your answer reaches them on their bell.')} />
      <div className="toolbar"><div className="seg" role="radiogroup" aria-label={t('Show')}>
        {[['open', t('Waiting')], ['answered', t('Answered')], ['closed', t('Closed')], ['', t('All')]].map(([k, label]) =>
          <button key={k} type="button" role="radio" aria-checked={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{label}</button>)}</div></div>
      {msg}
      {!data ? <Loading error={error} /> : !data.length ? <p className="muted empty">{status === 'open' ? t('No questions waiting.') : t('Nothing here.')}</p>
        : <ul className="support-list card pad">{data.map(r => <li key={r.id}>
          <div className="row-flex"><b>{t(TOPIC[r.topic] ?? r.topic)}</b> <span className="small"><a href={`/accounts/${r.companyId}`}>{r.company}</a> · {r.user}</span>
            {r.dealRef && r.dealId && <a className="small" href={`/deals/${r.dealId}`}>{r.dealRef}</a>}<div className="spacer" /><span className="small muted">{when(r.createdAt)}</span></div>
          <p className="support-msg" dir="auto">{r.message}</p>
          {r.reply && <div className="support-reply"><span className="small muted">{t('Answered')}{r.answeredAt ? `, ${when(r.answeredAt)}` : ''}</span><p dir="auto">{r.reply}</p></div>}
          {r.status !== 'closed' && <div className="form" style={{ marginTop: 8 }}>
            <label className="sr-only" htmlFor={`r-${r.id}`}>{t('Answer')}</label>
            <textarea id={`r-${r.id}`} rows={3} maxLength={4000} placeholder={t('Your answer')} value={reply[r.id] ?? ''} onChange={e => setReply({ ...reply, [r.id]: e.target.value })} />
            <div className="row-flex">
              <button className="btn primary" disabled={busy || (reply[r.id] ?? '').trim().length < 2}
                onClick={() => act('POST', `/admin/support/${r.id}/reply`, { reply: reply[r.id].trim() }, t('Answer sent.'))}>{t('Send answer')}</button>
              <button className="btn" disabled={busy || (reply[r.id] ?? '').trim().length < 2}
                onClick={() => act('POST', `/admin/support/${r.id}/reply`, { reply: reply[r.id].trim(), close: true }, t('Answer sent and closed.'))}>{t('Send and close')}</button>
              <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/support/${r.id}/close`, {}, t('Closed.'))}>{t('Close without answer')}</button></div></div>}
        </li>)}</ul>}
    </main>
  )
}
