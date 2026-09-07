/**
 * The vitals engine: a rolling buffer of per-frame observations in, a set of
 * measurements with honest confidence attached out.
 *
 * Design rule for this file: every number that leaves here carries a quality
 * score, and the UI is expected to refuse to display anything below the
 * threshold. A contactless measurement that silently keeps showing the last
 * good value after the signal dies is worse than showing nothing, because the
 * user cannot tell the difference.
 */

import {
  clamp,
  correctForHarmonic,
  dominantPeak,
  magnitudeSpectrum,
  type SpectralPeak,
} from "../signal/fft";
import { median, resampleUniform, stdDev } from "../signal/filters";
import {
  BREATHING_BAND_HZ,
  PULSE_BAND_HZ,
  extractBreathing,
  extractPulse,
  extractPulseCandidates,
  type RgbTrace,
  type RppgMethod,
} from "../signal/rppg";
import { computeHrv, findBeats, stressFromSdnn, type HrvResult } from "../signal/peaks";

/** One camera frame's worth of measurements. */
export interface VitalsFrame {
  timestampMs: number;
  /** Mean red, green, blue of the skin regions of interest, 0-255. */
  r: number;
  g: number;
  b: number;
  /** Vertical position of the face centre in normalised units, for breathing. */
  faceY: number;
  /** Frame-to-frame head displacement in normalised units, for motion rejection. */
  motion: number;
  /** False when no face was detected in this frame. */
  faceFound: boolean;
}

export type QualityGrade = "no-signal" | "poor" | "fair" | "good" | "excellent";

export interface QualityReport {
  /** 0-1 overall usability of the current buffer. */
  score: number;
  grade: QualityGrade;
  /** Human-readable reason the score is being held down, if any. */
  limiting: string | null;
  /** Effective sampling rate of the buffer, in frames per second. */
  effectiveFps: number;
  /** Fraction of the measurement window collected so far. */
  fill: number;
}

export interface VitalsResult {
  heartRateBpm: number | null;
  /** Which extraction the reported heart rate came from. */
  method: RppgMethod | null;
  breathingRateBpm: number | null;
  hrv: HrvResult;
  stressIndex: number | null;
  quality: QualityReport;
  /** Band-limited pulse waveform for the on-screen trace. */
  waveform: Float64Array;
  /** Sample rate the waveform was computed at. */
  waveformFs: number;
  beatTimesS: number[];
}

export interface EngineOptions {
  /** Length of the analysis window in seconds. 30 is the clinical convention. */
  windowSeconds: number;
  /** Grid the irregular frame timestamps get resampled onto. */
  targetFps: number;
  /**
   * Pin the extraction method, or leave as "auto" to pick per measurement by
   * spectral prominence. Auto is the right default; the others exist for
   * comparing methods against ground truth.
   */
  method: RppgMethod | "auto";
  /** Below this quality score the engine reports values as null. */
  minQuality: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  windowSeconds: 30,
  targetFps: 30,
  method: "auto",
  minQuality: 0.35,
};

/**
 * Fixed-duration ring buffer of frames, trimmed by timestamp rather than by
 * count so it holds a constant amount of *time* even when the frame rate
 * fluctuates.
 */
export class VitalsBuffer {
  private frames: VitalsFrame[] = [];
  private readonly windowSeconds: number;

  constructor(windowSeconds: number) {
    this.windowSeconds = windowSeconds;
  }

  push(frame: VitalsFrame): void {
    this.frames.push(frame);
    const cutoff = frame.timestampMs - this.windowSeconds * 1000;
    let drop = 0;
    while (drop < this.frames.length && this.frames[drop].timestampMs < cutoff) drop++;
    if (drop > 0) this.frames.splice(0, drop);
  }

  clear(): void {
    this.frames = [];
  }

  get length(): number {
    return this.frames.length;
  }

  /** Seconds between the oldest and newest frame currently held. */
  get spanSeconds(): number {
    if (this.frames.length < 2) return 0;
    return (
      (this.frames[this.frames.length - 1].timestampMs - this.frames[0].timestampMs) /
      1000
    );
  }

  snapshot(): VitalsFrame[] {
    return this.frames;
  }
}

function gradeFor(score: number): QualityGrade {
  if (score < 0.15) return "no-signal";
  if (score < 0.35) return "poor";
  if (score < 0.6) return "fair";
  if (score < 0.8) return "good";
  return "excellent";
}

/**
 * Confidence is the product of four independent things that can each ruin a
 * measurement, so a serious failure in any one of them drags the whole score
 * down rather than being averaged away.
 */
