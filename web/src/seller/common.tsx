import { dayLabel, money, time, slotWhen } from '../format'
import { tm } from '../i18n-server'
import { dubai } from '../calendar/layout'
import '../directory/directory.css'
import './seller.css'
import { sep, t } from '../i18n'

// Statuses as the publisher sees them.
export const DEAL_STATUS: Record<string, [string, string]> = {
  awaiting_seller: ['Your decision', 'soon'], awaiting_payment: ['Accepted, buyer paying', 'soon'], secured: ['Paid, to fulfil', 'lead'],
  in_review: ['Proof with buyer', 'soon'], issue_open: ['Issue reported', 'outbid'], disputed: ['With Nashr', 'outbid'], released: ['Released', 'lead'],
  paid_out: ['Paid out', 'lead'], declined: ['Declined', 'muted'], lapsed: ['Buyer did not pay', 'muted'], cancelled: ['Cancelled', 'muted'], refunded: ['Refunded', 'muted'],
}
export const SLOT_STATUS: Record<string, string> = { open: 'On sale', awaiting_seller: 'Your decision', awaiting_choice: 'Choose next bid', booked: 'Booked',
  blocked: 'Off sale', held: 'Unavailable (overlaps a booking)', unsold: 'Unsold' }
export const DealStatus = ({ s }: { s: string }) => <span className={`dot ${DEAL_STATUS[s]?.[1] ?? ''}`}>{t(DEAL_STATUS[s]?.[0] ?? s)}</span>
export const when = (iso: string) => `${dayLabel(dubai(iso).date)} · ${time(iso)}`
export const due = (iso: string | null) => {
  if (!iso) return ''
  const h = (new Date(iso).getTime() - Date.now()) / 3_600_000
  return h < 0 ? t('overdue') : h < 24 ? t('due in {n}h', { n: Math.max(1, Math.round(h)) }) : t('due {day}', { day: dayLabel(dubai(iso).date) })
}
export { money }

export type Task = { type: string; dealId: string | null; ref: string | null; slotId: string; outlet: string; label: string; startsAt: string
  buyer: string | null; amount: number | null; dueAt: string | null; kind: string | null; belowReserve?: boolean; interested?: number; counter?: number | null }
export const ACTION: Record<string, string> = { interest: 'Review', decide: 'Decide', choose: 'Choose a bid', creative: 'Review', creative_missing: 'Decide', proof: 'Send proof',
  issue: 'Respond', prerun: 'Confirm', invoice: 'Upload' }
const urgent = (iso: string | null) => !!iso && new Date(iso).getTime() - Date.now() < 24 * 3_600_000
export const TASK: Record<string, string> = { interest: 'Buyer interested', decide: 'Accept or decline', choose: 'Choose the next bid', creative: 'Review creative', creative_missing: 'Creative not received',
  proof: 'Send proof', issue: 'Respond to an issue', prerun: 'Confirm the pre-run check', invoice: 'Upload your invoice' }

export function TaskList({ tasks, limit }: { tasks: Task[]; limit?: number }) {
  if (!tasks.length) return <p className="muted empty">{t("Nothing needs you right now.")}</p>
  return <ul className="tasks card">{tasks.slice(0, limit).map((task, i) => (
    <li key={i} className={urgent(task.dueAt) ? 'urgent' : ''}><a href={task.dealId ? `/deals/${task.dealId}` : `/slots/${task.slotId}`}>
      <span className={`task-k ${task.type}`}>{t(TASK[task.type] ?? task.type)}</span>
      <span className="task-body"><span><b>{task.outlet}</b>{sep}{tm(task.label)}</span><span className="muted small">{slotWhen(task.startsAt, (task as any).channel)}{task.buyer ? `${sep}${task.buyer}` : task.interested ? `${sep}${t('{n} buyers interested', { n: task.interested })}` : ''}</span>
        {task.kind === 'buy_now' && <span className="badge on">{t("This buyer will pay now")}</span>}
        {task.kind === 'fixed' && <span className="badge on">{t('Booked at your fixed price')}</span>}
        {task.belowReserve && <span className="badge" style={{ color: 'var(--amber)' }}>{t("Below your reserve")}</span>}</span>
      <span className="num">{task.amount ? money(task.amount) : ''}</span>
      <span className={`small ${urgent(task.dueAt) ? 'soon' : 'muted'}`}>{due(task.dueAt)}</span>
      <span className={`btn ${['decide', 'proof', 'interest'].includes(task.type) ? 'primary' : ''} task-act`}>{t(ACTION[task.type] ?? 'Open')}</span>
    </a></li>))}</ul>
}
