/**
 * The measurement report: the one payload shape that crosses every boundary.
 *
 * Agents produce it, Claude interprets it, Polly reads it aloud and S3 stores
 * it. Keeping a single shape means adding a new agent does not require
 * touching the backend.
 */

export interface ReportMetric {
  /** Short display name, e.g. "Heart rate". */
  label: string;
  value: number | string | null;
  unit?: string;
  /** 0-1 confidence in this specific metric, when the agent can produce one. */
  confidence?: number;
  /** Anything the interpreter must know, e.g. "calibration 12 days old". */
  note?: string;
}

export interface MeasurementReport {
  agentSlug: string;
  agentName: string;
  /** ISO timestamp of when the measurement finished. */
  takenAt: string;
  /** Seconds of data the measurement is based on. */
  durationSeconds: number;
  /** 0-1 overall signal quality. */
  quality: number;
  qualityNote: string | null;
  metrics: ReportMetric[];
}

export interface InterpretRequest {
  report: MeasurementReport;
  /** Optional free-text question from the user about their measurement. */
  question?: string;
  /** Earlier reports from the same agent, so Claude can comment on trend. */
  history?: MeasurementReport[];
}

export function summariseForSpeech(report: MeasurementReport): string {
  const parts = report.metrics
    .filter((m) => m.value !== null)
    .map((m) => `${m.label} ${m.value}${m.unit ? " " + m.unit : ""}`);
  if (parts.length === 0) return "No reliable measurement was obtained.";
  return `${report.agentName}. ${parts.join(". ")}.`;
}
