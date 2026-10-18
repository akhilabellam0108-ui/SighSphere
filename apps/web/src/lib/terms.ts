/** Bump when the Terms of Use change in a way people must agree to again. */
export const TERMS_VERSION = '2026-10-18';

const KEY = 'signsphere.terms-accepted.v1';

/** Remembers on this device that the person agreed (the server copy is in the login's metadata). */
export function rememberAcceptance(): { termsVersion: string; termsAcceptedAt: string } {
  const record = { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    /* storage blocked: the login metadata still has it */
  }
  return record;
}
