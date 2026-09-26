import { describe, expect, it } from 'vitest';
import { FOREARM, UPPER_ARM, blendRigs, clipReference, frameToRig, restRig, solveElbow, type Vec3 } from './avatarRig.js';
import { LEAD_IN_MS, TRANSITION_MS, buildTimeline, stateAt } from './avatarTimeline.js';
import { groupWindows, folderLabel, scanFiles } from './datasetImport.js';
import { WINDOW_DIM } from './features.js';
import { HAND_VALUES, POSE_KEYS, POSE_VALUES, cleanClip, decodeClip, encodeClip, fillGaps, sampleClip, trimToSigning, type MotionFrame } from './motion.js';
import { dequantize, quantize } from './signPack.js';

function hand(x: number, y: number): Float32Array {
  const out = new Float32Array(HAND_VALUES);
  for (let i = 0; i < 21; i += 1) {
    out[i * 3] = x + (i % 5) * 0.01;
    out[i * 3 + 1] = y - Math.floor(i / 4) * 0.012;
    out[i * 3 + 2] = -0.01 * (i % 3);
  }
  return out;
}

function pose(): Float32Array {
  const out = new Float32Array(POSE_VALUES);
  const set = (key: (typeof POSE_KEYS)[number], x: number, y: number) => {
    const i = POSE_KEYS.indexOf(key) * 3;
    out[i] = x;
    out[i + 1] = y;
  };
  set('nose', 0.66, 0.3);
  set('leftEar', 0.72, 0.28);
  set('rightEar', 0.6, 0.28);
  set('leftShoulder', 0.86, 0.55);
  set('rightShoulder', 0.46, 0.55);
  set('leftElbow', 0.95, 0.85);
  set('rightElbow', 0.4, 0.85);
  set('leftWrist', 0.8, 0.6);
  set('rightWrist', 0.5, 0.6);
  set('leftHip', 0.8, 1.2);
  set('rightHip', 0.52, 1.2);
  return out;
}

function frame(t: number, withHands = true): MotionFrame {
  return { t, pose: pose(), left: withHands ? hand(0.8 + t / 10000, 0.6) : null, right: withHands ? hand(0.5, 0.6) : null };
}

describe('motion clips', () => {
  it('round-trips through the compact encoding within 0.0002', () => {
    const clip = { frames: [frame(0), frame(66), { ...frame(133), right: null }] };
    const decoded = decodeClip(encodeClip(clip));
    expect(decoded.frames).toHaveLength(3);
    expect(decoded.frames[2]?.right).toBeNull();
    expect(decoded.frames[1]?.t).toBe(66);
    const a = clip.frames[1]?.left as Float32Array;
    const b = decoded.frames[1]?.left as Float32Array;
    for (let i = 0; i < a.length; i += 1) expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(2e-4);
  });

  it('trims rest frames and rebases time', () => {
    const frames = [frame(0, false), frame(40, false), frame(80, false), frame(120, false), frame(160), frame(200), frame(240, false), frame(280, false), frame(320, false), frame(360, false)];
    const trimmed = trimToSigning(frames, 1);
    expect(trimmed).toHaveLength(4);
    expect(trimmed[0]?.t).toBe(0);
  });

  it('fills short tracking gaps but not long ones', () => {
    const frames = [frame(0), { ...frame(40), left: null }, { ...frame(80), left: null }, frame(120)];
    const filled = fillGaps(frames, 4);
    expect(filled[1]?.left).not.toBeNull();
    const long = fillGaps([frame(0), ...[1, 2, 3, 4, 5, 6].map((i) => ({ ...frame(i * 40), left: null })), frame(280)], 4);
    expect(long[3]?.left).toBeNull();
  });

  it('interpolates between frames', () => {
    const clip = cleanClip([frame(0), frame(100), frame(200)]);
    const mid = sampleClip(clip, 50);
    expect(mid).not.toBeNull();
    expect(sampleClip({ frames: [] }, 10)).toBeNull();
  });
});

