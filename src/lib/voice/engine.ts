/**
 * Acoustic voice analysis from the microphone.
 *
 * Read this before changing anything here.
 *
 * This module measures the *physics* of a voice: how fast the vocal folds
 * vibrate, how regularly they do it, how much of the sound is periodic versus
 * turbulent, and how the speaker distributes speech and silence over time.
 * Those are objective quantities and this file computes them honestly.
 *
 * It deliberately stops there. There is a large literature correlating these
 * same measures with depression, Parkinson's and cognitive decline, and a
 * whole industry built on top of it. Those models are trained on clinical
 * cohorts we do not have, they are population-level, and their error bars on
 * an individual are wide. So we surface the acoustics and let a clinician —
 * or Claude, with the limits spelled out in its prompt — do the interpreting.
 * Nothing in here returns a diagnosis or a "wellness score" out of ten.
 *
 * The measures themselves are the standard ones from clinical phonetics, as
 * implemented in Praat: F0, jitter (local), shimmer (local) and harmonics-to-
 * noise ratio. Where our implementation approximates Praat's, the comment on
 * the function says so.
 */

import { clamp } from "../signal/fft";
import { mean, stdDev, median } from "../signal/filters";

/** Vocal-fold vibration below this is almost certainly a tracking error. */
const MIN_F0_HZ = 60;
/** Above this we are looking at a child or a whistle, not conversational speech. */
const MAX_F0_HZ = 400;

const FRAME_MS = 40;
const HOP_MS = 10;

/** Normalised autocorrelation below this means the frame is not voiced. */
const VOICING_THRESHOLD = 0.35;

/** A voiced run shorter than this cannot support cycle measurements. */
const MIN_VOICED_RUN_FRAMES = 5;

/** Silence longer than this counts as a pause rather than a stop consonant. */
const PAUSE_MS = 250;

export interface VoiceAnalysis {
  /** Median fundamental frequency over voiced frames, in Hz. */
  medianF0Hz: number;
  /**
   * Spread of F0 in semitones. Semitones rather than Hz because pitch is
   * perceived logarithmically, and because it makes male and female voices
   * comparable on one scale. Flat, monotone speech sits near 1; animated
   * conversational speech is typically 2-4.
   */
  pitchRangeSemitones: number;
  /**
   * Cycle-to-cycle variation in vocal-fold period, as a percentage.
   * Praat's "jitter (local)". Healthy sustained phonation is under about 1%.
   */
  jitterPercent: number;
  /**
   * Cycle-to-cycle variation in amplitude, as a percentage.
   * Praat's "shimmer (local)". Healthy sustained phonation is under about 3.8%.
   */
  shimmerPercent: number;
  /**
   * Harmonics-to-noise ratio in dB — how much of the signal is periodic voice
   * versus turbulent breathiness. Higher is clearer. Healthy speech is above
   * about 20 dB in quiet conditions; a noisy room drags this down regardless
   * of the speaker, which is why it is reported alongside the noise floor.
   */
  harmonicsToNoiseDb: number;
  /** Syllable-like energy peaks per second of *speech* (pauses excluded). */
  speechRateHz: number;
  /** Fraction of the window spent silent, 0-1. */
  pauseRatio: number;
  /** Mean length of a pause in milliseconds, over pauses long enough to count. */
  meanPauseMs: number;
  /** Fraction of the window carrying voiced speech, 0-1. */
  voicedFraction: number;
  /** RMS loudness of speech frames, in dBFS. */
  loudnessDb: number;
  /** RMS loudness of the quietest frames — the room's noise floor, in dBFS. */
  noiseFloorDb: number;
  /**
   * Confidence in the whole analysis, 0-1. Driven by how much voiced speech
   * was actually present and how far it sits above the noise floor. Treat
   * anything below 0.5 as unusable rather than merely uncertain.
   */
  quality: number;
  /** The single biggest thing degrading quality, for the UI to display. */
  limitingFactor: string;
  /** Seconds of audio this analysis is based on. */
  windowSeconds: number;
}

interface FrameFeature {
  rms: number;
  f0Hz: number;
  /** Peak of the normalised autocorrelation — doubles as a voicing score. */
  periodicity: number;
  voiced: boolean;
  /** Index of the first sample of this frame. */
  offset: number;
}

