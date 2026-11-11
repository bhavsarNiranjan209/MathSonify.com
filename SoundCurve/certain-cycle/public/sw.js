/**
 * MathSonify service worker — the offline safety net.
 *
 * Why this exists: when the network is gone the browser cannot reach the
 * site at all, so a normal page can never load. This worker caches the
 * site's shell on the first visit and, when a navigation fails, serves the
 * custom offline page (`/offline/`) instead of the browser's default
 * "no internet" screen — under the URL the visitor actually wanted, so
 * "Try again" is just a reload.
 *
 * Deliberately lightweight — no PWA framework, no precache manifest:
 *
 *   - install: precache the offline page, the home page, the Studio and
 *     the Guess page (the two the offline page promises still work), then
 *     `skipWaiting()` so an update applies without a second visit.
 *   - activate: drop every cache from an older version, then
 *     `clients.claim()` so the new worker controls open tabs.
 *   - fetch, navigations: network first, offline page on failure. A 404
 *     is a real response, not a failure, so the custom 404 still shows.
 *   - fetch, same-origin assets: stale-while-revalidate, so pages visited
 *     once keep working offline.
 *   - fetch, Google Fonts: cache-first. The offline page's typography
 *     (Instrument Serif / JetBrains Mono / Inter) comes from Google
 *     Fonts, so the worker caches the stylesheet and the font files on
 *     first use — the offline page renders in its real fonts with no
 *     network. These are the ONLY cross-origin hosts the worker touches.
 *
 * Bump CACHE when the offline page changes, or visitors keep the old one.
 */
const CACHE = 'mathsonify-v2';
const FONT_CACHE = 'mathsonify-fonts-v1';
const OFFLINE_URL = '/offline/';
const PRECACHE = [OFFLINE_URL, '/', '/studio', '/guess', '/favicon.jpeg'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // One URL failing (a flaky first visit) must not fail the install.
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE && key !== FONT_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Google Fonts — the offline page's typography. Cache-first: serve the
  // cached stylesheet / font file, fetch and store on first use. These
  // are the only cross-origin hosts the worker ever touches.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(request, { cacheName: FONT_CACHE }).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
              const copy = response.clone();
              caches.open(FONT_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
      }),
    );
    return;
  }

  // Everything else cross-origin keeps its normal behaviour.
  if (url.origin !== self.location.origin) return;
  // Never cache the worker itself through its own handler.
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    // Navigations are network-first and never cached: a stale page must
    // never be served as if it were fresh. Only a network failure falls
    // back to the offline page.
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL, { ignoreSearch: true })),
    );
    return;
  }

  // Same-origin assets: serve what we have, refresh in the background.
  // Query-string requests (connectivity probes, cache-busters) are never
  // stored — each one is unique and would pile up in the cache.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic' && !url.search) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
