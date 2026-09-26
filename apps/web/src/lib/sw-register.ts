/**
 * Service worker registration + update prompts. Production builds only: in dev, Vite's
 * module graph and a caching worker fight each other.
 */

export const SW_UPDATE_EVENT = 'signsphere:sw-update';
export const SW_READY_EVENT = 'signsphere:sw-offline-ready';

let waiting: ServiceWorker | null = null;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const announce = (worker: ServiceWorker) => {
          waiting = worker;
          window.dispatchEvent(new Event(SW_UPDATE_EVENT));
        };
        if (registration.waiting && navigator.serviceWorker.controller) announce(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state !== 'installed') return;
            if (navigator.serviceWorker.controller) announce(installing);
            // First install: the app is now cached and will load offline.
            else window.dispatchEvent(new Event(SW_READY_EVENT));
          });
        });
      })
      .catch(() => {
        /* registration failure just means no offline support; the app still works */
      });

    // Reload only when an *update* takes over. On the very first install the worker also
    // claims the page, and reloading then would interrupt someone for no reason.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    });
  });
}

/** Activate the waiting worker; the controllerchange listener then reloads the page. */
export function applyUpdate(): void {
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}
