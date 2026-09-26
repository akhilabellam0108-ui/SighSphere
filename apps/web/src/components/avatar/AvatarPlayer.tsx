/**
 * AvatarPlayer — the 3D avatar signing a gloss plan.
 *
 * For each sign it plays the real signer motion stored for that gloss (a recording made on
 * this device, or the INCLUDE dataset). Signs with no motion yet are shown as a captioned
 * pause so the sentence order still reads correctly, and the UI says which ones are missing.
 * Without WebGL it falls back to the text-based SignPlayer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RenderToken } from '@signsphere/gloss';
import SignPlayer from '../SignPlayer.js';
import { buildTimeline, startOf, stateAt, type SegmentInput, type Timeline } from '../../lib/avatarTimeline.js';
import { MOTIONS_CHANGED, motionFor, motionSource } from '../../lib/motionLibrary.js';
import { useSettings } from '../../state/settings.js';
import { AvatarScene, webglAvailable, type AvatarView } from './AvatarScene.js';

export interface AvatarPlayerProps {
  plan: RenderToken[];
  autoPlay?: boolean;
}

function sourceLabel(source: string | null): string {
  if (!source) return 'No motion yet';
  if (source === 'recorded') return 'Recorded on this device';
  if (source.startsWith('dataset:')) return 'Real signer · INCLUDE dataset';
  return source;
}

async function segmentsFor(plan: RenderToken[]): Promise<SegmentInput[]> {
  const out: SegmentInput[] = [];
  for (const token of plan) {
    if (token.kind === 'pause') continue;
    if (token.kind === 'sign') {
      const [clip, source] = await Promise.all([motionFor(token.gloss), motionSource(token.gloss)]);
      out.push({ gloss: token.gloss, caption: token.gloss, clip, source: clip ? source : null });
      continue;
    }
    // Fingerspelling: use letter motions where they exist (record them as A, B, C… in Record).
    const letters = await Promise.all(token.letters.map((letter) => motionFor(letter)));
    if (letters.some(Boolean)) {
      token.letters.forEach((letter, i) => {
        out.push({
          gloss: letter,
          caption: `${letter} · spelling “${token.source}”`,
          clip: letters[i] ?? null,
          source: letters[i] ? 'recorded' : null,
          holdMs: 500,
        });
      });
    } else {
      out.push({
        gloss: token.gloss,
        caption: `Fingerspell: ${token.letters.join('-')}`,
        clip: null,
        source: null,
        holdMs: Math.max(900, token.letters.length * 380),
      });
    }
  }
  return out;
}

export default function AvatarPlayer({ plan, autoPlay = false }: AvatarPlayerProps) {
  const { settings } = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<AvatarScene | null>(null);
  const [supported] = useState(() => webglAvailable());
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [inputs, setInputs] = useState<SegmentInput[]>([]);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(-1);
  const [view, setView] = useState<AvatarView>('front');
  const [motionVersion, setMotionVersion] = useState(0);
  const clockRef = useRef(0);
  const lastTickRef = useRef(0);
  const speedRef = useRef(settings.playbackSpeed);
  speedRef.current = settings.playbackSpeed;

  const signature = useMemo(() => plan.map((t) => (t.kind === 'pause' ? '·' : t.gloss)).join('|'), [plan]);

  useEffect(() => {
    const bump = () => setMotionVersion((n) => n + 1);
    window.addEventListener(MOTIONS_CHANGED, bump);
    return () => window.removeEventListener(MOTIONS_CHANGED, bump);
  }, []);

  // Mount / unmount the 3D scene.
  useEffect(() => {
    if (!supported || !hostRef.current) return;
    const scene = new AvatarScene(hostRef.current);
    sceneRef.current = scene;
    scene.setRig(stateAt(buildTimeline([]), 0).rig);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [supported]);

  // Load motions whenever the sentence (or the motion library) changes.
  useEffect(() => {
    let cancelled = false;
    void segmentsFor(plan).then((segments) => {
      if (cancelled) return;
      const next = buildTimeline(segments);
      setInputs(segments);
      setTimeline(next);
      clockRef.current = 0;
      setIndex(segments.length > 0 ? 0 : -1);
      sceneRef.current?.setRig(stateAt(next, 0).rig);
      setPlaying(autoPlay && segments.length > 0);
    });
    return () => {
      cancelled = true;
    };
    // `signature` captures the plan's content; `plan` identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, autoPlay, motionVersion]);

  // Playback clock.
  useEffect(() => {
    if (!playing || !timeline) return;
    let frame = 0;
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      clockRef.current += (now - lastTickRef.current) * speedRef.current;
      lastTickRef.current = now;
      const state = stateAt(timeline, clockRef.current);
      sceneRef.current?.setRig(state.rig);
      setIndex(state.index);
      if (state.finished) setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, timeline]);

  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);

  if (!supported) {
    return (
      <div className="stack">
        <p className="notice warn">
          <strong>3D avatar unavailable</strong>
          This device or browser has WebGL turned off, so signs are shown as text instead.
        </p>
        <SignPlayer plan={plan} autoPlay={autoPlay} />
      </div>
    );
  }

  const finished = timeline !== null && clockRef.current >= timeline.duration;
  const current = index >= 0 ? inputs[index] : undefined;
  const missing = [...new Set(inputs.filter((s) => !s.clip && !s.caption.startsWith('Fingerspell')).map((s) => s.gloss))];
  const spelled = inputs.filter((s) => s.caption.startsWith('Fingerspell'));
  const total = inputs.length;

  function seek(to: number) {
    if (!timeline) return;
    clockRef.current = startOf(timeline, to);
    const state = stateAt(timeline, clockRef.current);
    sceneRef.current?.setRig(state.rig);
    setIndex(to);
  }

  return (
    <div className="stack">
      <div className="avatar-stage">
        <div ref={hostRef} className="avatar-canvas" role="img" aria-label={current ? `3D avatar signing ${current.caption}` : '3D signing avatar'} />
        {current && (
          <div className="avatar-caption" aria-hidden="true">
            <span className="avatar-gloss">{current.caption}</span>
            <span className={`avatar-source${current.clip ? '' : ' missing'}`}>{sourceLabel(current.source)}</span>
          </div>
        )}
        {total === 0 && <p className="avatar-empty muted small">Type or say something to see it signed.</p>}
        <div className="avatar-views" role="group" aria-label="Camera angle">
          {(['front', 'angle', 'hands'] as const).map((option) => (
            <button key={option} type="button" className={`small${view === option ? ' primary' : ''}`} aria-pressed={view === option} onClick={() => setView(option)}>
              {option === 'front' ? 'Front' : option === 'angle' ? 'Side' : 'Hands'}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={total === 0}
          onClick={() => {
            if (finished) seek(0);
            setPlaying((p) => (finished ? true : !p));
          }}
        >
          {finished ? '↻ Play again' : playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button type="button" onClick={() => seek(Math.max(0, index - 1))} disabled={index <= 0}>
          ⏮ Previous
        </button>
        <button type="button" onClick={() => seek(Math.min(total - 1, index + 1))} disabled={index >= total - 1}>
          ⏭ Next
        </button>
        {total > 0 && (
          <span className="small muted">
            Sign {Math.max(1, index + 1)} of {total}
          </span>
        )}
      </div>

      {(missing.length > 0 || spelled.length > 0) && (
        <p className="hint">
          {missing.length > 0 && (
            <>
              No signer motion yet for <strong>{missing.join(', ')}</strong> — import the ISL dataset or record it in Record.{' '}
            </>
          )}
          {spelled.length > 0 && 'Fingerspelled words need letter recordings (A, B, C…) for the avatar to spell them.'}
        </p>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {current ? current.caption : ''}
      </p>
    </div>
  );
}
