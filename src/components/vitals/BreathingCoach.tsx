"use client";

/**
 * A guided breathing coach that is actually closed-loop.
 *
 * Most breathing apps are open-loop: they animate a circle and take it on
 * trust that anything happened. Here the camera is already measuring both the
 * breath (from head movement) and the beat-to-beat interval, so the pacer can
 * be checked against the person in three ways at once — are they breathing at
 * the pace, is the heart rate oscillating cleanly, and is that oscillation
 * following the breath rather than something else.
 *
 * The claim is only that: a loop you can watch. Nothing here treats anything.
 */

import { useEffect, useRef, useState } from "react";

import {
  PACES,
  cycleSeconds,
  pacerAt,
  paceRatePerMin,
  type Coherence,
  type PacerState,
} from "@/lib/vitals/coherence";

const BAND = {
  unknown: { label: "Measuring", colour: "var(--faint)" },
  scattered: { label: "Scattered", colour: "var(--poor)" },
  settling: { label: "Settling", colour: "var(--fair)" },
  coherent: { label: "Coherent", colour: "var(--good)" },
} as const;

export function BreathingCoach({
  coherence,
  breathingRateBpm,
  accent = "var(--accent)",
}: {
  coherence: Coherence;
  breathingRateBpm: number | null;
  accent?: string;
}) {
  const [paceId, setPaceId] = useState(PACES[0].id);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<PacerState>(() => pacerAt(0, PACES[0].pace));
  const startedAt = useRef(0);

  const pace = PACES.find((p) => p.id === paceId) ?? PACES[0];

  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setState(pacerAt((performance.now() - startedAt.current) / 1000, pace.pace));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, pace]);

  const band = BAND[coherence.band];
  const asked = paceRatePerMin(pace.pace);
  // Within one breath a minute of the pace is following it; the measurement
  // itself is not more precise than that.
  const following =
    breathingRateBpm !== null ? Math.abs(breathingRateBpm - asked) <= 1 : null;

  const size = 132;
  const radius = 18 + state.fullness * 42;

  return (
    <div className="panel p-5" data-testid="breathing-coach">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Breathing coach
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
          style={{ borderColor: `${band.colour}44`, color: band.colour }}
        >
          {band.label}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={running ? state.label : "Breathing pacer, stopped"}
          data-phase={running ? state.phase : "idle"}
          data-fullness={state.fullness.toFixed(3)}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={60}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill={`${accent}22`}
            stroke={accent}
            strokeWidth={1.5}
          />
          <text
            x={size / 2}
            y={size / 2 + 4}
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="11"
          >
            {running ? state.label : "Ready"}
          </text>
        </svg>

        <div className="flex-1 space-y-2.5">
          <Row
            label="Coherence"
            value={coherence.score !== null ? `${coherence.score}/100` : "—"}
            colour={band.colour}
          />
          <Row
            label="Your breathing"
            value={breathingRateBpm !== null ? `${breathingRateBpm.toFixed(1)}/min` : "—"}
            colour={
              following === null ? "var(--muted)" : following ? "var(--good)" : "var(--fair)"
            }
          />
          <Row label="Pace asks for" value={`${asked.toFixed(1)}/min`} colour="var(--muted)" />
          <Row
            label="Heart follows breath"
            value={
              coherence.locked === null ? "—" : `${Math.round(coherence.locked * 100)}%`
            }
            colour={
              coherence.locked === null
                ? "var(--muted)"
                : coherence.locked > 0.6
                  ? "var(--good)"
                  : "var(--fair)"
            }
          />
        </div>
      </div>

      <p className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--muted)]">{coherence.note}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3.5">
        <button
          onClick={() => setRunning((r) => !r)}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors"
          style={{
            background: running ? "var(--surface-raised)" : accent,
            color: running ? "var(--foreground)" : "#141414",
            border: running ? "1px solid var(--border)" : "1px solid transparent",
          }}
        >
          {running ? "Stop pacer" : "Start pacer"}
        </button>
        {PACES.map((p) => (
          <button
            key={p.id}
            onClick={() => setPaceId(p.id)}
            className="rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors"
            style={{
              borderColor: p.id === paceId ? accent : "var(--border)",
              color: p.id === paceId ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {p.label}
          </button>
        ))}
        {running && (
          <span className="tabular ml-auto text-[11px] text-[var(--faint)]">
            {state.cycles} breath{state.cycles === 1 ? "" : "s"} ·{" "}
            {cycleSeconds(pace.pace).toFixed(0)}s each
          </span>
        )}
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--faint)]">
        Slow breathing reliably makes heart rate oscillate with the breath. That
        is a normal reflex, not a therapy, and a high score here does not mean
        anything about your health. Stop if you feel light-headed.
      </p>
    </div>
  );
}

function Row({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-[var(--muted)]">{label}</span>
      <span className="tabular text-[12.5px]" style={{ color: colour }}>
        {value}
      </span>
    </div>
  );
}
