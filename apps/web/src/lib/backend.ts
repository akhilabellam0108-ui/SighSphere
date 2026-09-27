/**
 * Backend: authentication, accounts, history, synced signs, feedback and the admin panel.
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
  /** Message from the SignSphere team after a review. */
  verificationNote?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

/** A sign recorded on the Record screen, synced to the login so every device has it. */
export interface CloudSign {
  id: string;
  accountId: string | null;
  gloss: string;
  featureVersion: number;
  sourceFrames: number;
  vector: number[];
  /** Encoded motion clip (lib/motion.ts) for the 3D avatar; null if too short. */
  motion: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export type FeedbackKind = 'wrong-sign' | 'missing-sign' | 'recognition' | 'bug' | 'idea' | 'other';

export interface Feedback {
  id: string;
  accountId: string | null;
  kind: FeedbackKind;
  gloss: string | null;
  message: string;
  page: string | null;
  status: 'open' | 'resolved';
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminOverview {
  logins: number;
  accounts: Record<string, number>;
  pendingReviews: number;
  verified: number;
  historyLast7Days: number;
  signsRecorded: number;
  openFeedback: number;
}

export type RealtimeTable = 'history' | 'signs';

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

  /** Hospital / organisation owner asks the SignSphere team to check their registration. */
  requestVerification(accountId: string): Promise<Account>;

  // Recorded signs, synced across the login's devices.
  listSigns(): Promise<CloudSign[]>;
  /** Idempotent: signs already uploaded are skipped. */
  putSigns(signs: CloudSign[]): Promise<void>;
  deleteSigns(ids: string[]): Promise<void>;
  deleteAllSigns(): Promise<void>;

  // Reports and suggestions.
  sendFeedback(feedback: Pick<Feedback, 'accountId' | 'kind' | 'gloss' | 'message' | 'page'>): Promise<Feedback>;
  listMyFeedback(): Promise<Feedback[]>;

  /** Public address of the cloud ISL sign pack, if there is a server. */
  signPackUrl(): string | null;
  /** Calls back when this user's history or signs change on another device. */
  subscribe(userId: string, onChange: (table: RealtimeTable) => void): () => void;

