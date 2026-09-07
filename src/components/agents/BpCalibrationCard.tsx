"use client";

import { useState } from "react";

import {
  CALIBRATION_STALE_DAYS,
  type BpCalibration,
  type BpEstimate,
} from "@/lib/vitals/bloodPressure";

const STATUS_COLOUR: Record<BpEstimate["status"], string> = {
  ok: "var(--good)",
  "needs-calibration": "var(--info)",
  "signal-too-weak": "var(--fair)",
  "calibration-stale": "var(--poor)",
};

export interface BpCalibrationCardProps {
  estimate: BpEstimate;
  calibration: BpCalibration;
  canCalibrate: boolean;
  onAddReading: (systolic: number, diastolic: number) => { ok: boolean; reason?: string };
  onClear: () => void;
}

/**
 * Blood pressure readout and its calibration flow.
 *
 * The interface is built around a refusal: until the user has entered a real
 * cuff reading, there is no number here at all, only an explanation. That is
 * the honest behaviour for a cuffless estimate, and it is what separates this
 * from apps that print a plausible-looking 120/80 for everybody.
 */
export function BpCalibrationCard({
  estimate,
  calibration,
  canCalibrate,
  onAddReading,
  onClear,
}: BpCalibrationCardProps) {
  const [open, setOpen] = useState(false);
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const colour = STATUS_COLOUR[estimate.status];
  const hasNumbers = estimate.systolic !== null && estimate.diastolic !== null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Number(systolic);
    const d = Number(diastolic);
    if (!Number.isFinite(s) || !Number.isFinite(d)) {
      setFeedback("Enter both numbers from the cuff display.");
      return;
    }
    const result = onAddReading(s, d);
    if (result.ok) {
      setSystolic("");
      setDiastolic("");
      setFeedback(null);
      setOpen(false);
    } else {
      setFeedback(result.reason ?? "Could not save that reading.");
    }
  };

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
            Blood pressure
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            {hasNumbers ? (
              <>
                <span className="tabular text-[34px] font-semibold leading-none" style={{ color: colour }}>
                  {estimate.systolic}/{estimate.diastolic}
                </span>
                <span className="text-xs text-[var(--muted)]">mmHg</span>
              </>
            ) : (
              <span className="tabular text-[34px] font-semibold leading-none text-[var(--faint)]">
                —
              </span>
            )}
          </div>
          {hasNumbers && estimate.uncertainty !== null && (
            <div className="tabular mt-1 text-[11px]" style={{ color: colour }}>
              ± {estimate.uncertainty} mmHg
            </div>
          )}
        </div>

        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
          style={{ borderColor: `${colour}44`, color: colour }}
        >
          {estimate.status === "ok"
            ? "Calibrated"
            : estimate.status === "needs-calibration"
              ? "Not calibrated"
              : estimate.status === "calibration-stale"
                ? "Stale"
                : "Signal weak"}
        </span>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">
        {estimate.message}
      </p>

      {calibration.model && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--faint)]">
          <span className="tabular">
            {calibration.model.points} cuff reading
            {calibration.model.points === 1 ? "" : "s"}
          </span>
          {estimate.calibrationAgeDays !== null && (
            <span className="tabular">
              calibrated {formatAge(estimate.calibrationAgeDays)}
            </span>
          )}
          <span className="tabular">
            expires after {CALIBRATION_STALE_DAYS} days
          </span>
        </div>
      )}

      {!open && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setOpen(true)}
            disabled={!canCalibrate}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-colors enabled:hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {calibration.readings.length === 0 ? "Calibrate with a cuff" : "Add a cuff reading"}
          </button>
          {calibration.readings.length > 0 && (
            <button
              onClick={onClear}
              className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--faint)] transition-colors hover:text-[var(--bad)]"
            >
              Clear calibration
            </button>
          )}
        </div>
      )}

      {!canCalibrate && !open && (
        <p className="mt-2 text-[11px] text-[var(--faint)]">
          Calibration needs a clean pulse waveform first — wait for signal
          quality to reach Good.
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            Take a reading with a real arm cuff <em>right now</em>, while the
            camera is still measuring, and type both numbers below. The camera
            then tracks change from your own anchor rather than from a
            population average.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={systolic}
              onChange={(e) => setSystolic(e.target.value)}
              placeholder="120"
              aria-label="Systolic, mmHg"
              className="tabular w-24 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <span className="text-[var(--faint)]">/</span>
            <input
              type="number"
              inputMode="numeric"
              value={diastolic}
              onChange={(e) => setDiastolic(e.target.value)}
              placeholder="80"
              aria-label="Diastolic, mmHg"
              className="tabular w-24 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <span className="text-[11px] text-[var(--faint)]">mmHg</span>
          </div>

          {feedback && <p className="text-[11.5px] text-[var(--bad)]">{feedback}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[#141414] transition-colors hover:bg-[var(--accent-strong)]"
            >
              Save reading
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setFeedback(null);
              }}
              className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--faint)]">
            Three readings taken at different times of day — ideally at
            different heart rates — let the model fit your personal response
            instead of only your baseline.
          </p>
        </form>
      )}
    </div>
  );
}

function formatAge(days: number): string {
  if (days < 1 / 24) return "just now";
  if (days < 1) return `${Math.round(days * 24)}h ago`;
  return `${Math.round(days)}d ago`;
}
