/*
 * SignSphere service worker.
 *
 * This is a TEMPLATE. The build (see vite.config.ts → signsphereServiceWorker) replaces
 * the two placeholders below and emits the result as /sw.js:
 *   __SW_VERSION__   a hash of the build's file list, so every deploy gets a fresh cache
 *   __SW_PRECACHE__  every file in the build: HTML, JS chunks, CSS, fonts, icons
 *
 * Strategy
 *   - Install: precache the whole app shell, including every lazily loaded screen chunk,
 *     so any route opens offline — Emergency above all.
 *   - Navigations: network first (fresh deploys win), falling back to the cached
 *     index.html, which the client router then renders for whatever URL was asked for.
 *   - Built assets: cache first. Their filenames are content-hashed, so they never change.
 *   - MediaPipe runtime + models (jsDelivr, Google Storage) and signer clips: cache on
 *     first use, then serve from cache. After one online visit to a camera screen, sign
 *     recognition works offline too.
 *   - Everything else (speech APIs, maps): straight to the network, never cached.
 *
 * Updates wait for the user: the page shows "new version ready → Reload", which posts
 * SKIP_WAITING. Nothing reloads under someone mid-conversation.
 */

const VERSION = '__SW_VERSION__';
const PRECACHE = `signsphere-precache-${VERSION}`;
const RUNTIME = 'signsphere-runtime-v1';
const PRECACHE_URLS = __SW_PRECACHE__;

const RUNTIME_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      // cache: 'reload' bypasses the HTTP cache so a deploy never precaches stale files.
      cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('signsphere-precache-') && key !== PRECACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function fromNetworkOrShell(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cache = await caches.open(PRECACHE);
    return (await cache.match('/index.html', { ignoreVary: true })) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  // Opaque (no-cors) responses are cacheable too; only skip real errors.
  if (response.ok || response.type === 'opaque') {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(fromNetworkOrShell(request));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/clips/')) {
      event.respondWith(cacheFirst(request, RUNTIME));
      return;
    }
    // ignoreVary: hosts often send `Vary: Origin`, and module scripts are requested with an
    // Origin header while the precache was filled without one. For our own content-hashed
    // files the variant cannot differ, so a strict Vary match would only break offline use.
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request)),
    );
    return;
  }

  if (RUNTIME_HOSTS.includes(url.hostname) && url.pathname.includes('mediapipe')) {
    event.respondWith(cacheFirst(request, RUNTIME));
  }
});
