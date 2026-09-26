import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryItem, HistoryKind } from '../lib/backend.js';
import { HISTORY_CHANGED, cached, clearAll, record, refresh, remove } from '../lib/historyStore.js';
import { useSession } from './session.js';

/** The active account's history, live. */
export function useHistory() {
  const { active } = useSession();
  const accountId = active?.id ?? null;
  const [items, setItems] = useState<HistoryItem[]>(() => (accountId ? cached(accountId) : []));

  useEffect(() => {
    if (!accountId) {
      setItems([]);
      return;
    }
    const load = () => setItems(cached(accountId));
    load();
    void refresh(accountId);
    window.addEventListener(HISTORY_CHANGED, load);
    return () => window.removeEventListener(HISTORY_CHANGED, load);
  }, [accountId]);

  return {
    items,
    remove: useCallback((ids: string[]) => accountId && remove(accountId, ids), [accountId]),
    clear: useCallback(() => (accountId ? clearAll(accountId) : Promise.resolve()), [accountId]),
  };
}

/**
 * Record what a screen translated, once it has been stable for `delayMs` — so history holds
 * finished sentences, not every keystroke. Consecutive edits merge into one entry.
 */
export function useRecordHistory(kind: HistoryKind, input: string, output: string, delayMs = 2000) {
  const { active } = useSession();
  const accountId = active?.id;
  const last = useRef('');
  useEffect(() => {
    if (!accountId || (!input.trim() && !output.trim())) return;
    const key = `${kind}|${input}|${output}`;
    if (key === last.current) return;
    const timer = window.setTimeout(() => {
      last.current = key;
      record(accountId, kind, input, output);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [accountId, kind, input, output, delayMs]);
}
