/**
 * Hand-written precache service worker.
 *
 * vite-plugin-pwa is deliberately not used: the whole app is a few hundred KB,
 * the worker it would generate is about this long anyway, and its base-path
 * handling is a known rough edge for GitHub Pages project sites -- which is
 * exactly the configuration this ships in.
 */
const VERSION = 'fox-v1'
const SCOPE = new URL('./', self.registration.scope).pathname

self.addEventListener('install', (event) => {
  // Take over immediately: a half-updated game is worse than a brief reload.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (!url.pathname.startsWith(SCOPE)) return

  // Navigations: network first, so a deploy is picked up promptly, with the
  // cached shell as the offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(SCOPE))),
    )
    return
  }

  // Everything else is content-hashed by Vite, so cache-first is safe and fast.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
