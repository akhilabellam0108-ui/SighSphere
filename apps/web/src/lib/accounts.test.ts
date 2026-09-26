import { describe, expect, it } from 'vitest';
import { ageOn, cleanDetails, displayNameFor, normalisePhone, validateAccount, validators, visibleFields } from './accountTypes.js';
import { filterItems, mergeRecord } from './historyStore.js';
import type { HistoryItem } from './backend.js';

const HOSPITAL = {
  name: 'City General Hospital',
  registrationNumber: 'TS/HYD/2021/0457',
  hospitalType: 'Private hospital',
  address: '12 Banjara Hills Road No. 3',
  city: 'Hyderabad',
  state: 'Telangana',
  pincode: '500034',
  contactName: 'Dr. Meena Rao',
  contactDesignation: 'Medical Superintendent',
  contactPhone: '+91 98480 12345',
  officialEmail: 'admin@citygeneral.example',
};

describe('account validation', () => {
  it('accepts a complete hospital', () => {
    expect(validateAccount('hospital', { ...HOSPITAL, departments: 'Emergency, OPD', beds: '120' })).toEqual({});
  });

  it('requires every mandatory hospital field', () => {
    const errors = validateAccount('hospital', {});
    for (const key of ['name', 'registrationNumber', 'hospitalType', 'address', 'city', 'state', 'pincode', 'contactName', 'contactDesignation', 'contactPhone', 'officialEmail', 'departments', 'beds']) {
      expect(errors[key], key).toBeTruthy();
    }
  });

  it('makes every question compulsory for every account type', () => {
    for (const type of ['individual', 'hospital', 'organisation'] as const) {
      const errors = validateAccount(type, {});
      for (const field of visibleFields(type, {})) expect(errors[field.key], `${type}.${field.key}`).toBeTruthy();
    }
  });

  it('checks formats: PIN, phone, email, select options, website', () => {
    const errors = validateAccount('organisation', {
      ...HOSPITAL,
      orgType: 'Spaceship',
      pincode: '0123',
      contactPhone: '12345',
      officialEmail: 'nope@',
      website: 'not a site',
    });
    expect(errors['pincode']).toMatch(/6 digits/);
    expect(errors['contactPhone']).toMatch(/phone/);
    expect(errors['officialEmail']).toMatch(/email/);
    expect(errors['orgType']).toBeTruthy();
    expect(errors['website']).toBeTruthy();
  });

  it('asks for a guardian only when an individual is under 18', () => {
    const now = new Date();
    const minor = `${now.getFullYear() - 12}-01-01`;
    const adult = `${now.getFullYear() - 30}-01-01`;
    expect(visibleFields('individual', { dateOfBirth: minor }).some((f) => f.key === 'guardianName')).toBe(true);
    expect(visibleFields('individual', { dateOfBirth: adult }).some((f) => f.key === 'guardianName')).toBe(false);
    expect(validateAccount('individual', { dateOfBirth: minor })['guardianName']).toBeTruthy();
  });

  it('normalises Indian phone numbers', () => {
    expect(normalisePhone('+91 98480-12345')).toBe('9848012345');
    expect(normalisePhone('09848012345')).toBe('9848012345');
    expect(validators.phone('98480 12345')).toBeNull();
    expect(validators.phone('5848012345')).toBeNull(); // landline with STD code
    expect(validators.phone('12')).toBeTruthy();
  });

  it('computes age correctly around birthdays', () => {
    expect(ageOn('2000-06-15', new Date('2018-06-14T12:00:00'))).toBe(17);
    expect(ageOn('2000-06-15', new Date('2018-06-15T12:00:00'))).toBe(18);
    expect(ageOn('garbage')).toBeNull();
  });

  it('stores only relevant, cleaned fields and names the account', () => {
    const details = cleanDetails('hospital', { ...HOSPITAL, stray: 'x', beds: '  ' });
    expect(details['stray']).toBeUndefined();
    expect(details['beds']).toBeUndefined();
    expect(details['contactPhone']).toBe('9848012345');
    expect(displayNameFor('hospital', details)).toBe('City General Hospital');
    expect(displayNameFor('individual', { fullName: 'Akhila Bellam' })).toBe('Akhila Bellam');
  });
});

describe('history merging', () => {
  const base = { accountId: 'a', kind: 'text-to-sign' as const };
  const t0 = new Date('2026-09-26T10:00:00Z');

  it('merges a sentence still being typed into one entry', () => {
    const first = mergeRecord([], { ...base, input: 'Where is', output: 'WHERE' }, t0, 'id1');
    const second = mergeRecord(first.items, { ...base, input: 'Where is the hospital', output: 'HOSPITAL WHERE' }, new Date(t0.getTime() + 5000), 'id2');
    expect(second.items).toHaveLength(1);
    expect(second.item.id).toBe('id1');
    expect(second.item.input).toBe('Where is the hospital');
  });

  it('starts a new entry for a different sentence, kind, account or after a minute', () => {
    const first = mergeRecord([], { ...base, input: 'hello', output: 'HELLO' }, t0, 'id1');
    expect(mergeRecord(first.items, { ...base, input: 'thank you', output: 'THANK-YOU' }, t0, 'id2').items).toHaveLength(2);
    expect(mergeRecord(first.items, { ...base, kind: 'voice-to-sign', input: 'hello there', output: 'HELLO' }, t0, 'id3').items).toHaveLength(2);
    expect(mergeRecord(first.items, { ...base, accountId: 'b', input: 'hello there', output: 'HELLO' }, t0, 'id4').items).toHaveLength(2);
    expect(mergeRecord(first.items, { ...base, input: 'hello there', output: 'HELLO' }, new Date(t0.getTime() + 61_000), 'id5').items).toHaveLength(2);
  });

  it('filters by text and kind', () => {
    const items: HistoryItem[] = [
      { id: '1', accountId: 'a', kind: 'text-to-sign', input: 'where is the hospital', output: 'HOSPITAL WHERE', createdAt: '' },
      { id: '2', accountId: 'a', kind: 'sign-to-text', input: 'BED', output: 'BED', createdAt: '' },
    ];
    expect(filterItems(items, 'HOSPITAL', []).map((i) => i.id)).toEqual(['1']);
    expect(filterItems(items, '', ['sign-to-text']).map((i) => i.id)).toEqual(['2']);
    expect(filterItems(items, '', [])).toHaveLength(2);
  });
});
