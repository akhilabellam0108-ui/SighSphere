/**
 * Session: the signed-in user, their accounts, and which account is active.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cleanDetails, displayNameFor, type AccountType } from '../lib/accountTypes.js';
import { getBackend, type Account, type Backend, type User } from '../lib/backend.js';
import { flush, forgetDevice, refresh as refreshHistory } from '../lib/historyStore.js';
import { flushSigns, forgetSignSync, pullSigns } from '../lib/signSync.js';

const ACTIVE_KEY = 'signsphere.active-account.v1';
/** Account type chosen on the login screen, so we land on the right account afterwards. */
export const PREFERRED_TYPE_KEY = 'signsphere.login-type.v1';

interface SessionValue {
  backend: Backend;
  loading: boolean;
  user: User | null;
  accounts: Account[];
  active: Account | null;
  /** SignSphere team member (sees the admin panel). */
  isAdmin: boolean;
  switchAccount(id: string): void;
  createAccount(type: AccountType, values: Record<string, string>): Promise<Account>;
  updateAccount(account: Account, values: Record<string, string>): Promise<Account>;
  deleteAccount(id: string): Promise<void>;
  signOut(): Promise<void>;
  deleteLogin(): Promise<void>;
  reloadAccounts(): Promise<Account[]>;
}

const SessionContext = createContext<SessionValue | null>(null);

function readActive(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const reloadAccounts = useCallback(async () => {
    const list = await backend.listAccounts();
    setAccounts(list);
    return list;
  }, [backend]);

  const adopt = useCallback(
    async (next: User | null) => {
      setUser(next);
      if (!next) {
        setAccounts([]);
        setActiveId(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      try {
        const list = await backend.listAccounts();
        setAccounts(list);
        const remembered = readActive()[next.id];
        const preferred = localStorage.getItem(PREFERRED_TYPE_KEY);
        const pick =
          list.find((a) => a.id === remembered) ?? list.find((a) => a.type === preferred) ?? list[0] ?? null;
        setActiveId(pick?.id ?? null);
        void backend.isAdmin().then(setIsAdmin);
        // Recordings made on this login's other devices.
        void pullSigns();
      } catch {
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    },
    [backend],
  );

  useEffect(() => {
    void backend.getUser().then(adopt);
    const unsubscribe = backend.onAuthChange((next) => void adopt(next));
    const online = () => {
      void flush();
      void flushSigns();
    };
    window.addEventListener('online', online);
    return () => {
      unsubscribe();
      window.removeEventListener('online', online);
    };
  }, [backend, adopt]);

  const switchAccount = useCallback(
    (id: string) => {
      setActiveId(id);
      if (user) {
        const all = readActive();
        all[user.id] = id;
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(all));
      }
    },
    [user],
  );

  const createAccount = useCallback(
    async (type: AccountType, values: Record<string, string>) => {
      const details = cleanDetails(type, values);
      const account = await backend.createAccount(type, displayNameFor(type, details), details);
      await reloadAccounts();
      switchAccount(account.id);
      return account;
    },
    [backend, reloadAccounts, switchAccount],
  );

  const updateAccount = useCallback(
    async (account: Account, values: Record<string, string>) => {
      const details = cleanDetails(account.type, values);
      const updated = await backend.updateAccount(account.id, displayNameFor(account.type, details), details);
      await reloadAccounts();
      return updated;
    },
    [backend, reloadAccounts],
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      await backend.deleteAccount(id);
      const list = await reloadAccounts();
      if (activeId === id) setActiveId(list[0]?.id ?? null);
    },
    [backend, reloadAccounts, activeId],
  );

  const signOut = useCallback(async () => {
    await flush();
    await forgetSignSync();
    await backend.signOut();
    forgetDevice(); // the next person on this device must not see this user's history
  }, [backend]);

  const deleteLogin = useCallback(async () => {
    await backend.deleteUser();
    forgetDevice();
  }, [backend]);

  const active = accounts.find((a) => a.id === activeId) ?? null;

  // Live updates from this login's other devices.
  useEffect(() => {
    if (!user) return;
    return backend.subscribe(user.id, (table) => {
      if (table === 'signs') void pullSigns();
      else if (activeId) void refreshHistory(activeId);
    });
  }, [backend, user, activeId]);

  const value = useMemo<SessionValue>(
    () => ({ backend, loading, user, accounts, active, isAdmin, switchAccount, createAccount, updateAccount, deleteAccount, signOut, deleteLogin, reloadAccounts }),
    [backend, loading, user, accounts, active, isAdmin, switchAccount, createAccount, updateAccount, deleteAccount, signOut, deleteLogin, reloadAccounts],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}
