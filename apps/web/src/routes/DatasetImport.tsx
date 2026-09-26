/**
 * ISL dataset importer screen: INCLUDE videos → recognition examples + avatar motion.
 * Runs entirely in this browser. See lib/datasetImport.ts.
 */

import { useMemo, useRef, useState } from 'react';
import {
  INCLUDE_SIGNS,
  SOS_GLOSSES,
  buildPack,
  scanFiles,
  summariseSign,
  trackVideo,
  type ScanResult,
  type SignResult,
} from '../lib/datasetImport.js';
import { LandmarkTracker } from '../lib/landmarks.js';
import { installPack, installedPacks, uninstallPack, type InstalledPack } from '../lib/packInstaller.js';
import { useSettings } from '../state/settings.js';

type Phase = 'choose' | 'ready' | 'running' | 'done';

export default function DatasetImport() {
  const { settings } = useSettings();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perSign, setPerSign] = useState(10);
  const [phase, setPhase] = useState<Phase>('choose');
  const [progress, setProgress] = useState({ sign: 0, signs: 0, video: 0, videos: 0, gloss: '' });
  const [results, setResults] = useState<SignResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledPack[]>(() => installedPacks());
  const [packFile, setPackFile] = useState<{ url: string; size: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(0);

  const chosen = useMemo(() => scan?.groups.filter((g) => selected.has(g.entry.label)) ?? [], [scan, selected]);
  const videosToProcess = chosen.reduce((sum, g) => sum + Math.min(perSign, g.files.length), 0);

  function onFolder(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const result = scanFiles(files);
    setScan(result);
    setSelected(new Set(result.groups.map((g) => g.entry.label)));
    setPhase(result.groups.length > 0 ? 'ready' : 'choose');
    if (result.groups.length === 0) setError('No INCLUDE sign folders were found in that folder. Select the folder you unzipped INCLUDE into.');
  }

  async function run() {
    setPhase('running');
    setError(null);
    setResults([]);
    const controller = new AbortController();
    abortRef.current = controller;
    startedRef.current = Date.now();
    const tracker = new LandmarkTracker({ dominantHand: 'right', processor: settings.processor });
    const clock = { t: 0 };
    const done: SignResult[] = [];
    let videoIndex = 0;
    try {
      await tracker.init();
      for (let s = 0; s < chosen.length; s += 1) {
        const group = chosen[s]!;
        const files = group.files.slice(0, perSign);
        const perVideo = [];
        for (const file of files) {
          setProgress({ sign: s + 1, signs: chosen.length, video: ++videoIndex, videos: videosToProcess, gloss: group.entry.gloss });
          try {
            perVideo.push(await trackVideo(file, tracker, clock, controller.signal));
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
            perVideo.push({ window: null, sourceFrames: 0, motion: [] }); // unreadable video: skip it
          }
        }
        done.push(summariseSign(group.entry, perVideo));
        setResults([...done]);
      }
      const pack = buildPack(done);
      await installPack(pack);
      setInstalled(installedPacks());
      const json = JSON.stringify(pack);
      setPackFile({ url: URL.createObjectURL(new Blob([json], { type: 'application/json' })), size: json.length });
      setPhase('done');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') setError('Import cancelled. Nothing was installed.');
      else setError(cause instanceof Error ? cause.message : 'The import failed.');
      setPhase('ready');
    } finally {
      tracker.close();
    }
  }

  async function installFromFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      await installPack(JSON.parse(await file.text()));
      setInstalled(installedPacks());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not install that pack.');
    }
  }

  const elapsed = (Date.now() - startedRef.current) / 1000;
  const eta = progress.video > 1 ? Math.round((elapsed / (progress.video - 1)) * (progress.videos - progress.video + 1)) : null;
  const bundled = installed.find((p) => p.id === 'isl-include');

  return (
    <>
      <h1>ISL dataset</h1>
      <p className="lede">
        Import the INCLUDE Indian Sign Language dataset so signs are recognised and the avatar can
        sign them — without anyone recording. Everything is processed on this computer.
      </p>

      {bundled && (
        <div className="notice">
          <strong>Installed: {bundled.name}</strong>
          {bundled.signs.length} signs · {bundled.examples} recognition examples · {bundled.motions} avatar motions.
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="danger small" onClick={() => void uninstallPack(bundled.id).then(() => setInstalled(installedPacks()))}>
              Remove from this device
            </button>
          </div>
        </div>
      )}

      <section className="card stack" aria-labelledby="step1">
        <h2 id="step1">1. Get the videos</h2>
        <p className="small" style={{ margin: 0 }}>
          Download the category zips you need from{' '}
          <a href="https://zenodo.org/records/4010759" target="_blank" rel="noopener noreferrer">
            INCLUDE on Zenodo
          </a>{' '}
          and unzip them into one folder. For the emergency signs you need <strong>Places</strong>,{' '}
          <strong>Jobs</strong>, <strong>Society</strong>, <strong>Adjectives</strong>, <strong>Greetings</strong>,{' '}
          <strong>People</strong> and <strong>Electronics</strong>. The full dataset is 57&nbsp;GB, so start small.
        </p>
      </section>

      <section className="card stack" aria-labelledby="step2" style={{ marginTop: '1rem' }}>
        <h2 id="step2">2. Choose that folder</h2>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="dataset-folder">INCLUDE folder</label>
          <input
            id="dataset-folder"
            type="file"
            // Non-standard but supported by every current browser for folder selection.
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            multiple
            onChange={(event) => onFolder(event.target.files)}
            disabled={phase === 'running'}
          />
        </div>
        {scan && (
          <>
            <p className="small" style={{ margin: 0 }}>
              Found <strong>{scan.groups.length}</strong> of {INCLUDE_SIGNS.length} INCLUDE signs ({scan.videoCount} videos).
              {scan.unmatchedFolders.length > 0 && ` ${scan.unmatchedFolders.length} folders were not INCLUDE signs and are ignored.`}
            </p>
            <div className="row">
              <button type="button" className="small" onClick={() => setSelected(new Set(scan.groups.map((g) => g.entry.label)))}>
                Select all
              </button>
              <button
                type="button"
                className="small"
                onClick={() => setSelected(new Set(scan.groups.filter((g) => SOS_GLOSSES.includes(g.entry.gloss)).map((g) => g.entry.label)))}
              >
                Emergency + basics only
              </button>
              <button type="button" className="small" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
            <div className="gloss-row" role="group" aria-label="Signs to import">
              {scan.groups.map((group) => {
                const on = selected.has(group.entry.label);
                return (
                  <button
                    key={group.entry.label}
                    type="button"
                    className={`chip${on ? ' active' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const next = new Set(selected);
                      if (on) next.delete(group.entry.label);
                      else next.add(group.entry.label);
                      setSelected(next);
                    }}
                  >
                    {group.entry.gloss} <span className="small">{group.files.length}</span>
                  </button>
                );
              })}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="per-sign">Videos per sign: {perSign}</label>
              <input id="per-sign" type="range" min={3} max={20} value={perSign} onChange={(event) => setPerSign(Number(event.target.value))} />
              <p className="hint">More videos = more signers seen = better recognition for new people, but slower.</p>
            </div>
          </>
        )}
      </section>

      <section className="card stack" aria-labelledby="step3" style={{ marginTop: '1rem' }}>
        <h2 id="step3">3. Import</h2>
        {phase !== 'running' ? (
          <div className="row">
            <button type="button" className="primary" disabled={chosen.length === 0} onClick={() => void run()}>
              Import {chosen.length} sign{chosen.length === 1 ? '' : 's'} ({videosToProcess} videos)
            </button>
            {chosen.length > 0 && <span className="small muted">About {Math.max(1, Math.round((videosToProcess * 4) / 60))} min on a typical laptop.</span>}
          </div>
        ) : (
          <div className="stack" role="status" aria-live="polite">
            <p style={{ margin: 0 }}>
              <strong>{progress.gloss}</strong> — sign {progress.sign} of {progress.signs}, video {progress.video} of {progress.videos}
              {eta !== null && ` · about ${eta < 90 ? `${eta} s` : `${Math.round(eta / 60)} min`} left`}
            </p>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${Math.round((progress.video / Math.max(1, progress.videos)) * 100)}%` }} />
            </div>
            <div>
              <button type="button" className="danger" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="notice error" role="alert">
            <strong>Import problem</strong>
            {error}
          </p>
        )}
        {results.length > 0 && (
          <table>
            <caption className="sr-only">Import results per sign</caption>
            <thead>
              <tr>
                <th scope="col">Sign</th>
                <th scope="col">Videos tracked</th>
                <th scope="col">Avatar motion</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.gloss}>
                  <td>
                    <strong>{r.gloss}</strong>
                  </td>
                  <td>
                    {r.usable} of {r.videos}
                  </td>
                  <td>{r.motion ? '✓' : 'hands not tracked'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {phase === 'done' && (
          <div className="notice">
            <strong>Installed on this device</strong>
            Sign → Text now recognises these signs, and the avatar signs them in Text → Sign.
            {packFile && (
              <>
                {' '}
                To ship them to <em>every</em> user, download the pack and add it to the project as{' '}
                <code>apps/web/public/datasets/isl-include.json</code>.
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <a className="btn primary" href={packFile.url} download="isl-include.json">
                    ⬇ Download pack ({(packFile.size / 1e6).toFixed(1)} MB)
                  </a>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card stack" aria-labelledby="step4" style={{ marginTop: '1rem' }}>
        <h2 id="step4">Already have a pack file?</h2>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="pack-file">Install a pack (.json)</label>
          <input id="pack-file" type="file" accept="application/json,.json" onChange={(event) => void installFromFile(event.target.files?.[0])} />
        </div>
      </section>

      <p className="hint">
        INCLUDE: AI4Bharat (Sridhar, Ganesan, Kumar P. and Khapra, ACM Multimedia 2020), licensed CC BY 4.0. Packs contain hand and body
        positions only — no video. INCLUDE was recorded by a small group of signers, so recognition for a new person improves if they
        also record a few examples themselves.
      </p>
    </>
  );
}
