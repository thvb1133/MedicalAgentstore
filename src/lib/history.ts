/**
 * Measurement history and trend.
 *
 * A single webcam heart rate is a curiosity. The same measurement every day
 * for a month, compared against the person's own earlier readings, is the
 * thing that could actually be useful — and it is useful precisely because it
 * is self-referential. Comparing someone to a population norm from a camera
 * is where this technology gets people into trouble; comparing them to
 * themselves last Tuesday does not.
 *
 * History is kept in the browser first and synced to S3 only when a bucket is
 * configured, so the feature works with no cloud account at all. Both stores
 * hold nothing but the derived numbers.
 */

import type { MeasurementReport } from "./report";

const STORAGE_KEY = "sanjivani-setu.history.v1";

/** Enough for a couple of months of daily use before anything is dropped. */
const MAX_LOCAL = 100;

/**
 * Readings below this contributed nothing but noise, and including them in a
 * trend line makes the trend meaningless. They are still stored — a record of
 * a failed measurement is legitimate — but every trend filters them out.
 */
export const MIN_TREND_QUALITY = 0.5;

export interface TrendPoint {
  takenAt: string;
  value: number;
  quality: number;
}

export interface Trend {
  label: string;
  unit: string;
  points: TrendPoint[];
  first: number;
  latest: number;
  /** Mean of every included point. */
  average: number;
  min: number;
  max: number;
  /** Change from first to latest, in the metric's own units. */
  change: number;
  direction: "up" | "down" | "flat";
}

function isReport(value: unknown): value is MeasurementReport {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Partial<MeasurementReport>;
  return (
    typeof r.agentSlug === "string" &&
    typeof r.takenAt === "string" &&
    Array.isArray(r.metrics)
  );
}

export function parseReports(raw: unknown): MeasurementReport[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isReport);
}

export function loadLocalReports(): MeasurementReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseReports(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveLocalReports(reports: MeasurementReport[]): MeasurementReport[] {
  const trimmed = sortNewestFirst(reports).slice(0, MAX_LOCAL);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Storage full or unavailable; history simply will not persist.
    }
  }
  return trimmed;
}

export function addLocalReport(report: MeasurementReport): MeasurementReport[] {
  return saveLocalReports(mergeReports(loadLocalReports(), [report]));
}

export function sortNewestFirst(reports: MeasurementReport[]): MeasurementReport[] {
  return [...reports].sort(
    (a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime(),
  );
}

/**
 * Combine local and remote history.
 *
 * The same measurement can exist in both stores, so identity is the agent plus
 * the exact timestamp. Using the timestamp alone would collapse two different
 * agents measured in the same second, which happens whenever someone runs two
 * checks back to back.
 */
export function mergeReports(
  a: MeasurementReport[],
  b: MeasurementReport[],
): MeasurementReport[] {
  const byKey = new Map<string, MeasurementReport>();
  for (const report of [...a, ...b]) {
    byKey.set(`${report.agentSlug}|${report.takenAt}`, report);
  }
  return sortNewestFirst([...byKey.values()]);
}

function numericValue(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // Blood pressure arrives as "118/76"; the systolic is the number to trend.
    const first = Number.parseFloat(value);
    if (Number.isFinite(first)) return first;
  }
  return null;
}

/**
 * Build a trend for one metric across a set of reports.
 *
 * Returns null rather than a one-point line when there is nothing to compare,
 * because a "trend" drawn through a single reading invites exactly the
 * over-reading this whole project tries to avoid.
 */
export function buildTrend(
  reports: MeasurementReport[],
  metricLabel: string,
  minPoints = 2,
): Trend | null {
  const points: TrendPoint[] = [];
  let unit = "";

  for (const report of reports) {
    if (report.quality < MIN_TREND_QUALITY) continue;
    const metric = report.metrics.find((m) => m.label === metricLabel);
    if (!metric) continue;
    const value = numericValue(metric.value);
    if (value === null) continue;
    unit = metric.unit ?? unit;
    points.push({ takenAt: report.takenAt, value, quality: report.quality });
  }

  if (points.length < minPoints) return null;

  // Oldest first, which is how a trend line reads.
  points.sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime());

  const values = points.map((p) => p.value);
  const first = values[0];
  const latest = values[values.length - 1];
  const change = latest - first;

  // A threshold below which "change" is just measurement scatter. Two percent
  // of the average is well inside the error of any of these measurements, so
  // calling it a direction would be reading noise as a story.
  const average = values.reduce((s, v) => s + v, 0) / values.length;
  const meaningful = Math.abs(change) > Math.max(1, average * 0.02);

  return {
    label: metricLabel,
    unit,
    points,
    first,
    latest,
    average,
    min: Math.min(...values),
    max: Math.max(...values),
    change,
    direction: !meaningful ? "flat" : change > 0 ? "up" : "down",
  };
}

/** Metric labels worth trending, in the order they should be shown. */
export const TRENDABLE_METRICS = [
  "Heart rate",
  "Breathing rate",
  "HRV (SDNN)",
  "Stress index",
  "Blood pressure",
] as const;

export function buildTrends(reports: MeasurementReport[]): Trend[] {
  return TRENDABLE_METRICS.map((label) => buildTrend(reports, label)).filter(
    (t): t is Trend => t !== null,
  );
}

/** Group reports by agent, newest first within each group. */
export function groupByAgent(
  reports: MeasurementReport[],
): Array<{ slug: string; name: string; reports: MeasurementReport[] }> {
  const groups = new Map<string, { slug: string; name: string; reports: MeasurementReport[] }>();
  for (const report of sortNewestFirst(reports)) {
    const existing = groups.get(report.agentSlug);
    if (existing) existing.reports.push(report);
    else {
      groups.set(report.agentSlug, {
        slug: report.agentSlug,
        name: report.agentName,
        reports: [report],
      });
    }
  }
  return [...groups.values()];
}
