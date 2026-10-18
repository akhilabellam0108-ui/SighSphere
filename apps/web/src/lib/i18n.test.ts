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
