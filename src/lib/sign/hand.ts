/**
 * A parametric hand, so handshapes can be posed rather than drawn.
 *
 * The alternative was twenty-six hand-drawn pictures. A rig is better for two
 * reasons that matter here. Poses can be interpolated, so the hand moves
 * between letters the way a hand does instead of cutting between stills — and
 * transitions carry real information in fingerspelling, where a reader is
 * following the flow as much as the shapes. And a pose is a short list of
 * numbers that can be read, checked and corrected against a reference, which
 * a bitmap cannot.
 *
 * The model is deliberately simple: a palm, five digits, three segments each,
 * flexed in a plane and then projected. It reproduces the manual alphabet's
 * open handshapes well. It cannot represent one finger crossing behind
 * another, which is why R, M, N and T are approximations and are marked as
 * such in the alphabet table rather than quietly shipped as correct.
 */

/** Which way the palm faces the reader. Several letters differ only in this. */
export type PalmFacing = "front" | "back" | "side";

export interface DigitPose {
  /** 0 fully extended, 1 fully folded into the palm. */
  curl: number;
  /** Sideways splay from the resting direction, in degrees. */
  spread: number;
  /**
   * Bend at the two outer joints only, leaving the knuckle straight.
   *
   * X is exactly this and nothing else: a finger held up with its tip curled
   * into a hook. Without a separate control it collapses into a fist and
   * becomes indistinguishable from S.
   */
  hook?: number;
}

export interface ThumbPose {
  curl: number;
  /** Away from the palm. 0 tucked against the index, 1 fully out. */
  abduction: number;
  /** Folded across the front of the palm, as in S, E and M. */
  across: number;
}

export interface HandPose {
  /** Index, middle, ring, little. */
  fingers: [DigitPose, DigitPose, DigitPose, DigitPose];
  thumb: ThumbPose;
  facing: PalmFacing;
  /** Wrist rotation in degrees. Negative tilts the fingertips left. */
  rotation: number;
}

export interface Joint {
  x: number;
  y: number;
}

export interface DigitGeometry {
  joints: Joint[];
  /** Segment widths, tapering toward the tip. */
  widths: number[];
  /**
   * Painter's-algorithm depth. Digits behind the palm are drawn first and
   * dimmed, which is the only depth cue a flat model gets.
   */
  behind: boolean;
}

export interface HandGeometry {
  palm: Joint[];
  digits: DigitGeometry[];
  /** Wrist anchor, for drawing the forearm stub. */
  wrist: Joint;
  facing: PalmFacing;
  /**
   * Where the renderer should place the wrist so the hand stays in frame.
   *
   * P and Q point downward, so anchored at the same spot as an upright letter
   * they run off the bottom of the canvas. Deriving the shift from the wrist
   * rotation alone keeps it smooth enough to animate through — measuring the
   * actual bounding box would be tighter but would make the hand drift around
   * as the fingers move, which is far more distracting than a little slack.
   */
  anchorOffset: Joint;
}

/**
 * Proportions, as fractions of hand length.
 *
 * Roughly anthropometric. The middle finger is longest, the little finger
 * shortest, and each phalanx is shorter than the one before it. Getting these
 * ratios wrong is what makes a drawn hand look like a cartoon glove, and a
 * glove is harder to read a handshape from.
 */
const PALM_WIDTH = 0.62;
const PALM_HEIGHT = 0.52;

/** Per finger: total length, then the split across the three phalanges. */
const FINGER_LENGTHS = [0.44, 0.48, 0.44, 0.35];
const PHALANX_SPLIT = [0.45, 0.32, 0.23];

/** Where each finger leaves the palm, as a fraction of palm width. */
const KNUCKLE_X = [-0.3, -0.1, 0.1, 0.29];
/** The knuckle line is an arch, not a straight edge. */
const KNUCKLE_Y = [0.02, 0, 0.015, 0.06];

/** Resting splay, before a pose adds to it. */
const RESTING_SPREAD = [-6, -2, 3, 9];

