/**
 * Offline readiness for sign recognition.
 *
 * The app shell and every screen are precached by the service worker. Sign recognition also
 * needs MediaPipe's runtime and two model files (~15 MB), which the service worker caches the
 * first time a camera screen loads them. `prepareRecognitionOffline()` triggers that download
 * on purpose — on good Wi-Fi, before travelling — instead of leaving it to chance.
 */

import { LandmarkTracker } from './landmarks.js';

export const RUNTIME_CACHE = 'signsphere-runtime-v1';

export interface OfflineStatus {
  /** A service worker controls the page (production builds only). */
  appCached: boolean;
  /** Hand model, pose model and WASM runtime are in the runtime cache. */
  recognitionCached: boolean;
  /** The browser promised not to evict our storage under pressure. */
  persistent: boolean | null;
}

export async function getOfflineStatus(): Promise<OfflineStatus> {
  const appCached = typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);
  let recognitionCached = false;
  try {
    if (typeof caches !== 'undefined' && (await caches.has(RUNTIME_CACHE))) {
      const keys = (await (await caches.open(RUNTIME_CACHE)).keys()).map((request) => request.url);
      const has = (part: string) => keys.some((url) => url.includes(part));
      recognitionCached = has('hand_landmarker') && has('pose_landmarker') && has('.wasm');
    }
  } catch {
    recognitionCached = false;
  }
  let persistent: boolean | null = null;
  try {
    persistent = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    persistent = null;
  }
  return { appCached, recognitionCached, persistent };
}

/**
 * Load the tracker once so its files pass through (and are cached by) the service worker,
 * and ask the browser to keep our storage. Needs a connection; throws a readable error.
 */
export async function prepareRecognitionOffline(): Promise<OfflineStatus> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* optional */
  }
  const tracker = new LandmarkTracker({ handsOnly: false });
  try {
    await tracker.init();
  } catch {
    throw new Error('Could not download the recognition models. Connect to the internet and try again.');
  } finally {
    tracker.close();
  }
  return getOfflineStatus();
}