/**
 * Estimate the fundamental period of one frame by normalised autocorrelation.
 *
 * This is the classic approach rather than YIN or CREPE. It is adequate here
 * because we only need F0 to locate glottal cycles for jitter and shimmer, and
 * because the parabolic interpolation below recovers sub-sample resolution,
 * which is what actually limits jitter accuracy.
 */
function estimatePeriod(
  frame: Float64Array,
  fs: number,
): { f0Hz: number; periodicity: number } {
  const minLag = Math.floor(fs / MAX_F0_HZ);
  const maxLag = Math.min(Math.floor(fs / MIN_F0_HZ), frame.length - 1);
  if (maxLag <= minLag) return { f0Hz: 0, periodicity: 0 };

  const m = mean(frame);
  const centred = new Float64Array(frame.length);
  for (let i = 0; i < frame.length; i++) centred[i] = frame[i] - m;

  let energy = 0;
  for (let i = 0; i < centred.length; i++) energy += centred[i] * centred[i];
  if (energy < 1e-12) return { f0Hz: 0, periodicity: 0 };

  let bestLag = 0;
  let bestScore = 0;
  const scores = new Float64Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let normA = 0;
    let normB = 0;
    const n = centred.length - lag;
    for (let i = 0; i < n; i++) {
      const a = centred[i];
      const b = centred[i + lag];
      sum += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denom = Math.sqrt(normA * normB);
    const score = denom > 1e-12 ? sum / denom : 0;
    scores[lag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestScore <= 0) return { f0Hz: 0, periodicity: 0 };

  // Autocorrelation is equally happy at twice the true period, which reports
  // an octave too low. If half the winning lag scores nearly as well, it is
  // the real fundamental.
  const halfLag = Math.round(bestLag / 2);
  if (halfLag >= minLag && scores[halfLag] > bestScore * 0.85) {
    bestLag = halfLag;
    bestScore = scores[halfLag];
  }

  // Parabolic interpolation around the peak for sub-sample period resolution.
  let refined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = scores[bestLag - 1];
    const y1 = scores[bestLag];
    const y2 = scores[bestLag + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-12) {
      refined = bestLag + (0.5 * (y0 - y2)) / denom;
    }
  }

  const f0 = fs / refined;
  if (f0 < MIN_F0_HZ || f0 > MAX_F0_HZ) return { f0Hz: 0, periodicity: bestScore };
  return { f0Hz: f0, periodicity: clamp(bestScore, 0, 1) };
}

function rmsOf(frame: Float64Array): number {
  let s = 0;
  for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
  return Math.sqrt(s / frame.length);
}

function toDb(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude, 1e-9));
}

/**
 * Locate individual glottal cycles inside one voiced run.
 *
 * Jitter and shimmer are defined cycle by cycle, not frame by frame, so we
 * have to find the actual pulses. Given a period estimate we step through the
 * waveform taking the largest peak inside each expected cycle window. The
 * search window is deliberately wider than the period so that a genuinely
 * irregular voice — which is the interesting case — is not forced onto a
 * regular grid by the search itself.
 */
