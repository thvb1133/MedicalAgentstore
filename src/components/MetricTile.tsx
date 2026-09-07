/**
 * A single measurement readout.
 *
 * The empty state is as important as the populated one. When a value is null
 * this shows a dash and the reason, rather than the last known number: a
 * stale reading that looks live is the main way a contactless vitals UI
 * misleads people.
 */

export interface MetricTileProps {
  label: string;
  value: number | string | null;
  unit?: string;
  /** Decimal places when `value` is numeric. */
  precision?: number;
  /** Shown under the value when present. */
  detail?: string | null;
  /** Shown in place of the value when it is null. */
  pending?: string;
  accent?: string;
  /** Renders larger, for the headline metric on a page. */
  size?: "normal" | "large";
  /** Adds a subtle pulse ring, used for the live heart rate. */
  beat?: boolean;
}

export function MetricTile({
  label,
  value,
  unit,
  precision = 0,
  detail,
  pending = "Measuring",
  accent = "var(--accent)",
  size = "normal",
  beat = false,
}: MetricTileProps) {
  const hasValue = value !== null && value !== undefined && value !== "";
  const display =
    typeof value === "number" ? value.toFixed(precision) : (value ?? null);

  return (
    <div className="panel relative overflow-hidden p-4">
      {beat && hasValue && (
        <span
          key={String(display)}
          className="beat-ring pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full"
          style={{ background: `radial-gradient(circle, ${accent}44 0%, transparent 70%)` }}
        />
      )}
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        {hasValue ? (
          <>
            <span
              className={`tabular font-semibold leading-none ${
                size === "large" ? "text-5xl" : "text-[28px]"
              }`}
              style={{ color: accent }}
            >
              {display}
            </span>
            {unit && (
              <span className="text-xs font-medium text-[var(--muted)]">{unit}</span>
            )}
          </>
        ) : (
          <span
            className={`tabular font-semibold leading-none text-[var(--faint)] ${
              size === "large" ? "text-5xl" : "text-[28px]"
            }`}
          >
            —
          </span>
        )}
      </div>
      <div className="mt-1.5 min-h-[16px] text-[11px] leading-tight text-[var(--muted)]">
        {hasValue ? detail : pending}
      </div>
    </div>
  );
}
