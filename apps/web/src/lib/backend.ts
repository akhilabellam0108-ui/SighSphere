/**
 * Backend: authentication, accounts and history.
 *
 * Two implementations behind one interface:
 *   - cloud  (Supabase): real logins with email + password, data on the server, protected by
 *            row-level security (supabase/migrations). Used when VITE_SUPABASE_URL and
 *            VITE_SUPABASE_ANON_KEY are set.
 *   - device: everything in this browser only, no password. Used until Supabase is
 *            configured, and labelled as such in the UI — it is never presented as a real login.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AccountType } from './accountTypes.js';
import { appUrl } from './base.js';

export interface User {
  id: string;
  email: string | null;
}

export interface Account {
  id: string;
  userId: string;
  type: AccountType;
  displayName: string;
  details: Record<string, string>;
  /** Organisations and hospitals are 'unverified' until SignSphere checks their registration. */
  verification: 'unverified' | 'pending' | 'verified';
  createdAt: string;
}

export type HistoryKind = 'text-to-sign' | 'voice-to-sign' | 'sign-to-text' | 'sign-to-voice';

export interface HistoryItem {
  id: string;
  accountId: string;
  kind: HistoryKind;
  input: string;
  output: string;
  createdAt: string;
}

export interface Backend {
  mode: 'cloud' | 'device';
  getUser(): Promise<User | null>;
  onAuthChange(callback: (user: User | null) => void): () => void;
  /** Returns true when the user must confirm their email before signing in. */
  signUp(email: string, password: string): Promise<boolean>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  deleteUser(): Promise<void>;
  listAccounts(): Promise<Account[]>;
  createAccount(type: AccountType, displayName: string, details: Record<string, string>): Promise<Account>;
  updateAccount(id: string, displayName: string, details: Record<string, string>): Promise<Account>;
  deleteAccount(id: string): Promise<void>;
  listHistory(accountId: string, limit?: number): Promise<HistoryItem[]>;
  /** Idempotent: re-sending an item with the same id is a no-op. */
  putHistory(items: HistoryItem[]): Promise<void>;
  deleteHistory(ids: string[]): Promise<void>;
  clearHistory(accountId: string): Promise<void>;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC 4122 v4 fallback for very old browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Turn Supabase / network errors into sentences a user can act on. */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match. Check them, or reset your password.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first — we sent you a link.';
  if (/user already registered/i.test(message)) return 'An account with this email already exists. Sign in instead.';
  if (/password should be at least/i.test(message)) return 'Use a password of at least 8 characters.';
  if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/failed to fetch|network/i.test(message)) return 'No connection to the server. Check your internet and try again.';
  if (/too many accounts/i.test(message)) return 'You have reached the limit of 10 accounts for one login.';
  return message || 'Something went wrong. Please try again.';
}

// ------------------------------------------------------------------------ cloud

interface AccountRow {
  id: string;
  user_id: string;
  type: AccountType;
  display_name: string;
  details: Record<string, string>;
  verification: Account['verification'];
  created_at: string;
}

interface HistoryRow {
  id: string;
  account_id: string;
  kind: HistoryKind;
  input: string;
  output: string;
  created_at: string;
}

const fromAccountRow = (r: AccountRow): Account => ({
  id: r.id,
  userId: r.user_id,
  type: r.type,
  displayName: r.display_name,
  details: r.details ?? {},
  verification: r.verification,
  createdAt: r.created_at,
});

const fromHistoryRow = (r: HistoryRow): HistoryItem => ({
  id: r.id,
  accountId: r.account_id,
  kind: r.kind,
  input: r.input,
  output: r.output,
  createdAt: r.created_at,
});

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error(friendlyError(result.error));
  return result.data;
}

export function cloudBackend(client: SupabaseClient): Backend {
  const toUser = (u: { id: string; email?: string | null } | null | undefined): User | null => (u ? { id: u.id, email: u.email ?? null } : null);
  return {
    mode: 'cloud',
    async getUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: appUrl('login') } });
      if (error) throw new Error(friendlyError(error));
      return !data.session;
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendlyError(error));
    },
    async signOut() {
      await client.auth.signOut();
    },
    async resetPassword(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: appUrl('login?reset=1') });
      if (error) throw new Error(friendlyError(error));
    },
    async deleteUser() {
      check(await client.rpc('delete_my_user'));
      await client.auth.signOut();
    },
    async listAccounts() {
      const rows = check(await client.from('accounts').select('*').order('created_at'));
      return (rows as AccountRow[]).map(fromAccountRow);
    },
    async createAccount(type, displayName, details) {
      const row = check(await client.from('accounts').insert({ type, display_name: displayName, details }).select().single());
      return fromAccountRow(row as AccountRow);
    },
    async updateAccount(id, displayName, details) {
      const row = check(await client.from('accounts').update({ display_name: displayName, details }).eq('id', id).select().single());
      return fromAccountRow(row as AccountRow);
    },
    async deleteAccount(id) {
      check(await client.from('accounts').delete().eq('id', id));
    },
    async listHistory(accountId, limit = 500) {
      const rows = check(await client.from('history').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(limit));
      return (rows as HistoryRow[]).map(fromHistoryRow);
    },
    async putHistory(items) {
      if (items.length === 0) return;
      check(
        await client.from('history').upsert(
          items.map((i) => ({ id: i.id, account_id: i.accountId, kind: i.kind, input: i.input, output: i.output, created_at: i.createdAt })),
          { onConflict: 'id' },
        ),
      );
    },
    async deleteHistory(ids) {
      if (ids.length === 0) return;
      check(await client.from('history').delete().in('id', ids));
    },
    async clearHistory(accountId) {
      check(await client.from('history').delete().eq('account_id', accountId));
    },
  };
}

