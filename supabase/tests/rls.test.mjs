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
const ADMIN = '00000000-0000-4000-8000-0000000000ad';

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
  insert into auth.users values ('${A}', 'a@example.com'), ('${B}', 'b@example.com'), ('${ADMIN}', 'staff@example.com');
  -- Minimal stand-in for Supabase Storage.
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated, anon;
  grant select, insert, update, delete on storage.objects to authenticated;
  -- Supabase's realtime publication.
  create publication supabase_realtime;
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

{
  const [fake] = await as(A, () => q(`insert into public.accounts (type, display_name, verification) values ('hospital', 'Fake', 'verified') returning *`));
  assert.equal(fake.verification, 'unverified');
  await as(A, () => q(`delete from public.accounts where id = $1`, [fake.id]));
  ok('user cannot create a pre-verified account (it is stored as unverified)');
}
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

// ───────────────────────── part 2: admins, verification, signs, feedback, storage
await q(`insert into public.admins (user_id) values ($1)`, [ADMIN]);
await fails(as(A, () => q(`insert into public.admins (user_id) values ($1)`, [A])), 'users cannot make themselves admin');
assert.equal((await as(A, () => q(`select public.is_admin() as a`)))[0].a, false);
assert.equal((await as(ADMIN, () => q(`select public.is_admin() as a`)))[0].a, true);
ok('is_admin() is true only for staff');

// Owner asks for review; cannot verify.
await as(A, () => q(`update public.accounts set verification = 'pending' where id = $1`, [acctA.id]));
assert.equal((await q(`select verification from public.accounts where id = $1`, [acctA.id]))[0].verification, 'pending');
ok('hospital owner can request review (unverified → pending)');
await as(B, () => q(`update public.accounts set verification = 'pending' where id = $1`, [acctB.id]));
assert.equal((await q(`select verification from public.accounts where id = $1`, [acctB.id]))[0].verification, 'unverified');
ok('individual accounts cannot enter review');

// Admin sees organisations, not individuals.
const adminSees = await as(ADMIN, () => q(`select id, type from public.accounts`));
assert.ok(adminSees.some((r) => r.id === acctA.id));
assert.ok(!adminSees.some((r) => r.id === acctB.id));
ok("admins see hospitals/organisations but never individuals' accounts");

await as(ADMIN, () => q(`update public.accounts set verification = 'verified', verification_note = 'Registration checked', display_name = 'Renamed by admin' where id = $1`, [acctA.id]));
const reviewed = (await q(`select * from public.accounts where id = $1`, [acctA.id]))[0];
assert.equal(reviewed.verification, 'verified');
assert.equal(reviewed.verified_by, ADMIN);
assert.ok(reviewed.verified_at);
assert.equal(reviewed.display_name, 'City General');
ok('admin verifies a hospital (who and when recorded) but cannot edit its details');

await as(A, () => q(`update public.accounts set verification_note = 'self-approved' where id = $1`, [acctA.id]));
assert.equal((await q(`select verification_note from public.accounts where id = $1`, [acctA.id]))[0].verification_note, 'Registration checked');
ok('owner cannot forge the review note');
await as(A, () => q(`update public.accounts set details = '{"registrationNumber":"TS/999"}' where id = $1`, [acctA.id]));
assert.equal((await q(`select verification from public.accounts where id = $1`, [acctA.id]))[0].verification, 'unverified');
ok('changing the registration number sends a verified account back for review');

const overview = (await as(ADMIN, () => q(`select public.admin_overview() as o`)))[0].o;
assert.equal(overview.logins, 3);
await fails(as(A, () => q(`select public.admin_overview()`)), 'admin dashboard numbers are admins-only');

