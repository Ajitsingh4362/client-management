// Zentrycs — service worker
// Goal: fast app-shell loading + basic offline support for the UI shell.
// IMPORTANT: /api/* requests are NEVER cached — client/deal/payment data must
// always come straight from the network so nothing stale or wrong is shown.

const CACHE_NAME = 'zentrycs-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/assets/logo.png',
  '/assets/logo-mark.png',
  '/assets/apple-touch-icon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never touch API calls — always go to the network, never cache.
  if (url.pathname.startsWith('/api/')) return;

  // Only handle same-origin GET requests for the app shell.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cache a copy of newly-seen same-origin static assets for next time.
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
