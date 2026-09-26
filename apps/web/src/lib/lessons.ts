/**
 * Lesson catalogue, built from the lexicon.
 *
 * buildLessons() is the original Learn.tsx logic, moved here unchanged so the lesson list,
 * the lesson screen, Home and Profile all agree on what a lesson is. The level grouping and
 * daily challenge are presentation on top of it — they never invent signs.
 */

import type { LexEntry } from '@signsphere/gloss';

export const SIGNS_PER_LESSON = 6;

export interface Lesson {
  id: string;
  title: string;
  category: string;
  entries: LexEntry[];
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildLessons(entries: LexEntry[]): Lesson[] {
  const byCategory = new Map<string, LexEntry[]>();
  for (const entry of entries) {
    const category = entry.category ?? 'other';
    const list = byCategory.get(category) ?? [];
    list.push(entry);
    byCategory.set(category, list);
  }

  const lessons: Lesson[] = [];
  for (const [category, list] of byCategory) {
    // Chunk into lessons, then fold a too-short tail into the previous chunk rather than
    // dropping it — otherwise a category of 8 silently loses 2 signs from the curriculum.
    const chunks: LexEntry[][] = [];
    for (let i = 0; i < list.length; i += SIGNS_PER_LESSON) {
      chunks.push(list.slice(i, i + SIGNS_PER_LESSON));
    }
    const last = chunks.at(-1);
    if (chunks.length > 1 && last && last.length < 3) {
      chunks[chunks.length - 2]?.push(...last);
      chunks.pop();
    }
    // A whole category with fewer than 3 signs is not a lesson; those signs are still
    // reachable through the translator and the recorder.
    if (chunks.length === 1 && (chunks[0]?.length ?? 0) < 3) continue;

    chunks.forEach((chunk, index) => {
      lessons.push({
        id: `${category}-${index + 1}`,
        title: `${titleCase(category)}${chunks.length > 1 ? ` ${index + 1}` : ''}`,
        category,
        entries: chunk,
      });
    });
  }
  return lessons;
}

// ------------------------------------------------------------------------------ levels

export type LevelId = 'beginner' | 'intermediate' | 'advanced';

export interface LevelDef {
  id: LevelId;
  title: string;
  description: string;
  /** Lexicon categories taught at this level, in teaching order. */
  categories: string[];
  /** Topics the curriculum promises but the lexicon does not cover yet. Shown as coming soon. */
  planned: string[];
}

/**
 * Category → level. Categories not listed land in Intermediate, so adding a category to the
 * lexicon never hides its signs.
 */
export const LEVELS: readonly LevelDef[] = [
  {
    id: 'beginner',
    title: 'Beginner',
    description: 'Greetings, numbers and the people closest to you.',
    categories: ['courtesy', 'number', 'pronoun', 'family', 'identity'],
    planned: ['Fingerspelling alphabet (needs signer videos)'],
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    description: 'Everyday conversation: feelings, food, time, questions and school.',
    categories: ['feeling', 'question', 'verb', 'time', 'food', 'school', 'people', 'place', 'quantity', 'health', 'emergency'],
    planned: ['Workplace signs'],
  },
  {
    id: 'advanced',
    title: 'Advanced',
    description: 'Professional, academic and technical vocabulary.',
    categories: [],
    planned: ['Professional communication', 'Academic vocabulary', 'Technical terms'],
  },
];

export function levelOf(category: string): LevelId {
  for (const level of LEVELS) {
    if (level.categories.includes(category)) return level.id;
  }
  return 'intermediate';
}

export interface LevelGroup {
  level: LevelDef;
  lessons: Lesson[];
}

/** Group lessons by level, ordered by each level's category order. */
export function groupByLevel(lessons: Lesson[]): LevelGroup[] {
  return LEVELS.map((level) => {
    const own = lessons.filter((lesson) => levelOf(lesson.category) === level.id);
    const rank = (lesson: Lesson) => {
      const index = level.categories.indexOf(lesson.category);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return { level, lessons: [...own].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)) };
  });
}

// ---------------------------------------------------------------------- daily challenge

export interface DailyChallenge {
  lesson: Lesson;
  signIndex: number;
  entry: LexEntry;
  day: string;
}

/** FNV-1a — tiny, deterministic, good enough to spread days across signs. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Same sign for everyone on the same day; a different one tomorrow. */
export function dailyChallenge(lessons: Lesson[], day = localDay()): DailyChallenge | null {
  const all = lessons.flatMap((lesson) => lesson.entries.map((entry, signIndex) => ({ lesson, signIndex, entry })));
  if (all.length === 0) return null;
  const pick = all[hash(day) % all.length];
  return pick ? { ...pick, day } : null;
}
