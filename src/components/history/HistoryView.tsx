"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCompanionProfile } from "@/hooks/useCompanionProfile";
import { useServices } from "@/hooks/useServices";
import { AGENTS } from "@/lib/agents/registry";
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
      const response = await fetch("/api/interpret", {
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
