/**
 * Small SignSphere-specific components shared across screens. Each wraps existing engine
 * pieces (SignPlayer, gloss tokens, predictions) with the product's visual language.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GlossToken, RenderToken } from '@signsphere/gloss';
import SignPlayer from '../SignPlayer.js';
import type { Prediction } from '../../lib/classifier.js';
import { SIGN_LANGUAGES, SPEECH_LANGUAGES, getLanguage } from '../../lib/languages.js';
import { KIND_LABEL, KIND_ROUTE, type HistoryEntry } from '../../lib/history.js';
import { useSettings } from '../../state/settings.js';
import { Badge, Icon, IconButton, SliderField } from '../ui/index.js';

// --------------------------------------------------------------------------- BrandMark

/** The logo: a sphere with an orbit around an open hand. Mirrors public/icon.svg. */
export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="0.55" stopColor="#4338ca" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#g${id})`} />
      <circle cx="256" cy="256" r="164" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="12" />
      <ellipse
        cx="256"
        cy="256"
        rx="164"
        ry="62"
        fill="none"
        stroke="#67e8f9"
        strokeOpacity="0.75"
        strokeWidth="12"
        transform="rotate(-24 256 256)"
      />
      <g fill="none" stroke="#fff" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round">
        <path d="M188 330V206a22 22 0 0 1 44 0v104" />
        <path d="M232 226v-40a22 22 0 0 1 44 0v124" />
        <path d="M276 236v-30a22 22 0 0 1 44 0v104c0 44-30 74-74 74s-78-30-78-74v-30" />
      </g>
      <circle cx="404" cy="190" r="16" fill="#67e8f9" />
      <circle cx="110" cy="324" r="12" fill="#5eead4" />
    </svg>
  );
}

export function Brand({ to = '/home', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={['brand', className ?? ''].filter(Boolean).join(' ')} aria-label="SignSphere home">
      <BrandMark />
      <span className="brand-name">
        Sign<b>Sphere</b>
      </span>
    </Link>
  );
}

// ------------------------------------------------------------------------- AvatarStage

export interface AvatarStageProps {
  plan: RenderToken[];
  autoPlay?: boolean;
  /** Show the playback speed slider under the player. */
  showSpeed?: boolean;
  title?: string;
  footer?: ReactNode;
}

/**
 * The "sign avatar" area. There is no generative avatar (PLAN.md §0): this frames the
 * existing SignPlayer, which plays real signer clips when they exist and an honest gloss
 * card when they do not. The status badge says which one the user is looking at.
 */
export function AvatarStage({ plan, autoPlay, showSpeed = true, title = 'Sign output', footer }: AvatarStageProps) {
  const { settings, update } = useSettings();
  const language = getLanguage(settings.signLanguage);
  const hasSigns = plan.some((token) => token.kind !== 'pause');
  const hasVideo = plan.some((token) => token.kind === 'sign' && Boolean(token.clip));
  return (
    <div className="avatar-stage">
      <div className="avatar-stage-head">
        <h2 className="small" style={{ margin: 0 }}>
          {title}
        </h2>
        <span className="row" style={{ gap: '0.35rem' }}>
          <Badge tone="accent">{language.short}</Badge>
          {hasSigns && (
            <Badge tone={hasVideo ? 'success' : 'warning'} icon={hasVideo ? 'video' : 'type'}>
              {hasVideo ? 'Signer video' : 'Gloss preview'}
            </Badge>
          )}
        </span>
      </div>
      <SignPlayer plan={plan} autoPlay={autoPlay} />
      {showSpeed && (
        <SliderField
          label={`Playback speed: ${settings.playbackSpeed.toFixed(2)}×`}
          value={settings.playbackSpeed}
          min={0.4}
          max={1.4}
          step={0.05}
          valueText={`${settings.playbackSpeed.toFixed(2)} times`}
          onChange={(value) => update({ playbackSpeed: value })}
          hint="Learners usually want 0.6–0.8×."
        />
      )}
      {footer}
    </div>
  );
}

// -------------------------------------------------------------------------- GlossChips

