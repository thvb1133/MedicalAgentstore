"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCompanionProfile } from "@/hooks/useCompanionProfile";
import { useServices } from "@/hooks/useServices";
import { useSpeak } from "@/hooks/useSpeak";
import { AGENTS } from "@/lib/agents/registry";
import { buildDrifts, type Drift } from "@/lib/baseline";
import { journalSpeech, weeklyJournal } from "@/lib/journal";
import {
  buildTrends,
  groupByAgent,
  loadLocalReports,
  mergeReports,
  MIN_TREND_QUALITY,
  saveLocalReports,
  type Trend,
} from "@/lib/history";
import type { MeasurementReport } from "@/lib/report";
import { api, NO_SERVER } from "@/lib/paths";

/**
 * The history view.
 *
 * Two decisions shape this. Low-quality readings are shown in the list but
 * excluded from every trend, and the interface says which is which — hiding a
 * bad measurement would make the record dishonest, but letting it bend a
 * trend line would make the trend a lie. And a trend needs at least two
 * readings before it is drawn at all, because a line through a single point
 * invites exactly the over-reading this project spends most of its effort
 * trying to prevent.
 */

export function HistoryView() {
  const [reports, setReports] = useState<MeasurementReport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [review, setReview] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { services } = useServices();
  const { profile, ready } = useCompanionProfile();

  useEffect(() => {
    if (!ready) return;
    const local = loadLocalReports();
    setReports(local);
    setLoaded(true);

    // The bucket is optional, so a failure here is expected rather than
    // exceptional: the local copy is the source of truth and the sync is a
    // convenience for people using more than one machine.
    if (!services.s3) return;
    let cancelled = false;
    fetch(`/api/sessions?profileId=${encodeURIComponent(profile.profileId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { reports?: MeasurementReport[] } | null) => {
        if (cancelled || !data?.reports?.length) return;
        setReports(saveLocalReports(mergeReports(local, data.reports)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile.profileId, ready, services.s3]);

  const trends = useMemo(() => buildTrends(reports), [reports]);
  const journal = useMemo(() => weeklyJournal(reports), [reports]);
  const drifts = useMemo(() => buildDrifts(reports, DRIFT_METRICS), [reports]);
  const groups = useMemo(() => groupByAgent(reports), [reports]);
  const usable = useMemo(
    () => reports.filter((r) => r.quality >= MIN_TREND_QUALITY),
    [reports],
  );

  const askForReview = useCallback(async () => {
    if (reports.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setReviewing(true);
    setReview("");
    setReviewError(null);

    try {
      const interpretUrl = api("/api/interpret");
      if (!interpretUrl) throw new Error(NO_SERVER);
      const response = await fetch(interpretUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: usable[0] ?? reports[0],
          // Oldest first, so the model reads the sequence in the direction it
          // happened rather than backwards.
          history: [...usable.slice(1, 6)].reverse(),
          question:
            "Look across these readings as a sequence rather than one at a time. Say what has changed, what has stayed the same, and what is too noisy to call either way. Be explicit about which comparisons the signal quality does not support.",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({ error: "Request failed." }));
        throw new Error(detail.error ?? "Request failed.");
      }
      if (!response.body) throw new Error("No response body.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setReview(text);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setReviewError(err instanceof Error ? err.message : "The review failed.");
      }
    } finally {
      setReviewing(false);
    }
  }, [reports, usable]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (loaded && reports.length === 0) {
    return (
      <div className="panel px-6 py-12 text-center">
        <p className="text-[14px] font-medium text-[var(--foreground)]">
          Nothing measured yet.
        </p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--muted)]">
          Readings are saved here automatically when you finish a session, and
          the trend appears once there are two of them to compare.
        </p>
        <Link
          href="/agents/companion"
          className="mt-5 inline-block rounded-lg px-4 py-2 text-[13px] font-semibold"
          style={{ background: "var(--accent)", color: "#141414" }}
        >
          Take a first reading
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {journal && (
        <JournalCard
          journal={journal}
          voiceId={profile.voiceId}
          speechRate={profile.speechRate}
          pollyAvailable={services.polly}
        />
      )}

      {drifts.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
            Against your own baseline
          </h2>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-[var(--muted)]">
            Not against a population. Each reading is placed against the middle
            of your own earlier ones and the amount you ordinarily vary by, with
            a floor set at what the measurement can actually resolve.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {drifts.map((drift) => (
              <DriftCard key={drift.label} drift={drift} />
            ))}
          </div>
        </section>
      )}

      {trends.length > 0 && (
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
            Trend across {usable.length} usable {usable.length === 1 ? "reading" : "readings"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trends.map((trend) => (
              <TrendCard key={trend.label} trend={trend} />
            ))}
          </div>
        </section>
      )}

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
              What Claude makes of it
            </h2>
            <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[var(--muted)]">
              Reads your last few readings as a sequence. It is told to say
              which comparisons the signal quality does not support, and it
              cannot name a condition.
            </p>
          </div>
          <button
            onClick={() => void askForReview()}
            disabled={!services.claude || reviewing || usable.length === 0}
            className="shrink-0 rounded-lg px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#141414" }}
          >
            {reviewing ? "Reading…" : review ? "Look again" : "Review my history"}
          </button>
        </div>

        {!services.claude && (
          <p className="mt-3 text-[12px] text-[var(--faint)]">
            Needs <span className="tabular">ANTHROPIC_API_KEY</span>. The
            measurements and trends above work without it.
          </p>
        )}
        {usable.length === 0 && services.claude && (
          <p className="mt-3 text-[12px] text-[var(--faint)]">
            None of your readings are good enough to review yet.
          </p>
        )}
        {reviewError && (
          <p className="mt-3 text-[12px]" style={{ color: "var(--bad)" }}>
            {reviewError}
          </p>
        )}
        {review && (
          <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
            {review.split(/\n\n+/).map((paragraph, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-[var(--muted)]">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Every reading
        </h2>
        <div className="mt-3 space-y-5">
          {groups.map((group) => (
            <div key={group.slug}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
                  {group.name}
                </h3>
                <Link
                  href={`/agents/${group.slug}`}
                  className="text-[11.5px] text-[var(--faint)] underline-offset-2 hover:underline"
                >
                  measure again
                </Link>
              </div>
              <div className="space-y-2">
                {group.reports.slice(0, 20).map((report) => (
                  <ReportRow key={`${report.agentSlug}-${report.takenAt}`} report={report} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
        Readings are kept in this browser, and mirrored to your S3 bucket only
        if one is configured. Neither store ever holds a frame of video or a
        second of audio — only the numbers you can see here.
      </p>
    </div>
  );
}

/** Everything worth placing against a personal baseline, most useful first. */
const DRIFT_METRICS = [
  "Heart rate",
  "HRV (SDNN)",
  "Breathing rate",
  "Stress index",
  "Blood pressure",
  "Breath coherence",
  "Fatigue score",
] as const;

const DRIFT_STYLE: Record<Drift["verdict"], { label: string; colour: string }> = {
  insufficient: { label: "Building", colour: "var(--faint)" },
  "in-range": { label: "Usual for you", colour: "var(--good)" },
  drifting: { label: "Drifting", colour: "var(--fair)" },
  unusual: { label: "Unusual for you", colour: "var(--poor)" },
};

function DriftCard({ drift }: { drift: Drift }) {
  const style = DRIFT_STYLE[drift.verdict];
  return (
    <div className="panel p-4" data-testid="drift-card" data-verdict={drift.verdict}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-[var(--foreground)]">{drift.label}</span>
        <span className="text-[10.5px] uppercase tracking-[0.1em]" style={{ color: style.colour }}>
          {style.label}
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="tabular text-[24px] font-semibold leading-none text-[var(--foreground)]">
          {drift.latest ? drift.latest.value.toFixed(drift.latest.value % 1 === 0 ? 0 : 1) : "—"}
        </span>
        <span className="text-[11px] text-[var(--faint)]">{drift.unit}</span>
        {drift.baseline && (
          <span className="tabular ml-auto text-[11px] text-[var(--muted)]">
            usual {drift.baseline.centre.toFixed(0)} ± {drift.baseline.spread.toFixed(0)}
          </span>
        )}
      </div>

      {drift.baseline && drift.z !== null && (
        <div className="mt-3">
          {/*
            The bar is the person's own range, not a normal range. The middle
            is their median and the ends are two of their own deviations, so
            the marker's position answers "is this unusual for me" and cannot
            be misread as "is this healthy".
          */}
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
            <div
              className="absolute inset-y-0 rounded-full"
              style={{ left: "25%", width: "50%", background: "var(--good)", opacity: 0.35 }}
            />
            <div
              className="absolute top-1/2 h-3 w-[3px] -translate-y-1/2 rounded-full"
              style={{
                left: `${Math.min(98, Math.max(2, 50 + (drift.z / 4) * 100))}%`,
                background: style.colour,
              }}
            />
          </div>
          <div className="tabular mt-1.5 flex justify-between text-[10px] text-[var(--faint)]">
            <span>−2 of your own</span>
            <span>{drift.baseline.points} earlier readings</span>
            <span>+2</span>
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">{drift.note}</p>
    </div>
  );
}

function JournalCard({
  journal,
  voiceId,
  speechRate,
  pollyAvailable,
}: {
  journal: NonNullable<ReturnType<typeof weeklyJournal>>;
  voiceId: string;
  speechRate: number;
  pollyAvailable: boolean;
}) {
  const { speak, stop, speaking } = useSpeak({
    voiceId,
    rate: speechRate,
    enabled: pollyAvailable,
  });

  return (
    <section className="panel p-5" data-testid="weekly-journal">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
            Your week: {journal.headline}
          </h2>
          <p className="mt-1 text-[11.5px] text-[var(--faint)]">
            {journal.from} to {journal.to}
          </p>
        </div>
        <button
          onClick={() => (speaking ? stop() : void speak(journalSpeech(journal)))}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          {speaking ? "Stop" : "Read it to me"}
        </button>
      </div>

      <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
        {journal.lines.map((line, i) => (
          <p
            key={i}
            className={
              i === journal.lines.length - 1
                ? "text-[11.5px] leading-relaxed text-[var(--faint)]"
                : "text-[13px] leading-relaxed text-[var(--muted)]"
            }
          >
            {line}
          </p>
        ))}
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--faint)]">
        Written from your saved numbers, not by the language model. Claude can
        read it aloud and answer questions about it, but it does not get to
        write the summary — a fluent sentence containing a figure nobody
        measured is the one failure mode that matters here.
      </p>
    </section>
  );
}

function TrendCard({ trend }: { trend: Trend }) {
  const colour =
    trend.direction === "flat"
      ? "var(--muted)"
      : trend.direction === "up"
        ? "var(--fair)"
        : "var(--info)";

  const arrow = trend.direction === "flat" ? "→" : trend.direction === "up" ? "↑" : "↓";

  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] text-[var(--muted)]">{trend.label}</span>
        <span className="tabular text-[11px]" style={{ color: colour }}>
          {arrow}{" "}
          {trend.direction === "flat"
            ? "steady"
            : `${trend.change > 0 ? "+" : ""}${trend.change.toFixed(trend.change % 1 === 0 ? 0 : 1)}`}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-[26px] font-semibold leading-none text-[var(--foreground)]">
          {trend.latest.toFixed(trend.latest % 1 === 0 ? 0 : 1)}
        </span>
        <span className="text-[11px] text-[var(--faint)]">{trend.unit}</span>
      </div>
      <Sparkline trend={trend} colour={colour} />
      <div className="tabular mt-2 flex justify-between text-[10.5px] text-[var(--faint)]">
        <span>low {trend.min.toFixed(0)}</span>
        <span>avg {trend.average.toFixed(0)}</span>
        <span>high {trend.max.toFixed(0)}</span>
      </div>
    </div>
  );
}

function Sparkline({ trend, colour }: { trend: Trend; colour: string }) {
  const width = 240;
  const height = 44;
  const padding = 3;

  const values = trend.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero and, worse, draw a line at the top of
  // the box implying a maximum. A constant series belongs in the middle.
  const span = max - min || 1;

  const coords = trend.points.map((point, i) => {
    const x =
      trend.points.length === 1
        ? width / 2
        : padding + (i / (trend.points.length - 1)) * (width - padding * 2);
    const y =
      max === min
        ? height / 2
        : height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { x, y };
  });

  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x} ${c.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2.5 w-full"
      style={{ height }}
      role="img"
      aria-label={`${trend.points.length} readings, from ${trend.first} to ${trend.latest} ${trend.unit}`}
    >
      <path d={path} fill="none" stroke={colour} strokeWidth={1.6} strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={i === coords.length - 1 ? 3 : 1.8}
          fill={colour}
          opacity={i === coords.length - 1 ? 1 : 0.45}
        />
      ))}
    </svg>
  );
}

function ReportRow({ report }: { report: MeasurementReport }) {
  const agent = AGENTS.find((a) => a.slug === report.agentSlug);
  const accent = agent?.accent ?? "var(--accent)";
  const usable = report.quality >= MIN_TREND_QUALITY;
  const measured = report.metrics.filter((m) => m.value !== null);

  return (
    <div className="panel px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[12px] text-[var(--muted)]">
          {new Date(report.takenAt).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span
          className="tabular text-[11px]"
          style={{ color: usable ? "var(--good)" : "var(--fair)" }}
        >
          {usable
            ? `quality ${(report.quality * 100).toFixed(0)}%`
            : `too noisy to use · ${(report.quality * 100).toFixed(0)}%`}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
        {measured.length === 0 && (
          <span className="text-[12px] text-[var(--faint)]">Nothing measurable.</span>
        )}
        {measured.map((metric) => (
          <span key={metric.label} className="text-[12px]">
            <span className="text-[var(--faint)]">{metric.label} </span>
            <span className="tabular font-medium" style={{ color: accent }}>
              {metric.value}
              {metric.unit ? ` ${metric.unit}` : ""}
            </span>
          </span>
        ))}
      </div>

      {!usable && report.qualityNote && (
        <p className="mt-1.5 text-[11px] text-[var(--faint)]">{report.qualityNote}</p>
      )}
    </div>
  );
}
