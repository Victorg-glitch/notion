const CACHE_NAME = 'night-city-v0.4.67';

// Only cache truly static assets (icons/manifest). App shell (index.html, app.js,
// style.css) uses network-first so updates are visible immediately.
const STATIC_ASSETS = [
  './icon.svg',
  './manifest.webmanifest',
  './assets/night-city-banner.svg',
  './assets/district-map.svg',
  './assets/icon.svg',
  './assets/nc-icons.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Cross-origin (Supabase / fonts / CDN): always go to network.
  if (!sameOrigin) {
    event.respondWith(fetch(req));
    return;
  }

  // Navigation requests (index.html): network-first so users always see the latest version.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(req);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, response.clone());
        }
        return response;
      } catch (e) {
        const cached = await caches.match(req) || await caches.match('./index.html');
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  // Static icons / manifest: cache-first (these never change without a version bump).
  const isStaticAsset = STATIC_ASSETS.some(a => url.pathname.endsWith(a.replace('./', '/')));
  if (isStaticAsset) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const response = await fetch(req);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, response.clone());
      }
      return response;
    })());
    return;
  }

  // All other same-origin requests (app.js?v=54, style.css?v=54, etc.):
  // network-first so versioned assets are always fresh.
  event.respondWith((async () => {
    try {
      const response = await fetch(req);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, response.clone());
      }
      return response;
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw e;
    }
  })());
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Night City';
  const options = {
    body: payload.body || 'Novo alerta do sistema.',
    tag: payload.tag || 'night-city-alert',
    renotify: true,
    data: { url: payload.url || './' },
    requireInteraction: !!payload.requireInteraction
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(targetUrl);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
