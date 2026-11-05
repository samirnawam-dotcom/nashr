import { createContext, useContext } from 'react'

/** True while nobody is signed in: pages show everything, and actions ask the visitor to sign in first. */
export const GuestContext = createContext(false)
export const useGuest = () => useContext(GuestContext)

const NEXT = 'nashr:next'
/** Remember where the visitor was, so signing in brings them straight back. */
export function rememberPlace() { try { sessionStorage.setItem(NEXT, location.hash) } catch { /* private mode: they start at home */ } }
export function takePlace() { try { const h = sessionStorage.getItem(NEXT); sessionStorage.removeItem(NEXT); return h } catch { return null } }

/** Shown where a form or action would be: one sentence and the two ways in. */
export function SignInPrompt({ to, compact }: { to: string; compact?: boolean }) {
  return (
    <div className={`signin-prompt ${compact ? 'compact' : ''}`} role="note">
      <p><b>Sign in to {to}.</b> {!compact && 'Nashr is invite-only for UAE brands, agencies and media outlets.'}</p>
      <div className="row-flex">
        <a className="btn primary" href="#/sign-in" onClick={rememberPlace}>Sign in</a>
        <a className="btn" href="#/request-access" onClick={rememberPlace}>Request access</a>
      </div>
    </div>
  )
}
