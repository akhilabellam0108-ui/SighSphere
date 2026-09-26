/**
 * Golden test set for the gloss engine.
 *
 * DUAL PURPOSE: this is the unit-test suite AND the artifact you put in front of a fluent
 * ISL signer for review. Each case has an `input` and an `expected` gloss sequence, so an
 * advisor can read the table and mark each row correct/incorrect without reading code.
 *
 * REVIEW STATUS: UNREVIEWED. The expectations below encode the current behaviour of
 * rules.ts, which is an unvalidated approximation of ISL grammar. A green test suite means
 * "the engine does what we told it to", NOT "the output is correct ISL". Only a signer's
 * sign-off means that. Log the review in docs/decisions.md and mark rows below.
 */

import { describe, expect, it } from 'vitest';
import { buildIndex, coreLexicon, toGlossString, translate, validateLexicon } from './index.js';

describe('lexicon', () => {
  it('has no structural problems', () => {
    expect(validateLexicon()).toEqual([]);
  });

  it('indexes every entry by gloss and by english form', () => {
    const { byGloss, byEnglish } = buildIndex();
    expect(byGloss.size).toBe(coreLexicon.entries.length);
    expect(byEnglish.get('mom')?.gloss).toBe('MOTHER');
    expect(byEnglish.get('school')?.gloss).toBe('SCHOOL');
  });

  it('ships nothing marked reviewed — placeholder glosses must not look validated', () => {
    // Delete this test only when a named fluent signer has actually reviewed entries.
    expect(coreLexicon.entries.every((e) => e.reviewed === false)).toBe(true);
  });
});

describe('ISL ordering rules', () => {
  const cases: Array<{ input: string; expected: string; why: string }> = [
    // --- no articles, no copula ---
    { input: 'She is a teacher', expected: 'HE-SHE TEACHER', why: 'no copula, no article' },
    { input: 'The book is big', expected: 'BOOK BIG', why: 'no article, no copula' },

    // --- question words go last ---
    { input: 'Where is the school?', expected: 'SCHOOL WHERE', why: 'wh-word final' },
    { input: 'Why are you sad?', expected: 'YOU SAD WHY', why: 'wh-word final' },

    // --- time markers go first ---
    { input: 'Yesterday I went to school', expected: 'YESTERDAY I SCHOOL GO', why: 'time first, SOV' },
    { input: 'I will go tomorrow', expected: 'TOMORROW I GO', why: 'explicit time word beats FUTURE marker' },
    { input: 'I will go', expected: 'FUTURE I GO', why: 'tense becomes a time marker' },

    // --- negation follows the verb ---
    { input: 'I do not know', expected: 'I KNOW NOT', why: 'negation after verb' },
    { input: 'I cannot hear you', expected: 'I YOU HEAR CANNOT', why: 'negation after verb, SOV' },

    // --- SOV ordering ---
    { input: 'I want water', expected: 'I WATER WANT', why: 'subject-object-verb' },
    { input: 'Mother gave me milk', expected: 'MOTHER I MILK GIVE', why: 'subject-object-verb' },

    // --- noun before adjective ---
    { input: 'big school', expected: 'SCHOOL BIG', why: 'noun precedes its adjective' },

    // --- courtesy phrases stay up front ---
    { input: 'Hello, my name is Akhila', expected: 'HELLO MY NAME AKHILA', why: 'greeting first; unknown name fingerspelled' },
    { input: 'Thank you', expected: 'THANK-YOU', why: 'multi-word phrase collapses to one sign' },
    { input: 'How are you?', expected: 'YOU FINE WHAT', why: 'idiomatic phrase substitution' },
  ];

  for (const { input, expected, why } of cases) {
    it(`${input} -> ${expected}  (${why})`, () => {
      expect(toGlossString(input)).toBe(expected);
    });
  }
});

describe('fingerspelling fallback', () => {
  it('fingerspells words with no lexicon entry', () => {
    const result = translate('I like cricket');
    expect(result.unknown).toContain('cricket');
    const spelled = result.plan.find((t) => t.kind === 'fingerspell');
    expect(spelled).toBeDefined();
    if (spelled?.kind === 'fingerspell') {
      expect(spelled.letters).toEqual(['C', 'R', 'I', 'C', 'K', 'E', 'T']);
    }
  });

  it('scales fingerspell duration by letter count', () => {
    const short = translate('Akhila', { letterDurationMs: 100 });
    const token = short.plan.find((t) => t.kind === 'fingerspell');
    expect(token?.durationMs).toBe(600); // 6 letters x 100ms
  });
});

describe('render plan', () => {
  it('inserts pauses between signs and between sentences', () => {
    const result = translate('I am happy. You are sad.');
    const pauses = result.plan.filter((t) => t.kind === 'pause');
    expect(pauses.length).toBeGreaterThan(0);
    // The between-sentence pause should be the longest one.
    const longest = Math.max(...pauses.map((p) => p.durationMs));
    expect(longest).toBe(520);
  });

  it('slows every duration down when speed < 1', () => {
    const normal = translate('I want water');
    const slow = translate('I want water', { speed: 0.5 });
    const normalTotal = normal.plan.reduce((sum, t) => sum + t.durationMs, 0);
    const slowTotal = slow.plan.reduce((sum, t) => sum + t.durationMs, 0);
    expect(slowTotal).toBeCloseTo(normalTotal * 2, -1);
  });

  it('reports zero clip and review coverage for the seed lexicon', () => {
    // The seed lexicon has no clips and nothing reviewed. When this test starts failing,
    // real clips have landed — update the expectation, don't delete the test.
    const result = translate('I want water');
    expect(result.clipCoverage).toBe(0);
    expect(result.reviewedCoverage).toBe(0);
  });
});

describe('trace', () => {
  it('explains which function words were dropped', () => {
    const { trace } = translate('She is a teacher');
    const drop = trace.find((s) => s.rule === 'drop-function-words');
    expect(drop?.detail).toContain('no copula in ISL');
    expect(drop?.detail).toContain('a');
  });

  it('flags yes/no questions as needing non-manual marking', () => {
    const { trace } = translate('Are you deaf?');
    const step = trace.find((s) => s.rule === 'yes-no-question');
    expect(step).toBeDefined();
    expect(step?.detail).toContain('non-manual');
  });

  it('records why a tense marker was suppressed', () => {
    const { trace } = translate('I will go tomorrow');
    const step = trace.find((s) => s.rule === 'tense-as-time-marker');
    expect(step?.detail).toContain('suppressed');
  });
});

describe('robustness', () => {
  it('handles empty and whitespace input', () => {
    expect(translate('').glosses).toEqual([]);
    expect(translate('   ').glosses).toEqual([]);
  });

  it('handles input that is entirely function words', () => {
    expect(translate('the a of and').glosses).toEqual([]);
  });

  it('collapses repeated adjacent glosses', () => {
    expect(toGlossString('no no no')).toBe('NO');
  });

  it('handles punctuation and mixed case without crashing', () => {
    expect(() => translate('WHERE?! is... the SCHOOL???')).not.toThrow();
  });
});
