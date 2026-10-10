/**
 * Classifier tests: the trained-model path (onnxruntime-web running a real ONNX file),
 * restricting answers to a set of signs (the SOS screen), and the template classifier.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FEATURE_VERSION, FRAME_DIM, WINDOW_DIM, WINDOW_FRAMES } from './features.js';
import {
  OnnxClassifier, TemplateClassifier, chooseClassifier, labelsUrlFor, maskedSoftmax, validateModelInfo, type OnnxRuntime,
} from './classifier.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(here, '__fixtures__', name));

/** Serves the fixture files as if they were on the web. */
const fakeFetch = (async (url: string) => {
  const name = String(url).split('/').pop()!;
  try {
    const body = fixture(name);
    return new Response(body, { headers: { 'content-type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream' } });
  } catch {
    return new Response('missing', { status: 404 });
  }
}) as typeof fetch;

/** A real onnxruntime session in Node, with the WASM straight from node_modules. */
async function realRuntime(): Promise<OnnxRuntime> {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  return {
    async createSession(model) {
      const session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });
      return {
        async run(window) {
          const out = await session.run({ input: new ort.Tensor('float32', window, [1, WINDOW_FRAMES, FRAME_DIM]) });
          return out['logits']!.data as Float32Array;
        },
      };
    },
  };
}

/** A window whose frame 0 has a 1 in feature column k (the tiny model's class k). */
function windowFor(k: number): Float32Array {
  const w = new Float32Array(WINDOW_DIM);
  w[k] = 1;
  return w;
}

describe('trained model (ONNX)', () => {
  it('runs a real ONNX model and maps logits to labels', async () => {
    const model = await OnnxClassifier.load('/models/tiny-model.onnx', await realRuntime(), fakeFetch);
    expect(model.kind).toBe('onnx');
    expect(model.labels).toEqual(['HELP', 'WATER', 'DOCTOR']);
    const [top] = await model.predict(windowFor(2));
    expect(top!.label).toBe('DOCTOR');
    expect(top!.confidence).toBeGreaterThan(0.99);
  });

  it('can be limited to some signs, renormalising among them', async () => {
    const model = (await OnnxClassifier.load('/models/tiny-model.onnx', await realRuntime(), fakeFetch)).restrictTo(['HELP', 'WATER']);
    expect(model.labels).toEqual(['HELP', 'WATER']);
    const result = await model.predict(windowFor(2), 5);
    expect(result.map((p) => p.label).sort()).toEqual(['HELP', 'WATER']);
    expect(result.reduce((s, p) => s + p.confidence, 0)).toBeCloseTo(1, 5);
  });

  it('refuses a model built for a different feature layout', async () => {
    expect(() => validateModelInfo({ featureVersion: FEATURE_VERSION + 1, windowFrames: WINDOW_FRAMES, frameDim: FRAME_DIM, labels: ['A', 'B'] })).toThrow(/different version/);
    expect(() => validateModelInfo({ featureVersion: FEATURE_VERSION, windowFrames: WINDOW_FRAMES, frameDim: FRAME_DIM, labels: ['A'] })).toThrow(/labels/);
    const broken = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    await expect(OnnxClassifier.load('/models/x.onnx', await realRuntime(), broken)).rejects.toThrow(/Could not download/);
  });

  it('rejects windows of the wrong size', async () => {
    const model = await OnnxClassifier.load('/models/tiny-model.onnx', await realRuntime(), fakeFetch);
    await expect(model.predict(new Float32Array(10))).rejects.toThrow(/Expected a window/);
  });

  it('finds the labels file next to the model', () => {
    expect(labelsUrlFor('/SighSphere/models/sign-model.onnx')).toBe('/SighSphere/models/sign-model.labels.json');
    expect(labelsUrlFor('https://x/m.onnx?v=2')).toBe('https://x/m.labels.json');
  });
});

describe('maskedSoftmax', () => {
  it('ignores classes outside the allowed set', () => {
    const p = maskedSoftmax([5, 1, 9], new Set([0, 1]));
    expect(p[2]).toBe(0);
    expect(p[0]! + p[1]!).toBeCloseTo(1, 6);
    expect(p[0]!).toBeGreaterThan(p[1]!);
  });
  it('is stable with large logits', () => {
    const p = maskedSoftmax([1000, 999]);
    expect(Number.isFinite(p[0]!)).toBe(true);
    expect(p[0]! + p[1]!).toBeCloseTo(1, 6);
  });
});

describe('template classifier', () => {
  const sample = (label: string, k: number) => ({ label, featureVersion: FEATURE_VERSION, vector: Array.from(windowFor(k)) });
  const samples = [sample('HELP', 0), sample('HELP', 0), sample('WATER', 1), sample('DOCTOR', 2), sample('THANK-YOU', 3)];

  it('learns from examples and recognises them', async () => {
    const c = TemplateClassifier.fromSamples(samples);
    expect(c.labels).toEqual(['DOCTOR', 'HELP', 'THANK-YOU', 'WATER']);
    expect((await c.predict(windowFor(1)))[0]!.label).toBe('WATER');
    expect(c.support['HELP']).toBe(2);
  });

  it('can be built from only some signs (SOS)', async () => {
    const c = TemplateClassifier.fromSamples(samples, ['HELP', 'WATER']);
    expect(c.labels).toEqual(['HELP', 'WATER']);
    const labels = (await c.predict(windowFor(3), 5)).map((p) => p.label);
    expect(labels).not.toContain('THANK-YOU');
  });
});

describe('choosing between the trained model and recorded examples', () => {
  const sample = (label: string, k: number) => ({ label, featureVersion: FEATURE_VERSION, vector: Array.from(windowFor(k)) });

  it('uses the trained model when it knows every sign on the phone', async () => {
    const model = await OnnxClassifier.load('/models/tiny-model.onnx', await realRuntime(), fakeFetch);
    expect(chooseClassifier(model, [sample('HELP', 0), sample('WATER', 1)]).kind).toBe('onnx');
  });

  it('keeps signs a person recorded themselves working', async () => {
    const model = await OnnxClassifier.load('/models/tiny-model.onnx', await realRuntime(), fakeFetch);
    const c = chooseClassifier(model, [sample('HELP', 0), sample('MY-NAME', 5)]);
    expect(c.kind).toBe('template');
    expect(c.labels).toContain('MY-NAME');
  });

  it('SOS: model when it covers the requested signs, examples otherwise', async () => {
    const model = await OnnxClassifier.load('/models/tiny-model.onnx', await realRuntime(), fakeFetch);
    expect(chooseClassifier(model, [], ['HELP', 'DOCTOR']).labels).toEqual(['HELP', 'DOCTOR']);
    expect(chooseClassifier(model, [sample('PAIN', 4), sample('HELP', 0)], ['HELP', 'PAIN']).kind).toBe('template');
  });
});