// ----------------------------------------------------------------------- device

const DEVICE_SESSION = 'signsphere.device-session.v1';
const DEVICE_ACCOUNTS = 'signsphere.accounts.v1';
const DEVICE_HISTORY = 'signsphere.history-server.v1';
const DEVICE_USER: User = { id: 'device', email: null };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota: ignore */
  }
}

export function deviceBackend(): Backend {
  const listeners = new Set<(user: User | null) => void>();
  const emit = (user: User | null) => listeners.forEach((l) => l(user));
  return {
    mode: 'device',
    async getUser() {
      return read(DEVICE_SESSION, false) ? DEVICE_USER : null;
    },
    onAuthChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async signUp() {
      write(DEVICE_SESSION, true);
      emit(DEVICE_USER);
      return false;
    },
    async signIn() {
      write(DEVICE_SESSION, true);
      emit(DEVICE_USER);
    },
    async signOut() {
      localStorage.removeItem(DEVICE_SESSION);
      emit(null);
    },
    async resetPassword() {
      throw new Error('Passwords are not used in this-device mode.');
    },
    async deleteUser() {
      localStorage.removeItem(DEVICE_ACCOUNTS);
      localStorage.removeItem(DEVICE_HISTORY);
      localStorage.removeItem(DEVICE_SESSION);
      emit(null);
    },
    async listAccounts() {
      return read<Account[]>(DEVICE_ACCOUNTS, []);
    },
    async createAccount(type, displayName, details) {
      const accounts = read<Account[]>(DEVICE_ACCOUNTS, []);
      if (accounts.length >= 10) throw new Error(friendlyError('too many accounts'));
      const account: Account = { id: newId(), userId: DEVICE_USER.id, type, displayName, details, verification: 'unverified', createdAt: new Date().toISOString() };
      write(DEVICE_ACCOUNTS, [...accounts, account]);
      return account;
    },
    async updateAccount(id, displayName, details) {
      const accounts = read<Account[]>(DEVICE_ACCOUNTS, []);
      const found = accounts.find((a) => a.id === id);
      if (!found) throw new Error('Account not found.');
      const updated = { ...found, displayName, details };
      write(DEVICE_ACCOUNTS, accounts.map((a) => (a.id === id ? updated : a)));
      return updated;
    },
    async deleteAccount(id) {
      write(DEVICE_ACCOUNTS, read<Account[]>(DEVICE_ACCOUNTS, []).filter((a) => a.id !== id));
      write(DEVICE_HISTORY, read<HistoryItem[]>(DEVICE_HISTORY, []).filter((h) => h.accountId !== id));
    },
    async listHistory(accountId, limit = 500) {
      return read<HistoryItem[]>(DEVICE_HISTORY, [])
        .filter((h) => h.accountId === accountId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },
    async putHistory(items) {
      const byId = new Map(read<HistoryItem[]>(DEVICE_HISTORY, []).map((h) => [h.id, h]));
      for (const item of items) byId.set(item.id, item);
      write(DEVICE_HISTORY, [...byId.values()].slice(-5000));
    },
    async deleteHistory(ids) {
      const drop = new Set(ids);
      write(DEVICE_HISTORY, read<HistoryItem[]>(DEVICE_HISTORY, []).filter((h) => !drop.has(h.id)));
    },
    async clearHistory(accountId) {
      write(DEVICE_HISTORY, read<HistoryItem[]>(DEVICE_HISTORY, []).filter((h) => h.accountId !== accountId));
    },
  };
}

// ------------------------------------------------------------------------ choose

let instance: Backend | null = null;

export function getBackend(): Backend {
  if (instance) return instance;
  const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
  const key = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;
  instance = url && key ? cloudBackend(createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })) : deviceBackend();
  return instance;
}

/** For tests. */
export function setBackend(backend: Backend | null): void {
  instance = backend;
}
