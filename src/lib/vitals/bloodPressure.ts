/**
 * Cuffless blood pressure from the webcam pulse waveform.
 *
 * Read this before changing anything here.
 *
 * A camera cannot measure blood pressure. It measures the shape and timing of
 * the pulse wave, and blood pressure is *inferred* from that shape. The
 * relationship between waveform morphology and pressure varies enormously
 * between people — arterial stiffness, height, age and vascular tone all move
 * it — so a model fitted to a population produces a number that looks
 * plausible for everyone and is right for almost nobody.
 *
 * Every cleared product in this space handles it the same way: a one-time
 * calibration against a real arm cuff, after which the camera tracks *change*
 * from that anchor. Lifelight and the SFDA-authorised apps both require it.
 * So does this module. Without calibration it returns null, deliberately, and
 * the UI shows a prompt instead of a number.
 *
 * This is a wellness estimate for research and demonstration. It is not a
 * medical device and must not be used to make treatment decisions.
 */

import { clamp } from "../signal/fft";
import { mean, stdDev } from "../signal/filters";

export interface PulseFeatures {
  heartRateBpm: number;
  /** Time from foot to systolic peak, normalised by cycle length. 0-1. */
  upstrokeRatio: number;
  /** Width at half the peak amplitude, normalised by cycle length. 0-1. */
  halfWidthRatio: number;
  /** Reflected-wave height relative to the systolic peak. Stiffness proxy. */
  augmentationIndex: number;
  /** Beat-to-beat shape consistency, 0-1. Low values mean untrustworthy features. */
  morphologyStability: number;
}

export interface CuffReading {
  systolic: number;
  diastolic: number;
  /** Epoch milliseconds when the cuff reading was taken. */
  takenAtMs: number;
  /** Features measured by the camera at the same sitting. */
  features: PulseFeatures;
}

export interface BpCalibration {
  readings: CuffReading[];
  /** Fitted personal model, or null when there are too few readings. */
  model: BpModel | null;
}

export interface BpModel {
  systolic: LinearTerms;
  diastolic: LinearTerms;
  /** Epoch ms of the most recent calibration reading used in the fit. */
  fittedAtMs: number;
  /** Residual spread of the fit in mmHg; feeds the reported uncertainty. */
  residualSd: number;
  /** How many cuff readings the fit is based on. */
  points: number;
}

interface LinearTerms {
  intercept: number;
  /** Coefficient per feature, in the order given by FEATURE_ORDER. */
  weights: number[];
}

const FEATURE_ORDER = [
  "heartRateBpm",
  "upstrokeRatio",
  "halfWidthRatio",
  "augmentationIndex",
] as const;

/**
 * Population slopes, used only to propagate a single calibration point.
 *
 * These come from the consistent direction of effect reported in the pulse
 * wave analysis literature — faster heart rate and a shorter upstroke both
 * accompany higher pressure, a higher augmentation index reflects stiffer
 * arteries — with magnitudes kept deliberately small. With one cuff reading
 * we mostly want to hold the user's own anchor and move gently around it.
 */
const POPULATION_SLOPES: Record<(typeof FEATURE_ORDER)[number], [number, number]> = {
  //                                        [systolic, diastolic] mmHg per unit
  heartRateBpm: [0.28, 0.19],
  upstrokeRatio: [-42, -25],
  halfWidthRatio: [-18, -11],
  augmentationIndex: [22, 13],
};

/** Calibration older than this is reported as stale. */
export const CALIBRATION_STALE_DAYS = 30;

/** Physiological clamp so a bad fit cannot emit an absurd reading. */
const SYSTOLIC_RANGE: [number, number] = [80, 200];
const DIASTOLIC_RANGE: [number, number] = [45, 130];

function featureVector(f: PulseFeatures): number[] {
  return FEATURE_ORDER.map((k) => f[k]);
}

/**
 * Extract morphology features from a band-limited pulse waveform.
 *
 * Returns null when the beats are too inconsistent for the shape measurements
 * to mean anything, which is common under poor lighting.
 */
