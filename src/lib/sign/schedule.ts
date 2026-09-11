/**
 * Turning a string into a hand that moves.
 *
 * Kept separate from the renderer and free of any canvas, so the timing can be
 * tested directly — "what is the hand doing 1.4 seconds in" is a question with
 * one right answer, and it should not require a browser to ask it.
 *
 * The timing model is the part that decides whether this is readable. Each
 * letter gets a transition and then a hold, and the transition is not dead
 * time: a fingerspelling reader follows the movement between shapes as much as
 * the shapes themselves, which is why cutting between stills is so much harder
 * to read than the same letters at the same rate with the travel drawn in.
 *
 * Double letters get a deliberate dip. Without one, "LL" is a hand that does
 * not move for two beats, and the reader has no way to know whether they saw
 * one letter or two.
 */

import { blendPoses, easeInOut, type HandPose } from "./hand";
import { RESTING, type SpelledUnit } from "./alphabet";

/** Share of each letter's slot spent travelling into the shape. */
const TRANSITION_SHARE = 0.42;

/** A pause between words, relative to a letter's slot. */
const PAUSE_SHARE = 0.85;

export interface SigningFrame {
  pose: HandPose;
  /** Offset in hand-length units, for letters defined by their path. */
  offset: { x: number; y: number };
  /** Index into the unit list, or -1 before the first letter. */
  index: number;
  /** The character currently being formed, or null during a pause. */
  glyph: string | null;
  /** True once the whole string has been spelled. */
  finished: boolean;
}

/** How long each unit occupies, in seconds. */
function slotFor(unit: SpelledUnit, lettersPerSecond: number): number {
  const base = 1 / Math.max(0.4, lettersPerSecond);
  return unit.entry === null ? base * PAUSE_SHARE : base;
}

export function totalDuration(units: SpelledUnit[], lettersPerSecond: number): number {
  return units.reduce((sum, unit) => sum + slotFor(unit, lettersPerSecond), 0);
}

function sampleMotion(
  path: Array<{ x: number; y: number }>,
  t: number,
): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return path[0];
  const scaled = Math.min(0.999, Math.max(0, t)) * (path.length - 1);
  const i = Math.floor(scaled);
  const local = scaled - i;
  const a = path[i];
  const b = path[i + 1];
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}

/**
 * The hand at a moment in time.
 *
 * `time` is seconds since spelling started. Past the end it settles at rest,
 * which is where a signer's hand goes and also the clearest possible signal
 * that there is nothing more coming.
 */
export function frameAt(
  units: SpelledUnit[],
  time: number,
  lettersPerSecond: number,
): SigningFrame {
  if (units.length === 0 || time < 0) {
    return { pose: RESTING, offset: { x: 0, y: 0 }, index: -1, glyph: null, finished: units.length === 0 };
  }

  let elapsed = 0;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const slot = slotFor(unit, lettersPerSecond);

    if (time >= elapsed + slot) {
      elapsed += slot;
      continue;
    }

    const local = (time - elapsed) / slot;

    if (unit.entry === null) {
      // A pause: travel back to rest and stay there for the rest of the slot.
      const previous = previousPose(units, i);
      const t = easeInOut(Math.min(1, local / TRANSITION_SHARE));
      return {
        pose: blendPoses(previous, RESTING, t),
        offset: { x: 0, y: 0 },
        index: i,
        glyph: null,
        finished: false,
      };
    }

    const target = unit.entry.pose;
    const previous = previousPose(units, i);

    // A repeated letter needs a visible break, or two of them look like one.
    const repeated = i > 0 && units[i - 1].entry?.glyph === unit.entry.glyph;

    let pose: HandPose;
    if (local < TRANSITION_SHARE) {
      const t = easeInOut(local / TRANSITION_SHARE);
      pose = repeated
        ? // Dip toward rest and back, rather than travelling from a shape that
          // is already the destination.
          blendPoses(target, RESTING, Math.sin(t * Math.PI) * 0.45)
        : blendPoses(previous, target, t);
    } else {
      pose = target;
    }

    const holdProgress = Math.max(0, (local - TRANSITION_SHARE) / (1 - TRANSITION_SHARE));
    const offset = unit.entry.motion
      ? sampleMotion(unit.entry.motion, holdProgress)
      : { x: 0, y: 0 };

    return { pose, offset, index: i, glyph: unit.entry.glyph, finished: false };
  }

  return {
    pose: RESTING,
    offset: { x: 0, y: 0 },
    index: units.length,
    glyph: null,
    finished: true,
  };
}

function previousPose(units: SpelledUnit[], index: number): HandPose {
  for (let i = index - 1; i >= 0; i--) {
    const entry = units[i].entry;
    if (entry) return entry.pose;
    // A pause resets the hand, so the letter after one starts from rest.
    return RESTING;
  }
  return RESTING;
}

/**
 * Words worth fingerspelling out of a spoken reply.
 *
 * Fingerspelling a whole sentence is not what fingerspelling is for — a Deaf
 * reader would far rather read the caption. What it is genuinely for is the
 * things captions handle worst: numbers, units, and names. So the default is
 * to pull those out and spell them, alongside the full caption, rather than
 * grinding through every article and preposition at two letters a second.
 */
export function spellableTerms(text: string, limit = 6): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();

  // Numbers with an optional unit attached: "72 bpm", "118/76".
  const patterns = [
    /\b\d+(?:[./]\d+)*\s*(?:bpm|mmhg|ms|hz|db|kg|cm|%)?/gi,
    // Capitalised words that are not sentence-initial, which is the cheapest
    // available signal for a name.
    /(?<!^)(?<![.!?]\s)\b[A-Z][a-z]{2,}\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const term = match[0].trim();
      const key = term.toLowerCase();
      if (!term || seen.has(key)) continue;
      seen.add(key);
      terms.push(term);
      if (terms.length >= limit) return terms;
    }
  }

  return terms;
}