describe('avatar rig', () => {
  it('keeps human arm lengths and puts the wrist exactly on the target', () => {
    const shoulder: Vec3 = [0.5, 0, 0];
    const wrist: Vec3 = [0.2, 0.6, 0.3];
    const elbow = solveElbow(shoulder, wrist, [1, -1, 0]);
    const d = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(d(shoulder, elbow)).toBeCloseTo(UPPER_ARM, 5);
    expect(d(elbow, wrist)).toBeCloseTo(FOREARM, 5);
  });

  it('straightens an arm when the target is out of reach, never over-stretching', () => {
    const elbow = solveElbow([0, 0, 0], [5, 0, 0], [0, -1, 0]);
    expect(elbow[0]).toBeCloseTo((5 * UPPER_ARM) / (UPPER_ARM + FOREARM), 5);
  });

  it('maps the signer to avatar space: shoulders 1 unit apart, facing the viewer', () => {
    const clip = { frames: [frame(0)] };
    const rig = frameToRig(clip.frames[0] ?? null, clipReference(clip));
    expect(Math.hypot(rig.leftShoulder[0] - rig.rightShoulder[0], rig.leftShoulder[1] - rig.rightShoulder[1])).toBeCloseTo(1, 5);
    // The signer's left side (image right) appears on the viewer's right (+x).
    expect(rig.leftShoulder[0]).toBeGreaterThan(rig.rightShoulder[0]);
    expect(rig.head.center[1]).toBeGreaterThan(rig.leftShoulder[1]);
  });

  it('falls back to a rest pose with no data, and blends smoothly', () => {
    expect(frameToRig(null, null)).toEqual(restRig());
    const a = restRig();
    const b = { ...restRig(), neck: [1, 1, 1] as Vec3 };
    expect(blendRigs(a, b, 0).neck).toEqual(a.neck);
    expect(blendRigs(a, b, 1).neck).toEqual([1, 1, 1]);
  });
});

describe('avatar timeline', () => {
  it('sequences signs with transitions and holds signs that have no motion', () => {
    const clip = cleanClip([frame(0), frame(300), frame(600)]);
    const timeline = buildTimeline([
      { gloss: 'A', caption: 'A', clip, source: 'recorded' },
      { gloss: 'B', caption: 'B', clip: null, source: null, holdMs: 500 },
    ]);
    const [a, b] = timeline.segments;
    expect(a?.start).toBe(LEAD_IN_MS);
    expect(b?.start).toBe((a?.end ?? 0) + TRANSITION_MS);
    expect((b?.end ?? 0) - (b?.start ?? 0)).toBe(500);
    expect(stateAt(timeline, (a?.start ?? 0) + 10).index).toBe(0);
    expect(stateAt(timeline, (b?.start ?? 0) + 10).index).toBe(1);
    expect(stateAt(timeline, timeline.duration + 1).finished).toBe(true);
  });
});

describe('sign packs and dataset import', () => {
  it('quantises examples to int8 with small error', () => {
    const vector = Array.from({ length: WINDOW_DIM }, (_, i) => Math.sin(i) * 3);
    const { q, s } = quantize(vector);
    const back = dequantize(q, s);
    expect(back).toHaveLength(WINDOW_DIM);
    const maxErr = Math.max(...back.map((v, i) => Math.abs(v - (vector[i] ?? 0))));
    expect(maxErr).toBeLessThan(3 / 127 + 1e-6);
  });

  it('matches INCLUDE folders to lexicon glosses', () => {
    expect(folderLabel('30. Hospital')).toBe('hospital');
    expect(folderLabel('46. you (plural)')).toBe('youplural');
    const file = (path: string) => Object.assign(new File(['x'], path.split('/').at(-1) ?? 'x'), { webkitRelativePath: path });
    const scan = scanFiles([
      file('INCLUDE/Places/30. Hospital/MVI_1.MOV'),
      file('INCLUDE/Places/30. Hospital/MVI_2.MOV'),
      file('INCLUDE/Jobs/87. Doctor/MVI_3.MOV'),
      file('INCLUDE/Random/1. Unicorn/MVI_4.MOV'),
      file('INCLUDE/Places/30. Hospital/notes.txt'),
    ]);
    expect(scan.groups.map((g) => [g.entry.gloss, g.files.length])).toEqual([
      ['DOCTOR', 1],
      ['HOSPITAL', 2],
    ]);
    expect(scan.unmatchedFolders).toEqual(['1. Unicorn']);
  });

  it('averages windows into at most N normalised groups', () => {
    const windows = [0, 1, 2, 3, 4].map((k) => Float32Array.from({ length: 8 }, (_, i) => (i === k ? 1 : 0)));
    const groups = groupWindows(windows, 2);
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(Math.hypot(...g)).toBeCloseTo(1, 5);
  });
});
