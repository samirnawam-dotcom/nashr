import { useEffect, useState } from 'react'
import { api, type Campaign, type Client } from '../api'
import { dayLabel, money, time } from '../format'
import { dubai } from '../calendar/layout'
import { ChannelMark, CHANNEL_NAME } from '../calendar/CalendarPage'
import { PhotoBand } from '../PhotoBand'
import { t } from '../i18n'

type R = { totals: { bookings: number; spend: number; aired: number; withProof: number; reach: number; cpm: number | null }
  byChannel: { channel: string; bookings: number; spend: number; reach: number }[]
  items: { id: string; ref: string; outlet: string; channel: string; placement: string; label: string; startsAt: string; campaign: string | null; client?: string | null
    status: string; price: number; paid: number; aired: boolean; proof: boolean; reach: number | null }[] }

const people = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n)

/** What the money bought: a report a buyer (or an agency's client) can read, with every airing behind it and a CSV to keep. */
export function ResultsPage() {
  const [r, setR] = useState<R | null>(null), [error, setError] = useState(''), [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaign, setCampaign] = useState(() => new URLSearchParams(location.search).get('campaign') ?? '')
  const [clients, setClients] = useState<Client[]>([]), [client, setClient] = useState(() => new URLSearchParams(location.search).get('client') ?? '')
  useEffect(() => { api<Campaign[]>('/campaigns').then(setCampaigns, () => {}); api<Client[]>('/clients').then(setClients, () => {}) }, [])
  useEffect(() => { setR(null); const q = new URLSearchParams({ ...(campaign ? { campaign } : {}), ...(client ? { client } : {}) }).toString()
    api<R>(`/buyer/results${q ? `?${q}` : ''}`).then(setR, e => setError(e.message)) }, [campaign, client])
  function csv() {
    const head = ['Order', 'Outlet', 'Channel', 'Placement', 'Slot', 'Airs (Dubai)', 'Campaign', 'Client', 'Price excl. VAT (AED)', 'Paid incl. VAT (AED)', 'Aired', 'Proof', 'Reach (publisher estimate)']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = r!.items.map(i => [i.ref, i.outlet, i.channel, i.placement, i.label, `${dubai(i.startsAt).date} ${time(i.startsAt)}`, i.campaign, i.client, (i.price / 100).toFixed(2),
      (i.paid / 100).toFixed(2), i.aired ? 'yes' : 'no', i.proof ? 'yes' : 'no', i.reach ?? ''].map(esc).join(','))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' }))
    a.download = `nashr-results${client ? '-' + (clients.find(c => c.id === client)?.name ?? 'client') : ''}${campaign ? '-' + (campaigns.find(c => c.id === campaign)?.name ?? 'campaign') : ''}.csv`; a.click()
  }
  const max = Math.max(1, ...(r?.byChannel.map(c => c.spend) ?? [1]))
  return (
    <main>
      <PhotoBand img="/brand/dash-buyer.jpg" title={t('Results')} sub={t('What your bookings delivered: spend, airings, proof and the reach publishers report.')}>
        <div className="row-flex">{clients.length > 0 && <select className="search" aria-label={t('Client')} value={client} onChange={e => setClient(e.target.value)}>
          <option value="">{t('All clients')}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          {campaigns.length > 0 && <select className="search" aria-label={t('Campaign')} value={campaign} onChange={e => setCampaign(e.target.value)}>
          <option value="">{t('All campaigns')}</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          {r && r.items.length > 0 && <button className="btn" onClick={csv}>{t('Download CSV')}</button>}</div>
      </PhotoBand>
      {error && <p className="error">{error}</p>}
      {!r ? !error && <p className="muted">{t('Loading…')}</p> : !r.items.length ? <div className="card pad empty"><p><b>{t('No paid bookings yet.')}</b></p>
        <p className="muted">{t('Results appear here once a booking is paid. Each airing, its proof and its reach are added as it runs.')}</p><a className="btn primary" href="/calendar">{t('Find slots')}</a></div> : <>
        <dl className="kpis">
          <div className="card"><dt>{t('Spend (excl. VAT)')}</dt><dd className="num">{money(r.totals.spend)}</dd><span className="small muted">{r.totals.bookings === 1 ? t('1 booking') : t('{n} bookings', { n: r.totals.bookings })}</span></div>
          <div className="card"><dt>{t('Aired')}</dt><dd className="num">{r.totals.aired} / {r.totals.bookings}</dd><span className="small muted">{t('{n} with proof', { n: r.totals.withProof })}</span></div>
          <div className="card"><dt>{t('Reach')}</dt><dd className="num">{r.totals.reach ? people(r.totals.reach) : '—'}</dd><span className="small muted">{t("Publishers' estimates per airing")}</span></div>
          <div className="card"><dt>{t('Cost per 1,000 reached')}</dt><dd className="num">{r.totals.cpm != null ? money(r.totals.cpm) : '—'}</dd><span className="small muted">{t('Over airings with a reach figure')}</span></div>
        </dl>
        <section className="card pad section"><h2 className="sec-h" style={{ marginTop: 0 }}>{t('By channel')}</h2>
          <ul className="res-bars">{r.byChannel.map(c => <li key={c.channel}><span className="res-name"><ChannelMark c={c.channel} label /></span>
            <span className="res-bar" aria-hidden><span className={`ch-fill ch-${c.channel}`} style={{ width: `${Math.max(2, 100 * c.spend / max)}%` }} /></span>
            <span className="num small">{money(c.spend)}{c.reach ? ` · ${people(c.reach)}` : ''}</span></li>)}</ul>
          <span className="visually-hidden">{r.byChannel.map(c => `${CHANNEL_NAME[c.channel]}: ${money(c.spend)}`).join('; ')}</span></section>
        <div className="table-wrap card section"><table className="table"><thead><tr><th>{t('Order')}</th><th>{t('Slot')}</th><th>{t('Airs')}</th><th className="r">{t('Price')}</th>
          <th>{t('Proof')}</th><th className="r">{t('Reach')}</th></tr></thead>
          <tbody>{r.items.map(i => <tr key={i.id}><td className="num small"><a href={`/bookings/${i.id}`}>{i.ref}</a>{(i.client || i.campaign) && <div className="muted">{[i.client, i.campaign].filter(Boolean).join(' · ')}</div>}</td>
            <td><b>{i.outlet}</b><div className="small muted">{i.placement} · {i.label}</div></td>
            <td className="small num">{dayLabel(dubai(i.startsAt).date)} · {time(i.startsAt)}</td><td className="r num">{money(i.price)}</td>
            <td className="small">{i.proof ? <span className="dot lead">{t('Received')}</span> : i.aired ? <span className="dot soon">{t('Due')}</span> : <span className="muted">{t('After airing')}</span>}</td>
            <td className="r num small">{i.reach ? people(i.reach) : '—'}</td></tr>)}</tbody></table></div>
      </>}
    </main>
  )
}
