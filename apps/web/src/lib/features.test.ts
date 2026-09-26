/**
 * Feature-layout tests AND the generator for the cross-language parity fixture.
 *
 * Running this writes services/ml/fixtures/parity.json, which check_parity.py reads to
 * confirm features.py produces identical vectors. That is the whole mechanism protecting
 * against the "great in Colab, useless in the browser" failure:
 *
 *   npm test --workspace @signsphere/web     # regenerate the fixture
 *   cd services/ml && python check_parity.py # verify Python matches
 *
 * Do both after ANY change to features.ts or features.py.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FEATURE_VERSION,
  FRAME_DIM,
  HAND_POINTS,
  OFFSET,
  POSE_POINTS,
  WINDOW_DIM,
  WINDOW_FRAMES,
  encodeFrame,
  resampleWindow,
  type Point3,
} from './features.js';

/** Deterministic LCG — the fixture must be byte-identical on every run. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function makePoints(count: number, seed: number): Point3[] {
  const random = lcg(seed);
  return Array.from({ length: count }, () => ({
    x: Number(random().toFixed(6)),
    y: Number(random().toFixed(6)),
    z: Number((random() * 0.2 - 0.1).toFixed(6)),
  }));
}

const dominant = makePoints(HAND_POINTS, 11);
const nonDominant = makePoints(HAND_POINTS, 22);
const pose = makePoints(33, 33);

describe('feature layout', () => {
  it('has the documented dimensions', () => {
    expect(FRAME_DIM).toBe(213);
    expect(WINDOW_FRAMES).toBe(32);
    expect(WINDOW_DIM).toBe(6816);
    expect(POSE_POINTS).toBe(25);
  });

  it('has non-overlapping blocks that exactly fill the frame', () => {
    expect(OFFSET.dominantHand + HAND_POINTS * 3).toBe(OFFSET.nonDominantPresent);
    expect(OFFSET.nonDominantHand + HAND_POINTS * 3).toBe(OFFSET.dominantAbs);
    expect(OFFSET.dominantAbs + 3).toBe(OFFSET.nonDominantAbs);
    expect(OFFSET.nonDominantAbs + 3).toBe(OFFSET.interHandVector);
    expect(OFFSET.interHandVector + 3).toBe(OFFSET.interHandDistance);
    expect(OFFSET.interHandDistance + 1).toBe(OFFSET.pose);
    expect(OFFSET.pose + POSE_POINTS * 3).toBe(FRAME_DIM);
  });
});

describe('encodeFrame', () => {
  it('maps the wrist to the origin (position invariance)', () => {
    const encoded = encodeFrame({ dominant, nonDominant: null, pose: null, timestampMs: 0 });
    expect(encoded[OFFSET.dominantHand]).toBeCloseTo(0, 6);
    expect(encoded[OFFSET.dominantHand + 1]).toBeCloseTo(0, 6);
    expect(encoded[OFFSET.dominantHand + 2]).toBeCloseTo(0, 6);
  });

  it('is invariant to translating the whole hand', () => {
    const shifted = dominant.map((p) => ({ x: p.x + 0.25, y: p.y - 0.1, z: p.z }));
    const a = encodeFrame({ dominant, nonDominant: null, pose: null, timestampMs: 0 });
    const b = encodeFrame({ dominant: shifted, nonDominant: null, pose: null, timestampMs: 0 });
    for (let i = OFFSET.dominantHand; i < OFFSET.nonDominantPresent; i += 1) {
      expect(b[i]).toBeCloseTo(a[i] ?? 0, 5);
    }
  });

  it('is invariant to scaling the hand (distance from camera)', () => {
    const wrist = dominant[0]!;
    const scaled = dominant.map((p) => ({
      x: wrist.x + (p.x - wrist.x) * 1.8,
      y: wrist.y + (p.y - wrist.y) * 1.8,
      z: wrist.z + (p.z - wrist.z) * 1.8,
    }));
    const a = encodeFrame({ dominant, nonDominant: null, pose: null, timestampMs: 0 });
    const b = encodeFrame({ dominant: scaled, nonDominant: null, pose: null, timestampMs: 0 });
    for (let i = OFFSET.dominantHand; i < OFFSET.nonDominantPresent; i += 1) {
      expect(b[i]).toBeCloseTo(a[i] ?? 0, 4);
    }
  });

  it('sets presence flags and zeroes an absent hand', () => {
    const encoded = encodeFrame({ dominant, nonDominant: null, pose: null, timestampMs: 0 });
    expect(encoded[OFFSET.dominantPresent]).toBe(1);
    expect(encoded[OFFSET.nonDominantPresent]).toBe(0);
    for (let i = OFFSET.nonDominantHand; i < OFFSET.dominantAbs; i += 1) {
      expect(encoded[i]).toBe(0);
    }
  });

  it('keeps signing-space position rather than normalising it away', () => {
    // Two identical handshapes at different heights must differ — location is meaningful in ISL.
    const low = dominant.map((p) => ({ ...p, y: p.y + 0.3 }));
    const a = encodeFrame({ dominant, nonDominant: null, pose, timestampMs: 0 });
    const b = encodeFrame({ dominant: low, nonDominant: null, pose, timestampMs: 0 });
    expect(a[OFFSET.dominantAbs + 1]).not.toBeCloseTo(b[OFFSET.dominantAbs + 1] ?? 0, 3);
  });

  it('records inter-hand distance only when both hands are present', () => {
    const one = encodeFrame({ dominant, nonDominant: null, pose, timestampMs: 0 });
    const two = encodeFrame({ dominant, nonDominant, pose, timestampMs: 0 });
    expect(one[OFFSET.interHandDistance]).toBe(0);
    expect(two[OFFSET.interHandDistance]).toBeGreaterThan(0);
  });
});

describe('resampleWindow', () => {
  it('always returns exactly WINDOW_FRAMES frames', () => {
    for (const n of [1, 5, 32, 90]) {
      const frames = Array.from({ length: n }, () => new Float32Array(FRAME_DIM));
      expect(resampleWindow(frames).length).toBe(WINDOW_DIM);
    }
  });

  it('returns zeros for an empty sequence rather than throwing', () => {
    const out = resampleWindow([]);
    expect(out.length).toBe(WINDOW_DIM);
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

/** Source-index mapping for a given input length — the exact rounding behaviour to mirror. */
function resampleIndices(n: number): number[] {
  const frames = Array.from({ length: n }, (_, i) => {
    const frame = new Float32Array(FRAME_DIM);
    frame[0] = i;
    return frame;
  });
  const out = resampleWindow(frames);
  return Array.from({ length: WINDOW_FRAMES }, (_, i) => out[i * FRAME_DIM] ?? 0);
}

