/**
 * ISL ordering and word-handling rules.
 *
 * ============================ READ THIS BEFORE EDITING ============================
 * This file is written to be readable by a linguist or a fluent ISL signer who does not
 * write TypeScript. Every rule is a named list or a small commented function. If you add
 * a rule, add the source it came from in the comment.
 *
 * !! ALL RULES HERE ARE UNVALIDATED APPROXIMATIONS. !!
 * They were assembled from general descriptions of ISL grammar, not from a corpus study,
 * and not by a native signer. Each one must be reviewed by a fluent ISL signer and either
 * confirmed, corrected, or deleted. A plausible-looking rule invented by a hearing
 * developer is exactly how you produce fluent-looking nonsense.
 *
 * Review status: UNREVIEWED. Owner: Product/Community Lead. Due: Week 5.
 * Log each review in docs/decisions.md.
 * ==================================================================================
 *
 * What is reasonably well established about ISL and reflected below:
 *   - No articles (a / an / the).
 *   - No copula: "she is a teacher" -> SHE TEACHER.
 *   - Time markers come first: "I went yesterday" -> YESTERDAY I GO.
 *   - Tense is carried by time markers, not verb inflection -> emit PAST / FUTURE.
 *   - Question words go at the END: "where is the school?" -> SCHOOL WHERE.
 *   - Negation follows the verb: "I do not know" -> I KNOW NOT.
 *   - Broadly SOV-leaning, with frequent topic-comment structure.
 *   - Nouns commonly precede their adjectives: "red book" -> BOOK RED.
 *
 * What this file deliberately does NOT model (v2 territory, flag in the report):
 *   - Non-manual markers (facial expression, head tilt, mouthing) -- which carry
 *     grammatical meaning in ISL, including question and negation marking. A gloss
 *     sequence without them is genuinely incomplete, not merely simplified.
 *   - Classifiers, spatial verb agreement, use of signing space for referents.
 *   - Reduplication for plurals/aspect.
 *   - Role shift for reported speech.
 */

import type { Slot } from './types.js';

/** Dropped entirely. Recorded in the trace so the user can see what was removed. */
export const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'of', 'at', 'by', 'for', 'with', 'about', 'into', 'onto', 'upon',
  'and', 'or', 'so', 'that', 'than', 'then',
  'do', 'does', 'did',
  'please',
]);

/** Forms of "to be" -- ISL has no copula, so these are dropped. */
export const COPULA = new Set(['is', 'am', 'are', 'was', 'were', 'be', 'been', 'being']);

/** Words that imply past tense -> emit a PAST time marker instead. */
export const PAST_TRIGGERS = new Set(['was', 'were', 'had', 'did']);

/** Words that imply future tense -> emit a FUTURE time marker instead. */
export const FUTURE_TRIGGERS = new Set(['will', "'ll", 'shall', 'gonna']);

/** Negators, all collapsed to the single gloss NOT (placed after the verb). */
export const NEGATORS = new Map<string, string>([
  ['not', 'NOT'],
  ["n't", 'NOT'],
  ['dont', 'NOT'],
  ["don't", 'NOT'],
  ['doesnt', 'NOT'],
  ["doesn't", 'NOT'],
  ['didnt', 'NOT'],
  ["didn't", 'NOT'],
  ['cannot', 'CANNOT'],
  ['cant', 'CANNOT'],
  ["can't", 'CANNOT'],
  ['wont', 'NOT'],
  ["won't", 'NOT'],
  ['never', 'NEVER'],
  ['no', 'NO'],
  ['none', 'NOTHING'],
  ['nothing', 'NOTHING'],
]);

/** Question words -- moved to the END of the clause. */
export const WH_WORDS = new Map<string, string>([
  ['what', 'WHAT'],
  ['who', 'WHO'],
  ['whom', 'WHO'],
  ['whose', 'WHOSE'],
  ['where', 'WHERE'],
  ['when', 'WHEN'],
  ['why', 'WHY'],
  ['how', 'HOW'],
  ['which', 'WHICH'],
]);

/** Time expressions -- moved to the FRONT of the clause. */
export const TIME_WORDS = new Set([
  'today', 'tomorrow', 'yesterday', 'now', 'later', 'before', 'after',
  'morning', 'afternoon', 'evening', 'night', 'tonight',
  'always', 'sometimes', 'often', 'soon', 'already', 'yet', 'daily',
  'past', 'future',
]);