// Signs sync
const s1 = '20000000-0000-4000-8000-000000000001';
await as(A, () => q(`insert into public.signs (id, account_id, gloss, feature_version, source_frames, vector, motion) values ($1, $2, 'HELLO', 3, 32, $3, 'abc')`, [s1, acctA.id, [0.1, 0.2, 0.3]]));
await as(A, () => q(`insert into public.signs (id, gloss, feature_version, source_frames, vector) values ($1, 'HELLO', 3, 32, $2) on conflict (id) do nothing`, [s1, [9]]));
assert.equal((await q(`select count(*)::int as n from public.signs`))[0].n, 1);
ok('recorded sign syncs; offline re-sends never duplicate');
assert.equal((await as(B, () => q(`select * from public.signs`))).length, 0);
assert.equal((await as(ADMIN, () => q(`select * from public.signs`))).length, 0);
ok("nobody else — not even admins — can read a user's recordings");
await fails(as(B, () => q(`insert into public.signs (id, account_id, gloss, feature_version, source_frames, vector) values (gen_random_uuid(), $1, 'X', 3, 1, '{1}')`, [acctA.id])), "cannot attach a sign to someone else's account");
await fails(as(A, () => q(`insert into public.signs (id, gloss, feature_version, source_frames, vector) values (gen_random_uuid(), 'drop table', 3, 1, '{1}')`)), 'invalid sign names rejected');
await as(B, () => q(`delete from public.signs where id = $1`, [s1]));
assert.equal((await q(`select count(*)::int as n from public.signs`))[0].n, 1);
ok("cannot delete someone else's recordings");

// Feedback
const [fb] = await as(A, () => q(`insert into public.feedback (account_id, kind, gloss, message) values ($1, 'wrong-sign', 'HELLO', 'The hand shape looks wrong') returning *`, [acctA.id]));
await fails(as(A, () => q(`insert into public.feedback (kind, message, status) values ('bug', 'sneaky', 'resolved')`)), 'users cannot file pre-resolved reports');
assert.equal((await as(B, () => q(`select * from public.feedback`))).length, 0);
assert.equal((await as(ADMIN, () => q(`select * from public.feedback`))).length, 1);
ok('reports are visible to the sender and admins only');
await as(A, () => q(`update public.feedback set status = 'resolved' where id = $1`, [fb.id]));
assert.equal((await q(`select status from public.feedback where id = $1`, [fb.id]))[0].status, 'open');
await as(ADMIN, () => q(`update public.feedback set status = 'resolved', admin_note = 'Fixed', message = 'edited' where id = $1`, [fb.id]));
const fixed = (await q(`select * from public.feedback where id = $1`, [fb.id]))[0];
assert.equal(fixed.status, 'resolved');
assert.equal(fixed.message, 'The hand shape looks wrong');
assert.ok(fixed.resolved_at);
ok('only admins resolve reports, and cannot rewrite what the user said');

