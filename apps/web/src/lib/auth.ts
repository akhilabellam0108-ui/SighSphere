/**
 * Placeholder authentication.
 *
 * THIS IS NOT REAL AUTHENTICATION. There is no server, no password, no verification. It
 * gives the Login/Signup UI a session object to work with until Supabase Auth is wired up
 * (PLAN.md §3, Week 10). The UI says so wherever a session is created or shown.
 *
 * Rules that must survive until real auth replaces this file:
 *   - Never ask for, accept, or store a password here.
 *   - A demo profile is a local name + optional email on this device, nothing more.
 *   - Swapping in Supabase should only change this file and state/auth.tsx.
 */

export type SessionKind = 'guest' | 'demo';

export interface Session {
  kind: SessionKind;
  /** Display name. Guests get 'Guest'. */
  name: string;
  /** Only for demo profiles, and only ever used for display. Never verified. */
  email?: string;
  createdAt: number;
}

export const SESSION_KEY = 'signsphere.session.v1';
export const ONBOARDED_KEY = 'signsphere.onboarded.v1';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (parsed.kind !== 'guest' && parsed.kind !== 'demo') return null;
    return {
      kind: parsed.kind,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Guest',
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

export function loadOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveOnboarded(done: boolean): void {
  try {
    if (done) localStorage.setItem(ONBOARDED_KEY, '1');
    else localStorage.removeItem(ONBOARDED_KEY);
  } catch {
    /* ignore */
  }
}

export function createGuestSession(now = Date.now()): Session {
  return { kind: 'guest', name: 'Guest', createdAt: now };
}

export interface DemoProfileInput {
  name: string;
  email: string;
}

export interface DemoProfileErrors {
  name?: string;
  email?: string;
}

// Deliberately loose: the goal is catching typos, not RFC 5322 compliance.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDemoProfile(input: DemoProfileInput, requireName: boolean): DemoProfileErrors {
  const errors: DemoProfileErrors = {};
  const name = input.name.trim();
  const email = input.email.trim();
  if (requireName && !name) errors.name = 'Enter a name so we know what to call you.';
  if (name.length > 60) errors.name = 'Keep the name under 60 characters.';
  if (!email) errors.email = 'Enter an email address.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'That does not look like an email address — check for typos.';
  return errors;
}

export function createDemoSession(input: DemoProfileInput, now = Date.now()): Session {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email.split('@')[0] || 'Friend';
  return { kind: 'demo', name, email, createdAt: now };
}

export function firstName(session: Session | null): string {
  if (!session || session.kind === 'guest') return '';
  return session.name.split(/\s+/)[0] ?? '';
}
