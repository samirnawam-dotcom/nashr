import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { tm } from '../i18n-server'
import { api } from '../api'
import { dayLabel, time } from '../format'
import { dubai, todayInDubai } from '../calendar/layout'
import { t } from '../i18n'
import { Thread } from './Thread'
import './messages.css'

export type Conversation = { dealId: string; ref: string; status: string; outlet: string; label: string; with: string
  last: { body: string; at: string; mine: boolean }; unread: number }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const stamp = (iso: string) => dubai(iso).date === todayInDubai() ? time(iso) : dayLabel(dubai(iso).date, { day: 'numeric', month: 'short' })

/**
 * Every conversation, newest first. On a wide screen the list and the open conversation sit side by side;
 * on a phone the list opens each conversation on its own page (/messages/<booking>).
 */
export function MessagesPage({ open, role, top }: { open?: string; role: 'buyer' | 'seller'; top?: ReactNode }) {
  const [list, setList] = useState<Conversation[] | null>(null), [error, setError] = useState(''), [q, setQ] = useState('')
  const load = () => api<Conversation[]>('/messages').then(setList, e => setError(e.message))
  useEffect(() => { load(); const tick = setInterval(() => document.visibilityState === 'visible' && load(), 30_000); return () => clearInterval(tick) }, [])
  useEffect(() => { if (open) load() }, [open]) // opening one marks it read
  const shown = useMemo(() => (list ?? []).filter(c => !q || `${c.with} ${c.outlet} ${tm(c.label)} ${c.ref}`.toLowerCase().includes(q.toLowerCase())), [list, q])
  const current = list?.find(c => c.dealId === open)
  const booking = (id: string) => role === 'seller' ? `/deals/${id}` : `/bookings/${id}`

  return (
    <main className={`messages-page ${open ? 'has-open' : ''}`}>
      {top && !open && <div className="messages-head"><h1>{t('Inbox')}</h1><p className="muted">{t('What needs you first, then your conversations with publishers.')}</p></div>}
      {!open && top}
      <div className={`messages-head ${top ? 'sub' : ''}`}>{top ? <h2>{t('Messages')}</h2> : <h1>{t('Messages')}</h1>}
        <p className="muted">{role === 'seller' ? t('Conversations with buyers about their bookings.') : t('Conversations with publishers about your bookings.')}</p></div>
      {error && <p className="error">{error}</p>}
      {list && !list.length ? <section className="card pad messages-empty">
        <h2>{t('No conversations yet')}</h2>
        <p className="muted">{role === 'seller' ? t('Once a buyer has paid for a booking, you can talk about it here until the deal is finished. Open a paid deal to start.')
          : t('Each paid booking has its own conversation with the publisher, open until the deal is finished. Open a paid booking to ask about timing or the creative.')}</p>
        <a className="btn" href={role === 'seller' ? '/deals' : '/bookings'}>{role === 'seller' ? t('Go to deals') : t('Go to bookings')}</a>
      </section> : <div className="messages-grid">
        <section className="card conv-list" aria-label={t('Conversations')}>
          <div className="conv-search"><input className="search" type="search" placeholder={t('Search by company, outlet or order')} aria-label={t('Search conversations')}
            value={q} onChange={e => setQ(e.target.value)} /></div>
          {!list ? <p className="muted pad">{t('Loading…')}</p> : !shown.length ? <p className="muted pad">{t('No conversations match.')}</p>
            : <ul>{shown.map(c => <li key={c.dealId}>
              <a href={`/messages/${c.dealId}`} className={`conv ${c.dealId === open ? 'on' : ''} ${c.unread ? 'unread' : ''}`} aria-current={c.dealId === open || undefined}>
                <span className="conv-avatar" aria-hidden>{initials(c.with)}</span>
                <span className="conv-main">
                  <span className="conv-top"><b className="conv-with">{c.with}</b><time className="conv-time small" dateTime={c.last.at}>{stamp(c.last.at)}</time></span>
                  <span className="conv-what small muted">{c.outlet} · {tm(c.label)}</span>
                  <span className="conv-last small" dir="auto">{c.last.mine && <span className="muted">{t('You:')} </span>}{c.last.body}</span>
                </span>
                {c.unread > 0 && <span className="conv-badge" aria-label={t('{n} unread', { n: c.unread })}>{c.unread}</span>}
              </a></li>)}</ul>}
        </section>
        <div className="conv-open">
          {open && current ? <>
            <div className="conv-bar">
              <a className="btn conv-back" href="/messages"><span aria-hidden className="flip-rtl">‹</span> {t('All conversations')}</a>
              <span className="small muted">{current.outlet} · {tm(current.label)} · <span className="num">{current.ref}</span></span>
              <a className="btn" href={booking(current.dealId)}>{role === 'seller' ? t('Open deal') : t('Open booking')}</a>
            </div>
            <Thread dealId={current.dealId} other={current.with} side={role} />
          </> : open && list ? <p className="muted">{t('This conversation is not available.')} <a href="/messages">{t('All conversations')}</a></p>
          : <div className="conv-pick muted"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M4 5h16v11H8l-4 4z" /></svg>
              <p>{t('Choose a conversation.')}</p></div>}
        </div>
      </div>}
    </main>
  )
}
