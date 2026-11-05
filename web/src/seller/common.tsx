import { dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import '../directory/directory.css'
import './seller.css'

// Statuses as the publisher sees them.
export const DEAL_STATUS: Record<string, [string, string]> = {
  awaiting_seller: ['Your decision', 'soon'], awaiting_payment: ['Accepted, buyer paying', 'soon'], secured: ['Paid, to fulfil', 'lead'],
  in_review: ['Proof with buyer', 'soon'], issue_open: ['Issue reported', 'outbid'], disputed: ['With Nashr', 'outbid'], released: ['Released', 'lead'],
  paid_out: ['Paid out', 'lead'], declined: ['Declined', 'muted'], lapsed: ['Buyer did not pay', 'muted'], cancelled: ['Cancelled', 'muted'], refunded: ['Refunded', 'muted'],
}
export const SLOT_STATUS: Record<string, string> = { open: 'On sale', awaiting_seller: 'Your decision', awaiting_choice: 'Choose next bid', booked: 'Booked',
  blocked: 'Off sale', held: 'Unavailable (overlaps a booking)', unsold: 'Unsold' }
export const DealStatus = ({ s }: { s: string }) => <span className={`dot ${DEAL_STATUS[s]?.[1] ?? ''}`}>{DEAL_STATUS[s]?.[0] ?? s}</span>
export const when = (iso: string) => `${dayLabel(dubai(iso).date)} · ${time(iso)}`
export const due = (iso: string | null) => {
  if (!iso) return ''
  const h = (new Date(iso).getTime() - Date.now()) / 3_600_000
  return h < 0 ? 'overdue' : h < 24 ? `due in ${Math.max(1, Math.round(h))}h` : `due ${dayLabel(dubai(iso).date)}`
}
export { money }

export type Task = { type: string; dealId: string | null; ref: string | null; slotId: string; outlet: string; label: string; startsAt: string
  buyer: string | null; amount: number | null; dueAt: string | null; kind: string | null; belowReserve?: boolean }
const ACTION: Record<string, string> = { decide: 'Decide', choose: 'Choose a bid', creative: 'Review', creative_missing: 'Decide', proof: 'Send proof',
  issue: 'Respond', prerun: 'Confirm', invoice: 'Upload' }
const urgent = (iso: string | null) => !!iso && new Date(iso).getTime() - Date.now() < 24 * 3_600_000
const TASK: Record<string, string> = { decide: 'Accept or decline', choose: 'Choose the next bid', creative: 'Review creative', creative_missing: 'Creative not received',
  proof: 'Send proof', issue: 'Respond to an issue', prerun: 'Confirm the pre-run check', invoice: 'Upload your invoice' }

export function TaskList({ tasks, limit }: { tasks: Task[]; limit?: number }) {
  if (!tasks.length) return <p className="muted empty">Nothing needs you right now.</p>
  return <ul className="tasks card">{tasks.slice(0, limit).map((t, i) => (
    <li key={i} className={urgent(t.dueAt) ? 'urgent' : ''}><a href={t.dealId ? `#/deals/${t.dealId}` : `#/slots/${t.slotId}`}>
      <span className={`task-k ${t.type}`}>{TASK[t.type] ?? t.type}</span>
      <span className="task-body"><span><b>{t.outlet}</b>, {t.label}</span><span className="muted small">{when(t.startsAt)}{t.buyer ? `, ${t.buyer}` : ''}</span>
        {t.kind === 'buy_now' && <span className="badge on">This buyer will pay now</span>}
        {t.belowReserve && <span className="badge" style={{ color: 'var(--amber)' }}>Below your reserve</span>}</span>
      <span className="num">{t.amount ? money(t.amount) : ''}</span>
      <span className={`small ${due(t.dueAt) === 'overdue' || /in \d+h/.test(due(t.dueAt)) ? 'soon' : 'muted'}`}>{due(t.dueAt)}</span>
      <span className={`btn ${t.type === 'decide' || t.type === 'proof' ? 'primary' : ''} task-act`}>{ACTION[t.type] ?? 'Open'}</span>
    </a></li>))}</ul>
}
