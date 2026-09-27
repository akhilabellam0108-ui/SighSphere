/**
 * SignSphere backend server.
 *
 *   node services/api/src/server.mjs          (or: npm start / npm run dev from the repo root)
 *
 * - JSON API under /api (logins, accounts, history, synced signs, reports, admin, sign pack)
 * - live updates for a user's other devices (/api/events, server-sent events)
 * - serves the built app (apps/web/dist) so one address runs everything
 *
 * Settings (environment variables, all optional):
 *   PORT (8787) · HOST (0.0.0.0) · SIGNSPHERE_DATA (services/api/data) · SIGNSPHERE_SECRET
 *   SIGNSPHERE_ADMINS  comma-separated emails that are always admins
 */
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, issueToken, loadSecret, readToken, verifyPassword } from './auth.mjs';
import { openDatabase } from './db.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MB = 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
  '.task': 'application/octet-stream', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Database errors → sentences the app can show. */
function explain(error) {
  if (error instanceof HttpError) return error;
  const msg = String(error?.message ?? error);
  if (/too many accounts/.test(msg)) return new HttpError(400, 'too many accounts for one login (max 10)');
  if (/sign limit/.test(msg)) return new HttpError(400, msg);
  if (/row-level security|permission denied|admins only/.test(msg)) return new HttpError(403, 'Not allowed.');
  if (/violates check constraint|invalid input|out of range|violates foreign key|value too long/.test(msg)) return new HttpError(400, 'Some of the details are not valid.');
  if (/duplicate key/.test(msg)) return new HttpError(409, 'That already exists.');
  console.error(error);
  return new HttpError(500, 'Something went wrong on the server.');
}

