/**
 * Avatar rig: turns a MotionFrame (tracked image-space landmarks) into 3D joint positions
 * for the avatar. Pure maths, no three.js — so it is unit-tested and the renderer stays thin.
 *
 * Avatar space: shoulder width = 1 unit, origin at the clip's mid-shoulder, +y up, and the
 * avatar faces +z (towards the viewer). The signer's right hand appears on the viewer's
 * left, exactly as when you face a person who is signing to you.
 */

import { HAND_VALUES, POSE_KEYS, type MotionClip, type MotionFrame } from './motion.js';

export type Vec3 = [number, number, number];

export interface Rig {
  head: { center: Vec3; yaw: number; pitch: number; roll: number };
  neck: Vec3;
  leftShoulder: Vec3;
  rightShoulder: Vec3;
  leftElbow: Vec3;
  rightElbow: Vec3;
  leftHip: Vec3;
  rightHip: Vec3;
  /** 21 points, MediaPipe hand order. */
  leftHand: Vec3[];
  rightHand: Vec3[];
}

export interface RigReference {
  cx: number;
  cy: number;
  cz: number;
  /** avatar units per image unit */
  scale: number;
}

const DEPTH_GAIN = 0.55; // MediaPipe pose depth is noisy; flatten it a little
const HAND_DEPTH_GAIN = 1.0;

