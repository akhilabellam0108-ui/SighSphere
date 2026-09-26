/**
 * Local persistence. Nothing here talks to a network.
 *
 * - IndexedDB for recorded landmark samples (large; localStorage would blow its ~5 MB quota
 *   after about 60 samples).
 * - localStorage for settings and lesson progress (small, synchronous, fine).
 *
 * When Supabase lands in Week 10 it *syncs* this, it does not replace it. Guest mode with
 * no account must keep working — a school laptop shared by 30 students is a real use case,
 * and so is a user who does not want an account.
 */

import { WINDOW_DIM } from './features.js';

const DB_NAME = 'signsphere';
// v2 adds the 'motions' store (signer motion for the 3D avatar). Upgrading keeps samples.
const DB_VERSION = 2;
const SAMPLE_STORE = 'samples';
const MOTION_STORE = 'motions';

export interface SampleMeta {
  /** Pseudonymous signer ID (e.g. "S014"). Never a real name. */
  signerId: string;
  dominantHand: 'left' | 'right';
  device: string;
  lighting: 'bright' | 'normal' | 'dim';
  createdAt: number;
  /**
   * Consent opt-in A from docs/data-collection-protocol.md. A sample without this must
   * never reach a training set — enforced in exportSamples(), not by convention.
   */
  consentTrain: boolean;
  notes?: string;
}

