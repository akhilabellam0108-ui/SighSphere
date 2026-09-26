/**
 * In-browser INCLUDE importer.
 *
 * The user selects the folder where they unzipped INCLUDE (Category/NN. Word/*.MOV). For
 * every video of the chosen signs this runs the SAME tracker the live camera uses
 * (landmarks.ts), producing:
 *   - recognition examples: encodeFrame → trimmed to the signing → resampled window
 *   - avatar motion: captureFrame → cleaned clip (the most typical take per sign)
 * No Python, no upload: everything happens on this computer.
 */

import vocabulary from '../data/include-vocabulary.json';
import { FRAME_DIM, OFFSET, encodeFrame, l2Normalize, resampleWindow } from './features.js';
import { LandmarkTracker, type TrackedFrame } from './landmarks.js';
import { captureFrame, cleanClip, encodeClip, type MotionFrame } from './motion.js';
import { INCLUDE_ATTRIBUTION, PACK_FORMAT, PACK_FORMAT_VERSION, quantize, type SignPack } from './signPack.js';
import { FEATURE_VERSION, WINDOW_FRAMES } from './features.js';

export interface VocabEntry {
  label: string;
  category: string;
  folder: string;
  gloss: string;
}

export const INCLUDE_SIGNS: VocabEntry[] = (vocabulary as { signs: VocabEntry[] }).signs;

/** Emergency-relevant INCLUDE signs, offered as a quick first import. */
export const SOS_GLOSSES = ['HOSPITAL', 'DOCTOR', 'POLICE', 'MEDICINE', 'SICK', 'DEAF', 'HELLO', 'THANK-YOU', 'MOTHER', 'FATHER', 'TELEPHONE', 'HOME'];

const VIDEO_EXT = /\.(mov|mp4|m4v|webm|avi|mkv)$/i;

export function folderLabel(folder: string): string {
  return folder.replace(/[^A-Za-z]/g, '').toLowerCase();
}

export interface SignGroup {
  entry: VocabEntry;
  files: File[];
}

export interface ScanResult {
  groups: SignGroup[];
  unmatchedFolders: string[];
  videoCount: number;
}

/** Group the selected files by INCLUDE sign using their folder names. */
export function scanFiles(files: ArrayLike<File>): ScanResult {
  const byLabel = new Map(INCLUDE_SIGNS.map((entry) => [entry.label, entry]));
  const groups = new Map<string, SignGroup>();
  const unmatched = new Set<string>();
  let videoCount = 0;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i] as File;
    if (!VIDEO_EXT.test(file.name)) continue;
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = path.split('/');
    const folder = parts[parts.length - 2] ?? '';
    const entry = byLabel.get(folderLabel(folder));
    if (!entry) {
      if (folder) unmatched.add(folder);
      continue;
    }
    videoCount += 1;
    const group = groups.get(entry.label) ?? { entry, files: [] };
    group.files.push(file);
    groups.set(entry.label, group);
  }
  for (const group of groups.values()) group.files.sort((a, b) => a.name.localeCompare(b.name));
  return {
    groups: [...groups.values()].sort((a, b) => a.entry.gloss.localeCompare(b.entry.gloss)),
    unmatchedFolders: [...unmatched].sort(),
    videoCount,
  };
}

export interface VideoResult {
  /** Resampled window, or null if hands were not tracked. */
  window: Float32Array | null;
  sourceFrames: number;
  motion: MotionFrame[];
}

const SAMPLE_FPS = 15; // matches typical live tracking rate, so windows look like live ones

function waitFor(target: EventTarget, event: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.removeEventListener(event, done);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function done() {
      clearTimeout(timer);
      target.removeEventListener(event, done);
      resolve();
    }
    target.addEventListener(event, done, { once: true });
  });
}

/**
 * Track one video by stepping through it at SAMPLE_FPS (seek → detect). Deterministic and
 * independent of CPU speed, unlike playing it in real time.
 */
