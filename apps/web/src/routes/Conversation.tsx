/**
 * Live Conversation: a deaf signer and a hearing person take turns on one device.
 *
 *   Signer's turn  → camera recognises signs → becomes text in the shared transcript and is
 *                    spoken aloud for the hearing person (they can also tap quick replies or type).
 *   Speaker's turn → speech or typing → shown as text AND signed by the 3D avatar in ISL order.
 *
 * Same recognition rules as Sign → Text: only confident predictions are added, and nothing is
 * sent until the signer presses Send, so a wrong guess never reaches the other person.
 * The camera stays on (paused) during the speaker's turn so it never asks for permission again.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { translate } from '@signsphere/gloss';
import CameraView from '../components/CameraView.js';
import SignPlayer from '../components/SignPlayer.js';
import { REJECTION_THRESHOLD, createClassifier, type SignClassifier } from '../lib/classifier.js';
import { FRAME_DIM, FeatureWindow, SignSegmenter, encodeFrame } from '../lib/features.js';
import { record } from '../lib/historyStore.js';
import type { TrackedFrame } from '../lib/landmarks.js';
import { createRecognizer, speak, stopSpeaking, type Recognizer } from '../lib/speech.js';
import { useLexicon } from '../lib/vocabulary.js';
import { speechLangFor, useT, type MessageKey } from '../lib/i18n.js';
import { useSession } from '../state/session.js';
import { useSettings } from '../state/settings.js';

const AvatarPlayer = lazy(() => import('../components/avatar/AvatarPlayer.js'));

type Who = 'signer' | 'speaker';

interface Message {
  id: number;
  who: Who;
  text: string;
  /** ISL gloss order, for the speaker's messages. */
  gloss?: string;
  at: Date;
}

/** One tap for the signer: things a deaf person often needs to say mid-conversation. */
const QUICK_REPLIES: MessageKey[] = ['quick.yes', 'quick.no', 'quick.repeat', 'quick.slow', 'quick.write', 'quick.notUnderstand', 'quick.thanks', 'quick.wait'];

