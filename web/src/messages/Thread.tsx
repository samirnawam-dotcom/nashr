import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { dayLabel, time } from '../format'
import { dubai, todayInDubai } from '../calendar/layout'
import { t } from '../i18n'
import './messages.css'

export type Msg = { id: string; mine: boolean; company: string; body: string; at: string; flagged?: boolean }
type Data = { open: boolean; canWrite: boolean; messages: Msg[] }

const MAX = 2000
// On a phone the keyboard's return key makes a new line; the Send button sends.
const touch = () => matchMedia('(hover: none)').matches
const day = (iso: string) => { const d = dubai(iso).date; return d === todayInDubai() ? t('Today') : dayLabel(d) }

/** Messages grouped under a day heading; consecutive messages from one side share one name line. */
export function Bubbles({ messages, staff }: { messages: Msg[]; staff?: boolean }) {
  return <ol className="msgs">{messages.map((m, i) => {
    const prev = messages[i - 1], newDay = !prev || dubai(prev.at).date !== dubai(m.at).date, sameSide = !newDay && prev.company === m.company
    return <li key={m.id} className="msg-li">
      {newDay && <div className="msg-day"><span>{day(m.at)}</span></div>}
      <div className={`msg ${m.mine ? 'mine' : 'theirs'} ${sameSide ? 'cont' : ''} ${m.flagged ? 'flagged' : ''}`}>
        {!sameSide && <span className="msg-who">{m.mine ? t('You') : m.company}</span>}
        <p className="msg-body" dir="auto">{m.body}</p>
        <span className="msg-meta"><time dateTime={m.at}>{time(m.at)}</time>{staff && m.flagged && <b> · {t('Flagged: may be moving off Nashr')}</b>}</span>
      </div></li> })}</ol>
}

/**
 * The conversation on one booking. Updates every 15 seconds while the page is in view; Enter sends, Shift+Enter starts a new line.
 * If a message is refused (an email or phone number), the text stays in the box so it can be fixed.
 */
export function Thread({ dealId, other, compact, side }: { dealId: string; other: string; compact?: boolean; side: 'buyer' | 'seller' }) {
  const [data, setData] = useState<Data | null>(null), [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const list = useRef<HTMLDivElement>(null), box = useRef<HTMLTextAreaElement>(null), seen = useRef(0)
  const load = () => api<Data>(`/deals/${dealId}/messages`).then(setData, e => setError(e.message))
  useEffect(() => {
    setData(null); load()
    const tick = setInterval(() => { if (document.visibilityState === 'visible') load() }, 15_000)
    return () => clearInterval(tick)
  }, [dealId])
  // Keep the newest message in view when one arrives.
  useLayoutEffect(() => {
    const n = data?.messages.length ?? 0
    if (n !== seen.current && list.current) list.current.scrollTop = list.current.scrollHeight
    seen.current = n
  }, [data])
  // The box grows with what is typed, up to about six lines.
  useLayoutEffect(() => { const b = box.current; if (b) { b.style.height = 'auto'; b.style.height = `${Math.min(b.scrollHeight, 160)}px` } }, [text])

  async function send() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true); setError('')
    try { setData(await api<Data>(`/deals/${dealId}/messages`, { method: 'POST', body: { body } })); setText('') }
    catch (e: any) { setError(e.message) } finally { setBusy(false); box.current?.focus() }
  }

  // Owner rule: buyer and publisher talk only once the buyer has paid, so every agreement stays on Nashr.
  if (data && !data.open) return (
    <section className="card pad thread-locked" aria-label={t('Messages with {name}', { name: other })}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      <div><b>{side === 'buyer' ? t('Messages with the publisher open once you have paid') : t('Messages with the buyer open once they have paid')}</b>
        <p className="small muted">{t('Until then, the booking brief carries everything the publisher needs. The conversation closes when the deal is finished.')}</p></div>
    </section>)
  return (
    <section className={`card thread ${compact ? 'compact' : ''}`} aria-label={t('Messages with {name}', { name: other })}>
      <header className="thread-h">
        <h2>{t('Messages with {name}', { name: other })}</h2>
        <p className="small muted thread-privacy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          {t('Everything stays on Nashr. Emails and phone numbers can’t be sent.')}</p>
      </header>
      <div className="thread-list" ref={list} aria-live="polite">
        {!data ? <p className="muted thread-empty">{error || t('Loading…')}</p>
          : !data.messages.length ? <p className="muted thread-empty">{t('No messages yet. Ask about timing, the creative, or anything else about this booking.')}</p>
          : <Bubbles messages={data.messages} />}
      </div>
      {data && (data.canWrite ? <form className="composer" onSubmit={e => { e.preventDefault(); send() }}>
        <label className="visually-hidden" htmlFor={`m-${dealId}`}>{t('Your message')}</label>
        <textarea id={`m-${dealId}`} ref={box} rows={1} dir="auto" maxLength={MAX} value={text} placeholder={t('Write a message…')} disabled={busy}
          onChange={e => { setText(e.target.value); if (error) setError('') }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touch()) { e.preventDefault(); send() } }} />
        <button className="btn primary composer-send" disabled={busy || !text.trim()} aria-label={t('Send')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flip-rtl"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <span>{t('Send')}</span></button>
        {(error || text.length > MAX - 200) && <p className={`composer-note small ${error ? 'error' : 'muted'}`} role={error ? 'alert' : undefined}>
          {error || t('{n} characters left', { n: MAX - text.length })}</p>}
        <p className="composer-hint small muted">{t('Enter to send · Shift+Enter for a new line')}</p>
      </form> : <p className="thread-closed small muted">{t('This deal is finished, so the conversation is closed. It stays here as a record.')}</p>)}
    </section>
  )
}
