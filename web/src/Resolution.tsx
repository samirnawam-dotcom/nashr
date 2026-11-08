import { useState } from 'react'
import { api, upload } from './api'
import { dayLabel, money, time } from './format'
import { dubai } from './calendar/layout'
import { t } from './i18n'

export type Dispute = { decideBy: string | null; statements: { side: 'buyer' | 'publisher'; text: string; by: string; at: string; files: string[] }[] }
type Issue = { offer: any; status: string; openedAt: string } | null

const when = (iso: string) => `${dayLabel(dubai(iso).date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time(iso)}`

/**
 * How an issue between a buyer and a publisher is being resolved, the same for both sides: the money held, the steps with
 * their deadlines (the current one marked), and once Nashr is deciding, each side's case, with a form to add yours.
 */
export function Resolution({ side, status, issue, dispute, held, currency, deadline, statementPath, onChange }: {
  side: 'buyer' | 'publisher'; status: string; issue: Issue; dispute: Dispute | null; held: number; currency: string
  deadline: string | null; statementPath: string; onChange: () => void
}) {
  const [text, setText] = useState(''), [files, setFiles] = useState<{ id: string; name: string }[]>([]), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [note, setNote] = useState('')
  const open = status === 'issue_open', deciding = status === 'disputed'
  if (!issue && !dispute) return null
  const offered = !!issue?.offer
  // the sequence an issue goes through (brief 12A-C); each step says who acts and by when
  const steps: { label: string; who: string; at?: string | null; state: 'done' | 'now' | 'next' }[] = [
    { label: t('Issue reported'), who: t('The buyer'), at: issue?.openedAt, state: 'done' },
    { label: t('The publisher answers: corrected proof, a make-good or a refund'), who: t('The publisher'), at: open && !offered ? deadline : null,
      state: offered || deciding || !open ? 'done' : 'now' },
    { label: t('The buyer accepts the answer, or asks Nashr to decide'), who: t('The buyer'), at: open && offered ? deadline : null,
      state: deciding || (!open && issue?.status !== 'open') ? 'done' : open && offered ? 'now' : 'next' },
    { label: t('Nashr decides on the evidence from both sides'), who: t('Nashr'), at: dispute?.decideBy, state: deciding ? 'now' : issue?.status === 'escalated' ? 'done' : 'next' },
  ]
  const resolved = !open && !deciding
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNote('')
    try {
      await api(statementPath, { method: 'POST', body: { text: text.trim(), ...(files.length ? { files: files.map(f => `files/${f.id}`) } : {}) } })
      setText(''); setFiles([]); setNote(t('Added. Nashr and the other side can read it.')); onChange()
    } catch (err: any) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="card pad section resolution" aria-labelledby="res-h">
    <h2 id="res-h">{resolved ? t('How this was resolved') : t('How this is being resolved')}</h2>
    {!resolved && <p className="held"><span aria-hidden>🔒</span> {side === 'buyer'
      ? t('Your payment of {amount} is held by Nashr. Nobody is paid until this is resolved.', { amount: money(held, currency) })
      : t('The payment of {amount} is held by Nashr until this is resolved. It is released to you if the outcome is in your favour.', { amount: money(held, currency) })}</p>}
    <ol className="res-steps">{steps.map((s, i) => <li key={i} className={s.state} aria-current={s.state === 'now' ? 'step' : undefined}>
      <b>{s.label}</b><span className="small muted">{s.who}{s.at ? ` · ${s.state === 'done' ? when(s.at) : t('by {when}', { when: when(s.at) })}` : ''}</span></li>)}</ol>
    {deciding && dispute && <>
      <h3>{t('Each side\'s case')}</h3>
      {!dispute.statements.length ? <p className="muted small">{t('No statements yet. Explain what happened and attach anything that shows it: as-run logs, recordings, screenshots, emails.')}</p>
        : <ul className="statements">{dispute.statements.map((s, i) => <li key={i} className={s.side === (side === 'buyer' ? 'buyer' : 'publisher') ? 'mine' : ''}>
          <span className="small muted">{s.side === 'buyer' ? t('The buyer') : t('The publisher')} · {s.by} · {when(s.at)}</span>
          <p dir="auto">{s.text}</p>
          {s.files.length > 0 && <p className="small">{s.files.map((f, n) => <a key={f} href={`/api/files/${f}`}>{t('File {n}', { n: n + 1 })}</a>)}</p>}</li>)}</ul>}
      <form className="form" onSubmit={send}>
        <div className="field"><label htmlFor="stmt">{t('Your side')}</label>
          <textarea id="stmt" rows={4} maxLength={4000} dir="auto" value={text} onChange={e => setText(e.target.value)} /></div>
        <div className="field"><label htmlFor="stf">{t('Files (optional)')}</label>
          <input id="stf" type="file" multiple onChange={async e => {
            const picked = [...(e.target.files ?? [])].slice(0, 10 - files.length); setBusy(true); setError('')
            try { const up = []; for (const f of picked) up.push(await upload(f)); setFiles([...files, ...up]) } catch (err: any) { setError(err.message) } finally { setBusy(false); e.target.value = '' }
          }} />
          {files.length > 0 && <span className="small">{files.map(f => f.name).join(', ')}</span>}</div>
        <div className="row-flex"><button className="btn primary" disabled={busy || text.trim().length < 10}>{t('Add to the case')}</button></div>
        {error && <p className="error" role="alert">{error}</p>}{note && <p className="ok" role="status">{note}</p>}
      </form>
    </>}
    <p className="small"><a href="/dispute-policy">{t('How disputes work, and what each outcome means')}</a></p>
  </section>
}
