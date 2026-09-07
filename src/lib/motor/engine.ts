/**
 * Motor assessment: tremor spectrum and finger-tapping kinematics.
 *
 * These are the quantitative versions of two things a neurologist does by
 * eye. The MDS-UPDRS motor examination scores finger tapping on amplitude,
 * rhythm, hesitations and — importantly — whether the amplitude *decays*
 * across the sequence, which is the feature that distinguishes bradykinesia
 * from simple slowness. A camera measures all of that directly.
 *
 * What this is not: a diagnosis. Tremor at 4-6 Hz is characteristic of rest
 * tremor, but caffeine, anxiety, fatigue, thyroid disease and a dozen
 * medications all produce tremor too. The output here is a set of measured
 * motor features, and that is deliberately where it stops.
 */

import { dominantPeak, magnitudeSpectrum } from "../signal/fft";
import { bandpass, detrend, mean, resampleUniform, stdDev } from "../signal/filters";

/** MediaPipe hand landmark indices. */
export const HAND_POINTS = {
  wrist: 0,
  thumbTip: 4,
  indexTip: 8,
  indexMcp: 5,
  middleTip: 12,
  middleMcp: 9,
  pinkyMcp: 17,
} as const;

export interface MotorSample {
  timestampMs: number;
  /** Index fingertip position, normalised image coordinates. */
  tipX: number;
  tipY: number;
  /** Thumb-to-index distance, normalised by hand size. Drives tap detection. */
  pinchDistance: number;
  /** Wrist position, subtracted out so whole-hand drift is not read as tremor. */
  wristX: number;
  wristY: number;
}

export interface TremorResult {
  /** Dominant oscillation frequency in Hz, or null when none stands out. */
  frequencyHz: number | null;
  /** Displacement amplitude in normalised units. */
  amplitude: number | null;
  /** How concentrated the spectrum is at that frequency, 0-1. */
  regularity: number | null;
  /** Which band the frequency falls in. */
  band: "none" | "rest-4-6" | "postural-6-12" | "low-frequency" | null;
  /** True when the frame rate cannot resolve the upper band. */
  frameRateLimited: boolean;
}

export interface TappingResult {
  tapCount: number;
  /** Taps per second. */
  frequencyHz: number | null;
  /** Mean tap amplitude, normalised by hand size. */
  meanAmplitude: number | null;
  /**
   * Fractional change in amplitude from the first third to the last third.
   * Negative means the taps got smaller — the decrement clinicians look for.
   */
  amplitudeDecrement: number | null;
  /** Coefficient of variation of inter-tap intervals. Higher is less regular. */
  rhythmVariability: number | null;
  /** Gaps longer than twice the median interval. */
  hesitations: number;
}

export interface MotorResult {
  tremor: TremorResult;
  tapping: TappingResult;
  effectiveFps: number;
  durationSeconds: number;
  samples: number;
}

const TREMOR_BAND = { lo: 2.5, hi: 12 };

/**
 * Smallest oscillation worth reporting, in normalised image units.
 *
 * MediaPipe landmark positions jitter by roughly a thousandth of the frame
 * width from one frame to the next even on a perfectly still hand. Anything
 * at or below that is tracker noise, not a tremor, so it is reported as no
 * tremor rather than as a very small one.
 */
const MIN_TREMOR_AMPLITUDE = 0.0008;

export class MotorTracker {
  private samples: MotorSample[] = [];
  private readonly windowSeconds: number;

  constructor(windowSeconds = 20) {
    this.windowSeconds = windowSeconds;
  }

  reset(): void {
    this.samples = [];
  }

  get length(): number {
    return this.samples.length;
  }

  get spanSeconds(): number {
    const n = this.samples.length;
    if (n < 2) return 0;
    return (this.samples[n - 1].timestampMs - this.samples[0].timestampMs) / 1000;
  }

  push(sample: MotorSample): void {
    this.samples.push(sample);
    const cutoff = sample.timestampMs - this.windowSeconds * 1000;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop].timestampMs < cutoff) drop++;
    if (drop > 0) this.samples.splice(0, drop);
  }

  analyse(): MotorResult {
    const n = this.samples.length;
    const spanS = this.spanSeconds;
    const effectiveFps = spanS > 0 ? n / spanS : 0;

    const empty: MotorResult = {
      tremor: {
        frequencyHz: null,
        amplitude: null,
        regularity: null,
        band: null,
        frameRateLimited: effectiveFps < 24,
      },
      tapping: {
        tapCount: 0,
        frequencyHz: null,
        meanAmplitude: null,
        amplitudeDecrement: null,
        rhythmVariability: null,
        hesitations: 0,
      },
      effectiveFps,
      durationSeconds: spanS,
      samples: n,
    };

    if (n < 40 || spanS < 3) return empty;

    const fs = Math.min(60, Math.max(15, Math.round(effectiveFps)));
    const timestamps = this.samples.map((s) => s.timestampMs);

    // Tremor is measured on fingertip motion *relative to the wrist*, so that
    // moving the whole arm does not masquerade as a hand tremor.
    const relX = this.samples.map((s) => s.tipX - s.wristX);
    const relY = this.samples.map((s) => s.tipY - s.wristY);
    const rx = resampleUniform(timestamps, relX, fs).values;
    const ry = resampleUniform(timestamps, relY, fs).values;

    const tremor = analyseTremor(rx, ry, fs, effectiveFps);

    const pinch = resampleUniform(
      timestamps,
      this.samples.map((s) => s.pinchDistance),
      fs,
    ).values;
    const tapping = analyseTapping(pinch, fs);

    return { tremor, tapping, effectiveFps, durationSeconds: spanS, samples: n };
  }
}

