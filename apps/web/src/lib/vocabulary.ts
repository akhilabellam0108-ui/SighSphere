/**
 * The vocabulary the app translates with: the built-in lexicon (packages/gloss) plus the
 * words the SignSphere team added or corrected on the Admin → Vocabulary screen.
 *
 * Team words are cached on the device, so text → sign keeps using them offline.
 *   - same gloss as a built-in word → replaces it
 *   - new gloss → added
 *   - hidden → the built-in word with that gloss is removed
 */
import { useEffect, useState } from 'react';
import { coreLexicon, type LexEntry, type Lexicon } from '@signsphere/gloss';
import type { Backend, VocabWord } from './backend.js';

const CACHE_KEY = 'signsphere.vocabulary.v1';
const CHANGED = 'signsphere:vocabulary-changed';

function readCache(): VocabWord[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as VocabWord[]) : [];
  } catch {
    return [];
  }
}

export function mergeLexicon(words: VocabWord[], base: Lexicon = coreLexicon): Lexicon {
  if (!words.length) return base;
  const byGloss = new Map(words.map((w) => [w.gloss.toUpperCase(), w]));
  const team: LexEntry[] = words
    .filter((w) => !w.hidden && w.english.length)
    .map((w) => ({
      gloss: w.gloss.toUpperCase(),
      english: w.english.map((e) => e.toLowerCase()),
      pos: w.pos,
      category: w.category ?? undefined,
      twoHanded: w.twoHanded || undefined,
      reviewed: w.reviewed,
      notes: [w.notes, w.reviewedBy ? `Reviewed by ${w.reviewedBy}` : null].filter(Boolean).join(' · ') || undefined,
    }));
  // Team words go first so their English forms win over a built-in word that shares them.
  const kept = base.entries.filter((e) => !byGloss.has(e.gloss));
  return { version: `${base.version}+team.${words.length}`, language: 'ISL', entries: [...team, ...kept] };
}

let current: Lexicon = mergeLexicon(readCache());

/** The lexicon to translate with right now. */
export function getLexicon(): Lexicon {
  return current;
}

/** Fetches the team's words (if online) and updates every screen using them. */
export async function refreshVocabulary(backend: Backend): Promise<VocabWord[]> {
  let words: VocabWord[];
  try {
    words = await backend.vocabulary();
  } catch {
    return readCache(); // offline: keep the cached words
  }
  setVocabulary(words);
  return words;
}

/** After the admin saves a word: apply it at once on this device. */
export function setVocabulary(words: VocabWord[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(words));
  } catch {
    /* storage full or blocked: still use it for this session */
  }
  current = mergeLexicon(words);
  window.dispatchEvent(new Event(CHANGED));
}

/** React hook: the current lexicon, re-rendering when the team's words change. */
export function useLexicon(): Lexicon {
  const [lexicon, setLexicon] = useState(current);
  useEffect(() => {
    const update = () => setLexicon(current);
    window.addEventListener(CHANGED, update);
    update();
    return () => window.removeEventListener(CHANGED, update);
  }, []);
  return lexicon;
}
