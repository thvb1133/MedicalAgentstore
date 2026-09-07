/**
 * Beat detection and heart-rate variability.
 *
 * Heart rate itself is read off the spectrum, which is robust. HRV cannot be:
 * it is defined by the spacing between individual beats, so we have to find
 * them in the time domain and then be quite aggressive about discarding
 * intervals that are physiologically implausible. An undetected or doubled
 * beat produces an interval error of 100%, which would dominate SDNN.
 */

import { median } from "./filters";

export interface Beat {
  /** Sample index of the peak. */
  index: number;
  /** Time of the peak in seconds from the start of the record. */
  timeS: number;
}

export interface HrvResult {
  /** Standard deviation of normal-to-normal intervals, in ms. */
  sdnn: number | null;
  /** Root mean square of successive differences, in ms. */
  rmssd: number | null;
  /** Mean inter-beat interval, in ms. */
  meanIbi: number | null;
  /** Heart rate implied by the beat intervals, in BPM. */
  beatRateBpm: number | null;
  /** Intervals that survived filtering. */
  acceptedIntervals: number[];
  /** How many candidate intervals were rejected as implausible. */
  rejectedCount: number;
}

/**
 * Find systolic peaks using an adaptive threshold and a refractory period.
 *
 * `expectedBpm` comes from the spectral estimate and sets the refractory
 * window, so the two stages reinforce each other rather than failing
 * independently.
 */
export function findBeats(
  signal: ArrayLike<number>,
  fs: number,
  expectedBpm: number | null,
): Beat[] {
  const n = signal.length;
  if (n < fs) return [];

  const bpm = expectedBpm && expectedBpm > 30 ? expectedBpm : 72;
  const expectedPeriod = (60 / bpm) * fs;
  // Refuse a second beat within 55% of the expected period.
  const refractory = Math.max(2, Math.round(expectedPeriod * 0.55));

  // Adaptive threshold from a rolling window rather than a global constant,
  // so a slow amplitude drift does not silently drop half the beats.
  const windowLen = Math.max(Math.round(fs * 2), 8);
  const beats: Beat[] = [];
  let lastIndex = -Infinity;

  for (let i = 1; i < n - 1; i++) {
    if (signal[i] <= signal[i - 1] || signal[i] < signal[i + 1]) continue;

    const lo = Math.max(0, i - windowLen);
    const hi = Math.min(n, i + windowLen);
    let localMax = -Infinity;
    let localSum = 0;
    for (let j = lo; j < hi; j++) {
      if (signal[j] > localMax) localMax = signal[j];
      localSum += signal[j];
    }
    const localMean = localSum / (hi - lo);
    const threshold = localMean + 0.35 * (localMax - localMean);
    if (signal[i] < threshold) continue;

    if (i - lastIndex < refractory) {
      // Keep whichever of the two competing peaks is taller.
      const prev = beats[beats.length - 1];
      if (prev && signal[i] > signal[prev.index]) {
        beats[beats.length - 1] = { index: i, timeS: i / fs };
        lastIndex = i;
      }
      continue;
    }

    beats.push({ index: i, timeS: i / fs });
    lastIndex = i;
  }

  return beats;
}

/**
 * HRV from a beat train, with the artefact rejection that makes the numbers
 * meaningful. Intervals more than 25% away from the running median are
 * treated as a missed or spurious detection and dropped, which is the
 * standard approach for consumer-grade PPG.
 */
export function computeHrv(beats: Beat[]): HrvResult {
  const empty: HrvResult = {
    sdnn: null,
    rmssd: null,
    meanIbi: null,
    beatRateBpm: null,
    acceptedIntervals: [],
    rejectedCount: 0,
  };
  if (beats.length < 4) return empty;

  const raw: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    raw.push((beats[i].timeS - beats[i - 1].timeS) * 1000);
  }

  const med = median(raw);
  if (med <= 0) return empty;

  const accepted: number[] = [];
  let rejected = 0;
  for (const ibi of raw) {
    const withinPhysiology = ibi >= 300 && ibi <= 1800;
    const nearMedian = Math.abs(ibi - med) / med <= 0.25;
    if (withinPhysiology && nearMedian) accepted.push(ibi);
    else rejected++;
  }

  if (accepted.length < 3) return { ...empty, rejectedCount: rejected };

  const m = accepted.reduce((a, b) => a + b, 0) / accepted.length;
  const variance =
    accepted.reduce((a, b) => a + (b - m) ** 2, 0) / (accepted.length - 1);
  const sdnn = Math.sqrt(variance);

  let sumSq = 0;
  let pairs = 0;
  for (let i = 1; i < accepted.length; i++) {
    sumSq += (accepted[i] - accepted[i - 1]) ** 2;
    pairs++;
  }
  const rmssd = pairs > 0 ? Math.sqrt(sumSq / pairs) : null;

  return {
    sdnn,
    rmssd,
    meanIbi: m,
    beatRateBpm: 60000 / m,
    acceptedIntervals: accepted,
    rejectedCount: rejected,
  };
}

/**
 * Stress index from HRV.
 *
 * Lower variability means higher sympathetic tone, so this maps SDNN onto a
 * 0-100 scale using a log curve anchored at values typical of resting adults
 * (roughly 20 ms at the stressed end, 100 ms at the relaxed end). It is an
 * arousal indicator, not a clinical measure, and the UI says so.
 */
export function stressFromSdnn(sdnn: number | null): number | null {
  if (sdnn === null || sdnn <= 0) return null;
  const lo = Math.log(20);
  const hi = Math.log(100);
  const t = (Math.log(Math.min(Math.max(sdnn, 5), 200)) - lo) / (hi - lo);
  return Math.round(100 * (1 - Math.min(Math.max(t, 0), 1)));
}
