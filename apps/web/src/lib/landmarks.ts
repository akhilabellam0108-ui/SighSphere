/**
 * MediaPipe wrapper. The ONLY file in the app that imports @mediapipe/tasks-vision.
 *
 * Everything downstream consumes the RawFrame shape from features.ts, so MediaPipe can be
 * swapped out by rewriting this file alone.
 */

import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Point3, RawFrame } from './features.js';

/**
 * Hosted WASM + model assets.
 *
 * TODO (Week 16, offline support): vendor these into public/mediapipe/ and point at local
 * paths. As written, first load requires network access — which breaks the offline
 * promise in a classroom with no Wi-Fi.
 */
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

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
}

export class LandmarkTracker {
  private hand: HandLandmarker | null = null;
  private pose: PoseLandmarker | null = null;
  private lastTimestamp = -1;
  private options: Required<TrackerOptions>;

  constructor(options: TrackerOptions = {}) {
    this.options = {
      dominantHand: options.dominantHand ?? 'right',
      mirrored: options.mirrored ?? true,
      handsOnly: options.handsOnly ?? false,
    };
  }

  get ready(): boolean {
    return this.hand !== null;
  }

  setDominantHand(hand: DominantHand): void {
    this.options.dominantHand = hand;
  }

  async init(): Promise<void> {
    if (this.hand) return;
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

    this.hand = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    if (!this.options.handsOnly) {
      this.pose = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    }
  }

  /**
   * Run detection on the current video frame.
   * @returns null if the tracker is not ready or the timestamp did not advance
   *   (MediaPipe's VIDEO mode requires strictly increasing timestamps).
   */
  detect(video: HTMLVideoElement, timestampMs: number): TrackedFrame | null {
    if (!this.hand || timestampMs <= this.lastTimestamp) return null;
    this.lastTimestamp = timestampMs;

    const handResult = this.hand.detectForVideo(video, timestampMs);
    const poseResult = this.pose?.detectForVideo(video, timestampMs);

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

    const pose = poseResult?.landmarks?.[0]
      ? poseResult.landmarks[0].map((p) => ({ x: p.x, y: p.y, z: p.z }))
      : null;

    return { dominant, nonDominant, pose, hands, handedness, timestampMs };
  }

  close(): void {
    this.hand?.close();
    this.pose?.close();
    this.hand = null;
    this.pose = null;
    this.lastTimestamp = -1;
  }
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
