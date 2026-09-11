import { describe, expect, it } from "vitest";

import {
  createAppointment,
  describeWhen,
  endsAt,
  history,
  isJoinable,
  isPast,
  parseAppointments,
  toIcs,
  upcoming,
  type Appointment,
} from "@/lib/appointments";

const NOW = new Date("2026-03-04T09:00:00Z");

function make(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "abc123",
    agentSlug: "companion",
    agentName: "Live Wellness Companion",
    startsAt: "2026-03-04T10:00:00Z",
    durationMinutes: 20,
    reason: "Weekly check",
    status: "scheduled",
    createdAt: "2026-03-01T12:00:00Z",
    ...over,
  };
}

describe("booking", () => {
  it("creates an appointment from date and time fields", () => {
    const result = createAppointment(
      {
        agentSlug: "vitals",
        agentName: "Contactless Vitals",
        date: "2026-03-05",
        time: "14:30",
        durationMinutes: 15,
        reason: "Follow up",
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appointment.agentSlug).toBe("vitals");
    expect(result.appointment.durationMinutes).toBe(15);
    expect(result.appointment.status).toBe("scheduled");
  });

  it("treats the chosen time as local, not UTC", () => {
    // Someone picking 14:30 means half past two where they are standing.
    // Appending a Z would shift every booking by the timezone offset.
    const result = createAppointment(
      {
        agentSlug: "vitals",
        agentName: "Contactless Vitals",
        date: "2026-03-05",
        time: "14:30",
        durationMinutes: 15,
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const start = new Date(result.appointment.startsAt);
    expect(start.getHours()).toBe(14);
    expect(start.getMinutes()).toBe(30);
  });

  it("refuses a time in the past", () => {
    const result = createAppointment(
      {
        agentSlug: "vitals",
        agentName: "Contactless Vitals",
        date: "2026-03-03",
        time: "09:00",
        durationMinutes: 15,
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already passed/i);
  });

  it("refuses a time more than a year ahead", () => {
    const result = createAppointment(
      {
        agentSlug: "vitals",
        agentName: "Contactless Vitals",
        date: "2028-03-05",
        time: "14:30",
        durationMinutes: 15,
      },
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a duration that is not offered", () => {
    const result = createAppointment(
      {
        agentSlug: "vitals",
        agentName: "Contactless Vitals",
        date: "2026-03-05",
        time: "14:30",
        durationMinutes: 7,
      },
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it("requires a date and a time", () => {
    const result = createAppointment(
      { agentSlug: "vitals", agentName: "Vitals", date: "", time: "", durationMinutes: 15 },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/date and a time/i);
  });

  it("caps an over-long reason rather than rejecting it", () => {
    const result = createAppointment(
      {
        agentSlug: "vitals",
        agentName: "Vitals",
        date: "2026-03-05",
        time: "14:30",
        durationMinutes: 15,
        reason: "x".repeat(1000),
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appointment.reason.length).toBe(300);
  });
});

describe("timing", () => {
  it("computes the end from the duration", () => {
    expect(endsAt(make()).toISOString()).toBe("2026-03-04T10:20:00.000Z");
  });

  it("opens the join window ten minutes early", () => {
    const appointment = make();
    expect(isJoinable(appointment, new Date("2026-03-04T09:45:00Z"))).toBe(false);
    expect(isJoinable(appointment, new Date("2026-03-04T09:51:00Z"))).toBe(true);
    expect(isJoinable(appointment, new Date("2026-03-04T10:15:00Z"))).toBe(true);
    expect(isJoinable(appointment, new Date("2026-03-04T10:21:00Z"))).toBe(false);
  });

  it("will not let a cancelled appointment be joined", () => {
    const cancelled = make({ status: "cancelled" });
    expect(isJoinable(cancelled, new Date("2026-03-04T10:05:00Z"))).toBe(false);
  });

  it("knows when an appointment is over", () => {
    expect(isPast(make(), new Date("2026-03-04T10:19:00Z"))).toBe(false);
    expect(isPast(make(), new Date("2026-03-04T10:21:00Z"))).toBe(true);
  });
});

describe("lists", () => {
  const list = [
    make({ id: "later", startsAt: "2026-03-06T10:00:00Z" }),
    make({ id: "sooner", startsAt: "2026-03-04T11:00:00Z" }),
    make({ id: "done", startsAt: "2026-03-01T10:00:00Z" }),
    make({ id: "cancelled", startsAt: "2026-03-07T10:00:00Z", status: "cancelled" }),
  ];

  it("orders upcoming appointments soonest first", () => {
    expect(upcoming(list, NOW).map((a) => a.id)).toEqual(["sooner", "later"]);
  });

  it("keeps cancelled appointments out of upcoming", () => {
    expect(upcoming(list, NOW).some((a) => a.id === "cancelled")).toBe(false);
  });

  it("puts past and cancelled ones in history, newest first", () => {
    expect(history(list, NOW).map((a) => a.id)).toEqual(["cancelled", "done"]);
  });
});

describe("describeWhen", () => {
  it("says today and tomorrow rather than a date", () => {
    expect(describeWhen(make({ startsAt: "2026-03-04T15:00:00Z" }), NOW)).toMatch(/^Today at/);
    expect(describeWhen(make({ startsAt: "2026-03-05T15:00:00Z" }), NOW)).toMatch(
      /^Tomorrow at/,
    );
  });

  it("names the weekday within the coming week", () => {
    const text = describeWhen(make({ startsAt: "2026-03-07T15:00:00Z" }), NOW);
    expect(text).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at/);
  });

  it("falls back to a date further out", () => {
    const text = describeWhen(make({ startsAt: "2026-05-20T15:00:00Z" }), NOW);
    expect(text).toMatch(/\d/);
    expect(text).not.toMatch(/^Today|^Tomorrow/);
  });
});

describe("calendar export", () => {
  const ics = toIcs(make({ reason: "Check; compare, please" }), "https://example.com");

  it("produces a well-formed VCALENDAR with CRLF endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("carries the start, end and a stable identifier", () => {
    expect(ics).toContain("DTSTART:20260304T100000Z");
    expect(ics).toContain("DTEND:20260304T102000Z");
    expect(ics).toContain("UID:abc123@sanjivani");
  });

  it("includes a reminder, since we cannot send one ourselves", () => {
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT15M");
  });

  it("escapes the characters that would otherwise break the file", () => {
    // Semicolons and commas are field separators in RFC 5545; unescaped, they
    // silently truncate the description in most calendar clients.
    expect(ics).toContain("Check\\; compare\\, please");
  });

  it("states that this is not a medical appointment", () => {
    expect(ics).toMatch(/not a medical appointment/i);
  });
});

describe("stored data", () => {
  it("discards entries that are not appointments", () => {
    const parsed = parseAppointments([
      make(),
      null,
      "nonsense",
      { id: "x" },
      { ...make(), startsAt: "not-a-date" },
    ]);
    expect(parsed).toHaveLength(1);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(parseAppointments(null)).toEqual([]);
    expect(parseAppointments({ a: 1 })).toEqual([]);
  });
});
