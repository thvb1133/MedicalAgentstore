/**
 * Estimating skin tone, in order to say out loud where this works less well.
 *
 * Remote PPG reads a pulse from light that has entered the skin, scattered off
 * blood, and come back out. Melanin sits in the epidermis, above the vessels,
 * and absorbs across the visible band with a strong bias towards the shorter
 * wavelengths — which is exactly where the haemoglobin contrast that makes the
 * green channel useful lives. So on darker skin less light gets down to the
 * blood and less of what returns survives the trip out. The pulse is still
 * there; there is simply less of it above the sensor's noise floor.
 *
 * This is a well-documented bias, not a hypothesis, and it is not one that
 * can be fixed in a weekend by anybody. What can be done in a weekend is
 * refusing to hide it. A tool that reports the same confidence for everyone
 * is not fair — it is just wrong for some people and not saying so.
 *
 * Two decisions follow from that, and they matter more than the estimate.
 *
 * The tone estimate never changes a reported value. It is not a correction
 * factor, it does not scale a heart rate, and it does not adjust a
 * calibration. It only ever affects what the interface says about how much to
 * trust the number — because a correction fitted to nobody's data would be an
 * invented number dressed as fairness.
 *
 * And the estimate stays here. It is computed per frame from pixels already
 * in memory, used to pick a sentence, and discarded. It is never stored,
 * never attached to a report, and never sent anywhere: an inferred
 * characteristic of this kind is not a thing to be keeping records of.
 */

/**
 * Individual Typology Angle, the standard dermatological measure.
 *
 * ITA = arctan((L* - 50) / b*) in degrees, over CIELAB. Higher is lighter.
 * The conventional bands are very light above 55, light 41-55, intermediate
 * 28-41, tan 10-28, brown -30-10, dark below -30.
 *
 * Computed from sRGB under a D65 assumption, which a webcam under a mixture
 * of daylight and a tungsten lamp does not honour. That is why the bands are
 * collapsed to three below, and why nothing quantitative is ever shown.
 */
export function individualTypologyAngle(r: number, g: number, b: number): number {
  const [L, , bStar] = rgbToLab(r, g, b);
  if (Math.abs(bStar) < 1e-6) return L >= 50 ? 90 : -90;
  return (Math.atan((L - 50) / bStar) * 180) / Math.PI;
}

export type ToneBand = "unknown" | "lighter" | "medium" | "darker";

export interface ToneConfidence {
  band: ToneBand;
  /**
   * Expected multiplier on the pulse signal-to-noise ratio for this band,
   * relative to a light-skinned reference of 1.
   *
   * Read this as an order of magnitude, not a coefficient. Published
   * comparisons put the drop somewhere between a third and a half at the
   * darker end, varying with the algorithm and the lighting more than with
   * anything a single number can carry. It exists to shape a sentence and to
   * set how much extra light to ask for — never to scale a measurement.
   */
  expectedSnr: number;
  /** What to tell the person, or null when there is nothing useful to add. */
  note: string | null;
}

export function toneBand(ita: number): ToneBand {
  if (!Number.isFinite(ita)) return "unknown";
  if (ita >= 41) return "lighter";
  if (ita >= 10) return "medium";
  return "darker";
}

export function toneConfidence(band: ToneBand): ToneConfidence {
  switch (band) {
    case "lighter":
      return { band, expectedSnr: 1, note: null };
    case "medium":
      return {
        band,
        expectedSnr: 0.8,
        note: "Camera pulse readings lose a little signal on medium skin tones. Good, even light makes more difference here than anything else.",
      };
    case "darker":
      return {
        band,
        expectedSnr: 0.55,
        note: "Camera pulse readings are measurably weaker on darker skin: melanin absorbs much of the light this technique depends on, so less of the pulse reaches the sensor. Your reading is not wrong, but its confidence will run lower and bright, even light matters more. This is a known limitation of the method, not of you.",
      };
    default:
      return { band, expectedSnr: 1, note: null };
  }
}

/** Convenience: mean skin RGB straight to the sentence that goes on screen. */
export function assessTone(r: number, g: number, b: number): ToneConfidence {
  if (r + g + b < 30) return toneConfidence("unknown");
  return toneConfidence(toneBand(individualTypologyAngle(r, g, b)));
}

/** sRGB 0-255 to CIELAB, D65. */
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(linearise);

  // sRGB primaries to XYZ, then normalised by the D65 white point.
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;

  const [fx, fy, fz] = [x, y, z].map(pivot);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function linearise(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function pivot(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}
