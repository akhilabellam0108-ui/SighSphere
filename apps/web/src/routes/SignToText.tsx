/**
 * Sign → Text and Sign → Voice.
 *
 * Auto-segments signs from motion so the user does not press a button per sign, classifies
 * the captured window, and only accepts a prediction above REJECTION_THRESHOLD. Below that
 * it says "not sure" — an accessibility tool that guesses confidently is worse than one
 * that admits uncertainty.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CameraView from '../components/CameraView.js';
import {
  REJECTION_THRESHOLD,
  createClassifier,
  type Prediction,
  type SignClassifier,
} from '../lib/classifier.js';
import { FRAME_DIM, FeatureWindow, SignSegmenter, encodeFrame } from '../lib/features.js';
import type { TrackedFrame } from '../lib/landmarks.js';
import { speak, stopSpeaking } from '../lib/speech.js';
import { useRecordHistory } from '../state/history.js';
import { useSettings } from '../state/settings.js';

export interface SignToTextProps {
  speakOutput: boolean;
}

export default function SignToText({ speakOutput }: SignToTextProps) {
  const { settings } = useSettings();
  const [classifier, setClassifier] = useState<SignClassifier | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [sentence, setSentence] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [rejected, setRejected] = useState(false);

  const windowRef = useRef(new FeatureWindow());
  const segmenterRef = useRef(new SignSegmenter());
  const scratchRef = useRef(new Float32Array(FRAME_DIM));
  const busyRef = useRef(false);
  const classifierRef = useRef<SignClassifier | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClassifier()
      .then((next) => {
        if (cancelled) return;
        classifierRef.current = next;
        setClassifier(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Could not load the classifier.');
      });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, []);

  const runPrediction = useCallback(async () => {
    const model = classifierRef.current;
    if (!model || busyRef.current) return;
    busyRef.current = true;
    try {
      const window = windowRef.current;
      if (!window.isReady()) return;
      const result = await model.predict(window.build());
      setPredictions(result);

      const top = result[0];
      if (top && top.confidence >= REJECTION_THRESHOLD) {
        setRejected(false);
        setSentence((previous) => [...previous, top.label]);
        if (speakOutput) speak(top.label, settings.ttsLang);
      } else {
        setRejected(true);
      }
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Prediction failed.');
    } finally {
      windowRef.current.clear();
      busyRef.current = false;
    }
  }, [speakOutput, settings.ttsLang]);

  const handleFrame = useCallback(
    (frame: TrackedFrame) => {
      const encoded = encodeFrame(frame, scratchRef.current);
      const transition = segmenterRef.current.update(encoded);

      if (transition === 'start') {
        windowRef.current.clear();
        setCapturing(true);
      }
      if (segmenterRef.current.isActive || transition === 'end') {
        windowRef.current.pushEncoded(encoded);
      }
      if (transition === 'end') {
        setCapturing(false);
        void runPrediction();
      }
    },
    [runPrediction],
  );

  const untrained = classifier !== null && classifier.labels.length === 0;
  const sentenceText = sentence.join(' ');
  // Save what was signed to this account's history (consecutive signs merge into one entry).
  useRecordHistory(speakOutput ? 'sign-to-voice' : 'sign-to-text', sentenceText, sentenceText, 1200);

  return (
    <>
      <h1>{speakOutput ? 'Sign → Voice' : 'Sign → Text'}</h1>
      <p className="lede">
        Sign to the camera. Start moving to begin a sign, then hold still briefly to finish it.
        Video never leaves this device.
      </p>
      <p style={{ marginTop: 0 }}>
        <Link className="btn small" to="/record">
          ⏺ Record a new sign
        </Link>
      </p>

      {untrained && (
        <p className="notice">
          <strong>No signs recorded yet</strong>
          Recognition needs examples first. Go to <Link to="/record">Record</Link> and capture 5
          takes each of a few signs, then come back. It works immediately — no training run
          required.
        </p>
      )}

      {loadError && (
        <p className="notice error">
          <strong>Recognition unavailable</strong>
          {loadError}
        </p>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(18rem, 1fr) minmax(16rem, 1fr)' }}>
        <section aria-label="Camera">
          <CameraView
            onFrame={handleFrame}
            recording={capturing}
            badge={capturing ? '● Capturing sign…' : undefined}
          />
        </section>

        <section className="card stack" aria-label="Recognition">
          <div>
            <h2 className="small">Best guesses</h2>
            {predictions.length === 0 ? (
              <p className="muted small">Sign something to see predictions.</p>
            ) : (
              <div className="prediction">
                {predictions.map((prediction) => (
                  <div className="prediction-row" key={prediction.label}>
                    <span>{prediction.label}</span>
                    <span className="meter">
                      <span style={{ width: `${Math.round(prediction.confidence * 100)}%` }} />
                    </span>
                    {/* Percentage in text as well as the bar — never colour/length alone. */}
                    <span className="small muted">{Math.round(prediction.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
            {rejected && (
              <p className="notice warn" style={{ marginTop: '0.6rem' }}>
                <strong>Not sure about that one</strong>
                Confidence was below {Math.round(REJECTION_THRESHOLD * 100)}%, so nothing was
                added. Try signing a little slower, with both hands fully in frame.
              </p>
            )}
          </div>

          <div>
            <h2 className="small">Recognised so far</h2>
            <p aria-live="polite" style={{ minHeight: '2.5rem', fontWeight: 700, margin: 0 }}>
              {sentenceText || <span className="muted small">Nothing yet.</span>}
            </p>
            <div className="row" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="primary"
                onClick={() => speak(sentenceText, settings.ttsLang)}
                disabled={!sentenceText}
              >
                🔊 Speak
              </button>
              <button
                type="button"
                onClick={() => setSentence((previous) => previous.slice(0, -1))}
                disabled={sentence.length === 0}
              >
                ⌫ Undo
              </button>
              <button type="button" onClick={() => setSentence([])} disabled={sentence.length === 0}>
                Clear
              </button>
            </div>
          </div>

          {classifier && classifier.labels.length > 0 && (
            <div>
              <h2 className="small">
                Vocabulary ({classifier.labels.length} signs, {classifier.kind} model)
              </h2>
              <div className="gloss-row">
                {classifier.labels.map((label) => (
                  <span key={label} className="chip">
                    {label}
                    <span className="muted small">{classifier.support[label] ?? 0}</span>
                  </span>
                ))}
              </div>
              <p className="hint">
                The number is how many examples back each sign. Fewer than 5 and accuracy will be
                poor; examples from only one person will not generalise to anyone else.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
