import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * A menu or panel that opens from a button, as the browser's own popover (Modern Web Guidance: dialog, Rule 3:
 * menus and dropdowns are popovers, not dialogs). The button names its panel (popovertarget), so the browser opens and closes it,
 * closes it on a click outside and on Esc, and keeps it above everything (no clipping by a sticky bar or a scrolling box).
 * The panel sits under its button, kept inside the window, at the reading end when `align` is 'end'.
 */
export function usePop({ align = 'start', gap = 8, onOpen }: { align?: 'start' | 'end'; gap?: number; onOpen?: () => void } = {}) {
  const id = 'pop' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const btn = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const opened = useRef(onOpen); opened.current = onOpen
  const place = useCallback(() => {
    const b = btn.current, p = panel.current
    if (!b || !p) return
    const r = b.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight, rtl = document.dir === 'rtl'
    const atEnd = (align === 'end') !== rtl // 'end' is the right in English, the left in Arabic
    let left = atEnd ? r.right - w : r.left
    left = Math.max(8, Math.min(left, innerWidth - w - 8))
    let top = r.bottom + gap
    if (top + h > innerHeight - 8 && r.top - gap - h > 8) top = r.top - gap - h // no room below: open upwards
    p.style.left = `${Math.round(left)}px`; p.style.top = `${Math.round(top)}px`
  }, [align, gap])
  useEffect(() => {
    const p = panel.current
    if (!p) return
    const toggle = (e: Event) => {
      const now = (e as ToggleEvent).newState === 'open'
      setOpen(now)
      if (now) { place(); opened.current?.() }
    }
    p.addEventListener('toggle', toggle); return () => p.removeEventListener('toggle', toggle)
  }, [place])
  useEffect(() => {
    if (!open) return
    // placed again once its content has drawn (its real size), and whenever that size or the page moves
    const ro = new ResizeObserver(place); if (panel.current) ro.observe(panel.current)
    addEventListener('resize', place); addEventListener('scroll', place, true)
    return () => { ro.disconnect(); removeEventListener('resize', place); removeEventListener('scroll', place, true) }
  }, [open, place])
  const hide = useCallback(() => { try { panel.current?.hidePopover() } catch { /* already closed */ } }, [])
  const show = useCallback(() => { try { panel.current?.showPopover() } catch { /* already open */ } }, [])
  return {
    open, hide, show,
    button: { ref: btn, popoverTarget: id, 'aria-expanded': open, 'aria-controls': id } as const,
    panel: { ref: panel, id, popover: 'auto' as const },
  }
}
