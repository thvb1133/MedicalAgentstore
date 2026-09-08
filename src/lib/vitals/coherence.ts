/**
 * Breath-to-heart coherence.
 *
 * Heart rate is not steady even at rest: it speeds up on the in-breath and
 * slows on the out-breath. That is respiratory sinus arrhythmia, and it is
 * mediated by the vagus nerve. When someone breathes slowly and evenly at
 * around six breaths a minute, the whole cardiovascular system falls into
 * step with the breath and the beat-to-beat interval traces a clean sine wave
 * at roughly 0.1 Hz.
 *
 * "Coherence" is how concentrated the heart-rate variability spectrum is
 * around a single peak, in the sense used by the biofeedback literature
 * (Lehrer & Gevirtz 2014 on resonance frequency breathing; the ratio itself
 * follows the HeartMath definition). We add one thing to it: we can also see
 * the breath directly, in the head movement the camera picks up, so we can
 * check whether the heart's rhythm is actually locked to the *breath* rather
 * than to some other slow oscillation that happens to be tidy.
 *
 * What it is not: a measure of health, emotional state, or how well someone
 * is meditating. It is a closed loop that shows you your own physiology
 * responding to how you breathe, which is interesting to watch and is the
 * whole of the claim.
 */

import { clamp, dominantPeak, magnitudeSpectrum, prominenceAt } from "../signal/fft";
import { resampleUniform } from "../signal/filters";

/** Rate the tachogram is resampled onto. Four times the top of the band. */
const TACHOGRAM_FS = 4;
/** The band respiratory sinus arrhythmia lives in: 2.4 to 24 breaths a minute. */
export const COHERENCE_BAND_HZ = { lo: 0.04, hi: 0.4 };
/** Half-width of the peak window, in Hz. About one breath a minute either side. */
const PEAK_HALF_WIDTH_HZ = 0.03;
/** Below this many beats there is no spectrum worth taking. */
const MIN_INTERVALS = 20;
/** And below this much time the resolution cannot resolve the band. */
const MIN_SPAN_SECONDS = 20;

export type CoherenceBand = "unknown" | "scattered" | "settling" | "coherent";

export interface Coherence {
  /** Fraction of variability power under the main peak, 0-1. */
  ratio: number | null;
  /** The same thing as a 0-100 figure, for display. */
  score: number | null;
  band: CoherenceBand;
  /** Frequency the heart rhythm is oscillating at, in Hz. */
  rhythmHz: number | null;
  /** The same, as breaths per minute, for comparing against the breath. */
  rhythmPerMin: number | null;
  /** Measured breathing rate this was compared against, in Hz. */
  breathHz: number | null;
  /**
   * How closely the heart's slow rhythm matches the measured breath, 0-1.
   *
   * Null when breathing was not measured. This is the part that distinguishes
   * "your heart rate is oscillating tidily" from "your heart is following
   * your breath", and only the second is what the coach is training.
   */
  locked: number | null;
  note: string;
}

export function unknownCoherence(note = "Waiting for a steady pulse"): Coherence {
  return {
    ratio: null,
    score: null,
    band: "unknown",
    rhythmHz: null,
    rhythmPerMin: null,
    breathHz: null,
    locked: null,
    note,
  };
}

/**
 * Score the coherence of a run of inter-beat intervals.
 *
 * `intervalsMs` must be the accepted intervals only. Feeding in rejected ones
 * puts a step discontinuity into the tachogram, which spreads power across
 * the whole band and reads as incoherence caused by the detector rather than
 * by the person.
 */
export function assessCoherence(
  intervalsMs: number[],
  breathingRateBpm: number | null = null,
): Coherence {
  if (intervalsMs.length < MIN_INTERVALS) {
    return unknownCoherence("Needs about half a minute of clean beats");
  }

  // Beat times are the running total of the intervals, and the value at each
  // beat is the interval that ended there — the standard tachogram.
  const times: number[] = [];
  let t = 0;
  for (const ms of intervalsMs) {
    t += ms;
    times.push(t);
  }
  const spanSeconds = (times[times.length - 1] - times[0]) / 1000;
  if (spanSeconds < MIN_SPAN_SECONDS) {
    return unknownCoherence("Needs about half a minute of clean beats");
  }

  const { values } = resampleUniform(times, intervalsMs, TACHOGRAM_FS);
  if (values.length < 16) return unknownCoherence("Needs about half a minute of clean beats");

  const spectrum = magnitudeSpectrum(values, TACHOGRAM_FS);
  const peak = dominantPeak(spectrum, COHERENCE_BAND_HZ.lo, COHERENCE_BAND_HZ.hi);
  if (!peak) return unknownCoherence("No rhythm in the beat-to-beat spacing yet");

  const ratio = prominenceAt(
    spectrum,
    peak.freq,
    COHERENCE_BAND_HZ.lo,
    COHERENCE_BAND_HZ.hi,
    PEAK_HALF_WIDTH_HZ,
  );

  const breathHz = breathingRateBpm !== null ? breathingRateBpm / 60 : null;
  const locked =
    breathHz !== null && breathHz > 0
      ? // Half a breath a minute of mismatch is nothing; three is a different
        // rhythm entirely.
        clamp(1 - Math.abs(peak.freq - breathHz) / 0.05, 0, 1)
      : null;

  return {
    ratio,
    score: Math.round(ratio * 100),
    band: bandFor(ratio),
    rhythmHz: peak.freq,
    rhythmPerMin: peak.freq * 60,
    breathHz,
    locked,
    note: noteFor(ratio, locked, peak.freq * 60),
  };
}

