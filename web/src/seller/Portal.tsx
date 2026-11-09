import { useEffect, useState } from 'react'
import { api } from '../api'
import { navigate } from '../nav'
import { dayLabel, money } from '../format'
import { dubai } from '../calendar/layout'
import { ChannelMark } from '../calendar/CalendarPage'
import { isAr, t } from '../i18n'
import './portal.css'

/*
 * The publisher dashboard as the owner drew it (November 2026): one page with everything, no tabs. Sales and earnings for a period,
 * what needs a decision, recent transactions and payouts. Every card opens the page with the detail.
 */
type Kpi = { value: number; change?: number | null; count?: number }
type Action = { type: string; dealId: string | null; ref: string | null; slotId: string; outlet: string; label: string; startsAt: string; buyer: string | null
  amount: number | null; gross: number | null; net: number | null; dueAt: string | null; kind: string | null; interested?: number }
type Tx = { id: string; ref: string; buyer: string; outlet: string; channel: string; product: string; gross: number; fee: number; net: number; status: string; date: string; feeBp: number | null }
type Portal = { period: { days: number }; outlets: { id: string; name: string; channel: string }[]
  kpis: { gross: Kpi; net: Kpi; pending: Kpi; listings: { live: number; total: number; openSlots: number }; awaiting: Kpi }
  trend: { date: string; value: number }[]; byOutlet: { outlet: string; value: number }[]
  actions: Action[]; actionsTotal: number; transactions: Tx[]; payouts: { available: number; pending: number; pendingCount: number; paidOut: number } }
type Onboarding = { onboarding: Record<string, boolean> }

const STEPS: [string, string, string][] = [['outlet', 'Add your outlet profile', '/profile'], ['payouts', 'Connect your payout account', '/profile'],
  ['tax', 'Add your TRN and invoice choice', '/profile'], ['placement', 'Add your first product', '/listings/new'], ['live', 'Put slots on sale', '/listings']]
const PERIODS = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months']] as const

// What a transaction's status means to a publisher, and how it looks
const TX: Record<string, [string, string]> = {
  awaiting_seller: ['Awaiting you', 'warn'], awaiting_payment: ['Awaiting payment', 'info'], secured: ['Pending clearance', 'info'], in_review: ['Pending clearance', 'info'],
  issue_open: ['Issue open', 'warn'], disputed: ['Disputed', 'bad'], released: ['Paid', 'good'], paid_out: ['Paid', 'good'], refunded: ['Refunded', 'bad'],
}
const txStatus = (s: string) => TX[s] ?? ['Cancelled', 'mute']

const ACTION: Record<string, { label: string; button: string }> = {
  decide: { label: 'Booking to decide', button: 'Accept' }, choose: { label: 'Bidding closed: choose the next bid', button: 'Choose bid' },
  interest: { label: 'Buyers interested', button: 'Review' }, creative: { label: 'Creative to review', button: 'Review creative' },
  creative_missing: { label: 'Creative not received', button: 'Decide' }, proof: { label: 'Proof needed', button: 'Upload proof' },
  issue: { label: 'Issue reported', button: 'Respond' }, prerun: { label: 'Pre-run check', button: 'Confirm' }, invoice: { label: 'Invoice to upload', button: 'Upload invoice' },
}

const initials = (s: string) => s.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const short = (fils: number) => fils >= 100_000_00 ? `${isAr ? '' : 'AED '}${Math.round(fils / 100_000_0) / 10}M` : fils >= 100_000 ? `${isAr ? '' : 'AED '}${Math.round(fils / 100_000)}K` : money(fils)
const Change = ({ v }: { v?: number | null }) => v == null ? null : <span className={`pt-chg ${v >= 0 ? 'up' : 'down'}`}>{v >= 0 ? '↑' : '↓'} {Math.abs(v)}%</span>

