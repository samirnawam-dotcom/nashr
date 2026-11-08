import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { locale, t } from './i18n'
import { money } from './format'
const aedOf = (n: number | undefined) => n == null ? '' : money(n)
import './directory/directory.css'

type N = { id: number; kind: string; dealId: string | null; dealRef: string | null; data: any; at: string; read: boolean }
const TEXT: Record<string, (n: N) => string> = {
  'deal.awaiting_payment': () => t('The publisher accepted. Pay to secure the slot.'),
  'deal.declined': () => t('Your request was not selected.'),
  'deal.lapsed': () => t('The payment window passed and the booking lapsed.'),
  'deal.secured': () => t('Payment is secured.'),
  'deal.cancelled': () => t('The booking was cancelled.'),
  'deal.refunded': () => t('A refund was issued.'),
  'deal.released': () => t('Payment was released.'),
  'deal.opened': n => n.data?.kind === 'buy_now' ? t('New buy-now request.') : t('New booking to decide on.'),
  'interest.received': n => t('A buyer is interested in {slot}. Accept to book it.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'interest.not_selected': n => t('The publisher booked {slot} with another buyer.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'interest.expired': n => t('The publisher did not take up your interest in {slot} before it closed.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'bid.outbid': n => n.data?.max
    ? t('Your auto-bid maximum of {max} on {slot} was passed. Raise it to get back in front.', { max: aedOf(n.data.max), slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` })
    : t('You were outbid on {slot}.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? t('a slot')}` }),
  'bid.auto_raised': n => t('Auto-bid kept you in front on {slot}: you lead at {amount} (maximum {max}).', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? ''}`, amount: aedOf(n.data?.amount), max: aedOf(n.data?.max) }),
  'bid.auto_cap': n => t('Auto-bid reached your maximum of {max} on {slot}. You still lead; raise it in case someone bids again.', { slot: `${n.data?.outlet ? `${n.data.outlet} · ` : ''}${n.data?.label ?? ''}`, max: aedOf(n.data?.max) }),
  'creative.sent': () => t('New creative to review.'),
  'creative.approved': () => t('Your creative was approved.'),
  'creative.changes_requested': n => n.data?.reason ? t('The publisher asked for changes: {reason}', { reason: n.data.reason }) : t('The publisher asked for changes.'),
  'creative.technical_issue': () => t('Your file has a technical problem. Upload a fixed version.'),
  'creative.rejected': () => t('Your creative was rejected.'),
  'proof.ready': () => t('Proof is ready for your review.'),
  'reminder.decide': () => t('Reminder: a booking request is waiting for your decision.'),
  'reminder.pay': () => t('Reminder: pay to secure your booking before the deadline.'),
  'reminder.review': () => t('Reminder: review the proof. The money is released automatically at the deadline.'),
  'reminder.issue': () => t('Reminder: respond to the reported issue, or it goes to Nashr to decide.'),
  'issue.reported': () => t('The buyer reported an issue.'),
  'issue.offer': () => t('The publisher offered a fix for your issue.'),
  'issue.resolved': () => t('The issue was resolved.'),
  'dispute.opened': () => t('A dispute was opened.'),
  'dispute.decided': n => ({ release: t('Nashr decided the dispute: the payment is released to the publisher.'), refund: t('Nashr decided the dispute: full refund to the buyer.'),
    partial_refund: t('Nashr decided the dispute: a partial refund to the buyer.'), make_good: t('Nashr decided the dispute: the ad runs again.') } as Record<string, string>)[n.data?.outcome] ?? t('Nashr decided the dispute.'),
  'prerun.confirm_final_version': () => t('Confirm the final version before air.'),
  'prerun.confirm_slot_and_creative': () => t('Confirm the slot and creative before air.'),
  'message.new': n => n.data?.from === 'seller' ? t('New message from the publisher.') : t('New message from the buyer.'),
  'search.match': n => t(n.data?.count === 1 ? '1 new slot matches your search “{name}”.' : '{n} new slots match your search “{name}”.', { n: n.data?.count ?? '', name: n.data?.name ?? '' }),
  'access.requested': n => t('{company} requested access.', { company: n.data?.company ?? t('Someone') }),
  'quote.requested': n => t('Quote requested for {outlet}.', { outlet: n.data?.outlet ?? t('an outlet') }),
}

export function Bell({ role }: { role: string }) {
  const [data, setData] = useState<{ unread: number; items: N[] }>({ unread: 0, items: [] }), [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const load = () => api('/notifications').then(setData, () => {})
  useEffect(() => { load(); const timer = setInterval(load, 60_000); return () => clearInterval(timer) }, [])
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
      {open && <div className="card bell-pop" role="menu">
        {!data.items.length && <p className="muted small">{t('Nothing yet.')}</p>}
        {data.items.map(n => { const text = (TEXT[n.kind] ?? (() => n.kind))(n)
          const href = n.kind === 'message.new' && n.dealId ? `/messages/${n.dealId}` : n.dealId ? (role === 'seller' ? `/deals/${n.dealId}` : `/bookings/${n.dealId}`) : n.kind === 'interest.received' && n.data?.slotId ? `/slots/${n.data.slotId}` : n.kind.startsWith('bid.') || n.kind.startsWith('interest.') ? '/calendar' : n.kind === 'search.match' ? `/calendar?search=${n.data?.searchId}` : undefined
          return <a key={n.id} href={href} className={n.read ? '' : 'unread'} onClick={() => setOpen(false)} role="menuitem">
            <div>{text}</div><div className="small muted">{n.dealRef ? `${n.dealRef} · ` : ''}{new Date(n.at).toLocaleString(locale, { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></a> })}
      </div>}
    </div>
  )
}
