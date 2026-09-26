/**
 * Types for the English -> Indian Sign Language gloss engine.
 *
 * A "gloss" is the conventional way of writing a sign in text: uppercase, one sign per
 * token (MOTHER, NOT, WHERE). Glosses are a notation for signs -- they are NOT a written
 * form of ISL and they are NOT English word order.
 */

/** Coarse part of speech. Enough for ordering rules; not a full tagset. */
export type Pos =
  | 'noun'
  | 'verb'
  | 'adj'
  | 'adv'
  | 'pron'
  | 'num'
  | 'wh'
  | 'neg'
  | 'time'
  | 'quant'
  | 'other';

/**
 * Slot in the output ordering. ISL clause order is broadly
 * TIME -> TOPIC/SUBJECT -> OBJECT -> VERB -> NEGATION -> QUESTION.
 * See rules.ts for the caveats -- this is an approximation pending advisor review.
 */
export type Slot = 'time' | 'subject' | 'object' | 'verb' | 'neg' | 'wh' | 'modifier' | 'other';

export interface LexEntry {
  /** Uppercase ISL gloss, e.g. "MOTHER". Unique within a lexicon. */
  gloss: string;
  /** English surface forms that map to this gloss. Lowercase. */
  english: string[];
  pos: Pos;
  /** Path/URL of the signer clip, relative to VITE_CLIP_BASE_URL. Absent = no clip yet. */
  clip?: string;
  /** True if the sign uses both hands (affects recognition features and lesson design). */
  twoHanded?: boolean;
  category?: string;
  /**
   * Has a fluent ISL signer confirmed this gloss and clip?
   * Everything ships as false until reviewed. Unreviewed entries are rendered with a
   * visible "unverified" marker in the UI -- do not remove that marker.
   */
  reviewed: boolean;
  notes?: string;
}

export interface Lexicon {
  version: string;
  language: 'ISL';
  entries: LexEntry[];
}

export interface GlossToken {
  gloss: string;
  /** The English word(s) this came from, for the trace and for UI highlighting. */
  source: string;
  slot: Slot;
  entry?: LexEntry;
  /** True when no lexicon entry existed and we fell back to fingerspelling. */
  fingerspelled: boolean;
}

export type RenderToken =
  | {
      kind: 'sign';
      gloss: string;
      source: string;
      clip?: string;
      reviewed: boolean;
      durationMs: number;
    }
  | { kind: 'fingerspell'; gloss: string; source: string; letters: string[]; durationMs: number }
  | { kind: 'pause'; durationMs: number };

export interface TraceStep {
  /** Rule name, e.g. "drop-function-words". */
  rule: string;
  /** Human-readable explanation, shown in the debug panel and quotable in the report. */
  detail: string;
  /** Token list after this step ran. */
  result: string[];
}

export interface GlossResult {
  input: string;
  /** Flat gloss sequence across all sentences, in signing order. */
  glosses: string[];
  tokens: GlossToken[];
  /** Timed playback plan for the clip player. */
  plan: RenderToken[];
  /** English words with no lexicon entry (these got fingerspelled). */
  unknown: string[];
  trace: TraceStep[];
  /** Fraction of signs that have a clip available (0..1). */
  clipCoverage: number;
  /** Fraction of signs whose entry is fluent-signer reviewed (0..1). */
  reviewedCoverage: number;
}

export interface TranslateOptions {
  lexicon?: Lexicon;
  /** ms per sign clip when the clip's real duration is unknown. */
  signDurationMs?: number;
  /** ms per fingerspelled letter. */
  letterDurationMs?: number;
  /** ms of pause inserted between signs. */
  interSignPauseMs?: number;
  /** ms of pause inserted between sentences. */
  sentencePauseMs?: number;
  /** Playback rate multiplier; learners typically want 0.6-0.8. */
  speed?: number;
}