export function extractPulseFeatures(
  waveform: ArrayLike<number>,
  fs: number,
  beatTimesS: number[],
  heartRateBpm: number,
): PulseFeatures | null {
  if (beatTimesS.length < 4 || waveform.length < fs * 4) return null;

  const cycles: Float64Array[] = [];
  for (let i = 0; i < beatTimesS.length - 1; i++) {
    const start = Math.round(beatTimesS[i] * fs);
    const end = Math.round(beatTimesS[i + 1] * fs);
    const len = end - start;
    if (len < 6 || end > waveform.length) continue;
    const cycle = new Float64Array(len);
    for (let j = 0; j < len; j++) cycle[j] = waveform[start + j];
    cycles.push(cycle);
  }
  if (cycles.length < 3) return null;

  // Resample every cycle to a common length so they can be averaged and
  // compared. 64 points is ample for the features we take.
  const N = 64;
  const resampled = cycles.map((c) => resampleTo(c, N));

  const template = new Float64Array(N);
  for (const c of resampled) for (let i = 0; i < N; i++) template[i] += c[i] / resampled.length;

  // Stability is the mean correlation of each cycle against the template.
  let corrSum = 0;
  for (const c of resampled) corrSum += correlation(c, template);
  const morphologyStability = clamp(corrSum / resampled.length, 0, 1);
  if (morphologyStability < 0.5) return null;

  // Normalise the template to a 0-1 range with the foot at zero.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < N; i++) {
    if (template[i] < lo) lo = template[i];
    if (template[i] > hi) hi = template[i];
  }
  const span = hi - lo || 1;
  const norm = new Float64Array(N);
  for (let i = 0; i < N; i++) norm[i] = (template[i] - lo) / span;

  const footIdx = argMin(norm);
  const peakIdx = argMax(norm);
  // Rotate so the cycle starts at the foot, which is where the upstroke begins.
  const rotated = new Float64Array(N);
  for (let i = 0; i < N; i++) rotated[i] = norm[(footIdx + i) % N];
  const rotatedPeak = (peakIdx - footIdx + N) % N;

  const upstrokeRatio = clamp(rotatedPeak / N, 0.02, 0.98);

  // Width at half height, measured around the systolic peak.
  let left = rotatedPeak;
  while (left > 0 && rotated[left] > 0.5) left--;
  let right = rotatedPeak;
  while (right < N - 1 && rotated[right] > 0.5) right++;
  const halfWidthRatio = clamp((right - left) / N, 0.02, 0.98);

  // Augmentation index: the largest secondary maximum after the systolic peak,
  // which is the reflected wave returning from the periphery.
  let reflected = 0;
  for (let i = rotatedPeak + 2; i < N - 1; i++) {
    if (rotated[i] >= rotated[i - 1] && rotated[i] >= rotated[i + 1]) {
      reflected = Math.max(reflected, rotated[i]);
    }
  }
  const augmentationIndex = clamp(reflected, 0, 1);

  return {
    heartRateBpm,
    upstrokeRatio,
    halfWidthRatio,
    augmentationIndex,
    morphologyStability,
  };
}

function resampleTo(x: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n);
  const scale = (x.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    const pos = i * scale;
    const j = Math.floor(pos);
    const frac = pos - j;
    out[i] = j + 1 < x.length ? x[j] * (1 - frac) + x[j + 1] * frac : x[x.length - 1];
  }
  return out;
}

function correlation(a: Float64Array, b: Float64Array): number {
  const ma = mean(a);
  const mb = mean(b);
  const sa = stdDev(a) || 1;
  const sb = stdDev(b) || 1;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / ((a.length - 1) * sa * sb);
}

function argMin(x: Float64Array): number {
  let idx = 0;
  for (let i = 1; i < x.length; i++) if (x[i] < x[idx]) idx = i;
  return idx;
}

function argMax(x: Float64Array): number {
  let idx = 0;
  for (let i = 1; i < x.length; i++) if (x[i] > x[idx]) idx = i;
  return idx;
}

/**
 * Fit a personal model to the cuff readings collected so far.
 *
 * With one reading we take the population slopes and solve for the intercept
 * that reproduces that reading exactly — the camera then tracks change from
 * the user's own anchor. With three or more we fit ridge-regularised weights,
 * which lets the model learn that this individual's pressure responds to
 * waveform change differently from the average.
 *
 * Two readings sit awkwardly between the two, so they are treated as one:
 * averaged into a single, better-estimated anchor.
 */
