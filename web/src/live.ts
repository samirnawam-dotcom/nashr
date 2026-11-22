import { useEffect, useRef } from 'react'

/*
 * One live connection per tab (Server-Sent Events, /api/events). The server only says "something changed" (your bell, or a slot id);
 * the page then fetches what it needs as usual. EventSource reconnects by itself; if the browser has none, pages keep polling.
 */
type Kind = 'notification' | 'slot'
const listeners: Record<Kind, Set<(data: any) => void>> = { notification: new Set(), slot: new Set() }
let source: EventSource | null = null

function connect() {
  if (source || typeof EventSource === 'undefined') return startPolling()
  source = new EventSource('/api/events')
  for (const k of Object.keys(listeners) as Kind[])
    source.addEventListener(k, e => { let d: any = {}; try { d = JSON.parse((e as MessageEvent).data) } catch { /* empty */ } listeners[k].forEach(fn => fn(d)) })
  // Some hosts (shared hosting behind Apache) hold the stream back. If it has not opened in 10 seconds, or keeps failing,
  // pages also refresh every 30 seconds while they are on screen, so bids and the bell still move on their own.
  const s = source; let fails = 0
  setTimeout(() => { if (source === s && s.readyState !== EventSource.OPEN) startPolling() }, 10_000)
  s.addEventListener('error', () => { if (++fails >= 3) startPolling() })
  s.addEventListener('open', () => { fails = 0 })
}

let poll: ReturnType<typeof setInterval> | null = null
function startPolling() {
  if (poll || typeof window === 'undefined') return
  poll = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    for (const k of Object.keys(listeners) as Kind[]) listeners[k].forEach(fn => fn({ poll: true }))
  }, 30_000)
}

/** Call `fn` whenever the server signals `kind` (debounced, so a burst of changes is one refresh; `all` holds every signal in the burst). */
export function useLive(kind: Kind, fn: (last: any, all: any[]) => void, wait = 400) {
  const ref = useRef(fn); ref.current = fn
  useEffect(() => {
    connect()
    let timer: ReturnType<typeof setTimeout> | null = null, burst: any[] = []
    const h = (d: any) => { burst.push(d); if (timer) clearTimeout(timer)
      timer = setTimeout(() => { const all = burst; burst = []; timer = null; ref.current(all[all.length - 1], all) }, wait) }
    listeners[kind].add(h)
    return () => { listeners[kind].delete(h); if (timer) clearTimeout(timer) }
  }, [kind, wait])
}

/** Reconnect after the person signs in or out (the stream carries their company's bell). */
export function resetLive() {
  source?.close(); source = null
  if (Object.values(listeners).some(l => l.size)) connect()
}
