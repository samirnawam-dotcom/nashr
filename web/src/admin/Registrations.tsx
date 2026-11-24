import { useState } from 'react'
import { useLoad } from './common'
import { locale, t } from '../i18n'

/** People who registered at an event (/join/<event>): interest only, no account. A list to follow up, and a CSV of it. */
type R = { events: { event: string; n: number }[]; items: { id: string; event: string; side: string; name: string; company: string; email: string; phone: string; at: string }[] }
const SIDE: Record<string, string> = { buyer: 'Buyer', media_outlet: 'Media outlet' }

export function RegistrationsPage() {
  const [event, setEvent] = useState('')
  const { data, error } = useLoad<R>(`/admin/registrations${event ? `?event=${encodeURIComponent(event)}` : ''}`, [event])
  function csv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [['Registered (Dubai)', 'Event', 'I am', 'Name', 'Company', 'Email', 'Phone'],
      ...data!.items.map(r => [new Date(r.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' }), r.event, SIDE[r.side] ?? r.side, r.name, r.company, r.email, r.phone])]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }))
    a.download = `nashr-registrations${event ? '-' + event : ''}.csv`; a.click()
  }
  return <main>
    <div className="page-title"><div><h1>{t('Registrations')}</h1>
      <p className="muted">{t('People who registered their interest at an event. They have no account; follow up with them directly.')}</p></div></div>
    <p className="small">{t('Registration link:')} <code dir="ltr">{location.origin}/join/{event || 'your-event-name'}</code></p>
    {error && <p className="error">{error}</p>}
    {!data ? <p className="muted">{t('Loading…')}</p> : <>
      <div className="row-flex" style={{ margin: '12px 0' }}>
        <select className="search" aria-label={t('Event')} value={event} onChange={e => setEvent(e.target.value)}>
          <option value="">{t('All events')}</option>{data.events.map(e => <option key={e.event} value={e.event}>{e.event} ({e.n})</option>)}</select>
        <span className="small muted">{t('{n} registered', { n: data.items.length })}</span><span className="spacer" />
        {data.items.length > 0 && <button className="btn" onClick={csv}>{t('Download CSV')}</button>}
      </div>
      {!data.items.length ? <p className="muted">{t('No registrations yet.')}</p>
        : <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Registered')}</th><th>{t('Event')}</th><th>{t('I am')}</th><th>{t('Name')}</th><th>{t('Company')}</th><th>{t('Email')}</th><th>{t('Phone')}</th></tr></thead>
          <tbody>{data.items.map(r => <tr key={r.id}><td className="small num">{new Date(r.at).toLocaleString(locale, { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td className="small">{r.event}</td><td>{t(SIDE[r.side] ?? r.side)}</td><td><b dir="auto">{r.name}</b></td><td dir="auto">{r.company}</td>
            <td><a href={`mailto:${r.email}`} dir="ltr">{r.email}</a></td><td><a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} dir="ltr">{r.phone}</a></td></tr>)}</tbody></table></div>}
    </>}
  </main>
}
