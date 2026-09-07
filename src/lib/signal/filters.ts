/**
 * Time-domain filters shared by the pulse, breathing and tremor pipelines.
 *
 * These are deliberately zero-phase where it matters. A causal IIR filter
 * shifts peaks in time, which would corrupt the inter-beat intervals that HRV
 * is computed from, so the bandpass runs forwards then backwards.
 */

/** Subtract a least-squares straight line. Removes slow lighting drift. */
export function detrend(x: ArrayLike<number>): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  if (n === 0) return out;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += x[i];
    sumXY += i * x[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  for (let i = 0; i < n; i++) out[i] = x[i] - (slope * i + intercept);
  return out;
}

export function mean(x: ArrayLike<number>): number {
  if (x.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return s / x.length;
}

export function stdDev(x: ArrayLike<number>): number {
  const n = x.length;
  if (n < 2) return 0;
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i] - m) ** 2;
  return Math.sqrt(s / (n - 1));
}

/** Divide by the standard deviation so channels can be compared fairly. */
export function normalise(x: ArrayLike<number>): Float64Array {
  const m = mean(x);
  const sd = stdDev(x) || 1;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i] - m) / sd;
  return out;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook bandpass, constant 0 dB peak gain. */
function bandpassBiquad(fs: number, centreHz: number, q: number): Biquad {
  const w0 = (2 * Math.PI * centreHz) / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(x: ArrayLike<number>, f: Biquad): Float64Array {
  const n = x.length;
  const y = new Float64Array(n);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = f.b0 * xi + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
    y[i] = yi;
  }
  return y;
}

function reverse(x: Float64Array): Float64Array {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[x.length - 1 - i];
  return out;
}

/**
 * Zero-phase bandpass between `loHz` and `hiHz`.
 *
 * Runs a single biquad forwards and backwards, which squares the magnitude
 * response and cancels the phase response. Peak positions are preserved,
 * which is what the beat detector downstream depends on.
 */
export function bandpass(
  x: ArrayLike<number>,
  fs: number,
  loHz: number,
  hiHz: number,
): Float64Array {
  const n = x.length;
  if (n < 8) return Float64Array.from(x);

  const centre = Math.sqrt(Math.max(loHz, 1e-3) * hiHz);
  const bandwidth = Math.max(hiHz - loHz, 1e-3);
  const q = Math.max(centre / bandwidth, 0.35);
  const f = bandpassBiquad(fs, centre, q);

  // Reflect-pad both ends to stop the filter transient eating real signal.
  const pad = Math.min(n - 1, Math.ceil(fs * 2));
  const padded = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) padded[i] = x[pad - i];
  for (let i = 0; i < n; i++) padded[pad + i] = x[i];
  for (let i = 0; i < pad; i++) padded[pad + n + i] = x[n - 2 - i] ?? x[n - 1];

  const forward = applyBiquad(padded, f);
  const backward = reverse(applyBiquad(reverse(forward), f));

  return backward.slice(pad, pad + n);
}

/** Centred moving average, used to smooth per-frame landmark jitter. */
export function movingAverage(x: ArrayLike<number>, window: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  const half = Math.max(0, Math.floor(window / 2));
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= n) continue;
      s += x[j];
      c++;
    }
    out[i] = c === 0 ? 0 : s / c;
  }
  return out;
}

/**
 * Resample an irregularly timed series onto a uniform grid.
 *
 * Webcam frames do not arrive at a constant rate — dropped frames and
 * browser throttling are normal — but every spectral method below assumes
 * uniform sampling, so we interpolate onto a fixed grid first. Skipping this
 * step is the single most common source of wrong heart rates.
 */
export function resampleUniform(
  timestampsMs: ArrayLike<number>,
  values: ArrayLike<number>,
  fs: number,
): { values: Float64Array; fs: number } {
  const n = timestampsMs.length;
  if (n < 2) return { values: Float64Array.from(values), fs };

  const t0 = timestampsMs[0];
  const t1 = timestampsMs[n - 1];
  const durationS = (t1 - t0) / 1000;
  const count = Math.max(2, Math.floor(durationS * fs));
  const out = new Float64Array(count);

  let j = 0;
  for (let i = 0; i < count; i++) {
    const t = t0 + (i / fs) * 1000;
    while (j < n - 2 && timestampsMs[j + 1] < t) j++;
    const tA = timestampsMs[j];
    const tB = timestampsMs[j + 1];
    const span = tB - tA;
    const frac = span <= 0 ? 0 : (t - tA) / span;
    out[i] = values[j] + (values[j + 1] - values[j]) * Math.min(Math.max(frac, 0), 1);
  }

  return { values: out, fs };
}

/** Median of a copy of the input. */
export function median(x: ArrayLike<number>): number {
  const n = x.length;
  if (n === 0) return 0;
  const sorted = Array.from(x).sort((a, b) => a - b);
  const mid = n >> 1;
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
