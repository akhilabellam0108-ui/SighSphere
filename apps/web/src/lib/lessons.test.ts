import { buildIndex } from '@signsphere/gloss';
import { describe, expect, it } from 'vitest';
import { LEVELS, buildLessons, dailyChallenge, groupByLevel, levelOf, localDay } from './lessons.js';

const lessons = buildLessons(buildIndex().lexicon.entries);

describe('lessons', () => {
  it('builds at least one lesson from the seed lexicon', () => {
    expect(lessons.length).toBeGreaterThan(0);
    for (const lesson of lessons) expect(lesson.entries.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every lesson a unique id', () => {
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places every lesson in exactly one level, losing none', () => {
    const grouped = groupByLevel(lessons);
    const total = grouped.reduce((sum, group) => sum + group.lessons.length, 0);
    expect(total).toBe(lessons.length);
    expect(grouped.map((group) => group.level.id)).toEqual(LEVELS.map((level) => level.id));
  });

  it('sends unknown categories to intermediate rather than hiding them', () => {
    expect(levelOf('some-new-category')).toBe('intermediate');
    expect(levelOf('courtesy')).toBe('beginner');
  });
});

describe('dailyChallenge', () => {
  it('is deterministic for a given day', () => {
    const a = dailyChallenge(lessons, '2026-09-26');
    const b = dailyChallenge(lessons, '2026-09-26');
    expect(a?.entry.gloss).toBe(b?.entry.gloss);
    expect(a?.lesson.entries[a.signIndex]?.gloss).toBe(a?.entry.gloss);
  });

  it('varies across days', () => {
    const glosses = new Set(
      Array.from({ length: 30 }, (_, i) => dailyChallenge(lessons, `2026-10-${String(i + 1).padStart(2, '0')}`)?.entry.gloss),
    );
    expect(glosses.size).toBeGreaterThan(5);
  });

  it('returns null with no lessons', () => {
    expect(dailyChallenge([], '2026-09-26')).toBeNull();
  });

  it('formats local days as YYYY-MM-DD', () => {
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