function assessQuality(
  frames: VitalsFrame[],
  opts: EngineOptions,
  peakProminence: number,
  agreement: number,
): QualityReport {
  const fill = Math.min(1, frames.length / (opts.windowSeconds * opts.targetFps));

  if (frames.length < 8) {
    return {
      score: 0,
      grade: "no-signal",
      limiting: "Collecting frames",
      effectiveFps: 0,
      fill,
    };
  }

  const spanS =
    (frames[frames.length - 1].timestampMs - frames[0].timestampMs) / 1000 || 1;
  const effectiveFps = frames.length / spanS;

  const faceRatio = frames.filter((f) => f.faceFound).length / frames.length;
  const motionMedian = median(frames.map((f) => f.motion));
  const intervals: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    intervals.push(frames[i].timestampMs - frames[i - 1].timestampMs);
  }
  const jitter = stdDev(intervals) / (median(intervals) || 1);

  // Each term is a 0-1 penalty factor.
  const faceTerm = faceRatio;
  // 0.004 normalised units of inter-frame motion is about the point where POS
  // starts to break down at typical webcam framing.
  const motionTerm = Math.exp(-motionMedian / 0.004);
  const rateTerm = Math.min(1, effectiveFps / 15);
  const jitterTerm = Math.exp(-jitter * 1.5);
  // A 0.24 Hz window inside a 2.3 Hz band is about a twentieth of it, so
  // uniform noise alone scores roughly 0.05 prominence. The floor sits above
  // that, and full marks need the tight spectral line a real pulse produces —
  // clean traces reach 0.8, so 0.7 is a demanding but attainable bar.
  const spectralTerm = clamp((peakProminence - 0.15) / (0.7 - 0.15), 0, 1);
  const fillTerm = Math.min(1, fill / 0.5);
  const agreementTerm = agreement;

  const score =
    faceTerm *
    motionTerm *
    rateTerm *
    jitterTerm *
    spectralTerm *
    fillTerm *
    agreementTerm;

  const candidates: Array<[number, string]> = [
    [faceTerm, "Face not consistently visible"],
    [motionTerm, "Too much movement — please hold still"],
    [rateTerm, "Camera frame rate too low"],
    [jitterTerm, "Frame timing unstable — close other tabs"],
    [spectralTerm, "Pulse signal weak — try brighter, even lighting"],
    [fillTerm, "Still collecting data"],
    [agreementTerm, "Pulse estimate unstable — extraction methods disagree"],
  ];
  candidates.sort((a, b) => a[0] - b[0]);
  const limiting = candidates[0][0] < 0.85 ? candidates[0][1] : null;

  return {
    score: Math.min(1, Math.max(0, score)),
    grade: gradeFor(score),
    limiting,
    effectiveFps,
    fill,
  };
}

export interface PulseChoice {
  waveform: Float64Array;
  peak: SpectralPeak | null;
  method: RppgMethod | null;
  /**
   * How strongly the other extractions corroborate this frequency, 0-1.
   *
   * POS, CHROM and the green channel weight the three colour channels very
   * differently, so a noise peak that happens to look prominent in one of
   * them rarely appears at the same frequency in the others. Agreement is
   * therefore close to independent evidence, and it is the term that stops
   * the engine reporting a confident wrong number.
   */
  agreement: number;
}

/** Two rate estimates count as agreeing within this many BPM. */
const AGREEMENT_TOLERANCE_BPM = 4;

/**
 * Choose between the three extractions by spectral prominence.
 *
 * Prominence — how much of the in-band power sits under the tallest peak —
 * is the right criterion because it is exactly what distinguishes a pulse
 * from noise: a heartbeat concentrates power into one narrow line, noise
 * spreads it across the band. Picking per measurement rather than committing
 * to POS globally recovers the cases where combining three channels costs
 * more in added sensor noise than it gains in artefact rejection.
 *
 * Every candidate is harmonic-corrected first, so a method is not rewarded
 * for confidently reporting double the true rate.
 */
