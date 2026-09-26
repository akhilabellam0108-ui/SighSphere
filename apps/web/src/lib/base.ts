/**
 * Where the app is hosted. '/' locally; '/SighSphere/' on GitHub Pages. Every file the app
 * loads by URL goes through `asset()` so the same build works at either address.
 */
export const BASE = import.meta.env.BASE_URL;

export function asset(path: string): string {
  return BASE + path.replace(/^\/+/, '');
}

/** Full address of a screen in this app, e.g. for e-mail links and QR codes. */
export function appUrl(path = ''): string {
  return new URL(asset(path), window.location.origin).toString();
}
