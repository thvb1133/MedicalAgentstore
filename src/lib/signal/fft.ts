/**
 * Radix-2 FFT and spectral helpers used by every measurement in the app.
 *
 * Everything here is pure and synchronous so it can be unit tested without a
 * camera, and so the same code runs in a worker, in the browser, or in Node.
 */

export interface Spectrum {
  /** Frequency of each bin, in Hz. */
  freqs: Float64Array;
  /** Magnitude of each bin (single-sided, not normalised to amplitude). */
  mags: Float64Array;
  /** Sample rate the spectrum was computed at. */
  fs: number;
}

export interface SpectralPeak {
  freq: number;
  magnitude: number;
  /** Fraction of total in-band power contained in this peak's neighbourhood. */
  prominence: number;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT.
 * `re` and `im` must have a power-of-two length.
 */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`fftInPlace requires a power-of-two length, got ${n}`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Periodic Hann window, the standard choice for this kind of short record. */
export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  }
  return w;
}

/**
 * Single-sided magnitude spectrum of a real signal.
 *
 * `zeroPadFactor` above 1 interpolates the frequency axis, which matters here:
 * a 30 second window at 30 fps only gives 0.033 Hz resolution, which is 2 BPM.
 * Padding to 4x gets us to sub-BPM spacing before parabolic interpolation.
 */
export function magnitudeSpectrum(
  signal: ArrayLike<number>,
  fs: number,
  zeroPadFactor = 4,
): Spectrum {
  const n = signal.length;
  if (n < 4) {
    return { freqs: new Float64Array(0), mags: new Float64Array(0), fs };
  }

  const win = hann(n);
  const padded = nextPow2(n * Math.max(1, zeroPadFactor));
  const re = new Float64Array(padded);
  const im = new Float64Array(padded);

  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;

  for (let i = 0; i < n; i++) {
    re[i] = (signal[i] - mean) * win[i];
  }

  fftInPlace(re, im);

  const half = padded >> 1;
  const freqs = new Float64Array(half);
  const mags = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    freqs[i] = (i * fs) / padded;
    mags[i] = Math.hypot(re[i], im[i]);
  }

  return { freqs, mags, fs };
}

/**
 * Strongest peak within [loHz, hiHz], refined by parabolic interpolation on
 * the log-magnitude so the answer is not quantised to the bin grid.
 *
 * `prominence` reports how much of the in-band power sits under this peak,
 * which is the basis of our confidence score: a clean pulse concentrates
 * power in one narrow peak, noise spreads it out.
 */
export function dominantPeak(
  spec: Spectrum,
  loHz: number,
  hiHz: number,
): SpectralPeak | null {
  const { freqs, mags } = spec;
  if (freqs.length === 0) return null;

  let bestIdx = -1;
  let bestMag = -Infinity;
  let bandPower = 0;

  for (let i = 1; i < freqs.length - 1; i++) {
    const f = freqs[i];
    if (f < loHz || f > hiHz) continue;
    bandPower += mags[i] * mags[i];
    if (mags[i] > bestMag) {
      bestMag = mags[i];
      bestIdx = i;
    }
  }

  if (bestIdx < 1 || bandPower <= 0) return null;

  // Parabolic interpolation around the peak, in the log domain.
  const ym = Math.log(mags[bestIdx - 1] + 1e-12);
  const y0 = Math.log(mags[bestIdx] + 1e-12);
  const yp = Math.log(mags[bestIdx + 1] + 1e-12);
  const denom = ym - 2 * y0 + yp;
  const delta = denom === 0 ? 0 : (0.5 * (ym - yp)) / denom;
  const binWidth = freqs[1] - freqs[0];
  const freq = freqs[bestIdx] + clamp(delta, -0.5, 0.5) * binWidth;

  // Power within +/- 0.12 Hz (about +/- 7 BPM) of the peak.
  let peakPower = 0;
  for (let i = 0; i < freqs.length; i++) {
    if (Math.abs(freqs[i] - freq) <= 0.12) peakPower += mags[i] * mags[i];
  }

  return {
    freq,
    magnitude: bestMag,
    prominence: clamp(peakPower / bandPower, 0, 1),
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
