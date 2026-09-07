/**
 * Skin region sampling for rPPG, plus the geometric face measurements the
 * neurological agents need.
 *
 * Region choice matters more than the algorithm downstream. Forehead and
 * cheeks are used because they are well perfused, comparatively flat, and
 * mostly free of the shadowing that ruins the signal around the eyes and
 * nose. Pixels are then screened so that hair, spectacle frames, blown
 * highlights and crushed shadows do not enter the average.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * MediaPipe face mesh indices used throughout the app.
 * The mesh is 478 points when iris refinement is on: 0-467 face, 468-472
 * right iris, 473-477 left iris.
 */
export const FACE_POINTS = {
  foreheadTop: 10,
  foreheadLeft: 67,
  foreheadRight: 297,
  browCentre: 9,
  noseTip: 1,
  chin: 152,
  leftCheek: 330,
  rightCheek: 101,
  mouthLeft: 61,
  mouthRight: 291,
  mouthTop: 13,
  mouthBottom: 14,
  faceLeft: 234,
  faceRight: 454,
  // Six-point eye contours, in the order used by the eye aspect ratio.
  rightEye: [33, 160, 158, 133, 153, 144] as const,
  leftEye: [362, 385, 387, 263, 373, 380] as const,
  rightIris: [468, 469, 470, 471, 472] as const,
  leftIris: [473, 474, 475, 476, 477] as const,
} as const;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function boxAround(points: Landmark[], padX = 0, padY = 0): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const w = x1 - x0;
  const h = y1 - y0;
  return {
    x0: x0 - w * padX,
    y0: y0 - h * padY,
    x1: x1 + w * padX,
    y1: y1 + h * padY,
  };
}

/**
 * The three regions of interest, in normalised image coordinates.
 *
 * The forehead box is inset from the hairline and stops above the brows; the
 * cheek boxes sit below the eyes and outside the nasolabial fold.
 */
export function skinRegions(lm: Landmark[]): Box[] {
  if (lm.length < 468) return [];

  const top = lm[FACE_POINTS.foreheadTop];
  const brow = lm[FACE_POINTS.browCentre];
  const left = lm[FACE_POINTS.foreheadLeft];
  const right = lm[FACE_POINTS.foreheadRight];

  const foreheadHeight = brow.y - top.y;
  const forehead: Box = {
    x0: Math.min(left.x, right.x) + Math.abs(right.x - left.x) * 0.12,
    x1: Math.max(left.x, right.x) - Math.abs(right.x - left.x) * 0.12,
    // Skip the top fifth so the hairline stays out of the average.
    y0: top.y + foreheadHeight * 0.22,
    y1: brow.y - foreheadHeight * 0.18,
  };

  const faceWidth = Math.abs(lm[FACE_POINTS.faceRight].x - lm[FACE_POINTS.faceLeft].x);
  const cheekHalf = faceWidth * 0.075;
  const cheekBox = (p: Landmark): Box => ({
    x0: p.x - cheekHalf,
    x1: p.x + cheekHalf,
    y0: p.y - cheekHalf * 0.8,
    y1: p.y + cheekHalf * 0.8,
  });

  return [forehead, cheekBox(lm[FACE_POINTS.leftCheek]), cheekBox(lm[FACE_POINTS.rightCheek])];
}

export interface RegionSample {
  r: number;
  g: number;
  b: number;
  /** Fraction of sampled pixels that passed the skin screen. */
  coverage: number;
}

/**
 * Average the RGB of the given boxes from an image, rejecting non-skin pixels.
 *
 * Sub-sampling with a stride keeps this at well under a millisecond per frame
 * even at 720p, which matters because it runs inside the render loop.
 */
export function sampleRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  boxes: Box[],
  stride = 2,
): RegionSample {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let kept = 0;
  let total = 0;

  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x0 * width));
    const x1 = Math.min(width - 1, Math.ceil(box.x1 * width));
    const y0 = Math.max(0, Math.floor(box.y0 * height));
    const y1 = Math.min(height - 1, Math.ceil(box.y1 * height));

    for (let y = y0; y <= y1; y += stride) {
      for (let x = x0; x <= x1; x += stride) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        total++;
        if (!isSkinPixel(r, g, b)) continue;
        sumR += r;
        sumG += g;
        sumB += b;
        kept++;
      }
    }
  }

  if (kept === 0) return { r: 0, g: 0, b: 0, coverage: 0 };
  return {
    r: sumR / kept,
    g: sumG / kept,
    b: sumB / kept,
    coverage: total === 0 ? 0 : kept / total,
  };
}

/**
 * Loose skin screen in normalised RGB.
 *
 * Absolute-value skin detectors are notoriously biased against darker skin,
 * so this works on the *ratios* between channels — which vary far less with
 * melanin than the absolute values do — and only rejects on brightness at the
 * extremes where the sensor has genuinely clipped and carries no signal.
 */
