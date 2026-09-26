/**
 * Speech input and output via the Web Speech API.
 *
 * Deliberately zero-dependency and free. Caveats to design around, all of them real:
 *   - Support is uneven: Chrome/Edge good, Safari partial, Firefox has no SpeechRecognition.
 *   - Accuracy on Indian-accented English varies a lot by speaker.
 *   - Chrome's implementation sends audio to Google servers, which breaks the "nothing
 *     leaves your device" promise. SAY SO IN THE UI on the voice screens — a privacy claim
 *     that is true of the camera but not the mic is worse than no claim.
 *
 * Week 14 upgrade path: whisper-small via transformers.js for fully on-device STT. Slower
 * to start (~40 MB download) but private, offline, and much better on Indian accents.
 * Typed input must always remain available as the fallback.
 */

export interface RecognizerHandlers {
  onPartial?(text: string): void;
  onFinal?(text: string): void;
  onError?(message: string): void;
  onEnd?(): void;
}

export interface Recognizer {
  start(): void;
  stop(): void;
  readonly listening: boolean;
}

// The Web Speech API is not in the TS DOM lib in a portable way; declare the slice we use.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

/** @returns null when the browser has no SpeechRecognition — callers must handle this. */
export function createRecognizer(lang: string, handlers: RecognizerHandlers): Recognizer | null {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let listening = false;

  recognition.onresult = (event) => {
    let partial = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result) continue;
      const text = result[0].transcript;
      if (result.isFinal) handlers.onFinal?.(text.trim());
      else partial += text;
    }
    if (partial) handlers.onPartial?.(partial.trim());
  };

  recognition.onerror = (event) => {
    const messages: Record<string, string> = {
      'not-allowed': 'Microphone permission was denied. Allow it in site settings and reload.',
      'no-speech': 'No speech detected. Try speaking a bit louder, or type instead.',
      'audio-capture': 'No microphone found. Connect one, or type instead.',
      network: 'Speech recognition needs a network connection in this browser. Type instead.',
      aborted: '',
    };
    const message = messages[event.error] ?? `Speech recognition failed (${event.error}).`;
    if (message) handlers.onError?.(message);
    listening = false;
  };

  recognition.onend = () => {
    listening = false;
    handlers.onEnd?.();
  };

  return {
    start() {
      if (listening) return;
      try {
        recognition.start();
        listening = true;
      } catch {
        // start() throws if already started; treat as a no-op.
      }
    },
    stop() {
      recognition.stop();
      listening = false;
    },
    get listening() {
      return listening;
    },
  };
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Speak text aloud. Cancels anything already speaking so utterances never overlap. */
export function speak(text: string, lang = 'en-IN', rate = 0.95): void {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;

  // Prefer a voice matching the requested locale; fall back to the browser default.
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (match) utterance.voice = match;

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
