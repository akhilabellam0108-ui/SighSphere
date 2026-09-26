import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT,
  MERGE_WINDOW_MS,
  cap,
  filterHistory,
  withRecent,
  withSaved,
  withToggledSaved,
  withoutEntry,
  withoutUnsaved,
  type HistoryEntry,
} from './history.js';

const T0 = 1_700_000_000_000;

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: overrides.id ?? `id-${Math.random()}`,
    kind: 'text-to-sign',
    createdAt: T0,
    updatedAt: T0,
    input: 'hello',
    output: 'HELLO',
    saved: false,
    language: 'isl',
    ...overrides,
  };
}

describe('withRecent', () => {
  it('adds a new entry to an empty history', () => {
    const { entries, id } = withRecent([], { kind: 'text-to-sign', input: 'Where is the school?', output: 'SCHOOL WHERE' }, T0);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(id);
    expect(entries[0]?.saved).toBe(false);
  });

  it('ignores empty input and output', () => {
    const { entries, id } = withRecent([], { kind: 'text-to-sign', input: '   ', output: '' }, T0);
    expect(entries).toHaveLength(0);
    expect(id).toBeNull();
  });

  it('merges a quick revision into the previous unsaved entry of the same kind', () => {
    const first = withRecent([], { kind: 'text-to-sign', input: 'I want', output: 'I WANT' }, T0);
    const second = withRecent(first.entries, { kind: 'text-to-sign', input: 'I want water', output: 'I WATER WANT' }, T0 + 5_000);
    expect(second.entries).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.entries[0]?.input).toBe('I want water');
    expect(second.entries[0]?.updatedAt).toBe(T0 + 5_000);
  });

  it('starts a new entry after the merge window', () => {
    const first = withRecent([], { kind: 'text-to-sign', input: 'hello', output: 'HELLO' }, T0);
    const second = withRecent(first.entries, { kind: 'text-to-sign', input: 'thank you', output: 'THANK-YOU' }, T0 + MERGE_WINDOW_MS + 1);
    expect(second.entries).toHaveLength(2);
  });

  it('never merges into a saved entry or an entry of another kind', () => {
    const saved = withSaved([], { kind: 'text-to-sign', input: 'hello', output: 'HELLO' }, T0);
    const next = withRecent(saved.entries, { kind: 'text-to-sign', input: 'hello there', output: 'HELLO THERE' }, T0 + 1_000);
    expect(next.entries).toHaveLength(2);
    const other = withRecent(next.entries, { kind: 'sign-to-text', input: 'HELLO', output: 'HELLO' }, T0 + 2_000);
    expect(other.entries).toHaveLength(3);
  });

  it('does nothing when the content is identical', () => {
    const first = withRecent([], { kind: 'text-to-sign', input: 'hello', output: 'HELLO' }, T0);
    const again = withRecent(first.entries, { kind: 'text-to-sign', input: ' hello ', output: 'HELLO' }, T0 + 1_000);
    expect(again.entries).toBe(first.entries);
  });
});

describe('cap', () => {
  it('drops the oldest unsaved entries but keeps every saved one', () => {
    const many = Array.from({ length: MAX_RECENT + 10 }, (_, i) => entry({ id: `u${i}`, updatedAt: T0 + i }));
    const oldSaved = entry({ id: 'saved', updatedAt: T0 - 1_000_000, saved: true });
    const result = cap([...many, oldSaved]);
    expect(result.filter((e) => !e.saved)).toHaveLength(MAX_RECENT);
    expect(result.some((e) => e.id === 'saved')).toBe(true);
    expect(result.some((e) => e.id === 'u0')).toBe(false);
  });
});

describe('mutations', () => {
  const list = [entry({ id: 'a' }), entry({ id: 'b', saved: true }), entry({ id: 'c' })];

  it('toggles saved', () => {
    expect(withToggledSaved(list, 'a').find((e) => e.id === 'a')?.saved).toBe(true);
    expect(withToggledSaved(list, 'b').find((e) => e.id === 'b')?.saved).toBe(false);
  });

  it('deletes one entry', () => {
    expect(withoutEntry(list, 'b').map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('clears unsaved only', () => {
    expect(withoutUnsaved(list).map((e) => e.id)).toEqual(['b']);
  });
});

describe('filterHistory', () => {
  const list = [
    entry({ id: 'old', input: 'Where is the school?', updatedAt: T0 }),
    entry({ id: 'new', kind: 'sign-to-text', input: 'HELLO', output: 'HELLO', updatedAt: T0 + 10 }),
    entry({
      id: 'conv',
      kind: 'conversation',
      input: 'Hi',
      output: '2 turns',
      saved: true,
      updatedAt: T0 + 5,
      turns: [
        { speaker: 'hearing', text: 'Do you want water?', at: T0 },
        { speaker: 'signer', text: 'YES', at: T0 + 1 },
      ],
    }),
  ];

  it('sorts newest first', () => {
    expect(filterHistory(list, {}).map((e) => e.id)).toEqual(['new', 'conv', 'old']);
  });

  it('searches input, output and conversation turns, case-insensitively', () => {
    expect(filterHistory(list, { query: 'SCHOOL' }).map((e) => e.id)).toEqual(['old']);
    expect(filterHistory(list, { query: 'water' }).map((e) => e.id)).toEqual(['conv']);
  });

  it('filters by kind and saved', () => {
    expect(filterHistory(list, { kinds: ['sign-to-text'] }).map((e) => e.id)).toEqual(['new']);
    expect(filterHistory(list, { savedOnly: true }).map((e) => e.id)).toEqual(['conv']);
  });
});
