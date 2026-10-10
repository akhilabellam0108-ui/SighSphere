/**
 * Headless INCLUDE import, driven by scripts/include/import.mjs (Playwright).
 *
 * Runs the SAME code as the app's Dataset Import screen (lib/datasetImport.ts + the live
 * camera's tracker), so the examples and the trained model see exactly what the camera
 * will produce. Not part of the app build: only the dev server serves this page.
 */
import { LandmarkTracker } from '../src/lib/landmarks.js';
import { FEATURE_VERSION } from '../src/lib/features.js';
import { INCLUDE_SIGNS, buildPack, summariseSign, trackVideo, type VideoResult } from '../src/lib/datasetImport.js';

interface Item { label: string; split: string; url: string; name: string }

async function importInclude(items: Item[], processor: 'auto' | 'gpu' | 'cpu' = 'cpu') {
  const tracker = new LandmarkTracker({ dominantHand: 'right', processor });
  await tracker.init();
  const clock = { t: 0 };
  const labels = [...new Set(items.map((i) => i.label))];
  const results = [];
  const rows: Record<string, unknown>[] = [];
  let n = 0;
  for (const label of labels) {
    const entry = INCLUDE_SIGNS.find((e) => e.label === label);
    if (!entry) throw new Error(`Unknown INCLUDE sign: ${label}`);
    const perVideo: VideoResult[] = [];
    for (const item of items.filter((i) => i.label === label)) {
      n += 1;
      let r: VideoResult = { window: null, sourceFrames: 0, motion: [] };
      try {
        const blob = await (await fetch(item.url)).blob();
        r = await trackVideo(new File([blob], item.name, { type: blob.type || 'video/webm' }), tracker, clock);
      } catch (e) {
        console.log(`skip ${item.name}: ${(e as Error).message}`);
      }
      perVideo.push(r);
      if (r.window) {
        rows.push({
          label: entry.gloss, signerId: item.split, featureVersion: FEATURE_VERSION, sourceFrames: r.sourceFrames,
          source: 'INCLUDE', video: item.name, vector: Array.from(r.window, (v) => Math.round(v * 1e5) / 1e5),
        });
      }
      console.log(`[${n}/${items.length}] ${entry.gloss} ${item.name}: ${r.window ? `ok (${r.sourceFrames} frames)` : 'no hands tracked'}`);
    }
    results.push(summariseSign(entry, perVideo));
  }
  const pack = buildPack(results);
  return {
    pack,
    rows,
    delegate: tracker.delegate,
    stats: results.map((r) => ({ gloss: r.gloss, videos: r.videos, usable: r.usable })),
  };
}

(window as unknown as { importInclude: typeof importInclude; importReady: boolean }).importInclude = importInclude;
(window as unknown as { importReady: boolean }).importReady = true;
