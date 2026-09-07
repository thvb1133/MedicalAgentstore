import Link from "next/link";

import { AgentIcon } from "@/components/AgentIcon";
import { SafetyNotice } from "@/components/SafetyNotice";
import { SiteHeader } from "@/components/SiteHeader";
import { AGENTS, type AgentDefinition } from "@/lib/agents/registry";

const STATUS_STYLE: Record<AgentDefinition["status"], { label: string; colour: string }> =
  {
    ready: { label: "Ready", colour: "var(--good)" },
    research: { label: "Research", colour: "var(--fair)" },
    planned: { label: "Planned", colour: "var(--faint)" },
  };

function AgentCard({ agent }: { agent: AgentDefinition }) {
  const status = STATUS_STYLE[agent.status];
  const disabled = agent.status === "planned";

  const body = (
    <article
      className={`panel group relative flex h-full flex-col overflow-hidden p-5 transition-all ${
        disabled
          ? "opacity-55"
          : "hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_10px_40px_-12px_rgba(0,0,0,0.7)]"
      }`}
    >
      <span
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${agent.accent}, transparent)` }}
      />

      <div className="flex items-start justify-between gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${agent.accent}1a`, color: agent.accent }}
        >
          <AgentIcon name={agent.icon} />
        </span>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
          style={{ borderColor: `${status.colour}44`, color: status.colour }}
        >
          {status.label}
        </span>
      </div>

      <h3 className="mt-4 text-[15px] font-semibold text-[var(--foreground)]">
        {agent.name}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
        {agent.summary}
      </p>

      <ul className="mt-4 space-y-1.5">
        {agent.measures.slice(0, 3).map((m) => (
          <li key={m} className="flex gap-2 text-[11.5px] leading-snug text-[var(--faint)]">
            <span style={{ color: agent.accent }}>·</span>
            {m}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between pt-5">
        <span className="tabular text-[11px] text-[var(--faint)]">
          ~{agent.durationSeconds}s · {agent.sensors.join(" + ")}
        </span>
        {!disabled && (
          <span
            className="text-[12px] font-medium transition-transform group-hover:translate-x-0.5"
            style={{ color: agent.accent }}
          >
            Open →
          </span>
        )}
      </div>
    </article>
  );

  if (disabled) return body;
  return (
    <Link href={`/agents/${agent.slug}`} className="block h-full">
      {body}
    </Link>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader>
        <a
          href="https://github.com/thvb1133/MedicalAgentstore"
          target="_blank"
          rel="noreferrer"
          className="text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          Source
        </a>
      </SiteHeader>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-14">
        <section className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
            Runs entirely on your laptop camera — no wearable, no blood draw
          </span>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--foreground)] sm:text-5xl">
            A clinical instrument
            <br />
            <span className="text-[var(--accent)]">out of a webcam.</span>
          </h1>

          <p className="mt-5 text-[15px] leading-relaxed text-[var(--muted)]">
            Sanjivani Setu is a store of measurement agents that each extract a
            real physiological signal from an ordinary camera. Pulse from the
            colour of your skin. Fatigue from your eyelids. Tremor frequency
            from your fingertips. The information was already there — this is
            the software that reads it.
          </p>

          <p className="mt-4 text-[13px] leading-relaxed text-[var(--faint)]">
            Every agent shows a confidence score and refuses to display a number
            it cannot stand behind. That restraint is the point: a contactless
            measurement that hides its own uncertainty is worse than no
            measurement at all.
          </p>
        </section>

        <section className="mt-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--faint)]">
              Agents
            </h2>
            <span className="text-[11px] text-[var(--faint)]">
              {AGENTS.filter((a) => a.status !== "planned").length} available ·{" "}
              {AGENTS.filter((a) => a.status === "planned").length} in progress
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((agent) => (
              <AgentCard key={agent.slug} agent={agent} />
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="panel p-6">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--faint)]">
              Where the camera stops
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              A camera sees colour, motion and geometry. That is enough for a
              pulse, for eyelids, for fingertips, and for reading something that
              already carries a result — a test strip, an X-ray film on a
              lightbox, a Petri dish. It is not enough for anything that needs a
              different sensing modality.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ["Retina and optic nerve", "needs fundus optics"],
                ["Blood chemistry, glucose", "needs a chemical assay"],
                ["Deep tissue and tumours", "needs X-ray, CT or ultrasound"],
                ["Brain and cardiac electrics", "needs EEG or ECG electrodes"],
              ].map(([what, why]) => (
                <div
                  key={what}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2"
                >
                  <div className="text-[12px] font-medium text-[var(--foreground)]">
                    {what}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--faint)]">{why}</div>
                </div>
              ))}
            </div>
          </div>

          <SafetyNotice limits="Blood pressure is only shown after a one-time calibration against a real arm cuff, and is hidden again when the calibration goes stale or the pulse waveform is not clean enough to support it." />
        </section>
      </main>
    </div>
  );
}
