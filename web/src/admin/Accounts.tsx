import { navigate } from '../nav'
import { useState } from 'react'
import { api } from '../api'
import { DealStatus, Loading, date, money, useAct, useLoad } from './common'
import { PhotoBand } from '../PhotoBand'
import { ltr, sep, t } from '../i18n'

type C = { id: string; name: string; type: string; trn: string | null; vatRegistered: boolean; payoutsEnabled: boolean; invoiceMode: string; createdAt: string
  users: number; suspended: number; gmv: number; commissionBp: number | null }

export function AccountsPage() {
  const [type, setType] = useState(''), [q, setQ] = useState('')
  const { data, error } = useLoad<C[]>(`/admin/companies${type ? `?type=${type}` : ''}`, [type])
  if (!data) return <Loading error={error} />
  const shown = data.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <main>
      <PhotoBand img="/brand/dash-seller.jpg" title={t("Accounts")} sub={t("Every buyer and publisher company on Nashr, with their people, outlets and bookings.")} />
      <div className="toolbar"><input className="search" type="search" aria-label={t("Search")} placeholder={t("Search companies")} value={q} onChange={e => setQ(e.target.value)} />
        <div className="seg" role="group" aria-label={t("Type")}>{[['', t("All")], ['buyer', t("Buyers")], ['publisher', t("Publishers")]].map(([v, l]) =>
          <button key={v} className={type === v ? 'on' : ''} onClick={() => setType(v)}>{t(l)}</button>)}</div></div>
      <div className="table-wrap card"><table className="table"><thead><tr><th>{t("Company")}</th><th>{t("Type")}</th><th>{t("Users")}</th><th>{t("Payouts")}</th><th>{t("VAT")}</th><th className="r">{t("Commission")}</th><th className="r">{t("Booked value")}</th><th>{t("Joined")}</th></tr></thead>
        <tbody>{shown.map(c => <tr key={c.id} onClick={() => (navigate(`/accounts/${c.id}`))}>
          <td><b>{c.name}</b></td><td>{c.type === 'buyer' ? t('Buyer') : t("Publisher")}</td><td>{c.users}{c.suspended ? <span className="outbid small"> · {t('{n} suspended', { n: c.suspended })}</span> : ''}</td>
          <td className="small">{c.type === 'publisher' ? (c.payoutsEnabled ? <span className="lead">{t("Verified")}</span> : <span className="soon">{t("Not verified")}</span>) : '—'}</td>
          <td className="small">{c.type === 'publisher' ? (c.vatRegistered ? `${t('Registered')} · ${c.trn ?? t('no TRN')}` : t('Not registered')) : '—'}</td>
          <td className="r num small">{c.type === 'publisher' ? (c.commissionBp != null ? t('{pct} (own)', { pct: ltr(`${c.commissionBp / 100}%`) }) : t('Default')) : ''}</td>
          <td className="r num">{money(c.gmv)}</td><td className="small num">{date(c.createdAt)}</td></tr>)}</tbody></table></div>
    </main>
  )
}

type Detail = Omit<C, 'users' | 'suspended' | 'gmv' | 'commissionBp'> & { providerAccount: string | null; balance: { payable: number; owed: number } | null
  users: { id: string; name: string; email: string; phone: string | null; role: string; status: string; twoFactor: boolean; createdAt: string }[]
  outlets: { id: string; name: string; channel: string; sectors: string[] }[]
  deals: { id: string; ref: string; status: string; amount: number; createdAt: string; label: string; outlet: string }[]
  commissionHistory: { bp: number; from: string; by: string }[] }

