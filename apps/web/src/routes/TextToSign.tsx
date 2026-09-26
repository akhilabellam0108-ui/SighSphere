/**
 * Text → Sign and Voice → Sign. One component, two input modes: the translation pipeline
 * after the input is identical, so duplicating it would just mean two places to fix bugs.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { translate } from '@signsphere/gloss';
import SignPlayer from '../components/SignPlayer.js';
import { createRecognizer, isSpeechRecognitionSupported, type Recognizer } from '../lib/speech.js';
import { useSettings } from '../state/settings.js';

const EXAMPLES = [
  'Where is the school?',
  'I do not know',
  'Yesterday I went to school',
  'I want water',
  'Hello, my name is Akhila',
  'Are you deaf?',
];

export interface TextToSignProps {
  mode: 'text' | 'voice';
}

export default function TextToSign({ mode }: TextToSignProps) {
  const { settings, update } = useSettings();
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);

  const result = useMemo(
    () => translate(text, { speed: settings.playbackSpeed }),
    [text, settings.playbackSpeed],
  );

  // Tear down the recogniser on unmount or when leaving voice mode.
  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
    };
  }, [mode]);

  function toggleListening() {
    if (listening) {
      recognizerRef.current?.stop();
      setListening(false);
      return;
    }
    const recognizer = createRecognizer(settings.sttLang, {
      onPartial: setPartial,
      onFinal: (final) => {
        setText((previous) => (previous ? `${previous} ${final}` : final));
        setPartial('');
      },
      onError: (message) => {
        setSpeechError(message);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    if (!recognizer) {
      setSpeechError(
        'This browser has no speech recognition. Chrome or Edge work; otherwise type below.',
      );
      return;
    }
    recognizerRef.current = recognizer;
    setSpeechError(null);
    recognizer.start();
    setListening(true);
  }

  return (
    <>
      <h1>{mode === 'voice' ? 'Voice → Sign' : 'Text → Sign'}</h1>
      <p className="lede">
        {mode === 'voice'
          ? 'Speak, and see it in Indian Sign Language order. You can edit the transcript before playing.'
          : 'Type English and see it in Indian Sign Language order. Words with no sign are fingerspelled.'}
      </p>

      {mode === 'voice' && (
        <p className="notice warn">
          <strong>Microphone privacy</strong>
          Unlike the camera, speech recognition in most browsers sends your audio to the
          browser vendor&rsquo;s servers for transcription. If that matters to you, type instead.
        </p>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(18rem, 1fr) minmax(18rem, 1fr)' }}>
        <section className="card stack" aria-label="Input">
          {mode === 'voice' && (
            <div className="stack">
              <button
                type="button"
                className={listening ? 'danger' : 'primary'}
                onClick={toggleListening}
                aria-pressed={listening}
              >
                {listening ? '⏹ Stop listening' : '🎤 Start listening'}
              </button>
              {!isSpeechRecognitionSupported() && (
                <p className="notice warn">
                  <strong>Speech recognition unavailable</strong>
                  Type in the box below instead — everything else works the same.
                </p>
              )}
              {partial && (
                <p className="small muted" aria-live="polite">
                  Hearing: &ldquo;{partial}&rdquo;
                </p>
              )}
              {speechError && (
                <p className="notice error">
                  <strong>Speech problem</strong>
                  {speechError}
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="source-text">English text</label>
            <textarea
              id="source-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type a sentence, e.g. Where is the school?"
              rows={4}
            />
            <p className="hint">
              English word order is converted to ISL sign order — the output is deliberately not
              a word-for-word match.
            </p>
          </div>

          <div>
            <h3 className="small">Try an example</h3>
            <div className="row">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="small" onClick={() => setText(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="speed">
              Playback speed: {settings.playbackSpeed.toFixed(2)}×
            </label>
            <input
              id="speed"
              type="range"
              min={0.4}
              max={1.4}
              step={0.05}
              value={settings.playbackSpeed}
              onChange={(event) => update({ playbackSpeed: Number(event.target.value) })}
            />
            <p className="hint">Learners usually want 0.6–0.8×.</p>
          </div>
        </section>

        <section className="card stack" aria-label="Sign output">
          <div>
            <h2 className="small">ISL gloss order</h2>
            <div className="gloss-row">
              {result.glosses.length === 0 && <span className="muted small">—</span>}
              {result.tokens.map((token, i) => (
                <span
                  key={`${token.gloss}-${i}`}
                  className={`chip${token.fingerspelled ? ' spelled' : ''}${
                    !token.fingerspelled && !token.entry?.reviewed ? ' unverified' : ''
                  }`}
                  title={
                    token.fingerspelled
                      ? `Fingerspelled — no sign for "${token.source}"`
                      : token.entry?.reviewed
                        ? `From "${token.source}"`
                        : `From "${token.source}" — gloss not yet checked by a fluent signer`
                  }
                >
                  {token.gloss}
                </span>
              ))}
            </div>
            {result.glosses.length > 0 && (
              <p className="hint">
                Dashed = fingerspelled. &ldquo;?&rdquo; = not yet checked by a fluent signer.
              </p>
            )}
          </div>

          <SignPlayer plan={result.plan} />

          {result.unknown.length > 0 && (
            <p className="notice warn">
              <strong>{result.unknown.length} word(s) have no sign yet</strong>
              {result.unknown.join(', ')} — these get fingerspelled. Add them to the lexicon at{' '}
              <code>packages/gloss/lexicon/isl-core.json</code>.
            </p>
          )}
        </section>
      </div>

      {result.trace.length > 0 && (
        <details className="trace">
          <summary>How this translation was produced ({result.trace.length} steps)</summary>
          <div className="trace-body">
            <ol>
              {result.trace.map((step, i) => (
                <li key={`${step.rule}-${i}`} style={{ marginBottom: '0.5rem' }}>
                  <code>{step.rule}</code> — {step.detail}
                  <br />
                  <span className="muted">→ {step.result.join(' ') || '(empty)'}</span>
                </li>
              ))}
            </ol>
            <p className="muted small">
              Rules live in <code>packages/gloss/src/rules.ts</code> and are unvalidated
              approximations of ISL grammar pending fluent-signer review.
            </p>
          </div>
        </details>
      )}
    </>
  );
}
