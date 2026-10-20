#!/usr/bin/env node
/**
 * Joins the per-shard results of the parallel INCLUDE build into one sign pack, one training
 * file and one stats file.
 *
 *   node scripts/include/merge.mjs --in /tmp/shards-out --pack apps/web/public/datasets/isl-include.json \
 *     --jsonl /tmp/include.jsonl --stats /tmp/include-stats.json
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const dir = arg('in', '/tmp/shards-out');
const shards = readdirSync(dir).filter((d) => d.startsWith('shard-')).sort();
if (!shards.length) throw new Error(`no shard results in ${dir}`);

let pack = null;
const rows = [];
const stats = { videos: 0, usable: 0, bySplit: {}, signs: [], shards: shards.length };
for (const name of shards) {
  const base = join(dir, name);
  const p = JSON.parse(readFileSync(join(base, 'isl-include.json'), 'utf8'));
  if (!pack) pack = { ...p, signs: {}, samples: [], motions: [] };
  for (const key of ['format', 'formatVersion', 'featureVersion', 'windowFrames', 'frameDim']) {
    if (p[key] !== pack[key]) throw new Error(`${name}: ${key} ${p[key]} differs from ${pack[key]}`);
  }
  for (const [gloss, info] of Object.entries(p.signs)) {
    if (pack.signs[gloss]) throw new Error(`${gloss} appears in two shards`);
    pack.signs[gloss] = info;
  }
  pack.samples.push(...p.samples);
  pack.motions.push(...p.motions);
  rows.push(...readFileSync(join(base, 'include.jsonl'), 'utf8').split('\n').filter(Boolean));
  const s = JSON.parse(readFileSync(join(base, 'include-stats.json'), 'utf8'));
  stats.videos += s.videos;
  stats.usable += s.usable;
  for (const [k, v] of Object.entries(s.bySplit ?? {})) stats.bySplit[k] = (stats.bySplit[k] ?? 0) + v;
  stats.signs.push(...(s.signs ?? []));
}
pack.version = new Date().toISOString(); // new version: every device reinstalls it
stats.signs.sort((a, b) => String(a.gloss).localeCompare(String(b.gloss)));
writeFileSync(arg('pack', 'apps/web/public/datasets/isl-include.json'), JSON.stringify(pack));
writeFileSync(arg('jsonl', '/tmp/include.jsonl'), rows.join('\n') + '\n');
writeFileSync(arg('stats', '/tmp/include-stats.json'), JSON.stringify(stats, null, 2));
console.log(`merged ${shards.length} shards: ${Object.keys(pack.signs).length} signs, ${pack.samples.length} examples, ${pack.motions.length} motions, ${rows.length} training rows`);
