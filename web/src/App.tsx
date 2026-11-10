import { navigate, usePath } from './nav'
import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { Login } from './Login'
import { AcceptInvite, RequestAccess } from './Access'
import { MyAccountPage, ForgotPassword, ResetPassword } from './Account'
import { Bell } from './Bell'
import { CalendarPage } from './calendar/CalendarPage'
import { DirectoryPage, OutletPage } from './directory/Directory'
import { Landing } from './Landing'
import { DisputesPolicyPage, PrivacyPage, RefundsPage, TermsPage } from './Legal'
import { TermsGate } from './TermsGate'
import { GuestContext, rememberPlace, takePlace } from './guest'
import { PAGES, applyMeta } from './seo'
import { LangSwitch, lang, t } from './i18n'
import { time } from './format'
import { useUnread } from './messages/unread'
import { resetLive } from './live'
import './messages/messages.css'


// Screens behind sign-in load only when opened, so visitors download just the public pages (faster landing page).
const L = <M, K extends keyof M>(load: () => Promise<M>, name: K) => lazy(async () => ({ default: (await load())[name] as M[K] & React.ComponentType<any> })) // eslint-disable-line @typescript-eslint/no-explicit-any
const load_bookings_Bookings = () => import('./bookings/Bookings')
const BookingPage = L(load_bookings_Bookings, 'BookingPage')
const BookingsPage = L(load_bookings_Bookings, 'BookingsPage')
const load_campaigns_Campaigns = () => import('./campaigns/Campaigns')
const CampaignPage = L(load_campaigns_Campaigns, 'CampaignPage')
const CampaignsPage = L(load_campaigns_Campaigns, 'CampaignsPage')
const MediaPlanPage = L(() => import('./campaigns/MediaPlan'), 'MediaPlanPage')
const load_clients = () => import('./clients/Clients')
const ClientsPage = L(load_clients, 'ClientsPage')
const ClientPage = L(load_clients, 'ClientPage')
const load_documents_Documents = () => import('./documents/Documents')
const DocumentPage = L(load_documents_Documents, 'DocumentPage')
const DocumentsPage = L(load_documents_Documents, 'DocumentsPage')
const HelpPage = L(() => import('./Help'), 'HelpPage')
const SupportPage = L(() => import('./admin/Support'), 'SupportPage')
const UsersPage = L(() => import('./admin/Users'), 'UsersPage')
const EmailsPage = L(() => import('./admin/Emails'), 'EmailsPage')
const UserPage = L(() => import('./admin/Users'), 'UserPage')
const load_seller_Dashboard = () => import('./seller/Dashboard')
const RequestsPage = L(() => import('./seller/Requests'), 'RequestsPage')
const SellerDashboard = L(load_seller_Dashboard, 'SellerDashboard')
const PortalDashboard = L(() => import('./seller/Portal'), 'PortalDashboard')
const load_seller_Schedule = () => import('./seller/Schedule')
const SchedulePage = L(load_seller_Schedule, 'SchedulePage')
const SlotPage = L(load_seller_Schedule, 'SlotPage')
const load_seller_Deals = () => import('./seller/Deals')
const SellerDealPage = L(load_seller_Deals, 'SellerDealPage')
const SellerDealsPage = L(load_seller_Deals, 'SellerDealsPage')
const load_seller_Earnings = () => import('./seller/Earnings')
const EarningsPage = L(load_seller_Earnings, 'EarningsPage')
const load_seller_Listings = () => import('./seller/Listings')
const ProductsPage = L(() => import('./seller/Products'), 'ProductsPage')
const ProductEditorPage = L(() => import('./seller/ProductEditor'), 'ProductEditorPage')
const NewPlacementPage = L(load_seller_Listings, 'NewPlacementPage')
const ImportPlacementsPage = L(load_seller_Listings, 'ImportPlacementsPage')
const load_seller_Profile = () => import('./seller/Profile')
const ProfilePage = L(load_seller_Profile, 'ProfilePage')
const load_buyer_Dashboard = () => import('./buyer/Dashboard')
const BuyerDashboard = L(load_buyer_Dashboard, 'BuyerDashboard')
const ResultsPage = L(() => import('./insights/Results'), 'ResultsPage')
const load_segments = () => import('./public/Segments'), load_articles = () => import('./public/Insights')
const AudiencesPage = L(load_segments, 'AudiencesPage'), AudiencePage = L(load_segments, 'AudiencePage'), IndustryPage = L(load_segments, 'IndustryPage')
const InsightsPage = L(load_articles, 'InsightsPage'), ArticlePage = L(load_articles, 'ArticlePage')
const MessagesPage = L(() => import('./messages/Messages'), 'MessagesPage')
const CompanyPage = L(() => import('./buyer/Company'), 'CompanyPage')
const EditPlacementPage = L(load_seller_Listings, 'EditPlacementPage')
const StatementPage = L(() => import('./seller/Statement'), 'StatementPage')
const load_Athena = () => import('./Athena')
const AthenaPage = L(load_Athena, 'AthenaPage')
const load_admin_Overview = () => import('./admin/Overview')
const AccessPage = L(load_admin_Overview, 'AccessPage')
const AdminOverview = L(load_admin_Overview, 'AdminOverview')
const load_admin_Accounts = () => import('./admin/Accounts')
const AccountPage = L(load_admin_Accounts, 'AccountPage')
const AccountsPage = L(load_admin_Accounts, 'AccountsPage')
const load_admin_Deals = () => import('./admin/Deals')
const AdminDealPage = L(load_admin_Deals, 'AdminDealPage')
const AdminSlotPage = L(load_admin_Deals, 'AdminSlotPage')
const AdminDealsPage = L(load_admin_Deals, 'AdminDealsPage')
const DisputesPage = L(load_admin_Deals, 'DisputesPage')
const load_admin_Money = () => import('./admin/Money')
const FundsPage = L(load_admin_Money, 'FundsPage')
const PayoutsPage = L(load_admin_Money, 'PayoutsPage')
const ReportsPage = L(load_admin_Money, 'ReportsPage')
const AdminCalendarPage = L(() => import('./admin/Calendar'), 'AdminCalendarPage')
const load_admin_System = () => import('./admin/System')
const AuditPage = L(load_admin_System, 'AuditPage')
const DirectoryAdminPage = L(load_admin_System, 'DirectoryAdminPage')
const SettingsPage = L(load_admin_System, 'SettingsPage')

