import { Fragment, useState } from 'react'
import { Loading, useAct, useLoad, when } from './common'
import { PhotoBand } from '../PhotoBand'
import { t } from '../i18n'

type Row = { id: string; to: string; kind: string; subject: string; status: 'queued' | 'sent' | 'failed' | 'held'; attempts: number; error: string | null
  createdAt: string; sentAt: string | null; company: string | null }
type Data = { smtp: { host: string; port: number; from: string; user: string | null } | null; counts: Record<string, number>; items: Row[] }
const STATUS: Record<string, string> = { queued: 'Waiting to send', sent: 'Sent', failed: 'Failed', held: 'Held: email not set up' }

/** Every email Nashr sends: whether email is set up, what went out, what is waiting or failed, and the email itself. */
export function EmailsPage() {
  const [status, setStatus] = useState(''), [q, setQ] = useState(''), [open, setOpen] = useState<string | null>(null), [to, setTo] = useState('')
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(q.trim() ? { q: q.trim() } : {}) }).toString()
  const { data, error, load } = useLoad<Data>(`/admin/emails?${qs}`, [qs])
  const { act, busy, msg } = useAct(load)
  if (!data) return <Loading error={error} />
  return (
    <main>
      <PhotoBand img="/brand/desk-wide.jpg" title={t('Emails')} sub={t('Everything Nashr emails: sent, waiting, failed, or held until email is set up.')} />
      {data.smtp ? <p className="ok">{t('Email is set up: {from} through {host}:{port}.', { from: data.smtp.from, host: data.smtp.host, port: data.smtp.port })}</p>
        : <div className="warn"><p><b>{t('Email is not set up yet.')}</b> {t('Emails are kept here instead of being sent. Reset links and invites are handed out by Nashr\'s team meanwhile.')}</p>
          <p className="small">{t('To switch it on, add these to the server settings file (/etc/nashr.env) and redeploy: SMTP_HOST, SMTP_PORT (587, or 465 for TLS), SMTP_USER, SMTP_PASS, SMTP_FROM (for example "Nashr <noreply@your-domain>").')}</p></div>}
      {data.smtp && <form className="row-flex" style={{ margin: '12px 0' }} onSubmit={e => { e.preventDefault(); act('POST', '/admin/emails/test', { to }, t('Test email sent to {to}.', { to })) }}>
        <input className="search" type="email" required placeholder={t('Your email')} aria-label={t('Send a test email to')} value={to} onChange={e => setTo(e.target.value)} />
        <button className="btn" disabled={busy}>{t('Send a test email')}</button></form>}
      {msg}
      <div className="admin-filters">
        <div className="seg" role="radiogroup" aria-label={t('Show')}>{[['', t('All')], ['queued', t('Waiting')], ['failed', t('Failed')], ['sent', t('Sent')], ['held', t('Held')]].map(([k, label]) =>
          <button key={k} type="button" role="radio" aria-checked={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{label}{k && data.counts[k] ? ` (${data.counts[k]})` : ''}</button>)}</div>
        <input className="search" type="search" placeholder={t('Recipient or subject')} aria-label={t('Search emails')} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {!data.items.length ? <p className="muted empty">{t('No emails here.')}</p> : <div className="table-wrap card"><table className="table"><thead><tr>
        <th>{t('When')}</th><th>{t('To')}</th><th>{t('Subject')}</th><th>{t('Status')}</th><th /></tr></thead>
        <tbody>{data.items.map(m => <Fragment key={m.id}>
          <tr>
            <td className="small num">{when(m.createdAt)}</td><td className="small"><bdi>{m.to}</bdi>{m.company && <div className="muted">{m.company}</div>}</td>
            <td dir="auto">{m.subject}</td>
            <td className={`small ${m.status === 'failed' ? 'outbid' : m.status === 'sent' ? 'lead' : m.status === 'queued' ? 'soon' : 'muted'}`}>{t(STATUS[m.status])}
              {m.status !== 'held' && m.attempts > 1 && <div className="muted">{t('{n} tries', { n: m.attempts })}</div>}{m.error && <div className="muted mono">{m.error}</div>}</td>
            <td className="r"><button className="btn" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? t('Close') : t('Read')}</button>
              {data.smtp && (m.status === 'failed' || m.status === 'held') && <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/emails/${m.id}/resend`, {}, t('Queued to send again.'))}>{t('Send again')}</button>}</td>
          </tr>
          {open === m.id && <tr><td colSpan={5}><iframe className="email-preview" title={m.subject} sandbox="" src={`/api/admin/emails/${m.id}`} /></td></tr>}
        </Fragment>)}</tbody></table></div>}
    </main>
  )
}