export function fitCalibration(readings: CuffReading[]): BpModel | null {
  const usable = readings.filter((r) => r.features.morphologyStability >= 0.5);
  if (usable.length === 0) return null;

  const fittedAtMs = Math.max(...usable.map((r) => r.takenAtMs));

  if (usable.length < 3) {
    const anchor = averageReading(usable);
    const x = featureVector(anchor.features);
    const sysWeights = FEATURE_ORDER.map((k) => POPULATION_SLOPES[k][0]);
    const diaWeights = FEATURE_ORDER.map((k) => POPULATION_SLOPES[k][1]);
    return {
      systolic: {
        intercept: anchor.systolic - dot(sysWeights, x),
        weights: sysWeights,
      },
      diastolic: {
        intercept: anchor.diastolic - dot(diaWeights, x),
        weights: diaWeights,
      },
      fittedAtMs,
      // A single anchor cannot estimate its own error. This is the typical
      // agreement reported for calibrated cuffless devices, which is honest
      // about the fact that we do not really know.
      residualSd: usable.length === 1 ? 9 : 7.5,
      points: usable.length,
    };
  }

  const X = usable.map((r) => featureVector(r.features));
  const sys = ridgeFit(X, usable.map((r) => r.systolic));
  const dia = ridgeFit(X, usable.map((r) => r.diastolic));

  const residuals: number[] = [];
  for (let i = 0; i < usable.length; i++) {
    residuals.push(usable[i].systolic - (sys.intercept + dot(sys.weights, X[i])));
    residuals.push(usable[i].diastolic - (dia.intercept + dot(dia.weights, X[i])));
  }
  // Never claim better agreement than the reference cuff itself achieves.
  const residualSd = Math.max(5, stdDev(residuals));

  return { systolic: sys, diastolic: dia, fittedAtMs, residualSd, points: usable.length };
}

function averageReading(readings: CuffReading[]): CuffReading {
  const n = readings.length;
  const avgFeature = (pick: (f: PulseFeatures) => number) =>
    readings.reduce((a, r) => a + pick(r.features), 0) / n;
  return {
    systolic: readings.reduce((a, r) => a + r.systolic, 0) / n,
    diastolic: readings.reduce((a, r) => a + r.diastolic, 0) / n,
    takenAtMs: Math.max(...readings.map((r) => r.takenAtMs)),
    features: {
      heartRateBpm: avgFeature((f) => f.heartRateBpm),
      upstrokeRatio: avgFeature((f) => f.upstrokeRatio),
      halfWidthRatio: avgFeature((f) => f.halfWidthRatio),
      augmentationIndex: avgFeature((f) => f.augmentationIndex),
      morphologyStability: avgFeature((f) => f.morphologyStability),
    },
  };
}

/**
 * Ridge regression by normal equations with Gaussian elimination.
 *
 * The regularisation is doing real work: with four features and often only
 * three or four calibration points the unregularised system is close to
 * singular, and would happily fit weights of several hundred mmHg per unit.
 */
function ridgeFit(X: number[][], y: number[], lambda = 0.35): LinearTerms {
  const d = X[0].length;
  const n = X.length;

  const colMean = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) colMean[j] += row[j] / n;
  const colSd = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) colSd[j] += (row[j] - colMean[j]) ** 2;
  for (let j = 0; j < d; j++) colSd[j] = Math.sqrt(colSd[j] / Math.max(1, n - 1)) || 1;

  const Z = X.map((row) => row.map((v, j) => (v - colMean[j]) / colSd[j]));
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  const A: number[][] = Array.from({ length: d }, () => new Array(d + 1).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += Z[k][i] * Z[k][j];
      A[i][j] = s + (i === j ? lambda * n : 0);
    }
    let s = 0;
    for (let k = 0; k < n; k++) s += Z[k][i] * (y[k] - yMean);
    A[i][d] = s;
  }

  const wz = solve(A, d);
  const weights = wz.map((w, j) => w / colSd[j]);
  const intercept = yMean - weights.reduce((a, w, j) => a + w * colMean[j], 0);
  return { intercept, weights };
}

function solve(A: number[][], d: number): number[] {
  for (let col = 0; col < d; col++) {
    let pivot = col;
    for (let r = col + 1; r < d; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-12) continue;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < d; r++) {
      if (r === col) continue;
      const factor = A[r][col] / A[col][col];
      for (let c = col; c <= d; c++) A[r][c] -= factor * A[col][c];
    }
  }
  return Array.from({ length: d }, (_, i) =>
    Math.abs(A[i][i]) < 1e-12 ? 0 : A[i][d] / A[i][i],
  );
}

