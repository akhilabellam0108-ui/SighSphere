/**
 * Signer motion: the data the 3D avatar replays.
 *
 * A motion clip is the real movement of a real signer — tracked hands (21 points each),
 * arms, shoulders and face points — captured either by the in-app recorder or by the
 * dataset importer from INCLUDE videos. The avatar does not invent signing; it reproduces
 * this motion, which is what makes it precise.
 *
 * Coordinates are stored in "image-height units": x and z are multiplied by the video's
 * aspect ratio so a 16:9 dataset video and a 4:3 webcam produce the same proportions.
 */

import type { Point3 } from './features.js';
import type { TrackedFrame } from './landmarks.js';

/** MediaPipe pose landmarks the avatar uses, in this order. */
export const POSE_INDEX = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;
export const POSE_KEYS = Object.keys(POSE_INDEX) as Array<keyof typeof POSE_INDEX>;
export const POSE_POINT_COUNT = POSE_KEYS.length; // 15
export const POSE_VALUES = POSE_POINT_COUNT * 3; // 45
export const HAND_VALUES = 21 * 3; // 63
const FRAME_VALUES = POSE_VALUES + HAND_VALUES * 2; // 171

export interface MotionFrame {
  /** Milliseconds from the start of the clip. */
  t: number;
  /** POSE_KEYS order, xyz each. The signer's own left/right, not the viewer's. */
  pose: Float32Array | null;
  /** The signer's left hand. */
  left: Float32Array | null;
  /** The signer's right hand. */
  right: Float32Array | null;
}

export interface MotionClip {
  frames: MotionFrame[];
}

function flatten(points: Point3[], aspect: number): Float32Array {
  const out = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    out[i * 3] = p.x * aspect;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z * aspect;
  });
  return out;
}

function dist2(a: Float32Array, ai: number, x: number, y: number): number {
  const dx = (a[ai] ?? 0) - x;
  const dy = (a[ai + 1] ?? 0) - y;
  return dx * dx + dy * dy;
}

/**
 * Convert one tracked frame. Hands are assigned to the signer's left/right by distance to
 * the pose wrists when the body is visible (robust to MediaPipe handedness flips), and by
 * MediaPipe's handedness label otherwise.
 */
export function captureFrame(frame: TrackedFrame, t: number, aspect: number, mirrored = true): MotionFrame {
  let pose: Float32Array | null = null;
  if (frame.pose && frame.pose.length >= 25) {
    const picked = POSE_KEYS.map((key) => frame.pose?.[POSE_INDEX[key]] ?? { x: 0, y: 0, z: 0 });
    pose = flatten(picked, aspect);
  }

  let left: Float32Array | null = null;
  let right: Float32Array | null = null;
  const hands = frame.hands.map((points) => flatten(points, aspect));

  if (pose && hands.length > 0) {
    const lw = POSE_KEYS.indexOf('leftWrist') * 3;
    const rw = POSE_KEYS.indexOf('rightWrist') * 3;
    const lx = pose[lw] ?? 0;
    const ly = pose[lw + 1] ?? 0;
    const rx = pose[rw] ?? 0;
    const ry = pose[rw + 1] ?? 0;
    if (hands.length === 1) {
      const h = hands[0] as Float32Array;
      if (dist2(h, 0, lx, ly) <= dist2(h, 0, rx, ry)) left = h;
      else right = h;
    } else {
      const [a, b] = hands as [Float32Array, Float32Array];
      const straight = dist2(a, 0, lx, ly) + dist2(b, 0, rx, ry);
      const swapped = dist2(a, 0, rx, ry) + dist2(b, 0, lx, ly);
      if (straight <= swapped) {
        left = a;
        right = b;
      } else {
        left = b;
        right = a;
      }
    }
  } else {
    hands.forEach((h, i) => {
      const label = frame.handedness[i];
      const signersRight = mirrored ? label === 'Left' : label === 'Right';
      if (signersRight && !right) right = h;
      else if (!left) left = h;
    });
  }
  return { t, pose, left, right };
}

// ------------------------------------------------------------------------- clean-up

/** Keep the signing: drop leading/trailing frames with no hands (plus a little padding). */
export function trimToSigning(frames: MotionFrame[], pad = 3): MotionFrame[] {
  const has = frames.map((f) => Boolean(f.left || f.right));
  const first = has.indexOf(true);
  const last = has.lastIndexOf(true);
  if (first === -1) return [];
  const start = Math.max(0, first - pad);
  const end = Math.min(frames.length, last + pad + 1);
  const t0 = frames[start]?.t ?? 0;
  return frames.slice(start, end).map((f) => ({ ...f, t: f.t - t0 }));
}

type Part = 'pose' | 'left' | 'right';
const PARTS: Part[] = ['pose', 'left', 'right'];

/** Fill short tracking drop-outs (≤ maxGap frames) by linear interpolation. */
export function fillGaps(frames: MotionFrame[], maxGap = 4): MotionFrame[] {
  const out = frames.map((f) => ({ ...f }));
  for (const part of PARTS) {
    let i = 0;
    while (i < out.length) {
      if (out[i]?.[part]) {
        i += 1;
        continue;
      }
      let j = i;
      while (j < out.length && !out[j]?.[part]) j += 1;
      const before = out[i - 1]?.[part];
      const after = out[j]?.[part];
      if (before && after && j - i <= maxGap) {
        for (let k = i; k < j; k += 1) {
          const w = (k - i + 1) / (j - i + 1);
          const v = new Float32Array(before.length);
          for (let n = 0; n < v.length; n += 1) v[n] = (before[n] ?? 0) * (1 - w) + (after[n] ?? 0) * w;
          (out[k] as MotionFrame)[part] = v;
        }
      }
      i = j;
    }
  }
  return out;
}

