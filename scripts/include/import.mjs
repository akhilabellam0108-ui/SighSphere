#!/usr/bin/env node
/**
 * Turns downloaded INCLUDE videos into a SignSphere sign pack and training data, using the
 * app's own importer in a headless browser (apps/web/tools/include-import.ts).
 *
 *   node scripts/include/import.mjs --plan /tmp/plan.json --raw /tmp/include-raw \
 *     --pack apps/web/public/datasets/isl-include.json --jsonl /tmp/include.jsonl
 *
 * Needs: ffmpeg, the web app's dependencies, and Playwright's Chromium.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const plan = JSON.parse(readFileSync(arg('plan', '/tmp/include-plan.json'), 'utf8'));
const raw = arg('raw', '/tmp/include-raw');
const packOut = arg('pack', join(root, 'apps/web/public/datasets/isl-include.json'));
const jsonlOut = arg('jsonl', '/tmp/include.jsonl');
const statsOut = arg('stats', '/tmp/include-stats.json');
const port = Number(arg('port', '5199'));

// 1. Transcode to small WebM (480p, 15 fps, no audio): Chromium plays it everywhere and it's fast to seek.
const served = join(root, 'apps/web/public/_include');
rmSync(served, { recursive: true, force: true });
const items = [];
const splitOf = new Map(plan.signs.flatMap((s) => s.videos.map((v) => [v.path.toLowerCase(), v.split])));
for (const sign of plan.signs) {
  const dir = join(raw, sign.category, sign.folder);
  if (!existsSync(dir)) { console.log(`no videos for ${sign.gloss}`); continue; }
  for (const name of readdirSync(dir).sort()) {
    if (!/\.(mov|mp4|m4v|avi|mkv|webm)$/i.test(name)) continue;
    const rel = `${sign.category}/${sign.folder}/${name}`;
    const split = splitOf.get(rel.toLowerCase()) ?? 'train';
    const outName = `${sign.label}__${split}__${name.replace(/\.[^.]+$/, '')}.webm`;
    const dest = join(served, outName);
    mkdirSync(served, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, name), '-an', '-vf', 'scale=-2:480,fps=15',
      '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '1.2M', dest]);
    items.push({ label: sign.label, split, name, url: `/_include/${outName}` });
  }
}
console.log(`transcoded ${items.length} videos`);
if (!items.length) process.exit(1);

// 2. The app's dev server serves the harness page and the videos.
const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: join(root, 'apps/web'), stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 60000);
  vite.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve(); } });
  vite.on('exit', (code) => { clearTimeout(t); reject(new Error(`vite exited (${code})`)); });
});
process.on('exit', () => vite.kill());

// 3. Run the importer in Chromium (software WebGL is fine; tracking runs on the CPU here).
const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let result;
try {
  const page = await browser.newPage();
  // Lines starting with "::" are GitHub workflow commands (progress notices): print them as they are.
  page.on('console', (m) => console.log(m.text().startsWith('::') ? m.text() : `  ${m.text()}`));
  page.on('pageerror', (e) => console.log(`  page error: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/tools/include-import.html`);
  await page.waitForFunction(() => window.importReady === true, null, { timeout: 120000 });
  result = await page.evaluate((list) => window.importInclude(list, 'cpu'), items);
} finally {
  await browser.close();
  vite.kill();
}

// 4. Outputs: the sign pack every user installs automatically, and JSONL for training.
mkdirSync(dirname(packOut), { recursive: true });
writeFileSync(packOut, JSON.stringify(result.pack));
writeFileSync(jsonlOut, result.rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const bySplit = {};
for (const r of result.rows) bySplit[r.signerId] = (bySplit[r.signerId] ?? 0) + 1;
const stats = { videos: items.length, usable: result.rows.length, bySplit, signs: result.stats, delegate: result.delegate };
writeFileSync(statsOut, JSON.stringify(stats, null, 2));
rmSync(served, { recursive: true, force: true });
console.log(JSON.stringify(stats, null, 2));
console.log(`pack → ${relative(root, packOut)} (${Math.round(JSON.stringify(result.pack).length / 1024)} KB), training rows → ${jsonlOut}`);
