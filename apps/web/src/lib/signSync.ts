/**
 * Keeps recorded signs in step across a login's devices.
 *
 * A sign recorded on the Record screen is saved on this device first (so it works at once,
 * offline too) and queued; the queue uploads whenever there is a connection. Signs recorded
 * on the user's other devices are downloaded into this device's storage, where Sign → Text
 * and the 3D avatar use them like any other recording.
 *
 * Only the ids live in localStorage; the recording itself stays in IndexedDB until upload.
 */

import { getBackend, type CloudSign } from './backend.js';
import { FEATURE_VERSION, WINDOW_DIM } from './features.js';
import { removeMotionById, saveEncodedMotion } from './motionLibrary.js';
import { addSample, deleteSample, getMotion, getSample, getSamples } from './storage.js';

const OUTBOX_KEY = 'signsphere.sign-outbox.v1';
const LINKS_KEY = 'signsphere.sign-links.v1';
export const SIGNS_SYNCED = 'signsphere:signs-synced';

interface Link {
  sampleId: number;
  motionId: number | null;
  accountId: string | null;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota: ignore */
  }
}
const outbox = () => read<string[]>(OUTBOX_KEY, []);
const links = () => read<Record<string, Link>>(LINKS_KEY, {});
function changed(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SIGNS_SYNCED));
}

/** Recordings waiting to upload. */
export function pendingSigns(): number {
  return outbox().length;
}

/** Called by the Record screen right after saving a sign on this device. */
export function queueSign(cloudId: string, link: Link): void {
  write(LINKS_KEY, { ...links(), [cloudId]: link });
  write(OUTBOX_KEY, [...new Set([...outbox(), cloudId])]);
  changed();
  void flushSigns();
}

let flushing: Promise<void> | null = null;

/** Upload queued recordings. Safe to call any time; failures stay queued. */
export function flushSigns(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const backend = getBackend();
    if (backend.mode !== 'cloud' || !(await backend.getUser())) return;
    const queue = outbox();
    if (queue.length === 0) return;
    const map = links();
    const ready: CloudSign[] = [];
    const gone: string[] = [];
    for (const id of queue) {
      const link = map[id];
      const sample = link ? await getSample(link.sampleId) : undefined;
      if (!link || !sample) {
        gone.push(id); // deleted locally before it could upload
        continue;
      }
      const motion = link.motionId !== null ? await getMotion(link.motionId) : undefined;
      ready.push({
        id,
        accountId: link.accountId,
        gloss: sample.label,
        featureVersion: sample.featureVersion,
        sourceFrames: sample.sourceFrames,
        vector: sample.vector,
        motion: motion?.clip ?? null,
        meta: { dominantHand: sample.meta.dominantHand, lighting: sample.meta.lighting, consentTrain: sample.meta.consentTrain },
        createdAt: new Date(sample.meta.createdAt).toISOString(),
      });
    }
    try {
      if (ready.length) await backend.putSigns(ready);
      const done = new Set([...gone, ...ready.map((s) => s.id)]);
      write(OUTBOX_KEY, outbox().filter((id) => !done.has(id)));
    } catch {
      /* offline or server error: try again later */
    }
    changed();
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Download recordings made on the user's other devices, and remove ones they deleted
 * elsewhere. Returns how many signs were added.
 */
export async function pullSigns(): Promise<number> {
  const backend = getBackend();
  if (backend.mode !== 'cloud' || !(await backend.getUser())) return 0;
  await flushSigns();
  let remote: CloudSign[];
  try {
    remote = await backend.listSigns();
  } catch {
    return 0;
  }

  // What this device already has, keyed by server id (rebuilt from samples if links were lost).
  const map = links();
  for (const sample of await getSamples()) {
    const cloudId = sample.meta.cloudId;
    if (cloudId && sample.id !== undefined && !map[cloudId]) map[cloudId] = { sampleId: sample.id, motionId: null, accountId: null };
  }

  let added = 0;
  const remoteIds = new Set(remote.map((s) => s.id));
  for (const sign of remote) {
    if (map[sign.id]) continue;
    // A recording from an app version with a different feature layout cannot be used here.
    if (sign.featureVersion !== FEATURE_VERSION || sign.vector.length !== WINDOW_DIM) continue;
    const meta = sign.meta as { dominantHand?: 'left' | 'right'; lighting?: 'bright' | 'normal' | 'dim'; consentTrain?: boolean };
    const sampleId = await addSample({
      label: sign.gloss,
      featureVersion: sign.featureVersion,
      sourceFrames: sign.sourceFrames,
      vector: sign.vector,
      meta: {
        signerId: 'synced',
        dominantHand: meta.dominantHand ?? 'right',
        device: 'synced from another device',
        lighting: meta.lighting ?? 'normal',
        createdAt: Date.parse(sign.createdAt) || Date.now(),
        consentTrain: meta.consentTrain === true,
        cloudId: sign.id,
      },
    });
    const motionId = sign.motion ? await saveEncodedMotion(sign.gloss, sign.motion) : null;
    map[sign.id] = { sampleId, motionId, accountId: sign.accountId };
    added += 1;
  }

  // Deleted on another device → delete here (never touches recordings still waiting to upload).
  const waiting = new Set(outbox());
  for (const [id, link] of Object.entries(map)) {
    if (remoteIds.has(id) || waiting.has(id)) continue;
    await deleteSample(link.sampleId).catch(() => {});
    if (link.motionId !== null) await removeMotionById(link.motionId);
    delete map[id];
  }

  write(LINKS_KEY, map);
  changed();
  return added;
}

/** "Delete all recordings": also removes them from the server, i.e. from every device. */
export async function deleteAllSyncedSigns(): Promise<void> {
  write(OUTBOX_KEY, []);
  write(LINKS_KEY, {});
  const backend = getBackend();
  if (backend.mode === 'cloud' && (await backend.getUser())) await backend.deleteAllSigns();
  changed();
}

/** On sign-out: upload what we can, then stop associating this device's recordings with the login. */
export async function forgetSignSync(): Promise<void> {
  await flushSigns();
  write(OUTBOX_KEY, []);
  write(LINKS_KEY, {});
}
