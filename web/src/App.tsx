import { useEffect, useState } from 'react'
import { api } from './api'
import { Login } from './Login'
import { CalendarPage } from './calendar/CalendarPage'
import { BookingPage, BookingsPage } from './bookings/Bookings'

type Me = { role: string; company: { name: string; type: string }; viewingAs: string | null }
const useHash = () => { const [h, set] = useState(location.hash); useEffect(() => { const f = () => set(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, []); return h }

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const hash = useHash()
  const load = () => api<Me>('/me').then(setMe, () => setMe(null))
  useEffect(() => { load() }, [])
  if (me === undefined) return null
  if (me === null) return <Login onIn={load} />

  const path = hash.replace(/^#/, '') || '/calendar'
  const booking = path.match(/^\/bookings\/([\w-]+)$/)
  const nav = [['/calendar', 'Calendar'], ['/directory', 'Directory'], ['/campaigns', 'Campaigns'], ['/bookings', 'Bookings']]
  return (
    <>
      <header className="topbar">
        <a className="logo" href="#/calendar">Nashr</a>
        <nav className="nav">{nav.map(([p, l]) => <a key={p} href={`#${p}`} className={path.startsWith(p) ? 'active' : ''}>{l}</a>)}</nav>
        <div className="spacer" />
        <span className="small muted">{me.company.name}</span>
        <button className="btn" onClick={async () => { await api('/auth/logout', { method: 'POST' }); setMe(null) }}>Sign out</button>
        <span className="avatar" aria-hidden>{me.company.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
      </header>
      {path.startsWith('/calendar') ? <CalendarPage />
        : booking ? <BookingPage id={booking[1]} />
        : path.startsWith('/bookings') ? <BookingsPage />
        : <main><h1>{nav.find(([p]) => path.startsWith(p))?.[1] ?? 'Not found'}</h1><p className="muted">This screen comes in the next slice.</p></main>}
    </>
  )
}
