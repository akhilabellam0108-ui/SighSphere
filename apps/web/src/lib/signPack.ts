/**
 * Sign packs: shareable bundles of recognition examples + avatar motions.
 *
 * Built by the in-app dataset importer (lib/datasetImport.ts) from INCLUDE videos, then
 * either installed on the device that built them or published at
 * public/datasets/isl-include.json, from where every user's app installs them
 * automatically (lib/packInstaller.ts). Installed data lives in IndexedDB, so it works offline.
 */

import { FEATURE_VERSION, FRAME_DIM, WINDOW_DIM, WINDOW_FRAMES } from './features.js';
import { asset } from './base.js';

export const PACK_FORMAT = 'signsphere-sign-pack';
export const PACK_FORMAT_VERSION = 2;
export const BUNDLED_PACK_URL = asset('datasets/isl-include.json');

export interface PackSample {
  label: string;
  sourceFrames: number;
  /** int8 base64, dequantised as value * s / 127 */
  q: string;
  s: number;
}

export interface PackMotion {
  gloss: string;
  /** lib/motion.ts encodeClip output */
  clip: string;
}

export interface SignPack {
  format: typeof PACK_FORMAT;
  formatVersion: number;
  id: string;
  /** Bump to make every user's app reinstall the pack. */
  version: string;
  name: string;
  language: 'isl';
  featureVersion: number;
  windowFrames: number;
  frameDim: number;
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  signs: Record<string, { videos: number; category?: string }>;
  samples: PackSample[];
  motions: PackMotion[];
}

export const INCLUDE_ATTRIBUTION =
  'Sign examples and motion derived from the INCLUDE dataset by AI4Bharat (Sridhar, Ganesan, Kumar P. and Khapra, ACM Multimedia 2020), licensed CC BY 4.0. Landmarks extracted by SignSphere; no video is included.';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Per-vector int8 quantisation: 4× smaller than float32, far below classifier noise. */
export function quantize(vector: ArrayLike<number>): { q: string; s: number } {
  let max = 0;
  for (let i = 0; i < vector.length; i += 1) max = Math.max(max, Math.abs(vector[i] ?? 0));
  const s = max || 1;
  const bytes = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) bytes[i] = Math.round(((vector[i] ?? 0) / s) * 127);
  return { q: toBase64(new Uint8Array(bytes.buffer)), s };
}

export function dequantize(q: string, s: number): number[] {
  const bytes = fromBase64(q);
  const ints = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from(ints, (v) => (v / 127) * s);
}

/** Throws a readable error if this build cannot use the pack. */
export function validatePack(value: unknown): SignPack {
  const pack = value as Partial<SignPack> | null;
  if (!pack || pack.format !== PACK_FORMAT) throw new Error('This file is not a SignSphere sign pack.');
  if (pack.formatVersion !== PACK_FORMAT_VERSION) throw new Error(`Unsupported pack format version ${pack.formatVersion}.`);
  if (pack.featureVersion !== FEATURE_VERSION || pack.windowFrames !== WINDOW_FRAMES || pack.frameDim !== FRAME_DIM) {
    throw new Error('This pack was built by a different version of the app. Rebuild it with the dataset importer.');
  }
  if (!pack.license || !pack.attribution) throw new Error('This pack has no licence or attribution, so it cannot be installed.');
  if (!Array.isArray(pack.samples) || !Array.isArray(pack.motions)) throw new Error('This pack is incomplete.');
  for (const sample of pack.samples) {
    if (typeof sample.label !== 'string' || typeof sample.q !== 'string' || !(sample.s > 0)) throw new Error('This pack contains a malformed example.');
    if (fromBase64(sample.q).byteLength !== WINDOW_DIM) throw new Error('This pack contains an example of the wrong size.');
  }
  return pack as SignPack;
}
