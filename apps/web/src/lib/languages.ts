/**
 * Sign-language registry.
 *
 * ISL is the only implemented language: the gloss engine, lexicon, lessons and every
 * recorded sample are ISL. Other entries exist so the UI is built for more than one
 * language from day one — they render as "coming soon" and cannot be selected.
 *
 * To add a language: give it status 'available', a gloss translator and a lexicon, then
 * route translate() calls through `getLanguage(code)` instead of importing @signsphere/gloss
 * directly. No screen should need to change.
 */

export interface SignLanguage {
  code: string;
  name: string;
  short: string;
  region: string;
  status: 'available' | 'planned';
}

export const SIGN_LANGUAGES: readonly SignLanguage[] = [
  { code: 'isl', name: 'Indian Sign Language', short: 'ISL', region: 'India', status: 'available' },
  { code: 'asl', name: 'American Sign Language', short: 'ASL', region: 'United States', status: 'planned' },
  { code: 'bsl', name: 'British Sign Language', short: 'BSL', region: 'United Kingdom', status: 'planned' },
];

export const DEFAULT_SIGN_LANGUAGE = 'isl';

export function getLanguage(code: string): SignLanguage {
  const found = SIGN_LANGUAGES.find((language) => language.code === code && language.status === 'available');
  // Fall back to ISL rather than rendering with an unimplemented language.
  return found ?? (SIGN_LANGUAGES[0] as SignLanguage);
}

/** Spoken/written languages for speech input and output (Web Speech BCP-47 tags). */
export const SPEECH_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'mr-IN', label: 'Marathi' },
] as const;
