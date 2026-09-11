/**
 * The weekly journal.
 *
 * One scan is an anecdote. The value in measuring yourself with a camera, if
 * there is any, is in the shape of a fortnight — and nobody is going to read
 * a fortnight of tables. So the app writes the paragraph itself: what was
 * measured, how often, what moved compared with before, and what was too
 * unreliable to count.
 *
 * It is composed here rather than by the language model on purpose. A summary
 * of someone's health measurements is exactly the wrong place for a model to
 * improvise, because the failure mode is a fluent sentence containing a
 * number that was never measured. Claude is offered this text to read aloud
 * and to answer questions about; it does not get to write it.
 */

import { buildDrift, usableReports, type Drift } from "./baseline";
import { TRENDABLE_METRICS } from "./history";
import type { MeasurementReport } from "./report";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Metrics worth a sentence, beyond the ones the trend lines already cover. */
const JOURNAL_METRICS = [...TRENDABLE_METRICS, "Breath coherence", "Fatigue score"] as const;

export interface JournalEntry {
  /** ISO dates bounding the week the entry covers. */
  from: string;
  to: string;
  /** Sessions in the week that were good enough to count. */
  sessions: number;
  /** Sessions in the week that were not. */
  discarded: number;
  /** Separate days measured on. */
  days: number;
  headline: string;
  lines: string[];
  drifts: Drift[];
}

export function weeklyJournal(
  reports: MeasurementReport[],
  now: number = Date.now(),
): JournalEntry | null {
  if (reports.length === 0) return null;

  const from = now - WEEK;
  const inWeek = reports.filter((r) => {
    const t = new Date(r.takenAt).getTime();
    return Number.isFinite(t) && t >= from && t <= now;
  });
  const good = usableReports(inWeek);
  const days = new Set(good.map((r) => r.takenAt.slice(0, 10))).size;

  const entry: JournalEntry = {
    from: new Date(from).toISOString().slice(0, 10),
    to: new Date(now).toISOString().slice(0, 10),
    sessions: good.length,
    discarded: inWeek.length - good.length,
    days,
    headline: "",
    lines: [],
    drifts: [],
  };

  if (good.length === 0) {
    entry.headline = "Nothing measured this week";
    entry.lines.push(
      inWeek.length > 0
        ? `${inWeek.length} session${inWeek.length === 1 ? "" : "s"} were started but none produced a signal clean enough to keep. Brighter, even light on your face is usually the fix.`
        : "No sessions this week. A minute of sitting still in good light is enough for a reading.",
    );
    return entry;
  }

  entry.lines.push(
    `${good.length} reading${good.length === 1 ? "" : "s"} over ${days} day${days === 1 ? "" : "s"}${
      entry.discarded > 0
        ? `, and ${entry.discarded} more discarded as too noisy to count`
        : ""
    }.`,
  );

  // Each metric is compared against the same person before this week, not
  // against a population and not against the week's own average.
  const earlier = reports.filter((r) => new Date(r.takenAt).getTime() < from);
  for (const label of JOURNAL_METRICS) {
    const line = metricLine(label, good, earlier, now);
    if (line) entry.lines.push(line);
  }

  entry.drifts = JOURNAL_METRICS.map((label) => buildDrift(reports, label, now)).filter(
    (d) => d.latest !== null && d.verdict !== "in-range" && d.verdict !== "insufficient",
  );

  const worst = entry.drifts[0];
  // "Latest", explicitly, because the drift is about the most recent reading
  // while the lines below are about the week's average. Both can be true at
  // once — a week in line with usual, ending on a reading that is not — and
  // a headline that did not say which it meant would look like a
  // contradiction.
  entry.headline =
    worst && worst.verdict === "unusual"
      ? `latest ${worst.label.toLowerCase()} well outside your usual range`
      : worst
        ? `latest ${worst.label.toLowerCase()} drifting from your usual`
        : days >= 4
          ? "A steady week, measured most days"
          : "A steady week";

  const limiting = commonLimit(good);
  if (limiting) {
    entry.lines.push(`The thing most often holding readings back was: ${limiting.toLowerCase()}.`);
  }

  entry.lines.push(
    "These are camera and microphone measurements compared with your own earlier ones. They are not a diagnosis, and a change here is a reason to look again rather than to conclude anything.",
  );

  return entry;
}

function metricLine(
  label: string,
  week: MeasurementReport[],
  earlier: MeasurementReport[],
  now: number,
): string | null {
  const thisWeek = values(week, label);
  if (thisWeek.length === 0) return null;

  const centre = median(thisWeek);
  const unit = unitFor(week, label);
  const rounded = centre.toFixed(Math.abs(centre) < 10 ? 1 : 0);
  const count = `${thisWeek.length} reading${thisWeek.length === 1 ? "" : "s"}`;

  const before = values(earlier, label);
  if (before.length < 3) {
    return `${label} averaged ${rounded}${unit ? ` ${unit}` : ""} across ${count}. Not enough history yet to say whether that is usual for you.`;
  }

  // The drift machinery already knows this metric's resolution, so reuse its
  // verdict rather than inventing a second threshold that could disagree with
  // the one shown next to the reading.
  const drift = buildDrift([...earlier, ...week], label, now);
  const beforeCentre = median(before);
  const change = centre - beforeCentre;
  const spread = drift.baseline?.spread ?? Infinity;

  if (Math.abs(change) < spread) {
    return `${label} averaged ${rounded}${unit ? ` ${unit}` : ""} across ${count}, in line with your usual.`;
  }
  return `${label} averaged ${rounded}${unit ? ` ${unit}` : ""} across ${count}, ${Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}${unit ? ` ${unit}` : ""} ${change > 0 ? "above" : "below"} your usual ${beforeCentre.toFixed(Math.abs(beforeCentre) < 10 ? 1 : 0)}.`;
}

/** The journal as one block of speakable text. */
export function journalSpeech(entry: JournalEntry): string {
  return [`Your week: ${entry.headline}.`, ...entry.lines].join(" ");
}

function values(reports: MeasurementReport[], label: string): number[] {
  const out: number[] = [];
  for (const report of usableReports(reports)) {
    const metric = report.metrics.find((m) => m.label === label);
    if (!metric) continue;
    const value =
      typeof metric.value === "number"
        ? metric.value
        : typeof metric.value === "string"
          ? Number.parseFloat(metric.value)
          : NaN;
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

function unitFor(reports: MeasurementReport[], label: string): string {
  for (const report of reports) {
    const metric = report.metrics.find((m) => m.label === label);
    if (metric?.unit) return metric.unit;
  }
  return "";
}

/** The quality note that came up most often, when one clearly dominates. */
function commonLimit(reports: MeasurementReport[]): string | null {
  const counts = new Map<string, number>();
  for (const report of reports) {
    if (!report.qualityNote) continue;
    counts.set(report.qualityNote, (counts.get(report.qualityNote) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  // One mention out of a busy week is not a pattern.
  return ranked[0][1] >= 2 ? ranked[0][0] : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