  // SignSphere team.
  isAdmin(): Promise<boolean>;
  adminOverview(): Promise<AdminOverview>;
  adminListOrganisations(): Promise<Account[]>;
  adminReview(accountId: string, verification: Account['verification'], note: string): Promise<void>;
  adminListFeedback(status: 'open' | 'resolved'): Promise<Feedback[]>;
  adminResolveFeedback(id: string, status: 'open' | 'resolved', note: string): Promise<void>;
  adminPublishSignPack(file: Blob): Promise<string>;
}

export const SIGN_PACK_FILE = 'isl-include.json';

/** For screens that need a server (the admin panel). */
export class NeedsServerError extends Error {
  constructor() {
    super('This needs the SignSphere server. It is not connected on this copy of the app.');
  }
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
  verification_note?: string | null;
  verified_at?: string | null;
  created_at: string;
}

interface SignRow {
  id: string;
  account_id: string | null;
  gloss: string;
  feature_version: number;
  source_frames: number;
  vector: number[];
  motion: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface FeedbackRow {
  id: string;
  account_id: string | null;
  kind: FeedbackKind;
  gloss: string | null;
  message: string;
  page: string | null;
  status: Feedback['status'];
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

const fromSignRow = (r: SignRow): CloudSign => ({
  id: r.id,
  accountId: r.account_id,
  gloss: r.gloss,
  featureVersion: r.feature_version,
  sourceFrames: r.source_frames,
  vector: r.vector,
  motion: r.motion,
  meta: r.meta ?? {},
  createdAt: r.created_at,
});

const fromFeedbackRow = (r: FeedbackRow): Feedback => ({
  id: r.id,
  accountId: r.account_id,
  kind: r.kind,
  gloss: r.gloss,
  message: r.message,
  page: r.page,
  status: r.status,
  adminNote: r.admin_note,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
});

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
  verificationNote: r.verification_note ?? null,
  verifiedAt: r.verified_at ?? null,
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

export function cloudBackend(client: SupabaseClient, projectUrl = ''): Backend {
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
    async requestVerification(accountId) {
      const row = check(await client.from('accounts').update({ verification: 'pending' }).eq('id', accountId).select().single());
      return fromAccountRow(row as AccountRow);
    },
    async listSigns() {
      const out: CloudSign[] = [];
      // Page through: a signer may have hundreds of recordings.
      for (let from = 0; ; from += 200) {
        const rows = check(await client.from('signs').select('*').order('created_at').range(from, from + 199)) as SignRow[];
        out.push(...rows.map(fromSignRow));
        if (rows.length < 200) return out;
      }
    },
    async putSigns(signs) {
      for (let i = 0; i < signs.length; i += 20) {
        const batch = signs.slice(i, i + 20).map((x) => ({
          id: x.id,
          account_id: x.accountId,
          gloss: x.gloss,
          feature_version: x.featureVersion,
          source_frames: x.sourceFrames,
          vector: x.vector,
          motion: x.motion,
          meta: x.meta,
          created_at: x.createdAt,
        }));
        check(await client.from('signs').upsert(batch, { onConflict: 'id', ignoreDuplicates: true }));
      }
    },
    async deleteSigns(ids) {
      if (ids.length === 0) return;
      check(await client.from('signs').delete().in('id', ids));
    },
    async deleteAllSigns() {
      const { data } = await client.auth.getSession();
      const uid = data.session?.user.id;
      if (uid) check(await client.from('signs').delete().eq('user_id', uid));
    },
    async sendFeedback(f) {
      const row = check(
        await client.from('feedback').insert({ account_id: f.accountId, kind: f.kind, gloss: f.gloss, message: f.message, page: f.page }).select().single(),
      );
      return fromFeedbackRow(row as FeedbackRow);
    },
    async listMyFeedback() {
      const { data } = await client.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return [];
      const rows = check(await client.from('feedback').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100));
      return (rows as FeedbackRow[]).map(fromFeedbackRow);
    },
    signPackUrl() {
      return projectUrl ? `${projectUrl.replace(/\/$/, '')}/storage/v1/object/public/sign-packs/${SIGN_PACK_FILE}` : null;
    },
    subscribe(userId, onChange) {
      const channel = client
        .channel(`user-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'history', filter: `user_id=eq.${userId}` }, () => onChange('history'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'signs', filter: `user_id=eq.${userId}` }, () => onChange('signs'))
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
    async isAdmin() {
      const { data, error } = await client.rpc('is_admin');
      return !error && data === true;
    },
    async adminOverview() {
      return check(await client.rpc('admin_overview')) as AdminOverview;
    },
    async adminListOrganisations() {
      const { data } = await client.auth.getSession();
      const uid = data.session?.user.id ?? '';
      const rows = check(
        await client.from('accounts').select('*').in('type', ['hospital', 'organisation']).neq('user_id', uid).order('created_at', { ascending: false }).limit(500),
      );
      return (rows as AccountRow[]).map(fromAccountRow);
    },
    async adminReview(accountId, verification, note) {
      check(await client.from('accounts').update({ verification, verification_note: note || null }).eq('id', accountId));
    },
    async adminListFeedback(status) {
      const rows = check(await client.from('feedback').select('*').eq('status', status).order('created_at', { ascending: false }).limit(300));
      return (rows as FeedbackRow[]).map(fromFeedbackRow);
    },
    async adminResolveFeedback(id, status, note) {
      check(await client.from('feedback').update({ status, admin_note: note || null }).eq('id', id));
    },
    async adminPublishSignPack(file) {
      const { error } = await client.storage.from('sign-packs').upload(SIGN_PACK_FILE, file, { upsert: true, contentType: 'application/json', cacheControl: '300' });
      if (error) throw new Error(friendlyError(error));
      return this.signPackUrl() ?? '';
    },
  };
}

// ----------------------------------------------------------------------- device

const DEVICE_SESSION = 'signsphere.device-session.v1';
const DEVICE_ACCOUNTS = 'signsphere.accounts.v1';
const DEVICE_HISTORY = 'signsphere.history-server.v1';
const DEVICE_FEEDBACK = 'signsphere.feedback.v1';
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
    async requestVerification() {
      throw new Error('Verification needs the SignSphere server, which is not connected on this copy of the app.');
    },
    // Recordings already live on this device; there is nothing to sync to.
    async listSigns() {
      return [];
    },
    async putSigns() {},
    async deleteSigns() {},
    async deleteAllSigns() {},
    async sendFeedback(f) {
      const item: Feedback = { ...f, id: newId(), status: 'open', adminNote: null, createdAt: new Date().toISOString(), resolvedAt: null };
      write(DEVICE_FEEDBACK, [item, ...read<Feedback[]>(DEVICE_FEEDBACK, [])].slice(0, 100));
      return item;
    },
    async listMyFeedback() {
      return read<Feedback[]>(DEVICE_FEEDBACK, []);
    },
    signPackUrl() {
      return null;
    },
    subscribe() {
      return () => {};
    },
    async isAdmin() {
      return false;
    },
    async adminOverview() {
      throw new NeedsServerError();
    },
    async adminListOrganisations() {
      throw new NeedsServerError();
    },
    async adminReview() {
      throw new NeedsServerError();
    },
    async adminListFeedback() {
      throw new NeedsServerError();
    },
    async adminResolveFeedback() {
      throw new NeedsServerError();
    },
    async adminPublishSignPack() {
      throw new NeedsServerError();
    },
  };
}

// ------------------------------------------------------------------------ choose

let instance: Backend | null = null;

export function getBackend(): Backend {
  if (instance) return instance;
  const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
  const key = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;
  instance = url && key ? cloudBackend(createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }), url) : deviceBackend();
  return instance;
}

/** For tests. */
export function setBackend(backend: Backend | null): void {
  instance = backend;
}
