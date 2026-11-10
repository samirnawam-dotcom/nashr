import { navigate } from '../nav'
import { useState } from 'react'
import { Loading, useAct, useLoad, when } from './common'
import { PhotoBand } from '../PhotoBand'
import { api } from '../api'
import { t } from '../i18n'

type Row = { id: string; name: string; email: string; role: string; status: string; twoStep: boolean; company: { id: string; name: string; type: string }
  lastSignIn: string | null; lastSeen: string | null; sessions: number; failed24h: number; createdAt: string }
type Security = { signins_24h: number; failed_24h: number; active_now: number; helping_now: number; suspended: number; without_two_step: number
  locked: { email: string; failures: number; last: string }[]; addresses: { ip: string; failures: number; accounts: number; last: string }[]
  recent: { at: string; email: string; ip: string | null; success: boolean; reason: string | null; name: string | null; userId: string | null }[] }

const ROLE: Record<string, string> = { buyer: 'Buyer', seller: 'Publisher', admin: 'Nashr staff', founder: 'Founder' }
const REASON: Record<string, string> = { password: 'Wrong password', code: 'Wrong code', code_needed: 'Asked for the code', locked: 'Locked: too many failures' }
/** A device in a few words, from its browser string. */
export const device = (ua: string | null) => !ua ? '—' : `${/iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : t('Other')}`
  + ` · ${/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : t('app')}`

