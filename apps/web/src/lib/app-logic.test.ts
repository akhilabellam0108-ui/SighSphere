import { describe, expect, it } from 'vitest';
import { computeAchievements } from './achievements.js';
import { createDemoSession, createGuestSession, firstName, validateDemoProfile } from './auth.js';
import { DEFAULT_PROGRESS } from './storage.js';
import { splitSentences } from './text.js';

describe('achievements', () => {
  it('unlocks nothing for a brand-new user', () => {
    const list = computeAchievements({ progress: DEFAULT_PROGRESS, masteredCount: 0, history: [], sampleCounts: {} });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => !a.unlocked)).toBe(true);
  });

  it('unlocks only what the data supports', () => {
    const progress = {
      ...DEFAULT_PROGRESS,
      xp: 120,
      dayStreak: 3,
      signs: { HELLO: { attempts: 4, correct: 3, streak: 3, intervalDays: 4, dueAt: 0 } },
    };
    const list = computeAchievements({ progress, masteredCount: 1, history: [], sampleCounts: { HELLO: 5, WATER: 2 } });
    const unlocked = new Set(list.filter((a) => a.unlocked).map((a) => a.id));
    expect(unlocked).toEqual(new Set(['first-practice', 'first-mastered', 'streak-3', 'xp-100', 'teacher']));
    expect(list.find((a) => a.id === 'streak-7')?.progressLabel).toBe('3/7');
  });
});

describe('placeholder auth', () => {
  it('requires a name only when signing up, and a plausible email always', () => {
    expect(validateDemoProfile({ name: '', email: 'a@b.co' }, false)).toEqual({});
    expect(validateDemoProfile({ name: '', email: 'a@b.co' }, true).name).toBeTruthy();
    expect(validateDemoProfile({ name: 'A', email: 'not-an-email' }, true).email).toBeTruthy();
    expect(validateDemoProfile({ name: 'A', email: '' }, true).email).toBeTruthy();
  });

  it('creates sessions with no password field at all', () => {
    const demo = createDemoSession({ name: '  Akhila B ', email: ' Akhila@Example.com ' }, 1);
    expect(demo).toEqual({ kind: 'demo', name: 'Akhila B', email: 'akhila@example.com', createdAt: 1 });
    expect(Object.keys(demo)).not.toContain('password');
    expect(createGuestSession(1)).toEqual({ kind: 'guest', name: 'Guest', createdAt: 1 });
  });

  it('derives a first name for greetings, never for guests', () => {
    expect(firstName(createDemoSession({ name: 'Akhila Bellam', email: 'a@b.co' }))).toBe('Akhila');
    expect(firstName(createGuestSession())).toBe('');
    expect(firstName(null)).toBe('');
  });

  it('falls back to the email name when signing in without a name', () => {
    expect(createDemoSession({ name: '', email: 'riya@example.com' }).name).toBe('riya');
  });
});

describe('splitSentences', () => {
  it('splits on sentence punctuation including the danda', () => {
    expect(splitSentences('Hello there. How are you?  Fine!')).toEqual(['Hello there.', 'How are you?', 'Fine!']);
    expect(splitSentences('नमस्ते। आप कैसे हैं?')).toEqual(['नमस्ते।', 'आप कैसे हैं?']);
    expect(splitSentences('   ')).toEqual([]);
  });
});
