/**
 * Remote photoplethysmography: turning per-frame skin colour into a pulse.
 *
 * Two published algorithms are implemented, both of which work by projecting
 * RGB onto a direction where the pulse survives and motion-induced intensity
 * change cancels out:
 *
 *   CHROM  de Haan & Jeanne (2013), IEEE TBME
 *   POS    Wang et al. (2017), "Algorithmic principles of remote PPG", IEEE TBME
 *
 * POS is the default because it degrades more gracefully when the subject
 * moves, which is the normal case for someone sitting at a laptop.
 *
 * Neither method needs training data, which is why the whole pipeline runs
 * offline in the browser with no model download and no per-user calibration.
 */

import { bandpass, detrend, mean, normalise, stdDev } from "./filters";

export interface RgbTrace {
  r: ArrayLike<number>;
  g: ArrayLike<number>;
  b: ArrayLike<number>;
}

export type RppgMethod = "pos" | "chrom" | "green";

/** Physiological plausibility bounds: 40-180 BPM. */
export const PULSE_BAND_HZ = { lo: 40 / 60, hi: 180 / 60 } as const;

/** Respiration: 6-30 breaths per minute. */
export const BREATHING_BAND_HZ = { lo: 6 / 60, hi: 30 / 60 } as const;

function temporalNormalise(x: ArrayLike<number>): Float64Array {
  const m = mean(x) || 1;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] / m;
  return out;
}

/**
 * POS with the sliding-window overlap-add described in the paper.
 *
 * The window is one and a half seconds of frames, which is long enough to
 * contain a full cardiac cycle at the slowest plausible heart rate and short
 * enough that the skin tone is effectively stationary across it.
 */
export function posPulse(trace: RgbTrace, fs: number): Float64Array {
  const n = trace.r.length;
  const out = new Float64Array(n);
  if (n < 8) return out;

  const windowLen = Math.max(8, Math.round(1.6 * fs));
  if (n < windowLen) return posWindow(trace, 0, n);

  for (let start = 0; start + windowLen <= n; start++) {
    const h = posWindow(trace, start, windowLen);
    const hMean = mean(h);
    const hSd = stdDev(h) || 1;
    // Overlap-add the standardised window contribution.
    for (let i = 0; i < windowLen; i++) {
      out[start + i] += (h[i] - hMean) / hSd;
    }
  }
  return out;
}

function posWindow(trace: RgbTrace, start: number, len: number): Float64Array {
  const r = new Float64Array(len);
  const g = new Float64Array(len);
  const b = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    r[i] = trace.r[start + i];
    g[i] = trace.g[start + i];
    b[i] = trace.b[start + i];
  }

  const rn = temporalNormalise(r);
  const gn = temporalNormalise(g);
  const bn = temporalNormalise(b);

  // Projection matrix P = [[0, 1, -1], [-2, 1, 1]].
  const s1 = new Float64Array(len);
  const s2 = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    s1[i] = gn[i] - bn[i];
    s2[i] = -2 * rn[i] + gn[i] + bn[i];
  }

  // Tune the two projections against each other so specular motion cancels.
  const alpha = (stdDev(s1) || 0) / (stdDev(s2) || 1);
  const h = new Float64Array(len);
  for (let i = 0; i < len; i++) h[i] = s1[i] + alpha * s2[i];
  return h;
}

/** CHROM, kept as a cross-check and as a fallback for very still subjects. */
export function chromPulse(trace: RgbTrace, fs: number): Float64Array {
  const n = trace.r.length;
  if (n < 8) return new Float64Array(n);

  const rn = temporalNormalise(trace.r);
  const gn = temporalNormalise(trace.g);
  const bn = temporalNormalise(trace.b);

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = 3 * rn[i] - 2 * gn[i];
    ys[i] = 1.5 * rn[i] + gn[i] - 1.5 * bn[i];
  }

  const xf = bandpass(xs, fs, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi);
  const yf = bandpass(ys, fs, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi);

  const alpha = (stdDev(xf) || 0) / (stdDev(yf) || 1);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = xf[i] - alpha * yf[i];
  return out;
}

/**
 * The green channel on its own, detrended.
 *
 * Kept as a third candidate because it is the strongest single carrier of the
 * haemoglobin absorption signal. POS and CHROM earn their place by cancelling
 * *correlated* artefacts — motion, illumination change — but both combine
 * three channels and therefore add up three lots of uncorrelated sensor
 * noise. When the subject is still and the light is steady, plain green wins.
 */
export function greenPulse(trace: RgbTrace): Float64Array {
  return detrend(trace.g);
}

/**
 * Full extraction: raw RGB means to a clean, band-limited pulse waveform.
 */
export function extractPulse(
  trace: RgbTrace,
  fs: number,
  method: RppgMethod = "pos",
): Float64Array {
  const raw =
    method === "chrom"
      ? chromPulse(trace, fs)
      : method === "green"
        ? greenPulse(trace)
        : posPulse(trace, fs);
  const filtered = bandpass(detrend(raw), fs, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi);
  return normalise(filtered);
}

/**
 * All three extractions of the same trace.
 *
 * The engine picks between them per measurement rather than committing to one
 * globally, because which is best depends on conditions that change from
 * second to second: POS under movement, green under still, low light.
 */
export function extractPulseCandidates(
  trace: RgbTrace,
  fs: number,
): Array<{ method: RppgMethod; waveform: Float64Array }> {
  return (["pos", "chrom", "green"] as const).map((method) => ({
    method,
    waveform: extractPulse(trace, fs, method),
  }));
}

/**
 * Breathing modulates the pulse in two ways we can see: it moves the head
 * slightly, and it changes pulse amplitude (respiratory sinus arrhythmia).
 * This extracts the slow component that carries both.
 */
export function extractBreathing(signal: ArrayLike<number>, fs: number): Float64Array {
  return normalise(
    bandpass(detrend(signal), fs, BREATHING_BAND_HZ.lo, BREATHING_BAND_HZ.hi),
  );
}