function dot(w: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * x[i];
  return s;
}

export type BpStatus =
  | "ok"
  | "needs-calibration"
  | "signal-too-weak"
  | "calibration-stale";

export interface BpEstimate {
  status: BpStatus;
  systolic: number | null;
  diastolic: number | null;
  /** Plus-or-minus range in mmHg, widened for stale or thin calibration. */
  uncertainty: number | null;
  /** Days since the calibration was fitted. */
  calibrationAgeDays: number | null;
  calibrationPoints: number;
  /** Message the UI shows in place of, or alongside, the numbers. */
  message: string;
}

/**
 * Produce a blood pressure estimate, or an explanation of why we will not.
 *
 * The gating here is the whole point of the module. There are three separate
 * ways to get a null, and each one tells the user something different.
 */
export function estimateBloodPressure(
  features: PulseFeatures | null,
  calibration: BpCalibration,
  signalQuality: number,
  nowMs: number = Date.now(),
): BpEstimate {
  const points = calibration.readings.length;

  if (!calibration.model) {
    return {
      status: "needs-calibration",
      systolic: null,
      diastolic: null,
      uncertainty: null,
      calibrationAgeDays: null,
      calibrationPoints: points,
      message:
        "Blood pressure needs a one-time calibration against a real arm cuff before it can be shown.",
    };
  }

  // Morphology features are far more fragile than heart rate, so the bar for
  // showing pressure is set well above the bar for showing a pulse.
  if (!features || signalQuality < 0.6 || features.morphologyStability < 0.6) {
    return {
      status: "signal-too-weak",
      systolic: null,
      diastolic: null,
      uncertainty: null,
      calibrationAgeDays: ageDays(calibration.model.fittedAtMs, nowMs),
      calibrationPoints: points,
      message:
        "Pulse waveform is not clean enough for a pressure estimate. Hold still in even lighting.",
    };
  }

  const x = featureVector(features);
  const model = calibration.model;
  const systolic = clamp(
    model.systolic.intercept + dot(model.systolic.weights, x),
    ...SYSTOLIC_RANGE,
  );
  const diastolic = clamp(
    model.diastolic.intercept + dot(model.diastolic.weights, x),
    ...DIASTOLIC_RANGE,
  );

  const ageD = ageDays(model.fittedAtMs, nowMs);

  // Uncertainty grows with a thin calibration, a weak signal, and age. The
  // drift term reflects that the personal anchor decays as vascular state
  // changes over weeks.
  const thinness = model.points >= 3 ? 1 : model.points === 2 ? 1.3 : 1.6;
  const qualityPenalty = 1 + (1 - signalQuality) * 1.2;
  const drift = 1 + ageD / CALIBRATION_STALE_DAYS;
  const uncertainty = Math.round(model.residualSd * thinness * qualityPenalty * drift);

  if (ageD > CALIBRATION_STALE_DAYS) {
    return {
      status: "calibration-stale",
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic),
      uncertainty,
      calibrationAgeDays: ageD,
      calibrationPoints: points,
      message: `Calibration is ${Math.round(ageD)} days old. Re-measure with a cuff for a trustworthy reading.`,
    };
  }

  return {
    status: "ok",
    systolic: Math.round(systolic),
    diastolic: Math.round(diastolic),
    uncertainty,
    calibrationAgeDays: ageD,
    calibrationPoints: points,
    message: `Estimate anchored to ${model.points} cuff reading${model.points === 1 ? "" : "s"}. Wellness use only, not a medical device.`,
  };
}

function ageDays(fittedAtMs: number, nowMs: number): number {
  return Math.max(0, (nowMs - fittedAtMs) / 86_400_000);
}

const STORAGE_KEY = "sanjivani-setu.bp-calibration.v1";

export function loadCalibration(): BpCalibration {
  if (typeof window === "undefined") return { readings: [], model: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { readings: [], model: null };
    const readings = JSON.parse(raw) as CuffReading[];
    return { readings, model: fitCalibration(readings) };
  } catch {
    return { readings: [], model: null };
  }
}

export function saveCalibration(readings: CuffReading[]): BpCalibration {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
  }
  return { readings, model: fitCalibration(readings) };
}
