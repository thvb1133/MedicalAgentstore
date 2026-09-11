/**
 * Each person is their own control group.
 *
 * Population norms are where consumer health tools go wrong. "Normal resting
 * heart rate is 60-100" is true of a population and close to meaningless for
 * an individual: someone whose resting rate has been 52 for years is not
 * reassured by being told they are normal, and someone at 88 who has always
 * been 64 is not warned by it. Both facts are only visible against their own
 * earlier readings.
 *
 * So a baseline here is built from the same person's history, and a reading
 * is described by how far it sits from that, in units of their own ordinary
 * variation. Median and median-absolute-deviation rather than mean and
 * standard deviation, because a handful of bad sessions should not be able to
 * move the baseline or inflate the spread.
 *
 * The other half of the honesty is the floor. A camera measures heart rate to
 * within a few beats a minute at best, so a person whose readings happen to
 * be tightly clustered must not have every subsequent reading called unusual
 * because their apparent spread was smaller than the instrument's error.
 */

import { MIN_TREND_QUALITY, buildTrend, type TrendPoint } from "./history";
import type { MeasurementReport } from "./report";

/**
 * The smallest difference each measurement can actually resolve, in its own
 * units. Anything below this is the instrument, not the person.
 *
 * Blood pressure's figure is deliberately large: the published clinical
 * evaluation of camera blood pressure reports a mean error around
 * 10 mmHg, and pretending to a tighter baseline than that would be a lie
 * about the method rather than about the person.
 */
const RESOLUTION: Record<string, number> = {
  "Heart rate": 3,
  "Breathing rate": 1.5,
  "HRV (SDNN)": 8,
  "Stress index": 8,
  "Blood pressure": 10,
  "Breath coherence": 10,
  "Fatigue score": 8,
  "Cognitive load": 10,
};

const DEFAULT_RESOLUTION = 5;

/** Enough readings that a median means something. */
const MIN_BASELINE_POINTS = 5;
/** Spread over at least this many separate days, so one sitting is not a baseline. */
const MIN_BASELINE_DAYS = 3;

export type DriftVerdict = "insufficient" | "in-range" | "drifting" | "unusual";

export interface PersonalBaseline {
  /** Robust centre of the earlier readings. */
  centre: number;
  /** Robust spread, already floored at the instrument's resolution. */
  spread: number;
  /** Whether the spread came from the person or from the floor. */
  spreadIsFloor: boolean;
  points: number;
  days: number;
}

export interface Drift {
  label: string;
  unit: string;
  baseline: PersonalBaseline | null;
  latest: TrendPoint | null;
  /** Signed difference from the baseline, in the metric's own units. */
  delta: number | null;
  /** The same, in units of this person's ordinary variation. */
  z: number | null;
  verdict: DriftVerdict;
  note: string;
}

/** Milliseconds in a day, spelled out once. */
const DAY = 86_400_000;

/**
 * Compare the most recent reading of one metric against everything before it.
 *
 * The latest reading is deliberately excluded from its own baseline. Included,
 * it drags the centre towards itself and shrinks the deviation it is being
 * judged by, which is precisely backwards.
 */
