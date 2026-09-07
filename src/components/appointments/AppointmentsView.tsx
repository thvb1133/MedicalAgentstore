"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AgentIcon } from "@/components/AgentIcon";
import { AGENTS } from "@/lib/agents/registry";
import {
  createAppointment,
  describeWhen,
  DURATION_OPTIONS,
  history,
  isJoinable,
  loadAppointments,
  saveAppointments,
  toIcs,
  upcoming,
  type Appointment,
} from "@/lib/appointments";

/**
 * Booking and reviewing appointments.
 *
 * The one thing this interface must not do is imply that somebody is expecting
 * you. There is no clinic behind it and no reminder will be sent, so the copy
 * says so plainly and the calendar export is given equal prominence to the
 * booking itself — the export is the part that actually produces a reminder,
 * on a device and in software built to deliver one.
 */

const BOOKABLE = AGENTS.filter((a) => a.status !== "planned");

/** `YYYY-MM-DD` in the local timezone, which is what a date input expects. */
function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AppointmentsView() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [agentSlug, setAgentSlug] = useState(BOOKABLE[0]?.slug ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState<number>(20);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justBooked, setJustBooked] = useState<string | null>(null);

  // Everything here is time-relative, and localStorage is not readable during
  // the server render, so the first paint has to be the empty state.
  useEffect(() => {
    setAppointments(loadAppointments());
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    soon.setMinutes(0, 0, 0);
    setDate(localDate(soon));
    setTime(localTime(soon));
  }, []);

  const now = new Date();
  const next = useMemo(() => upcoming(appointments), [appointments]);
  const past = useMemo(() => history(appointments), [appointments]);
  const agent = BOOKABLE.find((a) => a.slug === agentSlug) ?? BOOKABLE[0];

  const book = () => {
    setError(null);
    const result = createAppointment({
      agentSlug: agent.slug,
      agentName: agent.name,
      date,
      time,
      durationMinutes: duration,
      reason,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAppointments(saveAppointments([...appointments, result.appointment]));
    setReason("");
    setJustBooked(result.appointment.id);
  };

  const cancel = (id: string) => {
    setAppointments(
      saveAppointments(
        appointments.map((a) => (a.id === id ? { ...a, status: "cancelled" as const } : a)),
      ),
    );
  };

  const download = (appointment: Appointment) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const blob = new Blob([toIcs(appointment, origin)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sanjivani-setu-${appointment.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
            Coming up
          </h2>
          <div className="mt-3 space-y-3">
            {next.length === 0 && (
              <div className="panel px-5 py-8 text-center">
                <p className="text-[13px] text-[var(--muted)]">
                  Nothing booked. Set a time on the right, or just{" "}
                  <Link href="/agents/companion" className="underline underline-offset-2">
                    start a session now
                  </Link>
                  .
                </p>
              </div>
            )}
            {next.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                now={now}
                highlight={appointment.id === justBooked}
                onCancel={() => cancel(appointment.id)}
                onExport={() => download(appointment)}
              />
            ))}
          </div>
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              Earlier
            </h2>
            <div className="mt-3 space-y-2">
              {past.slice(0, 8).map((appointment) => (
                <div
                  key={appointment.id}
                  className="panel flex items-center justify-between gap-3 px-4 py-3 opacity-70"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-[var(--foreground)]">
                      {appointment.agentName}
                    </div>
                    <div className="text-[11.5px] text-[var(--faint)]">
                      {describeWhen(appointment, now)}
                      {appointment.status === "cancelled" ? " · cancelled" : ""}
                    </div>
                  </div>
                  <Link
                    href={`/agents/${appointment.agentSlug}`}
                    className="shrink-0 text-[12px] text-[var(--muted)] underline-offset-2 hover:underline"
                  >
                    Run it now
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="space-y-4">
        <div className="panel p-5">
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
            Book a time
          </h2>

          <label className="mt-4 block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              Which check
            </span>
            <div className="mt-2 space-y-1.5">
              {BOOKABLE.map((option) => {
                const selected = option.slug === agent.slug;
                return (
                  <button
                    key={option.slug}
                    onClick={() => setAgentSlug(option.slug)}
                    aria-pressed={selected}
                    className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors"
                    style={{
                      borderColor: selected ? option.accent : "var(--border)",
                      background: selected ? `${option.accent}12` : "var(--surface-raised)",
                    }}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${option.accent}1a`, color: option.accent }}
                    >
                      <AgentIcon name={option.icon} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-[var(--foreground)]">
                        {option.name}
                      </span>
                      <span className="block text-[11px] text-[var(--faint)]">
                        about {Math.round(option.durationSeconds / 60) || 1} min
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </label>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
                Date
              </span>
              <input
                type="date"
                value={date}
                min={localDate(new Date())}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
                Time
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
              />
            </label>
          </div>

          <div className="mt-4">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              How long
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DURATION_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  onClick={() => setDuration(minutes)}
                  aria-pressed={duration === minutes}
                  className="rounded-lg border px-2.5 py-1 text-[12px] transition-colors"
                  style={{
                    borderColor: duration === minutes ? agent.accent : "var(--border)",
                    color: duration === minutes ? agent.accent : "var(--muted)",
                    background:
                      duration === minutes ? `${agent.accent}14` : "var(--surface-raised)",
                  }}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          <label className="mt-4 block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              What is it for
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Optional — for your own notes"
              className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--border-strong)]"
            />
          </label>

          {error && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--bad)" }}>
              {error}
            </p>
          )}

          <button
            onClick={book}
            className="mt-4 w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: agent.accent, color: "#141414" }}
          >
            Book it
          </button>
        </div>

        <div className="panel p-4">
          <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">
              Nobody is expecting you.{" "}
            </span>
            These are reminders to yourself, kept in this browser. There is no
            clinic behind them and no message will be sent — which is why every
            appointment can be exported to your own calendar, where a reminder
            will actually reach you.
          </p>
        </div>
      </div>
    </div>
  );
}

function AppointmentCard({
  appointment,
  now,
  highlight,
  onCancel,
  onExport,
}: {
  appointment: Appointment;
  now: Date;
  highlight: boolean;
  onCancel: () => void;
  onExport: () => void;
}) {
  const agent = AGENTS.find((a) => a.slug === appointment.agentSlug);
  const accent = agent?.accent ?? "var(--accent)";
  const joinable = isJoinable(appointment, now);

  return (
    <article
      className="panel relative overflow-hidden p-4 transition-colors"
      style={{ borderColor: highlight || joinable ? accent : undefined }}
    >
      <span
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ background: joinable ? accent : "transparent" }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {agent && (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${accent}1a`, color: accent }}
              >
                <AgentIcon name={agent.icon} className="h-3.5 w-3.5" />
              </span>
            )}
            <h3 className="truncate text-[14px] font-semibold text-[var(--foreground)]">
              {appointment.agentName}
            </h3>
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--muted)]">
            {describeWhen(appointment, now)} · {appointment.durationMinutes} min
          </p>
          {appointment.reason && (
            <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[var(--faint)]">
              {appointment.reason}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/agents/${appointment.agentSlug}`}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-opacity hover:opacity-90"
            style={
              joinable
                ? { background: accent, color: "#141414" }
                : {
                    border: "1px solid var(--border)",
                    color: "var(--muted)",
                    background: "var(--surface-raised)",
                  }
            }
          >
            {joinable ? "Start now" : "Open"}
          </Link>
          <button
            onClick={onExport}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Add to calendar
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg px-2 py-1.5 text-[12px] text-[var(--faint)] transition-colors hover:text-[var(--bad)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </article>
  );
}
