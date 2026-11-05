import { useEffect, useState } from 'react'

/*
 * Real page addresses (/directory/gulf-news) instead of #/ fragments, so search engines see every public page.
 * Links stay plain <a href="/…">: one listener turns clicks on in-app links into history navigation (no reload),
 * while search engines and "open in new tab" use the real address. Old #/ links (bookmarks, emails) are redirected.
 */
const EVENT = 'nashr:navigate'

export function navigate(to: string, replace = false) {
  const path = to.replace(/^#/, '') || '/'
  if (path === location.pathname + location.search) return
  history[replace ? 'replaceState' : 'pushState'](null, '', path)
  dispatchEvent(new Event(EVENT))
}

/** The current page: path plus query, e.g. "/deals?status=open". */
export const currentPath = () => location.pathname + location.search

export function usePath() {
  const [p, set] = useState(currentPath)
  useEffect(() => {
    const f = () => set(currentPath())
    addEventListener('popstate', f); addEventListener(EVENT, f)
    return () => { removeEventListener('popstate', f); removeEventListener(EVENT, f) }
  }, [])
  return p
}

/** Once at start: old #/ addresses become real ones, and in-app link clicks stop reloading the page. */
export function installNavigation() {
  const fromHash = () => { if (location.hash.startsWith('#/')) { history.replaceState(null, '', location.hash.slice(1)); dispatchEvent(new Event(EVENT)) } }
  fromHash()
  addEventListener('hashchange', fromHash) // an old #/ link followed while already on the site
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || a.target || a.hasAttribute('download')) return
    const href = a.getAttribute('href')!
    if (!(href.startsWith('/') || href.startsWith('#/')) || href.startsWith('//') || href.startsWith('/api/') || href.startsWith('/invite')) return
    e.preventDefault()
    navigate(href)
  })
}
