/**
 * Landmark feature extraction. THE ML CONTRACT.
 *
 * ============================== KEEP IN SYNC ==============================
 * services/ml/features.py must produce byte-identical vectors to this file.
 * A mismatch between the two is the single most common cause of "95% in Colab,
 * useless in the browser". There is a parity test — run it after every change here.
 *
 * Any change to the layout below invalidates every trained model AND every recorded
 * sample. Bump FEATURE_VERSION when you change it.
 * =========================================================================
 *
 * Pure functions only: no DOM, no MediaPipe import, no I/O. That is what makes this file
 * testable and mirrorable in Python.
 */

export const FEATURE_VERSION = 1;

export const HAND_POINTS = 21;
/** MediaPipe pose landmarks 0..24 — face + upper body. Legs carry no signing information. */
export const POSE_POINTS = 25;
export const WINDOW_FRAMES = 32;

/** MediaPipe hand landmark indices we rely on by name. */
const WRIST = 0;
const MIDDLE_MCP = 9;
/** MediaPipe pose landmark indices. */
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

/**
 * Per-frame vector layout. Offsets are explicit so the Python mirror can assert on them.
 *
 *   [  0]        dominant hand present (0 or 1)
 *   [  1.. 63]   dominant hand, wrist-relative + scale-normalised xyz (21 x 3)
 *   [ 64]        non-dominant hand present (0 or 1)
 *   [ 65..127]   non-dominant hand, wrist-relative + scale-normalised xyz (21 x 3)
 *   [128..130]   dominant wrist position relative to shoulder midpoint (shoulder-normalised)
 *   [131..133]   non-dominant wrist position relative to shoulder midpoint
 *   [134..136]   inter-hand vector (non-dominant wrist -> dominant wrist)
 *   [137]        inter-hand distance
 *   [138..212]   upper-body pose, shoulder-centred + shoulder-normalised xyz (25 x 3)
 *
 * Why 128..137 exist: ISL uses *location in signing space* meaningfully (a sign at the
 * forehead differs from the same handshape at the chest), and two-handed signs with
 * hand-to-hand contact are far more common in ISL than in ASL. Normalising position away
 * would delete exactly the information that distinguishes many signs. Do not "simplify"
 * this block out.
 */
export const OFFSET = {
  dominantPresent: 0,
  dominantHand: 1,
  nonDominantPresent: 64,
  nonDominantHand: 65,
  dominantAbs: 128,
  nonDominantAbs: 131,
  interHandVector: 134,
  interHandDistance: 137,
  pose: 138,
} as const;

export const FRAME_DIM = OFFSET.pose + POSE_POINTS * 3; // 213
export const WINDOW_DIM = FRAME_DIM * WINDOW_FRAMES; // 6816

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * One tracked frame, already canonicalised to dominant / non-dominant hand.
 * See landmarks.ts for how MediaPipe's Left/Right labels are mapped onto this.
 */
export interface RawFrame {
  dominant: Point3[] | null;
  nonDominant: Point3[] | null;
  /** MediaPipe pose landmarks, at least the first 25. */
  pose: Point3[] | null;
  timestampMs: number;
}

