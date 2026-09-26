/**
 * Built-in sign packs: example windows shipped with the app (built by
 * services/ml/build_isl_pack.py from the INCLUDE dataset) that users install into the local
 * sample store with one tap. Installed examples are ordinary samples to the recogniser, so
 * the recognition code does not change at all — and, being in IndexedDB, they work offline.
 *
 * Pack examples are never exported for training (consentTrain: false) and are tagged by
 * signerId `pack:<id>` so they can be removed without touching the user's own recordings.
 */

import { FEATURE_VERSION, FRAME_DIM, WINDOW_DIM, WINDOW_FRAMES } from './features.js';
import { LOCAL_PREFIX, addSample, deleteSample, getSamples } from './storage.js';

export interface PackInfo {
  id: string;
  url: string;
  name: string;
  description: string;
  /** Approximate download size, shown before installing. */
  sizeHint: string;
}

/** Packs the app knows about. A pack whose JSON is not deployed shows as "not built yet". */
export const PACKS: readonly PackInfo[] = [
  {
    id: 'isl-include-sos',
    url: '/datasets/isl-include-sos.json',
    name: 'ISL emergency signs',
    description: 'HOSPITAL, DOCTOR, POLICE, MEDICINE, SICK and DEAF — for Emergency → Sign a phrase.',
    sizeHint: '≈ 1 MB',
  },
  {
    id: 'isl-include-everyday',
    url: '/datasets/isl-include-everyday.json',
    name: 'ISL everyday signs',
    description: 'The emergency signs plus greetings, family, pronouns, feelings, school and time (28 signs).',
    sizeHint: '≈ 5 MB',
  },
];

export interface SignPack {
  format: 'signsphere-sign-pack';
  formatVersion: number;
  id: string;
  name: string;
  description: string;
  language: string;
  featureVersion: number;
  windowFrames: number;
  frameDim: number;
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  signs: Record<string, { include?: string; videos?: number }>;
  samples: Array<{ label: string; sourceFrames: number; vector: number[]; videos?: number }>;
}

/** Throws a human-readable error if the pack cannot be used with this build. */
export function validatePack(value: unknown): SignPack {
  const pack = value as Partial<SignPack> | null;
  if (!pack || pack.format !== 'signsphere-sign-pack') throw new Error('This file is not a SignSphere sign pack.');
  if (pack.featureVersion !== FEATURE_VERSION || pack.windowFrames !== WINDOW_FRAMES || pack.frameDim !== FRAME_DIM) {
    throw new Error(
      `This pack was built for feature version ${pack.featureVersion}, but the app uses ${FEATURE_VERSION}. Rebuild it with services/ml/build_isl_pack.py.`,
    );
  }
  if (!Array.isArray(pack.samples) || pack.samples.length === 0) throw new Error('This pack has no examples.');
  for (const sample of pack.samples) {
    if (typeof sample.label !== 'string' || !Array.isArray(sample.vector) || sample.vector.length !== WINDOW_DIM) {
      throw new Error('This pack contains a malformed example.');
    }
  }
  if (!pack.license || !pack.attribution) throw new Error('This pack has no licence or attribution, so it cannot be installed.');
  return pack as SignPack;
}

export function packSignerId(id: string): string {
  return `pack:${id}`;
}

const INSTALLED_KEY = `${LOCAL_PREFIX}packs.v1`;

export interface InstalledPack {
  id: string;
  name: string;
  signs: string[];
  examples: number;
  attribution: string;
  installedAt: number;
}

export function loadInstalledPacks(): InstalledPack[] {
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as InstalledPack[]) : [];
  } catch {
    return [];
  }
}

function saveInstalledPacks(packs: InstalledPack[]): void {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(packs));
  } catch {
    /* ignore */
  }
}

export type PackAvailability = 'available' | 'not-built' | 'offline';

/** Is the pack's JSON deployed? (It only exists after someone runs the build script.) */
export async function checkPack(info: PackInfo): Promise<PackAvailability> {
  try {
    const response = await fetch(info.url, { method: 'HEAD', cache: 'no-store' });
    const type = response.headers.get('content-type') ?? '';
    // An SPA host answers unknown paths with index.html; that means "not built", not "available".
    if (response.ok && !type.includes('text/html')) return 'available';
    return 'not-built';
  } catch {
    return 'offline';
  }
}

export async function removePack(id: string): Promise<number> {
  const signer = packSignerId(id);
  const samples = await getSamples();
  const mine = samples.filter((sample) => sample.meta.signerId === signer && sample.id !== undefined);
  for (const sample of mine) await deleteSample(sample.id as number);
  saveInstalledPacks(loadInstalledPacks().filter((pack) => pack.id !== id));
  return mine.length;
}

/** Download + install. Re-installing replaces the previous copy of the same pack. */
export async function installPack(info: PackInfo, onProgress?: (done: number, total: number) => void): Promise<InstalledPack> {
  const response = await fetch(info.url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not download the pack (HTTP ${response.status}).`);
  const pack = validatePack(await response.json());

  await removePack(pack.id);
  const signer = packSignerId(pack.id);
  const now = Date.now();
  let done = 0;
  for (const sample of pack.samples) {
    await addSample({
      label: sample.label,
      featureVersion: pack.featureVersion,
      sourceFrames: sample.sourceFrames,
      vector: sample.vector,
      meta: {
        signerId: signer,
        dominantHand: 'right',
        device: `dataset:${pack.source}`,
        lighting: 'normal',
        createdAt: now,
        // Third-party data: never part of the user's training export.
        consentTrain: false,
        notes: pack.attribution,
      },
    });
    done += 1;
    onProgress?.(done, pack.samples.length);
  }

  const installed: InstalledPack = {
    id: pack.id,
    name: pack.name,
    signs: [...new Set(pack.samples.map((sample) => sample.label))].sort(),
    examples: pack.samples.length,
    attribution: pack.attribution,
    installedAt: now,
  };
  saveInstalledPacks([...loadInstalledPacks().filter((p) => p.id !== pack.id), installed]);
  return installed;
}
