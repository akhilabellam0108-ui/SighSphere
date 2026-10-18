import { translate } from '@signsphere/gloss';
import { describe, expect, it } from 'vitest';
import type { VocabWord } from './backend.js';
import { mergeLexicon } from './vocabulary.js';

const word = (w: Partial<VocabWord> & Pick<VocabWord, 'gloss' | 'english'>): VocabWord => ({
  pos: 'noun', category: null, notes: null, twoHanded: false, reviewed: false, reviewedBy: null, hidden: false, ...w,
});

describe('team vocabulary', () => {
  it('adds new words so text → sign uses them', () => {
    const lexicon = mergeLexicon([word({ gloss: 'NEBULISER', english: ['nebuliser', 'nebulizer'] })]);
    expect(translate('I need a nebulizer', { lexicon }).glosses).toContain('NEBULISER');
  });

  it('replaces a built-in word with the same gloss and keeps the reviewer', () => {
    const lexicon = mergeLexicon([word({ gloss: 'DOCTOR', english: ['doctor', 'physician'], reviewed: true, reviewedBy: 'R. Kumar' })]);
    const doctor = lexicon.entries.filter((e) => e.gloss === 'DOCTOR');
    expect(doctor).toHaveLength(1);
    expect(doctor[0]?.reviewed).toBe(true);
    expect(doctor[0]?.notes).toContain('R. Kumar');
    expect(translate('call a physician', { lexicon }).glosses).toContain('DOCTOR');
  });

  it('hides a wrong built-in word', () => {
    const lexicon = mergeLexicon([word({ gloss: 'DOCTOR', english: ['doctor'], hidden: true })]);
    expect(lexicon.entries.some((e) => e.gloss === 'DOCTOR')).toBe(false);
  });

  it('with no team words, the built-in vocabulary is used unchanged', () => {
    const base = mergeLexicon([]);
    expect(mergeLexicon([], base)).toBe(base);
  });
});
