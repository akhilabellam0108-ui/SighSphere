/**
 * Puts MediaPipe's runtime and models under public/mediapipe/ so the app serves them itself
 * (offline-capable, no CDN dependency at run time).
 *
 *   node scripts/setup-mediapipe.mjs          copy WASM from node_modules, download models if missing
 *   node scripts/setup-mediapipe.mjs --no-models   WASM only (no network)
 *
 * Runs automatically before `dev` and `build`. A failed model download never fails the
 * build: the app then falls back to Google's hosted copies at run time.
 */
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'mediapipe');
// The package's "exports" hides package.json, so find it the way Node would: walk up.
function findPackage(name) {
  for (let dir = here; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'wasm'))) return candidate;
    if (dirname(dir) === dir) throw new Error(`${name} not installed — run npm install`);
  }
}
const pkgDir = findPackage('@mediapipe/tasks-vision');

const MODELS = [
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
];

mkdirSync(join(out, 'wasm'), { recursive: true });
mkdirSync(join(out, 'models'), { recursive: true });
for (const file of readdirSync(join(pkgDir, 'wasm'))) {
  copyFileSync(join(pkgDir, 'wasm', file), join(out, 'wasm', file));
}
console.log('mediapipe: WASM runtime copied');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const tmp = `${dest}.part`;
      const file = createWriteStream(tmp);
      response.pipe(file);
      file.on('finish', () => file.close(() => {
        // A .task file is a zip; refuse anything else (captive portals, error pages).
        const head = readFileSync(tmp).subarray(0, 2).toString('latin1');
        if (head !== 'PK' || statSync(tmp).size < 1_000_000) {
          unlinkSync(tmp);
          reject(new Error('downloaded file is not a model bundle'));
          return;
        }
        renameSync(tmp, dest);
        resolve();
      }));
    }).on('error', reject);
  });
}

if (!process.argv.includes('--no-models')) {
  for (const model of MODELS) {
    const dest = join(out, 'models', model.file);
    if (existsSync(dest)) continue;
    try {
      await download(model.url, dest);
      console.log(`mediapipe: downloaded ${model.file}`);
    } catch (error) {
      console.warn(`mediapipe: could not download ${model.file} (${error.message}); the app will use the hosted copy.`);
    }
  }
}
