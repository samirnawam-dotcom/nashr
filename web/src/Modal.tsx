import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * A pop-up that blocks the page, as the browser's own modal <dialog> (Modern Web Guidance: dialog). The browser makes the
 * page behind it inert, keeps keyboard focus inside, closes it on Esc and the phone's back gesture, and puts it above
 * everything (the top layer). The dialog fills the window and holds the overlay layer (`scrim`), so every pop-up keeps
 * its own look: drawers on the reading end, panels centred. A click on the overlay itself closes it, as before.
 */
export function Modal({ onClose, scrim = 'scrim', label, labelledBy, children }: {
  onClose: () => void; scrim?: string; label?: string; labelledBy?: string; children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose); close.current = onClose
  useLayoutEffect(() => {
    const d = ref.current!, before = document.activeElement as HTMLElement | null
    if (!d.open) d.showModal()
    return () => {
      // closed by the page (state), not by the browser: close it ourselves so focus goes back where it was
      if (d.open) d.close()
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => {
    const d = ref.current!
    // Esc / back gesture: the browser asks to close; the page decides by unmounting it
    const cancel = (e: Event) => { e.preventDefault(); close.current() }
    d.addEventListener('cancel', cancel); return () => d.removeEventListener('cancel', cancel)
  }, [])
  return <dialog ref={ref} className="nd" aria-label={label} aria-labelledby={labelledBy}>
    <div className={scrim} onClick={e => { if (e.target === e.currentTarget) close.current() }}>{children}</div>
  </dialog>
}