function findCycles(
  samples: Float64Array,
  start: number,
  end: number,
  periodSamples: number,
): { peakTimes: number[]; peakAmplitudes: number[] } {
  const peakTimes: number[] = [];
  const peakAmplitudes: number[] = [];
  if (periodSamples < 4 || end - start < periodSamples * 2) {
    return { peakTimes, peakAmplitudes };
  }

  /**
   * Smooth before picking peaks.
   *
   * A glottal pulse is broad and rounded, so its maximum sits on an almost
   * flat top. Additive noise then moves the argmax by several samples from
   * cycle to cycle, and because jitter *is* the cycle-to-cycle difference,
   * that wander is reported as vocal instability. It is the analyser's own
   * noise being measured, not the speaker's. Smoothing over a small fraction
   * of a period suppresses it while leaving the pulse shape intact.
   */
  const half = Math.max(1, Math.round(periodSamples * 0.05));
  const smoothed = new Float64Array(end - start);
  for (let i = start; i < end; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(start, i - half); j <= Math.min(end - 1, i + half); j++) {
      sum += samples[j];
      n++;
    }
    smoothed[i - start] = sum / n;
  }

  const localIndex = (absolute: number) => absolute - start;
  const search = Math.round(periodSamples * 0.5);
  let cursor = start;

  while (cursor < end) {
    const windowEnd = Math.min(cursor + Math.round(periodSamples), end);
    if (windowEnd - cursor < 3) break;

    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = cursor; i < windowEnd; i++) {
      const v = smoothed[localIndex(i)];
      if (v > bestVal) {
        bestVal = v;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;

    // Parabolic interpolation for a sub-sample peak position. Without it the
    // period can only be measured to the nearest sample, which at 16 kHz is a
    // 0.8% quantisation error on a 130 Hz voice — the same order as the jitter
    // we are trying to detect.
    let refined = bestIdx;
    if (bestIdx > start && bestIdx < end - 1) {
      const y0 = smoothed[localIndex(bestIdx - 1)];
      const y1 = smoothed[localIndex(bestIdx)];
      const y2 = smoothed[localIndex(bestIdx + 1)];
      const denom = y0 - 2 * y1 + y2;
      if (Math.abs(denom) > 1e-12) {
        const shift = (0.5 * (y0 - y2)) / denom;
        if (Math.abs(shift) <= 1) refined = bestIdx + shift;
      }
    }

    peakTimes.push(refined);
    peakAmplitudes.push(Math.abs(bestVal));
    cursor = bestIdx + Math.max(2, Math.round(periodSamples) - search);
  }

  return { peakTimes, peakAmplitudes };
}

/**
 * Jitter (local): the mean absolute difference between consecutive periods,
 * divided by the mean period. Matches Praat's definition.
 */
function localJitter(periods: number[]): number {
  if (periods.length < 3) return NaN;
  let diffSum = 0;
  for (let i = 1; i < periods.length; i++) diffSum += Math.abs(periods[i] - periods[i - 1]);
  const meanPeriod = mean(periods);
  if (meanPeriod <= 0) return NaN;
  return (diffSum / (periods.length - 1) / meanPeriod) * 100;
}

/**
 * Shimmer (local): the same construction applied to peak amplitudes.
 */
function localShimmer(amplitudes: number[]): number {
  if (amplitudes.length < 3) return NaN;
  const usable = amplitudes.filter((a) => a > 1e-9);
  if (usable.length < 3) return NaN;
  let diffSum = 0;
  for (let i = 1; i < usable.length; i++) diffSum += Math.abs(usable[i] - usable[i - 1]);
  const meanAmp = mean(usable);
  if (meanAmp <= 0) return NaN;
  return (diffSum / (usable.length - 1) / meanAmp) * 100;
}

/**
 * Harmonics-to-noise ratio from the periodicity score.
 *
 * If r is the normalised autocorrelation at the fundamental period, the
 * periodic fraction of the signal power is r and the noise fraction is 1 - r,
 * giving HNR = 10 log10(r / (1 - r)). This is the relationship Boersma (1993)
 * derives, and it is why the same autocorrelation serves both jobs.
 */
function hnrFromPeriodicity(r: number): number {
  const bounded = clamp(r, 1e-4, 0.9999);
  return 10 * Math.log10(bounded / (1 - bounded));
}

/**
 * Count syllable-like events in the energy envelope.
 *
 * Real syllable nuclei are found with a full forced aligner. This counts peaks
 * in the smoothed energy contour that rise a set distance above their
 * surroundings, which tracks speaking tempo well enough to notice that someone
 * has slowed down markedly, and is honest about being a proxy.
 */
