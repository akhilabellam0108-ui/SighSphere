import { useCallback, useEffect, useState } from 'react';
import {
  HISTORY_EVENT,
  HISTORY_KEY,
  loadHistory,
  updateHistory,
  withRecent,
  withSaved,
  withToggledSaved,
  withoutEntry,
  withoutUnsaved,
  type HistoryEntry,
  type NewEntry,
} from '../lib/history.js';
import { DATA_CLEARED_EVENT } from '../lib/storage.js';

/**
 * Live view of the local history. Every component using this hook re-reads on change —
 * including changes made in another tab (storage event).
 */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());

  useEffect(() => {
    const refresh = () => setEntries(loadHistory());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === HISTORY_KEY) refresh();
    };
    window.addEventListener(HISTORY_EVENT, refresh);
    window.addEventListener(DATA_CLEARED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HISTORY_EVENT, refresh);
      window.removeEventListener(DATA_CLEARED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const recordRecent = useCallback(
    (next: NewEntry) =>
      updateHistory((current) => {
        const { entries: updated, id } = withRecent(current, next);
        return { entries: updated, result: id };
      }),
    [],
  );

  const save = useCallback(
    (next: NewEntry) =>
      updateHistory((current) => {
        const { entries: updated, id } = withSaved(current, next);
        return { entries: updated, result: id };
      }),
    [],
  );

  const toggleSaved = useCallback((id: string) => {
    updateHistory((current) => ({ entries: withToggledSaved(current, id), result: null }));
  }, []);

  const remove = useCallback((id: string) => {
    updateHistory((current) => ({ entries: withoutEntry(current, id), result: null }));
  }, []);

  const clearRecent = useCallback(() => {
    updateHistory((current) => ({ entries: withoutUnsaved(current), result: null }));
  }, []);

  const clearAll = useCallback(() => {
    updateHistory(() => ({ entries: [], result: null }));
  }, []);

  return { entries, recordRecent, save, toggleSaved, remove, clearRecent, clearAll };
}

/**
 * Record `next` as a recent entry once it has been stable for `delayMs`. Used by the
 * translators so history captures what was translated, not every keystroke.
 */
export function useAutoRecord(next: NewEntry | null, delayMs = 2500) {
  const { recordRecent } = useHistory();
  const key = next ? `${next.kind}|${next.input}|${next.output}` : '';
  useEffect(() => {
    if (!next || (!next.input.trim() && !next.output.trim())) return;
    const timer = window.setTimeout(() => recordRecent(next), delayMs);
    return () => window.clearTimeout(timer);
    // `key` captures everything in `next` that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs, recordRecent]);
}
