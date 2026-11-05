import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import './directory/directory.css'

type N = { id: number; kind: string; dealId: string | null; dealRef: string | null; data: any; at: string; read: boolean }
const TEXT: Record<string, (n: N) => string> = {
  'deal.awaiting_payment': () => 'The publisher accepted. Pay to secure the slot.',
  'deal.declined': () => 'Your request was not selected.',
  'deal.lapsed': () => 'The payment window passed and the booking lapsed.',
  'deal.secured': () => 'Payment is secured.',
  'deal.cancelled': () => 'The booking was cancelled.',
  'deal.refunded': () => 'A refund was issued.',
  'deal.released': () => 'Payment was released.',
  'deal.opened': n => n.data?.kind === 'buy_now' ? 'New buy-now request.' : 'New booking to decide on.',
  'bid.outbid': n => `You were outbid on ${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? 'a slot'}.`,
  'creative.sent': () => 'New creative to review.',
  'creative.approved': () => 'Your creative was approved.',
  'creative.changes_requested': n => `The publisher asked for changes${n.data?.reason ? `: ${n.data.reason}` : '.'}`,
  'creative.technical_issue': () => 'Your file has a technical problem. Upload a fixed version.',
  'creative.rejected': () => 'Your creative was rejected.',
  'proof.ready': () => 'Proof is ready for your review.',
  'issue.reported': () => 'The buyer reported an issue.',
  'issue.offer': () => 'The publisher offered a fix for your issue.',
  'issue.resolved': () => 'The issue was resolved.',
  'dispute.opened': () => 'A dispute was opened.',
  'prerun.confirm_final_version': () => 'Confirm the final version before air.',
  'prerun.confirm_slot_and_creative': () => 'Confirm the slot and creative before air.',
  'access.requested': n => `${n.data?.company ?? 'Someone'} requested access.`,
  'quote.requested': n => `Quote requested for ${n.data?.outlet ?? 'an outlet'}.`,
}

export function Bell({ role }: { role: string }) {
  const [data, setData] = useState<{ unread: number; items: N[] }>({ unread: 0, items: [] }), [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const load = () => api('/notifications').then(setData, () => {})
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t) }, [])
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
      <button className="btn" aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} aria-expanded={open} onClick={toggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      </button>
      {data.unread > 0 && <span className="n" aria-hidden>{data.unread}</span>}
      {open && <div className="card bell-pop" role="menu">
        {!data.items.length && <p className="muted small">Nothing yet.</p>}
        {data.items.map(n => { const text = (TEXT[n.kind] ?? (() => n.kind))(n)
          const href = n.dealId ? (role === 'seller' ? `#/deals/${n.dealId}` : `#/bookings/${n.dealId}`) : n.kind === 'bid.outbid' ? '#/calendar' : undefined
          return <a key={n.id} href={href} className={n.read ? '' : 'unread'} onClick={() => setOpen(false)} role="menuitem">
            <div>{text}</div><div className="small muted">{n.dealRef ? `${n.dealRef} · ` : ''}{new Date(n.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></a> })}
      </div>}
    </div>
  )
}
