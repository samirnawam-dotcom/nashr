import { useEffect, useState } from 'react'
import { api } from '../api'
import { dayLabel } from '../format'
import { addDays, monthGrid, todayInDubai, weekOf } from '../calendar/layout'
import { Bolt, CHANNELS, ChannelMark, Gavel, useNarrow } from '../calendar/CalendarPage'
import { DateNav, FilterFold, GROUPS, OpsList, OpsMonth, OpsOutlets, StatusChips, statusesOf, useAddress, type OpsDay } from '../calendar/ops'
import { navigate } from '../nav'
import { t } from '../i18n'

type View = 'list' | 'month' | 'outlets'
const VIEWS: [View, string][] = [['list', t('List')], ['month', t('Month')], ['outlets', t('By outlet')]]

/**
 * Calendar oversight (brief section 17): every slot on the platform, from every publisher, in every status. Filtered, sorted and
 * paged on the server, so it stays quick with 1000+ outlets. A booked or decided slot opens its deal.
 */
export function AdminCalendarPage() {
  const [a, update] = useAddress({ view: 'list', date: todayInDubai(), st: '', sale: '', ch: '', q: '' })
  const view = (VIEWS.some(v => v[0] === a.view) ? a.view : 'list') as View
  const [days, setDays] = useState<OpsDay[]>([]), [qText, setQText] = useState(a.q), narrow = useNarrow()
  useEffect(() => { const k = setTimeout(() => qText !== a.q && update({ q: qText }), 300); return () => clearTimeout(k) }, [qText])
  const week = weekOf(a.date)
  const [from, to] = view === 'month' ? [monthGrid(a.date)[0][0], addDays(monthGrid(a.date).at(-1)![6], 1)] : view === 'outlets' ? [week[0], addDays(week[6], 1)] : [a.date, addDays(a.date, 28)]
  const groups = a.st ? a.st.split(',') : [], sales = a.sale ? a.sale.split(',') : [], chans = a.ch ? a.ch.split(',') : []
  const qs = new URLSearchParams({ from: `${from}T00:00:00+04:00`, to: `${to}T00:00:00+04:00`, ...(groups.length ? { st: statusesOf(groups).join(',') } : {}),
    ...(sales.length ? { sale: sales.join(',') } : {}), ...(chans.length ? { ch: chans.join(',') } : {}), ...(a.q.trim() ? { q: a.q.trim() } : {}) }).toString()
  useEffect(() => { if (view === 'month') api<OpsDay[]>(`/admin/slots/days?${qs}`).then(setDays, () => {}) }, [view, qs])
  const step = (n: number) => { if (view === 'month') { const d = new Date(a.date + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); return update({ date: d.toISOString().slice(0, 10) }, true) }
    update({ date: addDays(a.date, n * (view === 'list' ? 28 : 7)) }, true) }
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]).join(',')
  const active = groups.length + sales.length + chans.length + (a.q ? 1 : 0)
  const title = view === 'month' ? dayLabel(a.date, { month: 'long', year: 'numeric' }) : `${dayLabel(from, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(to, -1), { day: 'numeric', month: 'short', year: 'numeric' })}`
  return (
    <main className="cv">
      <header className="cv-head">
        <div className="cv-title"><h1>{t('Calendar')}</h1><p className="cv-range"><b>{title}</b><span className="muted">{t('Every slot on Nashr, from every publisher, in every status.')}</span></p></div>
        <DateNav date={a.date} onDate={d => update({ date: d }, true)} onStep={step} />
        <div className="seg cv-views" role="tablist" aria-label={t('View')}>{VIEWS.map(([v, l]) =>
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => update({ view: v }, true)}>{l}</button>)}</div>
      </header>
      <FilterFold narrow={narrow} active={active} search={<input className="search cv-search" type="search" placeholder={t('Search outlets, programmes, publishers')} aria-label={t('Search')} value={qText} onChange={e => setQText(e.target.value)} />}>
        <div className="cv-group" role="group" aria-label={t('Channels')}>{CHANNELS.map(c => <button key={c} type="button" className={`chipf ${chans.includes(c) ? 'on' : ''}`} aria-pressed={chans.includes(c)}
          onClick={() => update({ ch: toggle(chans, c) })}><ChannelMark c={c} label /></button>)}</div>
        <StatusChips value={groups} onChange={v => update({ st: v.join(',') })} />
        <div className="cv-group" role="group" aria-label={t('Sale type')}>{(['auction', 'quick_sale'] as const).map(v => <button key={v} type="button" className={`chipf ${sales.includes(v) ? 'on' : ''}`}
          aria-pressed={sales.includes(v)} onClick={() => update({ sale: toggle(sales, v) })}>{v === 'auction' ? <Gavel /> : <Bolt />}{v === 'auction' ? t('Auction') : t('Quick sale')}</button>)}</div>
        <span className="spacer" />
        {active > 0 && <button type="button" className="btn cv-clear" onClick={() => { setQText(''); update({ st: '', sale: '', ch: '', q: '' }) }}>{t('Clear all ({n})', { n: active })}</button>}
      </FilterFold>
      {view === 'list' && <OpsList base="/admin/slots" qs={qs} who="admin" narrow={narrow} onOpen={x => x.dealId && navigate(`/deals/${x.dealId}`)} />}
      {view === 'month' && <OpsMonth narrow={narrow} date={a.date} days={days} onDay={d => update({ view: 'list', date: d }, true)} />}
      {view === 'outlets' && <OpsOutlets base="/admin/slots" qs={qs} week={week} onCell={(_, d) => update({ view: 'list', date: d }, true)} />}
      <footer className="cv-foot small muted"><span>{t('Dubai time. Prices exclude VAT. A booked or decided slot opens its deal.')}</span>
        <span className="legend">{GROUPS.map(([k, , l]) => <span key={k} className={`st st-${k}`}>{t(l)}</span>)}</span></footer>
    </main>
  )
}
