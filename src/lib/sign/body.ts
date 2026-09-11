/**
 * The signer's body, and the space in front of it.
 *
 * Fingerspelling needed a hand and nothing else. A sign needs a body, because
 * *where* a sign is made is part of what it means. The handshape for SICK and
 * the handshape for FEEL are near enough identical; one is at the forehead and
 * one strokes up the chest, and that placement is the entire difference. A
 * floating hand cannot carry it.
 *
 * So signs are written against named anchors — FOREHEAD, CHIN, HEART — the
 * same way a signer would describe them to another signer, rather than as raw
 * coordinates. That makes the lexicon readable and checkable by someone who
 * knows ASL and does not want to read arithmetic.
 *
 * Coordinates are body units with the origin at the centre of the chest,
 * y increasing downward. The figure faces the viewer, which means the
 * signer's right hand appears on the *left* of the screen — the same way a
 * signer sitting opposite you appears, and the way instructional material is
 * filmed.
 */

export interface Point {
  x: number;
  y: number;
}

export const HEAD_CENTER: Point = { x: 0, y: -1.02 };
export const HEAD_RADIUS = 0.31;

export const SHOULDER_RIGHT: Point = { x: -0.44, y: -0.44 };
export const SHOULDER_LEFT: Point = { x: 0.44, y: -0.44 };

/** Upper arm and forearm, in body units. Together they bound the reach. */
export const UPPER_ARM = 0.56;
export const FOREARM = 0.53;

/**
 * Hand length in body units.
 *
 * A real hand is about four fifths the height of a face, which with a head
 * radius of 0.31 puts it near 0.5. Drawn slightly under that, because this
 * hand model has chunkier digits than a real one and reads as oversized at
 * its true proportion.
 */
export const HAND_SCALE = 0.43;

/**
 * Named locations in signing space.
 *
 * Right and left are the *signer's*, so RIGHT is negative x — on the viewer's
 * left. Getting this backwards mirrors every sign in the lexicon, which is
 * the kind of error that looks like a rendering bug and is actually a
 * linguistic one.
 */
export const ANCHORS = {
  forehead: { x: 0, y: -1.3 },
  templeRight: { x: -0.3, y: -1.24 },
  eyeRight: { x: -0.14, y: -1.08 },
  nose: { x: 0, y: -0.98 },
  cheekRight: { x: -0.27, y: -0.94 },
  earRight: { x: -0.34, y: -1.0 },
  mouth: { x: 0, y: -0.84 },
  chin: { x: 0, y: -0.74 },
  neck: { x: 0, y: -0.56 },
  shoulderRight: { x: -0.4, y: -0.42 },
  shoulderLeft: { x: 0.4, y: -0.42 },
  upperChest: { x: 0, y: -0.3 },
  chest: { x: 0, y: -0.12 },
  heart: { x: -0.2, y: -0.16 },
  stomach: { x: 0, y: 0.34 },
  /** Neutral space: in front of the torso, where most signs live. */
  neutral: { x: 0, y: -0.02 },
  neutralRight: { x: -0.34, y: -0.02 },
  neutralLeft: { x: 0.34, y: -0.02 },
  neutralHigh: { x: 0, y: -0.3 },
  neutralLow: { x: 0, y: 0.26 },
  /** Where the hands hang when nothing is being signed. */
  restRight: { x: -0.5, y: 0.56 },
  restLeft: { x: 0.5, y: 0.56 },
} as const;

export type AnchorName = keyof typeof ANCHORS;

