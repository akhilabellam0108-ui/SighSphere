/**
 * Installs sign packs into this device's storage (IndexedDB), and keeps the bundled ISL
 * pack installed automatically for every user — so recognition and the avatar work without
 * anyone recording anything, and keep working offline.
 */

import { invalidateMotions, removeMotionsFromSource } from './motionLibrary.js';
import { BUNDLED_PACK_URL, dequantize, validatePack, type SignPack } from './signPack.js';
import { addMotion, addSample, deleteSample, getSamples } from './storage.js';

const INSTALLED_KEY = 'signsphere.packs.v2';
export const PACKS_CHANGED = 'signsphere:packs-changed';

export interface InstalledPack {
  id: string;
  version: string;
  name: string;
  signs: string[];
  examples: number;
  motions: number;
  attribution: string;
  installedAt: number;
}

export function installedPacks(): InstalledPack[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as InstalledPack[]) : [];
  } catch {
    return [];
  }
}

function saveInstalled(list: InstalledPack[]): void {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PACKS_CHANGED));
}

const signerFor = (id: string) => `pack:${id}`;
const sourceFor = (id: string) => `dataset:${id}`;

export async function uninstallPack(id: string): Promise<void> {
  const samples = await getSamples();
  for (const sample of samples) {
    if (sample.meta.signerId === signerFor(id) && sample.id !== undefined) await deleteSample(sample.id);
  }
  await removeMotionsFromSource(sourceFor(id));
  saveInstalled(installedPacks().filter((pack) => pack.id !== id));
}

export async function installPack(value: unknown, onProgress?: (done: number, total: number) => void): Promise<InstalledPack> {
  const pack: SignPack = validatePack(value);
  await uninstallPack(pack.id);
  const total = pack.samples.length + pack.motions.length;
  let done = 0;
  const now = Date.now();
  for (const sample of pack.samples) {
    await addSample({
      label: sample.label,
      featureVersion: pack.featureVersion,
      sourceFrames: sample.sourceFrames,
      vector: dequantize(sample.q, sample.s),
      meta: {
        signerId: signerFor(pack.id),
        dominantHand: 'right',
        device: 'dataset',
        lighting: 'normal',
        createdAt: now,
        // Third-party data: never part of the user's training export.
        consentTrain: false,
        notes: pack.attribution,
      },
    });
    onProgress?.((done += 1), total);
  }
  for (const motion of pack.motions) {
    await addMotion({ gloss: motion.gloss, source: sourceFor(pack.id), createdAt: now, clip: motion.clip });
    onProgress?.((done += 1), total);
  }
  invalidateMotions();
  const record: InstalledPack = {
    id: pack.id,
    version: pack.version,
    name: pack.name,
    signs: Object.keys(pack.signs).sort(),
    examples: pack.samples.length,
    motions: pack.motions.length,
    attribution: pack.attribution,
    installedAt: now,
  };
  saveInstalled([...installedPacks().filter((p) => p.id !== pack.id), record]);
  return record;
}

export type BundledStatus = 'current' | 'installed' | 'updated' | 'none' | 'offline' | 'error';

/**
 * If the deployment ships public/datasets/isl-include.json and this device does not have that
 * version yet, install it. Safe to call on every start: it is a no-op when up to date.
 */
export async function ensureBundledPack(onProgress?: (done: number, total: number) => void): Promise<BundledStatus> {
  let response: Response;
  try {
    response = await fetch(BUNDLED_PACK_URL, { cache: 'no-cache' });
  } catch {
    return 'offline';
  }
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || type.includes('text/html')) return 'none';
  try {
    const pack = validatePack(await response.json());
    const current = installedPacks().find((p) => p.id === pack.id);
    if (current?.version === pack.version) return 'current';
    await installPack(pack, onProgress);
    return current ? 'updated' : 'installed';
  } catch {
    return 'error';
  }
}
