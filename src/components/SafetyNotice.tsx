/**
 * The disclaimer, and the agent's stated limits, shown together.
 *
 * This is deliberately not tucked into a footer. Everything this app produces
 * is a wellness estimate from a consumer webcam, and the boundary between
 * "measurement" and "diagnosis" is the most important thing a user needs to
 * understand before reading any number on the screen.
 */

export function SafetyNotice({
  limits,
  tone = "normal",
}: {
  limits?: string;
  tone?: "normal" | "urgent";
}) {
  const urgent = tone === "urgent";
  return (
    <div
      className="rounded-[var(--radius)] border p-4"
      style={{
        borderColor: urgent ? "#f8717155" : "var(--border)",
        background: urgent ? "#f871710d" : "var(--surface)",
      }}
    >
      <div className="flex gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={urgent ? "var(--bad)" : "var(--muted)"}
          strokeWidth={1.6}
          strokeLinecap="round"
          className="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
        <div className="space-y-2 text-[12px] leading-relaxed text-[var(--muted)]">
          <p>
            <span className="font-semibold text-[var(--foreground)]">
              Not a medical device.
            </span>{" "}
            Sanjivani Setu produces wellness and research estimates from a
            consumer camera. It does not diagnose, treat or rule out any
            condition. If you feel unwell, contact a clinician.
          </p>
          {limits && <p>{limits}</p>}
        </div>
      </div>
    </div>
  );
}

/** Shown when a screening agent flags something that needs urgent action. */
export function EmergencyBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius)] border p-4"
      style={{ borderColor: "#f87171", background: "#f871711a" }}
    >
      <p className="text-sm font-semibold text-[var(--bad)]">{children}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
        Call your local emergency number now — 999 in the UK, 112 in the EU, 911
        in the US, 108 in India. Do not wait to see whether the signs pass, and
        do not use this screen as a reason to delay.
      </p>
    </div>
  );
}
