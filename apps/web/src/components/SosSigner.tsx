/**
 * "Sign for help" on the Emergency screen: recognises a small set of SOS signs on the
 * device, with no network, and turns the sign into a big message that is spoken aloud and
 * can be sent as a call or a text in one tap.
 *
 * Safety rules:
 *   - Only SOS signs this person recorded (or a trained model knows) can be recognised.
 *   - A stricter threshold and a clear margin over the runner-up; otherwise "try again".
 *   - Nothing is called or texted automatically. The person confirms with one tap.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CameraView from './CameraView.js';
import { OnnxClassifier, createClassifier, type SignClassifier } from '../lib/classifier.js';
import { FRAME_DIM, FeatureWindow, SignSegmenter, encodeFrame } from '../lib/features.js';
import type { TrackedFrame } from '../lib/landmarks.js';
import {
  SOS_GOOD_TAKES, SOS_MIN_TAKES, SOS_SIGNS, acceptSos, prepareOffline, sosOfflineStatus, sosReadiness, telFor,
  type SosReadiness, type SosSign,
} from '../lib/sos.js';
import { sampleCounts } from '../lib/storage.js';
import { speak } from '../lib/speech.js';
import { useSettings } from '../state/settings.js';

export interface SosSignerProps {
  /** Builds the "text for help" link for the first emergency contact, if there is one. */
  textLink: (message: string) => string | null;
}

