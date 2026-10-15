/*
  Gilayon service worker: keeps the app shell cached so the app opens even when the
  network or the clinic server is down. Records themselves live on the clinic server;
  this only caches the screens. Network first for pages, cache first for built assets. /api/ is never cached.
*/
const CACHE = 'himsog-shell-v4'
const SHELL = ['/', '/clinic', '/waiting', '/manifest.webmanifest', '/favicon.svg', '/logo.png', '/icon-192.png', '/icon-512.png', '/icon-maskable.png']

// Cache the page shell, each main screen's HTML (the payload names the route, so one shell is not
// enough), and every script/style the HTML names, including those only listed in its data payload.
const SCREENS = ['/clinic', '/clinic/login', '/clinic/checkin', '/clinic/queue', '/clinic/patients', '/clinic/doctor', '/clinic/documents', '/clinic/report', '/clinic/audit', '/clinic/settings', '/waiting']

async function precache() {
  const c = await caches.open(CACHE)
  await c.addAll(SHELL).catch(() => undefined)
  const assets = new Set()
  for (const path of ['/', ...SCREENS]) {
    try {
      const res = await fetch(path, { cache: 'no-store' })
      if (!res.ok) continue
      await c.put(path, res.clone())
      const html = await res.text()
      for (const m of html.matchAll(/(?:\/_next\/)?(static\/[A-Za-z0-9_\/.~%-]+\.(?:js|css|woff2?))/g)) assets.add('/_next/' + m[1])
    } catch {
      /* offline during install: runtime caching still fills in */
    }
  }
  await Promise.all([...assets].map((u) => c.add(u).catch(() => undefined)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
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
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  // Records come from the clinic server and must never be served from a cache (stale, or another person's).
  if (url.pathname.startsWith('/api/')) return
  if (req.mode === 'navigate') {
    // Single-page app: any route falls back to the cached shell when offline.
    // Network first. A visited screen is kept under its own URL; anything else falls back to the shell.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match('/clinic'))
            .then((hit) => hit || caches.match('/')),
        ),
    )
    return
  }
  event.respondWith(
    // Built files have content hashes in their names; ignoring a ?dpl=... style query is safe and
    // lets the precached copy answer the request.
    caches.match(req, { ignoreSearch: url.pathname.startsWith('/_next/static/') }).then(
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
