/**
 * Sample recorder.
 *
 * Two jobs: (1) build the on-device template classifier so recognition works today, and
 * (2) produce the JSONL that Colab trains on.
 *
 * Consent gate: nothing is exported for training without opt-in A from
 * docs/data-collection-protocol.md. That is enforced in storage.exportSamples(), not here —
 * a UI checkbox is a reminder, not a control.
 */

import { useT } from '../lib/i18n.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildIndex } from '@signsphere/gloss';
import { useLexicon } from '../lib/vocabulary.js';
import CameraView, { type FrameMeta } from '../components/CameraView.js';
import { FEATURE_VERSION, FRAME_DIM, FeatureWindow, WINDOW_FRAMES, encodeFrame } from '../lib/features.js';
import { captureFrame, cleanClip, type MotionFrame } from '../lib/motion.js';
import { saveMotion } from '../lib/motionLibrary.js';
import type { TrackedFrame } from '../lib/landmarks.js';
import {
  addSample,
  clearSamples,
  exportSamples,
  sampleCounts,
  type SampleMeta,
} from '../lib/storage.js';
import { Link, useSearchParams } from 'react-router-dom';
import { useSettings } from '../state/settings.js';
import { useSession } from '../state/session.js';
import { newId } from '../lib/backend.js';
import { deleteAllSyncedSigns, queueSign } from '../lib/signSync.js';

/*
 * Capture ends when a full model window of frames is collected, not after a fixed time.
 * MIN_MS stops a fast device ending mid-sign. A recording is never saved with fewer than
 * MIN_FRAMES frames that actually contain a hand: after SOFT_MAX_MS it stops as soon as it
 * has MIN_FRAMES, and a very slow device keeps going up to HARD_MAX_MS to reach them.
 */
const TARGET_FRAMES = WINDOW_FRAMES;
const MIN_FRAMES = 16;
const MIN_MS = 1200;
const SOFT_MAX_MS = 4500;
const HARD_MAX_MS = 10000;
const COUNTDOWN_FROM = 3;

type Phase = 'idle' | 'countdown' | 'recording' | 'saved';