function analyseTremor(
  x: Float64Array,
  y: Float64Array,
  fs: number,
  effectiveFps: number,
): TremorResult {
  const frameRateLimited = effectiveFps < 24;
  // Nyquist: we cannot honestly report a frequency above half the frame rate,
  // and in practice need a few samples per cycle to measure amplitude at all.
  const maxResolvable = Math.min(TREMOR_BAND.hi, effectiveFps / 3);
  if (maxResolvable <= TREMOR_BAND.lo) {
    return {
      frequencyHz: null,
      amplitude: null,
      regularity: null,
      band: null,
      frameRateLimited: true,
    };
  }

  // Restrict to the tremor band before measuring anything. Detrending alone
  // leaves slow voluntary movement in the signal, which would be counted as
  // tremor amplitude even though none of it lies at the tremor frequency.
  const dx = bandpass(detrend(x), fs, TREMOR_BAND.lo, maxResolvable);
  const dy = bandpass(detrend(y), fs, TREMOR_BAND.lo, maxResolvable);

  const amplitude = Math.hypot(stdDev(dx), stdDev(dy)) * Math.SQRT2;
  if (amplitude < MIN_TREMOR_AMPLITUDE) {
    return {
      frequencyHz: null,
      amplitude: null,
      regularity: null,
      band: "none",
      frameRateLimited,
    };
  }

  const specX = magnitudeSpectrum(dx, fs);
  const specY = magnitudeSpectrum(dy, fs);
  const peakX = dominantPeak(specX, TREMOR_BAND.lo, maxResolvable);
  const peakY = dominantPeak(specY, TREMOR_BAND.lo, maxResolvable);

  const best =
    !peakX && !peakY
      ? null
      : !peakX
        ? peakY
        : !peakY
          ? peakX
          : peakX.magnitude >= peakY.magnitude
            ? peakX
            : peakY;

  if (!best) {
    return {
      frequencyHz: null,
      amplitude: null,
      regularity: null,
      band: "none",
      frameRateLimited,
    };
  }

  // A real tremor is a narrow spectral line. Broad, low-prominence peaks are
  // ordinary voluntary movement and should not be reported as tremor.
  if (best.prominence < 0.22) {
    return {
      frequencyHz: null,
      amplitude: null,
      regularity: best.prominence,
      band: "none",
      frameRateLimited,
    };
  }

  const f = best.freq;
  const band: TremorResult["band"] =
    f < 4 ? "low-frequency" : f <= 6 ? "rest-4-6" : "postural-6-12";

  return {
    frequencyHz: f,
    amplitude,
    regularity: best.prominence,
    band,
    frameRateLimited,
  };
}

function analyseTapping(pinch: Float64Array, fs: number): TappingResult {
  const n = pinch.length;
  const empty: TappingResult = {
    tapCount: 0,
    frequencyHz: null,
    meanAmplitude: null,
    amplitudeDecrement: null,
    rhythmVariability: null,
    hesitations: 0,
  };
  if (n < fs) return empty;

  const signal = detrend(pinch);
  const sd = stdDev(signal);
  // Below this the fingers are essentially static; calling that "tapping"
  // would produce a frequency from pure noise.
  if (sd < 0.004) return empty;

  // A tap is a closure: a local minimum of the thumb-index distance. Peaks are
  // found on the inverted signal with a refractory period at the fastest
  // plausible tapping rate, about 8 Hz.
  const inverted = new Float64Array(n);
  for (let i = 0; i < n; i++) inverted[i] = -signal[i];
  const refractory = Math.max(2, Math.round(fs / 8));

  const closures: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (inverted[i] <= inverted[i - 1] || inverted[i] < inverted[i + 1]) continue;
    if (inverted[i] < sd * 0.4) continue;
    if (i - last < refractory) {
      if (closures.length > 0 && inverted[i] > inverted[closures[closures.length - 1]]) {
        closures[closures.length - 1] = i;
        last = i;
      }
      continue;
    }
    closures.push(i);
    last = i;
  }

  if (closures.length < 3) return { ...empty, tapCount: closures.length };

  // Amplitude of each tap: the excursion from this closure to the opening
  // that follows it.
  const amplitudes: number[] = [];
  for (let k = 0; k < closures.length - 1; k++) {
    let peak = -Infinity;
    for (let i = closures[k]; i < closures[k + 1]; i++) {
      if (signal[i] > peak) peak = signal[i];
    }
    amplitudes.push(peak - signal[closures[k]]);
  }

  const intervals: number[] = [];
  for (let k = 1; k < closures.length; k++) {
    intervals.push((closures[k] - closures[k - 1]) / fs);
  }

  const meanInterval = mean(intervals);
  const rhythmVariability = meanInterval > 0 ? stdDev(intervals) / meanInterval : null;
  const medianInterval = [...intervals].sort((a, b) => a - b)[intervals.length >> 1];
  const hesitations = intervals.filter((iv) => iv > medianInterval * 2).length;

  // Decrement: compare the first third of taps against the last third.
  let amplitudeDecrement: number | null = null;
  if (amplitudes.length >= 6) {
    const third = Math.floor(amplitudes.length / 3);
    const first = mean(amplitudes.slice(0, third));
    const last = mean(amplitudes.slice(-third));
    amplitudeDecrement = first > 0 ? (last - first) / first : null;
  }

  return {
    tapCount: closures.length,
    frequencyHz: meanInterval > 0 ? 1 / meanInterval : null,
    meanAmplitude: mean(amplitudes),
    amplitudeDecrement,
    rhythmVariability,
    hesitations,
  };
}

/** Hand size, used to make pinch distance independent of camera distance. */
export function handScale(landmarks: { x: number; y: number }[]): number {
  const wrist = landmarks[HAND_POINTS.wrist];
  const middleMcp = landmarks[HAND_POINTS.middleMcp];
  return Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y) || 1;
}
