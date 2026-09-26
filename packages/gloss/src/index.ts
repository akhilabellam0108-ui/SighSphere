/**
 * English -> Indian Sign Language gloss engine.
 *
 * Rule-based on purpose: there is no English->ISL-gloss parallel corpus to train on, and a
 * rule system can be read, corrected, and defended by a fluent signer without touching
 * code. Ordering rules live in rules.ts; vocabulary lives in lexicon/isl-core.json.
 *
 * Every call returns a `trace` explaining which rule fired at each step. Use it in the
 * debug panel, in the report, and when walking an advisor through the output.
 *
 * Known limitation to state plainly in any writeup: a gloss sequence omits non-manual
 * markers (facial expression, head tilt, mouthing), which carry grammatical meaning in
 * ISL. This engine produces sign *order*, not complete ISL.
 */

import { buildIndex, coreLexicon, validateLexicon } from './lexicon.js';
import {
  COPULA,
  FUNCTION_WORDS,
  FUTURE_TRIGGERS,
  MODALS,
  NEGATORS,
  PAST_TRIGGERS,
  PHRASES,
  PRONOUNS,
  TIME_WORDS,
  WH_WORDS,
  lemmatize,
} from './rules.js';
import type {
  GlossResult,
  GlossToken,
  LexEntry,
  Pos,
  RenderToken,
  Slot,
  TraceStep,
  TranslateOptions,
} from './types.js';

export * from './types.js';
export { buildIndex, coreLexicon, validateLexicon };
export * as rules from './rules.js';

const DEFAULTS = {
  signDurationMs: 900,
  letterDurationMs: 320,
  interSignPauseMs: 140,
  sentencePauseMs: 520,
  speed: 1,
} as const;

/** Internal working token: a GlossToken plus what we need for ordering. */
interface WorkToken extends GlossToken {
  pos: Pos;
  origIndex: number;
}

/** Split into sentences, keeping the terminator so we can detect questions. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Collapse known multi-word English phrases into pre-resolved gloss sequences.
 * Because the input is lowercased first, any UPPERCASE token downstream is by definition
 * already-resolved and skips lookup.
 */
function applyPhrases(lower: string): { text: string; applied: string[] } {
  const applied: string[] = [];
  let text = lower;
  const phrases = [...PHRASES.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, gloss] of phrases) {
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    if (pattern.test(text)) {
      text = text.replace(pattern, ` ${gloss} `);
      applied.push(`"${phrase}" -> ${gloss}`);
    }
  }
  return { text, applied };
}

