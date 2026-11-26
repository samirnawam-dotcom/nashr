import { createRoot } from 'react-dom/client'
import { TestBar } from './TestBar'
import { App, type Me } from './App'
import { api } from './api'
import { installNavigation } from './nav'
import { applyLang, isAr } from './i18n'
import './styles.css'
import './calendar/calendar.css'
import './system.css'
// brand fonts, self-hosted with font-display: swap (brand guide: Source Sans 3 for English, Readex Pro for Arabic; 400 and 600)
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/readex-pro/400.css'
import '@fontsource/readex-pro/600.css'
import './brand.css'
import './theme' // applies light or dark before the app renders

// Find out who is signed in before drawing, so a pre-rendered page (landing, legal) stays on screen instead of flashing.
applyLang()
// Installing Nashr from an Arabic page gives the app its Arabic name, description and shortcuts.
if (isAr) document.querySelector<HTMLLinkElement>('link[rel=manifest]')?.setAttribute('href', '/manifest-ar.webmanifest')
// The pre-rendered page is English; an Arabic visitor sees nothing until the Arabic page is drawn, never the English flashing.
const root = document.getElementById('root')!
if (isAr) root.style.visibility = 'hidden'
installNavigation()
// who is here, and whether the site is still behind Coming soon, before the first paint (no flash of the full site for a guest)
Promise.all([api<Me>('/me').then(m => m, () => null), api<{ prelaunch: boolean; testing?: boolean }>('/launch').then(r => r, () => ({ prelaunch: false, testing: false }))])
  .then(([me, launch]) => {
    createRoot(root).render(<>{launch.testing && !launch.prelaunch && <TestBar />}<App initialMe={me} initialSoon={!!launch.prelaunch} /></>)
    requestAnimationFrame(() => { root.style.visibility = '' })
  })

// The service worker: alerts while Nashr is closed, and an offline page (web/public/sw.js). Not in development (Vite reloads).
if ('serviceWorker' in navigator && import.meta.env.PROD) addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
// The browser's "install" offer comes once, early: keep it for the Install button on the account page.
addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.nashrInstall = e as any; dispatchEvent(new Event('nashr-install')) })

