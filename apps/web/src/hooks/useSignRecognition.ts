/**
 * Sign recognition loop, shared by Sign → Text, Sign → Voice, Live Conversation and the
 * Emergency "sign a phrase" panel.
 *
 * The body is the original SignToText.tsx logic moved here unchanged: auto-segment signs
 * from motion, classify the captured window, and only accept a prediction above
 * REJECTION_THRESHOLD. Below that it reports "not sure" — an accessibility tool that
 * guesses confidently is worse than one that admits uncertainty.
 *
 * Additions on top of the original, none of which change what gets recognised:
 *   - `mode: 'capture'` accepts one sign per `arm()` call instead of every sign.
 *   - `onAccept` lets a screen react to an accepted sign (speak it, add a turn, …).
 *   - `allowedLabels` restricts which accepted labels count (Emergency uses this).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REJECTION_THRESHOLD,
  createClassifier,
  type Prediction,
  type SignClassifier,
} from '../lib/classifier.js';
import { FRAME_DIM, FeatureWindow, SignSegmenter, encodeFrame } from '../lib/features.js';
import type { TrackedFrame } from '../lib/landmarks.js';
import { stopSpeaking } from '../lib/speech.js';
import { useHaptics } from './useDevice.js';

export type RecognitionMode = 'continuous' | 'capture';

export interface UseSignRecognitionOptions {
  mode?: RecognitionMode;
  onAccept?(label: string, prediction: Prediction): void;
  allowedLabels?: readonly string[];
}

export function useSignRecognition({ mode = 'continuous', onAccept, allowedLabels }: UseSignRecognitionOptions = {}) {
  const [classifier, setClassifier] = useState<SignClassifier | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [sentence, setSentence] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [armed, setArmed] = useState(false);

  const windowRef = useRef(new FeatureWindow());
  const segmenterRef = useRef(new SignSegmenter());
  const scratchRef = useRef(new Float32Array(FRAME_DIM));
  const busyRef = useRef(false);
  const classifierRef = useRef<SignClassifier | null>(null);
  const modeRef = useRef(mode);
  const armedRef = useRef(false);
  const onAcceptRef = useRef(onAccept);
  const allowedRef = useRef(allowedLabels);
  const haptic = useHaptics();

  useEffect(() => {
    modeRef.current = mode;
    if (mode === 'continuous') {
      armedRef.current = false;
      setArmed(false);
    }
  }, [mode]);
  useEffect(() => {
    onAcceptRef.current = onAccept;
  }, [onAccept]);
  useEffect(() => {
    allowedRef.current = allowedLabels;
  }, [allowedLabels]);

  const load = useCallback(() => {
    let cancelled = false;
    setLoadError(null);
    createClassifier()
      .then((next) => {
        if (cancelled) return;
        classifierRef.current = next;
        setClassifier(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Could not load the classifier.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = load();
    return () => {
      cancel();
      stopSpeaking();
    };
  }, [load]);

  const runPrediction = useCallback(async () => {
    const model = classifierRef.current;
    if (!model || busyRef.current) return;
    busyRef.current = true;
    try {
      const window = windowRef.current;
      if (!window.isReady()) return;
      const result = await model.predict(window.build());
      setPredictions(result);

      const top = result[0];
      const allowed = allowedRef.current;
      if (top && top.confidence >= REJECTION_THRESHOLD && (!allowed || allowed.includes(top.label))) {
        setRejected(false);
        if (modeRef.current === 'capture') {
          armedRef.current = false;
          setArmed(false);
        }
        setSentence((previous) => [...previous, top.label]);
        haptic(40);
        onAcceptRef.current?.(top.label, top);
      } else {
        setRejected(true);
      }
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Prediction failed.');
    } finally {
      windowRef.current.clear();
      busyRef.current = false;
    }
  }, [haptic]);

  const handleFrame = useCallback(
    (frame: TrackedFrame) => {
      // Capture mode: ignore everything until the user presses Capture.
      if (modeRef.current === 'capture' && !armedRef.current) return;

      const encoded = encodeFrame(frame, scratchRef.current);
      const transition = segmenterRef.current.update(encoded);

      if (transition === 'start') {
        windowRef.current.clear();
        setCapturing(true);
      }
      if (segmenterRef.current.isActive || transition === 'end') {
        windowRef.current.pushEncoded(encoded);
      }
      if (transition === 'end') {
        setCapturing(false);
        void runPrediction();
      }
    },
    [runPrediction],
  );

  const arm = useCallback(() => {
    windowRef.current.clear();
    segmenterRef.current.reset();
    armedRef.current = true;
    setArmed(true);
    setRejected(false);
    haptic(20);
  }, [haptic]);

  const disarm = useCallback(() => {
    armedRef.current = false;
    setArmed(false);
    setCapturing(false);
  }, []);

  const undo = useCallback(() => setSentence((previous) => previous.slice(0, -1)), []);
  const clear = useCallback(() => {
    setSentence([]);
    setPredictions([]);
    setRejected(false);
  }, []);

  const untrained = classifier !== null && classifier.labels.length === 0;

  return {
    classifier,
    loadError,
    predictions,
    sentence,
    setSentence,
    capturing,
    rejected,
    armed,
    untrained,
    handleFrame,
    arm,
    disarm,
    undo,
    clear,
    reload: load,
    threshold: REJECTION_THRESHOLD,
  };
}
