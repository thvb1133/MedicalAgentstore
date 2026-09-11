/**
 * The ASL manual alphabet and numbers, as poses for the parametric hand.
 *
 * Scope, stated plainly, because this is the part that is easy to overclaim.
 * This is **fingerspelling**. It is not American Sign Language. ASL is a full
 * language with its own grammar, where meaning is carried by movement, by
 * facial expression, by where a sign is placed in the space in front of the
 * signer, and by both hands at once. None of that is here, and a single hand
 * in neutral space cannot produce it.
 *
 * What fingerspelling is genuinely for is exactly what this application
 * produces: names, medical terms, and numbers. Deaf signers fingerspell those
 * in ordinary conversation. So the alphabet is offered for the words that
 * warrant it rather than pretending to sign whole sentences, and the
 * interface says which it is doing.
 *
 * Letters marked `approximate` need one finger to cross behind or hook over
 * another, which a hand flexed in a single plane cannot represent. They are
 * flagged rather than quietly shipped as correct, and the interface shows the
 * flag, because a reader who knows the shape is wrong can compensate and a
 * reader who has been told it is right cannot.
 */

import type { DigitPose, HandPose, PalmFacing, ThumbPose } from "./hand";

export interface SignEntry {
  /** The character this spells. */
  glyph: string;
  pose: HandPose;
  /**
   * Movement, as offsets in hand-length units sampled over the hold. J and Z
   * are defined by their path; without it they are just I and a pointed
   * index.
   */
  motion?: Array<{ x: number; y: number }>;
  /** True where the flat model cannot reproduce the real handshape. */
  approximate?: boolean;
}

function f(curl: number, spread = 0, hook = 0): DigitPose {
  return { curl, spread, hook };
}

function thumb(curl: number, abduction: number, across: number): ThumbPose {
  return { curl, abduction, across };
}

function pose(
  fingers: [DigitPose, DigitPose, DigitPose, DigitPose],
  t: ThumbPose,
  facing: PalmFacing = "front",
  rotation = 0,
): HandPose {
  return { fingers, thumb: t, facing, rotation };
}

/** A closed fist, the base for the many letters that modify one. */
const FIST: [DigitPose, DigitPose, DigitPose, DigitPose] = [f(1), f(1), f(1), f(1)];

/** Fingers straight and held together, cancelling the resting splay. */
const TOGETHER: [DigitPose, DigitPose, DigitPose, DigitPose] = [
  f(0, 6),
  f(0, 2),
  f(0, -3),
  f(0, -9),
];

const LETTERS: Record<string, SignEntry> = {
  A: { glyph: "A", pose: pose(FIST, thumb(0.15, 0.12, 0.05)) },
  B: { glyph: "B", pose: pose(TOGETHER, thumb(0.35, 0, 0.95)) },
  C: {
    glyph: "C",
    pose: pose([f(0.42, 2), f(0.42, 0), f(0.42, -1), f(0.44, -4)], thumb(0.32, 0.5, 0.1), "side"),
  },
  D: {
    glyph: "D",
    pose: pose([f(0, 4), f(0.82, -4), f(0.84, -2), f(0.86, -4)], thumb(0.34, 0.16, 0.44)),
  },
  E: {
    glyph: "E",
    pose: pose([f(0.74, 4), f(0.74, 1), f(0.74, -2), f(0.76, -7)], thumb(0.58, 0, 0.78)),
  },
  F: {
    glyph: "F",
    pose: pose([f(0.62, 6), f(0, 0), f(0, -2), f(0, -6)], thumb(0.46, 0.18, 0.36)),
  },
  G: {
    glyph: "G",
    pose: pose([f(0, 0), f(1), f(1), f(1)], thumb(0.18, 0.46, 0.06), "side", -68),
  },
  H: {
    glyph: "H",
    pose: pose([f(0, 4), f(0, -3), f(1), f(1)], thumb(0.5, 0, 0.6), "side", -68),
  },
  I: { glyph: "I", pose: pose([f(1), f(1), f(1), f(0, -6)], thumb(0.5, 0, 0.62)) },
  J: {
    glyph: "J",
    pose: pose([f(1), f(1), f(1), f(0, -6)], thumb(0.5, 0, 0.62)),
    // The little finger traces a J: down, then a hook to the left and up.
    motion: [
      { x: 0, y: 0 },
      { x: 0.02, y: 0.16 },
      { x: -0.1, y: 0.24 },
      { x: -0.2, y: 0.14 },
      { x: -0.2, y: 0.02 },
    ],
  },
  K: {
    glyph: "K",
    pose: pose([f(0, -9), f(0, 11), f(1), f(1)], thumb(0.26, 0.34, 0.34)),
  },
  L: { glyph: "L", pose: pose([f(0, 2), f(1), f(1), f(1)], thumb(0.02, 1, 0)) },
  M: {
    glyph: "M",
    pose: pose([f(0.86, 3), f(0.86, 0), f(0.86, -3), f(0.92, -8)], thumb(0.68, 0, 0.48)),
    approximate: true,
  },
  N: {
    glyph: "N",
    pose: pose([f(0.86, 3), f(0.86, -1), f(0.95, -4), f(0.96, -9)], thumb(0.68, 0, 0.4)),
    approximate: true,
  },
  O: {
    glyph: "O",
    pose: pose([f(0.58, 5), f(0.58, 2), f(0.58, -2), f(0.6, -7)], thumb(0.44, 0.38, 0.32), "side"),
  },
  P: {
    glyph: "P",
    pose: pose([f(0, -9), f(0, 11), f(1), f(1)], thumb(0.26, 0.34, 0.34), "front", 155),
  },
  Q: {
    glyph: "Q",
    pose: pose([f(0, 0), f(1), f(1), f(1)], thumb(0.18, 0.46, 0.06), "side", 158),
  },
  R: {
    glyph: "R",
    pose: pose([f(0.06, 5), f(0.06, -6), f(1), f(1)], thumb(0.5, 0, 0.6)),
    approximate: true,
  },
  S: { glyph: "S", pose: pose(FIST, thumb(0.45, 0, 0.88)) },
  T: {
    glyph: "T",
    pose: pose([f(0.9, 4), f(0.92, -2), f(0.94, -3), f(0.95, -8)], thumb(0.34, 0.08, 0.3)),
    approximate: true,
  },
  U: {
    glyph: "U",
    pose: pose([f(0, 5), f(0, -3), f(1), f(1)], thumb(0.5, 0, 0.6)),
  },
  V: {
    glyph: "V",
    pose: pose([f(0, -13), f(0, 13), f(1), f(1)], thumb(0.5, 0, 0.6)),
  },
  W: {
    glyph: "W",
    pose: pose([f(0, -9), f(0, 0), f(0, 9), f(1)], thumb(0.52, 0, 0.56)),
  },
  X: {
    glyph: "X",
    // A raised index with a hooked tip. Curling the whole finger instead
    // would make this the same picture as S.
    pose: pose([f(0.05, 2, 0.85), f(1), f(1), f(1)], thumb(0.5, 0, 0.6)),
  },
  Y: {
    glyph: "Y",
    pose: pose([f(1), f(1), f(1), f(0, 16)], thumb(0.02, 1, 0)),
  },
  Z: {
    glyph: "Z",
    pose: pose([f(0, 0), f(1), f(1), f(1)], thumb(0.5, 0, 0.55)),
    // The index draws a Z in the air: across, diagonally back, across again.
    motion: [
      { x: -0.14, y: -0.1 },
      { x: 0.14, y: -0.1 },
      { x: -0.14, y: 0.12 },
      { x: 0.14, y: 0.12 },
    ],
  },
};