// Storage + realtime
assert.equal((await q(`select public from storage.buckets where id = 'sign-packs'`))[0].public, true);
await as(ADMIN, () => q(`insert into storage.objects (bucket_id, name) values ('sign-packs', 'isl-include.json')`));
await fails(as(A, () => q(`insert into storage.objects (bucket_id, name) values ('sign-packs', 'evil.json')`)), 'only admins can publish a sign pack');
const pub = (await q(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`)).map((r) => r.tablename);
assert.deepEqual(pub, ['history', 'signs']);
ok('sign-pack bucket is public-read/admin-write; history and signs stream live');

// ───────────────────────── part 3: admin tools (team, blocking, announcements, vocabulary, stats)
const rpc = (user, sql, params) => as(user, () => q(sql, params)).then((rows) => Object.values(rows[0] ?? {})[0]);

// The team
for (const fn of [
  `select public.admin_list_admins()`, `select public.admin_add_admin('a@example.com')`, `select public.admin_list_users('')`,
  `select public.admin_stats(30)`, `select public.admin_list_announcements()`, `select public.admin_post_announcement('x', 'y')`,
  `select public.admin_save_word('HACK', array['hack'], 'noun')`, `select public.admin_set_blocked('${B}', true, 'x')`,
]) {
  await fails(as(A, () => q(fn)), `non-admins refused: ${fn.slice(14, fn.indexOf('('))}`);
}
await fails(as(null, () => q(`select public.admin_list_users('')`)), 'signed-out visitors cannot list users');
let team = await rpc(ADMIN, `select public.admin_add_admin('B@Example.com ')`);
assert.deepEqual(team.map((t) => t.email).sort(), ['b@example.com', 'staff@example.com']);
await fails(as(ADMIN, () => q(`select public.admin_add_admin('nobody@example.com')`)), 'adding an unknown email explains they must sign up first');
team = await rpc(B, `select public.admin_remove_admin('${B}')`);
assert.deepEqual(team.map((t) => t.email), ['staff@example.com']);
await fails(as(ADMIN, () => q(`select public.admin_remove_admin('${ADMIN}')`)), 'the last admin cannot be removed');
ok('admins add and remove team members by email; the last admin stays');

// Blocking
const users = await rpc(ADMIN, `select public.admin_list_users('example')`);
assert.equal(users.length, 3);
assert.ok(users.every((u) => !('details' in u) && !('history' in u)));
await fails(as(ADMIN, () => q(`select public.admin_set_blocked('${ADMIN}', true, 'x')`)), 'admins cannot block themselves');
await rpc(ADMIN, `select public.admin_set_blocked('${B}', true, 'Spam reports')`);
assert.deepEqual(await rpc(B, `select public.my_status()`), { blocked: true, reason: 'Spam reports' });
assert.deepEqual(await rpc(A, `select public.my_status()`), { blocked: false, reason: null });
await fails(as(B, () => q(`insert into public.accounts (type, display_name) values ('individual', 'Again')`)), 'blocked login cannot create accounts');
await fails(as(B, () => q(`insert into public.feedback (kind, message) values ('bug', 'spam spam')`)), 'blocked login cannot send reports');
assert.equal((await as(B, () => q(`update public.accounts set display_name = 'Changed' where user_id = $1 returning id`, [B]))).length, 0);
assert.equal((await as(B, () => q(`select id from public.accounts`))).length, 1);
await fails(as(B, () => q(`select * from public.blocked_users`)), 'nobody reads the block list directly');
await fails(as(ADMIN, () => q(`select public.admin_add_admin('b@example.com')`)).then(async () => {
  // Making a blocked login an admin unblocks them; blocking an admin is refused.
  assert.equal((await rpc(B, `select public.my_status()`)).blocked, false);
  await fails(as(ADMIN, () => q(`select public.admin_set_blocked('${B}', true, 'x')`)), 'admins cannot be blocked');
  await rpc(ADMIN, `select public.admin_remove_admin('${B}')`);
  throw new Error('done');
}), 'promoting a blocked login unblocks it');
await rpc(ADMIN, `select public.admin_set_blocked('${B}', true, null)`);
await rpc(ADMIN, `select public.admin_set_blocked('${B}', false, null)`);
await as(B, () => q(`update public.accounts set display_name = 'Bee' where user_id = $1`, [B]));
ok('blocked logins can read and delete their data but not add or change anything; unblocking restores them');

// Announcements
await rpc(ADMIN, `select public.admin_post_announcement('New signs', '50 new ISL signs added')`);
const [news] = await rpc(null, `select public.active_announcements()`);
assert.equal(news.title, 'New signs');
await rpc(ADMIN, `select public.admin_set_announcement('${news.id}', false)`);
assert.equal((await rpc(A, `select public.active_announcements()`)).length, 0);
assert.equal((await rpc(ADMIN, `select public.admin_list_announcements()`)).length, 1);
await fails(as(A, () => q(`insert into public.announcements (title) values ('fake')`)), 'users cannot write announcements directly');
await rpc(ADMIN, `select public.admin_delete_announcement('${news.id}')`);
ok('announcements: admins post, hide and delete; everyone (even signed out) reads the active ones');

// Vocabulary
let vocab = await rpc(ADMIN, `select public.admin_save_word('pain', array['Pain', 'hurts', ' pain '], 'noun', 'medical', null, false, false, null, false)`);
assert.deepEqual(vocab.map((w) => [w.gloss, w.english.sort()]), [['PAIN', ['hurts', 'pain']]]);
await fails(as(ADMIN, () => q(`select public.admin_save_word('PAIN', array['pain'], 'noun', null, null, false, true, '', false)`)), 'a word cannot be marked reviewed without naming the signer');
await fails(as(ADMIN, () => q(`select public.admin_save_word('PAIN', array['pain'], 'thing')`)), 'unknown part of speech rejected');
vocab = await rpc(ADMIN, `select public.admin_save_word('PAIN', array['pain'], 'noun', 'medical', null, false, true, 'R. Kumar (ISL interpreter)', false)`);
assert.equal(vocab[0].reviewedBy, 'R. Kumar (ISL interpreter)');
assert.equal((await rpc(null, `select public.vocabulary_entries()`)).length, 1);
await fails(as(A, () => q(`insert into public.vocabulary (gloss, english, pos) values ('X', array['x'], 'noun')`)), 'users cannot edit the vocabulary directly');
assert.equal((await rpc(ADMIN, `select public.admin_delete_word('pain')`)).length, 0);
ok('vocabulary: admins add, review (with the signer named) and delete words; everyone reads them');

// Statistics
await as(A, () => q(`insert into public.feedback (kind, gloss, message) values ('missing-sign', 'water', 'please add water')`));
const stats = await rpc(ADMIN, `select public.admin_stats(7)`);
assert.equal(stats.days, 7);
assert.equal(stats.daily.length, 7);
assert.ok(stats.missingRequested.some((m) => m.gloss === 'WATER' && m.count === 1));
assert.ok(!JSON.stringify(stats).includes('please add water'));
assert.ok(!JSON.stringify(stats).includes(A));
ok('statistics are counts only: no user ids, no messages, no history text');

// ───────────────────────── part 4: error reports
await as(null, () => q(`select public.report_error('TypeError: x is undefined', 'TypeError\n    at Avatar (app.js?v=1:10:5)', '/text-to-sign', 'abc123', 'web')`));
await as(A, () => q(`select public.report_error('TypeError: x is undefined', 'TypeError\n    at Avatar (app.js?v=2:10:5)', '/learn', 'abc124', 'android-app')`));
await as(A, () => q(`select public.report_error('Other problem', null, '/', 'abc124', 'web')`));
let errors = await rpc(ADMIN, `select public.admin_list_errors(false)`);
assert.equal(errors.length, 2);
const grouped = errors.find((e) => e.message.startsWith('TypeError'));
assert.equal(grouped.count, 2);
assert.equal(grouped.page, '/learn');
assert.ok(!JSON.stringify(errors).includes(A));
ok('errors from signed-out and signed-in people are grouped by cause, with no login id');
await fails(as(A, () => q(`select public.admin_list_errors(false)`)), 'only admins read error reports');
await fails(as(A, () => q(`select * from public.error_reports`)), 'nobody reads error reports directly');
await rpc(ADMIN, `select public.admin_resolve_error(${grouped.id}, true)`);
assert.equal(await rpc(ADMIN, `select public.admin_open_errors()`), 1);
await as(B, () => q(`select public.report_error('TypeError: x is undefined', 'TypeError\n    at Avatar (app.js:10:5)', '/x', 'v', 'web')`));
assert.equal(await rpc(ADMIN, `select public.admin_open_errors()`), 2);
await rpc(ADMIN, `select public.admin_resolve_error(${grouped.id}, true)`);
await rpc(ADMIN, `select public.admin_delete_resolved_errors()`);
errors = await rpc(ADMIN, `select public.admin_list_errors(true)`);
assert.equal(errors.length, 1);
await as(null, () => q(`select public.report_error(repeat('x', 900))`));
assert.ok((await rpc(ADMIN, `select public.admin_list_errors(false)`)).every((e) => e.message.length <= 500));
ok('a resolved error reopens if it happens again; admins resolve and clear; long messages are trimmed');

// Migrations are safe to re-run.
for (const file of readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
  await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
}
ok('migrations can be run again without errors');

// Delete my login
await as(A, () => q(`select public.delete_my_user()`));
assert.equal((await q(`select count(*)::int as n from public.accounts where user_id = $1`, [A]))[0].n, 0);
assert.equal((await q(`select count(*)::int as n from public.history`))[0].n, 0);
assert.equal((await q(`select count(*)::int as n from public.signs`))[0].n, 0);
assert.equal((await q(`select count(*)::int as n from public.feedback`))[0].n, 0);
assert.equal((await q(`select count(*)::int as n from public.accounts where user_id = $1`, [B]))[0].n, 1);
void acctB;
ok('delete_my_user removes the login with all accounts and history, and nobody else’s');

console.log('\nRLS OK');
