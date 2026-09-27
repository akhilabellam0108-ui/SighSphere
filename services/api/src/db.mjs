/**
 * The database: Postgres (PGlite, compiled to WebAssembly — no install needed) stored in a
 * folder on disk. On start it applies supabase/migrations, so this server enforces exactly
 * the same tables and row-level security rules as the Supabase setup.
 *
 * Every request runs as the signed-in user (`set role authenticated` + their id), so a bug in
 * the API cannot leak another user's data: the database refuses it.
 */
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, '../../../supabase/migrations');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Supabase provides these; this is the same minimal stand-in the security tests use, plus
// real password storage for this server's own logins.
const BOOTSTRAP = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email) and char_length(email) <= 254),
  password_hash  text not null,
  created_at     timestamptz not null default now(),
  last_sign_in   timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.role', true), '') $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
`;

export async function openDatabase(dataDir) {
  let db;
  if (dataDir === 'memory://') {
    db = new PGlite();
  } else {
    mkdirSync(dataDir, { recursive: true });
    db = new PGlite(join(dataDir, 'pg'));
  }
  await db.waitReady;
  await db.exec(BOOTSTRAP);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }

  // One connection: run requests one at a time so each keeps its own identity.
  let chain = Promise.resolve();
  const serial = (fn) => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };

  const query = async (sql, params = []) => (await db.query(sql, params)).rows;

  return {
    /** Run as the database owner (logins, housekeeping). */
    asSystem(fn) {
      return serial(() => fn(query));
    },
    /** Run as a signed-in user: row-level security applies to everything inside. */
    asUser(userId, fn) {
      if (!UUID.test(userId)) return Promise.reject(new Error('bad user id'));
      return serial(async () => {
        await db.exec(
          `reset role; select set_config('request.jwt.claim.sub', '${userId}', false), set_config('request.jwt.claim.role', 'authenticated', false); set role authenticated;`,
        );
        try {
          return await fn(query);
        } finally {
          await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);`);
        }
      });
    },
    close: () => db.close(),
  };
}