/**
 * Numbers, which are the whole reason this is worth having here.
 *
 * A tool whose output is "your heart rate is seventy-two" has an obvious need
 * for the digits, and they are unambiguous, one-handed, and stationary — the
 * part of the manual alphabet this model represents most faithfully.
 */
const NUMBERS: Record<string, SignEntry> = {
  "0": LETTERS.O,
  "1": { glyph: "1", pose: pose([f(0, 0), f(1), f(1), f(1)], thumb(0.5, 0, 0.6)) },
  "2": { glyph: "2", pose: pose([f(0, -13), f(0, 13), f(1), f(1)], thumb(0.5, 0, 0.6)) },
  "3": {
    glyph: "3",
    pose: pose([f(0, -6), f(0, 8), f(1), f(1)], thumb(0.05, 0.9, 0)),
  },
  "4": { glyph: "4", pose: pose([f(0, -8), f(0, -2), f(0, 4), f(0, 10)], thumb(0.5, 0, 0.7)) },
  "5": { glyph: "5", pose: pose([f(0, -10), f(0, -3), f(0, 5), f(0, 13)], thumb(0.05, 1, 0)) },
  "6": {
    glyph: "6",
    pose: pose([f(0, -6), f(0, 0), f(0, 6), f(0.6, -8)], thumb(0.42, 0.2, 0.3)),
  },
  "7": {
    glyph: "7",
    pose: pose([f(0, -6), f(0, 0), f(0.6, 4), f(0, 8)], thumb(0.42, 0.22, 0.28)),
  },
  "8": {
    glyph: "8",
    pose: pose([f(0, -6), f(0.62, 0), f(0, 4), f(0, 9)], thumb(0.44, 0.2, 0.3)),
  },
  "9": {
    glyph: "9",
    pose: pose([f(0.62, 6), f(0, 0), f(0, -2), f(0, -6)], thumb(0.46, 0.18, 0.36)),
  },
};

export const SIGNS: Record<string, SignEntry> = { ...LETTERS, ...NUMBERS };

/** The hand at rest between words, and before anything is being spelled. */
export const RESTING: HandPose = pose(
  [f(0.24, -4), f(0.26, -1), f(0.3, 3), f(0.34, 8)],
  thumb(0.28, 0.34, 0.12),
  "side",
);

export function signFor(character: string): SignEntry | null {
  return SIGNS[character.toUpperCase()] ?? null;
}

/** Letters whose drawn shape is known to differ from the real handshape. */
export const APPROXIMATE_GLYPHS = Object.values(SIGNS)
  .filter((s) => s.approximate)
  .map((s) => s.glyph)
  .filter((g, i, all) => all.indexOf(g) === i)
  .sort();

export interface SpelledUnit {
  /** The character, or a space. */
  glyph: string;
  entry: SignEntry | null;
}

/**
 * Turn text into a sequence to fingerspell.
 *
 * Anything with no handshape becomes a pause rather than being dropped.
 * Silently skipping punctuation would run two sentences together, and the
 * gaps between words are the only sentence structure fingerspelling has.
 */
export function toFingerspelling(text: string): SpelledUnit[] {
  const units: SpelledUnit[] = [];
  for (const character of text) {
    const entry = signFor(character);
    if (entry) {
      units.push({ glyph: character.toUpperCase(), entry });
    } else if (units.length > 0 && units[units.length - 1].entry !== null) {
      // Collapse any run of spaces and punctuation into a single pause.
      units.push({ glyph: " ", entry: null });
    }
  }
  // A trailing pause adds nothing but a wait at the end.
  while (units.length > 0 && units[units.length - 1].entry === null) units.pop();
  return units;
}
