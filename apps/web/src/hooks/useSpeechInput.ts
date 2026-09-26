/**
 * Speech-to-text loop, moved out of the original TextToSign.tsx (unchanged behaviour) so
 * Voice → Sign, Live Conversation and the captioning tools share one implementation.
 *
 * Privacy: most browsers send microphone audio to the browser vendor for transcription.
 * Screens using this hook must show that notice (see <SpeechPrivacyNote />).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createRecognizer, isSpeechRecognitionSupported, type Recognizer } from '../lib/speech.js';

export interface UseSpeechInputOptions {
  lang: string;
  onFinal(text: string): void;
}

export function useSpeechInput({ lang, onFinal }: UseSpeechInputOptions) {
  const [partial, setPartial] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  // Tear down the recogniser on unmount or when the language changes.
  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
    };
  }, [lang]);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
    setListening(false);
    setPartial('');
  }, []);

  const start = useCallback(() => {
    const recognizer = createRecognizer(lang, {
      onPartial: setPartial,
      onFinal: (final) => {
        onFinalRef.current(final);
        setPartial('');
      },
      onError: (message) => {
        setError(message);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    if (!recognizer) {
      setError('This browser has no speech recognition. Chrome or Edge work; otherwise type instead.');
      return;
    }
    recognizerRef.current?.stop();
    recognizerRef.current = recognizer;
    setError(null);
    recognizer.start();
    setListening(true);
  }, [lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { partial, listening, error, supported: isSpeechRecognitionSupported(), start, stop, toggle };
}
