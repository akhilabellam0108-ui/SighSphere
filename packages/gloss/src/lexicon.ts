import rawLexicon from '../lexicon/isl-core.json';
import type { LexEntry, Lexicon } from './types.js';

/**
 * The bundled seed lexicon. Every entry is `reviewed: false` -- see the _README block in
 * lexicon/isl-core.json. Replace with advisor-validated entries in Week 2.
 */
export const coreLexicon: Lexicon = {
  version: (rawLexicon as { version: string }).version,
  language: 'ISL',
  entries: (rawLexicon as unknown as { entries: LexEntry[] }).entries,
};

export interface LexiconIndex {
  lexicon: Lexicon;
  /** English surface form (lowercase) -> entry. First writer wins; collisions are reported. */
  byEnglish: Map<string, LexEntry>;
  byGloss: Map<string, LexEntry>;
  stats: {
    entries: number;
    withClip: number;
    reviewed: number;
    byCategory: Record<string, number>;
  };
}

/**
 * Index cache. translate() calls buildIndex() on every invocation, and TextToSign calls
 * translate() on every keystroke — without this, every keypress rebuilds the whole index.
 * Keyed by lexicon identity, so passing a new lexicon object correctly rebuilds.
 */
const indexCache = new WeakMap<Lexicon, LexiconIndex>();

export function buildIndex(lexicon: Lexicon = coreLexicon): LexiconIndex {
  const cached = indexCache.get(lexicon);
  if (cached) return cached;

  const byEnglish = new Map<string, LexEntry>();
  const byGloss = new Map<string, LexEntry>();
  const byCategory: Record<string, number> = {};
  let withClip = 0;
  let reviewed = 0;

  for (const entry of lexicon.entries) {
    byGloss.set(entry.gloss, entry);
    for (const form of entry.english) {
      const key = form.toLowerCase();
      if (!byEnglish.has(key)) byEnglish.set(key, entry);
    }
    // A gloss is always addressable by its own lowercased name.
    const glossKey = entry.gloss.toLowerCase();
    if (!byEnglish.has(glossKey)) byEnglish.set(glossKey, entry);

    if (entry.clip) withClip += 1;
    if (entry.reviewed) reviewed += 1;
    const category = entry.category ?? 'uncategorised';
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }

  const index: LexiconIndex = {
    lexicon,
    byEnglish,
    byGloss,
    stats: { entries: lexicon.entries.length, withClip, reviewed, byCategory },
  };
  indexCache.set(lexicon, index);
  return index;
}

/**
 * Structural checks. Run in CI and after every lexicon edit -- this file is edited by hand
 * (deliberately, so non-programmers can own it), which means it will get typos.
 * Returns a list of problems; empty means clean.
 */
export function validateLexicon(lexicon: Lexicon = coreLexicon): string[] {
  const problems: string[] = [];
  const seenGloss = new Set<string>();
  const englishOwner = new Map<string, string>();

  for (const entry of lexicon.entries) {
    if (!entry.gloss) {
      problems.push(`entry with english=[${entry.english?.join(', ')}] has no gloss`);
      continue;
    }
    if (entry.gloss !== entry.gloss.toUpperCase()) {
      problems.push(`${entry.gloss}: gloss must be UPPERCASE`);
    }
    if (seenGloss.has(entry.gloss)) {
      problems.push(`${entry.gloss}: duplicate gloss`);
    }
    seenGloss.add(entry.gloss);

    if (!entry.english?.length) {
      problems.push(`${entry.gloss}: no english surface forms, so it can never be matched`);
    }
    for (const form of entry.english ?? []) {
      if (form !== form.toLowerCase()) {
        problems.push(`${entry.gloss}: english form "${form}" must be lowercase`);
      }
      const owner = englishOwner.get(form);
      if (owner && owner !== entry.gloss) {
        problems.push(`english "${form}" claimed by both ${owner} and ${entry.gloss}`);
      }
      englishOwner.set(form, entry.gloss);
    }
    if (entry.reviewed && !entry.clip) {
      problems.push(`${entry.gloss}: marked reviewed but has no clip -- reviewed means gloss AND clip confirmed`);
    }
  }
  return problems;
}
