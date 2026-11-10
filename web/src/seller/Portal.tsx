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
  ['tax', 'Add your TRN and invoice choice', '/profile'], ['placement', 'Add your first product', '/listings/new'], ['live', 'List it for the dates you choose', '/listings']]
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

export const initials = (s: string) => s.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
export const short = (fils: number) => fils >= 100_000_00 ? `${isAr ? '' : 'AED '}${Math.round(fils / 100_000_0) / 10}M` : fils >= 100_000 ? `${isAr ? '' : 'AED '}${Math.round(fils / 100_000)}K` : money(fils)
export const Change = ({ v }: { v?: number | null }) => v == null ? null : <span className={`pt-chg ${v >= 0 ? 'up' : 'down'}`}>{v >= 0 ? '↑' : '↓'} {Math.abs(v)}%</span>

/** The earnings line: net earnings added up day by day. */
export function Trend({ data, label }: { data: { date: string; value: number }[]; label?: string }) {
  const W = 640, H = 200, L = 64, B = 24, max = Math.max(1, ...data.map(d => d.value))
  const nice = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / nice) * nice
  const x = (i: number) => L + (i / Math.max(1, data.length - 1)) * (W - L - 8), y = (v: number) => 8 + (1 - v / top) * (H - B - 8)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const ticks = [0, .25, .5, .75, 1].map(f => top * f), labels = data.filter((_, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1)
  return <svg className="pt-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? t('Net earnings over the period, added up: {amount}', { amount: money(data.at(-1)?.value ?? 0) })}>
    <defs><linearGradient id="ptfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--teal)" stopOpacity=".22" /><stop offset="1" stopColor="var(--teal)" stopOpacity="0" /></linearGradient></defs>
    {ticks.map(v => <g key={v}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} className="pt-grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="pt-axis">{short(v)}</text></g>)}
    {data.length > 1 && <><path d={`${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#ptfill)" /><path d={line} className="pt-line" />
      <circle cx={x(data.length - 1)} cy={y(data.at(-1)!.value)} r="4" className="pt-dot" /></>}
    {labels.map(d => { const i = data.indexOf(d); return <text key={d.date} x={x(i)} y={H - 4} textAnchor="middle" className="pt-axis">{dayLabel(d.date, { day: 'numeric', month: 'short' })}</text> })}
  </svg>
}

/** A share as a ring (earnings by outlet, budget by media type), each part listed with its share and opening its detail. */
export function Ring({ parts, total, caption, empty }: { parts: { label: string; value: number; href?: string }[]; total: number; caption?: string; empty?: string }) {
  const R = 52, C = 2 * Math.PI * R, shades = ['var(--teal)', '#9b7dff', '#3a15b8', '#c9b8ff', '#e4dcff']
  let at = 0
  return <div className="pt-ring">
    <svg viewBox="0 0 140 140" role="img" aria-label={caption ?? t('Net earnings by outlet')}>
      <circle cx="70" cy="70" r={R} className="pt-ring-track" />
      {total > 0 && parts.map((p, i) => { const len = p.value / total * C, el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" stroke={shades[i % shades.length]} strokeWidth="18"
        strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-at} transform="rotate(-90 70 70)" />; at += len; return el })}
      <text x="70" y="66" textAnchor="middle" className="pt-ring-v">{short(total)}</text><text x="70" y="84" textAnchor="middle" className="pt-ring-l">{caption ?? t('Net earnings')}</text>
    </svg>
    <ul>{parts.length ? parts.map((p, i) => { const body = <><i style={{ background: shades[i % shades.length] }} /><span>{p.label}</span><b className="num">{Math.round(p.value / total * 100)}%</b></>
      return <li key={p.label}>{p.href ? <a href={p.href}>{body}</a> : body}</li> })
      : <li className="muted">{empty ?? t('No paid bookings in this period yet.')}</li>}</ul>
  </div>
}

/** A figure card (owner's design): an icon and its name, the figure, a note; the whole card opens the page with the detail. */
export function Kpi({ href, icon, label, value, main, children }: { href: string; icon: string; label: string; value: string; main?: boolean; children?: React.ReactNode }) {
  return <a href={href} className={`pt-kpi ${main ? 'main' : ''}`}>
    <span className="pt-kh"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={icon} /></svg>
      <span>{label}</span><svg className="pt-go" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M7 17 17 7M9 7h8v8" /></svg></span>
    <b className="num">{value}</b>{children}</a>
}
export const KI = {
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6', layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5', wallet: 'M3 7h18v12H3zM16 13h2M3 7l3-4h12l3 4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  hammer: 'M14 4l6 6-3 3-6-6zM11 7l-8 8 3 3 8-8', card: 'M3 6h18v12H3zM3 10h18', check: 'M5 12.5l4.5 4.5L19 7.5', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9', alert: 'M12 3l9 16H3zM12 10v4M12 17h.01',
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
      <Kpi main href="/deals" icon={KI.trend} label={t('Gross sales')} value={money(k.gross.value)}><Change v={k.gross.change} /></Kpi>
      <Kpi href="/earnings" icon={KI.layers} label={t('Net earnings')} value={money(k.net.value)}><Change v={k.net.change} /></Kpi>
      <Kpi href="/earnings" icon={KI.wallet} label={t('Pending clearance')} value={money(k.pending.value)}>
        <em>{k.pending.count === 1 ? t('1 booking until proof') : t('{n} bookings until proof', { n: k.pending.count ?? 0 })}</em></Kpi>
      <Kpi href="/listings" icon={KI.grid} label={t('Active listings')} value={String(k.listings.live)}><em>{t('{n} open slots', { n: k.listings.openSlots.toLocaleString('en-US') })}</em></Kpi>
      <Kpi href="/inbox" icon={KI.clock} label={t('Awaiting your decision')} value={String(k.awaiting.value)}>{k.awaiting.value > 0 && <em className="warn">{t('Review now')}</em>}</Kpi>
    </section>

    <section className="pt-row">
      <div className="card pad"><div className="pt-card-h"><h2>{t('Earnings trend')}</h2><span className="muted small">{t('Net, added up over the period')}</span></div><Trend data={d.trend} /></div>
      <div className="card pad"><div className="pt-card-h"><h2>{t('Earnings by outlet')}</h2></div><Ring parts={d.byOutlet.map(p => ({ label: p.outlet, value: p.value, href: '/deals' }))} total={d.byOutlet.reduce((n, p) => n + p.value, 0)} /></div>
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
        : <div className="table-wrap"><table className="table pt-tx"><thead><tr><th>{t('Buyer')}</th><th>{t('Outlet')}</th><th>{t('Placement')}</th>
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