function distance(a: Point3, b: Point3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Wrist-relative, scale-normalised hand. Makes handshape invariant to where the hand is in
 * frame and how far the signer sits from the camera.
 */
export function normalizeHand(points: Point3[], out: Float32Array, offset: number): void {
  const wrist = points[WRIST];
  const middle = points[MIDDLE_MCP];
  if (!wrist || !middle) return;

  // Hand span as the scale reference. Guard against a degenerate zero span.
  const span = distance(wrist, middle) || 1;

  for (let i = 0; i < HAND_POINTS; i += 1) {
    const p = points[i];
    const base = offset + i * 3;
    if (!p) {
      out[base] = 0;
      out[base + 1] = 0;
      out[base + 2] = 0;
      continue;
    }
    out[base] = (p.x - wrist.x) / span;
    out[base + 1] = (p.y - wrist.y) / span;
    out[base + 2] = (p.z - wrist.z) / span;
  }
}

interface Torso {
  centre: Point3;
  scale: number;
}

function torsoFrame(pose: Point3[] | null): Torso | null {
  if (!pose) return null;
  const left = pose[LEFT_SHOULDER];
  const right = pose[RIGHT_SHOULDER];
  if (!left || !right) return null;
  return {
    centre: {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
      z: (left.z + right.z) / 2,
    },
    scale: distance(left, right) || 1,
  };
}

/** Encode one frame into FRAME_DIM floats. */
export function encodeFrame(frame: RawFrame, out = new Float32Array(FRAME_DIM)): Float32Array {
  out.fill(0);
  const torso = torsoFrame(frame.pose);

  if (frame.dominant) {
    out[OFFSET.dominantPresent] = 1;
    normalizeHand(frame.dominant, out, OFFSET.dominantHand);
  }
  if (frame.nonDominant) {
    out[OFFSET.nonDominantPresent] = 1;
    normalizeHand(frame.nonDominant, out, OFFSET.nonDominantHand);
  }

  // Absolute signing-space position of each wrist, relative to the torso.
  if (torso) {
    const dominantWrist = frame.dominant?.[WRIST];
    if (dominantWrist) {
      out[OFFSET.dominantAbs] = (dominantWrist.x - torso.centre.x) / torso.scale;
      out[OFFSET.dominantAbs + 1] = (dominantWrist.y - torso.centre.y) / torso.scale;
      out[OFFSET.dominantAbs + 2] = (dominantWrist.z - torso.centre.z) / torso.scale;
    }
    const otherWrist = frame.nonDominant?.[WRIST];
    if (otherWrist) {
      out[OFFSET.nonDominantAbs] = (otherWrist.x - torso.centre.x) / torso.scale;
      out[OFFSET.nonDominantAbs + 1] = (otherWrist.y - torso.centre.y) / torso.scale;
      out[OFFSET.nonDominantAbs + 2] = (otherWrist.z - torso.centre.z) / torso.scale;
    }

    for (let i = 0; i < POSE_POINTS; i += 1) {
      const p = frame.pose?.[i];
      const base = OFFSET.pose + i * 3;
      if (!p) continue;
      out[base] = (p.x - torso.centre.x) / torso.scale;
      out[base + 1] = (p.y - torso.centre.y) / torso.scale;
      out[base + 2] = (p.z - torso.centre.z) / torso.scale;
    }
  }

  // Inter-hand geometry: contact and relative placement carry meaning in two-handed signs.
  const a = frame.dominant?.[WRIST];
  const b = frame.nonDominant?.[WRIST];
  if (a && b) {
    const scale = torso?.scale ?? 1;
    out[OFFSET.interHandVector] = (a.x - b.x) / scale;
    out[OFFSET.interHandVector + 1] = (a.y - b.y) / scale;
    out[OFFSET.interHandVector + 2] = (a.z - b.z) / scale;
    out[OFFSET.interHandDistance] = distance(a, b) / scale;
  }

  return out;
}

/**
 * Resample a variable-length sequence of encoded frames to exactly WINDOW_FRAMES using
 * nearest-neighbour index sampling. Nearest-neighbour rather than interpolation because
 * interpolating between two distinct handshapes produces a handshape that never occurred.
 */
export function resampleWindow(frames: Float32Array[], target = WINDOW_FRAMES): Float32Array {
  const out = new Float32Array(FRAME_DIM * target);
  if (frames.length === 0) return out;

  for (let i = 0; i < target; i += 1) {
    const sourceIndex =
      frames.length === 1
        ? 0
        : Math.min(frames.length - 1, Math.round((i * (frames.length - 1)) / (target - 1)));
    const frame = frames[sourceIndex];
    if (frame) out.set(frame, i * FRAME_DIM);
  }
  return out;
}

/**
 * Rolling buffer of encoded frames, for live prediction. Keeps the most recent
 * `capacity` frames and produces a fixed-size window on demand.
 */
export class FeatureWindow {
  private frames: Float32Array[] = [];

  constructor(private readonly capacity = WINDOW_FRAMES * 2) {}

  push(frame: RawFrame): void {
    this.frames.push(encodeFrame(frame, new Float32Array(FRAME_DIM)));
    if (this.frames.length > this.capacity) this.frames.shift();
  }

  /**
   * Push an already-encoded frame. Use this when the caller also needs the encoded vector
   * (e.g. to feed SignSegmenter) so the frame is encoded once, not twice.
   */
  pushEncoded(encoded: Float32Array): void {
    this.frames.push(encoded.slice());
    if (this.frames.length > this.capacity) this.frames.shift();
  }

  get length(): number {
    return this.frames.length;
  }

  /** Enough frames to be worth classifying? Roughly a third of a second. */
  isReady(minFrames = 10): boolean {
    return this.frames.length >= minFrames;
  }

  build(): Float32Array {
    return resampleWindow(this.frames);
  }

  /** Copy of the raw encoded frames, for saving a training sample. */
  snapshot(): Float32Array[] {
    return this.frames.map((f) => f.slice());
  }

  clear(): void {
    this.frames = [];
  }
}

/**
 * Detects sign boundaries from motion so the user does not have to press a button for each
 * sign. Deliberately simple: hands appear + move, then movement drops below a threshold
 * for `quietFrames` consecutive frames => the sign has ended.
 *
 * Tune the thresholds on real users, not on yourself — everyone signs at their own speed,
 * and learners in particular pause mid-sign. Expose them in Settings for the pilot.
 */
export class SignSegmenter {
  private previous: Float32Array | null = null;
  private quiet = 0;
  private active = false;

  constructor(
    private readonly moveThreshold = 0.035,
    private readonly quietFrames = 8,
  ) {}

  /** @returns 'start' | 'end' | null — a transition, if one just happened. */
  update(encoded: Float32Array): 'start' | 'end' | null {
    const handsPresent =
      encoded[OFFSET.dominantPresent] === 1 || encoded[OFFSET.nonDominantPresent] === 1;
    const energy = this.previous ? meanAbsoluteDifference(this.previous, encoded) : 0;
    this.previous = encoded.slice();

    if (!this.active) {
      if (handsPresent && energy > this.moveThreshold) {
        this.active = true;
        this.quiet = 0;
        return 'start';
      }
      return null;
    }

    if (!handsPresent || energy < this.moveThreshold) {
      this.quiet += 1;
      if (this.quiet >= this.quietFrames) {
        this.active = false;
        this.quiet = 0;
        return 'end';
      }
    } else {
      this.quiet = 0;
    }
    return null;
  }

  get isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.previous = null;
    this.quiet = 0;
    this.active = false;
  }
}

function meanAbsoluteDifference(a: Float32Array, b: Float32Array): number {
  // Compare only the hand blocks: pose jitter and camera shake would otherwise read as
  // signing motion.
  let sum = 0;
  let count = 0;
  for (let i = OFFSET.dominantHand; i < OFFSET.dominantAbs; i += 1) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    count += 1;
  }
  return count ? sum / count : 0;
}

/** L2-normalise in place; used by the template classifier's cosine similarity. */
export function l2Normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += (vector[i] ?? 0) ** 2;
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < vector.length; i += 1) vector[i] = (vector[i] ?? 0) / norm;
  return vector;
}