/**
 * Multi-word English phrases collapsed to one gloss BEFORE tokenisation.
 * Longest match wins. Extend freely -- this is the cheapest way to improve output quality.
 */
export const PHRASES = new Map<string, string>([
  ['how many', 'HOW-MANY'],
  ['how much', 'HOW-MUCH'],
  ['how are you', 'YOU FINE WHAT'],
  ['thank you', 'THANK-YOU'],
  ['good morning', 'MORNING GOOD'],
  ['good night', 'NIGHT GOOD'],
  ['excuse me', 'EXCUSE-ME'],
  ['my name is', 'MY NAME'],
  ['what is your name', 'YOUR NAME WHAT'],
  ['i am sorry', 'SORRY'],
  ['right now', 'NOW'],
  ['a lot', 'MANY'],
  ['want to', 'WANT'],
  ['have to', 'MUST'],
  ['need to', 'NEED'],
  ['going to', 'FUTURE'],
]);

/** Irregular English forms -> base form, applied before suffix stripping. */
export const IRREGULAR_LEMMAS = new Map<string, string>([
  ['went', 'go'], ['gone', 'go'], ['goes', 'go'],
  ['ate', 'eat'], ['eaten', 'eat'],
  ['saw', 'see'], ['seen', 'see'],
  ['said', 'say'], ['told', 'tell'],
  ['came', 'come'], ['gave', 'give'], ['took', 'take'],
  ['made', 'make'], ['knew', 'know'], ['known', 'know'],
  ['got', 'get'], ['felt', 'feel'], ['found', 'find'],
  ['drank', 'drink'], ['slept', 'sleep'], ['taught', 'teach'],
  ['bought', 'buy'], ['brought', 'bring'], ['thought', 'think'],
  ['ran', 'run'], ['wrote', 'write'], ['read', 'read'],
  ['children', 'child'], ['people', 'person'], ['men', 'man'],
  ['women', 'woman'], ['feet', 'foot'], ['teeth', 'tooth'],
  ['has', 'have'], ['have', 'have'], ['had', 'have'],
  ['im', 'i'], ["i'm", 'i'],
]);

/**
 * Strip common English inflections. Deliberately crude: a wrong lemma just means a
 * fingerspelling fallback, which is a visible, recoverable failure rather than a silent
 * mistranslation. Do not reach for a full morphology library here.
 */
export function lemmatize(word: string): string {
  const irregular = IRREGULAR_LEMMAS.get(word);
  if (irregular) return irregular;
  if (word.length <= 3) return word;

  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ses') || word.endsWith('shes') || word.endsWith('ches')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3);
    // "running" -> "run": undo consonant doubling
    const last = stem.at(-1);
    const secondLast = stem.at(-2);
    if (last && secondLast && last === secondLast && !'aeiou'.includes(last)) {
      return stem.slice(0, -1);
    }
    return stem;
  }
  if (word.endsWith('ed') && word.length > 4) {
    const stem = word.slice(0, -2);
    const last = stem.at(-1);
    const secondLast = stem.at(-2);
    if (last && secondLast && last === secondLast && !'aeiou'.includes(last)) {
      return stem.slice(0, -1);
    }
    return stem.endsWith('i') ? `${stem.slice(0, -1)}y` : stem;
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Output order of slots. THIS ARRAY IS THE ISL WORD-ORDER RULE -- if an advisor says the
 * order is wrong, this is the line to change.
 */
export const SLOT_ORDER: Slot[] = ['time', 'subject', 'object', 'verb', 'neg', 'wh', 'modifier', 'other'];

export function slotRank(slot: Slot): number {
  const rank = SLOT_ORDER.indexOf(slot);
  return rank === -1 ? SLOT_ORDER.length : rank;
}

/** Pronouns, kept (unlike most function words) because ISL uses pointing/indexing. */
export const PRONOUNS = new Set([
  'i', 'me', 'my', 'mine', 'we', 'us', 'our',
  'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'it', 'its',
]);

/** Modals that survive as their own sign rather than being dropped. */
export const MODALS = new Map<string, string>([
  ['can', 'CAN'],
  ['could', 'CAN'],
  ['must', 'MUST'],
  ['should', 'SHOULD'],
  ['may', 'MAYBE'],
  ['might', 'MAYBE'],
  ['would', 'WANT'],
  ['want', 'WANT'],
  ['need', 'NEED'],
  ['like', 'LIKE'],
]);