function countSyllables(frames: FrameFeature[], hopSeconds: number): number {
  if (frames.length < 3) return 0;

  const env = frames.map((f) => toDb(f.rms));
  const smoothed = new Float64Array(env.length);
  for (let i = 0; i < env.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(env.length - 1, i + 2); j++) {
      sum += env[j];
      n++;
    }
    smoothed[i] = sum / n;
  }

  // A nucleus has to stand 4 dB clear of the dip beside it. Below that we are
  // counting amplitude ripple within a single vowel.
  const PROMINENCE_DB = 4;
  const MIN_SEPARATION = Math.max(1, Math.round(0.08 / hopSeconds));

  let count = 0;
  let lastPeak = -Infinity;
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (!frames[i].voiced) continue;
    if (smoothed[i] <= smoothed[i - 1] || smoothed[i] < smoothed[i + 1]) continue;
    if (i - lastPeak < MIN_SEPARATION) continue;

    let leftMin = smoothed[i];
    for (let j = i - 1; j >= Math.max(0, i - 15); j--) leftMin = Math.min(leftMin, smoothed[j]);
    let rightMin = smoothed[i];
    for (let j = i + 1; j <= Math.min(smoothed.length - 1, i + 15); j++) {
      rightMin = Math.min(rightMin, smoothed[j]);
    }
    const prominence = smoothed[i] - Math.max(leftMin, rightMin);
    if (prominence >= PROMINENCE_DB) {
      count++;
      lastPeak = i;
    }
  }
  return count;
}

/**
 * Analyse one window of mono audio.
 *
 * Returns null when there is not enough voiced speech to measure anything,
 * which is the correct answer for a silent room and is distinct from
 * returning zeroes.
 */
