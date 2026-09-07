/**
 * Turning a written reply into something to sign.
 *
 * Two mechanisms, used for what each is actually good at. Words with a sign
 * get the sign. Everything else that matters — names, drug names, the
 * measurements this application exists to produce — gets fingerspelled, which
 * is exactly what a signer does with those words in real conversation.
 *
 * ## The honest limit
 *
 * Nothing here is translation. ASL word order is not English word order: it
 * is topic-comment, time is established first, verbs move between points in
 * space to show who did what to whom, and whole classes of meaning are
 * carried by classifiers that have no English word to trigger them. Walking
 * an English sentence left to right and swapping in signs produces something
 * closer to Signed Exact English, which fluent signers find laborious to read
 * and which is not the language they use.
 *
 * That is why the output is deliberately framed as **key signs alongside the
 * caption** rather than as an interpretation. Function words are dropped
 * rather than signed, because signing "the" and "of" would add length without
 * adding meaning and would make the claim to be interpreting louder while
 * making it less true.
 */

import { spellableTerms } from "./schedule";
import { LEXICON, MAX_TRIGGER_WORDS, signFor, type Sign } from "./lexicon";

/**
 * The question marking that runs across a whole clause.
 *
 * In ASL this is grammar carried on the face, not punctuation and not mood.
 * Raised brows over the whole clause make it a yes/no question; drawn-together
 * brows make it a wh-question. A signed question with a neutral face is not a
 * politely neutral question, it is a statement.
 */
export type Marking = "none" | "yes-no" | "wh";

export type Segment =
  | { kind: "sign"; sign: Sign; source: string; marking: Marking }
  | { kind: "spell"; text: string; marking: Marking }
  | { kind: "pause" };

/**
 * English words that carry grammar rather than meaning.
 *
 * ASL has no articles and no copula, and marks most of what English does with
 * prepositions through where a sign is placed instead. Signing these one by
 * one would be padding.
 */
const FUNCTION_WORDS = new Set([
  "a", "an", "the", "is", "are", "am", "was", "were", "be", "been", "being",
  "of", "to", "in", "on", "at", "for", "with", "from", "by", "as", "that",
  "this", "these", "those", "it", "its", "and", "or", "but", "so", "if",
  "then", "than", "there", "here", "will", "would", "can", "could", "should",
  "do", "does", "did", "have", "has", "had", "just", "very", "really", "some",
  "any", "about", "up", "out", "into", "over", "still", "also", "too",
]);

/**
 * A word.
 *
 * Dots and slashes are allowed *inside* a word, because "3.5" and "mg/dl" are
 * single terms worth spelling as one unit, but only when another character
 * follows. Letting a trailing dot into the match swallows the full stop, and
 * the sentence boundary along with it.
 */
const WORD = /[A-Za-z0-9](?:[A-Za-z0-9'’-]|[./](?=[A-Za-z0-9]))*/g;

/** Sentence-final punctuation, which becomes a pause rather than being dropped. */
const BREAK = /[.!?;:,]/;

/**
 * Words that make a question a wh-question rather than a yes/no one.
 *
 * The distinction matters because the two take opposite brow positions, and
 * getting it backwards is a grammatical error rather than a cosmetic one.
 */
const WH_WORDS = /\b(what|who|whom|whose|where|when|why|which|how)\b/i;

interface Token {
  text: string;
  /** True when the token was followed by punctuation worth pausing on. */
  breakAfter: boolean;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(WORD.source, "g");
  while ((match = pattern.exec(text)) !== null) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 2);
    tokens.push({ text: match[0], breakAfter: BREAK.test(after) });
  }
  return tokens;
}

function looksNumeric(word: string): boolean {
  return /\d/.test(word);
}

export interface ComposeOptions {
  /**
   * Spell words that have no sign, rather than skipping them.
   *
   * Off by default. Fingerspelling every unmatched word turns a sentence into
   * a minute of letters, which is slower to read than the caption sitting
   * next to it. On, it is a complete rendering for someone who wants one.
   */
  spellUnknown?: boolean;
  /** Cap on segments, so a long reply does not run for two minutes. */
  limit?: number;
}

/**
 * Break a reply into signs and spelled terms.
 *
 * Multi-word triggers are matched first and longest-first, so "thank you"
 * becomes one sign rather than THANK followed by YOU, and "right now"
 * becomes NOW rather than the unrelated sense of "right".
 */
export function compose(text: string, options: ComposeOptions = {}): Segment[] {
  const { spellUnknown = false, limit = 24 } = options;
  const segments: Segment[] = [];
  for (const sentence of splitSentences(text)) {
    if (segments.length >= limit) break;
    composeSentence(sentence, spellUnknown, limit, segments);
  }

  // A trailing pause is a wait with nothing after it.
  while (segments.length > 0 && segments[segments.length - 1].kind === "pause") segments.pop();

  return segments;
}

/** Split on sentence-final punctuation, keeping it so the marking survives. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function markingOf(sentence: string): Marking {
  if (!sentence.trimEnd().endsWith("?")) return "none";
  return WH_WORDS.test(sentence) ? "wh" : "yes-no";
}

function composeSentence(
  text: string,
  spellUnknown: boolean,
  limit: number,
  segments: Segment[],
): void {
  const marking = markingOf(text);
  const tokens = tokenize(text);

  // Numbers and names are worth spelling even when the rest is skipped:
  // they are the content a caption reader would most want confirmed, and the
  // reason fingerspelling exists in the language at all.
  const worthSpelling = new Set(
    spellableTerms(text, 8).map((term) => term.toLowerCase()),
  );

  let i = 0;
  while (i < tokens.length && segments.length < limit) {
    let matched = false;

    for (let span = Math.min(MAX_TRIGGER_WORDS, tokens.length - i); span >= 1; span--) {
      const phrase = tokens
        .slice(i, i + span)
        .map((t) => t.text.toLowerCase())
        .join(" ");
      const sign = signFor(phrase);
      if (sign) {
        segments.push({ kind: "sign", sign, source: phrase, marking });
        if (tokens[i + span - 1].breakAfter) segments.push({ kind: "pause" });
        i += span;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const token = tokens[i];
    const lower = token.text.toLowerCase();
    const spell =
      looksNumeric(token.text) ||
      worthSpelling.has(lower) ||
      (spellUnknown && !FUNCTION_WORDS.has(lower));

    if (spell) {
      segments.push({ kind: "spell", text: token.text.toUpperCase(), marking });
      if (token.breakAfter) segments.push({ kind: "pause" });
    }

    i += 1;
  }
}

/** A written gloss of what is being signed, for the caption strip. */
export function glossOf(segments: Segment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === "sign") return segment.sign.gloss;
      if (segment.kind === "spell") return `${segment.text}`;
      return "·";
    })
    .join(" ");
}

/** How much of a reply the lexicon actually covers, for the honesty note. */
export function coverage(text: string): { signed: number; spelled: number; skipped: number } {
  const tokens = tokenize(text);
  const segments = compose(text, { limit: Number.MAX_SAFE_INTEGER });
  const signed = segments.filter((s) => s.kind === "sign").length;
  const spelled = segments.filter((s) => s.kind === "spell").length;
  return { signed, spelled, skipped: Math.max(0, tokens.length - signed - spelled) };
}

export { LEXICON };
