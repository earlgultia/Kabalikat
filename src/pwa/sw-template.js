/* global self, caches, fetch, URL, __PRECACHE_URLS__ */
const CACHE_NAME = 'kabalikat-app-v2'
const PRECACHE_URLS = __PRECACHE_URLS__

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.filter((name) => name.startsWith('kabalikat-app-') && name !== CACHE_NAME).map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || request.headers.has('range')) return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) return
  if (/^\/(?:auth|rest|storage|realtime)\/v1(?:\/|$)/.test(requestUrl.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put('/index.html', response.clone())
        }
        return response
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/offline.html'))
      }
    })())
    return
  }

  if (requestUrl.pathname.startsWith('/assets/') || requestUrl.pathname.startsWith('/icons/') || requestUrl.pathname === '/manifest.webmanifest') {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    })())
  }
})