export type Me = { role: string; company: { name: string; type: string }; viewingAs: string | null
  signedInAs: { user: string; staff: string; until: string; companyId: string } | null; lang?: 'en' | 'ar'; terms?: { version: string; accepted: boolean } }

// One page per path; ids are the last segment.
type Routes = [RegExp, (id: string) => React.ReactNode][]
const BUYER: Routes = [
  [/^\/dashboard/, () => <BuyerDashboard />],
  [/^\/calendar/, () => <CalendarPage />],
  [/^\/directory\/([\w-]+)$/, id => <OutletPage id={id} />],
  [/^\/directory/, () => <DirectoryPage />],
  [/^\/campaigns\/([\w-]+)\/plan$/, id => <MediaPlanPage id={id} />],
  [/^\/campaigns\/([\w-]+)$/, id => <CampaignPage id={id} />],
  [/^\/campaigns/, () => <CampaignsPage />],
  [/^\/clients\/([\w-]+)$/, id => <ClientPage id={id} />],
  [/^\/clients/, () => <ClientsPage />],
  [/^\/results/, () => <ResultsPage />],
  [/^\/bookings\/([\w-]+)$/, id => <BookingPage id={id} />],
  [/^\/bookings/, () => <BookingsPage />],
  [/^\/documents\/([\w-]+)$/, id => <DocumentPage id={id} />],
  [/^\/documents/, () => <DocumentsPage />],
  [/^\/athena/, () => <AthenaPage />],
  [/^\/help/, () => <HelpPage role="buyer" />],
  [/^\/messages\/([\w-]+)$/, id => <MessagesPage open={id} role="buyer" />],
  [/^\/messages/, () => <MessagesPage role="buyer" />],
  [/^\/company/, () => <CompanyPage />],
]
/** Tabs under a merged menu item (owner's rules): Inbox holds requests and messages; Reports holds transactions and balances. */
const SubTabs = ({ tabs, children }: { tabs: [string, string][]; children: React.ReactNode }) => {
  const here = location.pathname
  return <><div className="sub-tabs-wrap"><nav className="sub-tabs" aria-label={t('Sections')}>{tabs.map(([href, l]) => { const on = href === '/reports' ? /^\/(reports|deals)$/.test(here) : here.startsWith(href)
    return <a key={href} href={href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>{l}</a> })}</nav></div>{children}</>
}
const INBOX_TABS = (): [string, string][] => [['/inbox', t('Requests')], ['/messages', t('Messages')]]
const REPORT_TABS = (): [string, string][] => [['/reports', t('Transactions')], ['/earnings', t('Balances')]]
const SELLER: Routes = [
  [/^\/home/, () => <PortalDashboard />],
  [/^\/inbox/, () => <SubTabs tabs={INBOX_TABS()}><RequestsPage /></SubTabs>],
  [/^\/schedule/, () => <SchedulePage />],
  [/^\/slots\/([\w-]+)$/, id => <SlotPage id={id} />],
  [/^\/deals\/([\w-]+)$/, id => <SellerDealPage id={id} />],
  [/^\/(deals|reports)$/, () => <SubTabs tabs={REPORT_TABS()}><SellerDealsPage /></SubTabs>],
  [/^\/earnings\/statement\/(\d{4}-\d{2})$/, m => <StatementPage month={m} />],
  [/^\/earnings/, () => <SubTabs tabs={REPORT_TABS()}><EarningsPage /></SubTabs>],
  [/^\/messages\/([\w-]+)$/, id => <SubTabs tabs={INBOX_TABS()}><MessagesPage open={id} role="seller" /></SubTabs>],
  [/^\/messages/, () => <SubTabs tabs={INBOX_TABS()}><MessagesPage role="seller" /></SubTabs>],
  [/^\/listings\/([\w-]+)\/edit$/, id => <EditPlacementPage id={id} />],
  [/^\/listings\/new$/, () => <ProductEditorPage />],
  [/^\/listings\/p\/([\w-]+)$/, id => <ProductEditorPage key={id} id={id} />],
  [/^\/listings\/import$/, () => <ImportPlacementsPage />],
  [/^\/listings/, () => <ProductsPage />],
  [/^\/profile/, () => <ProfilePage />],
  [/^\/documents\/([\w-]+)$/, id => <DocumentPage id={id} />],
  [/^\/documents/, () => <DocumentsPage seller />],
  [/^\/help/, () => <HelpPage role="seller" />],
]
const ADMIN = (founder: boolean): Routes => [
  [/^\/admin/, () => <AdminOverview />],
  [/^\/access/, () => <AccessPage />],
  [/^\/accounts\/([\w-]+)$/, id => <AccountPage id={id} isFounder={founder} />],
  [/^\/users\/([\w-]+)$/, id => <UserPage id={id} />],
  [/^\/users/, () => <UsersPage />],
  [/^\/emails/, () => <EmailsPage />],
  [/^\/accounts/, () => <AccountsPage />],
  [/^\/calendar/, () => <AdminCalendarPage />],
  [/^\/deals\/([\w-]+)$/, id => <AdminDealPage id={id} />],
  [/^\/slots\/([\w-]+)$/, id => <AdminSlotPage id={id} />],
  [/^\/deals/, () => <AdminDealsPage />],
  [/^\/disputes/, () => <DisputesPage />],
  [/^\/support/, () => <SupportPage />],
  [/^\/funds/, () => <FundsPage />],
  [/^\/payouts/, () => <PayoutsPage />],
  [/^\/directory/, () => <DirectoryAdminPage />],
  [/^\/reports/, () => <ReportsPage />],
  [/^\/audit/, () => <AuditPage />],
  [/^\/settings/, () => <SettingsPage isFounder={founder} />],
  [/^\/documents\/([\w-]+)$/, id => <DocumentPage id={id} />],
]
// Terms, privacy and refunds are open to everyone, signed in or not.
const LEGAL: Routes = [[/^\/terms$/, () => <TermsPage />], [/^\/privacy$/, () => <PrivacyPage />], [/^\/refunds$/, () => <RefundsPage />], [/^\/dispute-policy$/, () => <DisputesPolicyPage />],
  // audiences, industries and insights: public pages anyone can open
  [/^\/audiences\/([\w-]+)$/, id => <AudiencePage id={id} />], [/^\/audiences$/, () => <AudiencesPage />], [/^\/advertise\/([\w-]+)$/, id => <IndustryPage id={id} />],
  [/^\/insights\/([\w-]+)$/, id => <ArticlePage id={id} />], [/^\/insights$/, () => <InsightsPage />]]
// Visitors can browse the calendar and the directory; everything else asks them to sign in.
const GUEST: Routes = [...LEGAL,
  [/^\/help/, () => <HelpPage role="guest" />],
  [/^\/calendar/, () => <CalendarPage />],
  [/^\/directory\/([\w-]+)$/, id => <OutletPage id={id} />],
  [/^\/directory/, () => <DirectoryPage />],
]
const routesFor = (role: string): Routes => [...LEGAL, [/^\/account$/, () => <MyAccountPage />], ...(role === 'seller' ? SELLER : role === 'admin' || role === 'founder' ? ADMIN(role === 'founder') : BUYER)]
const isActive = (path: string, p: string, seller = false) => (p === '/' ? path === '/' : path.startsWith(p)) || (p === '/bookings' && path.startsWith('/documents'))
  || (p === '/deals' && path.startsWith('/documents')) || (p === '/schedule' && path.startsWith('/slots'))
  // the publisher's merged items: Inbox holds requests and messages, Reports holds transactions, balances and documents
  || (seller && ((p === '/inbox' && path.startsWith('/messages')) || (p === '/reports' && /^\/(deals|earnings|documents)/.test(path))))

const NAV: Record<string, string[][]> = {
  admin: [['/admin', t('Overview')], ['/access', t('Access')], ['/accounts', t('Accounts')], ['/users', t('Users')], ['/calendar', t('Calendar')], ['/deals', t('Deals')], ['/disputes', t('Disputes')], ['/support', t('Support')], ['/funds', t('Funds')],
    ['/payouts', t('Payouts')], ['/reports', t('Reports')], ['/directory', t('Directory')], ['/audit', t('Audit')], ['/emails', t('Emails')], ['/settings', t('Settings')]],
  guest: [['/', t('Home')], ['/calendar', t('Calendar')], ['/audiences', t('Audiences')], ['/directory', t('Directory')], ['/help', t('Help')], ['/sign-in', t('Sign in')]],
  buyer: [['/dashboard', t('Dashboard')], ['/calendar', t('Calendar')], ['/audiences', t('Audiences')], ['/directory', t('Directory')], ['/campaigns', t('Campaigns')], ['/clients', t('Clients')], ['/bookings', t('Bookings')], ['/results', t('Results')], ['/messages', t('Messages')], ['/athena', t('Athena')], ['/company', t('Company')], ['/help', t('Help')]],
  seller: [['/home', t('Dashboard')], ['/schedule', t('Calendar')], ['/listings', t('Products')], ['/inbox', t('Inbox')], ['/reports', t('Reports')]],
}
// The phone's bottom bar: the five places people go most.
const TABS: Record<string, string[]> = { buyer: ['/dashboard', '/calendar', '/bookings', '/messages', '/directory'], seller: ['/home', '/schedule', '/listings', '/inbox', '/reports'] 
}

const ICON: Record<string, string> = {
  '/dashboard': 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z',
  '/calendar': 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  '/schedule': 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  '/directory': 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', '/campaigns': 'M5 21V4M5 4h11l-2 4 2 4H5', '/clients': 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6',
  '/bookings': 'M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM10 7v12', '/home': 'M4 11 12 4l8 7M6 10v10h12V10',
  '/': 'M4 11 12 4l8 7M6 10v10h12V10', '/sign-in': 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4',
  '/inbox': 'M4 13h5l1 3h4l1-3h5M5 5h14l1 8v6H4v-6z', '/messages': 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  '/company': 'M4 21V5l8-2v18M12 7h8v14M7 8h2M7 12h2M7 16h2M15 11h2M15 15h2M2 21h20', '/deals': 'M5 7h14M5 12h14M5 17h9',
  '/athena': 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  '/earnings': 'M4 19h16M7 15V9M12 15V5M17 15v-4', '/listings': 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  '/profile': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0', '/admin': 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z',
  '/access': 'M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM3 21a8 8 0 0 1 12-6.9M19 14v6M16 17h6', '/accounts': 'M3 21V8l9-5 9 5v13M9 21v-6h6v6M3 21h18',
  '/help': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  '/users': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  '/emails': 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  '/support': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  '/disputes': 'M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  '/funds': 'M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18', '/payouts': 'M4 8h14l-3-3M20 16H6l3 3',
  '/audiences': 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-5-5.9',
  '/reports': 'M12 3v18M16.5 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7', '/results': 'M4 20V11M10 20V5M16 20v-6M2 20h20', '/audit': 'M9 4h6l1 2h3v15H5V6h3zM9 11h6M9 15h6',
  '/settings': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4',
}
// Where the sidebar starts a new group, per role (sentence-case labels; the groups are real sections of the work).
const GROUP: Record<string, Record<string, string>> = { admin: { '/funds': t('Money'), '/directory': t('System') }, seller: {}, buyer: { '/campaigns': t('Plan and book'), '/company': t('Your company') } }
const ROLE: Record<string, string> = { buyer: t('Buyer'), seller: t('Publisher'), admin: t('Nashr operations'), founder: t('Nashr founder') }
const Badge = ({ n }: { n: number }) => <span className="nav-badge" aria-label={t('{n} unread', { n })}>{n > 99 ? '99+' : n}</span>
const TabIcon = ({ path }: { path: string }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d={ICON[path] ?? 'M4 12h16'} /></svg>

/** The bilingual wordmark (placeholder until the brand files arrive): Latin in Geist, Arabic in Kufi. */
export const Wordmark = ({ href }: { href?: string }) => (
  <a className="logo" href={href ?? '/'} aria-label={t("Nashr home")}><span className="latin">Nashr</span><span className="arabic" lang="ar">نشر</span></a>)

/** The menu under the account's name (owner's rules): its settings, help, the language and signing out, out of the main list. */
function NameMenu({ name, sub, initials, links, mini, onSignOut }: { name: string; sub: string; initials: string; links: [string, string][]; mini: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  return <div className="name-menu" ref={ref}>
    <button type="button" className="name-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title={mini ? name : undefined}>
      <span className="avatar" aria-hidden>{initials}</span>
      <span className="who"><b>{name}</b><span>{sub}</span></span>
      <svg className="name-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 15l6-6 6 6" /></svg></button>
    {open && <div className="name-pop" role="menu">
      <div className="name-pop-h"><b>{name}</b><span className="small muted">{sub}</span></div>
      {links.map(([href, l]) => <a key={href} role="menuitem" href={href} onClick={() => setOpen(false)}>{l}</a>)}
      <div className="name-pop-lang"><span className="small muted">{t('Language')}</span><LangSwitch /></div>
      <button type="button" role="menuitem" className="name-out" onClick={onSignOut}>{t('Sign out')}</button>
    </div>}
  </div>
}

export function App({ initialMe }: { initialMe?: Me | null }) {
  const [me, setMe] = useState<Me | null | undefined>(initialMe), [menu, setMenu] = useState(false)
  const full = usePath(), hash = full.split('?')[0]
  useEffect(() => setMenu(false), [full]) // a phone menu closes once you go somewhere
  useEffect(() => { scrollTo(0, 0) }, [hash]) // a new page starts at the top
  const load = () => api<Me>('/me').then(setMe, () => setMe(null))
  useEffect(() => { if (initialMe === undefined) load() }, [])
  const unread = useUnread(!!me && (me.role === 'buyer' || me.role === 'seller'), full)
  // open requests for a publisher, shown on Requests in the menu (refreshed every minute)
  const [requests, setRequests] = useState(0)
  // The sidebar in two versions (owner's feedback): expanded with labels, or collapsed to icons; remembered on this device
  const [mini, setMini] = useState(() => { try { return localStorage.getItem('nashr:side-min') === '1' } catch { return false } })
  const toggleMini = () => setMini(m => { try { localStorage.setItem('nashr:side-min', m ? '0' : '1') } catch { /* private mode */ } return !m })
  useEffect(() => { if (me?.role !== 'seller') return
    const get = () => api<unknown[]>('/seller/inbox').then(r => setRequests(r.length), () => {}); get(); const x = setInterval(get, 60_000); return () => clearInterval(x) }, [me?.role])
  // Screens behind sign-in stay out of search results; public pages set their own metadata.
  // remember the language this person uses, so their emails come in it (not while staff act as them)
  useEffect(() => { if (me && me.lang && me.lang !== lang && !me.signedInAs && !me.viewingAs) api('/me/account', { method: 'PUT', body: { lang } }).catch(() => {}) }, [me?.lang])
  useEffect(() => { if (me && !/^\/(calendar|directory|terms|privacy|refunds|dispute-policy)/.test(hash)) applyMeta({ title: 'Nashr', description: PAGES['/'].description, noindex: true }) }, [me, hash])
  // After signing in, go back to where the visitor was, if that page is theirs to see; otherwise to their home.
  const signedIn = async () => {
    const m = await api<Me>('/me').catch(() => null)
    const next = takePlace()
    navigate(next && m && routesFor(m.role).some(([re]) => re.test(next.split('?')[0])) ? next : '/', true)
    setMe(m); resetLive()
  }
  if (location.pathname === '/reset') return <ResetPassword token={location.hash.slice(1)} onDone={() => { navigate('/sign-in', true); load() }} />
  if (location.pathname === '/invite') return <AcceptInvite token={location.hash.slice(1)} onDone={() => { navigate('/sign-in', true); load() }} />
  if (me === undefined) return null

  if (me === null) {
    const path = hash || '/'
    if (path === '/') return <GuestContext.Provider value={true}><GuestHeader path={path} menu={menu} setMenu={setMenu} /><Landing /><GuestTabs path={path} /></GuestContext.Provider>
    if (path === '/sign-in') return <Login onIn={signedIn} />
    if (path === '/request-access') return <RequestAccess />
    if (path === '/forgot') return <ForgotPassword />
    const hit = GUEST.map(([re, page]) => [path.match(re), page] as const).find(([m]) => m)
    // A private page (campaigns, bookings, a deal link from an email): sign in, then come straight back to it.
    if (!hit) { rememberPlace(); return <Login onIn={signedIn} note="Sign in to see this page. You'll come straight back to it." /> }
    return (
      <GuestContext.Provider value={true}>
        <GuestHeader path={path} menu={menu} setMenu={setMenu} />
        <Suspense fallback={<main><p className="muted">{t("Loading…")}</p></main>}>{hit[1](hit[0]![1])}</Suspense>
        <GuestTabs path={path} />
      </GuestContext.Provider>
    )
  }

  const seller = me.role === 'seller', staff = me.role === 'admin' || me.role === 'founder'
  const home = staff ? '/admin' : seller ? '/home' : '/dashboard'
  const path = hash === '/' ? home : hash
  if (path === '/sign-in' || path === '/request-access' || path === '/forgot') { queueMicrotask(() => navigate(home, true)); return null }

  const nav = NAV[staff ? 'admin' : seller ? 'seller' : 'buyer']
  const initials = me.company.name.split(' ').map(w => w[0]).slice(0, 2).join('')
  const signOut = async () => { await api('/auth/logout', { method: 'POST' }); navigate(''); setMe(null); resetLive() }
  const hit = routesFor(me.role).map(([re, page]) => [path.match(re), page] as const).find(([m]) => m)
  return (
    <div className={`shell ${mini ? 'min' : ''}`}>
      <aside className="side" aria-label={t('Menu')}>
        <div className="side-top"><Wordmark href={`${home}`} />
          <button type="button" className="side-toggle" onClick={toggleMini} aria-expanded={!mini} aria-label={mini ? t('Expand the menu') : t('Collapse the menu')} title={mini ? t('Expand the menu') : t('Collapse the menu')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={mini ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} /></svg></button></div>
        <nav className="nav side-nav" aria-label={t("Main")}>{nav.map(([p, l]) => <Fragment key={p}>
          {GROUP[staff ? 'admin' : me.role]?.[p] && <span className="side-group">{GROUP[staff ? 'admin' : me.role][p]}</span>}
          <a href={`${p}`} aria-current={isActive(path, p, seller) ? 'page' : undefined} className={isActive(path, p, seller) ? 'active' : ''} title={mini ? l : undefined}>
            <TabIcon path={p} /><span className="side-l">{l}</span>{p === '/athena' && <span className="soon">{t("soon")}</span>}{p === '/messages' && unread > 0 && <Badge n={unread} />}{p === '/inbox' && requests + (seller ? unread : 0) > 0 && <Badge n={requests + (seller ? unread : 0)} />}</a></Fragment>)}</nav>
        <div className="side-foot">
          <div className="side-me"><NameMenu name={me.company.name} sub={`${ROLE[me.role] ?? me.role}`} initials={initials} mini={mini} onSignOut={signOut}
            links={[...(seller ? [['/profile', t('Your business')]] : me.role === 'buyer' ? [['/company', t('Company')]] : []), ['/account', t('Your account')], ...(!staff ? [['/help', t('Help')]] : [])] as [string, string][]} />
            <Bell role={me.role} /></div>
        </div>
      </aside>
      <div className="shell-main">
      {me.signedInAs && <div className="viewbar acting" role="status">{t('{staff}, you are signed in as {user} of {company} until {time}. Every change is logged under your name.', { staff: me.signedInAs.staff, user: me.signedInAs.user, company: me.company.name, time: time(me.signedInAs.until) })}
        <button className="btn" onClick={async () => { const r = await api<{ companyId: string }>('/admin/sign-in-as', { method: 'DELETE' }); location.href = `/accounts/${r.companyId}` }}>{t('Back to Nashr')}</button></div>}
      {me.viewingAs && <div className="viewbar" role="status">{t('Viewing {name} as Nashr, read only. Every page you open is logged.', { name: me.company.name })}
        <button className="btn" onClick={async () => { await api('/admin/view-as', { method: 'DELETE' }); navigate(`/accounts/${me.viewingAs}`); location.reload() }}>{t("Stop viewing")}</button></div>}
      <header className={`topbar ${staff ? 'staff' : ''} ${menu ? 'open' : ''}`}>
        <button className="btn menu-btn" aria-label={t("Menu")} aria-expanded={menu} aria-controls="main-nav" onClick={() => setMenu(!menu)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d={menu ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg></button>
        <Wordmark href={`${home}`} />
        <nav className="nav" id="main-nav">{nav.map(([p, l]) => <a key={p} href={`${p}`} aria-current={isActive(path, p, seller) ? 'page' : undefined} className={isActive(path, p, seller) ? 'active' : ''}>
          {l}{p === '/athena' && <span className={t("soon")}>{t("soon")}</span>}{p === '/messages' && unread > 0 && <Badge n={unread} />}{p === '/inbox' && requests + (seller ? unread : 0) > 0 && <Badge n={requests + (seller ? unread : 0)} />}</a>)}
          <a href="/account" className={isActive(path, '/account') ? 'active' : ''}>{t('Your account')}</a>
          <a href="/" className="nav-signout" onClick={async e => { e.preventDefault(); await signOut() }}>{t("Sign out")}</a></nav>
        <div className="spacer" />
        <LangSwitch className="on-dark topbar-lang" />
        <Bell role={me.role} />
        <a className="avatar" href="/account" aria-label={t('Your account')}>{initials}</a>
      </header>
      {/* updated terms come first, except on the legal pages themselves (so they can be read); never for staff acting as someone */}
      {me.terms && !me.terms.accepted && !me.signedInAs && !me.viewingAs && !/^\/(terms|privacy|refunds|dispute-policy)$/.test(path)
        ? <TermsGate version={me.terms.version} onDone={load} />
        : hit ? <Suspense fallback={<main><p className="muted">{t("Loading…")}</p></main>}>{hit[1](hit[0]![1])}</Suspense> : <main className="nf"><span className="nf-code num" aria-hidden>404</span><h1>{t("Not found")}</h1><p className="muted">{t('This page does not exist, or it has moved.')}</p><a className="btn primary" href={`${home}`}>{t("Back to the start")}</a></main>}
      </div>
      {!staff && <nav className="tabbar" aria-label={t("Main")}>{TABS[me.role].map(p => nav.find(([q]) => q === p)!).map(([p, l]) => <a key={p} href={`${p}`} className={isActive(path, p, seller) ? 'active' : ''}
        aria-current={isActive(path, p, seller) ? 'page' : undefined}><TabIcon path={p} />{l}{p === '/messages' && unread > 0 && <Badge n={unread} />}{p === '/inbox' && requests + (seller ? unread : 0) > 0 && <Badge n={requests + (seller ? unread : 0)} />}</a>)}</nav>}
    </div>
  )
}

/** One header for every page a visitor sees, the landing page included, so the menu never changes under them. */
function GuestHeader({ path, menu, setMenu }: { path: string; menu: boolean; setMenu: (v: boolean) => void }) {
  return (
    <header className={`topbar ${menu ? 'open' : ''}`}>
      <button className="btn menu-btn" aria-label={t("Menu")} aria-expanded={menu} aria-controls="main-nav" onClick={() => setMenu(!menu)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d={menu ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg></button>
      <Wordmark href="/" />
      <nav className="nav" id="main-nav">{NAV.guest.slice(0, 4).map(([p, l]) => <a key={p} href={`${p}`} aria-current={isActive(path, p) ? 'page' : undefined} className={isActive(path, p) ? 'active' : ''}>{l}</a>)}
        <a href="/sign-in" className="nav-signout" onClick={rememberPlace}>{t("Sign in")}</a></nav>
      <div className="spacer" />
      <div className="guest-actions">
        <LangSwitch />
        <a className="signin" href="/sign-in" onClick={rememberPlace}>{t("Sign in")}</a>
        <a className="btn signal" href="/request-access">{t("Request access")}</a>
      </div>
    </header>
  )
}

/** Phones: visitors get the same bottom tab bar as buyers, with Sign in as the last tab. */
function GuestTabs({ path }: { path: string }) {
  // five tabs at most on a phone: the directory stays in the header menu
  return <nav className="tabbar" aria-label={t("Main")}>{NAV.guest.filter(([p]) => p !== '/directory').map(([p, l]) => <a key={p} href={`${p}`} className={isActive(path, p) ? 'active' : ''}
    onClick={p === '/sign-in' ? rememberPlace : undefined} aria-current={isActive(path, p) ? 'page' : undefined}><TabIcon path={p} />{l}</a>)}</nav>
}
