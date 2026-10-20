#!/usr/bin/env node
/**
 * Splits a plan (plan.mjs) into N smaller plans with about the same number of videos each,
 * so several GitHub runners can download and hand-track at the same time.
 *
 *   node scripts/include/shard.mjs --plan /tmp/plan.json --shards 8 --out /tmp/shards
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const plan = JSON.parse(readFileSync(arg('plan', '/tmp/plan.json'), 'utf8'));
const n = Math.max(1, Math.min(Number(arg('shards', '8')), plan.signs.length));
const out = arg('out', '/tmp/shards');
mkdirSync(out, { recursive: true });

// Largest signs first into the emptiest shard: balanced without splitting a sign.
const shards = Array.from({ length: n }, () => ({ signs: [], videos: 0 }));
for (const sign of [...plan.signs].sort((a, b) => b.videos.length - a.videos.length || a.gloss.localeCompare(b.gloss))) {
  const target = shards.reduce((min, s) => (s.videos < min.videos ? s : min));
  target.signs.push(sign);
  target.videos += sign.videos.length;
}
shards.forEach((s, i) => {
  const signs = s.signs.sort((a, b) => a.gloss.localeCompare(b.gloss));
  writeFileSync(join(out, `shard-${i}.json`), JSON.stringify({ signs, categories: [...new Set(signs.map((x) => x.category))].sort() }, null, 2));
  console.log(`shard ${i}: ${signs.length} signs, ${s.videos} videos`);
});
writeFileSync(join(out, 'matrix.json'), JSON.stringify(shards.map((_, i) => i)));
