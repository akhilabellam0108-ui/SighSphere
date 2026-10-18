import { describe, expect, it } from 'vitest';
import { cleanStack } from './errorReporting.js';

describe('error reports', () => {
  it('keeps only code locations, without the site address', () => {
    const stack = 'TypeError: x\n    at Avatar (https://akhila.github.io/SighSphere/assets/index-abc.js:10:5)\n    at run (https://akhila.github.io/x.js:1:1)';
    const clean = cleanStack(stack) ?? '';
    expect(clean).not.toContain('https://');
    expect(clean).toContain('/SighSphere/assets/index-abc.js:10:5');
  });
  it('is capped in length and lines', () => {
    const long = Array.from({ length: 50 }, (_, i) => `    at f${i} (a.js:${i}:1)`).join('\n');
    expect((cleanStack(long) ?? '').split('\n').length).toBe(12);
  });
});
