"use client";

import type { CognitiveLoad, LoadChannel } from "@/lib/cognition/load";

const BAND = {
  light: { label: "Light", colour: "var(--good)" },
  moderate: { label: "Moderate", colour: "var(--fair)" },
  heavy: { label: "Heavy", colour: "var(--poor)" },
  unknown: { label: "Measuring", colour: "var(--faint)" },
} as const;

/**
 * Cognitive load, shown channel by channel rather than as a single number.
 *
 * The breakdown is the point. A load index resting on gaze alone because the
 * light moved is a different claim from one where all three agreed, and a
 * user cannot tell those apart from the headline figure. So each channel says
 * what it measured or why it stood down.
 */
export function CognitiveLoadPanel({ load }: { load: CognitiveLoad }) {
  const band = BAND[load.band];

  return (
    <div className="panel p-5" data-testid="cognitive-load">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Cognitive load
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
          style={{ borderColor: `${band.colour}44`, color: band.colour }}
        >
          {band.label}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className="tabular text-4xl font-semibold leading-none"
          style={{ color: load.index === null ? "var(--faint)" : band.colour }}
          data-load={load.index ?? ""}
        >
          {load.index ?? "—"}
        </span>
        <span className="text-xs text-[var(--muted)]">/100</span>
        {load.confidence > 0 && (
          <span className="tabular ml-auto text-[10.5px] text-[var(--faint)]">
            {(load.confidence * 100).toFixed(0)}% of the evidence available
          </span>
        )}
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
        {load.driver ?? "Waiting for data"}
      </p>

      <div className="mt-4 space-y-2.5 border-t border-[var(--border)] pt-3.5">
        <Channel name="Pupil size" channel={load.pupil} colour={band.colour} />
        <Channel name="Blink rate" channel={load.blink} colour={band.colour} />
        <Channel name="Gaze scan" channel={load.scan} colour={band.colour} />
      </div>

      <p className="mt-3.5 text-[10.5px] leading-relaxed text-[var(--faint)]">
        Effort widens the pupil by a few percent. Turning on a lamp changes it by
        far more, so that channel stands down whenever the light on your face
        moves. This measures how hard an interface is making you work — nothing
        about your ability, mood or health.
      </p>
    </div>
  );
}

function Channel({
  name,
  channel,
  colour,
}: {
  name: string;
  channel: LoadChannel;
  colour: string;
}) {
  const available = channel.value !== null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-[var(--foreground)]">{name}</span>
        <span
          className="tabular text-[11px]"
          style={{ color: available ? "var(--muted)" : "var(--faint)" }}
        >
          {available ? channel.detail : "stood down"}
        </span>
      </div>
      {available ? (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--track)]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(2, (channel.value as number) * 100)}%`, background: colour }}
          />
        </div>
      ) : (
        channel.withheld && (
          <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--faint)]">
            {channel.withheld}
          </p>
        )
      )}
    </div>
  );
}
