import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { sep, t } from '../i18n'
import { navigate } from '../nav'
import { Thread } from '../messages/Thread'
import { ACTION, TASK, due, money, when, type Task } from './common'
import { Decide, type Counter } from './Decide'
import './requests.css'

/*
 * Requests, as the owner drew them: everything waiting on the publisher on the left, the chosen one on the right with
 * the buyer, the brief, what the publisher receives, Accept / Counter offer / Decline, and the conversation with the buyer.
 */
type Deal = { id: string; ref: string; status: string; label: string; startsAt: string; nextDeadlineAt: string | null; buyer: { company: string }
  brief: { advertiser: string; industry: string; message: string; language: string; landingPage?: string } | null; belowReserve: boolean
  money: { bid: number; youReceive: number; commissionBp: number }; counter?: Counter }

const GROUPS: [string, string, (k: string) => boolean][] = [
  ['all', 'All', () => true],
  ['decide', 'To decide', k => ['decide', 'interest', 'choose'].includes(k)],
  ['creative', 'Creative', k => ['creative', 'creative_missing'].includes(k)],
  ['proof', 'Proof and issues', k => ['proof', 'issue', 'prerun'].includes(k)],
  ['invoice', 'Invoices', k => k === 'invoice'],
]
const keyOf = (x: Task) => `${x.type}:${x.dealId ?? x.slotId}`

export function RequestsPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null), [error, setError] = useState(''), [note, setNote] = useState('')
  const [group, setGroup] = useState('all'), [pick, setPick] = useState<string | null>(null), [deal, setDeal] = useState<Deal | null>(null)
  const load = () => api<Task[]>('/seller/inbox').then(r => { setTasks(r); return r }, e => { setError(e.message); return [] as Task[] })
  useEffect(() => { load().then(r => { if (r.length && window.innerWidth > 900) setPick(keyOf(r[0])) }) }, [])
  const shown = useMemo(() => (tasks ?? []).filter(x => GROUPS.find(g => g[0] === group)![2](x.type)), [tasks, group])
  const current = (tasks ?? []).find(x => keyOf(x) === pick) ?? null
  useEffect(() => { setDeal(null); if (current?.dealId) api<Deal>(`/seller/deals/${current.dealId}`).then(setDeal, e => setError(e.message)) }, [pick])

  function done(said: string) {
    setNote(said)
    load().then(r => { if (!r.some(x => keyOf(x) === pick)) setPick(null); else if (current?.dealId) api<Deal>(`/seller/deals/${current.dealId}`).then(setDeal) })
  }

  return <main className="rq">
    <header className="rq-head"><div><h1>{t('Requests')}</h1>
      <p className="muted">{t('Bookings and tasks waiting on you, soonest deadline first.')}</p></div></header>
    {error && <p className="error" role="alert">{error}</p>}
    {note && <p className="ok" role="status">{note}</p>}
    <div className="rq-groups" role="tablist" aria-label={t('Show')}>{GROUPS.map(([k, label, f]) => {
      const n = (tasks ?? []).filter(x => f(x.type)).length
      return <button key={k} role="tab" aria-selected={group === k} className={group === k ? 'on' : ''} onClick={() => setGroup(k)}>{t(label)} <span className="rq-n">{n}</span></button>
    })}</div>

    <div className={`rq-split${current ? ' has-pick' : ''}`}>
      <ul className="rq-list" aria-label={t('Requests')}>
        {tasks == null ? <li className="muted rq-empty">{t('Loading…')}</li>
          : !shown.length ? <li className="muted rq-empty">{t('Nothing needs you right now.')}</li>
          : shown.map(x => <li key={keyOf(x)}>
            <button className={`rq-item${keyOf(x) === pick ? ' on' : ''}`} aria-current={keyOf(x) === pick ? 'true' : undefined} onClick={() => { setPick(keyOf(x)); setNote('') }}>
              <span className="rq-av" aria-hidden>{(x.buyer ?? x.outlet).slice(0, 2).toUpperCase()}</span>
              <span className="rq-what"><b>{x.buyer ?? (x.interested ? t('{n} buyers interested', { n: x.interested }) : x.outlet)}</b>
                <span className="small muted">{x.outlet}{sep}{x.label}</span>
                <span className="small muted">{when(x.startsAt)}</span>
                {x.kind === 'buy_now' && <span className="small rq-kind">{t('This buyer will pay now')}</span>}
                {x.kind === 'fixed' && <span className="small rq-kind">{t('Booked at your fixed price')}</span>}
                {x.belowReserve && <span className="small rq-kind warn-t">{t('Below your reserve')}</span>}</span>
              <span className="rq-side"><span className="num">{x.amount ? money(x.amount) : ''}</span>
                <span className={`rq-chip ${x.counter ? 'countered' : x.type}`}>{x.counter ? t('Counter sent') : t(TASK[x.type] ?? x.type)}</span>
                <span className="small muted">{due(x.dueAt)}</span></span>
            </button></li>)}
      </ul>

      <section className="rq-detail card" aria-live="polite">
        {!current ? <p className="muted rq-empty">{t('Choose a request to see it here.')}</p> : <>
          <button className="btn rq-back" onClick={() => setPick(null)}>{t('Back to the list')}</button>
          <div className="rq-dh"><div><h2>{current.buyer ?? current.outlet}</h2>
            <p className="muted">{current.outlet}{sep}{current.label}{sep}{when(current.startsAt)}</p></div>
            {current.ref && <span className="small muted num">{t('Order {ref}', { ref: current.ref })}</span>}</div>

          {deal && <dl className="rq-facts">
            <div><dt>{t('Price')}</dt><dd className="num">{money(deal.money.bid)}</dd></div>
            <div><dt>{t('You receive')}</dt><dd className="num">{money(deal.money.youReceive)}</dd></div>
            {current.dueAt && <div><dt>{t('Due')}</dt><dd>{when(current.dueAt)}</dd></div>}
            {deal.brief && <>
              <div><dt>{t('Advertiser')}</dt><dd>{deal.brief.advertiser}</dd></div>
              <div><dt>{t('Industry')}</dt><dd>{t(deal.brief.industry)}</dd></div>
              <div className="wide"><dt>{t('The ad will say')}</dt><dd>{deal.brief.message}</dd></div></>}
          </dl>}
          {deal?.belowReserve && current.type === 'decide' && <p className="warn">{t('This is below your reserve price. You can still accept it.')}</p>}

          {current.type === 'decide' && deal && deal.status === 'awaiting_seller'
            ? <Decide dealId={deal.id} price={deal.money.bid} counter={deal.counter ?? null} onDone={done} />
            : <div className="row-flex"><button className="btn primary" onClick={() => navigate(current.dealId ? `/deals/${current.dealId}` : `/slots/${current.slotId}`)}>{t(ACTION[current.type] ?? 'Open')}</button>
              {current.dealId && <a className="btn" href={`/deals/${current.dealId}`}>{t('Open the booking')}</a>}</div>}
          {current.dealId && current.type === 'decide' && <p className="small"><a href={`/deals/${current.dealId}`}>{t('Open the booking')}</a></p>}

          {current.dealId && current.buyer && <div className="rq-thread"><Thread key={current.dealId} dealId={current.dealId} other={current.buyer} compact side="seller" /></div>}
        </>}
      </section>
    </div>
  </main>
}