export default function Conversation() {
  const { settings } = useSettings();
  const { active } = useSession();
  const vocabulary = useLexicon();
  const { t, lang } = useT();
  const voice = speechLangFor(lang, settings.ttsLang);

  const [turn, setTurn] = useState<Who>('speaker');
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [speakAloud, setSpeakAloud] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(1);

  // ── signer side
  const [classifier, setClassifier] = useState<SignClassifier | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signed, setSigned] = useState<string[]>([]);
  const [signerText, setSignerText] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [unsure, setUnsure] = useState(false);
  const windowRef = useRef(new FeatureWindow());
  const segmenterRef = useRef(new SignSegmenter());
  const scratchRef = useRef(new Float32Array(FRAME_DIM));
  const busyRef = useRef(false);
  const classifierRef = useRef<SignClassifier | null>(null);
  const turnRef = useRef(turn);
  turnRef.current = turn;

  // ── speaker side
  const [speakerText, setSpeakerText] = useState('');
  const [partial, setPartial] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const usedVoiceRef = useRef(false);

  // What the avatar is signing: the newest speaker message, or one tapped to replay.
  const [showing, setShowing] = useState<{ text: string; replay: number } | null>(null);
  const plan = useMemo(
    () => (showing ? translate(showing.text, { speed: settings.playbackSpeed, lexicon: vocabulary }).plan : []),
    [showing, settings.playbackSpeed, vocabulary],
  );

  useEffect(() => {
    let cancelled = false;
    createClassifier()
      .then((next) => {
        if (cancelled) return;
        classifierRef.current = next;
        setClassifier(next);
      })
      .catch((error: unknown) => !cancelled && setLoadError(error instanceof Error ? error.message : 'Could not load recognition.'));
    return () => {
      cancelled = true;
      stopSpeaking();
      recognizerRef.current?.stop();
    };
  }, []);

  const predict = useCallback(async () => {
    const model = classifierRef.current;
    if (!model || busyRef.current) return;
    busyRef.current = true;
    try {
      if (!windowRef.current.isReady()) return;
      const top = (await model.predict(windowRef.current.build()))[0];
      if (top && top.confidence >= REJECTION_THRESHOLD) {
        setUnsure(false);
        setSigned((words) => [...words, top.label]);
      } else {
        setUnsure(true);
      }
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Recognition failed.');
    } finally {
      windowRef.current.clear();
      busyRef.current = false;
    }
  }, []);

  const handleFrame = useCallback(
    (frame: TrackedFrame) => {
      if (turnRef.current !== 'signer') return;
      const encoded = encodeFrame(frame, scratchRef.current);
      const transition = segmenterRef.current.update(encoded);
      if (transition === 'start') {
        windowRef.current.clear();
        setCapturing(true);
      }
      if (segmenterRef.current.isActive || transition === 'end') windowRef.current.pushEncoded(encoded);
      if (transition === 'end') {
        setCapturing(false);
        void predict();
      }
    },
    [predict],
  );

  function post(who: Who, text: string) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const gloss = who === 'speaker' ? translate(clean, { lexicon: vocabulary }).glosses.join(' ') : undefined;
    setMessages((list) => [...list, { id: nextId.current++, who, text: clean, gloss, at: new Date() }]);
    if (who === 'signer') {
      if (speakAloud) speak(clean, voice);
      if (active) record(active.id, 'sign-to-voice', clean, clean);
    } else {
      setShowing({ text: clean, replay: Date.now() });
      if (active) record(active.id, usedVoiceRef.current ? 'voice-to-sign' : 'text-to-sign', clean, gloss ?? '');
      usedVoiceRef.current = false;
    }
    if (autoSwitch) switchTo(who === 'signer' ? 'speaker' : 'signer');
  }

  function sendSigned(e?: FormEvent) {
    e?.preventDefault();
    const text = [signed.join(' '), signerText].filter(Boolean).join(' ');
    post('signer', text);
    setSigned([]);
    setSignerText('');
    setUnsure(false);
  }

  function sendSpoken(e?: FormEvent) {
    e?.preventDefault();
    recognizerRef.current?.stop();
    setListening(false);
    post('speaker', [speakerText, partial].filter(Boolean).join(' '));
    setSpeakerText('');
    setPartial('');
  }

  function switchTo(next: Who) {
    if (next === 'signer') {
      recognizerRef.current?.stop();
      setListening(false);
    } else {
      segmenterRef.current = new SignSegmenter();
      windowRef.current.clear();
      setCapturing(false);
    }
    setTurn(next);
  }

  function toggleListening() {
    if (listening) {
      recognizerRef.current?.stop();
      setListening(false);
      return;
    }
    const recognizer = createRecognizer(settings.sttLang, {
      onPartial: setPartial,
      onFinal: (final) => {
        usedVoiceRef.current = true;
        setSpeakerText((previous) => (previous ? `${previous} ${final}` : final));
        setPartial('');
      },
      onError: (message) => {
        setSpeechError(message);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    if (!recognizer) {
      setSpeechError('This browser has no speech recognition. Type instead — Chrome or Edge can listen.');
      return;
    }
    recognizerRef.current = recognizer;
    setSpeechError(null);
    recognizer.start();
    setListening(true);
  }

  const transcriptRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    transcriptRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages.length]);

  const untrained = classifier !== null && classifier.labels.length === 0;
  const draft = [signed.join(' '), signerText].filter(Boolean).join(' ');

  return (
    <>
      <h1>{t('convo.title')}</h1>
      <p className="lede">{t('convo.lede')}</p>

      <div className="segmented convo-turns" role="group" aria-label="Whose turn">
        <button type="button" aria-pressed={turn === 'signer'} onClick={() => switchTo('signer')}>
          {t('convo.signing')}
        </button>
        <button type="button" aria-pressed={turn === 'speaker'} onClick={() => switchTo('speaker')}>
          {t('convo.speaking')}
        </button>
      </div>

      <div className="split convo">
        <div className="stack">
          {/* Camera stays mounted so permission is asked once; it only listens on the signer's turn. */}
          <section className={`card stack${turn === 'signer' ? '' : ' convo-hidden'}`} aria-label="Signer">
            <h2 className="small" style={{ margin: 0 }}>
              {t('convo.signerHeading')}
            </h2>
            {untrained && (
              <p className="notice warn" style={{ margin: 0 }}>
                No signs are set up for recognition yet. Use the quick replies or type below, or <Link to="/record">record some signs</Link>.
              </p>
            )}
            {loadError && (
              <p className="notice error" style={{ margin: 0 }}>
                {loadError}
              </p>
            )}
            <CameraView onFrame={handleFrame} paused={turn !== 'signer'} recording={capturing} badge={capturing ? '● Reading sign…' : undefined} />
            {unsure && (
              <p className="small muted" role="status" style={{ margin: 0 }}>
                {t('convo.unsure')}
              </p>
            )}
            <form className="stack" onSubmit={sendSigned}>
              <div className="gloss-row" aria-live="polite" aria-label="Recognised signs">
                {signed.length === 0 ? <span className="muted small">{t('convo.recognised')}</span> : signed.map((w, i) => <span key={`${w}-${i}`} className="chip">{w}</span>)}
              </div>
              <label className="field">
                <span>{t('convo.orType')}</span>
                <input type="text" value={signerText} onChange={(e) => setSignerText(e.target.value)} placeholder="Add words here" />
              </label>
              <div className="row">
                <button type="submit" className="primary" disabled={!draft}>
                  {speakAloud ? t('convo.sendSpeak') : t('convo.send')}
                </button>
                <button type="button" onClick={() => setSigned((w) => w.slice(0, -1))} disabled={!signed.length}>
                  {t('convo.undo')}
                </button>
                <button type="button" onClick={() => { setSigned([]); setSignerText(''); }} disabled={!draft}>
                  {t('convo.clear')}
                </button>
              </div>
            </form>
            <div>
              <h3 className="small" style={{ margin: '0 0 0.4rem' }}>
                {t('convo.quick')}
              </h3>
              <div className="row">
                {QUICK_REPLIES.map((reply) => (
                  <button key={reply} type="button" className="small" onClick={() => post('signer', t(reply))}>
                    {t(reply)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {turn === 'speaker' && (
            <section className="card stack" aria-label="Speaker">
              <h2 className="small" style={{ margin: 0 }}>
                {t('convo.speakerHeading')}
              </h2>
              <button type="button" className={listening ? 'danger' : 'primary'} onClick={toggleListening} aria-pressed={listening}>
                {listening ? t('convo.stop') : t('convo.speak')}
              </button>
              {partial && (
                <p className="small muted" aria-live="polite" style={{ margin: 0 }}>
                  Hearing: “{partial}”
                </p>
              )}
              {speechError && (
                <p className="notice error" style={{ margin: 0 }}>
                  {speechError}
                </p>
              )}
              <form className="stack" onSubmit={sendSpoken}>
                <label className="field">
                  <span>{t('convo.message')}</span>
                  <textarea rows={3} value={speakerText} onChange={(e) => setSpeakerText(e.target.value)} placeholder={t('convo.placeholder')} />
                </label>
                <button type="submit" className="primary" disabled={!speakerText.trim() && !partial.trim()}>
                  {t('convo.sendSign')}
                </button>
              </form>
              <p className="hint" style={{ margin: 0 }}>
                Speech recognition in most browsers sends audio to the browser maker to transcribe. Type if that matters.
              </p>
            </section>
          )}
        </div>

        <div className="stack">
          <section className="card stack" aria-label="Avatar">
            <h2 className="small" style={{ margin: 0 }}>
              {t('convo.inIsl')} {showing ? `— “${showing.text}”` : ''}
            </h2>
            {showing ? (
              <Suspense fallback={<SignPlayer plan={plan} />}>
                <AvatarPlayer key={showing.replay} plan={plan} autoPlay />
              </Suspense>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                {t('convo.avatarEmpty')}
              </p>
            )}
          </section>

          <section className="card stack" aria-label="Conversation">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="small" style={{ margin: 0 }}>
                {t('convo.log')}
              </h2>
              <button type="button" className="small" disabled={!messages.length} onClick={() => window.confirm('Clear this conversation from the screen? It stays in History.') && setMessages([])}>
                {t('convo.new')}
              </button>
            </div>
            {messages.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                {t('convo.empty')}
              </p>
            ) : (
              <ol className="convo-log" ref={transcriptRef} aria-live="polite">
                {messages.map((m) => (
                  <li key={m.id} className={`bubble ${m.who}`}>
                    <span className="small muted">
                      {m.who === 'signer' ? t('convo.signed') : t('convo.said')} · {m.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="bubble-text">{m.text}</span>
                    {m.gloss && <span className="small muted">ISL: {m.gloss}</span>}
                    {m.who === 'speaker' ? (
                      <button type="button" className="small" onClick={() => setShowing({ text: m.text, replay: Date.now() })}>
                        {t('convo.signAgain')}
                      </button>
                    ) : (
                      <button type="button" className="small" onClick={() => speak(m.text, voice)}>
                        {t('convo.sayAgain')}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card stack" aria-label="Options">
            <label className="check">
              <input type="checkbox" checked={autoSwitch} onChange={(e) => setAutoSwitch(e.target.checked)} />
              {t('convo.autoSwitch')}
            </label>
            <label className="check">
              <input type="checkbox" checked={speakAloud} onChange={(e) => setSpeakAloud(e.target.checked)} />
              {t('convo.speakAloud')}
            </label>
          </section>
        </div>
      </div>
    </>
  );
}
