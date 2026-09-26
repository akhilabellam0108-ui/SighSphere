/**
 * Text → Sign and Voice → Sign. One component, two input modes: the translation pipeline
 * after the input is identical, so duplicating it would just mean two places to fix bugs.
 *
 * The translation itself is unchanged: `translate()` from @signsphere/gloss, played by the
 * existing SignPlayer (framed by AvatarStage). This screen adds the product around it:
 * language picker, save / share / copy, history, and a live waveform for voice input.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { translate } from '@signsphere/gloss';
import {
  AvatarStage,
  GlossChips,
  SignLanguagePicker,
  SpeechPrivacyNote,
  Waveform,
} from '../../components/domain/index.js';
import { Badge, Button, Card, Icon, Notice, PageHeader } from '../../components/ui/index.js';
import { useSpeechInput } from '../../hooks/useSpeechInput.js';
import { useAutoRecord, useHistory } from '../../hooks/useHistory.js';
import type { HistoryKind } from '../../lib/history.js';
import { copyText, shareMessage, shareText } from '../../lib/share.js';
import { useSettings } from '../../state/settings.js';
import { useToast } from '../../state/toast.js';

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
  const { settings } = useSettings();
  const { toast } = useToast();
  const { save } = useHistory();
  const [params] = useSearchParams();
  const [text, setText] = useState(() => params.get('text') ?? '');
  const [savedFor, setSavedFor] = useState<string | null>(null);

  const speech = useSpeechInput({
    lang: settings.sttLang,
    onFinal: (final) => setText((previous) => (previous ? `${previous} ${final}` : final)),
  });

  const result = useMemo(() => translate(text, { speed: settings.playbackSpeed }), [text, settings.playbackSpeed]);
  const glossText = result.glosses.join(' ');
  const kind: HistoryKind = mode === 'voice' ? 'voice-to-sign' : 'text-to-sign';

  useAutoRecord(text.trim() ? { kind, input: text, output: glossText, language: settings.signLanguage } : null);

  const isSaved = savedFor !== null && savedFor === `${text}|${glossText}`;
  const hasOutput = result.glosses.length > 0;

  function onSave() {
    save({ kind, input: text, output: glossText, language: settings.signLanguage });
    setSavedFor(`${text}|${glossText}`);
    toast('Saved to your history.');
  }

  async function onShare() {
    const outcome = await shareText('SignSphere translation', `${text.trim()}\nISL gloss: ${glossText}`);
    const message = shareMessage(outcome);
    if (message) toast(message);
  }

  async function onCopy() {
    toast((await copyText(glossText)) ? 'Gloss copied.' : 'Could not copy on this device.');
  }

  return (
    <>
      <PageHeader
        back={{ to: '/home', label: 'Back to home' }}
        eyebrow={
          <>
            <Icon name={mode === 'voice' ? 'mic' : 'keyboard'} /> Translate
          </>
        }
        title={mode === 'voice' ? 'Voice → Sign' : 'Text → Sign'}
        subtitle={
          mode === 'voice'
            ? 'Speak, and see it in sign-language order. You can edit the transcript before playing.'
            : 'Type English and see it in sign-language order. Words with no sign are fingerspelled.'
        }
        actions={<SignLanguagePicker compact />}
      />

      <div className="split">
        <Card as="section" aria-label="Input" className="stack">
          {mode === 'voice' && (
            <div className="voice-panel">
              <Waveform active={speech.listening} />
              <Button
                variant={speech.listening ? 'danger' : 'gradient'}
                size="lg"
                icon={speech.listening ? 'stop' : 'mic'}
                onClick={speech.toggle}
                aria-pressed={speech.listening}
                disabled={!speech.supported}
              >
                {speech.listening ? 'Stop listening' : 'Start listening'}
              </Button>
              <p className="small muted mb-0" aria-live="polite">
                {speech.listening
                  ? speech.partial
                    ? `Hearing: “${speech.partial}”`
                    : 'Listening…'
                  : speech.supported
                    ? 'Press start and speak clearly.'
                    : ''}
              </p>
              {!speech.supported && (
                <Notice tone="warn" title="Speech recognition unavailable">
                  This browser cannot transcribe speech. Chrome or Edge can; or type below —
                  everything else works the same.
                </Notice>
              )}
              {speech.error && (
                <Notice tone="error" title="Speech problem" role="alert">
                  {speech.error}
                </Notice>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="source-text">{mode === 'voice' ? 'Transcript' : 'English text'}</label>
            <textarea
              id="source-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={mode === 'voice' ? 'Your words appear here as you speak…' : 'Type a sentence, e.g. Where is the school?'}
              rows={4}
              aria-describedby="source-hint"
            />
            <p className="hint" id="source-hint">
              English word order is converted to sign order — the output is deliberately not a
              word-for-word match.
            </p>
          </div>

          <div>
            <h2 className="small">Try an example</h2>
            <div className="row">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip" onClick={() => setText(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>

          {text && (
            <Button variant="ghost" size="sm" icon="close" onClick={() => setText('')}>
              Clear text
            </Button>
          )}

          {mode === 'voice' && <SpeechPrivacyNote />}
        </Card>

        <Card as="section" aria-label="Sign output" className="stack">
          <div>
            <div className="card-head">
              <h2 className="small">Sign order (gloss)</h2>
              {result.unknown.length > 0 && (
                <Badge tone="warning" icon="type">
                  {result.unknown.length} fingerspelled
                </Badge>
              )}
            </div>
            <GlossChips tokens={result.tokens} />
            {hasOutput && (
              <p className="hint">Dashed = fingerspelled. “?” = not yet checked by a fluent signer.</p>
            )}
          </div>

          <AvatarStage plan={result.plan} />

          <div className="btn-group">
            <Button variant="primary" icon={isSaved ? 'bookmark-check' : 'bookmark'} onClick={onSave} disabled={!hasOutput || isSaved}>
              {isSaved ? 'Saved' : 'Save'}
            </Button>
            <Button icon="share" onClick={() => void onShare()} disabled={!hasOutput}>
              Share
            </Button>
            <Button variant="ghost" icon="copy" onClick={() => void onCopy()} disabled={!hasOutput}>
              Copy gloss
            </Button>
          </div>

          {result.unknown.length > 0 && (
            <Notice tone="warn" title={`${result.unknown.length} word(s) have no sign yet`}>
              {result.unknown.join(', ')} — these get fingerspelled. Signs are added to the lexicon at{' '}
              <code>packages/gloss/lexicon/isl-core.json</code>.
            </Notice>
          )}
        </Card>
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
