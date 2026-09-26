/**
 * MediaPipe wrapper. The ONLY file in the app that imports @mediapipe/tasks-vision.
 *
 * Everything downstream consumes the RawFrame shape from features.ts, so MediaPipe can be
 * swapped out by rewriting this file alone.
 */

import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Point3, RawFrame } from './features.js';
import { asset } from './base.js';

/**
 * WASM + model assets.
 *
 * Served from this app (public/mediapipe/, filled by `npm run setup:mediapipe`) so the
 * service worker precaches them and recognition works offline without depending on a CDN.
 * Falls back to the hosted copies when the local files are not present.
 */
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm';
const CDN_HAND =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CDN_POSE =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LOCAL_WASM = asset('mediapipe/wasm');
const LOCAL_HAND = asset('mediapipe/models/hand_landmarker.task');
const LOCAL_POSE = asset('mediapipe/models/pose_landmarker_lite.task');

interface Assets {
  wasm: string;
  hand: string;
  pose: string;
}

async function isLocal(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    // An SPA server answers unknown paths with index.html — that is "missing", not "present".
    return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

let assets: Promise<Assets> | null = null;
function resolveAssets(): Promise<Assets> {
  assets ??= Promise.all([isLocal(`${LOCAL_WASM}/vision_wasm_internal.wasm`), isLocal(LOCAL_HAND), isLocal(LOCAL_POSE)]).then(
    ([wasm, hand, pose]) => ({
      wasm: wasm ? LOCAL_WASM : CDN_WASM,
      hand: hand ? LOCAL_HAND : CDN_HAND,
      pose: pose ? LOCAL_POSE : CDN_POSE,
    }),
  );
  return assets;
}

export type DominantHand = 'left' | 'right';

export interface TrackedFrame extends RawFrame {
  /** All detected hands, for drawing the overlay. */
  hands: Point3[][];
  handedness: string[];
}

export interface TrackerOptions {
  dominantHand?: DominantHand;
  /**
   * MediaPipe assigns handedness as though the image were mirrored, which is what you want
   * for a selfie view. If the dominant/non-dominant assignment comes out backwards on a
   * given device, flip this rather than editing the mapping logic.
   */
  mirrored?: boolean;
  /** Skip pose detection. Roughly halves CPU cost, at a real accuracy penalty. */
  handsOnly?: boolean;
  /**
   * Where tracking runs. 'auto' tries the graphics chip and falls back to the main
   * processor if that fails. Some laptops have slow or broken graphics drivers, where 'cpu'
   * is several times faster.
   */
  processor?: 'auto' | 'gpu' | 'cpu';
}

export class LandmarkTracker {
  private hand: HandLandmarker | null = null;
  private pose: PoseLandmarker | null = null;
  private lastTimestamp = -1;
  private options: Required<TrackerOptions>;
  private create: ((delegate: 'GPU' | 'CPU') => Promise<{ hand: HandLandmarker; pose: PoseLandmarker | null }>) | null = null;
  private delegateInUse: 'GPU' | 'CPU' = 'GPU';
  /** Recent per-frame detection times (ms), used to pick the faster processor. */
  private timings: number[] = [];
  private balance: 'measuring' | 'trying-cpu' | 'done' = 'measuring';
  private gpuAverage = 0;
  private parked: { hand: HandLandmarker; pose: PoseLandmarker | null } | null = null;
  private frameCount = 0;
  private lastPose: Point3[] | null = null;

  constructor(options: TrackerOptions = {}) {
    this.options = {
      dominantHand: options.dominantHand ?? 'right',
      mirrored: options.mirrored ?? true,
      handsOnly: options.handsOnly ?? false,
      processor: options.processor ?? 'auto',
    };
  }

  get ready(): boolean {
    return this.hand !== null;
  }

  /** Which processor tracking is currently running on. */
  get delegate(): 'GPU' | 'CPU' {
    return this.delegateInUse;
  }

  setDominantHand(hand: DominantHand): void {
    this.options.dominantHand = hand;
  }

  async init(): Promise<void> {
    if (this.hand) return;
    const { wasm, hand: handModel, pose: poseModel } = await resolveAssets();
    const fileset = await FilesetResolver.forVisionTasks(wasm);

    const create = async (delegate: 'GPU' | 'CPU') => {
      const hand = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: handModel, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        // Lower presence/tracking thresholds keep a hand locked on through fast movement
        // and partly-closed fingers, instead of dropping it and re-detecting from scratch
        // (which is both slower and loses points).
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.3,
      });
      const pose = this.options.handsOnly
        ? null
        : await PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: poseModel, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
      return { hand, pose };
    };

    this.create = create;
    const { processor } = this.options;
    let created;
    if (processor === 'cpu') {
      created = await create('CPU');
      this.delegateInUse = 'CPU';
      this.balance = 'done';
    } else {
      try {
        created = await create('GPU');
        this.delegateInUse = 'GPU';
        if (processor === 'gpu') this.balance = 'done';
      } catch (error) {
        if (processor === 'gpu') throw error;
        created = await create('CPU'); // no usable WebGL: the main processor still works
        this.delegateInUse = 'CPU';
        this.balance = 'done';
      }
    }
    this.hand = created.hand;
    this.pose = created.pose;
  }

  /**
   * 'auto' mode: many laptops (integrated graphics, old drivers) track far faster on the
   * main processor than on the graphics chip. If the graphics chip is slow, try the main
   * processor for a moment and keep whichever is actually faster on this device.
   */
  private rebalance(ms: number): void {
    if (this.balance === 'done' || !this.create) return;
    this.timings.push(ms);
    if (this.balance === 'measuring') {
      // Decide quickly: on a slow device every frame counts. The first few are warm-up.
      if (this.timings.length < 10) return;
      const avg = average(this.timings.slice(3));
      if (avg < 35) {
        this.balance = 'done'; // fast enough (~25+ fps): leave it
        return;
      }
      this.gpuAverage = avg;
      this.balance = 'trying-cpu';
      this.timings = [];
      const create = this.create;
      void create('CPU')
        .then((cpu) => {
          if (!this.hand) {
            cpu.hand.close();
            cpu.pose?.close();
            return;
          }
          this.parked = { hand: this.hand, pose: this.pose };
          this.hand = cpu.hand;
          this.pose = cpu.pose;
          this.delegateInUse = 'CPU';
          this.lastTimestamp = -1;
          this.timings = [];
        })
        .catch(() => {
          this.balance = 'done';
        });
      return;
    }
    // trying-cpu: wait until the CPU models are in, then measure them.
    if (!this.parked || this.timings.length < 10) return;
    const cpuAverage = average(this.timings.slice(3));
    if (cpuAverage < this.gpuAverage * 0.85) {
      this.parked.hand.close();
      this.parked.pose?.close();
    } else {
      this.hand?.close();
      this.pose?.close();
      this.hand = this.parked.hand;
      this.pose = this.parked.pose;
      this.delegateInUse = 'GPU';
      this.lastTimestamp = -1;
    }
    this.parked = null;
    this.balance = 'done';
  }

  /**
   * Run detection on the current video frame.
   * @returns null if the tracker is not ready or the timestamp did not advance
   *   (MediaPipe's VIDEO mode requires strictly increasing timestamps).
   */
  detect(video: HTMLVideoElement, timestampMs: number): TrackedFrame | null {
    if (!this.hand || timestampMs <= this.lastTimestamp) return null;
    this.lastTimestamp = timestampMs;
    const started = performance.now();

    const handResult = this.hand.detectForVideo(video, timestampMs);
    // The body moves far less than the fingers, so pose runs on every other frame and the
    // last result is reused in between. Nearly halves the cost of each frame, which is what
    // lets slow laptops track (and record) enough frames.
    this.frameCount += 1;
    const runPose = this.pose && (this.frameCount % 2 === 1 || !this.lastPose);
    const poseResult = runPose ? this.pose?.detectForVideo(video, timestampMs) : undefined;

    const hands: Point3[][] = handResult.landmarks.map((set) =>
      set.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    );
    const handedness = handResult.handedness.map((set) => set[0]?.categoryName ?? 'Unknown');

    // Canonicalise to dominant / non-dominant so left- and right-dominant signers land in
    // the same feature space. This is what lets a model trained mostly on right-dominant
    // signers work at all for left-dominant users.
    let dominant: Point3[] | null = null;
    let nonDominant: Point3[] | null = null;

    for (let i = 0; i < hands.length; i += 1) {
      const points = hands[i];
      if (!points) continue;
      const label = handedness[i];
      const isUsersRightHand = this.options.mirrored ? label === 'Left' : label === 'Right';
      const isDominant =
        this.options.dominantHand === 'right' ? isUsersRightHand : !isUsersRightHand;
      if (isDominant && !dominant) dominant = points;
      else if (!nonDominant) nonDominant = points;
    }

    let pose: Point3[] | null;
    if (runPose) {
      pose = poseResult?.landmarks?.[0] ? poseResult.landmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z })) : null;
      this.lastPose = pose;
    } else {
      pose = this.lastPose;
    }

    this.rebalance(performance.now() - started);

    return { dominant, nonDominant, pose, hands, handedness, timestampMs };
  }

  close(): void {
    this.hand?.close();
    this.pose?.close();
    this.parked?.hand.close();
    this.parked?.pose?.close();
    this.parked = null;
    this.hand = null;
    this.pose = null;
    this.lastPose = null;
    this.lastTimestamp = -1;
  }
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Hand skeleton edges, for drawing the overlay. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm
];

export interface CameraStreamResult {
  stream: MediaStream | null;
  /** Human-readable, actionable message. Never surface a raw DOMException to a user. */
  error: string | null;
}

/** Request the camera with messages a real user can act on. */
export async function requestCamera(): Promise<CameraStreamResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      error:
        'This browser cannot access the camera. Try Chrome, Edge, or Safari — and make sure the page is on https:// or localhost.',
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    return { stream, error: null };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : 'Unknown';
    const messages: Record<string, string> = {
      NotAllowedError:
        'Camera permission was denied. Open your browser’s site settings, allow the camera, then reload.',
      NotFoundError: 'No camera was found. Connect a webcam or try a device with a front camera.',
      NotReadableError:
        'The camera is in use by another app. Close Zoom, Meet, or Teams and try again.',
      OverconstrainedError: 'This camera does not support the requested resolution.',
      SecurityError: 'Camera access needs a secure page. Use https:// or localhost.',
    };
    return { stream: null, error: messages[name] ?? `Could not start the camera (${name}).` };
  }
}
