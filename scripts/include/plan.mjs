#!/usr/bin/env node
/**
 * Which INCLUDE videos to fetch: picks signs (SOS set, INCLUDE-50, or a list of glosses),
 * looks up their dataset folders, and labels each video with INCLUDE's official
 * train / val / test split (from github.com/AI4Bharat/INCLUDE).
 *
 *   node scripts/include/plan.mjs --signs sos --include-repo /tmp/INCLUDE --out /tmp/plan.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const signsArg = arg('signs', 'sos');
const repo = arg('include-repo', '/tmp/INCLUDE');
const out = arg('out', '/tmp/include-plan.json');
const maxPerSign = Number(arg('max-per-sign', '40'));

const vocab = JSON.parse(readFileSync(new URL('../../apps/web/src/data/include-vocabulary.json', import.meta.url))).signs;
// The SOS signs (apps/web/src/lib/sos.ts) that INCLUDE has, plus a few that help in a hospital.
const SOS = ['DOCTOR', 'HOSPITAL', 'POLICE', 'MEDICINE', 'DEAF', 'SICK'];

// Sets: "all" (all 263 INCLUDE signs), "include50", "sos", or glosses; combine with "+",
// e.g. "include50+sos" or "include50+WATER,PAIN".
function pick(part) {
  if (part === 'all') return vocab;
  if (part === 'sos') return vocab.filter((s) => SOS.includes(s.gloss));
  if (part === 'include50') {
    const map = JSON.parse(readFileSync(join(repo, 'label_maps/label_map_include50.json'), 'utf8'));
    const labels = new Set(Object.keys(map).map((k) => k.replace(/[^A-Za-z]/g, '').toLowerCase()));
    return vocab.filter((s) => labels.has(s.label));
  }
  const list = part.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return vocab.filter((s) => list.includes(s.gloss) || list.includes(s.label.toUpperCase()));
}
const wanted = [...new Map(signsArg.split('+').map((p) => p.trim()).filter(Boolean).flatMap(pick).map((s) => [s.gloss, s])).values()];
if (!wanted.length) throw new Error(`No INCLUDE signs matched "${signsArg}"`);

const splitOf = new Map();
for (const split of ['train', 'val', 'test']) {
  const file = join(repo, `train_test_paths/include_${split}.txt`);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) splitOf.set(line.trim(), split);
}

const plan = {
  signs: wanted.map((s) => ({ ...s, videos: [] })),
  categories: [...new Set(wanted.map((s) => s.category))].sort(),
};
for (const s of plan.signs) {
  const prefix = `${s.category}/${s.folder}/`;
  s.videos = [...splitOf.entries()].filter(([p]) => p.startsWith(prefix)).slice(0, maxPerSign).map(([p, split]) => ({ path: p, split }));
}
writeFileSync(out, JSON.stringify(plan, null, 2));
console.log(`plan: ${plan.signs.length} signs (${plan.signs.map((s) => s.gloss).join(', ')}), categories ${plan.categories.join(', ')}`);
console.log(`videos listed in INCLUDE's splits: ${plan.signs.reduce((n, s) => n + s.videos.length, 0)}`);
