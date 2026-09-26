/**
 * Learning Hub: watch a sign, then practise it on camera and get graded.
 *
 * This is the wedge (PLAN.md §1). It is also the data engine — every practice attempt is a
 * labelled example, because we already know which sign the learner was asked to produce.
 *
 * Grading is honest about its own limits: if the target sign is not in the recogniser's
 * vocabulary, the app says so rather than pretending to grade.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildIndex, translate, type LexEntry } from '@signsphere/gloss';
import CameraView from '../components/CameraView.js';
import SignPlayer from '../components/SignPlayer.js';
import { REJECTION_THRESHOLD, createClassifier, type SignClassifier } from '../lib/classifier.js';
import { FRAME_DIM, FeatureWindow, OFFSET, encodeFrame } from '../lib/features.js';
import type { TrackedFrame } from '../lib/landmarks.js';
import { isMastered, recordAttempt } from '../lib/storage.js';
import { useSettings } from '../state/settings.js';

const CAPTURE_MS = 1800;
const SIGNS_PER_LESSON = 6;

type Step = 'watch' | 'countdown' | 'recording' | 'result';

interface Lesson {
  id: string;
  title: string;
  entries: LexEntry[];
}

interface Feedback {
  correct: boolean;
  heard: string | null;
  confidence: number;
  hints: string[];
  gradable: boolean;
}

function buildLessons(entries: LexEntry[]): Lesson[] {
  const byCategory = new Map<string, LexEntry[]>();
  for (const entry of entries) {
    const category = entry.category ?? 'other';
    const list = byCategory.get(category) ?? [];
    list.push(entry);
    byCategory.set(category, list);
  }

  const lessons: Lesson[] = [];
  for (const [category, list] of byCategory) {
    // Chunk into lessons, then fold a too-short tail into the previous chunk rather than
    // dropping it — otherwise a category of 8 silently loses 2 signs from the curriculum.
    const chunks: LexEntry[][] = [];
    for (let i = 0; i < list.length; i += SIGNS_PER_LESSON) {
      chunks.push(list.slice(i, i + SIGNS_PER_LESSON));
    }
    const last = chunks.at(-1);
    if (chunks.length > 1 && last && last.length < 3) {
      chunks[chunks.length - 2]?.push(...last);
      chunks.pop();
    }
    // A whole category with fewer than 3 signs is not a lesson; those signs are still
    // reachable through the translator and the recorder.
    if (chunks.length === 1 && (chunks[0]?.length ?? 0) < 3) continue;

    chunks.forEach((chunk, index) => {
      lessons.push({
        id: `${category}-${index + 1}`,
        title: `${titleCase(category)}${chunks.length > 1 ? ` ${index + 1}` : ''}`,
        entries: chunk,
      });
    });
  }
  return lessons;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function Learn() {
  const { settings, progress, setProgress } = useSettings();
  const lexicon = useMemo(() => buildIndex(), []);
  const lessons = useMemo(() => buildLessons(lexicon.lexicon.entries), [lexicon]);

  const [lessonId, setLessonId] = useState<string | null>(null);
  const [signIndex, setSignIndex] = useState(0);
  const [step, setStep] = useState<Step>('watch');
  const [countdown, setCountdown] = useState(3);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [classifier, setClassifier] = useState<SignClassifier | null>(null);

  const windowRef = useRef(new FeatureWindow(90));
  const scratchRef = useRef(new Float32Array(FRAME_DIM));
  const stepRef = useRef<Step>('watch');
  const sawSecondHandRef = useRef(false);
  const sawAnyHandRef = useRef(false);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    createClassifier()
      .then((next) => !cancelled && setClassifier(next))
      .catch(() => !cancelled && setClassifier(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const lesson = lessons.find((l) => l.id === lessonId) ?? null;
  const target = lesson?.entries[signIndex] ?? null;

  const handleFrame = useCallback((frame: TrackedFrame) => {
    if (stepRef.current !== 'recording') return;
    const encoded = encodeFrame(frame, scratchRef.current);
    if (encoded[OFFSET.nonDominantPresent] === 1) sawSecondHandRef.current = true;
    if (encoded[OFFSET.dominantPresent] === 1) sawAnyHandRef.current = true;
    windowRef.current.pushEncoded(encoded);
  }, []);

  const grade = useCallback(async () => {
    if (!target) return;
    const window = windowRef.current;
    const hints: string[] = [];

    // Geometric hints first: these are actionable even when the classifier can't help.
    if (!sawAnyHandRef.current) {
      hints.push('No hand was detected. Move closer and make sure your hands are in frame.');
    }
    if (target.twoHanded && !sawSecondHandRef.current) {
      hints.push('This is a two-handed sign, but only one hand was visible.');
    }
    if (window.length < 10) {
      hints.push('Tracking dropped out — try better lighting or a plainer background.');
    }

    const canGrade = classifier !== null && classifier.labels.includes(target.gloss);
    let heard: string | null = null;
    let confidence = 0;
    let correct = false;

    if (canGrade && window.isReady() && classifier) {
      const predictions = await classifier.predict(window.build());
      const top = predictions[0];
      heard = top?.label ?? null;
      confidence = top?.confidence ?? 0;
      correct = heard === target.gloss && confidence >= REJECTION_THRESHOLD;
      if (!correct && heard && heard !== target.gloss) {
        hints.push(`That looked more like ${heard}. Check your handshape and where you place it.`);
      } else if (!correct && confidence < REJECTION_THRESHOLD) {
        hints.push('Not confident enough to call it. Try signing a little slower and more clearly.');
      }
    }

    setFeedback({ correct, heard, confidence, hints, gradable: canGrade });
    if (canGrade) setProgress(recordAttempt(progress, target.gloss, correct));
    setStep('result');
    window.clear();
  }, [classifier, progress, setProgress, target]);

  useEffect(() => {
    if (step !== 'countdown') return;
    if (countdown <= 0) {
      windowRef.current.clear();
      sawSecondHandRef.current = false;
      sawAnyHandRef.current = false;
      setStep('recording');
      return;
    }
    const timer = setTimeout(() => setCountdown((n) => n - 1), 800);
    return () => clearTimeout(timer);
  }, [step, countdown]);

  useEffect(() => {
    if (step !== 'recording') return;
    const timer = setTimeout(() => void grade(), CAPTURE_MS);
    return () => clearTimeout(timer);
  }, [step, grade]);

  const referencePlan = useMemo(
    () => (target ? translate(target.english[0] ?? target.gloss, { speed: settings.playbackSpeed }).plan : []),
    [target, settings.playbackSpeed],
  );

  // ---------------------------------------------------------------- lesson list
  if (!lesson) {
    return (
      <>
        <h1>Learning Hub</h1>
        <p className="lede">
          Watch a sign, then sign it back to the camera and get feedback. {lessons.length} lessons
          built from the lexicon.
        </p>

        <section className="card grid" aria-label="Your progress" style={{ marginBottom: '1.25rem' }}>
          <div className="stat">
            <div className="value">{progress.xp}</div>
            <div className="label">XP</div>
          </div>
          <div className="stat">
            <div className="value">{progress.dayStreak}</div>
            <div className="label">Day streak</div>
          </div>
          <div className="stat">
            <div className="value">
              {Object.keys(progress.signs).filter((g) => isMastered(progress, g)).length}
            </div>
            <div className="label">Mastered</div>
          </div>
        </section>

        {classifier && classifier.labels.length === 0 && (
          <p className="notice warn">
            <strong>Practice cannot be graded yet</strong>
            No signs have been recorded, so the app can show you a sign but cannot check yours.
            Record examples first — see the Record tab.
          </p>
        )}

        <div className="grid">
          {lessons.map((item) => {
            const done = item.entries.filter((entry) => isMastered(progress, entry.gloss)).length;
            return (
              <button
                key={item.id}
                type="button"
                className="card"
                style={{ textAlign: 'left', display: 'block' }}
                onClick={() => {
                  setLessonId(item.id);
                  setSignIndex(0);
                  setStep('watch');
                  setFeedback(null);
                }}
              >
                <h3>{item.title}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {item.entries.length} signs · {done} mastered
                </p>
                <p className="small" style={{ margin: '0.4rem 0 0' }}>
                  {item.entries.map((entry) => entry.gloss).join(' · ')}
                </p>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------- lesson view
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>{lesson.title}</h1>
        <button type="button" onClick={() => setLessonId(null)}>
          ← All lessons
        </button>
      </div>
      <p className="lede">
        Sign {signIndex + 1} of {lesson.entries.length}
        {target && ` · ${target.gloss}`}
      </p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(18rem, 1fr) minmax(18rem, 1fr)' }}>
        <section className="card stack" aria-label="Reference sign">
          <h2 className="small">Watch</h2>
          <SignPlayer plan={referencePlan} autoPlay />
          {target && !target.reviewed && (
            <p className="notice warn">
              <strong>Unverified sign</strong>
              This gloss has not been checked by a fluent ISL signer, and there is no signer video
              yet. Do not learn it as correct.
            </p>
          )}
        </section>

        <section className="card stack" aria-label="Your practice">
          <h2 className="small">Your turn</h2>
          <CameraView
            onFrame={handleFrame}
            recording={step === 'recording'}
            badge={
              step === 'countdown'
                ? `Get ready… ${countdown}`
                : step === 'recording'
                  ? '● Sign now'
                  : undefined
            }
          />

          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={step === 'countdown' || step === 'recording'}
              onClick={() => {
                setFeedback(null);
                setCountdown(3);
                setStep('countdown');
              }}
            >
              {step === 'result' ? '↻ Try again' : '▶ Practise this sign'}
            </button>
            <button
              type="button"
              disabled={signIndex >= lesson.entries.length - 1}
              onClick={() => {
                setSignIndex((i) => i + 1);
                setStep('watch');
                setFeedback(null);
              }}
            >
              Next sign →
            </button>
          </div>

          {feedback && (
            <div
              className={`notice${feedback.correct ? '' : feedback.gradable ? ' warn' : ''}`}
              role="status"
            >
              <strong>
                {!feedback.gradable
                  ? 'Cannot grade this sign yet'
                  : feedback.correct
                    ? '✓ Correct'
                    : 'Not quite'}
              </strong>
              {!feedback.gradable && (
                <span>
                  {target?.gloss} has no recorded examples, so the app cannot check your signing.
                  Record examples of it first, then practice will be graded.
                </span>
              )}
              {feedback.gradable && feedback.heard && (
                <span>
                  Recognised as <strong>{feedback.heard}</strong> ({Math.round(feedback.confidence * 100)}%
                  confident).{' '}
                </span>
              )}
              {feedback.hints.length > 0 && (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
                  {feedback.hints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <h2 className="small">Signs in this lesson</h2>
        <div className="gloss-row">
          {lesson.entries.map((entry, i) => (
            <button
              key={entry.gloss}
              type="button"
              className={`chip${i === signIndex ? ' active' : ''}`}
              onClick={() => {
                setSignIndex(i);
                setStep('watch');
                setFeedback(null);
              }}
            >
              {entry.gloss}
              {isMastered(progress, entry.gloss) && <span aria-label="mastered"> ✓</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