describe('parity fixture', () => {
  it('writes services/ml/fixtures/parity.json for check_parity.py', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const target = resolve(here, '../../../../services/ml/fixtures/parity.json');

    const asCase = (
      name: string,
      d: Point3[] | null,
      nd: Point3[] | null,
      p: Point3[] | null,
    ) => ({
      name,
      dominant: d?.map((q) => [q.x, q.y, q.z]) ?? null,
      nonDominant: nd?.map((q) => [q.x, q.y, q.z]) ?? null,
      pose: p?.map((q) => [q.x, q.y, q.z]) ?? null,
      expected: Array.from(encodeFrame({ dominant: d, nonDominant: nd, pose: p, timestampMs: 0 })),
    });

    const fixture = {
      _generatedBy: 'apps/web/src/lib/features.test.ts — do not edit by hand',
      featureVersion: FEATURE_VERSION,
      frameDim: FRAME_DIM,
      windowFrames: WINDOW_FRAMES,
      windowDim: WINDOW_DIM,
      offsets: OFFSET,
      cases: [
        asCase('two-hands-with-pose', dominant, nonDominant, pose),
        asCase('dominant-only-with-pose', dominant, null, pose),
        asCase('two-hands-no-pose', dominant, nonDominant, null),
        asCase('nothing-detected', null, null, null),
      ],
      resample: [1, 3, 5, 32, 47, 90].map((n) => ({ n, indices: resampleIndices(n) })),
    };

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

    expect(fixture.cases[0]?.expected.length).toBe(FRAME_DIM);
  });
});
