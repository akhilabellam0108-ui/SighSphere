/**
 * History of everything signed, typed or spoken, per account.
 *
 * Local-first: every entry is written to this device immediately (so nothing is lost with a
 * bad connection) and queued for the server; the queue is flushed now and whenever the
 * device comes back online. Items have client-generated ids, so a retried upload can never
 * create duplicates.
 */

import { getBackend, newId, type HistoryItem, type HistoryKind } from './backend.js';

const CACHE_KEY = 'signsphere.history-cache.v1';
const OUTBOX_KEY = 'signsphere.history-outbox.v1';
export const HISTORY_CHANGED = 'signsphere:history-changed';

/** A continuation of the previous entry within this window updates it instead of adding one. */
export const MERGE_WINDOW_MS = 60_000;
const MAX_PER_ACCOUNT = 1000;

interface Outbox {
  put: HistoryItem[];
  del: string[];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota: history is a convenience; never crash for it */
  }
}
function changed(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HISTORY_CHANGED));
}

// ---------------------------------------------------------------------- pure logic

const norm = (text: string) => text.trim().replace(/\s+/g, ' ');

/**
 * Add a new entry, or update the newest one when this is clearly the same utterance still
 * being typed / signed / spoken (same kind, within a minute, one text extends the other).
 */
export function mergeRecord(items: HistoryItem[], next: Omit<HistoryItem, 'id' | 'createdAt'>, now: Date, id = newId()): { items: HistoryItem[]; item: HistoryItem } {
  const input = norm(next.input);
  const output = norm(next.output);
  const newest = items[0];
  if (
    newest &&
    newest.kind === next.kind &&
    newest.accountId === next.accountId &&
    now.getTime() - new Date(newest.createdAt).getTime() <= MERGE_WINDOW_MS &&
    (input.startsWith(newest.input) || newest.input.startsWith(input))
  ) {
    const item = { ...newest, input, output, createdAt: now.toISOString() };
    return { items: [item, ...items.slice(1)], item };
  }
  const item: HistoryItem = { id, accountId: next.accountId, kind: next.kind, input, output, createdAt: now.toISOString() };
  return { items: [item, ...items].slice(0, MAX_PER_ACCOUNT), item };
}

export function filterItems(items: HistoryItem[], query: string, kinds: HistoryKind[]): HistoryItem[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (item) => (kinds.length === 0 || kinds.includes(item.kind)) && (!q || `${item.input} ${item.output}`.toLowerCase().includes(q)),
  );
}

// ------------------------------------------------------------------------- storage

export function cached(accountId: string): HistoryItem[] {
  return read<Record<string, HistoryItem[]>>(CACHE_KEY, {})[accountId] ?? [];
}

function setCached(accountId: string, items: HistoryItem[]): void {
  const all = read<Record<string, HistoryItem[]>>(CACHE_KEY, {});
  all[accountId] = items;
  write(CACHE_KEY, all);
  changed();
}

function outbox(): Outbox {
  return read<Outbox>(OUTBOX_KEY, { put: [], del: [] });
}

let flushing: Promise<void> | null = null;

/** Send queued changes to the server. Safe to call often; failures stay queued. */
export function flush(): Promise<void> {
  flushing ??= (async () => {
    const box = outbox();
    if (box.put.length === 0 && box.del.length === 0) return;
    try {
      const backend = getBackend();
      await backend.putHistory(box.put);
      await backend.deleteHistory(box.del);
      const now = outbox();
      const sentPut = new Map(box.put.map((i) => [i.id, i.createdAt]));
      const sentDel = new Set(box.del);
      write(OUTBOX_KEY, {
        // Keep anything that changed or arrived while we were sending.
        put: now.put.filter((i) => sentPut.get(i.id) !== i.createdAt),
        del: now.del.filter((id) => !sentDel.has(id)),
      });
    } catch {
      /* offline or server error: retry later */
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export function pendingCount(): number {
  const box = outbox();
  return box.put.length + box.del.length;
}

export function record(accountId: string, kind: HistoryKind, input: string, output: string): HistoryItem | null {
  if (!norm(input) && !norm(output)) return null;
  const { items, item } = mergeRecord(cached(accountId), { accountId, kind, input, output }, new Date());
  setCached(accountId, items);
  const box = outbox();
  write(OUTBOX_KEY, { ...box, put: [...box.put.filter((i) => i.id !== item.id), item] });
  void flush();
  return item;
}

export function remove(accountId: string, ids: string[]): void {
  const drop = new Set(ids);
  setCached(accountId, cached(accountId).filter((item) => !drop.has(item.id)));
  const box = outbox();
  write(OUTBOX_KEY, { put: box.put.filter((i) => !drop.has(i.id)), del: [...new Set([...box.del, ...ids])] });
  void flush();
}

export async function clearAll(accountId: string): Promise<void> {
  const ids = cached(accountId).map((i) => i.id);
  setCached(accountId, []);
  const box = outbox();
  write(OUTBOX_KEY, { put: box.put.filter((i) => i.accountId !== accountId), del: box.del });
  try {
    await getBackend().clearHistory(accountId);
  } catch {
    const again = outbox();
    write(OUTBOX_KEY, { ...again, del: [...new Set([...again.del, ...ids])] });
  }
}

/** Pull the server copy and merge it with anything not yet uploaded. */
export async function refresh(accountId: string): Promise<void> {
  await flush();
  try {
    const server = await getBackend().listHistory(accountId, MAX_PER_ACCOUNT);
    const pending = outbox().put.filter((i) => i.accountId === accountId);
    const deleted = new Set(outbox().del);
    const byId = new Map(server.filter((i) => !deleted.has(i.id)).map((i) => [i.id, i]));
    for (const item of pending) byId.set(item.id, item);
    setCached(
      accountId,
      [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  } catch {
    /* offline: keep the local copy */
  }
}

export function forgetDevice(): void {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(OUTBOX_KEY);
  changed();
}
