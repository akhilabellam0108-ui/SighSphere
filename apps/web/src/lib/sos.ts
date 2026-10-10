/**
 * SOS signs: a small set of emergency signs recognised fully offline, on the device.
 *
 * Why a separate, small set: recognition is far more reliable choosing among 10 signs than
 * among hundreds, and in an emergency a wrong answer is worse than none. The app answers
 * only among the SOS signs this person has examples for (or that a trained model knows),
 * and asks them to confirm before anything is sent. Nothing calls or texts on its own.
 */

import { asset } from './base.js';

export interface SosSign {
  /** Lexicon gloss (packages/gloss/lexicon/isl-core.json). */
  gloss: string;
  /** What the app shows big and speaks aloud. */
  message: string;
  /** What to offer next. */
  action: 'call-112' | 'call-108' | 'call-100' | 'call-101' | 'text-contacts' | 'show';
}

export const SOS_SIGNS: SosSign[] = [
  { gloss: 'HELP', message: 'I need help now. I am deaf.', action: 'text-contacts' },
  { gloss: 'EMERGENCY', message: 'This is an emergency. Please call 112.', action: 'call-112' },
  { gloss: 'AMBULANCE', message: 'Please call an ambulance.', action: 'call-108' },
  { gloss: 'DOCTOR', message: 'I need a doctor.', action: 'call-108' },
  { gloss: 'HOSPITAL', message: 'Please take me to the hospital.', action: 'call-108' },
  { gloss: 'PAIN', message: 'I am in pain.', action: 'show' },
  { gloss: 'MEDICINE', message: 'I need my medicine.', action: 'show' },
  { gloss: 'POLICE', message: 'Please call the police.', action: 'call-100' },
  { gloss: 'FIRE', message: 'There is a fire. Call the fire service.', action: 'call-101' },
  { gloss: 'WATER', message: 'I need water.', action: 'show' },
  { gloss: 'DEAF', message: 'I am deaf. Please write it down for me.', action: 'show' },
];

/** Takes needed before a sign is used. 3 works; 5 is noticeably steadier. */
export const SOS_MIN_TAKES = 3;
export const SOS_GOOD_TAKES = 5;

/**
 * Stricter than everyday recognition: in an emergency, "not sure, try again" is much
 * better than a confident wrong message.
 */
export const SOS_THRESHOLD = 0.7;

export const sosSign = (gloss: string) => SOS_SIGNS.find((s) => s.gloss === gloss);

export interface SosReadiness {
  /** Takes recorded per SOS sign. */
  takes: Record<string, number>;
  /** Signs with enough takes to be recognised. */
  ready: string[];
}

export function sosReadiness(counts: Record<string, number>, modelLabels: readonly string[] = []): SosReadiness {
  const takes = Object.fromEntries(SOS_SIGNS.map((s) => [s.gloss, counts[s.gloss] ?? 0]));
  const ready = SOS_SIGNS.map((s) => s.gloss).filter((g) => (takes[g] ?? 0) >= SOS_MIN_TAKES || modelLabels.includes(g));
  return { takes, ready };
}

/**
 * Accepts a recognised SOS sign only when it's clearly ahead: above the threshold AND well
 * clear of the runner-up, so two similar signs never trigger a wrong message.
 */
export function acceptSos(predictions: { label: string; confidence: number }[], ready: readonly string[]): SosSign | null {
  const [top, second] = predictions;
  if (!top || !ready.includes(top.label) || top.confidence < SOS_THRESHOLD) return null;
  if (second && top.confidence - second.confidence < 0.25) return null;
  return sosSign(top.label) ?? null;
}

export function telFor(action: SosSign['action']): string | null {
  const n = { 'call-112': '112', 'call-108': '108', 'call-100': '100', 'call-101': '101' }[action as string];
  return n ? `tel:${n}` : null;
}

/** Files the camera and hand tracking need. If they're cached, SOS works with no network. */
export const OFFLINE_FILES = [
  'mediapipe/wasm/vision_wasm_internal.wasm',
  'mediapipe/wasm/vision_wasm_internal.js',
  'mediapipe/models/hand_landmarker.task',
  'mediapipe/models/pose_landmarker_lite.task',
];

/** Checks this device has everything SOS recognition needs without a network. */
export async function sosOfflineStatus(): Promise<{ ready: boolean; missing: string[]; supported: boolean }> {
  if (typeof caches === 'undefined' || !('serviceWorker' in navigator)) return { ready: false, missing: OFFLINE_FILES, supported: false };
  const missing: string[] = [];
  for (const file of OFFLINE_FILES) {
    const hit = await caches.match(asset(file), { ignoreVary: true });
    if (!hit) missing.push(file);
  }
  return { ready: missing.length === 0, missing, supported: true };
}

/**
 * Downloads anything missing now, while there is a network. The service worker (public/sw.js)
 * stores every file under mediapipe/ as it passes through, so fetching is enough.
 */
export async function prepareOffline(): Promise<void> {
  await Promise.all(OFFLINE_FILES.map(async (file) => {
    if (await caches.match(asset(file), { ignoreVary: true })) return;
    await fetch(asset(file)).then((res) => res.arrayBuffer()).catch(() => undefined);
  }));
}
