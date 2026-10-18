/**
 * End-to-end API test: starts the real server (in-memory database) and uses it as two
 * different people plus the admin, over HTTP.   node services/api/test/api.test.mjs
 */
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { startServer } from '../src/server.mjs';

const server = await startServer({ port: 0, host: '127.0.0.1', dataDir: 'memory://', quiet: true, webDir: '/nonexistent' });
const base = `http://127.0.0.1:${server.port}/api`;
const ok = (label) => console.log(`  ✓ ${label}`);

async function call(token, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

try {
  // Logins
  const admin = await call(null, 'POST', '/auth/signup', { email: 'Team@SignSphere.in', password: 'team-password-1' });
  assert.equal(admin.status, 200);
  const T0 = admin.body.token;
  assert.equal((await call(T0, 'GET', '/admin/me')).body.admin, true);
  ok('first login on a new server becomes the admin');

  const a = await call(null, 'POST', '/auth/signup', { email: 'akhila@example.com', password: 'correct-horse' });
  const b = await call(null, 'POST', '/auth/signup', { email: 'bee@example.com', password: 'another-pass' });
  const TA = a.body.token;
  const TB = b.body.token;
  assert.equal((await call(TA, 'GET', '/admin/me')).body.admin, false);
  ok('later logins are normal users');
  assert.equal((await call(null, 'POST', '/auth/signup', { email: 'akhila@example.com', password: 'whatever12' })).status, 409);
  assert.equal((await call(null, 'POST', '/auth/signup', { email: 'x@example.com', password: 'short' })).status, 400);
  assert.equal((await call(null, 'POST', '/auth/signin', { email: 'akhila@example.com', password: 'wrong-password' })).status, 401);
  const again = await call(null, 'POST', '/auth/signin', { email: 'AKHILA@example.com ', password: 'correct-horse' });
  assert.equal(again.status, 200);
  assert.equal((await call(again.body.token, 'GET', '/auth/me')).body.user.email, 'akhila@example.com');
  assert.equal((await call('forged.token', 'GET', '/accounts')).status, 401);
  assert.equal((await call(null, 'GET', '/accounts')).status, 401);
  ok('sign up, sign in (email is case-insensitive), wrong password, duplicate, short password, forged token');

  // Accounts
  const hosp = await call(TA, 'POST', '/accounts', { type: 'hospital', display_name: 'City General', details: { name: 'City General', registrationNumber: 'TS/1' } });
  assert.equal(hosp.status, 200);
  assert.equal(hosp.body.verification, 'unverified');
  const me = await call(TA, 'POST', '/accounts', { type: 'individual', display_name: 'Akhila', details: { fullName: 'Akhila' } });
  const bee = await call(TB, 'POST', '/accounts', { type: 'individual', display_name: 'Bee', details: {} });
  assert.equal((await call(TA, 'GET', '/accounts')).body.length, 2);
  assert.equal((await call(TB, 'GET', '/accounts')).body.length, 1);
  assert.equal((await call(TB, 'PATCH', `/accounts/${hosp.body.id}`, { display_name: 'hacked' })).status, 404);
  assert.equal((await call(TA, 'POST', '/accounts', { type: 'robot', display_name: 'x' })).status, 400);
  ok("accounts: create, list own only, cannot edit someone else's, invalid type rejected");

  // History
  const h = { id: randomUUID(), account_id: me.body.id, kind: 'text-to-sign', input: 'where is the hospital', output: 'HOSPITAL WHERE', created_at: new Date().toISOString() };
  assert.equal((await call(TA, 'PUT', '/history', [h])).status, 200);
  assert.equal((await call(TA, 'PUT', '/history', [{ ...h, input: 'where is the hospital?' }])).status, 200);
  const hist = await call(TA, 'GET', `/history?account=${me.body.id}`);
  assert.equal(hist.body.length, 1);
  assert.equal(hist.body[0].input, 'where is the hospital?');
  assert.equal((await call(TB, 'GET', `/history?account=${me.body.id}`)).body.length, 0);
  assert.equal((await call(TB, 'PUT', '/history', [{ ...h, id: randomUUID() }])).status, 403);
  ok("history: saved, re-sent edits merge, invisible and unwritable to others");

  // Signs
  const sign = { id: randomUUID(), account_id: me.body.id, gloss: 'HELLO', feature_version: 3, source_frames: 32, vector: [0.1, 0.2, 0.3], motion: 'm', meta: { dominantHand: 'right' }, created_at: new Date().toISOString() };
  await call(TA, 'PUT', '/signs', [sign]);
  await call(TA, 'PUT', '/signs', [sign]);
  const signs = await call(TA, 'GET', '/signs');
  assert.equal(signs.body.length, 1);
  assert.deepEqual(signs.body[0].vector.map((v) => Math.round(v * 10) / 10), [0.1, 0.2, 0.3]);
  assert.equal((await call(TB, 'GET', '/signs')).body.length, 0);
  assert.equal((await call(T0, 'GET', '/signs')).body.length, 0);
  ok('signs: synced once (retries safe), private even from admins');

  // Live updates reach the user's other device
  const controller = new AbortController();
  const stream = await fetch(`${base}/events?token=${TA}`, { signal: controller.signal });
  const reader = stream.body.getReader();
  await reader.read(); // ": connected"
  await call(TA, 'PUT', '/signs', [{ ...sign, id: randomUUID(), gloss: 'WATER' }]);
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /data: signs/);
  controller.abort();
  ok('live update pushed to the same login on another device');

  // Verification + admin
  assert.equal((await call(TA, 'POST', `/accounts/${hosp.body.id}/request-verification`)).body.verification, 'pending');
  assert.equal((await call(TA, 'GET', '/admin/organisations')).status, 403);
  assert.equal((await call(TA, 'POST', '/admin/review', { account_id: hosp.body.id, verification: 'verified' })).status, 403);
  const orgs = await call(T0, 'GET', '/admin/organisations');
  assert.deepEqual(orgs.body.map((o) => o.id), [hosp.body.id]);
  await call(T0, 'POST', '/admin/review', { account_id: hosp.body.id, verification: 'verified', note: 'Registration checked' });
  const [reviewed] = (await call(TA, 'GET', '/accounts')).body.filter((x) => x.id === hosp.body.id);
  assert.equal(reviewed.verification, 'verified');
  assert.equal(reviewed.verification_note, 'Registration checked');
  const overview = (await call(T0, 'GET', '/admin/overview')).body;
  assert.equal(overview.logins, 3);
  assert.equal((await call(TA, 'GET', '/admin/overview')).status, 403);
  void bee;
  ok('verification: request → admin reviews with a note; non-admins blocked from every admin route');

  // Reports
  const fb = await call(TA, 'POST', '/feedback', { kind: 'wrong-sign', gloss: 'HELLO', message: 'Hand shape looks wrong' });
  assert.equal(fb.status, 200);
  assert.equal((await call(TB, 'GET', '/feedback/mine')).body.length, 0);
  assert.equal((await call(T0, 'GET', '/admin/feedback?status=open')).body.length, 1);
  await call(T0, 'POST', `/admin/feedback/${fb.body.id}`, { status: 'resolved', note: 'Fixed, thanks' });
  const mine = (await call(TA, 'GET', '/feedback/mine')).body[0];
  assert.equal(mine.status, 'resolved');
  assert.equal(mine.admin_note, 'Fixed, thanks');
  ok('reports: sent, answered by the admin, reply visible to the sender only');

  // Sign pack
  assert.equal((await call(null, 'GET', '/sign-pack')).status, 404);
  const pack = { id: 'isl-include', name: 'ISL', version: '1', samples: [], motions: [], signs: {} };
  assert.equal((await call(TA, 'PUT', '/sign-pack', pack)).status, 403);
  assert.equal((await call(T0, 'PUT', '/sign-pack', pack)).status, 200);
  assert.equal((await call(null, 'GET', '/sign-pack')).body.id, 'isl-include');
  ok('sign pack: only admins publish; everyone can download');

  // Admin tools
  assert.equal((await call(TA, 'POST', '/rpc/admin_list_users', { search: '' })).status, 403);
  assert.equal((await call(null, 'POST', '/rpc/admin_list_users', { search: '' })).status, 401);
  const people = (await call(T0, 'POST', '/rpc/admin_list_users', { search: 'example' })).body;
  assert.deepEqual(people.map((p) => p.email).sort(), ['akhila@example.com', 'bee@example.com']);
  assert.ok(people.every((p) => p.joined && 'lastSignIn' in p));
  const added = await call(T0, 'POST', '/rpc/admin_add_admin', { target_email: 'nobody@example.com' });
  assert.equal(added.status, 400);
  assert.match(added.body.message, /sign up first/);
  assert.equal((await call(T0, 'POST', '/rpc/admin_add_admin', { target_email: 'bee@example.com' })).body.length, 2);
  assert.equal((await call(TB, 'GET', '/admin/me')).body.admin, true);
  assert.equal((await call(T0, 'POST', '/rpc/admin_remove_admin', { target: b.body.user.id })).body.length, 1);
  await call(T0, 'POST', '/rpc/admin_set_blocked', { target: b.body.user.id, blocked: true, reason: 'Spam' });
  assert.deepEqual((await call(TB, 'POST', '/rpc/my_status', {})).body, { blocked: true, reason: 'Spam' });
  assert.equal((await call(TB, 'POST', '/feedback', { kind: 'bug', message: 'spam spam' })).status, 403);
  await call(T0, 'POST', '/rpc/admin_set_blocked', { target: b.body.user.id, blocked: false, reason: null });
  assert.equal((await call(TB, 'POST', '/feedback', { kind: 'bug', message: 'real bug' })).status, 200);
  await call(T0, 'POST', '/rpc/admin_post_announcement', { title: 'Welcome', body: 'New signs this week' });
  assert.equal((await call(null, 'POST', '/rpc/active_announcements', {})).body[0].title, 'Welcome');
  await call(T0, 'POST', '/rpc/admin_save_word', { gloss: 'pain', english: ['pain', 'hurt'], pos: 'noun', category: 'medical', reviewed: false, two_handed: false, hidden: false });
  assert.equal((await call(null, 'POST', '/rpc/vocabulary_entries', {})).body[0].gloss, 'PAIN');
  const stats = (await call(T0, 'POST', '/rpc/admin_stats', { days: 7 })).body;
  assert.equal(stats.daily.length, 7);
  assert.ok(stats.daily.at(-1).signups >= 3);
  ok('admin tools: team, users, blocking, announcements, vocabulary and statistics over HTTP');

  // Error reports: anyone can send, only admins read
  assert.equal((await call(null, 'POST', '/rpc/report_error', { message: 'TypeError: boom', stack: 'TypeError\n at x (a.js:1:1)', page: '/learn', app_version: 'abc', platform: 'web' })).status, 200);
  await call(TA, 'POST', '/rpc/report_error', { message: 'TypeError: boom', stack: 'TypeError\n at x (a.js:1:1)', page: '/learn', app_version: 'abc', platform: 'web' });
  assert.equal((await call(TA, 'POST', '/rpc/admin_list_errors', { include_resolved: false })).status, 403);
  const errs = (await call(T0, 'POST', '/rpc/admin_list_errors', { include_resolved: false })).body;
  assert.equal(errs.length, 1);
  assert.equal(errs[0].count, 2);
  assert.equal((await call(T0, 'POST', '/rpc/admin_open_errors', {})).body, 1);
  await call(T0, 'POST', '/rpc/admin_resolve_error', { id: errs[0].id, resolved: true });
  assert.equal((await call(T0, 'POST', '/rpc/admin_open_errors', {})).body, 0);
  ok('error reports: sent by anyone, grouped, read and resolved by admins only');

  // Delete login
  await call(TA, 'POST', '/auth/delete');
  assert.equal((await call(TA, 'GET', '/auth/me')).status, 401);
  assert.equal((await call(null, 'POST', '/auth/signin', { email: 'akhila@example.com', password: 'correct-horse' })).status, 401);
  assert.equal((await call(TB, 'GET', '/accounts')).body.length, 1);
  ok('delete login removes it with all its data; other users unaffected');

  // Brute force
  let limited = false;
  for (let i = 0; i < 12; i += 1) if ((await call(null, 'POST', '/auth/signin', { email: 'bee@example.com', password: 'nope' })).status === 429) limited = true;
  assert.ok(limited);
  ok('password guessing is rate-limited');

  console.log('\nAPI OK');
} finally {
  await server.close();
}