export default function Recorder() {
  const { settings, update } = useSettings();
  const { backend, active } = useSession();
  const { t } = useT();
  const cloud = backend.mode === 'cloud';
  const lexicon = buildIndex(useLexicon());

  // "Record this sign" links elsewhere in the app open Record with the sign already chosen.
  const [params] = useSearchParams();
  const wanted = (params.get('label') ?? '').trim().toUpperCase();
  // Opened from another screen (e.g. SOS setup): offer a way back. Only paths inside the app.
  const returnTo = (params.get('return') ?? '').startsWith('/') && !(params.get('return') ?? '').startsWith('//') ? params.get('return')! : null;
  const known = wanted && lexicon.lexicon.entries.some((e) => e.gloss === wanted);
  const [label, setLabel] = useState(known ? wanted : (lexicon.lexicon.entries[0]?.gloss ?? 'HELLO'));
  const [customLabel, setCustomLabel] = useState(wanted && !known ? wanted : '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [lighting, setLighting] = useState<SampleMeta['lighting']>('normal');

  const windowRef = useRef(new FeatureWindow(90));
  const scratchRef = useRef(new Float32Array(FRAME_DIM));
  const phaseRef = useRef<Phase>('idle');
  const startedAtRef = useRef(0);
  const savingRef = useRef(false);
  const motionRef = useRef<MotionFrame[]>([]);
  const handFramesRef = useRef(0);
  const [handFrames, setHandFrames] = useState(0);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const [frames, setFrames] = useState(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const refreshCounts = useCallback(() => {
    void sampleCounts().then(setCounts);
  }, []);
  useEffect(refreshCounts, [refreshCounts]);

  const activeLabel = (customLabel.trim() || label).toUpperCase();

  const handleFrame = useCallback((frame: TrackedFrame, meta: FrameMeta) => {
    if (phaseRef.current !== 'recording' || savingRef.current) return;
    const window = windowRef.current;
    window.pushEncoded(encodeFrame(frame, scratchRef.current));
    // The same frame, kept as motion so the 3D avatar can perform this sign.
    motionRef.current.push(captureFrame(frame, performance.now() - startedAtRef.current, meta.aspect));
    if (frame.hands.length > 0) handFramesRef.current += 1;
    setFrames(window.length);
    setHandFrames(handFramesRef.current);
    const elapsed = performance.now() - startedAtRef.current;
    const enough = handFramesRef.current >= MIN_FRAMES;
    if ((window.length >= TARGET_FRAMES && elapsed >= MIN_MS && enough) || (elapsed >= SOFT_MAX_MS && enough)) {
      savingRef.current = true;
      void saveRef.current();
    }
  }, []);

  const save = useCallback(async () => {
    const window = windowRef.current;
    const sourceFrames = window.length;
    const seconds = (performance.now() - startedAtRef.current) / 1000;
    const fps = seconds > 0 ? Math.round(sourceFrames / seconds) : 0;

    if (handFramesRef.current < MIN_FRAMES) {
      setMessage(
        `Not saved: only ${handFramesRef.current} frames with your hand in view in ${seconds.toFixed(1)} s ` +
          `(tracking at about ${fps} fps; at least ${MIN_FRAMES} are needed). Keep both hands inside the camera box and well lit, ` +
          'close other tabs, and try again.',
      );
      window.clear();
      setPhase('idle');
      return;
    }

    try {
      const cloudId = newId();
      const sampleId = await addSample({
        label: activeLabel,
        featureVersion: FEATURE_VERSION,
        sourceFrames,
        vector: Array.from(window.build()),
        meta: {
          signerId: settings.signerId,
          dominantHand: settings.dominantHand,
          device: navigator.userAgent.slice(0, 120),
          lighting,
          createdAt: Date.now(),
          consentTrain: settings.consentTrain,
          cloudId,
        },
      });
      const motionId = await saveMotion(activeLabel, cleanClip(motionRef.current));
      // Sync to the login so the sign also works on the user's other devices.
      queueSign(cloudId, { sampleId, motionId, accountId: active?.id ?? null });
      const synced = cloud ? ' It will also be on your other devices.' : '';
      setMessage(
        (sourceFrames >= TARGET_FRAMES
          ? `Saved ${activeLabel} — ${sourceFrames} frames in ${seconds.toFixed(1)} s. The avatar can now sign it too.`
          : `Saved ${activeLabel} with ${sourceFrames} frames in ${seconds.toFixed(1)} s (tracking at about ${fps} fps).`) + synced,
      );
      setPhase('saved');
      refreshCounts();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Could not save the sample.');
      setPhase('idle');
    } finally {
      window.clear();
    }
  }, [active, activeLabel, cloud, lighting, refreshCounts, settings.consentTrain, settings.dominantHand, settings.signerId]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  function startCapture() {
    setMessage(null);
    setCountdown(COUNTDOWN_FROM);
    setPhase('countdown');
  }

  // Countdown, then record until TARGET_FRAMES (or MAX_MS), then save.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      windowRef.current.clear();
      motionRef.current = [];
      handFramesRef.current = 0;
      setHandFrames(0);
      savingRef.current = false;
      startedAtRef.current = performance.now();
      setFrames(0);
      setPhase('recording');
      return;
    }
    const timer = setTimeout(() => setCountdown((n) => n - 1), 800);
    return () => clearTimeout(timer);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== 'recording') return;
    // Safety net for very slow devices: stop at HARD_MAX_MS (save() refuses if too few frames).
    const timer = setTimeout(() => {
      if (savingRef.current) return;
      savingRef.current = true;
      void saveRef.current();
    }, HARD_MAX_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  async function download() {
    const { jsonl, included, skippedNoConsent, skippedOldVersion } = await exportSamples(FEATURE_VERSION);
    if (included === 0) {
      setMessage(
        `Nothing to export. ${skippedNoConsent} sample(s) skipped for missing training consent, ` +
          `${skippedOldVersion} from an older feature version.`,
      );
      return;
    }
    const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `signsphere-samples-v${FEATURE_VERSION}.jsonl`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(
      `Exported ${included} sample(s). Skipped ${skippedNoConsent} without training consent and ` +
        `${skippedOldVersion} from an older feature version.`,
    );
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <>
      {returnTo && (
        <p style={{ marginTop: 0 }}>
          <Link className="btn small" to={returnTo}>← Back{returnTo.startsWith('/emergency') ? ' to SOS setup' : ''}{counts[activeLabel] ? ` (${activeLabel}: ${counts[activeLabel]} recorded)` : ''}</Link>
        </p>
      )}
      <h1>{t('rec.title')}</h1>
      <p className="lede">{t('rec.lede')}</p>

      <p className="notice">
        <strong>{t('rec.protocolTitle')}</strong>
        {t('rec.protocolBody')}
      </p>

      <div className="split">
        <section aria-label="Camera">
          <CameraView
            onFrame={handleFrame}
            recording={phase === 'recording'}
            badge={
              phase === 'countdown'
                ? `${t('rec.getReady')} ${countdown}`
                : phase === 'recording'
                  ? `${t('rec.recording')} ${activeLabel} · ${Math.min(frames, TARGET_FRAMES)}/${TARGET_FRAMES} ${t('rec.frames')}`
                  : undefined
            }
          />
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="primary"
              onClick={startCapture}
              disabled={phase === 'countdown' || phase === 'recording'}
            >
              {phase === 'idle' || phase === 'saved' ? `${t('rec.record')} ${activeLabel}` : t('rec.recordingBtn')}
            </button>
            <span className="small muted" aria-live="polite">
              {phase === 'countdown' && `${t('rec.startingIn')} ${countdown}…`}
              {phase === 'recording' &&
                (handFrames < MIN_FRAMES
                  ? `${t('rec.signNow')} — ${handFrames} ${t('rec.atLeast')} ${MIN_FRAMES} ${t('rec.handInView')}`
                  : `${t('rec.signNow')} — ${Math.min(frames, TARGET_FRAMES)} ${t('rec.of')} ${TARGET_FRAMES} ${t('rec.frames')}`)}
            </span>
          </div>
          {message && (
            <p className="notice" style={{ marginTop: '0.75rem' }} role="status">
              {message}
            </p>
          )}
        </section>

        <section className="card stack" aria-label="Recording settings">
          <div className="field">
            <label htmlFor="label-select">{t('rec.signToRecord')}</label>
            <select
              id="label-select"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setCustomLabel('');
              }}
            >
              {lexicon.lexicon.entries.map((entry) => (
                <option key={entry.gloss} value={entry.gloss}>
                  {entry.gloss}
                  {entry.category ? ` — ${entry.category}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="custom-label">{t('rec.orType')}</label>
            <input
              id="custom-label"
              type="text"
              value={customLabel}
              onChange={(event) => setCustomLabel(event.target.value)}
              placeholder="e.g. CRICKET"
            />
          </div>

          <div className="field">
            <label htmlFor="signer-id">{t('rec.signerId')}</label>
            <input
              id="signer-id"
              type="text"
              value={settings.signerId}
              onChange={(event) => update({ signerId: event.target.value })}
              placeholder="S014"
            />
          </div>

          <div className="field">
            <label htmlFor="lighting">{t('rec.lighting')}</label>
            <select
              id="lighting"
              value={lighting}
              onChange={(event) => setLighting(event.target.value as SampleMeta['lighting'])}
            >
              <option value="bright">{t('rec.bright')}</option>
              <option value="normal">{t('rec.normal')}</option>
              <option value="dim">{t('rec.dim')}</option>
            </select>
            <p className="hint">
              {t('rec.lightingHint')}
            </p>
          </div>

          <label className="switch">
            <span>
              {t('rec.consent')}
              <span className="hint" style={{ display: 'block' }}>
                {t('rec.consentHint')}
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.consentTrain}
              onChange={(event) => update({ consentTrain: event.target.checked })}
            />
          </label>
        </section>
      </div>

      <h2 style={{ marginTop: '1.75rem' }}>Recorded so far ({total})</h2>
      {total === 0 ? (
        <p className="muted">
          {t('rec.nothing')}
        </p>
      ) : (
        <div className="card">
          <table>
            <caption className="sr-only">Recorded samples per sign</caption>
            <thead>
              <tr>
                <th scope="col">{t('rec.sign')}</th>
                <th scope="col">{t('rec.samples')}</th>
                <th scope="col">{t('rec.enough')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(counts)
                .sort(([, a], [, b]) => b - a)
                .map(([gloss, count]) => (
                  <tr key={gloss}>
                    <td>
                      <strong>{gloss}</strong>
                    </td>
                    <td>{count}</td>
                    <td>{count >= 5 ? t('rec.workable') : t('rec.needs', { n: 5 - count })}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ marginTop: '1rem' }}>
        <button type="button" onClick={() => void download()} disabled={total === 0}>
          ⬇ Export JSONL for Colab
        </button>
        <button
          type="button"
          className="danger"
          disabled={total === 0}
          onClick={() => {
            const where = cloud ? 'on this device and on all devices you sign in on' : 'on this device';
            if (!confirm(`Delete all recorded samples ${where}? This cannot be undone.`)) return;
            void Promise.all([clearSamples(), deleteAllSyncedSigns()]).then(() => {
              refreshCounts();
              setMessage('All recorded samples deleted.');
            });
          }}
        >
          {t('rec.deleteAll')}
        </button>
      </div>
      <p className="hint">
        {t('rec.after')}
      </p>
    </>
  );
}
