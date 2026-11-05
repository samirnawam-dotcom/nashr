import { createRoot } from 'react-dom/client'
import { App, type Me } from './App'
import { api } from './api'
import { installNavigation } from './nav'
import './styles.css'
import './calendar/calendar.css'

// Find out who is signed in before drawing, so a pre-rendered page (landing, legal) stays on screen instead of flashing.
installNavigation()
api<Me>('/me').then(m => m, () => null).then(me => createRoot(document.getElementById('root')!).render(<App initialMe={me} />))