export interface StoredSample {
  id?: number;
  label: string;
  featureVersion: number;
  /** Number of source frames before resampling — useful for spotting truncated captures. */
  sourceFrames: number;
  /** Resampled window, length WINDOW_DIM. */
  vector: number[];
  meta: SampleMeta;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAMPLE_STORE)) {
        const store = db.createObjectStore(SAMPLE_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('label', 'label', { unique: false });
      }
      if (!db.objectStoreNames.contains(MOTION_STORE)) {
        const motions = db.createObjectStore(MOTION_STORE, { keyPath: 'id', autoIncrement: true });
        motions.createIndex('gloss', 'gloss', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = SAMPLE_STORE,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = run(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

export async function addSample(sample: Omit<StoredSample, 'id'>): Promise<number> {
  if (sample.vector.length !== WINDOW_DIM) {
    throw new Error(
      `Sample vector has ${sample.vector.length} values, expected ${WINDOW_DIM}. ` +
        'Feature layout changed without a FEATURE_VERSION bump?',
    );
  }
  const key = await tx<IDBValidKey>('readwrite', (store) => store.add(sample));
  return Number(key);
}

export async function getSamples(): Promise<StoredSample[]> {
  return tx<StoredSample[]>('readonly', (store) => store.getAll());
}

export async function deleteSample(id: number): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
}

export async function clearSamples(): Promise<void> {
  await tx('readwrite', (store) => store.clear());
}

// ---------------------------------------------------------------------------
// Signer motion (IndexedDB) — what the 3D avatar replays. See lib/motion.ts.
// ---------------------------------------------------------------------------

export interface StoredMotion {
  id?: number;
  gloss: string;
  /** 'recorded' = made on this device; 'dataset:<pack>' = installed from a sign pack. */
  source: string;
  createdAt: number;
  /** Encoded clip (lib/motion.ts encodeClip). Kept opaque here. */
  clip: string;
}

export async function addMotion(motion: Omit<StoredMotion, 'id'>): Promise<number> {
  const key = await tx<IDBValidKey>('readwrite', (store) => store.add(motion), MOTION_STORE);
  return Number(key);
}

export async function getMotions(): Promise<StoredMotion[]> {
  return tx<StoredMotion[]>('readonly', (store) => store.getAll(), MOTION_STORE);
}

export async function deleteMotion(id: number): Promise<void> {
  await tx('readwrite', (store) => store.delete(id), MOTION_STORE);
}

export async function clearMotions(): Promise<void> {
  await tx('readwrite', (store) => store.clear(), MOTION_STORE);
}

export async function sampleCounts(): Promise<Record<string, number>> {
  const samples = await getSamples();
  const counts: Record<string, number> = {};
  for (const sample of samples) {
    counts[sample.label] = (counts[sample.label] ?? 0) + 1;
  }
  return counts;
}

/**
 * Export training data as JSONL, one sample per line, for upload to Colab.
 *
 * Skips anything without consent opt-in A and anything from an older FEATURE_VERSION.
 * Returns the excluded count so the UI can say so out loud rather than silently shipping
 * fewer samples than the user expects.
 */
export async function exportSamples(
  featureVersion: number,
): Promise<{ jsonl: string; included: number; skippedNoConsent: number; skippedOldVersion: number }> {
  const samples = await getSamples();
  const lines: string[] = [];
  let skippedNoConsent = 0;
  let skippedOldVersion = 0;

  for (const sample of samples) {
    if (!sample.meta.consentTrain) {
      skippedNoConsent += 1;
      continue;
    }
    if (sample.featureVersion !== featureVersion) {
      skippedOldVersion += 1;
      continue;
    }
    lines.push(
      JSON.stringify({
        label: sample.label,
        featureVersion: sample.featureVersion,
        sourceFrames: sample.sourceFrames,
        signerId: sample.meta.signerId,
        dominantHand: sample.meta.dominantHand,
        device: sample.meta.device,
        lighting: sample.meta.lighting,
        // Round to 5 dp: keeps files ~40% smaller with no measurable accuracy cost.
        vector: sample.vector.map((v) => Math.round(v * 1e5) / 1e5),
      }),
    );
  }

  return {
    jsonl: `${lines.join('\n')}\n`,
    included: lines.length,
    skippedNoConsent,
    skippedOldVersion,
  };
}

// ---------------------------------------------------------------------------
// Settings and progress (localStorage)
// ---------------------------------------------------------------------------

export interface Settings {
  dominantHand: 'left' | 'right';
  highContrast: boolean;
  reduceMotion: boolean;
  fontScale: number;
  playbackSpeed: number;
  ttsLang: string;
  sttLang: string;
  signerId: string;
  consentTrain: boolean;
  handsOnly: boolean;
  /** Where hand tracking runs: 'auto' (graphics chip, falling back), 'gpu' or 'cpu'. */
  processor: 'auto' | 'gpu' | 'cpu';
}

export const DEFAULT_SETTINGS: Settings = {
  dominantHand: 'right',
  highContrast: false,
  reduceMotion: false,
  fontScale: 1,
  playbackSpeed: 0.8,
  ttsLang: 'en-IN',
  sttLang: 'en-IN',
  signerId: 'S000',
  // Opt-IN, never opt-out. Do not flip this default.
  consentTrain: false,
  handsOnly: false,
  processor: 'auto',
};

const SETTINGS_KEY = 'signsphere.settings.v1';
const PROGRESS_KEY = 'signsphere.progress.v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    // Corrupt or unavailable storage (private mode, quota) — degrade, never crash.
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage disabled: ignore */
  }
}

export function loadSettings(): Settings {
  return readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

/** SM-2-lite spaced repetition state, per sign. */
export interface SignProgress {
  attempts: number;
  correct: number;
  /** Consecutive correct attempts. */
  streak: number;
  /** Interval in days until the next review. */
  intervalDays: number;
  dueAt: number;
}

export interface Progress {
  xp: number;
  dayStreak: number;
  lastPracticeDay: string;
  signs: Record<string, SignProgress>;
  completedLessons: string[];
}

export const DEFAULT_PROGRESS: Progress = {
  xp: 0,
  dayStreak: 0,
  lastPracticeDay: '',
  signs: {},
  completedLessons: [],
};

export function loadProgress(): Progress {
  return readJson(PROGRESS_KEY, DEFAULT_PROGRESS);
}

export function saveProgress(progress: Progress): void {
  writeJson(PROGRESS_KEY, progress);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record one practice attempt. SM-2-lite: double the interval on success, reset on failure.
 * Enough for a capstone — swap in full SM-2 or FSRS only if retention data says it matters.
 */
export function recordAttempt(progress: Progress, gloss: string, correct: boolean): Progress {
  const previous: SignProgress =
    progress.signs[gloss] ?? { attempts: 0, correct: 0, streak: 0, intervalDays: 0, dueAt: 0 };

  const streak = correct ? previous.streak + 1 : 0;
  const intervalDays = correct ? Math.min(60, Math.max(1, previous.intervalDays * 2 || 1)) : 0;

  const day = today();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const dayStreak =
    progress.lastPracticeDay === day
      ? progress.dayStreak
      : progress.lastPracticeDay === yesterday
        ? progress.dayStreak + 1
        : 1;

  return {
    ...progress,
    xp: progress.xp + (correct ? 10 : 2), // partial credit for trying
    dayStreak,
    lastPracticeDay: day,
    signs: {
      ...progress.signs,
      [gloss]: {
        attempts: previous.attempts + 1,
        correct: previous.correct + (correct ? 1 : 0),
        streak,
        intervalDays,
        dueAt: Date.now() + intervalDays * 86_400_000,
      },
    },
  };
}

/** A sign counts as mastered at 3 consecutive correct attempts. */
export function isMastered(progress: Progress, gloss: string): boolean {
  return (progress.signs[gloss]?.streak ?? 0) >= 3;
}

/** Wipe everything local. Wired to the "Delete my data" button in Settings. */
export async function deleteAllLocalData(): Promise<void> {
  await clearSamples();
  await clearMotions();
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(PROGRESS_KEY);
  localStorage.removeItem(CONTACTS_KEY);
}

// ---------------------------------------------------------------------------
// Emergency contacts
// ---------------------------------------------------------------------------

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation?: string;
}

const CONTACTS_KEY = 'signsphere.contacts.v1';

export function loadContacts(): EmergencyContact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    return raw ? (JSON.parse(raw) as EmergencyContact[]) : [];
  } catch {
    return [];
  }
}

export function saveContacts(contacts: EmergencyContact[]): void {
  writeJson(CONTACTS_KEY, contacts);
}