export function AccountPage({ id, isFounder }: { id: string; isFounder: boolean }) {
  const { data: c, error, load } = useLoad<Detail>(`/admin/companies/${id}`)
  const { act, busy, msg } = useAct(load)
  const [rate, setRate] = useState('')
  if (!c) return <Loading error={error} />
  async function viewAs() { await api(`/admin/view-as/${c!.id}`, { method: 'POST' }); location.href = c!.type === 'publisher' ? '/home' : '/calendar' }
  return (
    <main className="narrow wide">
      <p className="small"><a href="/accounts">{t("Accounts")}</a> › {c.name}</p>
      <div className="profile-cover slim" aria-hidden><img src={`/brand/dash-${c.type === 'buyer' ? 'buyer' : 'seller'}.jpg`} width={1600} height={400} alt="" decoding="async" /></div>
      <div className="profile-h"><div><h1>{c.name}</h1><p className="muted">{c.type === 'buyer' ? t('Buyer') : t("Publisher")} · {t('joined {date}', { date: date(c.createdAt) })}</p></div><div className="spacer" />
        <button className="btn" onClick={viewAs}>{t("View as this account (read only)")}</button></div>
      {msg}
      {c.type === 'publisher' && <section className="card pad section">
        <h2>{t("Publisher")}</h2>
        <dl className="kv">
          <dt>{t("Payout account")}</dt><dd>{c.payoutsEnabled ? <span className="lead">{t("Verified")}</span> : <span className="soon">{t("Not verified")}</span>}{c.providerAccount && <span className="mono muted"> · {c.providerAccount}</span>}</dd>
          <dt>{t("VAT")}</dt><dd>{c.vatRegistered ? `${t('Registered')} · ${t('TRN {trn}', { trn: c.trn ?? t('missing') })}` : t('Not registered')}</dd>
          <dt>{t("Tax invoices")}</dt><dd>{c.invoiceMode === 'generate' ? t('Nashr issues them on their behalf') : t('They upload their own')}</dd>
          <dt>{t("Released, not yet paid out")}</dt><dd className="num">{money(c.balance!.payable)}</dd>
          <dt>{t("Owed to Nashr")}</dt><dd className="num">{money(c.balance!.owed)}</dd>
          <dt>{t("Commission")}</dt><dd>{c.commissionHistory.length ? t('{pct} (own rate)', { pct: ltr(`${c.commissionHistory[0].bp / 100}%`) }) : t('Default rate')}
            {c.commissionHistory.length > 1 && <div className="small muted">{c.commissionHistory.slice(1).map(h => t('{pct} from {date}', { pct: ltr(`${h.bp / 100}%`), date: date(h.from) })).join(' · ')}</div>}</dd>
        </dl>
        {isFounder && <div className="row-flex" style={{ marginTop: 12 }}>
          <input className="search" style={{ minWidth: 0, width: 140 }} aria-label={t("Commission %")} inputMode="decimal" placeholder={t("e.g. 10")} value={rate} onChange={e => setRate(e.target.value)} />
          <button className="btn" disabled={busy || !(Number(rate) > 0 && Number(rate) < 50)} onClick={() => act('PUT', `/admin/settings/commission:${c.id}`, { value: Math.round(Number(rate) * 100) }, t("Commission saved. It applies to deals accepted from now on."))}>{t("Set founding commission")}</button>
          <span className="small muted">{t("Founder only. Deals already accepted keep their rate.")}</span></div>}
      </section>}
      <section className="card pad section"><h2>{t("Users")}</h2>
        <div className="table-wrap"><table className="table"><tbody>{c.users.map(u => <tr key={u.id}>
          <td><b>{u.name}</b><div className="small muted"><bdi>{u.email}</bdi>{u.phone ? <> · <bdi>{u.phone}</bdi></> : ''}</div></td><td className="small">{t(u.role)}</td>
          <td className={`small ${u.status === 'suspended' ? 'outbid' : ''}`}>{t(u.status)}</td>
          <td className="r">{u.status === 'active' && <button className="btn" disabled={busy} onClick={() => confirm(t('Suspend {name}? They are signed out at once.', { name: u.name })) && act('POST', `/admin/users/${u.id}/status`, { status: 'suspended' }, t('{name} suspended.', { name: u.name }))}>{t("Suspend")}</button>}
            {u.status === 'suspended' && <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/users/${u.id}/status`, { status: 'active' }, t('{name} restored.', { name: u.name }))}>{t("Restore")}</button>}</td></tr>)}</tbody></table></div></section>
      {c.outlets.length > 0 && <section className="card pad section"><h2>{t("Outlets")}</h2>
        <ul className="timeline">{c.outlets.map(o => <li key={o.id}><span className="small muted">{t(o.channel)}</span><span><b>{o.name}</b> · <span className="small muted">{o.sectors.map(s => t(s)).join(sep)}</span></span></li>)}</ul></section>}
      <section className="card pad section"><h2>{t("Recent deals")}</h2>
        {!c.deals.length ? <p className="muted">{t("None yet.")}</p> : <div className="table-wrap"><table className="table"><tbody>{c.deals.map(d => <tr key={d.id} onClick={() => (navigate(`/deals/${d.id}`))}>
          <td className="num">{d.ref}</td><td><b>{d.outlet}</b> · {d.label}</td><td className="r num">{money(d.amount)}</td><td><DealStatus s={d.status} /></td></tr>)}</tbody></table></div>}</section>
    </main>
  )
}