/** Everyone on Nashr: security at a glance, then a searchable list; each row opens the person. */
export function UsersPage() {
  const [q, setQ] = useState(''), [role, setRole] = useState(''), [status, setStatus] = useState(''), [flag, setFlag] = useState(''), [offset, setOffset] = useState(0)
  const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}), ...(flag ? { flag } : {}), offset: String(offset), limit: '50' })
  const { data, error } = useLoad<{ total: number; items: Row[] }>(`/admin/users?${params}`, [q, role, status, flag, offset])
  const { data: sec } = useLoad<Security>('/admin/security')
  return (
    <main>
      <PhotoBand img="/brand/desk-wide.jpg" title={t('Users')} sub={t('Everyone on Nashr: who they are, where they are signed in, and what they did.')} />
      {sec && <>
        <dl className="kpis">
          <div className="card"><dt>{t('Signed in now')}</dt><dd className="num">{sec.active_now}</dd></div>
          <div className="card"><dt>{t('Sign-ins, last 24 hours')}</dt><dd className="num">{sec.signins_24h}</dd></div>
          <div className="card"><dt>{t('Failed sign-ins, last 24 hours')}</dt><dd className={`num ${sec.failed_24h > 20 ? 'outbid' : ''}`}>{sec.failed_24h}</dd></div>
          <div className="card"><dt>{t('Staff helping in an account now')}</dt><dd className="num">{sec.helping_now}</dd></div>
          <div className="card"><dt>{t('Buyers and publishers without two-step')}</dt><dd className="num">{sec.without_two_step}</dd></div>
        </dl>
        {sec.locked.length > 0 && <p className="warn">{t('Locked for 15 minutes after repeated failures:')} {sec.locked.map(l => <b key={l.email}><bdi>{l.email}</bdi> ({l.failures}) </b>)}</p>}
        {sec.addresses.some(a => a.accounts > 2) && <p className="warn">{t('Addresses trying several accounts:')} {sec.addresses.filter(a => a.accounts > 2).map(a => <span key={a.ip} className="mono"><bdi>{a.ip}</bdi> · {t('{n} accounts', { n: a.accounts })} </span>)}</p>}
      </>}
      <div className="admin-filters">
        <input className="search" style={{ minWidth: 240 }} type="search" placeholder={t('Name, email or company')} aria-label={t('Search users')} value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} />
        <select className="btn" aria-label={t('Role')} value={role} onChange={e => { setRole(e.target.value); setOffset(0) }}><option value="">{t('Every role')}</option>
          {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
        <select className="btn" aria-label={t('Status')} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}><option value="">{t('Any status')}</option>
          <option value="active">{t('active')}</option><option value="invited">{t('invited')}</option><option value="suspended">{t('suspended')}</option></select>
        <select className="btn" aria-label={t('Show')} value={flag} onChange={e => { setFlag(e.target.value); setOffset(0) }}><option value="">{t('Everyone')}</option>
          <option value="failed">{t('Failed sign-ins in the last 24 hours')}</option><option value="never">{t('Never signed in')}</option><option value="terms">{t('Has not accepted the current terms')}</option></select>
        <a className="btn" href={`/api/admin/users?${new URLSearchParams({ ...Object.fromEntries(params), format: 'csv' })}`}>{t('Download CSV')}</a>
      </div>
      {!data ? <Loading error={error} /> : <>
        <p className="small muted">{t('{n} people', { n: data.total })}</p>
        <div className="table-wrap card"><table className="table"><thead><tr><th>{t('Person')}</th><th>{t('Company')}</th><th>{t('Role')}</th><th>{t('Status')}</th><th>{t('Two-step')}</th><th>{t('Last seen')}</th><th className="r">{t('Failed (24 h)')}</th></tr></thead>
          <tbody>{data.items.map(u => <tr key={u.id} onClick={() => navigate(`/users/${u.id}`)}>
            <td><b>{u.name}</b><div className="small muted"><bdi>{u.email}</bdi></div></td>
            <td className="small">{u.company.name}</td><td className="small">{t(ROLE[u.role] ?? u.role)}</td>
            <td><span className={`dot ${u.status === 'suspended' ? 'outbid' : u.status === 'active' ? 'lead' : 'soon'}`}>{t(u.status)}</span></td>
            <td className="small">{u.twoStep ? t('On') : <span className="muted">{t('Off')}</span>}</td>
            <td className="small num">{u.lastSeen ? when(u.lastSeen) : u.lastSignIn ? when(u.lastSignIn) : <span className="muted">{t('Never')}</span>}{u.sessions > 0 && <div className="muted">{t(u.sessions === 1 ? '1 session' : '{n} sessions', { n: u.sessions })}</div>}</td>
            <td className={`r num ${u.failed24h >= 5 ? 'outbid' : ''}`}>{u.failed24h || '—'}</td></tr>)}</tbody></table></div>
        <div className="row-flex" style={{ marginTop: 12 }}>
          <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>{t('Previous')}</button>
          <span className="small muted">{t('{from}–{to} of {n}', { from: data.total ? offset + 1 : 0, to: Math.min(offset + 50, data.total), n: data.total })}</span>
          <button className="btn" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>{t('Next')}</button></div>
      </>}
      {sec && <section className="section"><h2 style={{ fontSize: 16, marginBottom: 8 }}>{t('Latest sign-in attempts')}</h2>
        <div className="table-wrap card"><table className="table"><tbody>{sec.recent.map((r, i) => <tr key={i} onClick={() => r.userId && navigate(`/users/${r.userId}`)}>
          <td className="small num">{when(r.at)}</td><td className="small">{r.name ?? <bdi>{r.email}</bdi>}</td><td className="small mono"><bdi>{r.ip ?? '—'}</bdi></td>
          <td className={`small ${r.success ? 'lead' : 'outbid'}`}>{r.success ? t('Signed in') : t(REASON[r.reason ?? ''] ?? 'Failed')}</td></tr>)}</tbody></table></div></section>}
    </main>
  )
}

type One = { id: string; name: string; email: string; phone: string | null; role: string; status: string; twoStep: boolean; createdAt: string
  company: { id: string; name: string; type: string }; terms: { version: string | null; acceptedAt: string | null; current: boolean }; resetRequested: boolean
  sessions: { createdAt: string; lastSeen: string | null; expiresAt: string; ip: string | null; device: string | null; actingAs: string | null }[]
  helping: { staff: string; until: string; reason: string }[]
  signIns: { at: string; ip: string | null; device: string | null; success: boolean; reason: string | null }[]
  activity: { at: string; actor: string; action: string; entity: string; entityId: string | null; detail: any }[] }

