const CACHE_NAME = 'night-city-notify-v6';

const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './app-config.js',
  './modules/auth.js',
  './icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
    } catch (e) {
      // A single 404 should not break the whole install; cache what we can.
      try {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(PRECACHE_URLS.map(async url => {
          try { await cache.add(url); } catch (_) { /* skip missing asset */ }
        }));
      } catch (_) { /* give up on precache, install still proceeds */ }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Never cache non-GET requests.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Cross-origin (Supabase / CDN) requests: network-only, never cached.
  if (!sameOrigin) {
    event.respondWith(fetch(req));
    return;
  }

  // Same-origin navigation/static GET: cache-first, then network (and cache the response).
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const response = await fetch(req);
      if (response && response.ok && (response.type === 'basic' || response.type === 'default')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, response.clone());
      }
      return response;
    } catch (e) {
      // Offline fallback for navigations.
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
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