export function buildDrift(
  reports: MeasurementReport[],
  label: string,
  now: number = Date.now(),
): Drift {
  const trend = buildTrend(reports, label, 1);
  const unit = trend?.unit ?? "";
  if (!trend || trend.points.length === 0) {
    return blank(label, unit, "No readings of this yet.");
  }

  const points = [...trend.points].sort(
    (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime(),
  );
  const latest = points[points.length - 1];
  const earlier = points.slice(0, -1);

  const days = distinctDays(earlier);
  if (earlier.length < MIN_BASELINE_POINTS || days < MIN_BASELINE_DAYS) {
    return {
      label,
      unit,
      baseline: null,
      latest,
      delta: null,
      z: null,
      verdict: "insufficient",
      note: `${MIN_BASELINE_POINTS - earlier.length > 0 ? `${MIN_BASELINE_POINTS - earlier.length} more reading${MIN_BASELINE_POINTS - earlier.length === 1 ? "" : "s"}` : `readings on ${MIN_BASELINE_DAYS - days} more day${MIN_BASELINE_DAYS - days === 1 ? "" : "s"}`} and this becomes your own baseline.`,
    };
  }

  const values = earlier.map((p) => p.value);
  const centre = median(values);
  const observed = medianAbsoluteDeviation(values, centre);
  const floor = RESOLUTION[label] ?? DEFAULT_RESOLUTION;
  const spread = Math.max(observed, floor);

  const delta = latest.value - centre;
  const z = delta / spread;
  const magnitude = Math.abs(z);
  const verdict: DriftVerdict =
    magnitude < 1.5 ? "in-range" : magnitude < 2.5 ? "drifting" : "unusual";

  const ageDays = Math.max(
    0,
    Math.round((now - new Date(earlier[0].takenAt).getTime()) / DAY),
  );

  return {
    label,
    unit,
    baseline: {
      centre,
      spread,
      spreadIsFloor: observed < floor,
      points: earlier.length,
      days,
    },
    latest,
    delta,
    z,
    verdict,
    note: noteFor(label, unit, delta, verdict, centre, ageDays, observed < floor),
  };
}

function noteFor(
  label: string,
  unit: string,
  delta: number,
  verdict: DriftVerdict,
  centre: number,
  ageDays: number,
  floored: boolean,
): string {
  const direction = delta > 0 ? "higher" : "lower";
  const size = `${Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}${unit ? ` ${unit}` : ""}`;
  const usual = `Your usual is around ${centre.toFixed(Math.abs(centre) < 10 ? 1 : 0)}${unit ? ` ${unit}` : ""}, over ${ageDays === 0 ? "today" : `the last ${ageDays} day${ageDays === 1 ? "" : "s"}`}.`;

  if (verdict === "in-range") {
    return `${usual} This reading sits within your ordinary range.`;
  }

  const caveat = floored
    ? " Your readings are usually tightly clustered, so this is judged against the instrument's own error rather than a smaller spread."
    : "";

  if (verdict === "drifting") {
    return `${usual} This one is ${size} ${direction} — a drift worth noticing, not worth acting on alone.${caveat}`;
  }
  return `${usual} This one is ${size} ${direction}, well outside your usual range. Repeat the measurement in good light before reading anything into it; if it holds, it is worth mentioning to a clinician.${caveat}`;
}

function blank(label: string, unit: string, note: string): Drift {
  return {
    label,
    unit,
    baseline: null,
    latest: null,
    delta: null,
    z: null,
    verdict: "insufficient",
    note,
  };
}

/** Every metric that has any readings at all, most deviant first. */
export function buildDrifts(
  reports: MeasurementReport[],
  labels: readonly string[],
  now: number = Date.now(),
): Drift[] {
  return labels
    .map((label) => buildDrift(reports, label, now))
    .filter((d) => d.latest !== null)
    .sort((a, b) => Math.abs(b.z ?? -1) - Math.abs(a.z ?? -1));
}

/**
 * Readings good enough to be part of a baseline.
 *
 * Same quality bar as the trend lines use, applied here as well because a
 * baseline assembled from unusable sessions is worse than no baseline: it
 * looks authoritative and is noise.
 */
export function usableReports(reports: MeasurementReport[]): MeasurementReport[] {
  return reports.filter((r) => r.quality >= MIN_TREND_QUALITY);
}

function distinctDays(points: TrendPoint[]): number {
  return new Set(points.map((p) => p.takenAt.slice(0, 10))).size;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * MAD scaled by 1.4826 so it is comparable with a standard deviation for
 * normally distributed data, which is what makes the "how many of your own
 * deviations" phrasing meaningful.
 */
function medianAbsoluteDeviation(values: number[], centre: number): number {
  return median(values.map((v) => Math.abs(v - centre))) * 1.4826;
}
