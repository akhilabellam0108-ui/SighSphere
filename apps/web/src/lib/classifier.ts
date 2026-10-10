/**
 * Sign classifiers behind one interface, so no UI code changes when the model changes.
 *
 * Two implementations:
 *   TemplateClassifier — cosine similarity to per-class centroids built from samples the
 *     user recorded locally. No training run, no server, works in Week 3. This is the
 *     documented BASELINE, not the shipping model: it has no temporal modelling beyond the
 *     fixed window and it degrades quickly past ~20 classes.
 *   OnnxClassifier — a trained model (services/ml/train.py, or the train-model GitHub
 *     workflow) exported to ONNX, run on the device with onnxruntime-web.
 *
 * Report both numbers in the writeup. A trained model that cannot beat the template
 * baseline means the bug is in the data pipeline, not the architecture.
 */

import { FEATURE_VERSION, FRAME_DIM, WINDOW_DIM, WINDOW_FRAMES, l2Normalize } from './features.js';
import { asset } from './base.js';
import { getSamples } from './storage.js';

export interface Prediction {
  label: string;
  /** 0..1. Compared against a rejection threshold before anything is shown to a user. */
  confidence: number;
}

export interface SignClassifier {
  readonly kind: 'template' | 'onnx';
  readonly labels: string[];
  /** Samples backing each label — surfaced in the UI so users know why accuracy is low. */
  readonly support: Record<string, number>;
  predict(window: Float32Array, topK?: number): Promise<Prediction[]>;
}

/**
 * Below this confidence the app must say "not sure" rather than guess. A model that always
 * answers is a model that lies confidently, and in an accessibility tool that is worse than
 * silence.
 */
export const REJECTION_THRESHOLD = 0.55;

export class TemplateClassifier implements SignClassifier {
  readonly kind = 'template' as const;
  private centroids = new Map<string, Float32Array>();
  private counts: Record<string, number> = {};

  get labels(): string[] {
    return [...this.centroids.keys()].sort();
  }

  get support(): Record<string, number> {
    return { ...this.counts };
  }

  /** Build centroids from locally recorded samples of the current FEATURE_VERSION (optionally only some signs). */
  static async fromLocalSamples(only?: readonly string[]): Promise<TemplateClassifier> {
    return TemplateClassifier.fromSamples(await getSamples(), only);
  }

  static fromSamples(samples: { label: string; featureVersion: number; vector: number[] }[], only?: readonly string[]): TemplateClassifier {
    const classifier = new TemplateClassifier();
    const keep = only ? new Set(only) : null;
    const sums = new Map<string, Float32Array>();

    for (const sample of samples) {
      if (keep && !keep.has(sample.label)) continue;
      if (sample.featureVersion !== FEATURE_VERSION) continue;
      if (sample.vector.length !== WINDOW_DIM) continue;

      let sum = sums.get(sample.label);
      if (!sum) {
        sum = new Float32Array(WINDOW_DIM);
        sums.set(sample.label, sum);
      }
      const normalized = l2Normalize(Float32Array.from(sample.vector));
      for (let i = 0; i < WINDOW_DIM; i += 1) {
        sum[i] = (sum[i] ?? 0) + (normalized[i] ?? 0);
      }
      classifier.counts[sample.label] = (classifier.counts[sample.label] ?? 0) + 1;
    }

    for (const [label, sum] of sums) {
      classifier.centroids.set(label, l2Normalize(sum));
    }
    return classifier;
  }

  async predict(window: Float32Array, topK = 3): Promise<Prediction[]> {
    if (this.centroids.size === 0) return [];
    const query = l2Normalize(window.slice());

    const scored: Prediction[] = [];
    for (const [label, centroid] of this.centroids) {
      let dot = 0;
      for (let i = 0; i < WINDOW_DIM; i += 1) {
        dot += (query[i] ?? 0) * (centroid[i] ?? 0);
      }
      // Cosine similarity is in [-1, 1]; map to [0, 1] so it reads as a confidence.
      scored.push({ label, confidence: Math.max(0, (dot + 1) / 2) });
    }

    scored.sort((a, b) => b.confidence - a.confidence);
    return softmaxOverTop(scored.slice(0, Math.max(topK, 2)));
  }
}