function bandFor(ratio: number): CoherenceBand {
  if (ratio >= 0.5) return "coherent";
  if (ratio >= 0.28) return "settling";
  return "scattered";
}

function noteFor(ratio: number, locked: number | null, rhythmPerMin: number): string {
  const rhythm = `Your heart rate is rising and falling about ${rhythmPerMin.toFixed(1)} times a minute`;

  if (ratio < 0.28) {
    return `${rhythm}, but unevenly. Slow, even breathing usually tidies this up within a minute or two.`;
  }

  const tidy =
    ratio >= 0.5
      ? `${rhythm}, in one clean rhythm.`
      : `${rhythm}, and it is starting to settle into one rhythm.`;

  if (locked === null) return `${tidy} Breathing was not measured, so this is the heart rhythm alone.`;
  if (locked > 0.6) return `${tidy} It is following your breath.`;
  return `${tidy} It is not tracking your breath yet — try lengthening the out-breath.`;
}

/**
 * A breathing pace, in seconds.
 *
 * Six breaths a minute is where most adults find their resonance, and the
 * out-breath is longer than the in-breath because that is the half of the
 * cycle where the vagal brake actually engages.
 */
export interface BreathPace {
  inhaleS: number;
  holdS: number;
  exhaleS: number;
}

export const PACES: Array<{ id: string; label: string; pace: BreathPace }> = [
  { id: "resonant", label: "6 a minute", pace: { inhaleS: 4, holdS: 0, exhaleS: 6 } },
  { id: "slow", label: "5 a minute", pace: { inhaleS: 5, holdS: 0, exhaleS: 7 } },
  { id: "box", label: "Box, 4-4-4", pace: { inhaleS: 4, holdS: 4, exhaleS: 4 } },
  { id: "gentle", label: "8 a minute", pace: { inhaleS: 3, holdS: 0, exhaleS: 4.5 } },
];

export type BreathPhase = "in" | "hold" | "out";

export interface PacerState {
  phase: BreathPhase;
  /** 0-1 through the current phase. */
  through: number;
  /** 0-1 lung fullness, which is what the visual actually shows. */
  fullness: number;
  /** Whole breaths completed since the pacer started. */
  cycles: number;
  label: string;
}

export function cycleSeconds(pace: BreathPace): number {
  return pace.inhaleS + pace.holdS + pace.exhaleS;
}

/** Breaths per minute the pacer is asking for. */
export function paceRatePerMin(pace: BreathPace): number {
  return 60 / cycleSeconds(pace);
}

/**
 * Where in the breath the pacer is at a given elapsed time.
 *
 * A raised cosine rather than a straight ramp: breathing does not change
 * direction instantaneously, and a linear pacer is unpleasant to follow
 * because it demands an abrupt reversal at each end.
 */
export function pacerAt(elapsedS: number, pace: BreathPace): PacerState {
  const total = cycleSeconds(pace);
  const cycles = Math.floor(Math.max(0, elapsedS) / total);
  const within = Math.max(0, elapsedS) - cycles * total;

  if (within < pace.inhaleS) {
    const through = pace.inhaleS === 0 ? 1 : within / pace.inhaleS;
    return {
      phase: "in",
      through,
      fullness: ease(through),
      cycles,
      label: "Breathe in",
    };
  }
  if (within < pace.inhaleS + pace.holdS) {
    const through = pace.holdS === 0 ? 1 : (within - pace.inhaleS) / pace.holdS;
    return { phase: "hold", through, fullness: 1, cycles, label: "Hold" };
  }
  const through =
    pace.exhaleS === 0 ? 1 : (within - pace.inhaleS - pace.holdS) / pace.exhaleS;
  return {
    phase: "out",
    through,
    fullness: 1 - ease(through),
    cycles,
    label: "Breathe out",
  };
}

function ease(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
}
