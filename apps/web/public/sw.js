/* SignSphere service worker: lets the app, the hand-tracking models and the ISL sign pack
 * keep working with poor or no network after the first visit.
 * - Pages: network first, falling back to the cached app shell.
 * - Built assets, MediaPipe files, sign packs: cache first (they are versioned or large).
 * Supabase and other cross-origin requests are never cached.
 * Paths are relative to the scope, so this works at / and at /SighSphere/ alike. */
const VERSION = 'v2';
const SHELL = `signsphere-shell-${VERSION}`;
const ASSETS = `signsphere-assets-${VERSION}`;
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/" or "/SighSphere/"
const at = (path) => SCOPE + path;
const cacheFirst = (pathname) => ['assets/', 'mediapipe/', 'datasets/'].some((dir) => pathname.startsWith(at(dir)));
const htmlLike = (res) => (res.headers.get('content-type') || '').includes('text/html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await shell.addAll([at(''), at('manifest.webmanifest'), at('icon.svg')]);
      // Best effort: store every screen, the models and the sign pack for offline use.
      try {
        const list = await (await fetch(at('precache.json'), { cache: 'no-store' })).json();
        const assets = await caches.open(ASSETS);
        for (const rel of list) {
          const path = at(rel);
          if (!cacheFirst(path) || (await assets.match(path, { ignoreVary: true }))) continue;
          try {
            const res = await fetch(path);
            if (res.ok && !htmlLike(res)) await assets.put(path, res);
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
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // GitHub Pages answers deep links with 404.html (the app) and status 404: still the app.
          if (res.ok || (res.status === 404 && htmlLike(res))) {
            if (res.ok) caches.open(SHELL).then((c) => c.put(at(''), res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(at(''), { cacheName: SHELL, ignoreVary: true })),
    );
    return;
  }

  if (cacheFirst(url.pathname)) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req);
        // Never cache the SPA fallback page served for a missing file.
        if (res.ok && !htmlLike(res)) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Anything else from this site: network, falling back to whatever we have cached.
  event.respondWith(fetch(req).catch(() => caches.match(req, { ignoreVary: true }).then((hit) => hit || Response.error())));
});
