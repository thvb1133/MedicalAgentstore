/**
 * Alertness, blink behaviour and gaze.
 *
 * The headline measure is PERCLOS — the proportion of time the eyes are more
 * than 80% closed — which is the measure drowsiness research settled on
 * because it tracks lapses in attention far better than blink rate does. A
 * tired person does not necessarily blink more often; they blink for longer.
 *
 * Everything is expressed relative to a personal baseline captured in the
 * first few seconds, because absolute eye aspect ratio varies enormously
 * between faces and between people wearing glasses and not.
 */

import { mean, median, stdDev } from "../signal/filters";

export interface AlertnessFrame {
  timestampMs: number;
  /** Mean eye aspect ratio across both eyes, or null when no face. */
  ear: number | null;
  /** Mouth aspect ratio, for yawns. */
  mar: number | null;
  /** Head pitch, positive downwards. */
  pitch: number | null;
  /** Horizontal gaze, -1 to 1, 0 is centred. */
  gaze: number | null;
}

export interface BlinkEvent {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export type AlertnessLevel = "alert" | "mild" | "drowsy" | "severe" | "unknown";

export interface AlertnessResult {
  /** Proportion of the window with eyes substantially closed, 0-1. */
  perclos: number | null;
  blinkRatePerMin: number | null;
  medianBlinkMs: number | null;
  /** Long closures are the strongest single warning sign. */
  longestClosureMs: number | null;
  yawnCount: number;
  /** Slow head pitch oscillation, the nodding signature. */
  noddingIndex: number | null;
  /** Fraction of the window spent looking away from the screen centre. */
  gazeAwayFraction: number | null;
  /** 0-100, higher means more fatigued. */
  fatigueScore: number | null;
  level: AlertnessLevel;
  /** Plain-language reason for the current level. */
  driver: string | null;
  baselineReady: boolean;
  windowSeconds: number;
}

export interface BaselineState {
  /** Open-eye EAR for this person, from the calibration period. */
  openEar: number;
  samples: number;
  ready: boolean;
}

const BASELINE_SECONDS = 4;
/** Eyes counted as closed below this fraction of the personal open EAR. */
const CLOSED_FRACTION = 0.62;
/** Below this fraction, treated as a full closure for PERCLOS-80. */
const PERCLOS_FRACTION = 0.2;
const YAWN_MAR = 0.55;
const YAWN_MIN_MS = 1200;
const GAZE_AWAY = 0.32;

export class AlertnessTracker {
  private frames: AlertnessFrame[] = [];
  private blinks: BlinkEvent[] = [];
  private closureStart: number | null = null;
  private yawnStart: number | null = null;
  private yawns = 0;
  private baseline: BaselineState = { openEar: 0, samples: 0, ready: false };
  private baselineSum = 0;
  private firstTimestamp: number | null = null;
  private readonly windowSeconds: number;

  constructor(windowSeconds = 60) {
    this.windowSeconds = windowSeconds;
  }

  reset(): void {
    this.frames = [];
    this.blinks = [];
    this.closureStart = null;
    this.yawnStart = null;
    this.yawns = 0;
    this.baseline = { openEar: 0, samples: 0, ready: false };
    this.baselineSum = 0;
    this.firstTimestamp = null;
  }

  get baselineState(): BaselineState {
    return this.baseline;
  }

  push(frame: AlertnessFrame): void {
    if (this.firstTimestamp === null) this.firstTimestamp = frame.timestampMs;

    this.frames.push(frame);
    const cutoff = frame.timestampMs - this.windowSeconds * 1000;
    let drop = 0;
    while (drop < this.frames.length && this.frames[drop].timestampMs < cutoff) drop++;
    if (drop > 0) this.frames.splice(0, drop);
    this.blinks = this.blinks.filter((b) => b.endMs >= cutoff);

    if (frame.ear === null) {
      // Losing the face mid-closure would otherwise be recorded as one
      // enormous blink, so an interrupted closure is discarded.
      this.closureStart = null;
      this.yawnStart = null;
      return;
    }

    // Personal baseline: the mean EAR over the first few seconds, which the
    // user is asked to spend with their eyes open and looking at the screen.
    const elapsed = (frame.timestampMs - this.firstTimestamp) / 1000;
    if (!this.baseline.ready) {
      if (elapsed <= BASELINE_SECONDS) {
        this.baselineSum += frame.ear;
        this.baseline.samples++;
        this.baseline.openEar = this.baselineSum / this.baseline.samples;
        return;
      }
      // Require enough samples that a couple of blinks cannot skew it.
      this.baseline.ready = this.baseline.samples >= 20 && this.baseline.openEar > 0.05;
      if (!this.baseline.ready) {
        this.baselineSum += frame.ear;
        this.baseline.samples++;
        this.baseline.openEar = this.baselineSum / this.baseline.samples;
        return;
      }
    }

    const closedThreshold = this.baseline.openEar * CLOSED_FRACTION;
    if (frame.ear < closedThreshold) {
      if (this.closureStart === null) this.closureStart = frame.timestampMs;
    } else if (this.closureStart !== null) {
      const durationMs = frame.timestampMs - this.closureStart;
      // Anything under 60 ms is landmark noise, not a blink.
      if (durationMs >= 60) {
        this.blinks.push({
          startMs: this.closureStart,
          endMs: frame.timestampMs,
          durationMs,
        });
      }
      this.closureStart = null;
    }

    if (frame.mar !== null) {
      if (frame.mar > YAWN_MAR) {
        if (this.yawnStart === null) this.yawnStart = frame.timestampMs;
        else if (frame.timestampMs - this.yawnStart > YAWN_MIN_MS) {
          this.yawns++;
          // Reset far enough forward that one long yawn is not counted twice.
          this.yawnStart = frame.timestampMs + 3000;
        }
      } else {
        this.yawnStart = null;
      }
    }
  }