function tokenize(text: string): string[] {
  return text
    .replace(/[‘’]/g, "'")
    .split(/[^A-Za-z0-9'\-]+/)
    .filter(Boolean);
}

function slotForPos(pos: Pos): Slot {
  switch (pos) {
    case 'time':
      return 'time';
    case 'wh':
      return 'wh';
    case 'neg':
      return 'neg';
    case 'verb':
      return 'verb';
    case 'adj':
    case 'adv':
      return 'modifier';
    case 'noun':
    case 'pron':
    case 'num':
    case 'quant':
      // Refined into subject/object later, once we know where the verb is.
      return 'subject';
    default:
      return 'other';
  }
}

function isNominal(pos: Pos): boolean {
  return pos === 'noun' || pos === 'pron' || pos === 'num' || pos === 'quant';
}

function fingerspell(word: string): string[] {
  return word.toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
}

/** Turn one sentence into unordered WorkTokens, recording every drop in the trace. */
function readSentence(
  sentence: string,
  byEnglish: Map<string, LexEntry>,
  trace: TraceStep[],
): WorkToken[] {
  const lower = sentence.toLowerCase();
  const isQuestion = /\?\s*$/.test(sentence);

  const { text, applied } = applyPhrases(lower);
  if (applied.length) {
    trace.push({ rule: 'phrase-substitution', detail: applied.join('; '), result: tokenize(text) });
  }

  const raw = tokenize(text);
  const tokens: WorkToken[] = [];
  const dropped: string[] = [];
  let tenseMarker: 'PAST' | 'FUTURE' | null = null;

  const push = (partial: Omit<WorkToken, 'origIndex'>) => {
    tokens.push({ ...partial, origIndex: tokens.length });
  };

  for (const word of raw) {
    // Pre-resolved gloss injected by phrase substitution.
    if (word === word.toUpperCase() && /[A-Z]/.test(word)) {
      const entry = byEnglish.get(word.toLowerCase());
      const pos = entry?.pos ?? (WH_WORDS.has(word.toLowerCase()) ? 'wh' : 'other');
      push({
        gloss: word,
        source: word.toLowerCase(),
        slot: slotForPos(pos),
        pos,
        entry,
        fingerspelled: false,
      });
      continue;
    }

    // Tense triggers become time markers rather than verb inflection.
    if (FUTURE_TRIGGERS.has(word)) {
      tenseMarker = 'FUTURE';
      dropped.push(`${word} (-> FUTURE marker)`);
      continue;
    }
    if (PAST_TRIGGERS.has(word)) {
      tenseMarker = 'PAST';
      dropped.push(`${word} (-> PAST marker)`);
      continue;
    }

    if (NEGATORS.has(word)) {
      const gloss = NEGATORS.get(word)!;
      push({
        gloss,
        source: word,
        slot: 'neg',
        pos: 'neg',
        entry: byEnglish.get(gloss.toLowerCase()),
        fingerspelled: false,
      });
      continue;
    }

    if (WH_WORDS.has(word)) {
      const gloss = WH_WORDS.get(word)!;
      push({
        gloss,
        source: word,
        slot: 'wh',
        pos: 'wh',
        entry: byEnglish.get(gloss.toLowerCase()),
        fingerspelled: false,
      });
      continue;
    }

    // No copula in ISL.
    if (COPULA.has(word)) {
      dropped.push(`${word} (no copula in ISL)`);
      continue;
    }
    if (FUNCTION_WORDS.has(word)) {
      dropped.push(word);
      continue;
    }
    // "to" survives only when it isn't an infinitive marker; simplest correct-enough rule
    // is to drop it always, since PHRASES already handles want-to / need-to / have-to.
    if (word === 'to') {
      dropped.push('to');
      continue;
    }

    const lemma = lemmatize(word);
    const entry = byEnglish.get(word) ?? byEnglish.get(lemma);

    if (entry) {
      push({
        gloss: entry.gloss,
        source: word,
        slot: TIME_WORDS.has(lemma) ? 'time' : slotForPos(entry.pos),
        pos: entry.pos,
        entry,
        fingerspelled: false,
      });
      continue;
    }

    const modal = MODALS.get(word) ?? MODALS.get(lemma);
    if (modal) {
      push({
        gloss: modal,
        source: word,
        slot: 'verb',
        pos: 'verb',
        entry: byEnglish.get(modal.toLowerCase()),
        fingerspelled: false,
      });
      continue;
    }

    // Unknown word -> fingerspell. A visible, recoverable failure.
    push({
      gloss: word.toUpperCase(),
      source: word,
      slot: PRONOUNS.has(lemma) ? 'subject' : 'object',
      pos: PRONOUNS.has(lemma) ? 'pron' : 'noun',
      fingerspelled: true,
    });
  }

  if (dropped.length) {
    trace.push({
      rule: 'drop-function-words',
      detail: `removed: ${dropped.join(', ')}`,
      result: tokens.map((t) => t.gloss),
    });
  }

  // Tense marker: skip it if the sentence already has an explicit time word, since
  // "yesterday I went" needs YESTERDAY, not YESTERDAY PAST.
  const hasExplicitTime = tokens.some((t) => t.slot === 'time');
  if (tenseMarker && !hasExplicitTime) {
    tokens.unshift({
      gloss: tenseMarker,
      source: tenseMarker.toLowerCase(),
      slot: 'time',
      pos: 'time',
      entry: byEnglish.get(tenseMarker.toLowerCase()),
      fingerspelled: false,
      origIndex: -1,
    });
    trace.push({
      rule: 'tense-as-time-marker',
      detail: `ISL marks tense with time markers, not verb inflection -> prepended ${tenseMarker}`,
      result: tokens.map((t) => t.gloss),
    });
  } else if (tenseMarker && hasExplicitTime) {
    trace.push({
      rule: 'tense-as-time-marker',
      detail: `${tenseMarker} marker suppressed: sentence already carries an explicit time word`,
      result: tokens.map((t) => t.gloss),
    });
  }

  if (isQuestion && !tokens.some((t) => t.slot === 'wh')) {
    trace.push({
      rule: 'yes-no-question',
      detail:
        'Yes/no question detected. ISL marks these with non-manual signals (raised brows, head forward), which a gloss sequence cannot represent -- the UI must show the question cue instead.',
      result: tokens.map((t) => t.gloss),
    });
  }

  return tokens;
}

/** Nominals and modifiers before the first verb are subjects; after it, objects. */
function assignSubjectObject(tokens: WorkToken[]): void {
  const firstVerb = tokens.find((t) => t.slot === 'verb');
  // Compare against origIndex, not array position: a prepended tense marker shifts array
  // indices but not origIndex. With no verb, everything lands in the subject group.
  const verbAt = firstVerb ? firstVerb.origIndex : Number.POSITIVE_INFINITY;
  for (const token of tokens) {
    if (token.slot !== 'subject' && token.slot !== 'object' && token.slot !== 'modifier') continue;
    token.slot = token.origIndex < verbAt ? 'subject' : 'object';
  }
}

/** ISL commonly puts the noun before its adjective: "red book" -> BOOK RED. */
function nounBeforeAdjective(group: WorkToken[]): WorkToken[] {
  const out = [...group];
  for (let i = 0; i < out.length - 1; i += 1) {
    const a = out[i];
    const b = out[i + 1];
    if (!a || !b) continue;
    if ((a.pos === 'adj' || a.pos === 'adv') && isNominal(b.pos)) {
      out[i] = b;
      out[i + 1] = a;
      i += 1;
    }
  }
  return out;
}

function order(tokens: WorkToken[], trace: TraceStep[]): WorkToken[] {
  const before = tokens.map((t) => t.gloss);
  assignSubjectObject(tokens);

  const pick = (slot: Slot) => tokens.filter((t) => t.slot === slot);
  const others = pick('other');
  const firstContent = tokens.find((t) => t.slot !== 'other');
  const leadingOthers = firstContent
    ? others.filter((t) => t.origIndex < firstContent.origIndex)
    : others;
  const trailingOthers = others.filter((t) => !leadingOthers.includes(t));

  const ordered = [
    ...leadingOthers,
    ...pick('time'),
    ...nounBeforeAdjective(pick('subject')),
    ...nounBeforeAdjective(pick('object')),
    ...pick('verb'),
    ...pick('neg'),
    ...pick('wh'),
    ...trailingOthers,
  ];

  const after = ordered.map((t) => t.gloss);
  if (before.join(' ') !== after.join(' ')) {
    trace.push({
      rule: 'reorder',
      detail: 'TIME -> SUBJECT -> OBJECT -> VERB -> NEGATION -> QUESTION (see rules.ts SLOT_ORDER)',
      result: after,
    });
  }
  return ordered;
}

/** Collapse immediate duplicates, e.g. NOT NOT -> NOT. */
function dedupeAdjacent(tokens: WorkToken[]): WorkToken[] {
  return tokens.filter((token, i) => i === 0 || token.gloss !== tokens[i - 1]?.gloss);
}

function buildPlan(sentences: WorkToken[][], opts: Required<TranslateOptions>): RenderToken[] {
  const plan: RenderToken[] = [];
  const scale = 1 / Math.max(0.25, opts.speed);

  sentences.forEach((tokens, sentenceIndex) => {
    if (sentenceIndex > 0 && tokens.length) {
      plan.push({ kind: 'pause', durationMs: Math.round(opts.sentencePauseMs * scale) });
    }
    tokens.forEach((token, i) => {
      if (i > 0) {
        plan.push({ kind: 'pause', durationMs: Math.round(opts.interSignPauseMs * scale) });
      }
      if (token.fingerspelled) {
        const letters = fingerspell(token.gloss);
        plan.push({
          kind: 'fingerspell',
          gloss: token.gloss,
          source: token.source,
          letters,
          durationMs: Math.round(letters.length * opts.letterDurationMs * scale),
        });
      } else {
        plan.push({
          kind: 'sign',
          gloss: token.gloss,
          source: token.source,
          clip: token.entry?.clip,
          reviewed: token.entry?.reviewed ?? false,
          durationMs: Math.round(opts.signDurationMs * scale),
        });
      }
    });
  });

  return plan;
}

/**
 * Translate English text into an ISL gloss sequence and a timed playback plan.
 *
 * @example
 * translate('Where is the school?').glosses  // ['SCHOOL', 'WHERE']
 * translate('I do not know').glosses         // ['I', 'KNOW', 'NOT']
 * translate('I will go tomorrow').glosses    // ['TOMORROW', 'I', 'GO']
 */
export function translate(input: string, options: TranslateOptions = {}): GlossResult {
  const opts: Required<TranslateOptions> = {
    lexicon: options.lexicon ?? coreLexicon,
    signDurationMs: options.signDurationMs ?? DEFAULTS.signDurationMs,
    letterDurationMs: options.letterDurationMs ?? DEFAULTS.letterDurationMs,
    interSignPauseMs: options.interSignPauseMs ?? DEFAULTS.interSignPauseMs,
    sentencePauseMs: options.sentencePauseMs ?? DEFAULTS.sentencePauseMs,
    speed: options.speed ?? DEFAULTS.speed,
  };

  const { byEnglish } = buildIndex(opts.lexicon);
  const trace: TraceStep[] = [];
  const sentences: WorkToken[][] = [];

  for (const sentence of splitSentences(input)) {
    const read = readSentence(sentence, byEnglish, trace);
    sentences.push(dedupeAdjacent(order(read, trace)));
  }

  const tokens = sentences.flat();
  const glosses = tokens.map((t) => t.gloss);
  const unknown = [...new Set(tokens.filter((t) => t.fingerspelled).map((t) => t.source))];
  const signs = tokens.filter((t) => !t.fingerspelled);

  return {
    input,
    glosses,
    tokens: tokens.map(({ gloss, source, slot, entry, fingerspelled }) => ({
      gloss,
      source,
      slot,
      entry,
      fingerspelled,
    })),
    plan: buildPlan(sentences, opts),
    unknown,
    trace,
    clipCoverage: signs.length ? signs.filter((t) => t.entry?.clip).length / signs.length : 1,
    reviewedCoverage: signs.length ? signs.filter((t) => t.entry?.reviewed).length / signs.length : 1,
  };
}

/** Convenience: just the gloss string, e.g. "SCHOOL WHERE". */
export function toGlossString(input: string, options?: TranslateOptions): string {
  return translate(input, options).glosses.join(' ');
}
