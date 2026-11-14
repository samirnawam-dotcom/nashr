import { useEffect, useState } from 'react'
import { tm } from '../i18n-server'
import { api } from '../api'
import { STAGES, type CampaignDetail } from './Campaigns'
import { dayLabel, money, time, slotWhen } from '../format'
import { dubai } from '../calendar/layout'
import { Status } from '../bookings/Bookings'
import './media-plan.css'
import { locale, t } from '../i18n'
import { CHANNEL_NAME } from '../media'

type Detail = CampaignDetail
const CHANNEL = CHANNEL_NAME
const today = () => new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })

/**
 * A campaign as a client-ready media plan on one A4 sheet: summary, the plan by outlet and the bookings made.
 * "Save as PDF" in the browser's print dialog gives the file; the screen-only controls never print.
 */
export function MediaPlanPage({ id }: { id: string }) {
  const [c, setC] = useState<Detail | null>(null), [company, setCompany] = useState(''), [error, setError] = useState('')
  useEffect(() => {
    api<Detail>(`/campaigns/${id}`).then(setC, e => setError(e.message))
    api<{ company: { name: string } }>('/me').then(m => setCompany(m.company.name), () => {})
  }, [id])
  useEffect(() => { if (c) document.title = `${c.name}: ${t('media plan')} | Nashr` }, [c])
  if (!c) return <main>{error ? <p className="error">{error}</p> : <p className="muted">{t("Loading…")}</p>}</main>

  const planned = c.estimated
  const byChannel = Object.entries(c.plan.reduce((m, i) => ({ ...m, [i.channel]: (m[i.channel] ?? 0) + Math.max(i.estimated, i.committed) }), {} as Record<string, number>))
    .sort((a, b) => b[1] - a[1])
  const mix = byChannel.reduce((n, [, v]) => n + v, 0)
  return (
    <main className="plan-page">
      <div className="plan-actions no-print">
        <a className="btn" href={`/campaigns/${c.id}`}>{t("Back to the campaign")}</a>
        <button className="btn primary" onClick={() => print()}>{t("Print or save as PDF")}</button>
        <span className="small muted">{t("In the print dialog, choose “Save as PDF”.")}</span>
      </div>

      <article className="plan-sheet">
        <header className="plan-head">
          <div><span className="plan-mark"><b>Nashr</b><i lang="ar">نشر</i></span><p className="plan-kicker">{t("Media plan")}</p>
            <h1>{c.name}</h1>
            <p className="plan-meta">{[company, c.objective, c.startDate && c.endDate && `${dayLabel(c.startDate)} – ${dayLabel(c.endDate)}`].filter(Boolean).join(' · ')}</p></div>
          <p className="plan-date">{t('Prepared {date}', { date: today() })}</p>
        </header>

        <section className="plan-kpis" aria-label={t(t("Budget"))}>
          <div><span>{t("Budget")}</span><b>{c.budget ? money(c.budget) : '—'}</b></div>
          <div><span>{t("Estimated")}</span><b>{money(planned)}</b></div>
          <div><span>{t("Committed")}</span><b>{money(c.committed)}</b></div>
          <div><span>{t("Remaining")}</span><b>{c.remaining == null ? '—' : money(c.remaining)}</b></div>
        </section>

        {byChannel.length > 0 && mix > 0 && <section className="plan-mix" aria-label={t(t("Channel mix"))}>
          <h2>{t("Channel mix")}</h2>
          <div className="mix-bar" aria-hidden>{byChannel.map(([ch, v]) => <i key={ch} className={`mix-${ch}`} style={{ width: `${(v / mix) * 100}%` }} />)}</div>
          <ul>{byChannel.map(([ch, v]) => <li key={ch}><i className={`mix-${ch}`} aria-hidden />{CHANNEL[ch] ?? ch} <b>{Math.round((v / mix) * 100)}%</b> <span>{money(v)}</span></li>)}</ul>
          <p className="plan-note">{t("By product in the plan: the amount committed, or the estimated cost while that is higher.")}</p>
        </section>}

        <section>
          <h2>{t("The plan")}</h2>
          {!c.plan.length ? <p className="muted">{t("No products in the plan yet.")}</p> :
            <table className="plan-table"><thead><tr><th>{t("Product")}</th><th>{t("Media type")}</th><th>{t("Where it is")}</th><th className="r">{t("Estimated cost")}</th><th className="r">{t("Committed")}</th></tr></thead>
              <tbody>{c.plan.map(i => <tr key={i.placementId}><td><b>{i.title}</b></td><td>{CHANNEL[i.channel] ?? i.channel}</td><td>{t(STAGES.find(x => x[0] === i.stage)![1])}</td>
                <td className="r num">{money(i.estimated)}</td><td className="r num">{i.committed ? money(i.committed) : '—'}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3}>{t("Total")}</td><td className="r num">{money(planned)}</td><td className="r num">{money(c.committed)}</td></tr></tfoot></table>}
        </section>

        <section>
          <h2>{t("Bookings")}</h2>
          {!c.bookings.length ? <p className="muted">{t("Nothing booked yet.")}</p> :
            <table className="plan-table"><thead><tr><th>{t("Order")}</th><th>{t("Listing")}</th><th>{t("Runs")}</th><th className="r">{t("Price")}</th><th>{t("Status")}</th></tr></thead>
              <tbody>{c.bookings.map(b => <tr key={b.id}><td className="num">{b.ref}</td><td><b>{b.outlet}</b> · {tm(b.label)}</td>
                <td className="num">{slotWhen(b.startsAt, b.channel)}</td><td className="r num">{money(b.price)}</td><td><Status s={b.status} /></td></tr>)}</tbody></table>}
        </section>

        <footer className="plan-foot">{t('Prices in AED, excluding VAT. Times in Dubai time. Payments are held by Nashr until the publisher proves the ad ran.')}
          {' '}{t('Figures as of {date}; estimated costs use each product\'s default price until a publisher accepts.', { date: today() })}</footer>
      </article>
    </main>
  )
}
