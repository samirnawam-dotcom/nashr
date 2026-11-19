import { useSyncExternalStore } from 'react'

/*
 * Light or dark (brand guide: "Switch to the dark theme with data-theme="dark" on the page").
 * The person picks Light, Dark or Device (follow the phone or computer); the choice is kept in this browser.
 * /theme-init.js applies it before the first paint so a dark page never flashes white; this module keeps it in step after.
 */
export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const KEY = 'nashr:theme'
const listeners = new Set<() => void>()
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

function readPref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' }
}
let pref: ThemePref = typeof window !== 'undefined' ? readPref() : 'system'

const resolve = (p: ThemePref): Theme => p === 'system' ? (media?.matches ? 'dark' : 'light') : p

function apply() {
  if (typeof document === 'undefined') return
  const theme = resolve(pref), root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0B0C' : '#FFFFFF')
  listeners.forEach(l => l())
}

export function setThemePref(p: ThemePref) {
  pref = p
  try { p === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, p) } catch { /* private mode: this visit only */ }
  apply()
}

media?.addEventListener?.('change', () => { if (pref === 'system') apply() })
// another tab changed it
if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key === KEY) { pref = readPref(); apply() } })
apply()

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
/** The theme on screen now; the server render is always light. */
export const useTheme = () => useSyncExternalStore(subscribe, () => resolve(pref), (): Theme => 'light')
/** What the person chose: light, dark or device. */
export const useThemePref = () => useSyncExternalStore(subscribe, () => pref, (): ThemePref => 'system')