const FINGER_WIDTH = [0.105, 0.108, 0.1, 0.088];

/** Total flexion available at each joint, in degrees. */
const MAX_FLEX = [85, 105, 75];

/**
 * The thumb is longer and set lower than instinct suggests.
 *
 * Six letters — A, E, M, N, S and T — are the same closed fist and differ only
 * in where the thumb sits. An earlier version had it short and tucked against
 * the palm, where the palm silhouette swallowed it entirely and all six became
 * the same picture. It has to clear the outline to carry any information.
 */
const THUMB_LENGTH = 0.44;
const THUMB_SPLIT = [0.44, 0.32, 0.24];

/** How far the palm narrows when seen edge-on, as in C and O. */
const SIDE_FORESHORTENING = 0.58;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Walk a chain of segments from a base point, accumulating rotation.
 *
 * Angles are measured from straight up, because that is the direction an
 * extended finger points, which makes every pose value readable as "how far
 * from straight".
 */
function chain(
  base: Joint,
  baseAngleDeg: number,
  lengths: number[],
  flexDeg: number[],
): Joint[] {
  const joints: Joint[] = [base];
  let angle = baseAngleDeg;
  let { x, y } = base;

  for (let i = 0; i < lengths.length; i++) {
    angle += flexDeg[i];
    const theta = radians(angle);
    // Screen y grows downward, so an extended finger subtracts from y.
    x += Math.sin(theta) * lengths[i];
    y -= Math.cos(theta) * lengths[i];
    joints.push({ x, y });
  }

  return joints;
}

