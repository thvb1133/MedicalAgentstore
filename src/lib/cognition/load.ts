/**
 * Cognitive load from the eyes.
 *
 * Three ocular signs move together when someone is working hard mentally, and
 * they have been used this way in aviation and human-factors research for
 * decades:
 *
 *   Pupil dilation. The task-evoked pupillary response, Kahneman & Beatty
 *   (1966). Effort dilates the pupil by a few percent, on top of a light
 *   reflex that is an order of magnitude larger — which is the whole problem.
 *
 *   Blink inhibition. Spontaneous blinking is suppressed while attention is
 *   engaged, and the deferred blinks arrive in a burst afterwards.
 *
 *   Gaze narrowing. Under load the scan pattern tightens onto fewer places
 *   and saccades become less frequent: attentional tunnelling.
 *
 * All three are *relative* measures. There is no absolute pupil size that
 * means "working hard", so everything here is expressed against a baseline
 * captured from the same person, in the same light, moments earlier. Any
 * channel whose baseline is not trustworthy is dropped from the score and
 * said to be dropped, rather than being quietly defaulted to neutral.
 *
 * This is an interface and attention measure. It is not a measure of
 * intelligence, honesty, emotion or fitness to do anything, and it must never
 * be presented as one.
 */

import { mean, median, stdDev } from "../signal/filters";

export interface LoadFrame {
  timestampMs: number;
  /** Pupil diameter as a fraction of iris diameter, or null when unreadable. */
  pupilRatio: number | null;
  /** How separable the pupil was from the iris, 0-1. */
  pupilContrast: number;
  /** Horizontal gaze, -1 to 1, 0 centred. */
  gazeX: number | null;
  /** Scene brightness on the face, 0-255. The pupil's main confounder. */
  luma: number | null;
}

export type LoadBand = "light" | "moderate" | "heavy" | "unknown";

export interface LoadChannel {
  /** 0-1 contribution towards "loaded", or null when the channel is unusable. */
  value: number | null;
  /** What the channel actually measured, for display. */
  detail: string;
  /** Why it is unusable, when it is. */
  withheld: string | null;
}

export interface CognitiveLoad {
  /** 0-100, or null when nothing usable was measured. */
  index: number | null;
  band: LoadBand;
  pupil: LoadChannel;
  blink: LoadChannel;
  scan: LoadChannel;
  /**
   * How much of the intended evidence is actually present, 0-1.
   *
   * This is the summed weight of the channels that survived, so a score
   * resting on gaze alone announces itself as a quarter-strength score
   * instead of looking identical to one with all three.
   */
  confidence: number;
  /** The channel doing the most work, in plain language. */
  driver: string | null;
  baselineReady: boolean;
  windowSeconds: number;
}

export interface LoadBaseline {
  pupilRatio: number | null;
  luma: number | null;
  blinkRatePerMin: number | null;
  gazeSpread: number | null;
  saccadeRatePerS: number | null;
  seconds: number;
  ready: boolean;
}

/** Quiet period at the start used to learn this person, in this light. */
const BASELINE_SECONDS = 10;
/** A rolling window long enough that a blink rate means something. */
const WINDOW_SECONDS = 30;
/** Below this the pupil boundary was not really found. */
const MIN_CONTRAST = 0.1;
/** Beyond this much change in face brightness, the light reflex dominates. */
const MAX_LUMA_DRIFT = 0.12;
/** A gaze step this large counts as a saccade rather than fixational drift. */
const SACCADE_STEP = 0.08;

/**
 * How far each channel has to move to count as fully loaded.
 *
 * These are deliberately generous. A 12% pupil dilation is at the top of what
 * effort produces, halving the blink rate is a large effect, and a 40%
 * narrowing of the scan is obvious to the eye. Setting them where a real
 * effect saturates keeps ordinary fidgeting near the bottom of the scale.
 */
const FULL_DILATION = 0.12;
const FULL_BLINK_INHIBITION = 0.5;
const FULL_NARROWING = 0.4;

const WEIGHTS = { pupil: 0.45, blink: 0.3, scan: 0.25 } as const;

interface GazePoint {
  t: number;
  x: number;
}

export class CognitiveLoadTracker {
  private frames: LoadFrame[] = [];
  private firstTimestamp: number | null = null;
  private baseline: LoadBaseline = emptyBaseline();

  reset(): void {
    this.frames = [];
    this.firstTimestamp = null;
    this.baseline = emptyBaseline();
  }

  get baselineState(): LoadBaseline {
    return this.baseline;
  }

  push(frame: LoadFrame): void {
    if (this.firstTimestamp === null) this.firstTimestamp = frame.timestampMs;
    this.frames.push(frame);
    const cutoff = frame.timestampMs - WINDOW_SECONDS * 1000;
    // The baseline slice has to survive the trim, or the comparison it exists
    // for disappears the moment the window fills.
    const keepFrom = this.baselineEndMs;
    let drop = 0;
    while (
      drop < this.frames.length &&
      this.frames[drop].timestampMs < cutoff &&
      this.frames[drop].timestampMs > keepFrom
    ) {
      drop++;
    }
    if (drop > 0) this.frames.splice(0, drop);
  }

