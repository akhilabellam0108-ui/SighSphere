/**
 * Plays a gloss render plan: signer clips where we have them, gloss placeholders where we
 * do not, letter-by-letter fingerspelling for unknown words.
 *
 * The placeholder state matters as much as the video state. The seed lexicon has no clips,
 * so this component's honest "no clip recorded yet" card is what users will actually see
 * until Week 5 — make sure it stays informative rather than looking like a bug.
 */

import { useEffect, useMemo, useState } from 'react';
import type { RenderToken } from '@signsphere/gloss';
import { asset } from '../lib/base.js';

const CLIP_BASE = import.meta.env['VITE_CLIP_BASE_URL'] ?? asset('clips');

export interface SignPlayerProps {
  plan: RenderToken[];
  autoPlay?: boolean;
}

export default function SignPlayer({ plan, autoPlay = false }: SignPlayerProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [letterIndex, setLetterIndex] = useState(0);

  // Restart whenever the plan actually changes content (not just identity).
  const signature = useMemo(
    () => plan.map((t) => (t.kind === 'pause' ? '·' : t.gloss)).join('|'),
    [plan],
  );
  useEffect(() => {
    setIndex(0);
    setLetterIndex(0);
    setPlaying(autoPlay && plan.length > 0);
  }, [signature, autoPlay, plan.length]);

  const token = plan[index];

  // Advance through the plan.
  useEffect(() => {
    if (!playing) return;
    if (!token) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), token.durationMs);
    return () => clearTimeout(timer);
  }, [playing, index, token]);

  // Step through letters inside a fingerspelled token.
  useEffect(() => {
    if (!playing || token?.kind !== 'fingerspell') {
      setLetterIndex(0);
      return;
    }
    const perLetter = Math.max(120, token.durationMs / Math.max(1, token.letters.length));
    const interval = setInterval(() => setLetterIndex((i) => i + 1), perLetter);
    return () => clearInterval(interval);
  }, [playing, token]);

  const signTokens = plan.filter((t) => t.kind !== 'pause');
  const signPosition = plan.slice(0, index + 1).filter((t) => t.kind !== 'pause').length;
  const finished = index >= plan.length;

  return (
    <div className="stack">
      <div className="stage">{renderStage(token, letterIndex, finished, plan.length === 0)}</div>

      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (finished) setIndex(0);
            setPlaying((p) => (finished ? true : !p));
          }}
          disabled={plan.length === 0}
        >
          {finished ? '↻ Play again' : playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setIndex((i) => Math.max(0, i - 1));
          }}
          disabled={index === 0}
        >
          ⏮ Previous
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setIndex((i) => Math.min(plan.length, i + 1));
          }}
          disabled={finished}
        >
          ⏭ Next
        </button>
        {signTokens.length > 0 && (
          <span className="small muted">
            Sign {Math.min(signPosition, signTokens.length)} of {signTokens.length}
          </span>
        )}
      </div>

      {/* Live region so a screen-reader user can follow along with playback. */}
      <p className="sr-only" role="status" aria-live="polite">
        {token && token.kind !== 'pause' ? token.gloss : ''}
      </p>
    </div>
  );
}

function renderStage(
  token: RenderToken | undefined,
  letterIndex: number,
  finished: boolean,
  empty: boolean,
) {
  if (empty) {
    return (
      <div className="placeholder muted">
        <div className="big">—</div>
        <p className="small">Nothing to sign yet.</p>
      </div>
    );
  }
  if (!token || finished) {
    return (
      <div className="placeholder muted">
        <div className="big">✓</div>
        <p className="small">Finished.</p>
      </div>
    );
  }

  if (token.kind === 'pause') {
    return <div className="placeholder muted small">…</div>;
  }

  if (token.kind === 'fingerspell') {
    const current = Math.min(letterIndex, token.letters.length - 1);
    return (
      <div className="placeholder">
        <div className="big">{token.letters[current] ?? ''}</div>
        <p className="gloss-row" style={{ justifyContent: 'center' }}>
          {token.letters.map((letter, i) => (
            <span key={`${letter}-${i}`} className={`chip${i === current ? ' active' : ''}`}>
              {letter}
            </span>
          ))}
        </p>
        <p className="small muted">
          Fingerspelling &ldquo;{token.source}&rdquo; — no sign for this word in the lexicon.
        </p>
      </div>
    );
  }

  if (token.clip) {
    return (
      <video
        key={token.clip}
        src={`${CLIP_BASE}/${token.clip}`}
        autoPlay
        muted
        playsInline
        aria-label={`Sign for ${token.gloss}`}
      />
    );
  }

  return (
    <div className="placeholder">
      <div className="big">{token.gloss}</div>
      <p className="small muted">
        No signer clip recorded yet — showing the gloss as text.
        {!token.reviewed && ' This gloss has not been checked by a fluent signer.'}
      </p>
    </div>
  );
}