export function GlossChips({ tokens }: { tokens: GlossToken[] }) {
  if (tokens.length === 0) return <span className="muted small">—</span>;
  return (
    <div className="gloss-row">
      {tokens.map((token, i) => (
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
  );
}

// ---------------------------------------------------------------------- ConfidenceList

export function ConfidenceList({ predictions, empty = 'Sign something to see predictions.' }: { predictions: Prediction[]; empty?: string }) {
  if (predictions.length === 0) return <p className="muted small mb-0">{empty}</p>;
  return (
    <div className="prediction">
      {predictions.map((prediction) => {
        const pct = Math.round(prediction.confidence * 100);
        return (
          <div className="prediction-row" key={prediction.label}>
            <span>{prediction.label}</span>
            <span className="meter" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
            {/* Percentage in text as well as the bar — never colour/length alone. */}
            <span className="small muted">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------- Waveform

const BARS = 24;

/**
 * Live microphone level. Opens its own audio stream only while `active`, purely to draw the
 * bars — nothing is recorded or sent anywhere. If the level cannot be read (permission,
 * unsupported browser) the bars stay flat rather than faking movement.
 */
export function Waveform({ active }: { active: boolean }) {
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setLevels(Array(BARS).fill(0.08));
      return;
    }
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let cancelled = false;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        context = new Ctor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let last = 0;
        const loop = (time: number) => {
          rafRef.current = requestAnimationFrame(loop);
          if (time - last < 60) return;
          last = time;
          analyser.getByteFrequencyData(data);
          const next: number[] = [];
          for (let i = 0; i < BARS; i += 1) {
            const value = data[Math.floor((i / BARS) * data.length * 0.7)] ?? 0;
            next.push(Math.max(0.08, value / 255));
          }
          setLevels(next);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        /* no level available — bars stay flat */
      }
    }
    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [active]);

  return (
    <div className="waveform" aria-hidden="true">
      {levels.map((level, i) => (
        <span key={i} style={{ height: `${Math.round(level * 100)}%` }} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ SignLanguagePicker

export function SignLanguagePicker({ compact }: { compact?: boolean }) {
  const { settings, update } = useSettings();
  const id = useId();
  return (
    <div className={compact ? 'lang-picker compact' : 'lang-picker'}>
      <label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        Sign language
      </label>
      <select id={id} value={getLanguage(settings.signLanguage).code} onChange={(event) => update({ signLanguage: event.target.value })}>
        {SIGN_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} disabled={language.status !== 'available'}>
            {language.short} · {language.name}
            {language.status !== 'available' ? ' (coming soon)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SpeechLanguageSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {SPEECH_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ------------------------------------------------------------------ SpeechPrivacyNote

export function SpeechPrivacyNote() {
  return (
    <div className="notice warn">
      <strong>Microphone privacy</strong>
      Unlike the camera, speech recognition in most browsers sends your audio to the browser
      vendor&rsquo;s servers for transcription. If that matters to you, type instead.
    </div>
  );
}

// -------------------------------------------------------------------------- HistoryList

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const KIND_ICON = {
  'text-to-sign': 'keyboard',
  'voice-to-sign': 'mic',
  'sign-to-text': 'camera',
  'sign-to-voice': 'volume',
  conversation: 'conversation',
} as const;

export interface HistoryListProps {
  entries: HistoryEntry[];
  onToggleSaved?(id: string): void;
  onDelete?(id: string): void;
  onOpen?(entry: HistoryEntry): void;
  compact?: boolean;
}

export function HistoryList({ entries, onToggleSaved, onDelete, onOpen, compact }: HistoryListProps) {
  return (
    <ul className="list">
      {entries.map((entry) => {
        const title = entry.kind === 'conversation' ? entry.input || 'Conversation' : entry.input || entry.output;
        const detail =
          entry.kind === 'conversation'
            ? `${entry.turns?.length ?? 0} turns`
            : entry.output && entry.output !== entry.input
              ? entry.output
              : '';
        return (
          <li key={entry.id} className="list-item">
            <span className="icon-tile" aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12 }}>
              <Icon name={KIND_ICON[entry.kind]} />
            </span>
            <div className="list-item-main">
              {onOpen ? (
                <button type="button" className="link-button list-item-title" onClick={() => onOpen(entry)}>
                  {title}
                </button>
              ) : (
                <p className="list-item-title">{title}</p>
              )}
              {!compact && detail && <p className="small muted" style={{ overflowWrap: 'anywhere' }}>{detail}</p>}
              <p className="list-item-meta">
                <Link to={KIND_ROUTE[entry.kind]}>{KIND_LABEL[entry.kind]}</Link> · {relativeTime(entry.updatedAt)}
                {entry.saved && ' · Saved'}
              </p>
            </div>
            {(onToggleSaved || onDelete) && (
              <div className="list-item-actions">
                {onToggleSaved && (
                  <IconButton
                    icon={entry.saved ? 'bookmark-check' : 'bookmark'}
                    label={entry.saved ? `Unsave “${title}”` : `Save “${title}”`}
                    aria-pressed={entry.saved}
                    onClick={() => onToggleSaved(entry.id)}
                  />
                )}
                {onDelete && <IconButton icon="trash" label={`Delete “${title}”`} onClick={() => onDelete(entry.id)} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------ SOS

export function SOSLink({ compact }: { compact?: boolean }) {
  return (
    <Link to="/emergency" className={['btn', 'btn-sos', compact ? 'btn-sm' : ''].filter(Boolean).join(' ')}>
      <Icon name="sos" />
      <span className={compact ? 'sos-label' : undefined}>SOS</span>
      <span className="sr-only"> — emergency help</span>
    </Link>
  );
}
