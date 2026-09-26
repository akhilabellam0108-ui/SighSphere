/**
 * Accessibility Tools: four small tools built on the existing speech layer (lib/speech.ts
 * via hooks/useSpeechInput), plus the shared display settings.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AccessibilitySettings from '../../components/domain/AccessibilitySettings.js';
import { SpeechLanguageSelect, SpeechPrivacyNote, Waveform } from '../../components/domain/index.js';
import {
  Button,
  Card,
  Icon,
  Notice,
  PageHeader,
  SliderField,
  TabPanel,
  Tabs,
  TextAreaField,
} from '../../components/ui/index.js';
import { useSpeechInput } from '../../hooks/useSpeechInput.js';
import { copyText } from '../../lib/share.js';
import { splitSentences } from '../../lib/text.js';
import { isSpeechSynthesisSupported, speak, stopSpeaking } from '../../lib/speech.js';
import { useSettings } from '../../state/settings.js';
import { useToast } from '../../state/toast.js';

type Tool = 'captions' | 'stt' | 'tts' | 'reader';

const TOOLS: ReadonlyArray<{ id: Tool; label: string }> = [
  { id: 'captions', label: 'Live captions' },
  { id: 'stt', label: 'Speech-to-Text' },
  { id: 'tts', label: 'Text-to-Speech' },
  { id: 'reader', label: 'Reading assistant' },
];

// ------------------------------------------------------------------------ live captions

function LiveCaptions() {
  const { settings, update } = useSettings();
  const [lines, setLines] = useState<string[]>([]);
  const [big, setBig] = useState(false);
  const onFinal = useCallback((text: string) => setLines((current) => [...current.slice(-49), text]), []);
  const speech = useSpeechInput({ lang: settings.sttLang, onFinal });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [lines, speech.partial]);

  return (
    <div className="stack">
      <p className="muted mb-0">Captions for whatever is said near you — a lecture, a counter, a conversation.</p>
      <div className={big ? 'caption-screen big' : 'caption-screen'} aria-live="polite">
        {lines.length === 0 && !speech.partial ? (
          <p className="caption-placeholder">Captions appear here.</p>
        ) : (
          <>
            {lines.map((line, i) => (
              <p key={i} className="caption-line">
                {line}
              </p>
            ))}
            {speech.partial && <p className="caption-line partial">{speech.partial}</p>}
          </>
        )}
        <div ref={endRef} />
      </div>
      <Waveform active={speech.listening} />
      <div className="btn-group">
        <Button variant={speech.listening ? 'danger' : 'gradient'} icon={speech.listening ? 'stop' : 'captions'} onClick={speech.toggle} disabled={!speech.supported}>
          {speech.listening ? 'Stop captions' : 'Start captions'}
        </Button>
        <Button icon="text-size" onClick={() => setBig((value) => !value)} aria-pressed={big}>
          {big ? 'Normal size' : 'Extra large'}
        </Button>
        <Button variant="ghost" icon="trash" onClick={() => setLines([])} disabled={lines.length === 0}>
          Clear
        </Button>
      </div>
      {!speech.supported && (
        <Notice tone="warn" title="Speech recognition unavailable">
          This browser cannot transcribe speech. Chrome or Edge can.
        </Notice>
      )}
      {speech.error && (
        <Notice tone="error" title="Speech problem" role="alert">
          {speech.error}
        </Notice>
      )}
      <div className="grid-cards">
        <SpeechLanguageSelect label="Language being spoken" value={settings.sttLang} onChange={(sttLang) => update({ sttLang })} />
      </div>
      <SpeechPrivacyNote />
    </div>
  );
}

// ----------------------------------------------------------------------- speech-to-text

function SpeechToText() {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const speech = useSpeechInput({
    lang: settings.sttLang,
    onFinal: (final) => setText((previous) => (previous ? `${previous} ${final}` : final)),
  });
  return (
    <div className="stack">
      <p className="muted mb-0">Dictate a note or a message, edit it, and copy it anywhere.</p>
      <Waveform active={speech.listening} />
      <div className="btn-group">
        <Button variant={speech.listening ? 'danger' : 'gradient'} icon={speech.listening ? 'stop' : 'mic'} onClick={speech.toggle} disabled={!speech.supported}>
          {speech.listening ? 'Stop' : 'Start dictation'}
        </Button>
      </div>
      {speech.partial && (
        <p className="small muted mb-0" aria-live="polite">
          Hearing: “{speech.partial}”
        </p>
      )}
      {speech.error && (
        <Notice tone="error" title="Speech problem" role="alert">
          {speech.error}
        </Notice>
      )}
      <TextAreaField label="Transcript" value={text} onChange={(event) => setText(event.target.value)} rows={6} placeholder="Your words appear here…" />
      <div className="btn-group">
        <Button variant="primary" icon="copy" disabled={!text} onClick={() => void copyText(text).then((ok) => toast(ok ? 'Copied.' : 'Could not copy on this device.'))}>
          Copy
        </Button>
        <Button variant="ghost" icon="trash" disabled={!text} onClick={() => setText('')}>
          Clear
        </Button>
      </div>
      <SpeechPrivacyNote />
    </div>
  );
}

// ----------------------------------------------------------------------- text-to-speech

const QUICK_PHRASES = ['Hello, I am deaf.', 'Please write it down.', 'Thank you!', 'Can you speak slowly?', 'One moment please.'];

function TextToSpeech() {
  const { settings, update } = useSettings();
  const [text, setText] = useState('');
  const [rate, setRate] = useState(0.95);
  const supported = isSpeechSynthesisSupported();
  return (
    <div className="stack">
      <p className="muted mb-0">Type, and let the device say it for you. Works offline with the voices installed on this device.</p>
      {!supported && (
        <Notice tone="warn" title="Speech output unavailable">
          This browser cannot speak text aloud.
        </Notice>
      )}
      <div className="row">
        {QUICK_PHRASES.map((phrase) => (
          <button key={phrase} type="button" className="chip" onClick={() => speak(phrase, settings.ttsLang, rate)} disabled={!supported}>
            <Icon name="volume" /> {phrase}
          </button>
        ))}
      </div>
      <TextAreaField label="What should be said?" value={text} onChange={(event) => setText(event.target.value)} rows={4} />
      <SliderField
        label={`Speaking rate: ${rate.toFixed(2)}×`}
        value={rate}
        min={0.5}
        max={1.5}
        step={0.05}
        valueText={`${rate.toFixed(2)} times`}
        onChange={setRate}
      />
      <div className="grid-cards">
        <SpeechLanguageSelect label="Voice language" value={settings.ttsLang} onChange={(ttsLang) => update({ ttsLang })} />
      </div>
      <div className="btn-group">
        <Button variant="gradient" icon="volume" disabled={!supported || !text.trim()} onClick={() => speak(text, settings.ttsLang, rate)}>
          Speak
        </Button>
        <Button variant="ghost" icon="stop" disabled={!supported} onClick={stopSpeaking}>
          Stop
        </Button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- reading assistant

function ReadingAssistant() {
  const { settings } = useSettings();
  const [text, setText] = useState('');
  const [index, setIndex] = useState(0);
  const [reading, setReading] = useState(false);
  const sentences = useMemo(() => splitSentences(text), [text]);
  const current = sentences[index];
  const supported = isSpeechSynthesisSupported();

  useEffect(() => {
    setIndex(0);
  }, [text]);

  return (
    <div className="stack">
      <p className="muted mb-0">Paste any text. It is shown one sentence at a time, large, and can be read aloud.</p>
      {!reading ? (
        <>
          <TextAreaField label="Text to read" value={text} onChange={(event) => setText(event.target.value)} rows={6} placeholder="Paste a notice, a form, a message…" />
          <div>
            <Button variant="gradient" icon="reader" disabled={sentences.length === 0} onClick={() => setReading(true)}>
              Start reading ({sentences.length} sentence{sentences.length === 1 ? '' : 's'})
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="reader-view" aria-live="polite">
            <p className="reader-count">
              Sentence {index + 1} of {sentences.length}
            </p>
            <p className="reader-sentence">{current}</p>
          </div>
          <div className="btn-group">
            <Button icon="prev" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              Previous
            </Button>
            <Button variant="primary" icon="volume" disabled={!supported || !current} onClick={() => current && speak(current, settings.ttsLang)}>
              Read aloud
            </Button>
            <Button iconRight="next" onClick={() => setIndex((i) => Math.min(sentences.length - 1, i + 1))} disabled={index >= sentences.length - 1}>
              Next
            </Button>
            <Button variant="ghost" icon="close" onClick={() => setReading(false)}>
              Edit text
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------ screen

export default function AccessibilityTools() {
  const [tool, setTool] = useState<Tool>('captions');
  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Icon name="accessibility" /> Tools
          </>
        }
        title="Accessibility Tools"
        subtitle="Captions, dictation, a speaking voice and a reading aid — plus the display settings for the whole app."
      />

      <div className="split">
        <Card as="section" aria-label="Tools">
          <Tabs<Tool> label="Accessibility tools" idPrefix="a11y-tools" items={TOOLS} value={tool} onChange={setTool} />
          <TabPanel idPrefix="a11y-tools" activeId={tool}>
            {tool === 'captions' && <LiveCaptions />}
            {tool === 'stt' && <SpeechToText />}
            {tool === 'tts' && <TextToSpeech />}
            {tool === 'reader' && <ReadingAssistant />}
          </TabPanel>
        </Card>

        <Card as="section" aria-labelledby="display-settings">
          <h2 id="display-settings">Display and interaction</h2>
          <p className="small muted">Applies to every screen, immediately.</p>
          <AccessibilitySettings />
        </Card>
      </div>
    </>
  );
}
