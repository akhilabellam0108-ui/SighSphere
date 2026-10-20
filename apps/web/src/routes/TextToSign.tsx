/**
 * Text → Sign and Voice → Sign. One component, two input modes: the translation pipeline
 * after the input is identical, so duplicating it would just mean two places to fix bugs.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { translate } from '@signsphere/gloss';
import { useLexicon } from '../lib/vocabulary.js';
import { useT } from '../lib/i18n.js';
import SignPlayer from '../components/SignPlayer.js';

import { createRecognizer, isSpeechRecognitionSupported, type Recognizer } from '../lib/speech.js';
import { useRecordHistory } from '../state/history.js';
import { useSettings } from '../state/settings.js';

// three.js is large: load the 3D avatar only on the screens that show it.
const AvatarPlayer = lazy(() => import('../components/avatar/AvatarPlayer.js'));

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
  const vocabulary = useLexicon();
  const { t } = useT();

  const result = useMemo(
    () => translate(text, { speed: settings.playbackSpeed, lexicon: vocabulary }),
    [text, settings.playbackSpeed, vocabulary],
  );

  // Save finished translations to this account's history.
  useRecordHistory(mode === 'voice' ? 'voice-to-sign' : 'text-to-sign', text, result.glosses.join(' '));

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
      <h1>{mode === 'voice' ? t('nav.voiceToSign') : t('nav.textToSign')}</h1>
      <p className="lede">
        {mode === 'voice' ? t('t2s.ledeVoice') : t('t2s.ledeText')}
      </p>

      {mode === 'voice' && (
        <p className="notice warn">
          <strong>{t('t2s.micTitle')}</strong>
          {t('t2s.micBody')}
        </p>
      )}

      <div className="split">
        <section className="card stack" aria-label="Input">
          {mode === 'voice' && (
            <div className="stack">
              <button
                type="button"
                className={listening ? 'danger' : 'primary'}
                onClick={toggleListening}
                aria-pressed={listening}
              >
                {listening ? t('convo.stop') : t('t2s.start')}
              </button>
              {!isSpeechRecognitionSupported() && (
                <p className="notice warn">
                  <strong>{t('t2s.noSpeechTitle')}</strong>
                  {t('t2s.noSpeechBody')}
                </p>
              )}
              {partial && (
                <p className="small muted" aria-live="polite">
                  {t('t2s.hearing')} &ldquo;{partial}&rdquo;
                </p>
              )}
              {speechError && (
                <p className="notice error">
                  <strong>{t('t2s.speechProblem')}</strong>
                  {speechError}
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="source-text">{t('t2s.english')}</label>
            <textarea
              id="source-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('t2s.placeholder')}
              rows={4}
            />
            <p className="hint">
              {t('t2s.orderHint')}
            </p>
          </div>

          <div>
            <h3 className="small">{t('t2s.example')}</h3>
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
              {t('t2s.speed')}: {settings.playbackSpeed.toFixed(2)}×
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
            <p className="hint">{t('t2s.speedHint')}</p>
          </div>
        </section>

        <section className="card stack" aria-label="Sign output">
          <div>
            <h2 className="small">{t('t2s.gloss')}</h2>
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
                {t('t2s.glossHint')}
              </p>
            )}
          </div>

          <Suspense fallback={<SignPlayer plan={result.plan} />}>
            <AvatarPlayer plan={result.plan} />
          </Suspense>

          {result.unknown.length > 0 && (
            <p className="notice warn">
              <strong>
                {result.unknown.length} {t('t2s.noSign')}
              </strong>
              {result.unknown.join(', ')} — {t('t2s.spelled')}
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
