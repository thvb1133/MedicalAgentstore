"use client";

/**
 * The parts of a reading that are not the number.
 *
 * A confidence score alone is a claim about a claim, and people are right to
 * be sceptical of it. What makes a measurement believable is being shown the
 * working: which patches of skin were read and whether they agreed, whether
 * the light was good enough, whether the beat spacing was even, and where
 * this technique is known to be weaker.
 *
 * All four of these are just as happy saying "this was fine" as "this was
 * not". A panel that only appears when something is wrong teaches people to
 * dread it; one that is always there and usually reassuring is read.
 */

import type { LightingReport } from "@/lib/vitals/lighting";
import type { RhythmReport } from "@/lib/vitals/rhythm";
import type { ToneConfidence } from "@/lib/vitals/skinTone";
import type { VitalsResult } from "@/lib/vitals/engine";

export function LightingGate({ lighting }: { lighting: LightingReport }) {
  if (lighting.verdict === "unknown") return null;

  const tone =
    lighting.verdict === "good"
      ? "var(--good)"
      : lighting.verdict === "workable"
        ? "var(--fair)"
        : "var(--warn)";

  return (
    <Panel title="Light" status={LIGHT_WORD[lighting.verdict]} tone={tone}>
      {lighting.advice ? (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">{lighting.advice}</p>
      ) : (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          Bright and even enough. This is the single biggest thing that decides whether a camera
          reading is any good.
        </p>
      )}
      <Bar value={lighting.score} colour={tone} />
    </Panel>
  );
}

const LIGHT_WORD: Record<LightingReport["verdict"], string> = {
  unknown: "",
  unusable: "Not enough",
  poor: "Poor",
  workable: "Workable",
  good: "Good",
};

/**
 * Which parts of the face were read, and whether they agreed.
 *
 * This is the check that is hardest to fool. Three colour projections of the
 * same pixels can share an artefact; the forehead and both cheeks arriving at
 * the same rate independently is close to real corroboration.
 */
export function RegionAgreement({
  fusion,
}: {
  fusion: NonNullable<VitalsResult["fusion"]> | null;
}) {
  if (!fusion || fusion.contributing === 0) return null;

  const unanimous = fusion.concurring === fusion.contributing;
  const tone = unanimous ? "var(--good)" : fusion.concurring > 1 ? "var(--fair)" : "var(--warn)";

  return (
    <Panel
      title="Cross-check"
      status={`${fusion.concurring} of ${fusion.contributing} agree`}
      tone={tone}
    >
      <ul className="space-y-1.5">
        {fusion.regions.map((region) => (
          <li key={region.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-[86px] shrink-0 text-[var(--muted)]">{region.name}</span>
            <span className="flex-1">
              <Bar value={Math.min(1, region.weight * 4)} colour={tone} thin />
            </span>
            <span className="w-[62px] shrink-0 text-right tabular-nums text-[var(--foreground)]">
              {region.bpm === null ? "—" : `${Math.round(region.bpm)} bpm`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
        {unanimous
          ? "Each patch of skin was read separately and they arrived at the same rate, which is much harder to fake than one region looking convincing."
          : "The regions did not agree. That usually means movement or shadow on part of the face, and the confidence score has been reduced to match."}
      </p>
    </Panel>
  );
}

export function RhythmNote({ rhythm }: { rhythm: RhythmReport }) {
  if (rhythm.rhythm === "unknown") return null;

  const tone =
    rhythm.rhythm === "regular"
      ? "var(--good)"
      : rhythm.rhythm === "some-variation"
        ? "var(--good)"
        : "var(--warn)";

  return (
    <Panel title="Beat spacing" status={RHYTHM_WORD[rhythm.rhythm]} tone={tone}>
      <p className="text-[12px] leading-relaxed text-[var(--muted)]">
        {rhythm.note ??
          "The gaps between beats were even throughout. Nothing here needs looking at."}
      </p>
      <p className="text-[11px] text-[var(--faint)]">
        From {rhythm.intervals} intervals
        {rhythm.scatter !== null && ` · beat-to-beat scatter ${(rhythm.scatter * 100).toFixed(1)}%`}
      </p>
    </Panel>
  );
}

const RHYTHM_WORD: Record<RhythmReport["rhythm"], string> = {
  unknown: "",
  regular: "Even",
  "some-variation": "Normal variation",
  irregular: "Uneven",
};

/**
 * Where the method is weaker, shown to the people it is weaker for.
 *
 * The instinct is to hide this, on the grounds that it sounds like an excuse.
 * It is the opposite. Reporting the same confidence for everybody is not
 * fairness, it is a tool being quietly wrong for some people and not saying
 * so, and anyone who has been on the receiving end of that already knows.
 */
export function FairnessNote({ tone }: { tone: ToneConfidence }) {
  if (!tone.note) return null;

  return (
    <Panel title="Known limit" status="" tone="var(--info)">
      <p className="text-[12px] leading-relaxed text-[var(--muted)]">{tone.note}</p>
    </Panel>
  );
}

function Panel({
  title,
  status,
  tone,
  children,
}: {
  title: string;
  status: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3.5">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--faint)]">
          {title}
        </h3>
        {status && (
          <span className="text-[11.5px] font-medium" style={{ color: tone }}>
            {status}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function Bar({ value, colour, thin = false }: { value: number; colour: string; thin?: boolean }) {
  return (
    <span
      className={`block w-full overflow-hidden rounded-full bg-[var(--border)] ${thin ? "h-1" : "h-1.5"}`}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: colour }}
      />
    </span>
  );
}
