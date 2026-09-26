/**
 * Live Conversation — the flagship screen.
 *
 * Built entirely from existing pieces: speech input (useSpeechInput) → gloss engine →
 * SignPlayer for the hearing side; camera → useSignRecognition → text + speech for the
 * signing side. Both feed one shared transcript that can be saved to history.
 *
 * Honest limits, stated in the UI: the signing side recognises isolated signs from the
 * vocabulary this device has been taught — it strings recognised signs into a turn, it
 * does not translate continuous signing.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { translate } from '@signsphere/gloss';
import CameraView from '../../components/CameraView.js';
import {
  AvatarStage,
  SignLanguagePicker,
  SpeechLanguageSelect,
  SpeechPrivacyNote,
  Waveform,
} from '../../components/domain/index.js';
import { Badge, Button, Card, EmptyState, Icon, Modal, Notice, PageHeader, SwitchField } from '../../components/ui/index.js';
import { useHistory } from '../../hooks/useHistory.js';
import { useSignRecognition } from '../../hooks/useSignRecognition.js';
import { useSpeechInput } from '../../hooks/useSpeechInput.js';
import type { ConversationTurn } from '../../lib/history.js';
import { speak } from '../../lib/speech.js';
import { useSettings } from '../../state/settings.js';
import { useToast } from '../../state/toast.js';

/** Signs recognised within this gap join the signer's current turn instead of starting one. */
const TURN_GAP_MS = 8000;

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function Conversation() {
  const { settings, update } = useSettings();
  const { toast } = useToast();
  const { save } = useHistory();
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [typed, setTyped] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [speakSigns, setSpeakSigns] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const speakRef = useRef(speakSigns);
  speakRef.current = speakSigns;

  const addHearingTurn = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const gloss = translate(clean).glosses.join(' ');
    setTurns((current) => [...current, { speaker: 'hearing', text: clean, gloss, at: Date.now() }]);
  }, []);

  const speech = useSpeechInput({ lang: settings.sttLang, onFinal: addHearingTurn });

  const onAccept = useCallback(
    (label: string) => {
      const now = Date.now();
      setTurns((current) => {
        const last = current.at(-1);
        if (last && last.speaker === 'signer' && now - last.at <= TURN_GAP_MS) {
          return [...current.slice(0, -1), { ...last, text: `${last.text} ${label}`, at: now }];
        }
        return [...current, { speaker: 'signer', text: label, at: now }];
      });
      if (speakRef.current) speak(label, settings.ttsLang);
    },
    [settings.ttsLang],
  );

  const recognition = useSignRecognition({ onAccept });

  const lastHearing = useMemo(() => [...turns].reverse().find((turn) => turn.speaker === 'hearing'), [turns]);
  const plan = useMemo(
    () => (lastHearing ? translate(lastHearing.text, { speed: settings.playbackSpeed }).plan : []),
    [lastHearing, settings.playbackSpeed],
  );
  const latest = turns.at(-1);
  const alreadySaved = savedCount !== null && savedCount === turns.length;

  function saveSession() {
    const first = turns[0];
    save({
      kind: 'conversation',
      input: first ? first.text.slice(0, 80) : 'Conversation',
      output: `${turns.length} turns`,
      turns,
      language: settings.signLanguage,
    });
    setSavedCount(turns.length);
    toast('Conversation saved to your history.');
  }

  return (
    <>
      <PageHeader
        back={{ to: '/home', label: 'Back to home' }}
        eyebrow={
          <>
            <Icon name="conversation" /> Flagship
          </>
        }
        title="Live Conversation"
        subtitle="A hearing person speaks; a Deaf person signs. Each side sees the other in their own language, in one shared transcript."
        actions={<SignLanguagePicker compact />}
      />

      <div className="subtitle-bar" aria-live="polite" aria-atomic="true">
        {latest ? (
          <>
            <span className={`speaker-tag ${latest.speaker}`}>{latest.speaker === 'hearing' ? 'Hearing' : 'Signer'}</span>
            <span className="subtitle-text">{latest.text}</span>
          </>
        ) : (
          <span className="subtitle-text muted">Live subtitles appear here.</span>
        )}
      </div>

      <div className="conversation-grid">
        {/* ---------------------------------------------------------- hearing side */}
        <Card as="section" aria-labelledby="hearing-title" className="stack conv-side hearing">
          <div className="card-head">
            <h2 id="hearing-title">
              <Icon name="mic" /> Hearing person
            </h2>
            <Badge tone="accent">Voice → Sign</Badge>
          </div>

          <div className="voice-panel">
            <Waveform active={speech.listening} />
            <Button
              variant={speech.listening ? 'danger' : 'gradient'}
              icon={speech.listening ? 'stop' : 'mic'}
              onClick={speech.toggle}
              aria-pressed={speech.listening}
              disabled={!speech.supported}
              block
            >
              {speech.listening ? 'Stop listening' : 'Start listening'}
            </Button>
            <p className="small muted mb-0" aria-live="polite">
              {speech.listening ? (speech.partial ? `Hearing: “${speech.partial}”` : 'Listening…') : ''}
            </p>
            {speech.error && (
              <Notice tone="error" title="Speech problem" role="alert">
                {speech.error}
              </Notice>
            )}
          </div>

          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              addHearingTurn(typed);
              setTyped('');
            }}
          >
            <label htmlFor="conv-typed" className="sr-only">
              Or type what the hearing person says
            </label>
            <input
              id="conv-typed"
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={speech.supported ? 'Or type instead…' : 'Type what the hearing person says…'}
              style={{ flex: '1 1 12rem', width: 'auto' }}
            />
            <Button type="submit" icon="send" disabled={!typed.trim()}>
              Add
            </Button>
          </form>

          <AvatarStage plan={plan} autoPlay title="Signed for the Deaf person" showSpeed={false} />
        </Card>

        {/* ----------------------------------------------------------- signer side */}
        <Card as="section" aria-labelledby="signer-title" className="stack conv-side signer">
          <div className="card-head">
            <h2 id="signer-title">
              <Icon name="hand" /> Deaf person
            </h2>
            <Badge tone="accent">Sign → Voice + Text</Badge>
          </div>

          {recognition.untrained && (
            <Notice title="Teach it some signs first">
              The camera side only recognises signs this device has been taught.{' '}
              <Link to="/record">Record signs</Link>, then come back.
            </Notice>
          )}
          {recognition.loadError && (
            <Notice tone="error" title="Recognition unavailable" role="alert">
              {recognition.loadError}
            </Notice>
          )}

          {cameraOn ? (
            <CameraView
              onFrame={recognition.handleFrame}
              recording={recognition.capturing}
              badge={recognition.capturing ? '● Capturing sign…' : undefined}
            />
          ) : (
            <div className="camera camera-off">
              <EmptyState icon="camera" title="Camera is off" bare compact>
                Start it when the Deaf person is ready to sign.
              </EmptyState>
            </div>
          )}
          <div className="btn-group">
            <Button
              variant={cameraOn ? 'secondary' : 'gradient'}
              icon="camera"
              onClick={() => setCameraOn((on) => !on)}
            >
              {cameraOn ? 'Stop camera' : 'Start camera'}
            </Button>
          </div>
          <SwitchField
            label="Speak recognised signs aloud"
            checked={speakSigns}
            onChange={setSpeakSigns}
          />
          {recognition.rejected && (
            <p className="small muted mb-0" role="status">
              Last sign was unclear, so it was not added.
            </p>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------- transcript */}
      <Card as="section" aria-labelledby="transcript-title" className="section">
        <div className="card-head">
          <h2 id="transcript-title">Conversation history</h2>
          <div className="btn-group">
            <Button variant="primary" icon={alreadySaved ? 'bookmark-check' : 'bookmark'} onClick={saveSession} disabled={turns.length === 0 || alreadySaved}>
              {alreadySaved ? 'Saved' : 'Save session'}
            </Button>
            <Button variant="ghost" icon="trash" onClick={() => setConfirmClear(true)} disabled={turns.length === 0}>
              Clear
            </Button>
          </div>
        </div>

        {turns.length === 0 ? (
          <EmptyState icon="conversation" title="No messages yet" compact>
            Start listening on the left or start the camera on the right. Every turn appears here
            with a timestamp.
          </EmptyState>
        ) : (
          <ol className="transcript-list">
            {turns.map((turn, i) => (
              <li key={`${turn.at}-${i}`} className={`bubble ${turn.speaker}`}>
                <span className="bubble-meta">
                  {turn.speaker === 'hearing' ? 'Hearing person' : 'Deaf person (signed)'} · {timeLabel(turn.at)}
                </span>
                <span className="bubble-text">{turn.text}</span>
                {turn.gloss && <span className="bubble-gloss">ISL: {turn.gloss}</span>}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <details className="disclosure section">
        <summary>
          <Icon name="languages" /> Languages and privacy
          <Icon name="chevron" className="chev" />
        </summary>
        <div className="disclosure-body stack">
          <div className="grid-cards">
            <SpeechLanguageSelect label="Hearing person speaks" value={settings.sttLang} onChange={(sttLang) => update({ sttLang })} />
            <SpeechLanguageSelect label="Spoken voice for signs" value={settings.ttsLang} onChange={(ttsLang) => update({ ttsLang })} />
          </div>
          <SpeechPrivacyNote />
          <Notice tone="warn" title="What this can and cannot do">
            The signing side recognises one sign at a time from the vocabulary taught on this device
            and joins them into a turn. It is not continuous sign-language translation and not a
            substitute for an interpreter.
          </Notice>
        </div>
      </details>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear this conversation?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                setTurns([]);
                setSavedCount(null);
                recognition.clear();
                setConfirmClear(false);
              }}
            >
              Clear
            </Button>
          </>
        }
      >
        <p className="mb-0">
          This removes the {turns.length} turns on screen. {alreadySaved ? 'Your saved copy stays in History.' : 'It has not been saved.'}
        </p>
      </Modal>
    </>
  );
}
