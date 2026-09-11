/**
 * The lighting gate.
 *
 * Every remote-PPG failure that gets blamed on the algorithm is usually the
 * light. The pulse is a fraction of a percent of the reflected brightness, so
 * it has to survive being quantised into eight bits — and in a dim room most
 * of it is quantised away before any code sees it. Worse, the failure is
 * silent: the numbers still come out, they are just wrong.
 *
 * So this runs before the measurement rather than after it, and it reports
 * what to change rather than a score. "Too dark" is not actionable; "your
 * face is lit from one side, turn to face the window" is.
 *
 * Four things are checked, in the order they matter:
 *
 *   Brightness   below about 60/255 the pulse is under the quantiser
 *   Clipping     a blown highlight carries no signal at all
 *   Evenness     side lighting means one cheek is measuring a shadow
 *   Steadiness   a flickering or auto-exposing source adds a false rhythm
 *
 * Thresholds are deliberately set where the *signal* degrades rather than
 * where a photograph would look bad. A dim, evenly lit room measures fine and
 * should not be refused.
 */

import { mean, stdDev } from "../signal/filters";

export interface RegionLight {
  /** Mean luminance of the region, 0-255. */
  luma: number;
  /** Fraction of pixels that were clipped white or crushed black. */
  clipped: number;
  /** Fraction of sampled pixels that passed the skin screen. */
  coverage: number;
}

export type LightingVerdict = "unknown" | "unusable" | "poor" | "workable" | "good";

/**
 * No per-region data to judge from.
 *
 * Distinct from "unusable", which means regions were sampled and the light in
 * them was hopeless. Not knowing is not the same as knowing it is bad, and
 * scoring it as bad would penalise every caller that supplies a single
 * averaged colour — including the synthetic traces the engine is tested on.
 */
export function unknownLighting(): LightingReport {
  return {
    verdict: "unknown",
    score: 0,
    advice: null,
    ready: true,
    detail: { luma: 0, clipped: 0, unevenness: 0, flicker: 0 },
  };
}

export interface LightingReport {
  verdict: LightingVerdict;
  /** 0-1, how much of the available signal the light is letting through. */
  score: number;
  /** What to change, or null when there is nothing worth saying. */
  advice: string | null;
  /** Whether a measurement should be allowed to start at all. */
  ready: boolean;
  detail: {
    luma: number;
    clipped: number;
    /** Spread of brightness across the regions, relative to their mean. */
    unevenness: number;
    /** Frame-to-frame variation in brightness, relative to the mean. */
    flicker: number;
  };
}

/** Below this the pulse is being quantised away faster than it can be filtered. */
const DARK = 55;
/** Comfortable working brightness for an eight-bit sensor. */
const BRIGHT = 110;

/**
 * Side lighting worth mentioning.
 *
 * A perfectly even face is not achievable at a laptop and not needed. A
 * quarter of the mean means one region is effectively in shadow and should
 * not be carrying equal weight in the fusion.
 */
const UNEVEN_BAD = 0.25;

/** A screen or a cheap bulb flickers by a percent or two; auto-exposure by more. */
const FLICKER_BAD = 0.035;

export function assessLighting(
  regions: RegionLight[],
  /** Recent whole-face luminance history, for detecting flicker. */
  lumaHistory: ArrayLike<number> = [],
): LightingReport {
  const usable = regions.filter((r) => r.coverage > 0.05);

  if (usable.length === 0) {
    return {
      verdict: "unusable",
      score: 0,
      advice: "No skin found to measure. Sit so your whole face is in frame.",
      ready: false,
      detail: { luma: 0, clipped: 0, unevenness: 0, flicker: 0 },
    };
  }

  const lumas = usable.map((r) => r.luma);
  const luma = mean(lumas);
  const clipped = mean(usable.map((r) => r.clipped));
  const unevenness = luma > 0 ? (Math.max(...lumas) - Math.min(...lumas)) / luma : 0;
  const flicker =
    lumaHistory.length >= 15 && mean(lumaHistory) > 0
      ? stdDev(lumaHistory) / mean(lumaHistory)
      : 0;

  // Each term is a 0-1 factor, multiplied rather than averaged so one bad
  // condition cannot be hidden by three good ones.
  const darkTerm = ramp(luma, DARK, BRIGHT);
  const clipTerm = 1 - Math.min(1, clipped / 0.25);
  const evenTerm = 1 - Math.min(1, unevenness / (UNEVEN_BAD * 1.6));
  const steadyTerm = 1 - Math.min(1, flicker / (FLICKER_BAD * 2));

  const score = clamp01(darkTerm * clipTerm * evenTerm * steadyTerm);

  // Ordered by how much each costs the measurement, so the advice names the
  // one thing most worth fixing rather than listing everything imperfect.
  const problems: Array<[number, string]> = [
    [darkTerm, "Too dark to read a pulse. Face a window, or turn a lamp towards you."],
    [
      clipTerm,
      "Part of your face is blown out. Move out of direct sun or turn the lamp away from you.",
    ],
    [
      evenTerm,
      "The light is coming from one side. Turn to face it, so both cheeks are lit the same.",
    ],
    [
      steadyTerm,
      "The light is flickering — often a screen or a dimmed bulb. A steady light gives a cleaner reading.",
    ],
  ];
  problems.sort((a, b) => a[0] - b[0]);
  const worst = problems[0];

  const verdict: LightingVerdict =
    score < 0.15 ? "unusable" : score < 0.4 ? "poor" : score < 0.7 ? "workable" : "good";

  return {
    verdict,
    score,
    advice: worst[0] < 0.85 ? worst[1] : null,
    // "Poor" is allowed through with a warning rather than blocked. Somebody
    // measuring at night in a badly lit room should get a reading and a
    // caveat, not a locked button — the confidence score already carries the
    // consequence, and refusing to run is its own kind of dishonesty.
    ready: score >= 0.15,
    detail: { luma, clipped, unevenness, flicker },
  };
}

function ramp(value: number, low: number, high: number): number {
  if (value <= low) return 0;
  if (value >= high) return 1;
  return (value - low) / (high - low);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
