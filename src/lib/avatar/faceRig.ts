/**
 * Reading a face out of a set of landmarks, and turning an expression into
 * somewhere for the pixels to go.
 *
 * The landmarks arrive from `scripts/build-face-rigs.mjs`, which ran the
 * MediaPipe face mesh over each portrait once at build time. All this file
 * needs from those 478 points is a couple of dozen: where the mouth corners
 * are, where the lips meet, where the chin ends, where each eyelid sits. From
 * those it derives the patches to warp and the fields to warp them by.
 *
 * Everything is expressed relative to the face's own measurements — travel is
 * a fraction of the mouth's width, not a number of pixels — so the same
 * expression produces a proportionate movement on a narrow face and a broad
 * one without a per-portrait tuning table.
 */

import {
  bump,
  lattice,
  smoothstep,
  type Box,
  type Field,
  type Lattice,
  type Point,
} from "./warp";

import rigData from "./rigs.json";

export interface FaceRig {
  width: number;
  height: number;
  /** 478 normalised `[x, y]` pairs, in MediaPipe's canonical mesh order. */
  points: number[][];
}

const RIGS: Record<string, FaceRig> = rigData;

export function getRig(avatarId: string): FaceRig | null {
  return RIGS[avatarId] ?? null;
}

export function rigIds(): string[] {
  return Object.keys(RIGS);
}

/**
 * Mesh indices. These are fixed by MediaPipe's canonical face and are the
 * same on every face it has ever detected, which is what makes it safe to
 * hard-code them.
 */
const INDEX = {
  upperLipInner: 13,
  lowerLipInner: 14,
  lowerLipOuter: 17,
  mouthCornerA: 61,
  mouthCornerB: 291,
  noseBase: 2,
  chin: 152,
  /** Inner and outer corner, upper and lower lid, for each eye. */
  eyeA: { corners: [33, 133], upper: 159, lower: 145 },
  eyeB: { corners: [362, 263], upper: 386, lower: 374 },
};

interface EyeIndices {
  corners: number[];
  upper: number;
  lower: number;
}

export interface MouthAnchors {
  centre: Point;
  /** Where the lips meet with the mouth shut. Both patches hinge on this. */
  lipLine: number;
  halfWidth: number;
  noseBase: number;
  chin: number;
}

export interface EyeAnchors {
  centre: Point;
  halfWidth: number;
  upperLid: number;
  lowerLid: number;
}

function point(rig: FaceRig, index: number): Point {
  const [x, y] = rig.points[index];
  return { x, y };
}

export function mouthAnchors(rig: FaceRig): MouthAnchors {
  const a = point(rig, INDEX.mouthCornerA);
  const b = point(rig, INDEX.mouthCornerB);
  const upper = point(rig, INDEX.upperLipInner);
  const lower = point(rig, INDEX.lowerLipInner);
  return {
    centre: { x: (a.x + b.x) / 2, y: (upper.y + lower.y) / 2 },
    lipLine: (upper.y + lower.y) / 2,
    halfWidth: Math.abs(b.x - a.x) / 2,
    noseBase: point(rig, INDEX.noseBase).y,
    chin: point(rig, INDEX.chin).y,
  };
}

export function eyeAnchors(rig: FaceRig): [EyeAnchors, EyeAnchors] {
  const read = (spec: EyeIndices): EyeAnchors => {
    const [c0, c1] = spec.corners.map((i) => point(rig, i));
    const upper = point(rig, spec.upper);
    const lower = point(rig, spec.lower);
    return {
      centre: { x: (c0.x + c1.x) / 2, y: (upper.y + lower.y) / 2 },
      halfWidth: Math.abs(c1.x - c0.x) / 2,
      upperLid: upper.y,
      lowerLid: lower.y,
    };
  };
  return [read(INDEX.eyeA), read(INDEX.eyeB)];
}

/**
 * How far things travel at full strength, as fractions of the mouth's width.
 *
 * These are the numbers that decide whether the presenter looks like it is
 * talking or like it is chewing, and they were set by watching rather than by
 * deriving. The jaw figure is the one that matters: too little and the face
 * mumbles, too much and the chin detaches from the neck.
 */
const TRAVEL = {
  /** Total gap between the lips at a fully open "ah". */
  jaw: 0.46,
  /** The lower jaw does most of the work; the upper lip barely lifts. */
  upperShare: 0.2,
  /** Sideways movement of the corners between a rounded and a wide mouth. */
  spread: 0.1,
  /**
   * How far the corners come in as the mouth opens.
   *
   * Easy to leave out and very obvious once it is missing: a mouth that keeps
   * its full width while the jaw drops turns into a letterbox. A real one
   * narrows, because the same length of lip now has to go round a taller
   * opening.
   */
  narrow: 0.085,
} as const;

export interface Expression {
  /** 0 shut, 1 fully open. */
  jaw: number;
  /** -1 rounded as in "oo", 0 neutral, 1 wide as in "ee". */
  spread: number;
  /** 0 open, 1 shut. */
  blink: number;
}

export const NEUTRAL: Expression = { jaw: 0, spread: 0, blink: 0 };

export interface MouthPatches {
  upper: Lattice;
  lower: Lattice;
  anchors: MouthAnchors;
}

/**
 * The two patches either side of the lips.
 *
 * They are separate because the thing between them has to be allowed to come
 * apart. A single lattice spanning the mouth would have to stretch the closed
 * lips into a smear to open them; two patches with a free seam let the upper
 * lip lift, the jaw drop, and the dark of the mouth show through the gap that
 * appears.
 *
 * Every other edge is pinned, so the patches meet the rest of the photograph
 * exactly however far the mouth opens.
 */
