/* SignSphere service worker: lets the app, the hand-tracking models and the ISL sign pack
 * keep working with poor or no network after the first visit.
 * - Pages: network first, falling back to the cached app shell.
 * - Built assets, MediaPipe files, sign packs: cache first (they are versioned or large).
 * Supabase and other cross-origin requests are never cached. */
const VERSION = 'v1';
const SHELL = `signsphere-shell-${VERSION}`;
const ASSETS = `signsphere-assets-${VERSION}`;
const cacheFirst = (path) => path.startsWith('/assets/') || path.startsWith('/mediapipe/') || path.startsWith('/datasets/');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await shell.addAll(['/', '/manifest.webmanifest', '/icon.svg']);
      // Best effort: store every screen, the models and the sign pack for offline use.
      try {
        const list = await (await fetch('/precache.json', { cache: 'no-store' })).json();
        const assets = await caches.open(ASSETS);
        for (const path of list) {
          if (!cacheFirst(path) || (await assets.match(path, { ignoreVary: true }))) continue;
          try {
            const res = await fetch(path);
            if (res.ok && !(res.headers.get('content-type') || '').includes('text/html')) await assets.put(path, res);
          } catch {
            /* keep going; it will be cached when first used */
          }
        }
      } catch {
        /* no list (dev server) — assets are cached as they are used */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('signsphere-') && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});


self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/', { cacheName: SHELL, ignoreVary: true })),
    );
    return;
  }

  if (cacheFirst(url.pathname)) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req);
        const type = res.headers.get('content-type') || '';
        // Never cache the SPA fallback page served for a missing file.
        if (res.ok && !type.includes('text/html')) cache.put(req, res.clone());
        return res;
      }),
    );
  }

  // Anything else from this site: network, falling back to whatever we have cached.
  event.respondWith(fetch(req).catch(() => caches.match(req, { ignoreVary: true }).then((hit) => hit || Response.error())));
});