function isSkinPixel(r: number, g: number, b: number): boolean {
  const sum = r + g + b;
  if (sum < 60) return false; // Crushed to black: no information.
  if (r > 250 && g > 250 && b > 250) return false; // Blown highlight.

  const rn = r / sum;
  const gn = g / sum;
  // Skin under almost any illuminant sits in this part of the chromaticity
  // plane regardless of tone; the constraint is red above green above blue.
  return rn > 0.32 && rn < 0.6 && gn > 0.25 && gn < 0.4 && r >= g && g >= b - 12;
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Eye aspect ratio: the classic Soukupova-Cech measure. Near 0.3 when open,
 * collapsing towards 0 as the lid closes.
 */
export function eyeAspectRatio(lm: Landmark[], eye: readonly number[]): number {
  const [p1, p2, p3, p4, p5, p6] = eye.map((i) => lm[i]);
  const horizontal = dist(p1, p4);
  if (horizontal === 0) return 0;
  return (dist(p2, p6) + dist(p3, p5)) / (2 * horizontal);
}

/** Mouth opening relative to face width, used for yawn detection. */
export function mouthAspectRatio(lm: Landmark[]): number {
  const width = dist(lm[FACE_POINTS.mouthLeft], lm[FACE_POINTS.mouthRight]);
  if (width === 0) return 0;
  return dist(lm[FACE_POINTS.mouthTop], lm[FACE_POINTS.mouthBottom]) / width;
}

export interface IrisMeasurement {
  centre: Landmark;
  /** Iris diameter in normalised image units. */
  diameter: number;
}

export function irisMeasurement(lm: Landmark[], iris: readonly number[]): IrisMeasurement | null {
  if (lm.length < 478) return null;
  const pts = iris.map((i) => lm[i]);
  const centre = pts[0];
  // Points 1-4 sit on the iris boundary at the cardinal directions.
  const horizontal = dist(pts[1], pts[3]);
  const vertical = dist(pts[2], pts[4]);
  return { centre, diameter: (horizontal + vertical) / 2 };
}

/**
 * Horizontal gaze as the iris centre's offset within the eye opening.
 * Zero is centred, negative is towards the subject's right, +/-1 is the corner.
 */
export function horizontalGaze(lm: Landmark[]): number | null {
  const rIris = irisMeasurement(lm, FACE_POINTS.rightIris);
  const lIris = irisMeasurement(lm, FACE_POINTS.leftIris);
  if (!rIris || !lIris) return null;

  const offset = (iris: Landmark, inner: Landmark, outer: Landmark) => {
    const span = outer.x - inner.x;
    if (Math.abs(span) < 1e-6) return 0;
    return ((iris.x - inner.x) / span) * 2 - 1;
  };

  const right = offset(rIris.centre, lm[33], lm[133]);
  const left = offset(lIris.centre, lm[362], lm[263]);
  return (right + left) / 2;
}

/**
 * Left-right facial asymmetry, the geometric part of a FAST stroke check.
 *
 * Distances are taken relative to the face midline and normalised by face
 * width so the measure is invariant to how close the subject sits. Head yaw
 * produces apparent asymmetry, so callers must gate on a near-frontal pose.
 */
export function facialAsymmetry(lm: Landmark[]): {
  mouthCornerDelta: number;
  eyeOpeningDelta: number;
  overall: number;
} {
  const faceWidth = dist(lm[FACE_POINTS.faceLeft], lm[FACE_POINTS.faceRight]) || 1;
  const midlineY = (lm[FACE_POINTS.noseTip].y + lm[FACE_POINTS.chin].y) / 2;

  const mouthCornerDelta =
    Math.abs(
      Math.abs(lm[FACE_POINTS.mouthLeft].y - midlineY) -
        Math.abs(lm[FACE_POINTS.mouthRight].y - midlineY),
    ) / faceWidth;

  const eyeOpeningDelta = Math.abs(
    eyeAspectRatio(lm, FACE_POINTS.leftEye) - eyeAspectRatio(lm, FACE_POINTS.rightEye),
  );

  return {
    mouthCornerDelta,
    eyeOpeningDelta,
    // Mouth droop is the more specific sign, so it carries more weight.
    overall: mouthCornerDelta * 0.7 + eyeOpeningDelta * 0.3,
  };
}

/** Approximate head yaw from the nose tip's offset between the face edges. */
export function headYaw(lm: Landmark[]): number {
  const left = lm[FACE_POINTS.faceLeft];
  const right = lm[FACE_POINTS.faceRight];
  const nose = lm[FACE_POINTS.noseTip];
  const span = right.x - left.x;
  if (Math.abs(span) < 1e-6) return 0;
  return ((nose.x - left.x) / span) * 2 - 1;
}

/** Approximate head pitch from the nose tip's height between brow and chin. */
export function headPitch(lm: Landmark[]): number {
  const brow = lm[FACE_POINTS.browCentre];
  const chin = lm[FACE_POINTS.chin];
  const nose = lm[FACE_POINTS.noseTip];
  const span = chin.y - brow.y;
  if (Math.abs(span) < 1e-6) return 0;
  return ((nose.y - brow.y) / span) * 2 - 1;
}
