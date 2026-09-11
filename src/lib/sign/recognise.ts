/**
 * Reading the manual alphabet from hand landmarks.
 *
 * The rest of the signing work in this app is output: turning a reply into
 * handshapes on a canvas. This is the other direction — someone spelling *to*
 * the camera — and it exists because of one observation. The health side of
 * this app is already running landmark detection on every frame; a person
 * signing to it is already in front of a camera being tracked. Reading their
 * hand costs one more pass over twenty-one points, and their pulse comes out
 * of the same frames at the same time. The accessibility path and the sensing
 * path share one camera rather than competing for it.
 *
 * What it does not do, stated up front because the gap matters:
 *
 *   This is fingerspelling, not sign language. ASL is a language with its own
 *   grammar, and the manual alphabet is a small borrowed corner of it used
 *   for names and unfamiliar words. Reading letters is not understanding
 *   signing, and calling it that would be a lie.
 *
 *   J and Z are movements, not shapes, and are not attempted from a still
 *   pose. M, N, S and T differ mainly in where the thumb sits inside a closed
 *   fist, which a single camera cannot see, so they are deliberately refused
 *   rather than guessed between.
 *
 * Everything is measured in ratios within the hand — a finger's tip-to-knuckle
 * span against its own length, distances against the width of the palm — so
 * the reading does not change with how close the hand is or how it is turned.
 */

import type { Landmark } from "../vision/faceRegions";

/** MediaPipe's 21-point hand, in the order it returns them. */
const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
} as const;

export type FingerName = keyof typeof FINGERS;

/**
 * Every feature is 0-1.
 *
 * Not for tidiness: the matcher weighs features against each other, so one
 * measured in palm-widths and running to three while its neighbour runs to
 * one would silently dominate the match.
 */
export interface HandFeatures {
  /** How straight each finger is, 0 fully curled to 1 fully extended. */
  extension: Record<FingerName, number>;
  /** Gap between the index and middle fingertips. 0 together, 1 wide apart. */
  spread: number;
  /** Thumb tip to index tip. Near 0 when they are touching. */
  pinch: number;
  /** How far the thumb is held out from the index knuckle. */
  thumbOut: number;
  /** How far across the palm the thumb has been folded. */
  thumbAcross: number;
}

function point(lm: Landmark[], i: number): { x: number; y: number } {
  return { x: lm[i].x, y: lm[i].y };
}

