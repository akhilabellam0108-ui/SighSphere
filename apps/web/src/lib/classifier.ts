/**
 * Sign classifiers behind one interface, so no UI code changes when the model changes.
 *
 * Two implementations:
 *   TemplateClassifier — cosine similarity to per-class centroids built from samples the
 *     user recorded locally. No training run, no server, works in Week 3. This is the
 *     documented BASELINE, not the shipping model: it has no temporal modelling beyond the
 *     fixed window and it degrades quickly past ~20 classes.
 *   OnnxClassifier — the trained model from Colab. Stub until Week 8; see the throw below.
 *
 * Report both numbers in the writeup. A trained model that cannot beat the template
 * baseline means the bug is in the data pipeline, not the architecture.
 */

import { FEATURE_VERSION, WINDOW_DIM, l2Normalize } from './features.js';
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

  /** Build centroids from locally recorded samples of the current FEATURE_VERSION. */
  static async fromLocalSamples(): Promise<TemplateClassifier> {
    const classifier = new TemplateClassifier();
    const samples = await getSamples();
    const sums = new Map<string, Float32Array>();

    for (const sample of samples) {
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

/**
 * Trained model loaded from VITE_MODEL_URL.
 *
 * Week 8 task:
 *   1. npm i onnxruntime-web
 *   2. import * as ort from 'onnxruntime-web'
 *   3. session = await ort.InferenceSession.create(url, { executionProviders: ['wasm'] })
 *   4. feeds = { input: new ort.Tensor('float32', window, [1, WINDOW_FRAMES, FRAME_DIM]) }
 *   5. softmax the output logits, map argmax through labels.json
 *
 * Left unimplemented rather than faked: a stub that silently returns nonsense would be
 * indistinguishable from a working model in a demo, which is exactly the failure this
 * project cannot afford.
 */
export class OnnxClassifier implements SignClassifier {
  readonly kind = 'onnx' as const;
  readonly labels: string[] = [];
  readonly support: Record<string, number> = {};

  constructor(private readonly modelUrl: string) {}

  async predict(): Promise<Prediction[]> {
    throw new Error(
      `OnnxClassifier is not implemented yet (model: ${this.modelUrl}). ` +
        'See the Week 8 checklist in apps/web/src/lib/classifier.ts. ' +
        'Unset VITE_MODEL_URL to fall back to the template classifier.',
    );
  }
}

/** Pick an implementation based on env config. Called on app start and after recording. */
export async function createClassifier(): Promise<SignClassifier> {
  const modelUrl = import.meta.env['VITE_MODEL_URL'];
  if (modelUrl) return new OnnxClassifier(modelUrl);
  return TemplateClassifier.fromLocalSamples();
}