/** An anchor, optionally nudged. Signs are written as "chin, a little left". */
export function at(anchor: AnchorName, dx = 0, dy = 0): Point {
  const base = ANCHORS[anchor];
  return { x: base.x + dx, y: base.y + dy };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ArmGeometry {
  shoulder: Point;
  elbow: Point;
  wrist: Point;
  /** True when the target was out of reach and the wrist had to be pulled in. */
  strained: boolean;
}

/**
 * Where the elbow goes, given a shoulder and a wrist.
 *
 * Two-bone inverse kinematics, closed form. Without arms the avatar is two
 * hands floating in front of a torso, which reads as a glitch rather than as
 * a person; with them, placement becomes legible because you can see the hand
 * is at the forehead rather than merely near it.
 *
 * The elbow is placed on the outward side of the shoulder-to-wrist line. Both
 * solutions are anatomically reachable, but only one is what a person does —
 * elbows drop away from the body rather than tucking across it.
 */
export function solveArm(shoulder: Point, wrist: Point, side: "right" | "left"): ArmGeometry {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  const raw = Math.hypot(dx, dy);

  // Both fully-straight and fully-folded have no solution, so keep a margin.
  const reach = UPPER_ARM + FOREARM;
  const minimum = Math.abs(UPPER_ARM - FOREARM) + 0.02;
  const distance = clamp(raw, minimum, reach - 0.02);
  const strained = raw > reach - 0.02;

  // If the target is out of reach, pull the wrist in along the same direction
  // rather than letting the arm detach from the shoulder.
  const unit = raw < 1e-6 ? { x: 0, y: 1 } : { x: dx / raw, y: dy / raw };
  const effectiveWrist = strained
    ? { x: shoulder.x + unit.x * distance, y: shoulder.y + unit.y * distance }
    : wrist;

  const a = (UPPER_ARM * UPPER_ARM - FOREARM * FOREARM + distance * distance) / (2 * distance);
  const h = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - a * a));

  const mid = { x: shoulder.x + unit.x * a, y: shoulder.y + unit.y * a };
  const perpendicular = { x: -unit.y * h, y: unit.x * h };

  /*
   * Two elbows solve every reachable target; only one is what a person does.
   *
   * The dominant rule is that elbows hang. Reaching for the forehead, the
   * elbow drops toward the ribs — it does not swing up level with the ear,
   * and it certainly does not fold in behind the chest, which is what
   * picking a fixed side of the line produces for any target above the
   * shoulder.
   *
   * Height alone is ambiguous when the arm points straight up or straight
   * down, because then both solutions sit at the same height. So outward
   * distance from the midline breaks the tie, which is the other thing
   * elbows do: they stay clear of the torso.
   */
  const candidates = [
    { x: mid.x + perpendicular.x, y: mid.y + perpendicular.y },
    { x: mid.x - perpendicular.x, y: mid.y - perpendicular.y },
  ];
  const outward = (p: Point) => (side === "right" ? -p.x : p.x);
  const score = (p: Point) => p.y + 0.3 * outward(p);
  const elbow = score(candidates[0]) >= score(candidates[1]) ? candidates[0] : candidates[1];

  return { shoulder, elbow, wrist: effectiveWrist, strained };
}

/**
 * Non-manual markers.
 *
 * These are not decoration. In ASL they are grammar: raised brows mark a
 * yes/no question, a head shake negates the clause it runs across, and a
 * furrowed brow marks a wh-question. A signing avatar with a blank face is
 * not a signing avatar producing neutral sentences — it is one producing
 * sentences with the grammar stripped out.
 *
 * What is here is a small subset, enough to carry question, negation and
 * affect on single signs. It is not the full inventory.
 */
export interface FaceState {
  /** -1 furrowed, 0 neutral, +1 raised. */
  brows: number;
  /** Side to side, for negation. Radians of rotation. */
  headTurn: number;
  /** Forward and back, for affirmation. */
  headNod: number;
  mouth: MouthShape;
  /** Eyes narrowed, for effort or pain. */
  squint: number;
}

export type MouthShape = "neutral" | "open" | "oo" | "smile" | "frown" | "tight";

export const NEUTRAL_FACE: FaceState = {
  brows: 0,
  headTurn: 0,
  headNod: 0,
  mouth: "neutral",
  squint: 0,
};

export function face(partial: Partial<FaceState>): FaceState {
  return { ...NEUTRAL_FACE, ...partial };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function blendFace(a: FaceState, b: FaceState, t: number): FaceState {
  return {
    brows: lerp(a.brows, b.brows, t),
    headTurn: lerp(a.headTurn, b.headTurn, t),
    headNod: lerp(a.headNod, b.headNod, t),
    squint: lerp(a.squint, b.squint, t),
    // A mouth shape is categorical; there is no half-way between "oo" and a
    // smile, so it switches at the midpoint like palm facing does.
    mouth: t < 0.5 ? a.mouth : b.mouth,
  };
}

export function blendPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
