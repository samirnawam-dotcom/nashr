import { createRoot } from 'react-dom/client'
import { App, type Me } from './App'
import { api } from './api'
import { installNavigation } from './nav'
import { applyLang, isAr } from './i18n'
import './styles.css'
import './calendar/calendar.css'
import './system.css'

// Find out who is signed in before drawing, so a pre-rendered page (landing, legal) stays on screen instead of flashing.
applyLang()
// The pre-rendered page is English; an Arabic visitor sees nothing until the Arabic page is drawn, never the English flashing.
const root = document.getElementById('root')!
if (isAr) root.style.visibility = 'hidden'
installNavigation()
api<Me>('/me').then(m => m, () => null).then(me => { createRoot(root).render(<App initialMe={me} />); requestAnimationFrame(() => { root.style.visibility = '' }) })

// The service worker: alerts while Nashr is closed, and an offline page (web/public/sw.js). Not in development (Vite reloads).
if ('serviceWorker' in navigator && import.meta.env.PROD) addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
// The browser's "install" offer comes once, early: keep it for the Install button on the account page.
addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.nashrInstall = e as any; dispatchEvent(new Event('nashr-install')) })

