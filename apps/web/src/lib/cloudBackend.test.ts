// @vitest-environment node
/**
 * Runs the real Supabase client against a recording fetch, and checks every table, column
 * and function the app uses exists in supabase/migrations — so the app and the database
 * cannot drift apart unnoticed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { cloudBackend } from './backend.js';

const dir = new URL('../../../../supabase/migrations/', import.meta.url);
const sql = readdirSync(dir).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');

function columnsOf(table: string): Set<string> {
  const cols = new Set<string>();
  const create = new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  for (const line of (create?.[1] ?? '').split('\n')) {
    const m = /^\s+([a-z_]+)\s+[a-z]/.exec(line);
    if (m?.[1]) cols.add(m[1]);
  }
  for (const m of sql.matchAll(new RegExp(`alter table public\\.${table} add column if not exists ([a-z_]+)`, 'g'))) cols.add(m[1] as string);
  return cols;
}
const functions = new Set([...sql.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]));

interface Seen { table: string; kind: 'rest' | 'rpc' | 'storage'; keys: string[]; params: string[] }
const seen: Seen[] = [];
const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input));
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
  const rows = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
  const params = [...url.searchParams.keys()].concat(
    [...url.searchParams.entries()].filter(([k]) => k === 'select' || k === 'order').flatMap(([, v]) => v.split(',').map((x) => x.split('.')[0] as string)),
  );
  const rest = /\/rest\/v1\/(rpc\/)?([a-z_]+)/.exec(url.pathname);
  if (rest) seen.push({ table: rest[2] as string, kind: rest[1] ? 'rpc' : 'rest', keys, params });
  if (url.pathname.includes('/storage/v1/')) seen.push({ table: url.pathname, kind: 'storage', keys: [], params: [] });
  const single = init?.headers && JSON.stringify(init.headers).includes('vnd.pgrst.object');
  const payload = rest?.[1] ? (rest[2] === 'is_admin' ? true : {}) : single ? { id: 'x', details: {}, type: 'hospital' } : [];
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
};

describe('app ↔ database contract', () => {
  it('uses only tables, columns and functions that the migrations create', async () => {
    const client = createClient('https://example.supabase.co', 'anon', { global: { fetch: fakeFetch as typeof fetch }, auth: { persistSession: false } });
    const b = cloudBackend(client, 'https://example.supabase.co');
    const sign = { id: 'i', accountId: 'a', gloss: 'HELLO', featureVersion: 3, sourceFrames: 32, vector: [1], motion: null, meta: {}, createdAt: new Date().toISOString() };
    await b.listAccounts();
    await b.createAccount('hospital', 'H', {});
    await b.updateAccount('x', 'H', {});
    await b.requestVerification('x');
    await b.listHistory('a');
    await b.putHistory([{ id: 'h', accountId: 'a', kind: 'text-to-sign', input: 'i', output: 'o', createdAt: '' }]);
    await b.deleteHistory(['h']);
    await b.listSigns();
    await b.putSigns([sign]);
    await b.deleteSigns(['i']);
    await b.sendFeedback({ accountId: null, kind: 'bug', gloss: null, message: 'hello', page: null });
    await b.isAdmin();
    await b.adminOverview();
    await b.adminListFeedback('open');
    await b.adminResolveFeedback('f', 'resolved', 'ok');
    await b.adminReview('x', 'verified', 'checked');
    await b.adminPublishSignPack(new Blob(['{}']));

    const tables = new Set(['accounts', 'history', 'signs', 'feedback', 'admins']);
    for (const s of seen) {
      if (s.kind === 'storage') {
        expect(s.table).toContain('sign-packs');
        continue;
      }
      if (s.kind === 'rpc') {
        expect(functions.has(s.table), `function ${s.table}`).toBe(true);
        continue;
      }
      expect(tables.has(s.table), `table ${s.table}`).toBe(true);
      const cols = columnsOf(s.table);
      for (const k of s.keys) expect(cols.has(k), `${s.table}.${k}`).toBe(true);
      for (const p of s.params) {
        if (['select', 'order', 'on_conflict', 'limit', 'offset', 'columns', '*'].includes(p) || p === '') continue;
        expect(cols.has(p), `${s.table}.${p} (filter)`).toBe(true);
      }
    }
    expect(seen.filter((s) => s.kind === 'rest').length).toBeGreaterThan(10);
  });
});