export function analyseVoice(samples: Float64Array, fs: number): VoiceAnalysis | null {
  const frameLen = Math.round((FRAME_MS / 1000) * fs);
  const hopLen = Math.round((HOP_MS / 1000) * fs);
  const hopSeconds = hopLen / fs;
  if (samples.length < frameLen * 4) return null;

  const frames: FrameFeature[] = [];
  const buf = new Float64Array(frameLen);
  for (let offset = 0; offset + frameLen <= samples.length; offset += hopLen) {
    for (let i = 0; i < frameLen; i++) buf[i] = samples[offset + i];
    const rms = rmsOf(buf);
    const { f0Hz, periodicity } = estimatePeriod(buf, fs);
    frames.push({ rms, f0Hz, periodicity, voiced: false, offset });
  }
  if (frames.length < 8) return null;

  // The noise floor is the 10th percentile of frame energy. Using a percentile
  // rather than the minimum keeps one anomalously quiet frame from setting it.
  const sortedRms = frames.map((f) => f.rms).sort((a, b) => a - b);
  const noiseFloor = sortedRms[Math.floor(sortedRms.length * 0.1)];
  const loudest = sortedRms[Math.floor(sortedRms.length * 0.9)];
  const noiseFloorDb = toDb(noiseFloor);

  /**
   * Speech has to clear the floor by 6 dB *and* look periodic. Requiring both
   * rejects the two common false positives: a loud door slam, which is
   * energetic but aperiodic, and a steady hum, which is periodic but quiet.
   *
   * The second term matters more than it looks. Six dB above the tenth
   * percentile is the right threshold only when the window actually contains
   * silence to measure. Someone talking continuously has a tenth percentile
   * nearly as loud as their speech, and a purely relative threshold then sits
   * above the entire recording and finds no speech at all. Capping it well
   * below the loud end keeps continuous talking detectable, and the
   * periodicity gate is what stops the lower cap from letting noise through.
   */
  const speechThreshold = Math.min(noiseFloor * 2, loudest * 0.3);
  for (const f of frames) {
    f.voiced = f.rms > speechThreshold && f.periodicity > VOICING_THRESHOLD && f.f0Hz > 0;
  }

  const voicedFrames = frames.filter((f) => f.voiced);
  const voicedFraction = voicedFrames.length / frames.length;
  if (voicedFrames.length < MIN_VOICED_RUN_FRAMES) return null;

  const f0Values = voicedFrames.map((f) => f.f0Hz);
  const medianF0Hz = median(f0Values);

  // Pitch spread in semitones relative to the speaker's own median, so this
  // describes expressiveness rather than whether the voice is high or low.
  const semitones = f0Values.map((f) => 12 * Math.log2(f / medianF0Hz));
  const pitchRangeSemitones = stdDev(semitones);

  // Cycle measurements, gathered over every sufficiently long voiced run.
  const allPeriods: number[] = [];
  const allAmplitudes: number[] = [];
  let runStart = -1;
  for (let i = 0; i <= frames.length; i++) {
    const voiced = i < frames.length && frames[i].voiced;
    if (voiced && runStart < 0) runStart = i;
    if (!voiced && runStart >= 0) {
      const runFrames = frames.slice(runStart, i);
      if (runFrames.length >= MIN_VOICED_RUN_FRAMES) {
        const runF0 = median(runFrames.map((f) => f.f0Hz));
        const periodSamples = fs / runF0;
        const startSample = runFrames[0].offset;
        const endSample = Math.min(
          runFrames[runFrames.length - 1].offset + frameLen,
          samples.length,
        );
        const { peakTimes, peakAmplitudes } = findCycles(
          samples,
          startSample,
          endSample,
          periodSamples,
        );
        for (let k = 1; k < peakTimes.length; k++) {
          const period = (peakTimes[k] - peakTimes[k - 1]) / fs;
          // Reject intervals that cannot be a single glottal cycle; a missed
          // or doubled pulse would otherwise show up as enormous jitter.
          if (period > 1 / MAX_F0_HZ && period < 1 / MIN_F0_HZ) allPeriods.push(period);
        }
        allAmplitudes.push(...peakAmplitudes);
      }
      runStart = -1;
    }
  }

  const jitterRaw = localJitter(allPeriods);
  const shimmerRaw = localShimmer(allAmplitudes);
  const jitterPercent = Number.isFinite(jitterRaw) ? jitterRaw : NaN;
  const shimmerPercent = Number.isFinite(shimmerRaw) ? shimmerRaw : NaN;

  const meanPeriodicity = mean(voicedFrames.map((f) => f.periodicity));
  const harmonicsToNoiseDb = hnrFromPeriodicity(meanPeriodicity);

  // Pauses: runs of non-speech frames longer than PAUSE_MS.
  const pauseLengths: number[] = [];
  let silenceRun = 0;
  const minPauseFrames = Math.round(PAUSE_MS / HOP_MS);
  for (let i = 0; i <= frames.length; i++) {
    const speaking = i < frames.length && frames[i].rms > speechThreshold;
    if (!speaking) {
      silenceRun++;
    } else {
      if (silenceRun >= minPauseFrames) pauseLengths.push(silenceRun * HOP_MS);
      silenceRun = 0;
    }
  }
  if (silenceRun >= minPauseFrames) pauseLengths.push(silenceRun * HOP_MS);

  const speakingFrames = frames.filter((f) => f.rms > speechThreshold).length;
  const pauseRatio = clamp(1 - speakingFrames / frames.length, 0, 1);
  const meanPauseMs = pauseLengths.length > 0 ? mean(pauseLengths) : 0;

  const syllables = countSyllables(frames, hopSeconds);
  const speechSeconds = speakingFrames * hopSeconds;
  const speechRateHz = speechSeconds > 0.5 ? syllables / speechSeconds : 0;

  const loudnessDb = toDb(mean(frames.filter((f) => f.voiced).map((f) => f.rms)));

  /**
   * Quality is a product, not an average: any one of these failing should sink
   * the result, because a confident number from an unusable recording is worse
   * than no number. Averaging would let two good terms hide one fatal one.
   *
   * Clarity comes from the harmonics-to-noise ratio rather than from comparing
   * speech level against the noise floor. The floor is the tenth percentile of
   * frame energy, which is only a noise measurement when the window contains
   * silence — someone talking continuously has no quiet frames, and the
   * comparison then reports zero signal-to-noise for a perfect recording. HNR
   * measures periodic against aperiodic energy within the voice itself, so it
   * behaves the same whether or not the speaker happens to pause.
   */
  const speechTerm = clamp(voicedFraction / 0.25, 0, 1);
  const clarityTerm = clamp((harmonicsToNoiseDb - 5) / 15, 0, 1);
  const cycleTerm = clamp(allPeriods.length / 60, 0, 1);
  const quality = clamp(speechTerm * clarityTerm * cycleTerm, 0, 1);

  let limitingFactor = "Signal is good";
  const worst = Math.min(speechTerm, clarityTerm, cycleTerm);
  if (worst === speechTerm && speechTerm < 0.9) {
    limitingFactor = "Not enough speech yet — keep talking";
  } else if (worst === clarityTerm && clarityTerm < 0.9) {
    limitingFactor = "Room noise is close to your voice level";
  } else if (worst === cycleTerm && cycleTerm < 0.9) {
    limitingFactor = "Too few clean vocal cycles to measure steadiness";
  }

  return {
    medianF0Hz,
    pitchRangeSemitones,
    jitterPercent,
    shimmerPercent,
    harmonicsToNoiseDb,
    speechRateHz,
    pauseRatio,
    meanPauseMs,
    voicedFraction,
    loudnessDb,
    noiseFloorDb,
    quality,
    limitingFactor,
    windowSeconds: samples.length / fs,
  };
}

