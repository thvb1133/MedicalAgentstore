/**
 * The handshape inventory.
 *
 * ASL reuses the manual alphabet heavily — the S-hand, the B-hand, the
 * C-hand and so on are named after the letters they match — so most of this
 * is imported from `alphabet.ts` rather than duplicated. What is added here
 * are the shapes that have no letter: the flattened O, the claw, the bent
 * hand, the open palm with the middle finger dropped.
 *
 * Naming follows how signers describe handshapes, not how a programmer would.
 * A lexicon entry that reads `FLAT_O` at `mouth` is checkable by someone who
 * knows ASL and has no interest in reading joint angles.
 */

import { SIGNS } from "./alphabet";
import type { DigitPose, HandPose, PalmFacing, ThumbPose } from "./hand";

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

/** Reuse a letter's handshape under the name signers actually use for it. */
function letter(glyph: string): HandPose {
  return SIGNS[glyph].pose;
}

export const HANDSHAPES = {
  // Borrowed straight from the alphabet.
  A: letter("A"),
  B: letter("B"),
  C: letter("C"),
  D: letter("D"),
  E: letter("E"),
  F: letter("F"),
  H: letter("H"),
  I: letter("I"),
  L: letter("L"),
  N: letter("N"),
  O: letter("O"),
  S: letter("S"),
  V: letter("V"),
  W: letter("W"),
  X: letter("X"),
  Y: letter("Y"),
  ONE: letter("1"),
  FIVE: letter("5"),

  /** Flat hand, fingers together, thumb held out alongside. */
  FLAT: pose([f(0, 6), f(0, 2), f(0, -3), f(0, -9)], thumb(0.1, 0.5, 0)),

  /** Flat hand with the fingers bent at the knuckles. TIRED, AGAIN, KNOW. */
  BENT: pose([f(0, 6, 0.9), f(0, 2, 0.9), f(0, -3, 0.9), f(0, -9, 0.9)], thumb(0.35, 0.2, 0.2)),

  /** All fingers half-curled and spread. A grasping shape. */
  CLAW: pose([f(0.45, -10, 0.5), f(0.45, -3, 0.5), f(0.45, 5, 0.5), f(0.45, 13, 0.5)], thumb(0.4, 0.65, 0)),

  /** Fingers together and flattened onto the thumb. EAT, HOME, the "flat O". */
  FLAT_O: pose([f(0.55, 5), f(0.55, 2), f(0.55, -2), f(0.55, -7)], thumb(0.3, 0.1, 0.62)),

  /** Two fingers spread and hooked. The "claw V", as in the sign for hard. */
  BENT_V: pose([f(0.08, -13, 0.75), f(0.08, 13, 0.75), f(1), f(1)], thumb(0.5, 0, 0.6)),

  /**
   * Open hand with the middle finger dropped toward the palm.
   *
   * Carries a whole family of feeling and contact signs — FEEL, SICK,
   * TOUCH, MEDICINE — where the bent middle finger is what makes contact.
   */
  MIDDLE: pose([f(0, -10), f(0.62, -3), f(0, 5), f(0, 13)], thumb(0.1, 0.75, 0)),

  /** Both middle fingers bent, used two-handed for feeling and for the heart. */
  BOTH_MIDDLE: pose([f(0, -10), f(0.72, -3), f(0, 5), f(0, 13)], thumb(0.15, 0.7, 0)),

  /** Index and middle extended and together, pointing. Used for looking. */
  TWO: pose([f(0, 5), f(0, -3), f(1), f(1)], thumb(0.5, 0, 0.6)),

  /** Index, thumb and little finger out. I-love-you, and the sign for airplane. */
  ILY: pose([f(0, -6), f(1), f(1), f(0, 14)], thumb(0.02, 1, 0)),

  /** Relaxed, hanging. What the hands do between signs. */
  REST: pose([f(0.26, -4), f(0.28, -1), f(0.32, 3), f(0.36, 8)], thumb(0.3, 0.32, 0.12), "side"),
} as const;

export type HandshapeName = keyof typeof HANDSHAPES;

/**
 * A handshape with the palm turned.
 *
 * Palm orientation is phonemic in ASL — the same handshape in the same place
 * is a different sign depending on which way the palm faces — but this flat
 * model has only three facings and a wrist rotation to say it with. That is a
 * real limitation of drawing in a plane, and it is why some signs in the
 * lexicon are marked as approximations.
 */
export function turned(
  shape: HandshapeName,
  facing: PalmFacing,
  rotation = 0,
): HandPose {
  return { ...HANDSHAPES[shape], facing, rotation };
}

export function rotated(shape: HandshapeName, rotation: number): HandPose {
  return { ...HANDSHAPES[shape], rotation };
}
