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

export interface SyntheticVoiceOptions {
  fs: number;
  seconds: number;
  /** Mean fundamental frequency in Hz. */
  f0Hz: number;
  /** Target cycle-to-cycle period variation, as Praat's local jitter percent. */
  jitterPercent?: number;
  /** Target cycle-to-cycle amplitude variation, as local shimmer percent. */
  shimmerPercent?: number;
  /** Harmonics-to-noise ratio to synthesise, in dB. */
  hnrDb?: number;
  /** Peak-to-peak pitch movement, in semitones, as a slow contour. */
  pitchRangeSemitones?: number;
  /** Amplitude modulation rate standing in for syllables, in Hz. */
  syllableRateHz?: number;
  /** Silent intervals as [startSeconds, endSeconds] pairs. */
  pauses?: Array<[number, number]>;
  seed?: number;
}

/**
 * A synthetic voice built cycle by cycle from glottal pulses.
 *
 * Building it per cycle rather than as a summed harmonic series is what makes
 * it useful: jitter and shimmer are defined as cycle-to-cycle differences, so
 * a generator that can place each cycle individually can produce a recording
 * whose true jitter is known exactly, which is the only way to check that the
 * analyser measures it rather than measuring its own peak-picking error.
 *
 * The pulse shape is the Rosenberg model — a rounded opening phase and a
 * faster closing phase — which has a single unambiguous maximum per cycle.
 */
export function syntheticVoice(options: SyntheticVoiceOptions): Float64Array {
  const {
    fs,
    seconds,
    f0Hz,
    jitterPercent = 0,
    shimmerPercent = 0,
    hnrDb = 25,
    pitchRangeSemitones = 0,
    syllableRateHz = 0,
    pauses = [],
    seed = 3,
  } = options;

  const rand = mulberry32(seed);
  let spare: number | null = null;
  const gauss = () => {
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

  // For periods T_i = T(1 + e_i) with e_i independent and normal with standard
  // deviation s, the mean absolute successive difference is T·s·2/√π. Inverting
  // that gives the s which produces the jitter percentage the caller asked for.
  const periodSd = jitterPercent / 100 / (2 / Math.sqrt(Math.PI));
  const amplitudeSd = shimmerPercent / 100 / (2 / Math.sqrt(Math.PI));

  const n = Math.round(seconds * fs);
  const out = new Float64Array(n);

  const isPaused = (t: number) => pauses.some(([a, b]) => t >= a && t < b);

  let cursor = 0;
  while (cursor < n) {
    const t = cursor / fs;
    // Slow pitch contour, so the analyser sees a moving fundamental the way it
    // would in real connected speech.
    const semitoneOffset =
      pitchRangeSemitones > 0
        ? (pitchRangeSemitones / 2) * Math.sin(2 * Math.PI * 0.35 * t)
        : 0;
    const instantF0 = f0Hz * Math.pow(2, semitoneOffset / 12);

    const period = (fs / instantF0) * (1 + gauss() * periodSd);
    const periodSamples = Math.max(4, Math.round(period));

    let amplitude = 1 + gauss() * amplitudeSd;
    if (syllableRateHz > 0) {
      // Never fully closes, so voicing stays continuous within a syllable run.
      amplitude *= 0.55 + 0.45 * (0.5 * (1 - Math.cos(2 * Math.PI * syllableRateHz * t)));
    }

    // Rosenberg glottal pulse: open phase 40% of the cycle, closing 16%.
    //
    // Both are sized from the *nominal* period rather than this cycle's
    // jittered one, so the pulse peak sits a constant distance after the cycle
    // boundary. If the open phase stretched with each period, the peak-to-peak
    // interval would be a blend of consecutive periods and the recording's
    // true jitter would be lower than the figure asked for here — the
    // generator would be quietly grading the analyser against the wrong
    // answer. Holding the open phase steady while the period varies is also
    // the more realistic of the two, since vocal-fold opening is governed by
    // tissue mechanics rather than by the length of the cycle it lands in.
    const nominalPeriod = fs / f0Hz;
    const openLen = Math.max(2, Math.round(nominalPeriod * 0.4));
    const closeLen = Math.max(1, Math.round(nominalPeriod * 0.16));
    for (let i = 0; i < periodSamples && cursor + i < n; i++) {
      let value: number;
      if (i < openLen) {
        value = 0.5 * (1 - Math.cos((Math.PI * i) / openLen));
      } else if (i < openLen + closeLen) {
        value = Math.cos((Math.PI * (i - openLen)) / (2 * closeLen));
      } else {
        value = 0;
      }
      out[cursor + i] = value * amplitude;
    }
    cursor += periodSamples;
  }

  for (let i = 0; i < n; i++) {
    if (isPaused(i / fs)) out[i] = 0;
  }

  // Additive noise scaled to hit the requested harmonics-to-noise ratio,
  // measured over the voiced part only so that inserting pauses does not
  // silently change the achieved HNR.
  let power = 0;
  let voicedCount = 0;
  for (let i = 0; i < n; i++) {
    if (!isPaused(i / fs)) {
      power += out[i] * out[i];
      voicedCount++;
    }
  }
  if (voicedCount > 0) {
    const signalPower = power / voicedCount;
    const noisePower = signalPower / Math.pow(10, hnrDb / 10);
    const noiseSd = Math.sqrt(noisePower);
    for (let i = 0; i < n; i++) out[i] += gauss() * noiseSd;
  }

  return out;
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
