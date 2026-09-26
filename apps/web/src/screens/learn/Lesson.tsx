/**
 * Lesson: watch a sign, then practise it on camera and get graded.
 *
 * This is the wedge (PLAN.md §1). It is also the data engine — every practice attempt is a
 * labelled example, because we already know which sign the learner was asked to produce.
 *
 * The practice engine (countdown → capture → grade with geometric hints + classifier) is the
 * original Learn.tsx logic, unchanged. What changed: the lesson comes from the URL
 * (/learn/:lessonId?sign=N) instead of component state, so lessons are linkable and the
 * daily challenge can deep-link to a sign.
 *
 * Grading is honest about its own limits: if the target sign is not in the recogniser's
 * vocabulary, the app says so rather than pretending to grade.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { buildIndex, translate } from '@signsphere/gloss';
import CameraView from '../../components/CameraView.js';
import { AvatarStage } from '../../components/domain/index.js';
import { Badge, Button, Card, EmptyState, Icon, Notice, PageHeader, ProgressBar } from '../../components/ui/index.js';
import { REJECTION_THRESHOLD, createClassifier, type SignClassifier } from '../../lib/classifier.js';
import { FRAME_DIM, FeatureWindow, OFFSET, encodeFrame } from '../../lib/features.js';
import type { TrackedFrame } from '../../lib/landmarks.js';
import { buildLessons, levelOf, LEVELS } from '../../lib/lessons.js';
import { isMastered, recordAttempt } from '../../lib/storage.js';
import { useHaptics } from '../../hooks/useDevice.js';
import { useSettings } from '../../state/settings.js';

const CAPTURE_MS = 1800;

type Step = 'watch' | 'countdown' | 'recording' | 'result';

interface Feedback {
  correct: boolean;
  heard: string | null;
  confidence: number;
  hints: string[];
  gradable: boolean;
}

export default function Lesson() {
  const { lessonId } = useParams();
  const [params, setParams] = useSearchParams();
  const { settings, progress, setProgress } = useSettings();
  const lexicon = useMemo(() => buildIndex(), []);
  const lessons = useMemo(() => buildLessons(lexicon.lexicon.entries), [lexicon]);
  const haptic = useHaptics();

  const lesson = lessons.find((l) => l.id === lessonId) ?? null;
  const requested = Number.parseInt(params.get('sign') ?? '0', 10);
  const signIndex = lesson && Number.isFinite(requested) ? Math.max(0, Math.min(lesson.entries.length - 1, requested)) : 0;
  const setSignIndex = useCallback(
    (next: number) => setParams(next === 0 ? {} : { sign: String(next) }, { replace: true }),
    [setParams],
  );

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

  // A new sign always starts at "watch".
  useEffect(() => {
    setStep('watch');
    setFeedback(null);
  }, [lessonId, signIndex]);

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
    if (correct) haptic([30, 60, 30]);
    setStep('result');
    window.clear();
  }, [classifier, progress, setProgress, target, haptic]);

  useEffect(() => {
    if (step !== 'countdown') return;
    if (countdown <= 0) {
      windowRef.current.clear();
      sawSecondHandRef.current = false;
      sawAnyHandRef.current = false;
      setStep('recording');
      haptic(20);
      return;
    }
    const timer = setTimeout(() => setCountdown((n) => n - 1), 800);
    return () => clearTimeout(timer);
  }, [step, countdown, haptic]);

  useEffect(() => {
    if (step !== 'recording') return;
    const timer = setTimeout(() => void grade(), CAPTURE_MS);
    return () => clearTimeout(timer);
  }, [step, grade]);

  const referencePlan = useMemo(
    () => (target ? translate(target.english[0] ?? target.gloss, { speed: settings.playbackSpeed }).plan : []),
    [target, settings.playbackSpeed],
  );

  if (!lesson || !target) {
    return (
      <>
        <PageHeader back={{ to: '/learn', label: 'Back to Learning Hub' }} title="Lesson not found" />
        <EmptyState icon="learn" title="That lesson does not exist" actions={<Button variant="primary" to="/learn">See all lessons</Button>}>
          The lesson list is built from the lexicon, so lesson links can change when signs are added.
        </EmptyState>
      </>
    );
  }

  const masteredInLesson = lesson.entries.filter((entry) => isMastered(progress, entry.gloss)).length;
  const levelTitle = LEVELS.find((level) => level.id === levelOf(lesson.category))?.title ?? '';
  const untrained = classifier !== null && classifier.labels.length === 0;

  return (
    <>
      <PageHeader
        back={{ to: '/learn', label: 'Back to Learning Hub' }}
        eyebrow={
          <>
            <Icon name="learn" /> {levelTitle}
          </>
        }
        title={lesson.title}
        subtitle={`Sign ${signIndex + 1} of ${lesson.entries.length} · ${target.gloss}`}
        actions={
          <div style={{ minWidth: '12rem' }}>
            <ProgressBar value={masteredInLesson} max={lesson.entries.length} label="Mastered in this lesson" />
          </div>
        }
      />

      {untrained && (
        <Notice tone="warn" title="Practice cannot be graded yet">
          No signs have been recorded on this device, so the app can show you a sign but cannot check
          yours. <Link to="/record">Record signs</Link> first.
        </Notice>
      )}

      <div className="split even">
        <Card as="section" aria-label="Reference sign" className="stack">
          <AvatarStage plan={referencePlan} autoPlay title="1 · Watch" />
          {!target.reviewed && (
            <Notice tone="warn" title="Unverified sign">
              This gloss has not been checked by a fluent ISL signer, and there is no signer video
              yet. Do not learn it as correct.
            </Notice>
          )}
        </Card>

        <Card as="section" aria-label="Your practice" className="stack">
          <div className="card-head">
            <h2 className="small">2 · Your turn</h2>
            {isMastered(progress, target.gloss) && (
              <Badge tone="success" icon="check">
                Mastered
              </Badge>
            )}
          </div>
          <CameraView
            onFrame={handleFrame}
            recording={step === 'recording'}
            badge={step === 'countdown' ? `Get ready… ${countdown}` : step === 'recording' ? '● Sign now' : undefined}
          />

          <div className="btn-group">
            <Button
              variant="gradient"
              icon={step === 'result' ? 'replay' : 'play'}
              disabled={step === 'countdown' || step === 'recording'}
              onClick={() => {
                setFeedback(null);
                setCountdown(3);
                setStep('countdown');
              }}
            >
              {step === 'result' ? 'Try again' : 'Practise this sign'}
            </Button>
            <Button
              iconRight="arrow-right"
              disabled={signIndex >= lesson.entries.length - 1}
              onClick={() => setSignIndex(signIndex + 1)}
            >
              Next sign
            </Button>
          </div>

          {feedback && (
            <div
              className={`notice${feedback.correct ? ' success' : feedback.gradable ? ' warn' : ''}`}
              role="status"
            >
              <strong>
                {!feedback.gradable ? 'Cannot grade this sign yet' : feedback.correct ? '✓ Correct' : 'Not quite'}
              </strong>
              {!feedback.gradable && (
                <span>
                  {target.gloss} has no recorded examples, so the app cannot check your signing.
                  Record examples of it first, then practice will be graded.
                </span>
              )}
              {feedback.gradable && feedback.heard && (
                <span>
                  Recognised as <strong style={{ display: 'inline' }}>{feedback.heard}</strong> (
                  {Math.round(feedback.confidence * 100)}% confident).{' '}
                </span>
              )}
              {feedback.hints.length > 0 && (
                <ul>
                  {feedback.hints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card as="section" className="section" aria-labelledby="lesson-signs">
        <h2 id="lesson-signs" className="small">
          Signs in this lesson
        </h2>
        <div className="gloss-row">
          {lesson.entries.map((entry, i) => (
            <button
              key={entry.gloss}
              type="button"
              className={`chip${i === signIndex ? ' active' : ''}`}
              aria-current={i === signIndex ? 'step' : undefined}
              onClick={() => setSignIndex(i)}
            >
              {entry.gloss}
              {isMastered(progress, entry.gloss) && <span aria-label="mastered"> ✓</span>}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}
