/**
 * Which motion the avatar plays for a gloss.
 *
 * Priority: the newest motion recorded on this device (the user's own signing, or a
 * signer they recorded) → an installed dataset motion (INCLUDE). Decoded clips are cached.
 */

import { decodeClip, encodeClip, type MotionClip } from './motion.js';
import { addMotion, deleteMotion, getMotions, type StoredMotion } from './storage.js';

export const MOTIONS_CHANGED = 'signsphere:motions-changed';

let index: Promise<Map<string, StoredMotion>> | null = null;
const decoded = new Map<number, MotionClip>();

function rank(motion: StoredMotion): number {
  return (motion.source === 'recorded' ? 1e15 : 0) + motion.createdAt;
}

function buildIndex(): Promise<Map<string, StoredMotion>> {
  index ??= getMotions()
    .then((all) => {
      const best = new Map<string, StoredMotion>();
      for (const motion of all) {
        const current = best.get(motion.gloss);
        if (!current || rank(motion) > rank(current)) best.set(motion.gloss, motion);
      }
      return best;
    })
    .catch(() => new Map());
  return index;
}

export function invalidateMotions(): void {
  index = null;
  decoded.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MOTIONS_CHANGED));
}

export async function glossesWithMotion(): Promise<Set<string>> {
  return new Set((await buildIndex()).keys());
}

export async function motionFor(gloss: string): Promise<MotionClip | null> {
  const stored = (await buildIndex()).get(gloss.toUpperCase());
  if (!stored || stored.id === undefined) return null;
  const cached = decoded.get(stored.id);
  if (cached) return cached;
  try {
    const clip = decodeClip(stored.clip);
    decoded.set(stored.id, clip);
    return clip;
  } catch {
    return null;
  }
}

export async function motionSource(gloss: string): Promise<string | null> {
  return (await buildIndex()).get(gloss.toUpperCase())?.source ?? null;
}

export async function saveMotion(gloss: string, clip: MotionClip, source = 'recorded'): Promise<void> {
  if (clip.frames.length < 4) return;
  await addMotion({ gloss: gloss.toUpperCase(), source, createdAt: Date.now(), clip: encodeClip(clip) });
  invalidateMotions();
}

export async function removeMotionsFromSource(source: string): Promise<number> {
  const all = await getMotions();
  const mine = all.filter((motion) => motion.source === source && motion.id !== undefined);
  for (const motion of mine) await deleteMotion(motion.id as number);
  invalidateMotions();
  return mine.length;
}