/**
 * Rolling audio buffer feeding the live analysis.
 *
 * Holds the most recent `windowSeconds` of mono audio at a fixed rate. The
 * browser hands us small blocks from a ScriptProcessor or worklet; this
 * stitches them into one contiguous window the analyser can work on.
 */
export class VoiceBuffer {
  private readonly windowSeconds: number;
  private readonly sampleRate: number;
  private readonly capacity: number;
  private readonly ring: Float64Array;
  private writeIndex = 0;
  private filled = 0;

  constructor(windowSeconds: number, sampleRate: number) {
    this.windowSeconds = windowSeconds;
    this.sampleRate = sampleRate;
    this.capacity = Math.max(1, Math.round(windowSeconds * sampleRate));
    this.ring = new Float64Array(this.capacity);
  }

  push(block: Float32Array | Float64Array): void {
    for (let i = 0; i < block.length; i++) {
      this.ring[this.writeIndex] = block[i];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      if (this.filled < this.capacity) this.filled++;
    }
  }

  /** Seconds of audio currently held. */
  get seconds(): number {
    return this.filled / this.sampleRate;
  }

  get window(): number {
    return this.windowSeconds;
  }

  clear(): void {
    this.writeIndex = 0;
    this.filled = 0;
    this.ring.fill(0);
  }

  /** Contiguous copy of the buffer, oldest sample first. */
  snapshot(): Float64Array {
    const out = new Float64Array(this.filled);
    const start = this.filled < this.capacity ? 0 : this.writeIndex;
    for (let i = 0; i < this.filled; i++) out[i] = this.ring[(start + i) % this.capacity];
    return out;
  }

  analyse(): VoiceAnalysis | null {
    if (this.filled < this.sampleRate * 1.5) return null;
    return analyseVoice(this.snapshot(), this.sampleRate);
  }
}

/**
 * Turn the numbers into short plain-language descriptors.
 *
 * These are comparisons against published normal ranges for conversational
 * speech, not judgements. "Above the typical range" is a statement about a
 * reference distribution; it is not a finding, and the wording is chosen to
 * keep it that way.
 */
export function describeVoice(v: VoiceAnalysis): string[] {
  const notes: string[] = [];
  if (v.quality < 0.5) {
    notes.push("Recording quality is too low for these numbers to mean much.");
    return notes;
  }

  if (Number.isFinite(v.jitterPercent)) {
    notes.push(
      v.jitterPercent > 1.04
        ? `Pitch steadiness (jitter ${v.jitterPercent.toFixed(2)}%) is above the typical conversational range.`
        : `Pitch is steady (jitter ${v.jitterPercent.toFixed(2)}%).`,
    );
  }
  if (Number.isFinite(v.shimmerPercent)) {
    notes.push(
      v.shimmerPercent > 3.81
        ? `Loudness steadiness (shimmer ${v.shimmerPercent.toFixed(2)}%) is above the typical range.`
        : `Loudness is steady (shimmer ${v.shimmerPercent.toFixed(2)}%).`,
    );
  }
  notes.push(
    v.pitchRangeSemitones < 1.5
      ? `Intonation is flat (${v.pitchRangeSemitones.toFixed(1)} semitones of variation).`
      : `Intonation is varied (${v.pitchRangeSemitones.toFixed(1)} semitones).`,
  );
  if (v.speechRateHz > 0) {
    notes.push(`Speaking tempo is about ${v.speechRateHz.toFixed(1)} syllables per second.`);
  }
  if (v.pauseRatio > 0.45) {
    notes.push(`Pauses take up ${Math.round(v.pauseRatio * 100)}% of the time.`);
  }
  return notes;
}