export default function SosSigner({ textLink }: SosSignerProps) {
  const { settings } = useSettings();
  const [readiness, setReadiness] = useState<SosReadiness | null>(null);
  const [offline, setOffline] = useState<{ ready: boolean; supported: boolean } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [active, setActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [unsure, setUnsure] = useState(false);
  const [result, setResult] = useState<SosSign | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const classifierRef = useRef<SignClassifier | null>(null);
  const windowRef = useRef(new FeatureWindow());
  const segmenterRef = useRef(new SignSegmenter());
  const scratchRef = useRef(new Float32Array(FRAME_DIM));
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const counts = await sampleCounts().catch(() => ({}));
    // A trained model that knows SOS signs makes them ready without recording.
    const model = await createClassifier({ only: SOS_SIGNS.map((s) => s.gloss) }).catch(() => null);
    const modelLabels = model instanceof OnnxClassifier ? model.labels : [];
    setReadiness(sosReadiness(counts, modelLabels));
    setOffline(await sosOfflineStatus());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function start() {
    if (!readiness?.ready.length) return;
    setResult(null);
    setUnsure(false);
    classifierRef.current = await createClassifier({ only: readiness.ready });
    windowRef.current.clear();
    setActive(true);
  }

  const classify = useCallback(async () => {
    const model = classifierRef.current;
    if (!model || busyRef.current || !readiness) return;
    busyRef.current = true;
    try {
      if (!windowRef.current.isReady()) return;
      const sign = acceptSos(await model.predict(windowRef.current.build(), 3), readiness.ready);
      if (sign) {
        setResult(sign);
        setUnsure(false);
        setActive(false);
        speak(sign.message, settings.ttsLang);
      } else {
        setUnsure(true);
      }
    } finally {
      windowRef.current.clear();
      busyRef.current = false;
    }
  }, [readiness, settings.ttsLang]);

  const onFrame = useCallback((frame: TrackedFrame) => {
    const encoded = encodeFrame(frame, scratchRef.current);
    const transition = segmenterRef.current.update(encoded);
    if (transition === 'start') {
      windowRef.current.clear();
      setCapturing(true);
    }
    if (segmenterRef.current.isActive || transition === 'end') windowRef.current.pushEncoded(encoded);
    if (transition === 'end') {
      setCapturing(false);
      void classify();
    }
  }, [classify]);

  const readyCount = readiness?.ready.length ?? 0;

  return (
    <section className="card stack sos" aria-labelledby="sos-title">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="sos-title" style={{ margin: 0 }}>Sign for help</h2>
        {offline && (
          <span className={`status-pill ${offline.ready ? '' : 'open'}`} title={offline.ready ? 'Recognition works with no internet on this device' : 'Open once with internet so it works offline'}>
            {offline.ready ? '✓ Works offline' : 'Needs one online visit'}
          </span>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Sign an SOS sign to the camera. SignSphere shows it as a big message, says it aloud, and lets you call or text with one tap. Recognition runs on this phone — no internet needed.
      </p>

      {result && (
        <div className="sos-result" role="alert">
          <p className="sos-gloss">{result.gloss}</p>
          <p className="sos-message">{result.message}</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => speak(result.message, settings.ttsLang)}>🔊 Say it again</button>
            {telFor(result.action) && <a className="btn primary" href={telFor(result.action)!}>☎ Call {telFor(result.action)!.slice(4)}</a>}
            {textLink(result.message) && <a className="btn primary" href={textLink(result.message)!}>✉ Text my contact</a>}
            <button type="button" onClick={() => { setResult(null); void start(); }}>That’s wrong — sign again</button>
          </div>
        </div>
      )}

      {active ? (
        <>
          <CameraView onFrame={onFrame} recording={capturing} badge={capturing ? '● Reading your sign…' : 'Sign now'} />
          {unsure && (
            <p className="notice warn" style={{ margin: 0 }}>
              <strong>Not sure — please sign again</strong>
              Sign a little slower with your hands fully in view. Or tap a phrase card below.
            </p>
          )}
          <button type="button" onClick={() => setActive(false)}>Stop camera</button>
        </>
      ) : !result && (
        <div className="row">
          <button type="button" className="primary" onClick={() => void start()} disabled={readyCount === 0}>
            ✋ Start — {readyCount ? `${readyCount} SOS sign${readyCount === 1 ? '' : 's'} ready` : 'set up signs first'}
          </button>
          {readyCount > 0 && (
            <button type="button" onClick={() => setSetupOpen((o) => !o)} aria-expanded={setupOpen}>
              {setupOpen ? 'Hide setup' : 'Set up my SOS signs'}
            </button>
          )}
        </div>
      )}

      {offline && !offline.ready && offline.supported && (
        <p className="hint" style={{ margin: 0 }}>
          While you have internet, <button type="button" className="link" disabled={preparing}
            onClick={async () => { setPreparing(true); await prepareOffline(); setPreparing(false); void refresh(); }}>
            {preparing ? 'downloading…' : 'download for offline use'}
          </button> (about 13 MB, once).
        </p>
      )}

      {(setupOpen || readyCount === 0) && readiness && (
        <div className="stack" style={{ gap: '0.5rem' }}>
          <p className="small" style={{ margin: 0 }}>
            Record each sign you want to use {SOS_GOOD_TAKES} times ({SOS_MIN_TAKES} is the minimum). It learns <em>your</em> way of signing, on this phone.
          </p>
          <ul className="sos-setup">
            {SOS_SIGNS.map((s) => {
              const takes = readiness.takes[s.gloss] ?? 0;
              const ready = readiness.ready.includes(s.gloss);
              return (
                <li key={s.gloss}>
                  <span><strong>{s.gloss}</strong> <span className="small muted">— {s.message}</span></span>
                  <span className="row" style={{ gap: '0.4rem' }}>
                    <span className={`chip ${ready ? 'active' : ''}`}>{ready ? '✓ ' : ''}{Math.min(takes, SOS_GOOD_TAKES)}/{SOS_GOOD_TAKES}</span>
                    <Link className="btn small" to={`/record?label=${encodeURIComponent(s.gloss)}&return=${encodeURIComponent('/emergency?sos=setup')}`}>Record</Link>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="hint" style={{ margin: 0 }}>Recording needs you signed in (or using SignSphere on this device). Using SOS doesn’t.</p>
        </div>
      )}
    </section>
  );
}
