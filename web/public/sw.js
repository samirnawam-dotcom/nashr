/*
 * Nashr's service worker: alerts that arrive while the app is closed (web push), opening the right page when one is tapped,
 * and a simple page when there is no connection. It never caches the API or anyone's data.
 */
const OFFLINE = '/offline.html'

self.addEventListener('install', e => { e.waitUntil(caches.open('nashr-v1').then(c => c.addAll([OFFLINE, '/icon-192.png']))); self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()) })

// Pages: the network first; with no connection, the offline page. Everything else goes straight to the network.
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)))
})

self.addEventListener('push', e => {
  let m = { title: 'Nashr', body: '', url: '/', tag: undefined }
  try { m = { ...m, ...e.data.json() } } catch { /* an empty push: show the default */ }
  e.waitUntil(self.registration.showNotification(m.title, { body: m.body, tag: m.tag, renotify: !!m.tag, icon: '/icon-192.png', badge: '/icon-192.png',
    data: { url: m.url }, lang: /[؀-ۿ]/.test(m.body) ? 'ar' : 'en', dir: 'auto' }))
})

// Tapping an alert opens its page: in a Nashr window already open, or a new one.
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/', self.location.origin)
  const target = url.origin === self.location.origin ? url.href : self.location.origin + '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).origin === self.location.origin)
    if (open) return open.focus().then(c => c.navigate(target))
    return self.clients.openWindow(target)
  }))
})
