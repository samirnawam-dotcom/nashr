import { useEffect, useState } from 'react'
import { api } from '../api'

/** The unread message count for the navigation badge: checked on every page change and once a minute. */
export function useUnread(enabled: boolean, path: string) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const get = () => api<{ count: number }>('/messages/unread').then(r => setN(r.count), () => {})
    get(); const tick = setInterval(() => document.visibilityState === 'visible' && get(), 60_000)
    return () => clearInterval(tick)
  }, [enabled, path])
  return n
}
