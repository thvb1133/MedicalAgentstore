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

import { dominantPeak, magnitudeSpectrum } from "../signal/fft";
import { median, resampleUniform, stdDev } from "../signal/filters";
import {
  BREATHING_BAND_HZ,
  PULSE_BAND_HZ,
  extractBreathing,
  extractPulse,
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
  method: RppgMethod;
  /** Below this quality score the engine reports values as null. */
  minQuality: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  windowSeconds: 30,
  targetFps: 30,
  method: "pos",
  minQuality: 0.35,
};

/**
 * Fixed-duration ring buffer of frames, trimmed by timestamp rather than by
 * count so it holds a constant amount of *time* even when the frame rate
 * fluctuates.
 */
export class VitalsBuffer {
  private frames: VitalsFrame[] = [];

  constructor(private readonly windowSeconds: number) {}

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
  const spectralTerm = Math.min(1, peakProminence / 0.35);
  const fillTerm = Math.min(1, fill / 0.5);

  const score =
    faceTerm * motionTerm * rateTerm * jitterTerm * spectralTerm * fillTerm;

  const candidates: Array<[number, string]> = [
    [faceTerm, "Face not consistently visible"],
    [motionTerm, "Too much movement — please hold still"],
    [rateTerm, "Camera frame rate too low"],
    [jitterTerm, "Frame timing unstable — close other tabs"],
    [spectralTerm, "Pulse signal weak — try brighter, even lighting"],
    [fillTerm, "Still collecting data"],
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
    return emptyResult(assessQuality(frames, opts, 0));
  }

  const timestamps = frames.map((f) => f.timestampMs);
  const rs = resampleUniform(timestamps, frames.map((f) => f.r), fs).values;
  const gs = resampleUniform(timestamps, frames.map((f) => f.g), fs).values;
  const bs = resampleUniform(timestamps, frames.map((f) => f.b), fs).values;

  const pulse = extractPulse({ r: rs, g: gs, b: bs }, fs, opts.method);
  const spec = magnitudeSpectrum(pulse, fs);
  const peak = dominantPeak(spec, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi);

  const quality = assessQuality(frames, opts, peak?.prominence ?? 0);
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
    breathingRateBpm,
    hrv,
    stressIndex: stressFromSdnn(hrv.sdnn),
    quality,
    waveform: pulse,
    waveformFs: fs,
    beatTimesS: beats.map((b) => b.timeS),
  };
}
