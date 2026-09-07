"use client";

import type { VoiceAnalysis } from "@/lib/voice/engine";

/**
 * Acoustic readouts from the microphone.
 *
 * Each measure is shown next to the range published for ordinary
 * conversational speech, because a bare "jitter 1.4%" means nothing to anyone
 * who has not read a phonetics paper. The reference range makes the number
 * interpretable without the interface having to editorialise about it.
 *
 * There is no overall "voice wellness" score here, and that absence is the
 * point. Collapsing these into one number is the step where an honest
 * acoustic measurement turns into an implied clinical claim.
 */

interface Row {
  label: string;
  value: string;
  reference: string;
  /** True when the value sits outside the published conversational range. */
  outside: boolean;
}

function buildRows(v: VoiceAnalysis): Row[] {
  const rows: Row[] = [];

  rows.push({
    label: "Pitch",
    value: `${Math.round(v.medianF0Hz)} Hz`,
    reference: "85–180 male, 165–255 female",
    outside: false,
  });

  rows.push({
    label: "Pitch variation",
    value: `${v.pitchRangeSemitones.toFixed(1)} st`,
    reference: "2–4 in animated speech",
    outside: v.pitchRangeSemitones < 1.2,
  });

  if (Number.isFinite(v.jitterPercent)) {
    rows.push({
      label: "Jitter",
      value: `${v.jitterPercent.toFixed(2)}%`,
      reference: "below 1.04%",
      outside: v.jitterPercent > 1.04,
    });
  }

  if (Number.isFinite(v.shimmerPercent)) {
    rows.push({
      label: "Shimmer",
      value: `${v.shimmerPercent.toFixed(2)}%`,
      reference: "below 3.81%",
      outside: v.shimmerPercent > 3.81,
    });
  }

  rows.push({
    label: "Harmonics to noise",
    value: `${v.harmonicsToNoiseDb.toFixed(1)} dB`,
    reference: "above 20 dB when quiet",
    outside: v.harmonicsToNoiseDb < 20,
  });

  if (v.speechRateHz > 0) {
    rows.push({
      label: "Speech rate",
      value: `${v.speechRateHz.toFixed(1)} syl/s`,
      reference: "4–6 conversational",
      outside: v.speechRateHz < 3,
    });
  }

  rows.push({
    label: "Time spent pausing",
    value: `${Math.round(v.pauseRatio * 100)}%`,
    reference: "typically under 40%",
    outside: v.pauseRatio > 0.5,
  });

  return rows;
}

export function VoicePanel({
  analysis,
  level,
  speaking,
}: {
  analysis: VoiceAnalysis | null;
  level: number;
  speaking: boolean;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Voice acoustics
        </span>
        <span
          className="flex items-center gap-1.5 text-[11px]"
          style={{ color: speaking ? "var(--good)" : "var(--faint)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: speaking ? "var(--good)" : "var(--faint)" }}
          />
          {speaking ? "hearing you" : "quiet"}
        </span>
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{
            width: `${Math.round(Math.min(1, level) * 100)}%`,
            background: "var(--info)",
          }}
        />
      </div>

      {analysis === null ? (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--muted)]">
          Speak for a few seconds and the acoustic measures will appear here.
        </p>
      ) : (
        <>
          <dl className="mt-4 space-y-2">
            {buildRows(analysis).map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-[var(--muted)]">{row.label}</dt>
                <dd className="flex items-baseline gap-2 text-right">
                  <span
                    className="tabular text-[12.5px] font-medium"
                    style={{ color: row.outside ? "var(--fair)" : "var(--foreground)" }}
                  >
                    {row.value}
                  </span>
                  <span className="hidden text-[10.5px] text-[var(--faint)] sm:inline">
                    {row.reference}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--faint)]">Measurement confidence</span>
              <span
                className="tabular font-medium"
                style={{
                  color:
                    analysis.quality > 0.6
                      ? "var(--good)"
                      : analysis.quality > 0.35
                        ? "var(--fair)"
                        : "var(--poor)",
                }}
              >
                {Math.round(analysis.quality * 100)}%
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--faint)]">
              {analysis.limitingFactor}
            </p>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-[var(--faint)]">
            These describe the sound of your voice only. Research linking them to
            mood or neurological conditions is population-level and is not
            applied to you here.
          </p>
        </>
      )}
    </div>
  );
}
