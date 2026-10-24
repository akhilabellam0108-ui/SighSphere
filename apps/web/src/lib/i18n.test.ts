import { describe, expect, it } from 'vitest';
import { EMERGENCY_PHRASES, translateKey, type MessageKey } from './i18n.js';
import source from './i18n.ts?raw';

const keys = [...source.matchAll(/^\s+'([a-z.A-Z]+)': \{/gm)].map((m) => m[1] as MessageKey);

describe('interface languages', () => {
  it('every phrase has Hindi and Telugu, written in their own scripts', () => {
    expect(keys.length).toBeGreaterThan(80);
    for (const key of keys) {
      const hi = translateKey('hi', key);
      const te = translateKey('te', key);
      expect(hi, key).toBeTruthy();
      expect(te, key).toBeTruthy();
      if (!/^(home\.xp|nav\.admin)$/.test(key) && /[a-z]{4}/i.test(translateKey('en', key).replace(/ISL|XP|QR|3D/g, ''))) {
        expect(/[ऀ-ॿ]/.test(hi), `${key} hi`).toBe(true);
        expect(/[ఀ-౿]/.test(te), `${key} te`).toBe(true);
      }
    }
  });
  it('fills in names', () => {
    expect(translateKey('te', 'home.welcome', { name: 'Akhila' })).toBe('స్వాగతం, Akhila');
  });
  it('emergency cards exist in all three languages', () => {
    for (const p of EMERGENCY_PHRASES) {
      expect(/[ऀ-ॿ]/.test(p.hi)).toBe(true);
      expect(/[ఀ-౿]/.test(p.te)).toBe(true);
    }
  });
});

describe('account form, privacy and terms translations', () => {
  it('every account-form label, hint, choice and message shown to people has Hindi and Telugu', async () => {
    const { FIELDS, validators } = await import('./accountTypes.js');
    const { FIELD_TEXT } = await import('./i18nFields.js');
    const shown = new Set<string>();
    for (const fields of Object.values(FIELDS)) {
      for (const f of fields) {
        shown.add(f.label);
        if (f.hint) shown.add(f.hint);
        for (const o of f.options ?? []) shown.add(o);
      }
    }
    for (const check of Object.values(validators)) {
      const message = (check as (v: string) => string | null)('');
      if (message) shown.add(message);
    }
    for (const text of shown) {
      const entry = FIELD_TEXT[text];
      expect(entry, text).toBeTruthy();
      if (/^(NGO|Hearing)$/.test(text)) continue;
      expect(/[ऀ-ॿ]/.test(entry!.hi), `${text} hi`).toBe(true);
      expect(/[ఀ-౿]/.test(entry!.te), `${text} te`).toBe(true);
    }
  });
  it('privacy notice and terms have the same sections in all three languages', async () => {
    const { PRIVACY, TERMS } = await import('./legal.js');
    for (const doc of [PRIVACY, TERMS]) {
      for (const lang of ['hi', 'te'] as const) {
        expect(doc[lang].length).toBe(doc.en.length);
        doc[lang].forEach((section, i) => {
          expect(section.body.length, `${lang} ${doc.en[i]!.title}`).toBe(doc.en[i]!.body.length);
          expect(section.list ?? false).toBe(doc.en[i]!.list ?? false);
          // in-app links and the {where} slot must survive translation
          const links = (s: string[]) => s.join(' ').match(/\]\(\/[^)]*\)|\{where\}/g) ?? [];
          expect(links(section.body)).toEqual(links(doc.en[i]!.body));
        });
      }
    }
  });
});