/**
 * Sharpen the top-k similarities into something calibrated enough to threshold on. Raw
 * cosine similarities between high-dimensional landmark windows cluster tightly around
 * 0.8-0.95, so an un-sharpened score of 0.9 tells you nothing about whether the top class
 * actually beat the runner-up.
 *
 * NOTE: this is a heuristic, not calibration. Before quoting confidences in the report,
 * plot a reliability diagram and fit a proper temperature on held-out signers.
 */
function softmaxOverTop(scored: Prediction[], temperature = 0.04): Prediction[] {
  if (scored.length === 0) return [];
  const top = scored[0]?.confidence ?? 0;
  const exps = scored.map((s) => Math.exp((s.confidence - top) / temperature));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return scored.map((s, i) => ({ label: s.label, confidence: (exps[i] ?? 0) / total }));
}

/** Where a trained model is bundled with the app (written by the train-model workflow). */
export const BUNDLED_MODEL_URL = asset('models/sign-model.onnx');

export interface ModelInfo {
  featureVersion: number;
  windowFrames: number;
  frameDim: number;
  labels: string[];
  /** Held-out-signer accuracy from training, shown to users so nobody over-trusts it. */
  top1?: number;
}

/** The labels file sits next to the model: sign-model.onnx → sign-model.labels.json. */
export const labelsUrlFor = (modelUrl: string) => modelUrl.replace(/\.onnx(\?.*)?$/, '.labels.json');

/** Throws a readable error if this build can't use the model. */
export function validateModelInfo(value: unknown): ModelInfo {
  const info = value as Partial<ModelInfo> | null;
  if (!info || !Array.isArray(info.labels) || info.labels.length < 2 || !info.labels.every((l) => typeof l === 'string')) {
    throw new Error('The model’s labels file is missing or broken.');
  }
  if (info.featureVersion !== FEATURE_VERSION || info.windowFrames !== WINDOW_FRAMES || info.frameDim !== FRAME_DIM) {
    throw new Error('This model was trained for a different version of the app. Retrain it with services/ml/train.py.');
  }
  return info as ModelInfo;
}

/** Numerically stable softmax over the allowed classes only (others get 0). */
export function maskedSoftmax(logits: ArrayLike<number>, allowed?: ReadonlySet<number>): Float32Array {
  const out = new Float32Array(logits.length);
  let max = -Infinity;
  for (let i = 0; i < logits.length; i += 1) if (!allowed || allowed.has(i)) max = Math.max(max, logits[i] ?? -Infinity);
  let total = 0;
  for (let i = 0; i < logits.length; i += 1) {
    if (allowed && !allowed.has(i)) continue;
    out[i] = Math.exp((logits[i] ?? 0) - max);
    total += out[i] ?? 0;
  }
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) / (total || 1);
  return out;
}

/** The part of onnxruntime we use, so tests can pass a fake. */
export interface OnnxRuntime {
  createSession(model: ArrayBuffer): Promise<{ run(window: Float32Array): Promise<Float32Array> }>;
}

let runtimePromise: Promise<OnnxRuntime> | null = null;

/** Loads onnxruntime-web (wasm only, single thread) from this app's own files — works offline. */
function loadRuntime(): Promise<OnnxRuntime> {
  runtimePromise ??= import('onnxruntime-web/wasm').then((ort) => {
    ort.env.wasm.wasmPaths = asset('ort/');
    ort.env.wasm.numThreads = 1;
    return {
      async createSession(model: ArrayBuffer) {
        const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
        const input = session.inputNames[0] ?? 'input';
        const output = session.outputNames[0] ?? 'logits';
        return {
          async run(window: Float32Array) {
            const feeds = { [input]: new ort.Tensor('float32', window, [1, WINDOW_FRAMES, FRAME_DIM]) };
            const result = await session.run(feeds);
            return result[output]!.data as Float32Array;
          },
        };
      },
    };
  });
  return runtimePromise;
}