/**
 * Zero-lag smoothing: exponential smoothing forward then backward. Removes tracking jitter
 * (which reads as a trembling hand) without delaying the movement.
 */
export function smooth(frames: MotionFrame[], alpha = 0.55): MotionFrame[] {
  const out = frames.map((f) => ({
    ...f,
    pose: f.pose?.slice() ?? null,
    left: f.left?.slice() ?? null,
    right: f.right?.slice() ?? null,
  }));
  for (const part of PARTS) {
    for (const direction of [1, -1] as const) {
      let prev: Float32Array | null = null;
      const indices = direction === 1 ? out.keys() : [...out.keys()].reverse();
      for (const i of indices) {
        const cur = out[i]?.[part];
        if (!cur) {
          prev = null;
          continue;
        }
        if (prev) for (let n = 0; n < cur.length; n += 1) cur[n] = alpha * (cur[n] ?? 0) + (1 - alpha) * (prev[n] ?? 0);
        prev = cur;
      }
    }
  }
  return out;
}

export function cleanClip(frames: MotionFrame[]): MotionClip {
  return { frames: smooth(fillGaps(trimToSigning(frames))) };
}

export function clipDuration(clip: MotionClip): number {
  return clip.frames.at(-1)?.t ?? 0;
}

// -------------------------------------------------------------------------- sampling

function lerpArray(a: Float32Array | null, b: Float32Array | null, w: number): Float32Array | null {
  if (!a) return b;
  if (!b) return a;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] ?? 0) * (1 - w) + (b[i] ?? 0) * w;
  return out;
}

/** The pose at time t (ms), interpolated between the two nearest frames. */
export function sampleClip(clip: MotionClip, t: number): MotionFrame | null {
  const frames = clip.frames;
  if (frames.length === 0) return null;
  if (t <= (frames[0]?.t ?? 0)) return frames[0] ?? null;
  const lastFrame = frames[frames.length - 1] as MotionFrame;
  if (t >= lastFrame.t) return lastFrame;
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((frames[mid]?.t ?? 0) <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo] as MotionFrame;
  const b = frames[hi] as MotionFrame;
  const w = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { t, pose: lerpArray(a.pose, b.pose, w), left: lerpArray(a.left, b.left, w), right: lerpArray(a.right, b.right, w) };
}

// -------------------------------------------------------------------------- encoding

const SCALE = 8192; // int16 → ±4 image heights, ~0.0001 resolution

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

interface EncodedClip {
  v: 1;
  n: number;
  /** Per frame: bit0 pose, bit1 left, bit2 right. */
  flags: string;
  /** Uint16 ms since the previous frame. */
  dt: string;
  /** Int16, FRAME_VALUES per frame (zeros where a part is missing). */
  data: string;
}

/** Compact string form (~350 bytes per frame) for IndexedDB and pack files. */
export function encodeClip(clip: MotionClip): string {
  const n = clip.frames.length;
  const data = new Int16Array(n * FRAME_VALUES);
  const dt = new Uint16Array(n);
  let flags = '';
  let prevT = 0;
  clip.frames.forEach((f, i) => {
    dt[i] = Math.max(0, Math.min(65535, Math.round(f.t - prevT)));
    prevT += dt[i] ?? 0;
    flags += String((f.pose ? 1 : 0) | (f.left ? 2 : 0) | (f.right ? 4 : 0));
    const put = (arr: Float32Array | null, offset: number) => {
      if (!arr) return;
      for (let k = 0; k < arr.length; k += 1) {
        data[i * FRAME_VALUES + offset + k] = Math.max(-32767, Math.min(32767, Math.round((arr[k] ?? 0) * SCALE)));
      }
    };
    put(f.pose, 0);
    put(f.left, POSE_VALUES);
    put(f.right, POSE_VALUES + HAND_VALUES);
  });
  const encoded: EncodedClip = {
    v: 1,
    n,
    flags,
    dt: toBase64(new Uint8Array(dt.buffer)),
    data: toBase64(new Uint8Array(data.buffer)),
  };
  return JSON.stringify(encoded);
}

export function decodeClip(text: string): MotionClip {
  const encoded = JSON.parse(text) as EncodedClip;
  if (encoded.v !== 1) throw new Error('Unsupported motion format.');
  const dtBytes = fromBase64(encoded.dt);
  const dataBytes = fromBase64(encoded.data);
  const dt = new Uint16Array(dtBytes.buffer, dtBytes.byteOffset, dtBytes.byteLength / 2);
  const data = new Int16Array(dataBytes.buffer, dataBytes.byteOffset, dataBytes.byteLength / 2);
  const frames: MotionFrame[] = [];
  let t = 0;
  for (let i = 0; i < encoded.n; i += 1) {
    t += dt[i] ?? 0;
    const flag = Number(encoded.flags[i] ?? 0);
    const read = (offset: number, count: number) => {
      const out = new Float32Array(count);
      for (let k = 0; k < count; k += 1) out[k] = (data[i * FRAME_VALUES + offset + k] ?? 0) / SCALE;
      return out;
    };
    frames.push({
      t,
      pose: flag & 1 ? read(0, POSE_VALUES) : null,
      left: flag & 2 ? read(POSE_VALUES, HAND_VALUES) : null,
      right: flag & 4 ? read(POSE_VALUES + HAND_VALUES, HAND_VALUES) : null,
    });
  }
  return { frames };
}
