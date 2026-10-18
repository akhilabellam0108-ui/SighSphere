/**
 * Sends a short report to the SignSphere team when the app breaks (Admin → Errors):
 * the error message, where in the code, which screen, app version and platform.
 * Never the person's words, recordings, email or login id.
 */
import type { Backend } from './backend.js';

const VERSION = ((import.meta.env['VITE_APP_VERSION'] as string | undefined) ?? 'dev').slice(0, 12);
const MAX_PER_SESSION = 10;

/** Errors that are not SignSphere bugs: browser extensions, being offline, harmless browser noise. */
const IGNORE = [/ResizeObserver loop/i, /failed to fetch|network ?error|load failed|networkerror/i, /^Script error\.?$/i, /AbortError/i, /NotAllowedError/i];

let backendRef: Backend | null = null;
let sent = 0;
const seen = new Set<string>();

export function platform(): string {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (cap?.isNativePlatform?.()) return `${cap.getPlatform?.() ?? 'native'}-app`;
  return window.matchMedia?.('(display-mode: standalone)').matches ? 'installed-web-app' : 'web';
}

/** Keeps only the code location of each stack line, so nothing typed by the person can leak in. */
export function cleanStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack
    .split('\n')
    .slice(0, 12)
    .map((line) => line.replace(/https?:\/\/[^/\s)]+/g, '').trim())
    .join('\n')
    .slice(0, 4000);
}

export function report(error: unknown, extra = ''): void {
  if (!backendRef || sent >= MAX_PER_SESSION) return;
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
  const message = `${err.name && !err.message.startsWith(err.name) ? `${err.name}: ` : ''}${err.message}${extra ? ` (${extra})` : ''}`.slice(0, 500);
  if (IGNORE.some((re) => re.test(message))) return;
  const stack = cleanStack(err.stack);
  if (stack?.includes('-extension://')) return;
  const key = `${message}|${stack?.split('\n')[1] ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;
  void backendRef.reportError({ message, stack, page: location.pathname.replace(/\/[0-9a-f-]{36}/g, '/:id'), appVersion: VERSION, platform: platform() });
}

/** Call once at start-up. */
export function installErrorReporting(backend: Backend): void {
  if (backendRef) return;
  backendRef = backend;
  window.addEventListener('error', (event) => report(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => report(event.reason, 'unhandled promise'));
}
