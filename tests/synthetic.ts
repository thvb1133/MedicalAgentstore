/**
 * Synthetic signal generators.
 *
 * These let the whole measurement chain be tested without a camera, a face or
 * a browser. Ground truth is known exactly, so a regression in the filtering
 * or the peak picking shows up as a heart rate that drifts away from the
 * number we asked for rather than as something a human has to eyeball.
 */

/** Deterministic PRNG so a failing test reproduces exactly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticOptions {
  bpm: number;
  fs: number;
  seconds: number;
  /** Breaths per minute, modulating both amplitude and the baseline. */
  breathingBpm?: number;
  /**
   * Standard deviation of white noise on each channel, in 0-255 units, after
   * spatial averaging. The engine averages several thousand skin pixels per
   * frame, so per-pixel sensor noise of a few LSB arrives here divided by the
   * square root of the pixel count — hence a default well below one LSB.
   */
  noise?: number;
  /** Slow illumination ramp across the record, in 0-255 units. */
  drift?: number;
  /** Base skin colour; darker values reduce the pulse amplitude realistically. */
  baseRgb?: [number, number, number];
  seed?: number;
  /** Frame timestamp jitter as a fraction of the nominal interval. */
  timingJitter?: number;
}

export interface SyntheticTrace {
  timestamps: number[];
  r: number[];
  g: number[];
  b: number[];
}

/**
 * A physiologically shaped pulse: a sharp systolic upstroke, a dicrotic notch
 * and a slower decay, rather than a sine wave. The shape matters because the
 * beat detector and the morphology features both depend on it.
 */
function pulseShape(phase: number): number {
  const systolic = Math.exp(-(((phase - 0.16) / 0.09) ** 2));
  const dicrotic = 0.35 * Math.exp(-(((phase - 0.42) / 0.11) ** 2));
  return systolic + dicrotic;
}

/**
 * Generate skin-colour traces containing a known pulse.
 *
 * The green channel carries roughly twice the pulse amplitude of red and blue,
 * which is what haemoglobin absorption actually does and what every rPPG
 * projection relies on.
 */
export function syntheticRgb(options: SyntheticOptions): SyntheticTrace {
  const {
    bpm,
    fs,
    seconds,
    breathingBpm = 15,
    noise = 0.08,
    drift = 2,
    baseRgb = [165, 120, 105],
    seed = 1,
    timingJitter = 0,
  } = options;

  /**
   * One generator per channel, and both Box-Muller outputs are used.
   *
   * Drawing red, green and blue from a single stream in sequence leaves them
   * correlated enough to produce a shared spurious spectral line, which would
   * quietly defeat the engine's cross-method agreement check — the tests
   * would then be validating against noise that no real sensor produces.
   */
  const makeGauss = (streamSeed: number) => {
    const rand = mulberry32(streamSeed);
    let spare: number | null = null;
    return () => {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      const u = Math.max(rand(), 1e-9);
      const v = rand();
      const radius = Math.sqrt(-2 * Math.log(u));
      spare = radius * Math.sin(2 * Math.PI * v);
      return radius * Math.cos(2 * Math.PI * v);
    };
  };

  const gaussR = makeGauss(seed * 2654435761);
  const gaussG = makeGauss(seed * 40503 + 12345);
  const gaussB = makeGauss(seed * 1103515245 + 98765);
  const gaussT = makeGauss(seed * 69069 + 555);

  const n = Math.round(seconds * fs);
  const beatHz = bpm / 60;
  const breathHz = breathingBpm / 60;

  const timestamps: number[] = [];
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];

  // Pulse amplitude scales with skin brightness, the effect that makes rPPG
  // harder on darker skin.
  const brightness = (baseRgb[0] + baseRgb[1] + baseRgb[2]) / 3 / 255;
  const amplitude = 1.1 * brightness;

  for (let i = 0; i < n; i++) {
    const nominal = (i / fs) * 1000;
    const jitter = timingJitter > 0 ? gaussT() * timingJitter * (1000 / fs) : 0;
    const t = nominal + jitter;
    timestamps.push(t);

    const seconds_ = t / 1000;
    const phase = (seconds_ * beatHz) % 1;
    // Respiratory sinus arrhythmia: breathing modulates pulse amplitude.
    const breathMod = 1 + 0.12 * Math.sin(2 * Math.PI * breathHz * seconds_);
    const pulse = pulseShape(phase) * amplitude * breathMod;
    const ramp = (i / n) * drift;

    r.push(baseRgb[0] + pulse * 0.5 + ramp + gaussR() * noise);
    g.push(baseRgb[1] + pulse * 1.0 + ramp + gaussG() * noise);
    b.push(baseRgb[2] + pulse * 0.4 + ramp + gaussB() * noise);
  }

  return { timestamps, r, g, b };
}

/** A tremor: a fingertip oscillating at a known frequency, plus slow drift. */
export function syntheticTremor(
  frequencyHz: number,
  amplitude: number,
  fs: number,
  seconds: number,
  seed = 7,
): { timestamps: number[]; x: number[]; y: number[] } {
  const rand = mulberry32(seed);
  const n = Math.round(seconds * fs);
  const timestamps: number[] = [];
  const x: number[] = [];
  const y: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / fs;
    timestamps.push(t * 1000);
    const drift = 0.02 * Math.sin(2 * Math.PI * 0.15 * t);
    x.push(amplitude * Math.sin(2 * Math.PI * frequencyHz * t) + drift + (rand() - 0.5) * 0.0004);
    y.push(
      amplitude * 0.6 * Math.cos(2 * Math.PI * frequencyHz * t) +
        drift * 0.5 +
        (rand() - 0.5) * 0.0004,
    );
  }

  return { timestamps, x, y };
}

/** Finger tapping at a given rate, optionally with a decaying amplitude. */
export function syntheticTapping(
  tapsPerSecond: number,
  fs: number,
  seconds: number,
  decrement = 0,
  seed = 11,
): { timestamps: number[]; pinch: number[] } {
  const rand = mulberry32(seed);
  const n = Math.round(seconds * fs);
  const timestamps: number[] = [];
  const pinch: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / fs;
    timestamps.push(t * 1000);
    const progress = t / seconds;
    const amp = 0.5 * (1 + decrement * progress);
    // Raised cosine: closed at phase 0, open at phase 0.5.
    const value = amp * (1 - Math.cos(2 * Math.PI * tapsPerSecond * t)) * 0.5;
    pinch.push(value + (rand() - 0.5) * 0.004);
  }

  return { timestamps, pinch };
}
