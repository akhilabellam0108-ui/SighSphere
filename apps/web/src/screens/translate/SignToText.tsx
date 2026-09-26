/**
 * Sign → Text and Sign → Voice.
 *
 * Recognition is the original loop, now in hooks/useSignRecognition.ts: auto-segment signs
 * from motion, classify, and only accept a prediction above the rejection threshold. Below
 * that it says "not sure" — an accessibility tool that guesses confidently is worse than one
 * that admits uncertainty.
 */

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import CameraView from '../../components/CameraView.js';
import { ConfidenceList, SignLanguagePicker } from '../../components/domain/index.js';
import { Badge, Button, Card, EmptyState, Icon, Notice, PageHeader, Segmented } from '../../components/ui/index.js';
import { useAutoRecord, useHistory } from '../../hooks/useHistory.js';
import { useSignRecognition, type RecognitionMode } from '../../hooks/useSignRecognition.js';
import { copyText } from '../../lib/share.js';
import { speak } from '../../lib/speech.js';
import { useSettings } from '../../state/settings.js';
import { useToast } from '../../state/toast.js';

export interface SignToTextProps {
  speakOutput: boolean;
}

export default function SignToText({ speakOutput }: SignToTextProps) {
  const { settings } = useSettings();
  const { toast } = useToast();
  const { save } = useHistory();
  const [mode, setMode] = useState<RecognitionMode>('continuous');
  const [cameraOn, setCameraOn] = useState(true);

  const onAccept = useCallback(
    (label: string) => {
      if (speakOutput) speak(label, settings.ttsLang);
    },
    [speakOutput, settings.ttsLang],
  );

  const recognition = useSignRecognition({ mode, onAccept });
  const { classifier, untrained, sentence, predictions, rejected, capturing, armed, threshold } = recognition;
  const sentenceText = sentence.join(' ');
  const kind = speakOutput ? 'sign-to-voice' : 'sign-to-text';

  useAutoRecord(sentenceText ? { kind, input: sentenceText, output: sentenceText, language: settings.signLanguage } : null);

  const badge =
    mode === 'capture'
      ? armed
        ? capturing
          ? '● Capturing sign…'
          : 'Ready — sign now'
        : 'Press Capture to sign'
      : capturing
        ? '● Capturing sign…'
        : undefined;

  return (
    <>
      <PageHeader
        back={{ to: '/home', label: 'Back to home' }}
        eyebrow={
          <>
            <Icon name="camera" /> Translate
          </>
        }
        title={speakOutput ? 'Sign → Voice' : 'Sign → Text'}
        subtitle="Sign to the camera. Start moving to begin a sign, then hold still briefly to finish it. Video never leaves this device."
        actions={<SignLanguagePicker compact />}
      />

      {untrained && (
        <Notice title="No signs recorded yet">
          Recognition needs examples first. Go to <Link to="/profile/teach">Teach a sign</Link> and
          capture 5 takes each of a few signs, then come back. It works immediately — no training run
          required.
        </Notice>
      )}

      {recognition.loadError && (
        <Notice tone="error" title="Recognition unavailable" role="alert">
          {recognition.loadError}
        </Notice>
      )}

      <div className="split">
        <section aria-label="Camera" className="stack">
          {cameraOn ? (
            <CameraView onFrame={recognition.handleFrame} recording={capturing} badge={badge} />
          ) : (
            <div className="camera camera-off">
              <EmptyState icon="camera" title="Camera is off" bare compact>
                Nothing is being processed.
              </EmptyState>
            </div>
          )}
          <div className="camera-controls">
            <Segmented<RecognitionMode>
              legend="Recognition mode"
              hideLegend
              value={mode}
              onChange={setMode}
              options={[
                { value: 'continuous', label: 'Continuous' },
                { value: 'capture', label: 'One sign at a time' },
              ]}
            />
            <span className="spacer" />
            {mode === 'capture' && (
              <Button
                variant="gradient"
                icon="record"
                onClick={recognition.arm}
                disabled={!cameraOn || armed || untrained}
              >
                {armed ? 'Waiting for sign…' : 'Capture'}
              </Button>
            )}
            <Button variant="ghost" icon={cameraOn ? 'eye' : 'camera'} onClick={() => setCameraOn((on) => !on)}>
              {cameraOn ? 'Stop camera' : 'Start camera'}
            </Button>
          </div>
        </section>

        <Card as="section" aria-label="Recognition" className="stack">
          <div>
            <div className="card-head">
              <h2 className="small">Recognised {speakOutput ? 'speech' : 'text'}</h2>
              {classifier && classifier.labels.length > 0 && (
                <Badge tone="accent">{classifier.labels.length} signs known</Badge>
              )}
            </div>
            <p className="transcript" aria-live="polite">
              {sentenceText || <span className="muted">Nothing yet.</span>}
            </p>
            <div className="btn-group">
              {speakOutput ? (
                <>
                  <Button variant="primary" icon="volume" onClick={() => speak(sentenceText, settings.ttsLang)} disabled={!sentenceText}>
                    Speak
                  </Button>
                  <Button
                    icon="replay"
                    onClick={() => {
                      const last = sentence.at(-1);
                      if (last) speak(last, settings.ttsLang);
                    }}
                    disabled={sentence.length === 0}
                  >
                    Replay last
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  icon="copy"
                  onClick={() => void copyText(sentenceText).then((ok) => toast(ok ? 'Text copied.' : 'Could not copy on this device.'))}
                  disabled={!sentenceText}
                >
                  Copy
                </Button>
              )}
              <Button
                icon="bookmark"
                onClick={() => {
                  save({ kind, input: sentenceText, output: sentenceText, language: settings.signLanguage });
                  toast('Saved to your history.');
                }}
                disabled={!sentenceText}
              >
                Save
              </Button>
              {!speakOutput && (
                <Button variant="ghost" icon="volume" onClick={() => speak(sentenceText, settings.ttsLang)} disabled={!sentenceText}>
                  Speak
                </Button>
              )}
              <Button variant="ghost" icon="undo" onClick={recognition.undo} disabled={sentence.length === 0}>
                Undo
              </Button>
              <Button variant="ghost" icon="close" onClick={recognition.clear} disabled={sentence.length === 0}>
                Clear
              </Button>
            </div>
          </div>

          <div>
            <h2 className="small">Confidence</h2>
            <ConfidenceList predictions={predictions} />
            {rejected && (
              <Notice tone="warn" title="Not sure about that one">
                Confidence was below {Math.round(threshold * 100)}%, so nothing was added. Try signing
                a little slower, with both hands fully in frame.
              </Notice>
            )}
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
        </Card>
      </div>
    </>
  );
}