function rotatePoint(point: Joint, origin: Joint, degrees: number): Joint {
  const theta = radians(degrees);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * Math.cos(theta) - dy * Math.sin(theta),
    y: origin.y + dx * Math.sin(theta) + dy * Math.cos(theta),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Build the drawable geometry for a pose.
 *
 * Returns coordinates in hand-length units with the wrist at the origin, so
 * the renderer can scale to whatever size it has without the model knowing
 * anything about pixels.
 */
export function buildHand(pose: HandPose): HandGeometry {
  const wrist: Joint = { x: 0, y: 0 };
  const palmTop = -PALM_HEIGHT;

  /**
   * Edge-on poses are narrowed rather than redrawn.
   *
   * C and O are read from the side, where the hand is a curve seen in
   * profile. Squeezing the palm and pulling the knuckles together is a cheap
   * approximation of that rotation, but it is the difference between a legible
   * C and four fingers fanned at the viewer.
   */
  const squash = pose.facing === "side" ? SIDE_FORESHORTENING : 1;
  const halfWidth = (PALM_WIDTH * squash) / 2;

  // A palm slightly narrower at the wrist than at the knuckles.
  const palm: Joint[] = [
    { x: -halfWidth * 0.82, y: 0 },
    { x: -halfWidth, y: palmTop * 0.55 },
    { x: -halfWidth * 0.96, y: palmTop },
    { x: halfWidth * 0.96, y: palmTop },
    { x: halfWidth, y: palmTop * 0.55 },
    { x: halfWidth * 0.82, y: 0 },
  ];

  const digits: DigitGeometry[] = [];

  for (let i = 0; i < 4; i++) {
    const finger = pose.fingers[i];
    const curl = clamp01(finger.curl);
    const total = FINGER_LENGTHS[i];
    const lengths = PHALANX_SPLIT.map((f) => f * total);

    // The proximal joint carries most of the visible flexion; the distal
    // joints follow it, which is what a real finger does — they are coupled
    // by tendon rather than controlled independently.
    const hook = clamp01(finger.hook ?? 0);
    const flex = [
      MAX_FLEX[0] * curl,
      MAX_FLEX[1] * curl * (0.55 + curl * 0.45) + 78 * hook,
      MAX_FLEX[2] * curl * (0.35 + curl * 0.5) + 52 * hook,
    ];

    const base: Joint = {
      x: KNUCKLE_X[i] * PALM_WIDTH * squash,
      y: palmTop + KNUCKLE_Y[i] * PALM_HEIGHT,
    };
    const baseAngle = (RESTING_SPREAD[i] + finger.spread) * squash;

    const width = FINGER_WIDTH[i];
    digits.push({
      joints: chain(base, baseAngle, lengths, flex),
      widths: [width, width * 0.92, width * 0.8],
      behind: false,
    });
  }

  /**
   * The thumb.
   *
   * It leaves the palm low on the radial side and opposes rather than flexes,
   * so it gets its own base angle sweep: fully abducted points out at about
   * 65 degrees from the fingers, fully adducted lies alongside the index.
   * `across` swings it over the front of the palm, which is the difference
   * between A and S, and between E and a plain fist.
   */
  const thumb = pose.thumb;
  const abduction = clamp01(thumb.abduction);
  const across = clamp01(thumb.across);
  const thumbCurl = clamp01(thumb.curl);

  // Set out at the edge of the palm and low, so the thumb clears the palm
  // silhouette instead of disappearing into it.
  const thumbBase: Joint = { x: -halfWidth - 0.03, y: palmTop * 0.26 };
  // Fully adducted lies alongside the index; fully abducted points out at
  // right angles, as in L and Y; `across` swings it over the front of the
  // fingers, which is what separates S from A.
  const thumbBaseAngle = -14 - abduction * 56 + across * 104;
  const thumbLengths = THUMB_SPLIT.map((f) => f * THUMB_LENGTH);
  const thumbFlex = [26 * thumbCurl + across * 14, 52 * thumbCurl, 38 * thumbCurl];

  digits.push({
    joints: chain(thumbBase, thumbBaseAngle, thumbLengths, thumbFlex),
    widths: [0.135, 0.122, 0.105],
    // A thumb laid across the palm is in front of it; tucked inside a fist it
    // is behind the fingers.
    behind: across < 0.2 && thumbCurl > 0.75,
  });

  // Downward-pointing letters need lifting or they leave the frame.
  const tilt = (1 - Math.cos(radians(pose.rotation))) / 2;
  const anchorOffset: Joint = { x: 0, y: -0.62 * tilt };

  if (pose.rotation !== 0) {
    const rotate = (p: Joint) => rotatePoint(p, wrist, pose.rotation);
    return {
      palm: palm.map(rotate),
      digits: digits.map((d) => ({ ...d, joints: d.joints.map(rotate) })),
      wrist,
      facing: pose.facing,
      anchorOffset,
    };
  }

  return { palm, digits, wrist, facing: pose.facing, anchorOffset };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpDigit(a: DigitPose, b: DigitPose, t: number): DigitPose {
  return {
    curl: lerp(a.curl, b.curl, t),
    spread: lerp(a.spread, b.spread, t),
    hook: lerp(a.hook ?? 0, b.hook ?? 0, t),
  };
}

/**
 * Blend two poses.
 *
 * Facing switches at the halfway point rather than interpolating, because
 * there is no meaningful hand halfway between palm-forward and palm-back —
 * the rotation would have to go through the edge, which this flat model
 * cannot draw. Cutting at the midpoint, while everything else is still
 * moving, is the least visible place to put the seam.
 */
export function blendPoses(a: HandPose, b: HandPose, t: number): HandPose {
  const k = clamp01(t);
  return {
    fingers: [
      lerpDigit(a.fingers[0], b.fingers[0], k),
      lerpDigit(a.fingers[1], b.fingers[1], k),
      lerpDigit(a.fingers[2], b.fingers[2], k),
      lerpDigit(a.fingers[3], b.fingers[3], k),
    ],
    thumb: {
      curl: lerp(a.thumb.curl, b.thumb.curl, k),
      abduction: lerp(a.thumb.abduction, b.thumb.abduction, k),
      across: lerp(a.thumb.across, b.thumb.across, k),
    },
    facing: k < 0.5 ? a.facing : b.facing,
    rotation: lerp(a.rotation, b.rotation, k),
  };
}

/** Smoothstep, so a hand accelerates out of a shape and settles into the next. */
export function easeInOut(t: number): number {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
}