/** The earnings line: net earnings added up day by day. */
function Trend({ data }: { data: { date: string; value: number }[] }) {
  const W = 640, H = 200, L = 64, B = 24, max = Math.max(1, ...data.map(d => d.value))
  const nice = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / nice) * nice
  const x = (i: number) => L + (i / Math.max(1, data.length - 1)) * (W - L - 8), y = (v: number) => 8 + (1 - v / top) * (H - B - 8)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const ticks = [0, .25, .5, .75, 1].map(f => top * f), labels = data.filter((_, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1)
  return <svg className="pt-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Net earnings over the period, added up: {amount}', { amount: money(data.at(-1)?.value ?? 0) })}>
    <defs><linearGradient id="ptfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--teal)" stopOpacity=".22" /><stop offset="1" stopColor="var(--teal)" stopOpacity="0" /></linearGradient></defs>
    {ticks.map(v => <g key={v}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} className="pt-grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="pt-axis">{short(v)}</text></g>)}
    {data.length > 1 && <><path d={`${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#ptfill)" /><path d={line} className="pt-line" />
      <circle cx={x(data.length - 1)} cy={y(data.at(-1)!.value)} r="4" className="pt-dot" /></>}
    {labels.map(d => { const i = data.indexOf(d); return <text key={d.date} x={x(i)} y={H - 4} textAnchor="middle" className="pt-axis">{dayLabel(d.date, { day: 'numeric', month: 'short' })}</text> })}
  </svg>
}

/** Earnings by outlet as a ring, with the share of each. */
function Ring({ parts, total }: { parts: { outlet: string; value: number }[]; total: number }) {
  const R = 52, C = 2 * Math.PI * R, shades = ['var(--teal)', '#9b7dff', '#3a15b8', '#c9b8ff', '#e4dcff']
  let at = 0
  return <div className="pt-ring">
    <svg viewBox="0 0 140 140" role="img" aria-label={t('Net earnings by outlet')}>
      <circle cx="70" cy="70" r={R} className="pt-ring-track" />
      {total > 0 && parts.map((p, i) => { const len = p.value / total * C, el = <circle key={p.outlet} cx="70" cy="70" r={R} fill="none" stroke={shades[i % shades.length]} strokeWidth="18"
        strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-at} transform="rotate(-90 70 70)" />; at += len; return el })}
      <text x="70" y="66" textAnchor="middle" className="pt-ring-v">{short(total)}</text><text x="70" y="84" textAnchor="middle" className="pt-ring-l">{t('Net earnings')}</text>
    </svg>
    <ul>{parts.length ? parts.map((p, i) => <li key={p.outlet}><i style={{ background: shades[i % shades.length] }} /><span>{p.outlet}</span><b className="num">{Math.round(p.value / total * 100)}%</b></li>)
      : <li className="muted">{t('No paid bookings in this period yet.')}</li>}</ul>
  </div>
}

export function PortalDashboard() {
  const [days, setDays] = useState(30), [outlet, setOutlet] = useState(''), [d, setD] = useState<Portal | null>(null), [err, setErr] = useState('')
  const [setup, setSetup] = useState<Onboarding | null>(null), [busy, setBusy] = useState(''), [note, setNote] = useState('')
  const load = () => api<Portal>(`/seller/portal?days=${days}${outlet ? `&outlet=${outlet}` : ''}`).then(setD, e => setErr(e.message))
  useEffect(() => { load() }, [days, outlet])
  useEffect(() => { api<Onboarding>('/seller/overview').then(setSetup, () => {}) }, [])
  async function accept(a: Action) {
    setBusy(a.dealId!); setNote('')
    try { await api(`/seller/deals/${a.dealId}/accept`, { method: 'POST', body: {} }); setNote(t('Accepted. The buyer is asked to pay.')); await load() }
    catch (e: any) { setNote(e.message) } finally { setBusy('') }
  }
  if (!d) return <main>{err ? <p className="error">{err}</p> : <p className="muted">{t('Loading…')}</p>}</main>
  const k = d.kpis, todo = setup ? STEPS.filter(([key]) => !setup.onboarding[key]) : []
  const open = (a: Action) => navigate(a.dealId ? `/deals/${a.dealId}` : `/slots/${a.slotId}`)
  return <main className="pt">
    <div className="pt-head">
      <div><h1>{t('Dashboard')}</h1><p className="muted">{t('Your media inventory, bookings and earnings at a glance. Click any card for detail.')}</p></div>
      <div className="pt-filters">
        <select className="btn" aria-label={t('Outlet')} value={outlet} onChange={e => setOutlet(e.target.value)}><option value="">{t('All outlets')}</option>
          {d.outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <select className="btn" aria-label={t('Period')} value={days} onChange={e => setDays(Number(e.target.value))}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
      </div>
    </div>

    {todo.length > 0 && <section className="card pad pt-setup"><b>{t('Finish setting up to start selling')}</b>
      <ol>{STEPS.map(([key, label, href]) => <li key={key} className={setup!.onboarding[key] ? 'done' : ''}><a href={href}>{t(label)}</a></li>)}</ol></section>}

    <section className="pt-kpis">
      <a href="/earnings" className="pt-kpi main"><span>{t('Gross sales')}</span><b className="num">{money(k.gross.value)}</b><Change v={k.gross.change} /></a>
      <a href="/earnings" className="pt-kpi"><span>{t('Net earnings')}</span><b className="num">{money(k.net.value)}</b><Change v={k.net.change} /></a>
      <a href="/earnings" className="pt-kpi"><span>{t('Pending clearance')}</span><b className="num">{money(k.pending.value)}</b>
        <em>{k.pending.count === 1 ? t('1 booking until proof') : t('{n} bookings until proof', { n: k.pending.count ?? 0 })}</em></a>
      <a href="/listings" className="pt-kpi"><span>{t('Active products')}</span><b className="num">{k.listings.live}</b>
        <em>{t('{n} open slots', { n: k.listings.openSlots.toLocaleString('en-US') })}</em></a>
      <a href="/inbox" className="pt-kpi"><span>{t('Awaiting your decision')}</span><b className="num">{k.awaiting.value}</b>{k.awaiting.value > 0 && <em className="warn">{t('Review now')}</em>}</a>
    </section>

    <section className="pt-row">
      <div className="card pad"><div className="pt-card-h"><h2>{t('Earnings trend')}</h2><span className="muted small">{t('Net, added up over the period')}</span></div><Trend data={d.trend} /></div>
      <div className="card pad"><div className="pt-card-h"><h2>{t('Earnings by outlet')}</h2></div><Ring parts={d.byOutlet} total={d.byOutlet.reduce((n, p) => n + p.value, 0)} /></div>
    </section>

    <section className="card pad">
      <div className="pt-card-h"><h2>{t('Needs your action')}</h2>{d.actionsTotal > d.actions.length && <a href="/inbox">{t('All {n} items', { n: d.actionsTotal })} ›</a>}</div>
      {note && <p className="ok" role="status">{note}</p>}
      {!d.actions.length ? <p className="muted">{t('Nothing waiting on you. New bookings and requests appear here.')}</p>
        : <ul className="pt-actions">{d.actions.map(a => <li key={`${a.type}-${a.dealId ?? a.slotId}`}>
          <span className="pt-av" aria-hidden>{initials(a.buyer ?? a.outlet)}</span>
          <span className="pt-what"><b>{a.buyer ?? t(ACTION[a.type]?.label ?? a.type)}</b>
            <span className="small">{a.outlet} · {a.label} · {dayLabel(dubai(a.startsAt).date)}</span>
            <span className="small muted">{t(ACTION[a.type]?.label ?? a.type)}{a.ref ? ` · ${a.ref}` : ''}</span></span>
          <span className="pt-money">{a.gross != null && <b className="num">{money(a.gross)}</b>}
            {a.net != null && <span className="small muted">{t("You'd net {amount}", { amount: money(a.net) })}</span>}</span>
          <span className="pt-due">{a.dueAt && <span className="pt-chip">{t('Due {date}', { date: dayLabel(dubai(a.dueAt).date, { day: 'numeric', month: 'short' }) })}</span>}</span>
          <span className="pt-btns">{a.type === 'decide' ? <><button className="btn" onClick={() => open(a)}>{t('Decline')}</button>
              <button className="btn primary" disabled={busy === a.dealId} onClick={() => accept(a)}>{t('Accept')}</button></>
            : <button className="btn primary" onClick={() => open(a)}>{t(ACTION[a.type]?.button ?? 'Open')}</button>}</span>
        </li>)}</ul>}
    </section>

    <section className="card pad">
      <div className="pt-card-h"><h2>{t('Recent transactions')}</h2><a href="/deals">{t('View all')} ›</a></div>
      {!d.transactions.length ? <p className="muted">{t('No bookings yet.')}</p>
        : <div className="table-wrap"><table className="table pt-tx"><thead><tr><th>{t('Buyer')}</th><th>{t('Outlet')}</th><th>{t('Product')}</th>
          <th className="r">{t('Gross sale')}</th><th className="r">{t('Fee')}</th><th className="r">{t('Net')}</th><th>{t('Status')}</th><th className="r">{t('Date')}</th></tr></thead>
          <tbody>{d.transactions.map(x => { const [l, c] = txStatus(x.status); return <tr key={x.id} onClick={() => navigate(`/deals/${x.id}`)}>
            <td><b>{x.buyer}</b></td><td><ChannelMark c={x.channel} /> {x.outlet}</td><td className="small">{x.product}</td>
            <td className="r num">{money(x.gross)}</td><td className="r num muted">{x.fee ? `− ${money(x.fee)}` : '—'}</td><td className="r num"><b>{money(x.net)}</b></td>
            <td><span className={`pt-pill ${c}`}>{t(l)}</span></td><td className="r small">{dayLabel(dubai(x.date).date, { day: 'numeric', month: 'short' })}</td></tr> })}</tbody></table></div>}
    </section>

    <section className="card pad">
      <div className="pt-card-h"><h2>{t('Payouts')}</h2><a href="/earnings">{t('Earnings and statements')} ›</a></div>
      <div className="pt-payouts">
        <div><span>{t('Available now')}</span><b className="num">{money(d.payouts.available)}</b><em>{t('Transferred to your bank automatically')}</em></div>
        <div><span>{t('Pending clearance')}</span><b className="num">{money(d.payouts.pending)}</b><em>{t('Released when the buyer approves proof')}</em></div>
        <div><span>{t('Released in this period')}</span><b className="num">{money(d.payouts.paidOut)}</b><em>{t('After Nashr\'s commission')}</em></div>
      </div>
    </section>
  </main>
}