const ACTION: Record<string, string> = { login: 'Signed in', 'invite.accepted': 'Joined Nashr', 'terms.accepted': 'Accepted the terms', 'password.changed': 'Changed password',
  'password.reset': 'Reset password with a link', 'password.reset_with_code': 'Reset password with the authenticator', 'password.reset_requested': 'Asked for a password reset',
  'password.reset_issued': 'Nashr issued a reset link', 'two_step.on': 'Turned on two-step sign-in', 'two_step.off': 'Turned off two-step sign-in', 'two_step.reset': 'Nashr turned off two-step sign-in',
  'sign_in_as.started': 'Nashr signed in as this person', 'sign_in_as.page': 'Nashr, signed in as this person, opened a page', 'sign_in_as.action': 'Nashr, signed in as this person, made a change',
  'sign_in_as.ended': 'Nashr signed back out', 'user.signed_out': 'Signed out everywhere by Nashr', 'user.status': 'Status changed', 'account.updated': 'Updated their account',
  'support.requested': 'Asked Nashr a question', 'user.invited': 'Invited by Nashr' }
const readable = (a: string) => t(ACTION[a] ?? a.replace(/[._]/g, ' '))

/** One person: what Nashr can do for them, where they are signed in, how they signed in, and everything they did. */
export function UserPage({ id }: { id: string }) {
  const { data: u, error, load } = useLoad<One>(`/admin/users/${id}`)
  const { act, busy, msg } = useAct(load)
  const [link, setLink] = useState('')
  if (!u) return <Loading error={error} />
  const customer = u.role === 'buyer' || u.role === 'seller'
  return (
    <main className="narrow wide">
      <p className="small"><a href="/users">{t('Users')}</a> › {u.name}</p>
      <div className="profile-h"><div><h1>{u.name}</h1>
        <p className="muted"><bdi>{u.email}</bdi>{u.phone ? <> · <bdi>{u.phone}</bdi></> : null} · {t(ROLE[u.role] ?? u.role)} · <a href={customer ? `/accounts/${u.company.id}` : '/settings'}>{u.company.name}</a></p></div></div>
      {msg}
      {link && <p className="ok">{t('Link to send:')} <input className="search mono" style={{ width: '100%' }} readOnly value={location.origin + link} onFocus={e => e.target.select()} /></p>}
      {u.helping.map((h, i) => <p key={i} className="warn">{t('{staff} is signed in as this person until {when}. Reason: {reason}', { staff: h.staff, when: when(h.until), reason: h.reason })}</p>)}
      <section className="card pad section">
        <h2>{t('Account')}</h2>
        <dl className="kv">
          <dt>{t('Status')}</dt><dd className={u.status === 'suspended' ? 'outbid' : ''}>{t(u.status)}</dd>
          <dt>{t('Two-step sign-in')}</dt><dd>{u.twoStep ? t('On') : t('Off')}</dd>
          <dt>{t('Terms')}</dt><dd>{u.terms.acceptedAt ? t('Version {v}, accepted {when}', { v: u.terms.version ?? '', when: when(u.terms.acceptedAt) }) : t('Not accepted yet')}{customer && !u.terms.current && <b className="soon"> · {t('not the current version')}</b>}</dd>
          <dt>{t('Joined')}</dt><dd>{when(u.createdAt)}</dd>
          {u.resetRequested && <><dt>{t('Password')}</dt><dd className="soon">{t('Asked for a password reset')}</dd></>}
        </dl>
        <div className="row-flex" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {u.status === 'active' && <button className="btn" disabled={busy} onClick={() => { const why = prompt(t('Why sign {name} out everywhere? (lost laptop, left the company…)', { name: u.name }))
            if (why) act('POST', `/admin/users/${u.id}/sign-out`, { reason: why }, t('Signed out everywhere.')) }}>{t('Sign out everywhere')}</button>}
          {u.status === 'active' && customer && <button className="btn" disabled={busy} onClick={() => confirm(t('Suspend {name}? They are signed out at once.', { name: u.name }))
            && act('POST', `/admin/users/${u.id}/status`, { status: 'suspended' }, t('{name} suspended.', { name: u.name }))}>{t('Suspend')}</button>}
          {u.status === 'suspended' && <button className="btn" disabled={busy} onClick={() => act('POST', `/admin/users/${u.id}/status`, { status: 'active' }, t('{name} restored.', { name: u.name }))}>{t('Restore')}</button>}
          {u.status === 'invited' && <button className="btn" disabled={busy} onClick={async () => { const r = await api<{ inviteLink: string }>(`/admin/users/${u.id}/invite`, { method: 'POST' }).catch(() => null); if (r) setLink(r.inviteLink) }}>{t('New invite link')}</button>}
          {u.resetRequested && <button className="btn primary" disabled={busy} onClick={() => act('POST', `/admin/users/${u.id}/reset-link`, {}, x => { setLink(x.link); return t('Reset link ready for {name}. Older links no longer work.', { name: u.name }) })}>{t('Password reset link')}</button>}
          {u.twoStep && customer && <button className="btn" disabled={busy} onClick={() => { const why = prompt(t('Why is two-step sign-in being turned off for {name}? (lost phone, identity checked…) Their company sees this.', { name: u.name }))
            if (why) act('POST', `/admin/users/${u.id}/two-step-reset`, { reason: why }, t('Two-step sign-in is off for {name}. They have been signed out.', { name: u.name })) }}>{t('Turn off two-step')}</button>}
          {customer && u.status === 'active' && <a className="btn" href={`/accounts/${u.company.id}#users`}>{t('Sign in as… (from the company page)')}</a>}
        </div>
      </section>
      <section className="card pad section"><h2>{t('Signed in now')}</h2>
        {!u.sessions.length ? <p className="muted">{t('Not signed in anywhere.')}</p> : <div className="table-wrap"><table className="table"><thead><tr><th>{t('Since')}</th><th>{t('Last seen')}</th><th>{t('Device')}</th><th>{t('Address')}</th></tr></thead>
          <tbody>{u.sessions.map((s, i) => <tr key={i}><td className="small num">{when(s.createdAt)}</td><td className="small num">{s.lastSeen ? when(s.lastSeen) : '—'}</td>
            <td className="small">{device(s.device)}{s.actingAs && <div className="soon">{t('acting as {name}', { name: s.actingAs })}</div>}</td><td className="small mono"><bdi>{s.ip ?? '—'}</bdi></td></tr>)}</tbody></table></div>}</section>
      <section className="card pad section"><h2>{t('Sign-in history')}</h2>
        {!u.signIns.length ? <p className="muted">{t('No sign-ins yet.')}</p> : <div className="table-wrap"><table className="table"><tbody>{u.signIns.map((l, i) => <tr key={i}>
          <td className="small num">{when(l.at)}</td><td className={`small ${l.success ? 'lead' : 'outbid'}`}>{l.success ? t('Signed in') : t(REASON[l.reason ?? ''] ?? 'Failed')}</td>
          <td className="small">{device(l.device)}</td><td className="small mono"><bdi>{l.ip ?? '—'}</bdi></td></tr>)}</tbody></table></div>}</section>
      <section className="card pad section"><h2>{t('Activity')}</h2>
        <p className="small muted">{t('What this person did, and what Nashr did to their account. The full record, with filters, is in the audit log.')} <a href={`/audit?entityId=${u.id}`}>{t('Audit log')}</a></p>
        {!u.activity.length ? <p className="muted">{t('Nothing yet.')}</p> : <ul className="timeline">{u.activity.map((a, i) => <li key={i}><span className="small muted num">{when(a.at)}</span>
          <span><b>{readable(a.action)}</b>{a.actor.startsWith('admin:') && !u.role.match(/admin|founder/) && <span className="small muted"> · {t('by Nashr')}</span>}
            {a.detail?.reason && <span className="small muted"> · {String(a.detail.reason)}</span>}{a.detail?.url && <span className="small muted mono"> · {String(a.detail.url)}</span>}</span></li>)}</ul>}</section>
    </main>
  )
}
