/**
 * Session context over lib/auth.ts. See that file: this is placeholder auth, clearly
 * labelled as such in the UI, with no passwords anywhere.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createDemoSession,
  createGuestSession,
  loadOnboarded,
  loadSession,
  saveOnboarded,
  saveSession,
  type DemoProfileInput,
  type Session,
} from '../lib/auth.js';
import { DATA_CLEARED_EVENT } from '../lib/storage.js';

interface AuthContextValue {
  session: Session | null;
  onboarded: boolean;
  continueAsGuest(): Session;
  signInDemo(input: DemoProfileInput): Session;
  signOut(): void;
  completeOnboarding(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [onboarded, setOnboarded] = useState<boolean>(() => loadOnboarded());

  useEffect(() => {
    const reset = () => {
      setSession(null);
      setOnboarded(false);
    };
    window.addEventListener(DATA_CLEARED_EVENT, reset);
    return () => window.removeEventListener(DATA_CLEARED_EVENT, reset);
  }, []);

  const continueAsGuest = useCallback(() => {
    const next = createGuestSession();
    saveSession(next);
    setSession(next);
    return next;
  }, []);

  const signInDemo = useCallback((input: DemoProfileInput) => {
    const next = createDemoSession(input);
    saveSession(next);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  const completeOnboarding = useCallback(() => {
    saveOnboarded(true);
    setOnboarded(true);
  }, []);

  const value = useMemo(
    () => ({ session, onboarded, continueAsGuest, signInDemo, signOut, completeOnboarding }),
    [session, onboarded, continueAsGuest, signInDemo, signOut, completeOnboarding],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
