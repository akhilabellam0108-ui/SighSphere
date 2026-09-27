/**
 * Make a login a SignSphere admin (shows the Admin tab):
 *   npm run make-admin -- someone@example.com        (stop the server first)
 * Note: the very first login created on a new server is made admin automatically.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.mjs';

const email = String(process.argv[2] ?? '').trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- someone@example.com');
  process.exit(1);
}
const dataDir = process.env.SIGNSPHERE_DATA ?? join(dirname(fileURLToPath(import.meta.url)), '../data');
const db = await openDatabase(dataDir);
const rows = await db.asSystem((q) => q(`insert into public.admins (user_id) select id from auth.users where email = $1 on conflict do nothing returning user_id`, [email]));
const exists = await db.asSystem((q) => q(`select 1 from auth.users where email = $1`, [email]));
console.log(exists.length ? `${email} is ${rows.length ? 'now' : 'already'} an admin.` : `No login with the email ${email}. Sign up in the app first.`);
await db.close();