export async function trackVideo(file: File, tracker: LandmarkTracker, clock: { t: number }, signal?: AbortSignal): Promise<VideoResult> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(file);
  try {
    video.src = url;
    await waitFor(video, 'loadeddata');
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const encoded: Float32Array[] = [];
    const present: boolean[] = [];
    const motion: MotionFrame[] = [];
    const scratch = new Float32Array(FRAME_DIM);

    for (let time = 0; time <= duration; time += 1 / SAMPLE_FPS) {
      if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');
      video.currentTime = Math.min(time, Math.max(0, duration - 0.001));
      await waitFor(video, 'seeked');
      clock.t += 1000 / SAMPLE_FPS; // MediaPipe VIDEO mode needs strictly increasing time
      const frame: TrackedFrame | null = tracker.detect(video, clock.t);
      if (!frame) continue;
      const vector = encodeFrame(frame, scratch).slice();
      encoded.push(vector);
      present.push(vector[OFFSET.dominantPresent] === 1 || vector[OFFSET.nonDominantPresent] === 1);
      motion.push(captureFrame(frame, time * 1000, aspect));
    }

    const first = present.indexOf(true);
    const last = present.lastIndexOf(true);
    if (first === -1 || last - first < 4) return { window: null, sourceFrames: 0, motion: [] };
    const trimmed = encoded.slice(Math.max(0, first - 2), Math.min(encoded.length, last + 3));
    return { window: resampleWindow(trimmed), sourceFrames: trimmed.length, motion };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

export interface SignResult {
  gloss: string;
  category: string;
  videos: number;
  usable: number;
  windows: Float32Array[];
  sourceFrames: number[];
  /** Encoded motion of the most typical take. */
  motion: string | null;
}

/** Combine one sign's videos: keep every usable window; choose the medoid take for the avatar. */
export function summariseSign(entry: VocabEntry, results: VideoResult[]): SignResult {
  const usable = results.filter((r) => r.window);
  const windows = usable.map((r) => l2Normalize((r.window as Float32Array).slice()));
  let motion: string | null = null;
  if (windows.length > 0) {
    const mean = new Float32Array(windows[0]?.length ?? 0);
    windows.forEach((w) => w.forEach((value, i) => (mean[i] = (mean[i] ?? 0) + value)));
    const centroid = l2Normalize(mean);
    let best = 0;
    windows.forEach((w, i) => {
      if (cosine(w, centroid) > cosine(windows[best] as Float32Array, centroid)) best = i;
    });
    const clip = cleanClip(usable[best]?.motion ?? []);
    if (clip.frames.length >= 4) motion = encodeClip(clip);
  }
  return {
    gloss: entry.gloss,
    category: entry.category,
    videos: results.length,
    usable: usable.length,
    windows,
    sourceFrames: usable.map((r) => r.sourceFrames),
    motion,
  };
}

/** Average windows in `groups` groups — exactly what the template classifier does with them. */
export function groupWindows(windows: Float32Array[], groups: number): Float32Array[] {
  const n = Math.min(groups, windows.length);
  const out: Float32Array[] = [];
  for (let g = 0; g < n; g += 1) {
    const sum = new Float32Array(windows[0]?.length ?? 0);
    for (let i = g; i < windows.length; i += n) (windows[i] as Float32Array).forEach((v, k) => (sum[k] = (sum[k] ?? 0) + v));
    out.push(l2Normalize(sum));
  }
  return out;
}

export function buildPack(results: SignResult[], groups = 4): SignPack {
  const signs: SignPack['signs'] = {};
  const samples: SignPack['samples'] = [];
  const motions: SignPack['motions'] = [];
  for (const result of results) {
    if (result.usable === 0) continue;
    signs[result.gloss] = { videos: result.usable, category: result.category };
    const frames = Math.round(result.sourceFrames.reduce((a, b) => a + b, 0) / Math.max(1, result.sourceFrames.length));
    for (const window of groupWindows(result.windows, groups)) samples.push({ label: result.gloss, sourceFrames: frames, ...quantize(window) });
    if (result.motion) motions.push({ gloss: result.gloss, clip: result.motion });
  }
  return {
    format: PACK_FORMAT,
    formatVersion: PACK_FORMAT_VERSION,
    id: 'isl-include',
    version: new Date().toISOString(),
    name: 'Indian Sign Language — INCLUDE',
    language: 'isl',
    featureVersion: FEATURE_VERSION,
    windowFrames: WINDOW_FRAMES,
    frameDim: FRAME_DIM,
    source: 'INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition (ACM MM 2020)',
    sourceUrl: 'https://zenodo.org/records/4010759',
    license: 'CC-BY-4.0',
    attribution: INCLUDE_ATTRIBUTION,
    signs,
    samples,
    motions,
  };
}
