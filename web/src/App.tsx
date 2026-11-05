import { useEffect, useState } from 'react'
import { api } from './api'
import { Login } from './Login'
import { AcceptInvite, RequestAccess } from './Access'
import { Bell } from './Bell'
import { CalendarPage } from './calendar/CalendarPage'
import { BookingPage, BookingsPage } from './bookings/Bookings'
import { DirectoryPage, OutletPage } from './directory/Directory'
import { CampaignPage, CampaignsPage } from './campaigns/Campaigns'
import { DocumentPage, DocumentsPage } from './documents/Documents'
import { InboxPage, SellerDashboard } from './seller/Dashboard'
import { SchedulePage, SlotPage } from './seller/Schedule'
import { SellerDealPage, SellerDealsPage } from './seller/Deals'
import { EarningsPage } from './seller/Earnings'
import { ListingsPage, NewPlacementPage } from './seller/Listings'
import { ProfilePage } from './seller/Profile'
import { AccessPage, AdminOverview } from './admin/Overview'
import { AccountPage, AccountsPage } from './admin/Accounts'
import { AdminDealPage, AdminDealsPage, DisputesPage } from './admin/Deals'
import { FundsPage, PayoutsPage, ReportsPage } from './admin/Money'
import { AuditPage, DirectoryAdminPage, SettingsPage } from './admin/System'

type Me = { role: string; company: { name: string; type: string }; viewingAs: string | null }
const useHash = () => { const [h, set] = useState(location.hash); useEffect(() => { const f = () => set(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, []); return h }

// One page per path; ids are the last segment.
type Routes = [RegExp, (id: string) => React.ReactNode][]
const BUYER: Routes = [
  [/^\/calendar/, () => <CalendarPage />],
  [/^\/directory\/([\w-]+)$/, id => <OutletPage id={id} />],
  [/^\/directory/, () => <DirectoryPage />],
  [/^\/campaigns\/([\w-]+)$/, id => <CampaignPage id={id} />],
  [/^\/campaigns/, () => <CampaignsPage />],
  [/^\/bookings\/([\w-]+)$/, id => <BookingPage id={id} />],
  [/^\/bookings/, () => <BookingsPage />],
  [/^\/documents\/([\w-]+)$/, id => <DocumentPage id={id} />],
  [/^\/documents/, () => <DocumentsPage />],
]
const SELLER: Routes = [
  [/^\/home/, () => <SellerDashboard />],
  [/^\/inbox/, () => <InboxPage />],
  [/^\/schedule/, () => <SchedulePage />],
  [/^\/slots\/([\w-]+)$/, id => <SlotPage id={id} />],
  [/^\/deals\/([\w-]+)$/, id => <SellerDealPage id={id} />],
  [/^\/deals/, () => <SellerDealsPage />],
  [/^\/earnings/, () => <EarningsPage />],
  [/^\/listings\/new$/, () => <NewPlacementPage />],
  [/^\/listings/, () => <ListingsPage />],
  [/^\/profile/, () => <ProfilePage />],
  [/^\/documents\/([\w-]+)$/, id => <DocumentPage id={id} />],
]
const ADMIN = (founder: boolean): Routes => [
  [/^\/admin/, () => <AdminOverview />],
  [/^\/access/, () => <AccessPage />],
  [/^\/accounts\/([\w-]+)$/, id => <AccountPage id={id} isFounder={founder} />],
  [/^\/accounts/, () => <AccountsPage />],
  [/^\/deals\/([\w-]+)$/, id => <AdminDealPage id={id} />],
  [/^\/deals/, () => <AdminDealsPage />],
  [/^\/disputes/, () => <DisputesPage />],
  [/^\/funds/, () => <FundsPage />],
  [/^\/payouts/, () => <PayoutsPage />],
  [/^\/directory/, () => <DirectoryAdminPage />],
  [/^\/reports/, () => <ReportsPage />],
  [/^\/audit/, () => <AuditPage />],
  [/^\/settings/, () => <SettingsPage isFounder={founder} />],
  [/^\/documents\/([\w-]+)$/, id => <DocumentPage id={id} />],
]
const NAV: Record<string, string[][]> = {
  admin: [['/admin', 'Overview'], ['/access', 'Access'], ['/accounts', 'Accounts'], ['/deals', 'Deals'], ['/disputes', 'Disputes'], ['/funds', 'Funds'],
    ['/payouts', 'Payouts'], ['/directory', 'Directory'], ['/reports', 'Reports'], ['/audit', 'Audit'], ['/settings', 'Settings']],
  buyer: [['/calendar', 'Calendar'], ['/directory', 'Directory'], ['/campaigns', 'Campaigns'], ['/bookings', 'Bookings']],
  seller: [['/home', 'Dashboard'], ['/schedule', 'Calendar'], ['/inbox', 'Inbox'], ['/deals', 'Deals'], ['/earnings', 'Earnings'], ['/listings', 'Listings'], ['/profile', 'Profile']],
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const hash = useHash()
  const load = () => api<Me>('/me').then(setMe, () => setMe(null))
  useEffect(() => { load() }, [])
  if (location.pathname === '/invite') return <AcceptInvite token={location.hash.slice(1)} onDone={() => { location.hash = ''; load() }} />
  if (me === undefined) return null
  const seller = me?.role === 'seller', staff = me?.role === 'admin' || me?.role === 'founder'
  const home = staff ? '/admin' : seller ? '/home' : '/calendar'
  const path = hash.replace(/^#/, '') || home
  if (me === null) return path === '/request-access' ? <RequestAccess /> : <Login onIn={load} />

  const nav = NAV[staff ? 'admin' : seller ? 'seller' : 'buyer']
  const hit = (staff ? ADMIN(me.role === 'founder') : seller ? SELLER : BUYER).map(([re, page]) => [path.match(re), page] as const).find(([m]) => m)
  return (
    <>
      {me.viewingAs && <div className="viewbar" role="status">Viewing {me.company.name} as Nashr, read only. Every page you open is logged.
        <button className="btn" onClick={async () => { await api('/admin/view-as', { method: 'DELETE' }); location.hash = `#/accounts/${me.viewingAs}`; location.reload() }}>Stop viewing</button></div>}
      <header className={`topbar ${staff ? 'staff' : ''}`}>
        <a className="logo" href={`#${home}`}>Nashr</a>
        <nav className="nav">{nav.map(([p, l]) => <a key={p} href={`#${p}`} className={path.startsWith(p) || (p === '/bookings' && path.startsWith('/documents')) || (p === '/deals' && path.startsWith('/documents')) || (p === '/schedule' && path.startsWith('/slots')) ? 'active' : ''}>{l}</a>)}</nav>
        <div className="spacer" />
        <Bell role={me.role} />
        <span className="small muted">{me.company.name}</span>
        <button className="btn" onClick={async () => { await api('/auth/logout', { method: 'POST' }); setMe(null) }}>Sign out</button>
        <span className="avatar" aria-hidden>{me.company.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
      </header>
      {hit ? hit[1](hit[0]![1]) : <main><h1>Not found</h1><p className="muted"><a href={`#${home}`}>Back to the start</a></p></main>}
    </>
  )
}
