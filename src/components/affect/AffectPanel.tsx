"use client";

/**
 * Face and voice side by side, with the disagreement left visible.
 *
 * The two dots are the point. One channel produces a number; two produce a
 * number and a reason to doubt it, and a reader can see at a glance whether
 * this is a corroborated observation or a single sensor talking to itself.
 */

import type { Affect } from "@/lib/affect/multimodal";

export function AffectPanel({ affect, accent = "var(--accent)" }: { affect: Affect; accent?: string }) {
  const measured = affect.arousal !== null;

  return (
    <div className="panel p-5" data-testid="affect-panel">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Expression and voice
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
          style={{
            borderColor: measured ? `${accent}44` : "var(--border)",
            color: measured ? accent : "var(--faint)",
          }}
        >
          {affect.label}
        </span>
      </div>

      <Space affect={affect} accent={accent} />

      <div className="mt-3 space-y-2">
        <Line
          name="Face"
          detail={affect.face.withheld ?? affect.face.detail}
          available={affect.face.arousal !== null}
        />
        <Line
          name="Voice"
          detail={affect.voice.withheld ?? affect.voice.detail}
          available={affect.voice.arousal !== null}
        />
        {affect.agreement !== null && (
          <Line
            name="Agreement"
            detail={`${Math.round(affect.agreement * 100)}% between the two`}
            available
          />
        )}
      </div>

      <p className="mt-3.5 text-[10.5px] leading-relaxed text-[var(--faint)]">{affect.note}</p>
    </div>
  );
}

/** Arousal up the side, valence across: the two axes, with both channels plotted. */
function Space({ affect, accent }: { affect: Affect; accent: string }) {
  const width = 240;
  const height = 116;
  const at = (valence: number | null, arousal: number | null) => ({
    x: 8 + (((valence ?? 0) + 1) / 2) * (width - 16),
    y: height - 8 - (arousal ?? 0) * (height - 16),
  });
  const fused = at(affect.valence, affect.arousal);
  const face = at(affect.face.valence, affect.face.arousal);
  const voice = at(affect.voice.valence, affect.voice.arousal);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3.5 w-full"
      style={{ height }}
      role="img"
      aria-label={`${affect.label}. Expressiveness ${Math.round((affect.arousal ?? 0) * 100)} of 100.`}
    >
      <rect
        x={0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
        rx={8}
        fill="none"
        stroke="var(--border)"
      />
      <line x1={width / 2} y1={6} x2={width / 2} y2={height - 6} stroke="var(--border)" strokeDasharray="3 4" />
      <line x1={6} y1={height / 2} x2={width - 6} y2={height / 2} stroke="var(--border)" strokeDasharray="3 4" />
      <text x={8} y={14} fontSize="9" fill="var(--faint)">
        animated
      </text>
      <text x={8} y={height - 6} fontSize="9" fill="var(--faint)">
        still
      </text>
      <text x={width - 8} y={height / 2 - 5} fontSize="9" fill="var(--faint)" textAnchor="end">
        brighter
      </text>

      {affect.face.arousal !== null && affect.voice.arousal !== null && (
        <line
          x1={face.x}
          y1={face.y}
          x2={voice.x}
          y2={voice.y}
          stroke="var(--faint)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}
      {affect.face.arousal !== null && (
        <circle cx={face.x} cy={face.y} r={4} fill="none" stroke={accent} strokeWidth={1.4} />
      )}
      {affect.voice.arousal !== null && (
        <rect
          x={voice.x - 3.5}
          y={voice.y - 3.5}
          width={7}
          height={7}
          fill="none"
          stroke="var(--info)"
          strokeWidth={1.4}
        />
      )}
      {affect.arousal !== null && <circle cx={fused.x} cy={fused.y} r={3} fill={accent} />}
    </svg>
  );
}

function Line({ name, detail, available }: { name: string; detail: string; available: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-[var(--muted)]">{name}</span>
      <span
        className="text-right text-[11px]"
        style={{ color: available ? "var(--muted)" : "var(--faint)" }}
      >
        {detail}
      </span>
    </div>
  );
}
