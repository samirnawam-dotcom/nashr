import { useEffect, useRef, useState } from 'react'
import { useLive } from './live'
import { api } from './api'
import { locale, t } from './i18n'
import { dayLabel, money } from './format'
import { dubai } from './calendar/layout'
import { noticeHref, noticeTexts, type N as Notice } from './notices'
import './directory/directory.css'

type N = Notice & { id: number; at: string; read: boolean; dealRef: string | null }
const TEXT = noticeTexts(t, money, iso => dayLabel(dubai(iso).date, { day: 'numeric', month: 'short' }))

export function Bell({ role }: { role: string }) {
  const [data, setData] = useState<{ unread: number; items: N[] }>({ unread: 0, items: [] }), [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // A short note when something new arrives while the page is open (the bell also polls, in case the live connection drops).
  const [toast, setToast] = useState<N | null>(null), seen = useRef<number | null>(null)
  const load = (announce = false) => api<{ unread: number; items: N[] }>('/notifications').then(d => { setData(d)
    const top = d.items[0]; if (announce && top && d.unread && top.id !== seen.current) setToast(top); seen.current = top?.id ?? null }, () => {})
  useEffect(() => { load(); const timer = setInterval(load, 60_000); return () => clearInterval(timer) }, [])
  useLive('notification', () => load(true))
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(null), 6000); return () => clearTimeout(x) }, [toast])
  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    addEventListener('mousedown', away); return () => removeEventListener('mousedown', away)
  }, [])
  async function toggle() {
    setOpen(!open)
    if (!open && data.unread) { await api('/notifications/read', { method: 'POST' }); setData({ ...data, unread: 0 }) }
  }
  return (
    <div className="bell" ref={ref}>
      <button className="btn" aria-label={data.unread ? t('Notifications, {n} unread', { n: data.unread }) : t('Notifications')} aria-expanded={open} onClick={toggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      </button>
      {data.unread > 0 && <span className="n" aria-hidden>{data.unread}</span>}
      <div className="bell-toast-wrap" role="status" aria-live="polite">{toast && !open && <button type="button" className="card bell-toast" onClick={() => { setToast(null); toggle() }}>{(TEXT[toast.kind] ?? (() => toast.kind))(toast)}</button>}</div>
      {open && <div className="card bell-pop" role="menu">
        {!data.items.length && <p className="muted small">{t('Nothing yet.')}</p>}
        {data.items.map(n => { const text = (TEXT[n.kind] ?? (() => n.kind))(n)
          const href = noticeHref(n, role)
          return <a key={n.id} href={href} className={n.read ? '' : 'unread'} onClick={() => setOpen(false)} role="menuitem">
            <div>{text}</div><div className="small muted">{n.dealRef ? `${n.dealRef} · ` : ''}{new Date(n.at).toLocaleString(locale, { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></a> })}
      </div>}
    </div>
  )
}