export function selectPulse(
  trace: RgbTrace,
  fs: number,
  method: EngineOptions["method"] = "auto",
): PulseChoice {
  const evaluate = (waveform: Float64Array, m: RppgMethod) => {
    const spec = magnitudeSpectrum(waveform, fs);
    const raw = dominantPeak(spec, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi);
    const peak = raw ? correctForHarmonic(spec, raw, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi) : null;
    return { waveform, peak, method: m, score: peak?.prominence ?? 0 };
  };

  if (method !== "auto") {
    // A pinned method has nothing to corroborate it, so agreement is unknown
    // rather than perfect, and is reported as neutral.
    return { ...evaluate(extractPulse(trace, fs, method), method), agreement: 0.5 };
  }

  const candidates = extractPulseCandidates(trace, fs).map((c) =>
    evaluate(c.waveform, c.method),
  );
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (!best.peak) return { ...best, agreement: 0 };

  const bestBpm = best.peak.freq * 60;
  const others = candidates.slice(1).filter((c) => c.peak !== null);
  const concurring = others.filter(
    (c) => Math.abs((c.peak as SpectralPeak).freq * 60 - bestBpm) <= AGREEMENT_TOLERANCE_BPM,
  ).length;

  // One corroborating method is worth a lot more than none; the second adds
  // less, since by then the frequency is almost certainly real.
  const agreement = others.length === 0 ? 0.4 : concurring === 0 ? 0.15 : concurring === 1 ? 0.75 : 1;

  return { ...best, agreement };
}

/**
 * Run the full analysis over the current buffer.
 *
 * Safe to call every frame; it is a few milliseconds of work on a 30 second
 * window, but callers normally throttle it to a couple of times per second.
 */
export function analyseVitals(
  buffer: VitalsBuffer,
  opts: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): VitalsResult {
  const frames = buffer.snapshot();
  const fs = opts.targetFps;

  const emptyResult = (quality: QualityReport): VitalsResult => ({
    heartRateBpm: null,
    method: null,
    breathingRateBpm: null,
    hrv: {
      sdnn: null,
      rmssd: null,
      meanIbi: null,
      beatRateBpm: null,
      acceptedIntervals: [],
      rejectedCount: 0,
    },
    stressIndex: null,
    quality,
    waveform: new Float64Array(0),
    waveformFs: fs,
    beatTimesS: [],
  });

  if (frames.length < 16 || buffer.spanSeconds < 4) {
    return emptyResult(assessQuality(frames, opts, 0, 0));
  }

  const timestamps = frames.map((f) => f.timestampMs);
  const rs = resampleUniform(timestamps, frames.map((f) => f.r), fs).values;
  const gs = resampleUniform(timestamps, frames.map((f) => f.g), fs).values;
  const bs = resampleUniform(timestamps, frames.map((f) => f.b), fs).values;

  const trace: RgbTrace = { r: rs, g: gs, b: bs };
  const chosen = selectPulse(trace, fs, opts.method);
  const { waveform: pulse, peak, method, agreement } = chosen;

  const quality = assessQuality(frames, opts, peak?.prominence ?? 0, agreement);
  const spectralHr = peak ? peak.freq * 60 : null;

  if (quality.score < opts.minQuality || spectralHr === null) {
    return {
      ...emptyResult(quality),
      waveform: pulse,
      waveformFs: fs,
    };
  }

  const beats = findBeats(pulse, fs, spectralHr);
  const hrv = computeHrv(beats);

  // Prefer the spectral estimate, but if beat detection agrees closely the
  // average of the two is slightly more accurate than either alone.
  let heartRateBpm = spectralHr;
  if (hrv.beatRateBpm !== null && Math.abs(hrv.beatRateBpm - spectralHr) < 5) {
    heartRateBpm = (hrv.beatRateBpm + spectralHr) / 2;
  }

  // Breathing shows up both as head motion and as amplitude modulation of the
  // pulse. Head motion is the stronger of the two on a laptop, so it leads.
  const faceYs = resampleUniform(timestamps, frames.map((f) => f.faceY), fs).values;
  const breathingSignal = extractBreathing(faceYs, fs);
  const breathSpec = magnitudeSpectrum(breathingSignal, fs);
  const breathPeak = dominantPeak(breathSpec, BREATHING_BAND_HZ.lo, BREATHING_BAND_HZ.hi);

  // Below about 15 seconds a breathing estimate is one or two cycles, which is
  // not enough to be worth showing.
  const breathingRateBpm =
    breathPeak && buffer.spanSeconds >= 15 && breathPeak.prominence > 0.2
      ? breathPeak.freq * 60
      : null;

  return {
    heartRateBpm,
    method,
    breathingRateBpm,
    hrv,
    stressIndex: stressFromSdnn(hrv.sdnn),
    quality,
    waveform: pulse,
    waveformFs: fs,
    beatTimesS: beats.map((b) => b.timeS),
  };
}