  analyse(): AlertnessResult {
    const n = this.frames.length;
    const spanS =
      n < 2
        ? 0
        : (this.frames[n - 1].timestampMs - this.frames[0].timestampMs) / 1000;

    const base: AlertnessResult = {
      perclos: null,
      blinkRatePerMin: null,
      medianBlinkMs: null,
      longestClosureMs: null,
      yawnCount: this.yawns,
      noddingIndex: null,
      gazeAwayFraction: null,
      fatigueScore: null,
      level: "unknown",
      driver: null,
      baselineReady: this.baseline.ready,
      windowSeconds: spanS,
    };

    if (!this.baseline.ready) {
      return { ...base, driver: "Calibrating your open-eye baseline — look at the screen" };
    }
    if (spanS < 8) {
      return { ...base, driver: "Collecting data" };
    }

    const withFace = this.frames.filter((f) => f.ear !== null);
    if (withFace.length < 10) {
      return { ...base, driver: "Face not visible often enough" };
    }

    const perclosThreshold = this.baseline.openEar * PERCLOS_FRACTION;
    const closedFrames = withFace.filter((f) => (f.ear as number) < perclosThreshold);
    const perclos = closedFrames.length / withFace.length;

    const blinkRatePerMin = (this.blinks.length / spanS) * 60;
    const durations = this.blinks.map((b) => b.durationMs);
    const medianBlinkMs = durations.length > 0 ? median(durations) : null;
    const longestClosureMs = durations.length > 0 ? Math.max(...durations) : null;

    // Nodding: slow, large excursions in head pitch. Standard deviation alone
    // would count a single deliberate head turn, so it is scaled by how much
    // of the movement is slow, which is what separates a nod from a glance.
    const pitches = this.frames
      .map((f) => f.pitch)
      .filter((p): p is number => p !== null);
    let noddingIndex: number | null = null;
    if (pitches.length > 20) {
      const overall = stdDev(pitches);
      const smoothed = movingMean(pitches, Math.max(3, Math.round(pitches.length / 12)));
      const slow = stdDev(smoothed);
      noddingIndex = overall === 0 ? 0 : Math.min(1, (slow / overall) * slow * 12);
    }

    const gazes = this.frames.map((f) => f.gaze).filter((g): g is number => g !== null);
    const gazeAwayFraction =
      gazes.length > 10
        ? gazes.filter((g) => Math.abs(g) > GAZE_AWAY).length / gazes.length
        : null;

    // Weighted sum of the evidence. PERCLOS dominates because it is the
    // best-validated of these; a single very long closure is treated as
    // strong evidence on its own because microsleeps matter more than averages.
    const perclosTerm = Math.min(1, perclos / 0.25) * 42;
    const closureTerm = longestClosureMs ? Math.min(1, longestClosureMs / 1500) * 24 : 0;
    const blinkTerm =
      medianBlinkMs !== null ? Math.min(1, Math.max(0, (medianBlinkMs - 180) / 320)) * 14 : 0;
    const noddingTerm = noddingIndex !== null ? noddingIndex * 12 : 0;
    const yawnTerm = Math.min(1, this.yawns / 3) * 8;

    const fatigueScore = Math.round(
      Math.min(100, perclosTerm + closureTerm + blinkTerm + noddingTerm + yawnTerm),
    );

    const level: AlertnessLevel =
      fatigueScore >= 70
        ? "severe"
        : fatigueScore >= 45
          ? "drowsy"
          : fatigueScore >= 25
            ? "mild"
            : "alert";

    const drivers: Array<[number, string]> = (
      [
        [perclosTerm, `Eyes closed ${(perclos * 100).toFixed(0)}% of the time`],
        [
          closureTerm,
          longestClosureMs
            ? `Longest closure ${(longestClosureMs / 1000).toFixed(1)}s`
            : "",
        ],
        [blinkTerm, medianBlinkMs ? `Blinks lasting ${medianBlinkMs.toFixed(0)}ms` : ""],
        [noddingTerm, "Head nodding detected"],
        [yawnTerm, `${this.yawns} yawn${this.yawns === 1 ? "" : "s"}`],
      ] as Array<[number, string]>
    ).filter(([, label]) => label !== "");
    drivers.sort((a, b) => b[0] - a[0]);

    return {
      perclos,
      blinkRatePerMin,
      medianBlinkMs,
      longestClosureMs,
      yawnCount: this.yawns,
      noddingIndex,
      gazeAwayFraction,
      fatigueScore,
      level,
      driver:
        level === "alert"
          ? "No fatigue signs detected"
          : (drivers[0]?.[1] ?? null),
      baselineReady: true,
      windowSeconds: spanS,
    };
  }
}

function movingMean(x: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < x.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(x.length, i + window + 1);
    out.push(mean(x.slice(lo, hi)));
  }
  return out;
}