  private get baselineEndMs(): number {
    return (this.firstTimestamp ?? 0) + BASELINE_SECONDS * 1000;
  }

  /**
   * Score the current window.
   *
   * Blink times come from the alertness tracker rather than being detected
   * again here: there is one blink detector in the app, it is already
   * calibrated to this person's open-eye baseline, and a second one working
   * off the same landmarks would only find slightly different blinks.
   */
  analyse(blinkEndTimesMs: number[]): CognitiveLoad {
    const now = this.frames.length > 0 ? this.frames[this.frames.length - 1].timestampMs : 0;
    const first = this.firstTimestamp ?? now;
    const elapsed = (now - first) / 1000;
    const baselineEnd = this.baselineEndMs;

    const baselineFrames = this.frames.filter((f) => f.timestampMs <= baselineEnd);
    const recentFrames = this.frames.filter((f) => f.timestampMs > baselineEnd);

    if (elapsed < BASELINE_SECONDS || baselineFrames.length < 30) {
      this.baseline = { ...emptyBaseline(), seconds: Math.min(elapsed, BASELINE_SECONDS) };
      return {
        ...blank(elapsed),
        driver: "Learning your resting eyes — look at the screen and relax",
      };
    }

    this.baseline = buildBaseline(
      baselineFrames,
      blinkEndTimesMs.filter((t) => t <= baselineEnd),
      Math.max(1, (baselineEnd - first) / 1000),
    );

    const recentSeconds = recentFrames.length > 0
      ? (now - recentFrames[0].timestampMs) / 1000
      : 0;
    if (recentSeconds < 8 || recentFrames.length < 20) {
      return { ...blank(elapsed), baselineReady: true, driver: "Collecting data" };
    }

    const pupil = pupilChannel(recentFrames, this.baseline);
    const blink = blinkChannel(
      blinkEndTimesMs.filter((t) => t > baselineEnd),
      recentSeconds,
      this.baseline,
    );
    const scan = scanChannel(recentFrames, recentSeconds, this.baseline);

    const parts: Array<[number, LoadChannel, string]> = [
      [WEIGHTS.pupil, pupil, "Pupils wider than your resting size"],
      [WEIGHTS.blink, blink, "Blinking less than your resting rate"],
      [WEIGHTS.scan, scan, "Gaze settled onto a narrower area"],
    ];
    const usable = parts.filter(([, c]) => c.value !== null);
    const confidence = usable.reduce((s, [w]) => s + w, 0);

    if (usable.length === 0) {
      return {
        index: null,
        band: "unknown",
        pupil,
        blink,
        scan,
        confidence: 0,
        driver: pupil.withheld ?? blink.withheld ?? scan.withheld,
        baselineReady: true,
        windowSeconds: elapsed,
      };
    }

    const index = Math.round(
      (usable.reduce((s, [w, c]) => s + w * (c.value as number), 0) / confidence) * 100,
    );

    const ranked = [...usable].sort(
      (a, b) => (b[0] * (b[1].value as number)) - (a[0] * (a[1].value as number)),
    );
    const top = ranked[0];

    return {
      index,
      band: index >= 60 ? "heavy" : index >= 30 ? "moderate" : "light",
      pupil,
      blink,
      scan,
      confidence,
      driver: (top[1].value as number) < 0.15 ? "Your eyes look much as they did at rest" : top[2],
      baselineReady: true,
      windowSeconds: elapsed,
    };
  }
}

function pupilChannel(frames: LoadFrame[], baseline: LoadBaseline): LoadChannel {
  const usable = frames.filter(
    (f) => f.pupilRatio !== null && f.pupilContrast >= MIN_CONTRAST,
  );
  if (baseline.pupilRatio === null) {
    return {
      value: null,
      detail: "—",
      withheld: "Pupil edge not separable — often the case with dark irises or dim light",
    };
  }
  if (usable.length < 15) {
    return { value: null, detail: "—", withheld: "Pupil not readable in this light" };
  }

  const lumas = frames.map((f) => f.luma).filter((l): l is number => l !== null);
  if (baseline.luma !== null && lumas.length > 0) {
    const drift = Math.abs(median(lumas) - baseline.luma) / Math.max(1, baseline.luma);
    if (drift > MAX_LUMA_DRIFT) {
      return {
        value: null,
        detail: `${(drift * 100).toFixed(0)}% brightness change`,
        // Worth stating plainly: the light reflex is perhaps ten times the
        // size of the effort response, so once the light moves there is
        // nothing left to read.
        withheld: "The light on your face changed, which moves the pupil far more than thinking does",
      };
    }
  }

  const nowRatio = median(usable.map((f) => f.pupilRatio as number));
  const change = (nowRatio - baseline.pupilRatio) / baseline.pupilRatio;
  return {
    value: clamp01(change / FULL_DILATION),
    detail: `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}% vs rest`,
    withheld: null,
  };
}

