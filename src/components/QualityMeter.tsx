import type { QualityReport } from "@/lib/vitals/engine";

const GRADE_COLOUR: Record<QualityReport["grade"], string> = {
  "no-signal": "var(--bad)",
  poor: "var(--bad)",
  fair: "var(--poor)",
  good: "var(--fair)",
  excellent: "var(--good)",
};

const GRADE_LABEL: Record<QualityReport["grade"], string> = {
  "no-signal": "No signal",
  poor: "Poor",
  fair: "Fair",
  good: "Good",
  excellent: "Excellent",
};

/**
 * Signal quality, with the specific reason it is being held down.
 *
 * "Poor signal" on its own is useless to someone trying to fix it, so the
 * engine reports which of its six terms is the binding constraint and that
 * text is surfaced verbatim here.
 */
export function QualityMeter({ quality }: { quality: QualityReport }) {
  const colour = GRADE_COLOUR[quality.grade];
  const pct = Math.round(quality.score * 100);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Signal quality
        </span>
        <span className="tabular text-xs font-semibold" style={{ color: colour }}>
          {GRADE_LABEL[quality.grade]} · {pct}%
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(2, pct)}%`, background: colour }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span>{quality.limiting ?? "All checks passing"}</span>
        <span className="tabular text-[var(--faint)]">
          {quality.effectiveFps > 0 ? `${quality.effectiveFps.toFixed(0)} fps` : "—"}
        </span>
      </div>
    </div>
  );
}
