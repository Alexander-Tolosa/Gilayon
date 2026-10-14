/*
  Himsog service worker: keeps the app shell cached so the app opens even when the
  network or the clinic server is down. Records themselves live on the clinic server;
  this only caches the screens. Network first for pages, cache first for built assets.
*/
const CACHE = 'himsog-shell-v1'
const SHELL = ['/', '/clinic', '/waiting', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  if (req.mode === 'navigate') {
    // Single-page app: any route falls back to the cached shell when offline.
    event.respondWith(fetch(req).then((res) => (caches.open(CACHE).then((c) => c.put('/', res.clone())), res)).catch(() => caches.match('/')))
    return
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