function gap(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Turn twenty-one points into the handful of numbers a letter depends on.
 *
 * Returns null for a hand that is not all there, rather than working from
 * whatever landmarks did arrive: a partly detected hand produces plausible
 * features for the wrong shape, which is worse than no letter.
 */
export function handFeatures(lm: Landmark[]): HandFeatures | null {
  if (lm.length < 21) return null;

  // Palm width, from the index knuckle to the pinky knuckle. Every other
  // distance is expressed against this, which is what makes the reading
  // independent of how near the hand is to the lens.
  const palm = gap(point(lm, 5), point(lm, 17));
  if (palm < 1e-6) return null;

  const extension = {} as Record<FingerName, number>;
  for (const [name, joints] of Object.entries(FINGERS) as Array<
    [FingerName, readonly number[]]
  >) {
    const pts = joints.map((i) => point(lm, i));
    // A finger's own length, so a short finger is not read as a curled one.
    const length = gap(pts[0], pts[1]) + gap(pts[1], pts[2]) + gap(pts[2], pts[3]);
    if (length < 1e-6) return null;
    const span = gap(pts[0], pts[3]);
    // A fully curled finger's tip comes back to about half its length from
    // the knuckle; straight is very nearly all of it.
    extension[name] = clamp01((span / length - 0.55) / (0.97 - 0.55));
  }

  const thumbTip = point(lm, 4);
  const indexTip = point(lm, 8);
  const indexKnuckle = point(lm, 5);
  const pinkyKnuckle = point(lm, 17);

  // Folded across the palm, the thumb tip ends up nearer the pinky knuckle
  // than the index one; held out at the side of a fist it does the opposite.
  // The ratio rather than either distance, so it survives the hand tilting.
  const toIndex = gap(thumbTip, indexKnuckle);
  const toPinky = gap(thumbTip, pinkyKnuckle);
  const sideways = toIndex / Math.max(1e-6, toIndex + toPinky);

  return {
    extension,
    // The divisors are the widest each distance gets on a real hand, measured
    // in palm-widths: two for a full V, a little over one and a half for the
    // thumb tip away from the index tip.
    spread: clamp01(gap(indexTip, point(lm, 12)) / palm / 2),
    pinch: clamp01(gap(thumbTip, indexTip) / palm / 1.6),
    thumbOut: clamp01((toIndex / palm - 0.3) / 1.6),
    thumbAcross: clamp01((sideways - 0.35) / 0.35),
  };
}

interface Template {
  letter: string;
  extension: Partial<Record<FingerName, number>>;
  spread?: number;
  pinch?: number;
  thumbOut?: number;
  thumbAcross?: number;
  /** Notes shown to the user when this letter is easy to confuse. */
  near?: string;
}

/**
 * The letters a single front-facing camera can actually tell apart.
 *
 * Chosen by what is distinguishable rather than by what would make the list
 * look complete. Where two letters differ only in something the camera cannot
 * see, neither is included.
 */
const TEMPLATES: Template[] = [
  {
    letter: "A",
    extension: { thumb: 0.9, index: 0, middle: 0, ring: 0, pinky: 0 },
    thumbAcross: 0.1,
    near: "S, M, N, T",
  },
  {
    letter: "B",
    extension: { thumb: 0.4, index: 1, middle: 1, ring: 1, pinky: 1 },
    spread: 0.22,
    thumbAcross: 0.9,
  },
  {
    letter: "D",
    extension: { thumb: 0.6, index: 1, middle: 0.15, ring: 0.15, pinky: 0.15 },
    pinch: 0.35,
  },
  { letter: "F", extension: { thumb: 0.5, index: 0.2, middle: 1, ring: 1, pinky: 1 }, pinch: 0.1 },
  { letter: "I", extension: { thumb: 0.1, index: 0, middle: 0, ring: 0, pinky: 1 } },
  { letter: "L", extension: { thumb: 1, index: 1, middle: 0, ring: 0, pinky: 0 }, thumbOut: 1 },
  {
    letter: "O",
    extension: { thumb: 0.4, index: 0.35, middle: 0.35, ring: 0.35, pinky: 0.35 },
    pinch: 0.12,
    near: "C",
  },
  { letter: "U", extension: { thumb: 0.2, index: 1, middle: 1, ring: 0, pinky: 0 }, spread: 0.26 },
  { letter: "V", extension: { thumb: 0.2, index: 1, middle: 1, ring: 0, pinky: 0 }, spread: 0.95 },
  {
    letter: "W",
    extension: { thumb: 0.4, index: 1, middle: 1, ring: 1, pinky: 0 },
    spread: 0.55,
  },
  { letter: "Y", extension: { thumb: 1, index: 0, middle: 0, ring: 0, pinky: 1 }, thumbOut: 1 },
];

/** Letters this reader will not attempt, and why. */
export const UNSUPPORTED_LETTERS: Array<{ letters: string; reason: string }> = [
  { letters: "J, Z", reason: "they are movements rather than shapes" },
  {
    letters: "M, N, S, T",
    reason: "they differ only in where the thumb sits inside a closed fist, which one camera cannot see",
  },
  { letters: "C", reason: "from the front it is the same outline as O" },
  {
    letters: "E, G, H, K, P, Q, R, X",
    reason: "they need depth or a side view to separate reliably",
  },
];

export interface Reading {
  letter: string;
  /** 0-1: how close the pose was, and how far clear of the runner-up. */
  confidence: number;
  /** The letter it was nearly, when the two were close. */
  runnerUp: string | null;
  /** Letters commonly confused with this one, when there are any. */
  near: string | null;
}

/** Weighting of each feature in the match. Extension carries the shape. */
const WEIGHTS = {
  extension: 1,
  spread: 0.9,
  pinch: 0.9,
  thumbOut: 0.6,
  thumbAcross: 0.5,
};

/**
 * Match a pose against the alphabet.
 *
 * Two guards keep this honest. The best match must be genuinely close, and it
 * must be clearly better than the second best — an ambiguous pose returns
 * nothing rather than a coin flip between two letters, because a wrong letter
 * inserted confidently is worse for the person spelling than no letter at all.
 */
export function readLetter(features: HandFeatures | null): Reading | null {
  if (!features) return null;

  const scored = TEMPLATES.map((t) => ({ template: t, distance: distanceTo(features, t) })).sort(
    (a, b) => a.distance - b.distance,
  );
  const best = scored[0];
  const second = scored[1];

  // Beyond this the pose is not any of these letters.
  if (best.distance > 0.42) return null;
  const margin = second.distance - best.distance;
  if (margin < 0.08) return null;

  const closeness = 1 - best.distance / 0.42;
  const clarity = Math.min(1, margin / 0.25);

  return {
    letter: best.template.letter,
    confidence: clamp01(closeness * 0.6 + clarity * 0.4),
    runnerUp: margin < 0.2 ? second.template.letter : null,
    near: best.template.near ?? null,
  };
}

function distanceTo(f: HandFeatures, t: Template): number {
  let sum = 0;
  let weight = 0;

  for (const [name, want] of Object.entries(t.extension) as Array<[FingerName, number]>) {
    sum += WEIGHTS.extension * Math.abs(f.extension[name] - want);
    weight += WEIGHTS.extension;
  }
  const optional: Array<[number | undefined, number, number]> = [
    [t.spread, f.spread, WEIGHTS.spread],
    [t.pinch, f.pinch, WEIGHTS.pinch],
    [t.thumbOut, f.thumbOut, WEIGHTS.thumbOut],
    [t.thumbAcross, f.thumbAcross, WEIGHTS.thumbAcross],
  ];
  for (const [want, got, w] of optional) {
    if (want === undefined) continue;
    sum += w * Math.min(1, Math.abs(got - want));
    weight += w;
  }

  return weight === 0 ? 1 : sum / weight;
}

export interface SpellFrame {
  timestampMs: number;
  landmarks: Landmark[] | null;
}

export interface SpellState {
  /** Letters committed so far, as typed text. */
  text: string;
  /** The letter currently being held, before it commits. */
  candidate: string | null;
  /** 0-1 towards committing the held letter. */
  progress: number;
  confidence: number;
  /** What the held letter is nearly, when it is close to another. */
  runnerUp: string | null;
  prompt: string;
}

/** How long a shape must be held before it becomes a letter. */
const HOLD_MS = 700;
/** A hand out of frame for this long ends the word. */
const SPACE_MS = 900;
/** Below this the pose is watched but not counted towards a commit. */
const MIN_CONFIDENCE = 0.45;

/**
 * Turn a stream of hand poses into text.
 *
 * Dwell rather than detection: a letter is committed only after the same
 * shape has been held steadily, which is both how fingerspelling readers work
 * in practice and the only way to avoid emitting a letter for every
 * intermediate pose the hand passes through on its way to the next one.
 */
export class FingerspellReader {
  private committed = "";
  private held: string | null = null;
  private heldSince = 0;
  private lastConfidence = 0;
  private runnerUp: string | null = null;
  private missingSince: number | null = null;
  private mutedUntil = 0;

  reset(): void {
    this.committed = "";
    this.held = null;
    this.heldSince = 0;
    this.missingSince = null;
    this.mutedUntil = 0;
  }

  /** Take the spelt text and start a new one. */
  take(): string {
    const text = this.committed.trim();
    this.committed = "";
    this.held = null;
    return text;
  }

  push(frame: SpellFrame): SpellState {
    const now = frame.timestampMs;

    if (!frame.landmarks) {
      if (this.missingSince === null) this.missingSince = now;
      // A hand leaving the frame is how a word ends; it is the one gesture
      // that needs no handshape and cannot be mistaken for a letter.
      else if (now - this.missingSince > SPACE_MS && !this.committed.endsWith(" ") && this.committed !== "") {
        this.committed += " ";
        this.missingSince = now;
      }
      this.held = null;
      return this.state(0, "Show your hand to the camera");
    }
    this.missingSince = null;

    const reading = readLetter(handFeatures(frame.landmarks));
    if (!reading || reading.confidence < MIN_CONFIDENCE) {
      this.held = null;
      return this.state(0, reading ? "Hold the shape a little steadier" : "Not one of the letters this reads");
    }

    if (reading.letter !== this.held) {
      this.held = reading.letter;
      this.heldSince = now;
    }
    this.lastConfidence = reading.confidence;
    this.runnerUp = reading.runnerUp;

    const heldFor = now - this.heldSince;
    if (heldFor >= HOLD_MS && now >= this.mutedUntil) {
      this.committed += reading.letter;
      this.mutedUntil = now + HOLD_MS;
      this.held = null;
      return {
        text: this.committed,
        candidate: null,
        progress: 1,
        confidence: reading.confidence,
        runnerUp: null,
        prompt: `Added ${reading.letter}`,
      };
    }

    return {
      text: this.committed,
      candidate: reading.letter,
      progress: Math.min(1, heldFor / HOLD_MS),
      confidence: reading.confidence,
      runnerUp: reading.runnerUp,
      prompt: reading.runnerUp
        ? `Holding ${reading.letter} — could also be ${reading.runnerUp}`
        : `Holding ${reading.letter}`,
    };
  }

  private state(progress: number, prompt: string): SpellState {
    return {
      text: this.committed,
      candidate: null,
      progress,
      confidence: this.lastConfidence,
      runnerUp: this.runnerUp,
      prompt,
    };
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
