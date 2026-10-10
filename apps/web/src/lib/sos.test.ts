import { describe, expect, it } from 'vitest';
import { FEATURE_VERSION, WINDOW_DIM } from './features.js';
import { TemplateClassifier } from './classifier.js';
import { SOS_SIGNS, SOS_THRESHOLD, acceptSos, sosReadiness, telFor } from './sos.js';

describe('SOS signs', () => {
  it('every SOS sign is in the lexicon vocabulary used by the avatar', async () => {
    const lexicon = (await import('../../../../packages/gloss/lexicon/isl-core.json')).default as { entries: { gloss: string }[] };
    const glosses = new Set(lexicon.entries.map((e) => e.gloss));
    expect(SOS_SIGNS.filter((s) => !glosses.has(s.gloss)).map((s) => s.gloss)).toEqual([]);
  });

  it('a sign is ready after 3 takes, or when a trained model knows it', () => {
    const r = sosReadiness({ HELP: 3, WATER: 2, THANKS: 9 }, ['POLICE']);
    expect(r.ready.sort()).toEqual(['HELP', 'POLICE']);
    expect(r.takes['WATER']).toBe(2);
    expect('THANKS' in r.takes).toBe(false);
  });

  it('accepts only a clear, confident answer among ready signs', () => {
    const ready = ['HELP', 'WATER'];
    expect(acceptSos([{ label: 'HELP', confidence: 0.95 }, { label: 'WATER', confidence: 0.05 }], ready)?.gloss).toBe('HELP');
    expect(acceptSos([{ label: 'HELP', confidence: SOS_THRESHOLD - 0.01 }], ready)).toBeNull();
    expect(acceptSos([{ label: 'HELP', confidence: 0.75 }, { label: 'WATER', confidence: 0.6 }], ready), 'too close to the runner-up').toBeNull();
    expect(acceptSos([{ label: 'POLICE', confidence: 0.99 }], ready), 'not set up').toBeNull();
    expect(acceptSos([], ready)).toBeNull();
  });

  it('offers the right number to call', () => {
    expect(telFor('call-112')).toBe('tel:112');
    expect(telFor('call-108')).toBe('tel:108');
    expect(telFor('show')).toBeNull();
  });

  it('end to end: recorded SOS signs are recognised and others are never answered', async () => {
    // Each made-up "sign" lights up a different feature; a real recording would vary more.
    const win = (k: number, noise = 0) => {
      const w = new Float32Array(WINDOW_DIM);
      for (let i = 0; i < 40; i += 1) w[k * 40 + i] = 1;
      for (let i = 0; i < WINDOW_DIM; i += 1) w[i] = (w[i] ?? 0) + noise * Math.sin(i * (k + 1));
      return w;
    };
    const samples = [0, 1, 2].flatMap((k) => [0.01, 0.02, 0.03].map((n) => ({ label: ['HELP', 'DOCTOR', 'GOOD-MORNING'][k]!, featureVersion: FEATURE_VERSION, vector: Array.from(win(k, n)) })));
    const ready = sosReadiness({ HELP: 3, DOCTOR: 3 }).ready;
    const c = TemplateClassifier.fromSamples(samples, ready);
    expect(c.labels).toEqual(['DOCTOR', 'HELP']);
    expect(acceptSos(await c.predict(win(1, 0.015)), ready)?.gloss).toBe('DOCTOR');
    // A non-SOS sign must not become an SOS message by being "closest".
    const stray = await c.predict(win(2, 0.015));
    expect(acceptSos(stray, ready)).toBeNull();
  });
});