export async function startServer({
  port = Number(process.env.PORT ?? 8787),
  host = process.env.HOST ?? '0.0.0.0',
  dataDir = process.env.SIGNSPHERE_DATA ?? join(here, '../data'),
  webDir = join(here, '../../../apps/web/dist'),
  admins = (process.env.SIGNSPHERE_ADMINS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  quiet = false,
} = {}) {
  const db = await openDatabase(dataDir);
  const secret = loadSecret(dataDir);
  const packDir = dataDir === 'memory://' ? null : join(dataDir, 'sign-packs');
  let memoryPack = null;
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const notify = (userId, table) => events.emit(userId, table);

  // Emails listed in SIGNSPHERE_ADMINS are admins.
  if (admins.length) {
    await db.asSystem((q) => q(`insert into public.admins (user_id) select id from auth.users where email = any($1) on conflict do nothing`, [admins]));
  }

  // Slow down password guessing: 10 sign-in attempts per minute per address.
  const attempts = new Map();
  const throttle = (key) => {
    const now = Date.now();
    const recent = (attempts.get(key) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    attempts.set(key, recent);
    if (recent.length > 10) throw new HttpError(429, 'rate limit: too many attempts. Please wait a minute and try again.');
  };

  const routes = [];
  const route = (method, pattern, handler, { auth = true, limit = 25 * MB } = {}) => {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:([a-z]+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, regex, keys, handler, auth, limit });
  };

  // ───────────────────────────────────────────────────────────── logins
  const session = (user) => ({ token: issueToken(secret, user), user: { id: user.id, email: user.email } });

  route('POST', '/api/auth/signup', async ({ body, ip }) => {
    throttle(`signup:${ip}`);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 8) throw new HttpError(400, 'Password should be at least 8 characters.');
    const hash = await hashPassword(password);
    const user = await db.asSystem(async (q) => {
      if ((await q(`select 1 from auth.users where email = $1`, [email])).length) throw new HttpError(409, 'User already registered');
      const [row] = await q(`insert into auth.users (email, password_hash, last_sign_in) values ($1, $2, now()) returning id, email`, [email, hash]);
      // The very first login on a new server runs it: make them an admin.
      const [{ n }] = await q(`select count(*)::int as n from public.admins`);
      if (n === 0 || admins.includes(email)) await q(`insert into public.admins (user_id) values ($1) on conflict do nothing`, [row.id]);
      return row;
    });
    return session(user);
  }, { auth: false });

  route('POST', '/api/auth/signin', async ({ body, ip }) => {
    throttle(`signin:${ip}`);
    const email = String(body.email ?? '').trim().toLowerCase();
    const [row] = await db.asSystem((q) => q(`select id, email, password_hash from auth.users where email = $1`, [email]));
    if (!row || !(await verifyPassword(String(body.password ?? ''), row.password_hash))) throw new HttpError(401, 'Invalid login credentials');
    await db.asSystem((q) => q(`update auth.users set last_sign_in = now() where id = $1`, [row.id]));
    return session(row);
  }, { auth: false });

  route('GET', '/api/auth/me', async ({ user }) => {
    const [row] = await db.asSystem((q) => q(`select id, email from auth.users where id = $1`, [user.id]));
    if (!row) throw new HttpError(401, 'Signed out.');
    return { user: row };
  });

  route('POST', '/api/auth/password', async ({ user, body }) => {
    const [row] = await db.asSystem((q) => q(`select password_hash from auth.users where id = $1`, [user.id]));
    if (!row || !(await verifyPassword(String(body.current ?? ''), row.password_hash))) throw new HttpError(401, 'Invalid login credentials');
    if (String(body.password ?? '').length < 8) throw new HttpError(400, 'Password should be at least 8 characters.');
    const hash = await hashPassword(String(body.password));
    await db.asSystem((q) => q(`update auth.users set password_hash = $2 where id = $1`, [user.id, hash]));
    return { ok: true };
  });

  route('POST', '/api/auth/delete', async ({ user }) => {
    await db.asUser(user.id, (q) => q(`select public.delete_my_user()`));
    return { ok: true };
  });

  // ─────────────────────────────────────────────────────────── accounts
  route('GET', '/api/accounts', ({ user }) =>
    db.asUser(user.id, (q) => q(`select * from public.accounts where user_id = auth.uid() order by created_at`)));

  route('POST', '/api/accounts', async ({ user, body }) => {
    const [row] = await db.asUser(user.id, (q) =>
      q(`insert into public.accounts (type, display_name, details) values ($1, $2, $3) returning *`, [body.type, body.display_name, body.details ?? {}]));
    return row;
  });

  const oneRow = (rows) => {
    if (!rows[0]) throw new HttpError(404, 'Account not found.');
    return rows[0];
  };

  route('PATCH', '/api/accounts/:id', async ({ user, params, body }) =>
    oneRow(await db.asUser(user.id, (q) =>
      q(`update public.accounts set display_name = coalesce($2, display_name), details = coalesce($3, details) where id = $1 and user_id = auth.uid() returning *`,
        [params.id, body.display_name ?? null, body.details ?? null]))));

  route('POST', '/api/accounts/:id/request-verification', async ({ user, params }) =>
    oneRow(await db.asUser(user.id, (q) =>
      q(`update public.accounts set verification = 'pending' where id = $1 and user_id = auth.uid() returning *`, [params.id]))));

  route('DELETE', '/api/accounts/:id', async ({ user, params }) => {
    await db.asUser(user.id, (q) => q(`delete from public.accounts where id = $1 and user_id = auth.uid()`, [params.id]));
    notify(user.id, 'history');
    return { ok: true };
  });

  // ──────────────────────────────────────────────────────────── history
  route('GET', '/api/history', ({ user, query }) =>
    db.asUser(user.id, (q) =>
      q(`select * from public.history where account_id = $1 order by created_at desc limit $2`,
        [query.get('account'), Math.min(Number(query.get('limit') ?? 500) || 500, 2000)])));

  route('PUT', '/api/history', async ({ user, body }) => {
    const items = Array.isArray(body) ? body.slice(0, 500) : [];
    await db.asUser(user.id, async (q) => {
      for (const i of items) {
        await q(
          `insert into public.history (id, account_id, kind, input, output, created_at) values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()))
           on conflict (id) do update set input = excluded.input, output = excluded.output`,
          [i.id, i.account_id, i.kind, i.input, i.output, i.created_at || null],
        );
      }
    });
    if (items.length) notify(user.id, 'history');
    return { ok: true };
  });

  route('POST', '/api/history/delete', async ({ user, body }) => {
    await db.asUser(user.id, (q) => q(`delete from public.history where id = any($1::uuid[])`, [(body.ids ?? []).filter((id) => UUID.test(id))]));
    notify(user.id, 'history');
    return { ok: true };
  });

  route('DELETE', '/api/history', async ({ user, query }) => {
    await db.asUser(user.id, (q) => q(`delete from public.history where account_id = $1`, [query.get('account')]));
    notify(user.id, 'history');
    return { ok: true };
  });

  // ────────────────────────────────────────────────────── recorded signs
  route('GET', '/api/signs', ({ user }) =>
    db.asUser(user.id, (q) => q(`select * from public.signs where user_id = auth.uid() order by created_at`)));

  route('PUT', '/api/signs', async ({ user, body }) => {
    const signs = Array.isArray(body) ? body.slice(0, 50) : [];
    await db.asUser(user.id, async (q) => {
      for (const s of signs) {
        await q(
          `insert into public.signs (id, account_id, gloss, feature_version, source_frames, vector, motion, meta, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now())) on conflict (id) do nothing`,
          [s.id, s.account_id ?? null, s.gloss, s.feature_version, s.source_frames, s.vector, s.motion ?? null, s.meta ?? {}, s.created_at || null],
        );
      }
    });
    if (signs.length) notify(user.id, 'signs');
    return { ok: true };
  });

  route('POST', '/api/signs/delete', async ({ user, body }) => {
    await db.asUser(user.id, (q) => q(`delete from public.signs where id = any($1::uuid[])`, [(body.ids ?? []).filter((id) => UUID.test(id))]));
    notify(user.id, 'signs');
    return { ok: true };
  });

  route('DELETE', '/api/signs', async ({ user }) => {
    await db.asUser(user.id, (q) => q(`delete from public.signs where user_id = auth.uid()`));
    notify(user.id, 'signs');
    return { ok: true };
  });

  // ───────────────────────────────────────────────────────────── reports
  route('POST', '/api/feedback', async ({ user, body }) => {
    const [row] = await db.asUser(user.id, (q) =>
      q(`insert into public.feedback (account_id, kind, gloss, message, page) values ($1, $2, $3, $4, $5) returning *`,
        [body.account_id ?? null, body.kind, body.gloss ?? null, body.message, body.page ?? null]));
    return row;
  });

  route('GET', '/api/feedback/mine', ({ user }) =>
    db.asUser(user.id, (q) => q(`select * from public.feedback where user_id = auth.uid() order by created_at desc limit 100`)));

  // ─────────────────────────────────────────────────────── SignSphere team
  const isAdmin = (userId) => db.asUser(userId, async (q) => (await q(`select public.is_admin() as a`))[0].a === true);
  const requireAdmin = async (userId) => {
    if (!(await isAdmin(userId))) throw new HttpError(403, 'admins only');
  };

  route('GET', '/api/admin/me', async ({ user }) => ({ admin: await isAdmin(user.id) }));

  route('GET', '/api/admin/overview', async ({ user }) =>
    (await db.asUser(user.id, (q) => q(`select public.admin_overview() as o`)))[0].o);

  route('GET', '/api/admin/organisations', async ({ user }) => {
    await requireAdmin(user.id);
    return db.asUser(user.id, (q) =>
      q(`select * from public.accounts where type in ('hospital', 'organisation') and user_id <> auth.uid() order by created_at desc limit 500`));
  });

  route('POST', '/api/admin/review', async ({ user, body }) => {
    await requireAdmin(user.id);
    if (!['unverified', 'pending', 'verified'].includes(body.verification)) throw new HttpError(400, 'Unknown status.');
    oneRow(await db.asUser(user.id, (q) =>
      q(`update public.accounts set verification = $2, verification_note = $3 where id = $1 returning id`, [body.account_id, body.verification, body.note || null])));
    return { ok: true };
  });

  route('GET', '/api/admin/feedback', async ({ user, query }) => {
    await requireAdmin(user.id);
    return db.asUser(user.id, (q) =>
      q(`select * from public.feedback where status = $1 order by created_at desc limit 300`, [query.get('status') === 'resolved' ? 'resolved' : 'open']));
  });

  route('POST', '/api/admin/feedback/:id', async ({ user, params, body }) => {
    await requireAdmin(user.id);
    await db.asUser(user.id, (q) =>
      q(`update public.feedback set status = $2, admin_note = $3 where id = $1`, [params.id, body.status === 'resolved' ? 'resolved' : 'open', body.note || null]));
    return { ok: true };
  });

  // ─────────────────────────────────────────────────────────── sign pack
  const packFile = packDir ? join(packDir, 'isl-include.json') : null;
  route('GET', '/api/sign-pack', async ({ res }) => {
    const data = packFile ? (existsSync(packFile) ? readFileSync(packFile) : null) : memoryPack;
    if (!data) throw new HttpError(404, 'No sign pack published yet.');
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(data);
  }, { auth: false });

  route('PUT', '/api/sign-pack', async ({ user, raw }) => {
    await requireAdmin(user.id);
    let pack;
    try {
      pack = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new HttpError(400, 'That file is not a SignSphere sign pack.');
    }
    if (!pack || typeof pack !== 'object' || !pack.id || !Array.isArray(pack.samples)) throw new HttpError(400, 'That file is not a SignSphere sign pack.');
    if (packFile) {
      mkdirSync(packDir, { recursive: true });
      writeFileSync(packFile, raw);
    } else memoryPack = raw;
    return { ok: true };
  }, { limit: 80 * MB });

  // ──────────────────────────────────────────────────────── live updates
  route('GET', '/api/events', ({ user, req, res }) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': connected\n\n');
    const send = (table) => res.write(`data: ${table}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    events.on(user.id, send);
    req.on('close', () => {
      clearInterval(ping);
      events.off(user.id, send);
    });
    return undefined; // streaming: response stays open
  });

  route('GET', '/api/health', async () => ({ ok: true, name: 'signsphere-api' }), { auth: false });

  // ───────────────────────────────────────────────────────────── plumbing
  async function readBody(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413, 'That is too large to upload.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  function serveStatic(req, res, pathname) {
    if (!existsSync(webDir)) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('SignSphere API is running. Build the app (npm run build) to serve it from here, or use npm run dev.');
      return;
    }
    const safe = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '').replace(/\.\.[/\\]/g, '');
    let file = join(webDir, safe);
    if (!file.startsWith(webDir) || !existsSync(file) || statSync(file).isDirectory()) file = join(webDir, 'index.html'); // app routes
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const immutable = file.includes(`${join('dist', 'assets')}`) || file.includes('mediapipe');
    res.writeHead(200, { 'content-type': type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  }

  const server = createServer(async (req, res) => {
    // The Android app and other origins call this API with a bearer token (no cookies).
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url.pathname);
      else {
        res.writeHead(405);
        res.end();
      }
      return;
    }
    try {
      const match = routes.find((r) => r.method === req.method && r.regex.test(url.pathname));
      if (!match) throw new HttpError(404, 'Not found.');
      const values = match.regex.exec(url.pathname).slice(1);
      const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(values[i])]));
      for (const v of Object.values(params)) if (!UUID.test(v)) throw new HttpError(404, 'Not found.');
      let user = null;
      if (match.auth) {
        const header = req.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
        user = readToken(secret, token);
        if (!user) throw new HttpError(401, 'Please sign in again.');
      }
      const raw = req.method === 'GET' || req.method === 'DELETE' ? Buffer.alloc(0) : await readBody(req, match.limit);
      let body = {};
      if (raw.length && match.limit <= 25 * MB) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          throw new HttpError(400, 'Bad request.');
        }
      }
      const ip = req.socket.remoteAddress ?? '';
      const result = await match.handler({ req, res, user, params, query: url.searchParams, body, raw, ip });
      if (res.headersSent) return; // streamed or already answered
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(result ?? { ok: true }));
    } catch (error) {
      const e = explain(error);
      if (!res.headersSent) {
        res.writeHead(e.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: e.message }));
      }
    }
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  const actualPort = server.address().port;
  if (!quiet) {
    console.log(`\n  SignSphere server running`);
    console.log(`  → app + API:  http://localhost:${actualPort}`);
    console.log(`  → data:       ${dataDir === 'memory://' ? 'in memory (not saved)' : dataDir}\n`);
  }
  return {
    port: actualPort,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}

// Run directly: node src/server.mjs
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
