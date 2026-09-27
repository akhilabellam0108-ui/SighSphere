/** Passwords (scrypt) and sign-in tokens (HMAC-SHA256), using only Node's built-in crypto. */
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const TOKEN_DAYS = 30;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(key, expected);
}

/** A per-installation secret, created on first start and kept in the data folder. */
export function loadSecret(dataDir) {
  if (process.env.SIGNSPHERE_SECRET) return process.env.SIGNSPHERE_SECRET;
  if (dataDir === 'memory://') return randomBytes(32).toString('hex');
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'secret.key');
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
  return readFileSync(file, 'utf8').trim();
}

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function issueToken(secret, user) {
  const payload = b64({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400 });
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Returns { id, email } or null. */
export function readToken(secret, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig ?? '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims.exp !== 'number' || claims.exp < Date.now() / 1000) return null;
    return { id: claims.sub, email: claims.email };
  } catch {
    return null;
  }
}