function posePoint(pose: Float32Array, key: (typeof POSE_KEYS)[number]): Vec3 {
  const i = POSE_KEYS.indexOf(key) * 3;
  return [pose[i] ?? 0, pose[i + 1] ?? 0, pose[i + 2] ?? 0];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** A stable frame of reference for a whole clip (median over frames), so the body does not jitter. */
export function clipReference(clip: MotionClip): RigReference | null {
  const cx: number[] = [];
  const cy: number[] = [];
  const cz: number[] = [];
  const width: number[] = [];
  for (const frame of clip.frames) {
    if (!frame.pose) continue;
    const l = posePoint(frame.pose, 'leftShoulder');
    const r = posePoint(frame.pose, 'rightShoulder');
    cx.push((l[0] + r[0]) / 2);
    cy.push((l[1] + r[1]) / 2);
    cz.push((l[2] + r[2]) / 2);
    width.push(Math.hypot(l[0] - r[0], l[1] - r[1]));
  }
  if (width.length === 0) {
    // No body tracked (hands-only clip): assume a typical framing.
    const wrists = clip.frames.flatMap((f) => [f.left, f.right]).filter((h): h is Float32Array => Boolean(h));
    if (wrists.length === 0) return null;
    const x = median(wrists.map((h) => h[0] ?? 0));
    const y = median(wrists.map((h) => h[1] ?? 0));
    return { cx: x, cy: y - 0.3, cz: 0, scale: 1 / 0.45 };
  }
  const w = median(width);
  return { cx: median(cx), cy: median(cy), cz: median(cz), scale: w > 1e-4 ? 1 / w : 1 };
}

function toAvatar(p: Vec3, ref: RigReference, depthGain = DEPTH_GAIN): Vec3 {
  return [(p[0] - ref.cx) * ref.scale, -(p[1] - ref.cy) * ref.scale, -(p[2] - ref.cz) * ref.scale * depthGain];
}

// ------------------------------------------------------------------------ rest pose

/** A relaxed open hand, wrist at origin, fingers pointing down (-y), palm facing +z. */
function relaxedHand(side: 'left' | 'right'): Vec3[] {
  const s = side === 'left' ? 1 : -1; // thumb towards the body's midline
  const fingerX = [0.035, 0.012, -0.012, -0.034]; // index..pinky
  const lengths = [0.09, 0.1, 0.095, 0.08];
  const pts: Vec3[] = [[0, 0, 0]];
  // thumb: 1..4
  pts.push([s * 0.03, -0.03, 0.02], [s * 0.05, -0.06, 0.03], [s * 0.06, -0.085, 0.035], [s * 0.065, -0.105, 0.035]);
  for (let f = 0; f < 4; f += 1) {
    const x = s * (fingerX[f] ?? 0);
    const len = lengths[f] ?? 0.09;
    pts.push([x, -0.09, 0], [x, -0.09 - len * 0.45, 0.01], [x, -0.09 - len * 0.75, 0.015], [x, -0.09 - len, 0.018]);
  }
  return pts;
}

function offset(points: Vec3[], by: Vec3, scale = 1): Vec3[] {
  return points.map((p) => [p[0] * scale + by[0], p[1] * scale + by[1], p[2] * scale + by[2]]);
}

export function restRig(): Rig {
  const leftShoulder: Vec3 = [0.5, 0, 0];
  const rightShoulder: Vec3 = [-0.5, 0, 0];
  const leftElbow: Vec3 = [0.6, -0.62, 0.02];
  const rightElbow: Vec3 = [-0.6, -0.62, 0.02];
  const leftWrist: Vec3 = [0.62, -1.18, 0.08];
  const rightWrist: Vec3 = [-0.62, -1.18, 0.08];
  return {
    head: { center: [0, 0.62, 0], yaw: 0, pitch: 0, roll: 0 },
    neck: [0, 0.18, 0],
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHip: [0.36, -1.35, 0],
    rightHip: [-0.36, -1.35, 0],
    leftHand: offset(relaxedHand('left'), leftWrist, 2.2),
    rightHand: offset(relaxedHand('right'), rightWrist, 2.2),
  };
}

// ------------------------------------------------------------------- frame → rig

function handPoints(hand: Float32Array, ref: RigReference, wristZ: number): Vec3[] {
  const pts: Vec3[] = [];
  const wx = hand[0] ?? 0;
  const wy = hand[1] ?? 0;
  for (let i = 0; i < HAND_VALUES; i += 3) {
    const x = hand[i] ?? 0;
    const y = hand[i + 1] ?? 0;
    const z = hand[i + 2] ?? 0; // relative to the hand's own wrist
    pts.push([(x - ref.cx) * ref.scale, -(y - ref.cy) * ref.scale, wristZ - z * ref.scale * HAND_DEPTH_GAIN]);
  }
  // Keep the wrist exactly where the hand says it is (x,y) — that is the precise part.
  if (pts[0]) pts[0] = [(wx - ref.cx) * ref.scale, -(wy - ref.cy) * ref.scale, wristZ];
  return pts;
}

export function frameToRig(frame: MotionFrame | null, ref: RigReference | null): Rig {
  const rest = restRig();
  if (!frame || !ref) return rest;

  const rig: Rig = { ...rest, head: { ...rest.head } };
  let leftWristZ = rest.leftHand[0]?.[2] ?? 0;
  let rightWristZ = rest.rightHand[0]?.[2] ?? 0;

  if (frame.pose) {
    const p = (key: (typeof POSE_KEYS)[number]) => toAvatar(posePoint(frame.pose as Float32Array, key), ref);
    rig.leftShoulder = p('leftShoulder');
    rig.rightShoulder = p('rightShoulder');
    rig.leftElbow = p('leftElbow');
    rig.rightElbow = p('rightElbow');
    const lh = p('leftHip');
    const rh = p('rightHip');
    // Hips are often out of frame for a seated signer; keep them plausible.
    const mid: Vec3 = [(rig.leftShoulder[0] + rig.rightShoulder[0]) / 2, (rig.leftShoulder[1] + rig.rightShoulder[1]) / 2, 0];
    const hipsVisible = lh[1] < mid[1] - 0.8 && lh[1] > mid[1] - 2;
    rig.leftHip = hipsVisible ? lh : [mid[0] + 0.36, mid[1] - 1.35, 0];
    rig.rightHip = hipsVisible ? rh : [mid[0] - 0.36, mid[1] - 1.35, 0];
    leftWristZ = p('leftWrist')[2];
    rightWristZ = p('rightWrist')[2];

    const le = p('leftEar');
    const re = p('rightEar');
    const nose = p('nose');
    const earMid: Vec3 = [(le[0] + re[0]) / 2, (le[1] + re[1]) / 2, (le[2] + re[2]) / 2];
    const earSpan = Math.hypot(le[0] - re[0], le[1] - re[1]) || 0.3;
    rig.head = {
      center: [earMid[0], earMid[1] + 0.05, earMid[2]],
      yaw: Math.max(-0.9, Math.min(0.9, ((nose[0] - earMid[0]) / earSpan) * 1.6)),
      pitch: Math.max(-0.5, Math.min(0.5, ((earMid[1] - nose[1]) / earSpan - 0.25) * 1.2)),
      roll: Math.atan2(le[1] - re[1], le[0] - re[0]),
    };
    rig.neck = [mid[0], mid[1] + 0.16, mid[2]];

    // No hand tracked but the body is: relaxed hand at the pose wrist, along the forearm.
    const lw = p('leftWrist');
    const rw = p('rightWrist');
    if (!frame.left) rig.leftHand = offset(relaxedHand('left'), lw, 2.2);
    if (!frame.right) rig.rightHand = offset(relaxedHand('right'), rw, 2.2);
  }

  if (frame.left) rig.leftHand = handPoints(frame.left, ref, leftWristZ);
  if (frame.right) rig.rightHand = handPoints(frame.right, ref, rightWristZ);
  // Elbows bend outward and down by default; the tracked elbow (if any) refines the direction.
  const outLeft: Vec3 = add(rig.leftShoulder, [0.6, -0.8, -0.2]);
  const outRight: Vec3 = add(rig.rightShoulder, [-0.6, -0.8, -0.2]);
  const poleLeft = frame.pose ? add(scale(rig.leftElbow, 0.5), scale(outLeft, 0.5)) : outLeft;
  const poleRight = frame.pose ? add(scale(rig.rightElbow, 0.5), scale(outRight, 0.5)) : outRight;
  return withIk(rig, poleLeft, poleRight);
}

// -------------------------------------------------------------------------- arms (IK)

/** Human proportions in shoulder-width units (upper arm ≈ 0.78, forearm ≈ 0.70). */
export const UPPER_ARM = 0.78;
export const FOREARM = 0.7;

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Two-bone IK: place the elbow so the upper arm and forearm keep human lengths while the
 * wrist stays EXACTLY where the tracked hand is. The bend direction comes from `pole`
 * (the tracked elbow when available). Tracked elbows are often outside the camera frame
 * and wildly off, which is why they are only used as a hint, never as a position.
 */
export function solveElbow(shoulder: Vec3, wrist: Vec3, pole: Vec3, upper = UPPER_ARM, fore = FOREARM): Vec3 {
  const toWrist = sub(wrist, shoulder);
  let d = len(toWrist);
  if (d < 1e-6) return add(shoulder, [0, -upper, 0]);
  // Out of reach (tracking noise or a fully extended arm): straighten, proportionally.
  if (d >= upper + fore) {
    return add(shoulder, scale(toWrist, upper / (upper + fore)));
  }
  d = Math.max(d, Math.abs(upper - fore) + 1e-4);
  const axis = scale(toWrist, 1 / d);
  // Distance along the shoulder→wrist axis to the elbow's projection, and the bend height.
  const a = (upper * upper - fore * fore + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
  // Bend towards the pole, perpendicular to the axis.
  let bend = sub(sub(pole, shoulder), scale(axis, dot(sub(pole, shoulder), axis)));
  if (len(bend) < 1e-4) bend = sub([0, -1, 0.3], scale(axis, dot([0, -1, 0.3], axis)));
  bend = scale(bend, 1 / (len(bend) || 1));
  return add(add(shoulder, scale(axis, a)), scale(bend, h));
}

function withIk(rig: Rig, poleLeft: Vec3, poleRight: Vec3): Rig {
  const lw = rig.leftHand[0] ?? rig.leftElbow;
  const rw = rig.rightHand[0] ?? rig.rightElbow;
  return {
    ...rig,
    leftElbow: solveElbow(rig.leftShoulder, lw, poleLeft),
    rightElbow: solveElbow(rig.rightShoulder, rw, poleRight),
  };
}

// ------------------------------------------------------------------------- blending

function lerp3(a: Vec3, b: Vec3, w: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
}

/** Smoothly blend two rigs (w = 0 → a, 1 → b). Used for transitions between signs. */
export function blendRigs(a: Rig, b: Rig, w: number): Rig {
  const e = w * w * (3 - 2 * w); // smoothstep: no jerk at either end
  return {
    head: {
      center: lerp3(a.head.center, b.head.center, e),
      yaw: a.head.yaw + (b.head.yaw - a.head.yaw) * e,
      pitch: a.head.pitch + (b.head.pitch - a.head.pitch) * e,
      roll: a.head.roll + (b.head.roll - a.head.roll) * e,
    },
    neck: lerp3(a.neck, b.neck, e),
    leftShoulder: lerp3(a.leftShoulder, b.leftShoulder, e),
    rightShoulder: lerp3(a.rightShoulder, b.rightShoulder, e),
    leftElbow: lerp3(a.leftElbow, b.leftElbow, e),
    rightElbow: lerp3(a.rightElbow, b.rightElbow, e),
    leftHip: lerp3(a.leftHip, b.leftHip, e),
    rightHip: lerp3(a.rightHip, b.rightHip, e),
    leftHand: a.leftHand.map((p, i) => lerp3(p, b.leftHand[i] ?? p, e)),
    rightHand: a.rightHand.map((p, i) => lerp3(p, b.rightHand[i] ?? p, e)),
  };
}
