/**
 * Translation and conversation history, stored locally (localStorage), like progress and
 * contacts. Nothing here ever leaves the device.
 *
 * Two ideas:
 *   - "Recent" entries are recorded automatically while you use a translator. Consecutive
 *     edits of the same translation collapse into one entry (see recordRecent), so typing a
 *     sentence does not leave 30 half-sentences behind.
 *   - "Saved" entries are the ones you bookmarked. They are never evicted by the size cap.
 *
 * The pure functions (withRecent, toggleSaved, remove, filterHistory, …) take and return
 * arrays so they are unit-testable without a browser; the persist* wrappers do the I/O.
 */

import { LOCAL_PREFIX } from './storage.js';

export type HistoryKind = 'text-to-sign' | 'voice-to-sign' | 'sign-to-text' | 'sign-to-voice' | 'conversation';

export interface ConversationTurn {
  speaker: 'hearing' | 'signer';
  text: string;
  /** ISL gloss for hearing-side turns. */
  gloss?: string;
  at: number;
}

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  createdAt: number;
  updatedAt: number;
  /** What went in: English text, a transcript, or a summary for conversations. */
  input: string;
  /** What came out: gloss, recognised signs, or a summary for conversations. */
  output: string;
  saved: boolean;
  /** Sign language code, see lib/languages.ts. */
  language: string;
  turns?: ConversationTurn[];
}

export const HISTORY_KEY = `${LOCAL_PREFIX}history.v1`;
export const HISTORY_EVENT = 'signsphere:history-changed';
/** Unsaved entries beyond this are dropped oldest-first. Saved ones are never dropped. */
export const MAX_RECENT = 150;
/** An edit within this window of the previous unsaved entry of the same kind replaces it. */
export const MERGE_WINDOW_MS = 2 * 60 * 1000;

export const KIND_LABEL: Record<HistoryKind, string> = {
  'text-to-sign': 'Text → Sign',
  'voice-to-sign': 'Voice → Sign',
  'sign-to-text': 'Sign → Text',
  'sign-to-voice': 'Sign → Voice',
  conversation: 'Conversation',
};

export const KIND_ROUTE: Record<HistoryKind, string> = {
  'text-to-sign': '/translate/text-to-sign',
  'voice-to-sign': '/translate/voice-to-sign',
  'sign-to-text': '/translate/sign-to-text',
  'sign-to-voice': '/translate/sign-to-voice',
  conversation: '/translate/conversation',
};

let counter = 0;
export function newId(now = Date.now()): string {
  counter = (counter + 1) % 1_000_000;
  return `${now.toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ------------------------------------------------------------------------ pure functions

export function sortNewestFirst(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Drop the oldest unsaved entries beyond MAX_RECENT. */
export function cap(entries: HistoryEntry[], max = MAX_RECENT): HistoryEntry[] {
  const sorted = sortNewestFirst(entries);
  let unsaved = 0;
  return sorted.filter((entry) => {
    if (entry.saved) return true;
    unsaved += 1;
    return unsaved <= max;
  });
}

export interface NewEntry {
  kind: HistoryKind;
  input: string;
  output: string;
  language?: string;
  turns?: ConversationTurn[];
  saved?: boolean;
}

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Add an automatically recorded entry, merging it into the newest unsaved entry of the same
 * kind when that one is recent and the new input continues or revises it.
 * Returns the new array and the id of the entry that now holds this content.
 */
export function withRecent(
  entries: HistoryEntry[],
  next: NewEntry,
  now = Date.now(),
): { entries: HistoryEntry[]; id: string | null } {
  const input = normalise(next.input);
  const output = normalise(next.output);
  if (!input && !output) return { entries, id: null };

  const newest = sortNewestFirst(entries).find((entry) => entry.kind === next.kind);
  if (newest && !newest.saved && now - newest.updatedAt <= MERGE_WINDOW_MS) {
    if (newest.input === input && newest.output === output) return { entries, id: newest.id };
    const updated: HistoryEntry = { ...newest, input, output, updatedAt: now, turns: next.turns ?? newest.turns };
    return { entries: entries.map((entry) => (entry.id === newest.id ? updated : entry)), id: newest.id };
  }

  const entry: HistoryEntry = {
    id: newId(now),
    kind: next.kind,
    createdAt: now,
    updatedAt: now,
    input,
    output,
    saved: next.saved ?? false,
    language: next.language ?? 'isl',
    turns: next.turns,
  };
  return { entries: cap([entry, ...entries]), id: entry.id };
}

/** Add an entry that is saved from the start (never merged). */
export function withSaved(entries: HistoryEntry[], next: NewEntry, now = Date.now()): { entries: HistoryEntry[]; id: string } {
  const entry: HistoryEntry = {
    id: newId(now),
    kind: next.kind,
    createdAt: now,
    updatedAt: now,
    input: normalise(next.input),
    output: normalise(next.output),
    saved: true,
    language: next.language ?? 'isl',
    turns: next.turns,
  };
  return { entries: cap([entry, ...entries]), id: entry.id };
}

export function withToggledSaved(entries: HistoryEntry[], id: string): HistoryEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, saved: !entry.saved } : entry));
}

export function withoutEntry(entries: HistoryEntry[], id: string): HistoryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function withoutUnsaved(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.filter((entry) => entry.saved);
}

export interface HistoryFilter {
  query?: string;
  kinds?: HistoryKind[];
  savedOnly?: boolean;
}

export function filterHistory(entries: HistoryEntry[], filter: HistoryFilter): HistoryEntry[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  return sortNewestFirst(entries).filter((entry) => {
    if (filter.savedOnly && !entry.saved) return false;
    if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(entry.kind)) return false;
    if (!query) return true;
    const haystack = [entry.input, entry.output, ...(entry.turns ?? []).map((turn) => turn.text)]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

// ------------------------------------------------------------------------------- I/O

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['kind'] === 'string' &&
    typeof v['createdAt'] === 'number' &&
    typeof v['input'] === 'string' &&
    typeof v['output'] === 'string'
  );
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).map((entry) => ({
      ...entry,
      updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : entry.createdAt,
      saved: Boolean(entry.saved),
      language: typeof entry.language === 'string' ? entry.language : 'isl',
    }));
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* quota exceeded or storage disabled — history is a convenience, never crash for it */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HISTORY_EVENT));
}

/** Read-modify-write helper so every mutation goes through the same path. */
export function updateHistory<R>(mutate: (entries: HistoryEntry[]) => { entries: HistoryEntry[]; result: R }): R {
  const { entries, result } = mutate(loadHistory());
  saveHistory(entries);
  return result;
}
