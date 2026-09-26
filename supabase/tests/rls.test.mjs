/**
 * Runs supabase/migrations/*.sql on a real Postgres engine (PGlite) with a minimal stand-in
 * for Supabase's auth schema, then tries to break the security rules as two different users.
 *   node supabase/tests/rls.test.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const db = new PGlite();
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

// Supabase provides these; this is the smallest faithful stand-in.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
  insert into auth.users values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
`);
for (const file of readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
  await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
}
await db.exec('grant all on all tables in schema public to service_role;');

async function as(user, fn) {
  await db.exec('reset role');
  await db.exec(`select set_config('request.jwt.claim.sub', '${user ?? ''}', false), set_config('request.jwt.claim.role', '${user ? 'authenticated' : 'anon'}', false)`);
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const q = (sql, params) => db.query(sql, params).then((r) => r.rows);
async function fails(promise, label) {
  try {
    await promise;
  } catch {
    console.log(`  ✓ ${label}`);
    return;
  }
  throw new Error(`expected failure: ${label}`);
}
const ok = (label) => console.log(`  ✓ ${label}`);

// A creates accounts
const [acctA] = await as(A, () => q(`insert into public.accounts (type, display_name, details) values ('hospital', 'City General', '{"registrationNumber":"TS/1"}') returning *`));
assert.equal(acctA.user_id, A);
assert.equal(acctA.verification, 'unverified');
ok('user creates an account; it belongs to them and starts unverified');

await fails(as(A, () => q(`insert into public.accounts (type, display_name, verification) values ('hospital', 'Fake', 'verified')`)), 'user cannot create a pre-verified account');
await fails(as(A, () => q(`insert into public.accounts (user_id, type, display_name) values ('${B}', 'individual', 'Spoof')`)), 'user cannot create an account for someone else');
await fails(as(A, () => q(`insert into public.accounts (type, display_name) values ('robot', 'X')`)), 'unknown account type rejected');

await as(A, () => q(`update public.accounts set verification = 'verified' where id = $1`, [acctA.id]));
assert.equal((await q(`select verification from public.accounts where id = $1`, [acctA.id]))[0].verification, 'unverified');
ok('user cannot verify their own account');

// B's view of A
const [acctB] = await as(B, () => q(`insert into public.accounts (type, display_name) values ('individual', 'Bee') returning *`));
assert.equal((await as(B, () => q(`select * from public.accounts`))).length, 1);
ok("other users' accounts are invisible");
await as(B, () => q(`update public.accounts set display_name = 'hacked' where id = $1`, [acctA.id]));
assert.equal((await q(`select display_name from public.accounts where id = $1`, [acctA.id]))[0].display_name, 'City General');
ok("cannot edit someone else's account");
await as(B, () => q(`delete from public.accounts where id = $1`, [acctA.id]));
assert.equal((await q(`select count(*)::int as n from public.accounts where id = $1`, [acctA.id]))[0].n, 1);
ok("cannot delete someone else's account");

// History
const h1 = '10000000-0000-4000-8000-000000000001';
await as(A, () => q(`insert into public.history (id, account_id, kind, input, output) values ($1, $2, 'text-to-sign', 'where is the hospital', 'HOSPITAL WHERE')`, [h1, acctA.id]));
ok('history saved to own account');
await as(A, () => q(`insert into public.history (id, account_id, kind, input, output) values ($1, $2, 'text-to-sign', 'where is the hospital?', 'HOSPITAL WHERE') on conflict (id) do update set input = excluded.input`, [h1, acctA.id]));
assert.equal((await q(`select count(*)::int as n from public.history`))[0].n, 1);
ok('re-sent history (offline retry) updates instead of duplicating');
await fails(as(B, () => q(`insert into public.history (id, account_id, kind, input, output) values (gen_random_uuid(), $1, 'text-to-sign', 'x', 'X')`, [acctA.id])), "cannot write into someone else's account history");
assert.equal((await as(B, () => q(`select * from public.history`))).length, 0);
ok("cannot read someone else's history");
await fails(as(A, () => q(`insert into public.history (id, account_id, kind, input, output) values (gen_random_uuid(), $1, 'text-to-sign', repeat('x', 6000), 'X')`, [acctA.id])), 'oversized history entries rejected');

// Anonymous
await fails(as(null, () => q(`select * from public.accounts`)), 'signed-out visitors cannot read accounts');

// Account limit
await as(A, async () => {
  for (let i = 0; i < 9; i += 1) await q(`insert into public.accounts (type, display_name) values ('individual', 'n${i}')`);
});
await fails(as(A, () => q(`insert into public.accounts (type, display_name) values ('individual', 'eleventh')`)), 'maximum of 10 accounts per login');

// Delete my login
await as(A, () => q(`select public.delete_my_user()`));
assert.equal((await q(`select count(*)::int as n from public.accounts where user_id = $1`, [A]))[0].n, 0);
assert.equal((await q(`select count(*)::int as n from public.history`))[0].n, 0);
assert.equal((await q(`select count(*)::int as n from public.accounts where user_id = $1`, [B]))[0].n, 1);
void acctB;
ok('delete_my_user removes the login with all accounts and history, and nobody else’s');

console.log('\nRLS OK');
