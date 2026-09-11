/**
 * Pupil size from the camera.
 *
 * The face mesh does not give this. Its 478-point layout tracks the *iris*
 * boundary, and the iris does not change size — the pupil inside it does. So
 * the landmarks only get us as far as knowing where to look, and the size
 * itself has to come out of the pixels.
 *
 * The measurement is the fraction of the iris disc that is dark. Pupil area
 * over iris area is scale-free, which matters because the alternative —
 * millimetres — would need the subject's distance from the camera, and the
 * whole point of a pupil measure here is that it is compared against the same
 * person a few seconds earlier rather than against a population.
 *
 * Two things make this hard, and both are reported rather than hidden. A dark
 * brown iris has very little contrast against the pupil, so the boundary is
 * genuinely not there to be found; and at typical webcam framing an iris is
 * perhaps fifteen pixels across, which puts a hard floor on resolution. The
 * contrast figure returned alongside the ratio is what callers gate on.
 */

export interface PupilSample {
  /**
   * Pupil diameter as a fraction of iris diameter.
   *
   * The human range is roughly 0.2 (bright light) to 0.75 (dark), since the
   * iris is about 11.7 mm across in everyone and the pupil runs 2-8 mm.
   */
  ratio: number;
  /** Separation between pupil and iris brightness, 0-1. Below ~0.1 is noise. */
  contrast: number;
  /** Pixels inside the iris disc the estimate is based on. */
  samples: number;
}

/** Anything outside this is not a pupil; it is a tracking or threshold failure. */
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

/** Fewer pixels than this across the iris and the area estimate is quantisation. */
const MIN_SAMPLES = 40;

/**
 * Estimate pupil size within one eye.
 *
 * `data` is RGBA for a patch of the frame, and the centre and radius are in
 * that patch's pixel coordinates. Returns null when the iris is off the edge
 * of the patch, too small, or too flat to separate.
 */
export function measurePupil(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  centre: { x: number; y: number },
  irisRadius: number,
): PupilSample | null {
  if (irisRadius < 3) return null;

  // Stay inside the iris: the limbus itself is a soft dark ring on many eyes,
  // and including it would read as an enormous pupil.
  const inner = irisRadius * 0.92;
  const x0 = Math.max(0, Math.floor(centre.x - inner));
  const x1 = Math.min(width - 1, Math.ceil(centre.x + inner));
  const y0 = Math.max(0, Math.floor(centre.y - inner));
  const y1 = Math.min(height - 1, Math.ceil(centre.y + inner));
  if (x1 <= x0 || y1 <= y0) return null;

  const luma: number[] = [];
  const rim: number[] = [];
  const inside: Array<{ x: number; y: number; l: number }> = [];

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - centre.x;
      const dy = y - centre.y;
      const d = Math.hypot(dx, dy);
      if (d > inner) continue;
      const i = (y * width + x) * 4;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      luma.push(l);
      inside.push({ x, y, l });
      // The outer half of the disc is iris in all but the widest pupils, so
      // it is the reference the pupil has to be dark against.
      if (d > irisRadius * 0.62) rim.push(l);
    }
  }

  if (luma.length < MIN_SAMPLES || rim.length < 8) return null;

  const irisLevel = percentile(rim, 0.5);
  const darkest = percentile(luma, 0.05);
  const contrast = irisLevel <= 0 ? 0 : Math.max(0, (irisLevel - darkest) / irisLevel);
  // Below about a tenth of the iris brightness there is no boundary to find,
  // only a threshold slicing through sensor noise. That happens most often
  // with very dark irises, and it is a real limit of the method rather than
  // something to paper over with a number.
  if (contrast < 0.1) return null;

  // Halfway between the darkest pixels and the iris is the boundary. A fixed
  // absolute threshold cannot work here: the same pupil is 20 grey levels in
  // one room and 90 in another, and it is the relative step that is stable.
  const threshold = darkest + (irisLevel - darkest) * 0.5;
  // The corneal reflection is a small blown highlight sitting *inside* the
  // pupil. Counting only dark pixels would punch a hole through the middle of
  // it, so anything conspicuously brighter than the iris near the centre is
  // counted as pupil too.
  const glint = irisLevel * 1.45;

  let count = 0;
  for (const p of inside) {
    if (p.l < threshold) count++;
    else if (p.l > glint && Math.hypot(p.x - centre.x, p.y - centre.y) < irisRadius * 0.5) {
      count++;
    }
  }
  if (count === 0) return null;

  const pupilRadius = Math.sqrt(count / Math.PI);
  const ratio = pupilRadius / irisRadius;
  if (ratio < MIN_RATIO || ratio > MAX_RATIO) return null;

  return { ratio, contrast, samples: luma.length };
}

/** Mean of the two eyes, weighted towards whichever separated more cleanly. */
export function combinePupils(
  a: PupilSample | null,
  b: PupilSample | null,
): PupilSample | null {
  if (!a) return b;
  if (!b) return a;
  const wa = a.contrast;
  const wb = b.contrast;
  const total = wa + wb;
  if (total <= 0) return a;
  return {
    ratio: (a.ratio * wa + b.ratio * wb) / total,
    // Both eyes seeing the same thing is corroboration, but the pair is not
    // more separable than the better of the two, so this is a max and not a
    // sum.
    contrast: Math.max(wa, wb),
    samples: a.samples + b.samples,
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((x, y) => x - y);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}