/**
 * A trained model (services/ml/train.py → ONNX). Runs on the device with onnxruntime-web;
 * nothing leaves the phone, and it works offline once the app has been opened once.
 */
export class OnnxClassifier implements SignClassifier {
  readonly kind = 'onnx' as const;
  readonly support: Record<string, number>;
  private readonly allowed?: Set<number>;

  private constructor(
    private readonly session: { run(window: Float32Array): Promise<Float32Array> },
    readonly info: ModelInfo,
    only?: readonly string[],
  ) {
    if (only) this.allowed = new Set(only.map((l) => info.labels.indexOf(l)).filter((i) => i >= 0));
    // A trained model has no per-device example counts; show the classes it knows.
    this.support = Object.fromEntries(this.labels.map((l) => [l, 0]));
  }

  get labels(): string[] {
    return this.info.labels.filter((_, i) => !this.allowed || this.allowed.has(i));
  }

  static async load(modelUrl: string, runtime?: OnnxRuntime, fetcher: typeof fetch = fetch): Promise<OnnxClassifier> {
    const [labelsRes, modelRes] = await Promise.all([fetcher(labelsUrlFor(modelUrl)), fetcher(modelUrl)]);
    if (!labelsRes.ok || !modelRes.ok) throw new Error(`Could not download the sign model (${labelsRes.ok ? modelRes.status : labelsRes.status}).`);
    const info = validateModelInfo(await labelsRes.json());
    const session = await (runtime ?? (await loadRuntime())).createSession(await modelRes.arrayBuffer());
    return new OnnxClassifier(session, info);
  }

  /** The same model, answering only among these signs (e.g. the SOS signs). */
  restrictTo(labels: readonly string[]): OnnxClassifier {
    return new OnnxClassifier(this.session, this.info, labels);
  }

  async predict(window: Float32Array, topK = 3): Promise<Prediction[]> {
    if (window.length !== WINDOW_DIM) throw new Error(`Expected a window of ${WINDOW_DIM} values, got ${window.length}.`);
    const probs = maskedSoftmax(await this.session.run(window), this.allowed);
    return this.info.labels
      .map((label, i) => ({ label, confidence: probs[i] ?? 0, i }))
      .filter((p) => !this.allowed || this.allowed.has(p.i))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topK)
      .map(({ label, confidence }) => ({ label, confidence }));
  }
}

/** True if a model is bundled with (or configured for) this build. Cheap: fetches only the labels file. */
async function availableModelUrl(): Promise<string | null> {
  const configured = import.meta.env['VITE_MODEL_URL'] as string | undefined;
  const url = configured || BUNDLED_MODEL_URL;
  try {
    const res = await fetch(labelsUrlFor(url), { cache: 'no-cache' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    return url;
  } catch {
    // Offline and never cached: no model.
    return null;
  }
}

/**
 * Picks the best classifier available: a trained model if one ships with the app (or
 * VITE_MODEL_URL points at one), otherwise the template classifier built from this
 * device's recordings and installed sign packs.
 *
 * `only` limits the answer to these signs (the SOS screen). If the trained model doesn't
 * know all of them, the template classifier is used instead, so a person's own SOS
 * recordings always work.
 */
export async function createClassifier(options: { only?: readonly string[] } = {}): Promise<SignClassifier> {
  const url = await availableModelUrl();
  if (url) {
    try {
      const model = await OnnxClassifier.load(url);
      if (!options.only) return model;
      if (options.only.every((l) => model.info.labels.includes(l))) return model.restrictTo(options.only);
    } catch (error) {
      console.warn('[signsphere] trained model unavailable, using recorded examples', error);
    }
  }
  return TemplateClassifier.fromLocalSamples(options.only);
}