export function mouthPatches(rig: FaceRig, cols = 10, rows = 5): MouthPatches {
  const anchors = mouthAnchors(rig);
  const halfSpan = anchors.halfWidth * 1.95;
  const x = anchors.centre.x - halfSpan;
  const w = halfSpan * 2;

  const aboveLip = anchors.lipLine - anchors.noseBase;
  const upperTop = anchors.noseBase - aboveLip * 0.3;
  const belowLip = anchors.chin - anchors.lipLine;
  const lowerBottom = anchors.chin + belowLip * 0.35;

  const upperBox: Box = { x, y: upperTop, w, h: anchors.lipLine - upperTop };
  const lowerBox: Box = { x, y: anchors.lipLine, w, h: lowerBottom - anchors.lipLine };

  return {
    anchors,
    upper: lattice(upperBox, cols, rows, { top: true, left: true, right: true }),
    lower: lattice(lowerBox, cols, rows, { bottom: true, left: true, right: true }),
  };
}

export function eyePatches(rig: FaceRig, cols = 6, rows = 4): Lattice[] {
  return eyeAnchors(rig).map((eye) => {
    const height = Math.max(eye.lowerLid - eye.upperLid, 1e-4);
    const box: Box = {
      x: eye.centre.x - eye.halfWidth * 1.5,
      y: eye.upperLid - height * 1.5,
      w: eye.halfWidth * 3,
      h: height * 3.4,
    };
    return lattice(box, cols, rows, { top: true, bottom: true, left: true, right: true });
  });
}

/** How far the lips part, in normalised image units. */
export function openAmount(anchors: MouthAnchors, expression: Expression): number {
  return clamp01(expression.jaw) * anchors.halfWidth * 2 * TRAVEL.jaw;
}

/**
 * The field for the patch above the lips.
 *
 * The upper lip lifts a little and the philtrum above it lifts less; by the
 * base of the nose nothing is moving at all. Sideways, the corners are pulled
 * out for a wide vowel and in for a rounded one, strongest at the corners
 * themselves and nothing at the centre of the lip.
 */
export function upperField(patch: MouthPatches, expression: Expression): Field {
  const { anchors, upper } = patch;
  const open = openAmount(anchors, expression) * TRAVEL.upperShare;
  const sideways = expression.spread * anchors.halfWidth * 2 * TRAVEL.spread;
  const span = anchors.lipLine - upper.box.y;

  const inward = clamp01(expression.jaw) * anchors.halfWidth * 2 * TRAVEL.narrow;

  return (p) => {
    const u = (p.x - anchors.centre.x) / anchors.halfWidth;
    const horizontal = bump(u, 1.75);
    // 1 at the lip line, 0 by the top of the patch.
    const depth = 1 - smoothstep(0, 1, (anchors.lipLine - p.y) / span);
    return {
      x: Math.sign(u) * (sideways - inward) * cornerWeight(u) * depth,
      y: -open * horizontal * depth,
    };
  };
}

/**
 * The field for the patch below the lips.
 *
 * The lower lip drops furthest, the chin follows at about half, and the
 * bottom of the patch does not move so the jawline never parts company with
 * the neck.
 */
export function lowerField(patch: MouthPatches, expression: Expression): Field {
  const { anchors, lower } = patch;
  const open = openAmount(anchors, expression) * (1 - TRAVEL.upperShare);
  const sideways = expression.spread * anchors.halfWidth * 2 * TRAVEL.spread;
  const span = lower.box.h;

  const inward = clamp01(expression.jaw) * anchors.halfWidth * 2 * TRAVEL.narrow;

  return (p) => {
    const u = (p.x - anchors.centre.x) / anchors.halfWidth;
    const horizontal = bump(u, 1.75);
    const t = (p.y - anchors.lipLine) / span;
    // Flat across the lip itself so it travels rather than stretching, then
    // falling away so the jawline keeps its shape.
    const depth = 1 - smoothstep(0.22, 1, t);
    return {
      x: Math.sign(u) * (sideways - inward) * cornerWeight(u) * depth,
      y: open * horizontal * depth,
    };
  };
}

/**
 * The field that shuts an eye.
 *
 * Everything from the upper lid down is pulled onto the lower lid, in
 * proportion to how far above it started, so the eye closes like a shutter
 * rather than sliding down the face. Below the lower lid nothing moves — the
 * cheek stays where it is, and the crease that forms along the lash line is
 * the same crease a real closing eye makes.
 */
export function blinkField(eye: EyeAnchors, patch: Lattice, blink: number): Field {
  const strength = clamp01(blink);
  const height = Math.max(eye.lowerLid - eye.upperLid, 1e-4);
  const fadeTop = eye.upperLid - height * 0.45;

  return (p) => {
    if (p.y >= eye.lowerLid) return { x: 0, y: 0 };
    const u = (p.x - eye.centre.x) / eye.halfWidth;
    const horizontal = bump(u, 1.4);
    const vertical = smoothstep(patch.box.y, fadeTop, p.y);
    return { x: 0, y: strength * (eye.lowerLid - p.y) * horizontal * vertical };
  };
}

/**
 * How strongly a point follows the mouth corner sideways.
 *
 * Peaks at the corner and reaches well past it in both directions. A narrow
 * peak moves the corner while its neighbours stay put, which bunches the lip
 * into a visible dark crease; spreading the same movement over more of the
 * cheek is what a real mouth does anyway.
 */
function cornerWeight(u: number): number {
  return bump(Math.abs(u) - 1, 1.5);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
