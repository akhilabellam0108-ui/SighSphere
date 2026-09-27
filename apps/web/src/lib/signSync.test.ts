// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

// Minimal browser globals for storage.ts / signSync.ts.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  window: { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} },
});

const { setBackend, deviceBackend } = await import('./backend.js');
const { pullSigns, queueSign, flushSigns, pendingSigns } = await import('./signSync.js');
const { FEATURE_VERSION, WINDOW_DIM } = await import('./features.js');
const VEC = Array.from({ length: WINDOW_DIM }, (_, i) => (i % 7) / 7);
const { addSample, getSamples, clearSamples, clearMotions, getMotions } = await import('./storage.js');
type Backend = import('./backend.js').Backend;
type CloudSign = import('./backend.js').CloudSign;

/** An in-memory "server" shared by two simulated devices. */
function fakeCloud(server: Map<string, CloudSign>, online: { value: boolean }): Backend {
  const base = deviceBackend();
  return {
    ...base,
    mode: 'cloud',
    getUser: async () => ({ id: 'u1', email: 'a@example.com' }),
    listSigns: async () => {
      if (!online.value) throw new Error('offline');
      return [...server.values()];
    },
    putSigns: async (signs) => {
      if (!online.value) throw new Error('offline');
      for (const s of signs) if (!server.has(s.id)) server.set(s.id, s);
    },
    deleteAllSigns: async () => server.clear(),
  };
}

async function recordOnThisDevice(id: string, gloss: string) {
  const sampleId = await addSample({
    label: gloss,
    featureVersion: FEATURE_VERSION,
    sourceFrames: 32,
    vector: VEC,
    meta: { signerId: 'S1', dominantHand: 'right', device: 'test', lighting: 'normal', createdAt: Date.now(), consentTrain: false, cloudId: id },
  });
  queueSign(id, { sampleId, motionId: null, accountId: 'acct' });
}

/** "Another device": empty local storage, same server. */
async function switchDevice() {
  store.clear();
  await clearSamples();
  await clearMotions();
}

describe('sign sync across devices', () => {
  const server = new Map<string, CloudSign>();
  const online = { value: true };
  beforeEach(async () => {
    server.clear();
    online.value = true;
    await switchDevice();
    setBackend(fakeCloud(server, online));
  });

  it('uploads a recording and installs it on another device', async () => {
    await recordOnThisDevice('11111111-1111-4111-8111-111111111111', 'HELLO');
    await flushSigns();
    expect(server.size).toBe(1);
    expect(pendingSigns()).toBe(0);

    await switchDevice();
    expect(await pullSigns()).toBe(1);
    const samples = await getSamples();
    expect(samples.map((s) => s.label)).toEqual(['HELLO']);
    expect(samples[0]?.meta.cloudId).toBe('11111111-1111-4111-8111-111111111111');
    expect(await pullSigns()).toBe(0); // no duplicates on the next pull
    expect(await getSamples()).toHaveLength(1);
  });

  it('keeps recordings made offline and uploads them later', async () => {
    online.value = false;
    await recordOnThisDevice('22222222-2222-4222-8222-222222222222', 'WATER');
    await flushSigns();
    expect(pendingSigns()).toBe(1);
    expect(await pullSigns()).toBe(0);
    expect(await getSamples()).toHaveLength(1); // offline pull never deletes unsent work
    online.value = true;
    await flushSigns();
    expect(server.size).toBe(1);
    expect(pendingSigns()).toBe(0);
  });

  it('carries the avatar motion and removes signs deleted on another device', async () => {
    server.set('33333333-3333-4333-8333-333333333333', {
      id: '33333333-3333-4333-8333-333333333333', accountId: null, gloss: 'DOCTOR', featureVersion: FEATURE_VERSION, sourceFrames: 30,
      vector: VEC, motion: 'encoded-motion', meta: {}, createdAt: new Date().toISOString(),
    });
    server.set('44444444-4444-4444-8444-444444444444', {
      id: '44444444-4444-4444-8444-444444444444', accountId: null, gloss: 'OLD', featureVersion: FEATURE_VERSION - 1, sourceFrames: 30,
      vector: [1, 2, 3], motion: null, meta: {}, createdAt: new Date().toISOString(),
    });
    expect(await pullSigns()).toBe(1); // the old-format recording is skipped, not fatal
    expect((await getMotions()).map((m) => m.gloss)).toEqual(['DOCTOR']);
    server.clear(); // deleted elsewhere
    await pullSigns();
    expect(await getSamples()).toHaveLength(0);
    expect(await getMotions()).toHaveLength(0);
  });
});
