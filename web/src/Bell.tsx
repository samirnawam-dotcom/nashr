import { tm } from './i18n-server'
import { useEffect, useRef, useState } from 'react'
import { usePop } from './Pop'
import { useLive } from './live'
import { api } from './api'
import { locale, t } from './i18n'
import { dayLabel, money } from './format'
import { dubai } from './calendar/layout'
import { noticeHref, noticeTexts, type N as Notice } from './notices'
import './directory/directory.css'

type N = Notice & { id: number; at: string; read: boolean; dealRef: string | null }
const TEXT = noticeTexts(t, money, iso => dayLabel(dubai(iso).date, { day: 'numeric', month: 'short' }), tm)

export function Bell({ role }: { role: string }) {
  const [data, setData] = useState<{ unread: number; items: N[] }>({ unread: 0, items: [] })
  // opening the list marks everything read
  const pop = usePop({ align: 'end', onOpen: () => { if (data.unread) { setData(d => ({ ...d, unread: 0 })); api('/notifications/read', { method: 'POST' }).catch(() => {}) } } }), open = pop.open
  // A short note when something new arrives while the page is open (the bell also polls, in case the live connection drops).
  const [toast, setToast] = useState<N | null>(null), seen = useRef<number | null>(null)
  const load = (announce = false) => api<{ unread: number; items: N[] }>('/notifications').then(d => { setData(d)
    const top = d.items[0]; if (announce && top && d.unread && top.id !== seen.current) setToast(top); seen.current = top?.id ?? null }, () => {})
  useEffect(() => { load(); const timer = setInterval(load, 60_000); return () => clearInterval(timer) }, [])
  useLive('notification', () => load(true))
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(null), 3000); return () => clearTimeout(x) }, [toast])
  return (
    <div className="bell">
      <button className="btn" aria-label={data.unread ? t('Notifications, {n} unread', { n: data.unread }) : t('Notifications')} {...pop.button}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      </button>
      {data.unread > 0 && <span className="n" dir="ltr" aria-hidden>{data.unread > 99 ? '99+' : data.unread}</span>}
      <div className="bell-toast-wrap" role="status" aria-live="polite">{toast && !open && <button type="button" className="card bell-toast" onClick={() => { setToast(null); pop.show() }}>{(TEXT[toast.kind] ?? (() => toast.kind))(toast)}</button>}</div>
      <div className="card bell-pop pp" role="menu" {...pop.panel}>
        {!data.items.length && <p className="muted small">{t('Nothing yet.')}</p>}
        {data.items.map(n => { const text = (TEXT[n.kind] ?? (() => n.kind))(n)
          const href = noticeHref(n, role)
          return <a key={n.id} href={href} className={n.read ? '' : 'unread'} onClick={pop.hide} role="menuitem">
            <div>{text}</div><div className="small muted">{n.dealRef ? `${n.dealRef} · ` : ''}{new Date(n.at).toLocaleString(locale, { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></a> })}
      </div>
    </div>
  )
}