function blinkChannel(
  blinkTimes: number[],
  seconds: number,
  baseline: LoadBaseline,
): LoadChannel {
  if (baseline.blinkRatePerMin === null || baseline.blinkRatePerMin < 4) {
    return {
      value: null,
      detail: "—",
      withheld: "Too few blinks at rest to compare against",
    };
  }
  const rate = (blinkTimes.length / seconds) * 60;
  const inhibition = 1 - rate / baseline.blinkRatePerMin;
  return {
    value: clamp01(inhibition / FULL_BLINK_INHIBITION),
    detail: `${rate.toFixed(0)}/min vs ${baseline.blinkRatePerMin.toFixed(0)} at rest`,
    withheld: null,
  };
}

function scanChannel(
  frames: LoadFrame[],
  seconds: number,
  baseline: LoadBaseline,
): LoadChannel {
  const gaze = gazePoints(frames);
  if (gaze.length < 20 || baseline.gazeSpread === null || baseline.saccadeRatePerS === null) {
    return { value: null, detail: "—", withheld: "Not enough gaze samples" };
  }
  if (baseline.gazeSpread < 0.01) {
    return {
      value: null,
      detail: "—",
      withheld: "Your gaze barely moved at rest, so narrowing cannot be measured",
    };
  }

  const spread = stdDev(gaze.map((p) => p.x));
  const saccades = countSaccades(gaze) / seconds;

  const narrowing = 1 - spread / baseline.gazeSpread;
  const slowing =
    baseline.saccadeRatePerS > 0.05 ? 1 - saccades / baseline.saccadeRatePerS : narrowing;

  return {
    value: clamp01(((narrowing + slowing) / 2) / FULL_NARROWING),
    detail: `${(narrowing * 100).toFixed(0)}% narrower scan`,
    withheld: null,
  };
}

function buildBaseline(
  frames: LoadFrame[],
  blinkTimes: number[],
  seconds: number,
): LoadBaseline {
  const pupils = frames
    .filter((f) => f.pupilRatio !== null && f.pupilContrast >= MIN_CONTRAST)
    .map((f) => f.pupilRatio as number);
  const lumas = frames.map((f) => f.luma).filter((l): l is number => l !== null);
  const gaze = gazePoints(frames);

  return {
    // A baseline needs to be stable, not merely present: a handful of
    // successful pupil reads out of three hundred frames is a lucky flicker,
    // not a resting size.
    pupilRatio: pupils.length >= 40 ? median(pupils) : null,
    luma: lumas.length > 0 ? median(lumas) : null,
    blinkRatePerMin: (blinkTimes.length / seconds) * 60,
    gazeSpread: gaze.length >= 30 ? stdDev(gaze.map((p) => p.x)) : null,
    saccadeRatePerS: gaze.length >= 30 ? countSaccades(gaze) / seconds : null,
    seconds,
    ready: true,
  };
}

function gazePoints(frames: LoadFrame[]): GazePoint[] {
  return frames
    .filter((f) => f.gazeX !== null)
    .map((f) => ({ t: f.timestampMs, x: f.gazeX as number }));
}

/**
 * Count gaze steps large enough to be saccades.
 *
 * Consecutive frames above the step threshold belong to one movement, so a
 * saccade spanning three frames is counted once rather than three times.
 */
function countSaccades(gaze: GazePoint[]): number {
  let count = 0;
  let moving = false;
  for (let i = 1; i < gaze.length; i++) {
    const step = Math.abs(gaze[i].x - gaze[i - 1].x);
    if (step > SACCADE_STEP) {
      if (!moving) count++;
      moving = true;
    } else {
      moving = false;
    }
  }
  return count;
}

function emptyBaseline(): LoadBaseline {
  return {
    pupilRatio: null,
    luma: null,
    blinkRatePerMin: null,
    gazeSpread: null,
    saccadeRatePerS: null,
    seconds: 0,
    ready: false,
  };
}

function blank(windowSeconds: number): CognitiveLoad {
  const empty: LoadChannel = { value: null, detail: "—", withheld: null };
  return {
    index: null,
    band: "unknown",
    pupil: { ...empty },
    blink: { ...empty },
    scan: { ...empty },
    confidence: 0,
    driver: null,
    baselineReady: false,
    windowSeconds,
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Mean pupil ratio, for callers that want the raw figure on screen. */
export function averagePupil(frames: LoadFrame[]): number | null {
  const usable = frames
    .filter((f) => f.pupilRatio !== null && f.pupilContrast >= MIN_CONTRAST)
    .map((f) => f.pupilRatio as number);
  return usable.length > 0 ? mean(usable) : null;
}
