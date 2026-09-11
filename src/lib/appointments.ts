/**
 * Appointments with a measurement agent.
 *
 * Be clear about what this is. There is no scheduling server, no email, no
 * SMS. Appointments live in this browser's localStorage, which means they
 * cannot be lost by us and cannot be seen by us, and equally means nobody is
 * going to ring you if you miss one.
 *
 * That limitation is exactly why every appointment can be exported as an
 * `.ics` file. Dropping that into Google Calendar, Outlook or Apple Calendar
 * gives real reminders on a real device, from software built to do it. Faking
 * a notification system we cannot actually deliver on would be worse than
 * being honest and handing the job to a calendar.
 */

/** Minimum notice, so an appointment cannot be booked for a moment ago. */
const MIN_LEAD_MINUTES = 1;

/** A year out. Past this, a reminder in a browser store is a fiction. */
const MAX_LEAD_DAYS = 365;

const DURATIONS = [10, 15, 20, 30, 45, 60] as const;
export type DurationMinutes = (typeof DURATIONS)[number];
export const DURATION_OPTIONS: readonly DurationMinutes[] = DURATIONS;

export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export interface Appointment {
  id: string;
  /** Which agent the session will run. */
  agentSlug: string;
  agentName: string;
  /** ISO 8601, always with an offset so it survives a timezone change. */
  startsAt: string;
  durationMinutes: number;
  /** Why the person booked it, in their words. Optional. */
  reason: string;
  status: AppointmentStatus;
  createdAt: string;
}

export interface AppointmentInput {
  agentSlug: string;
  agentName: string;
  /** Local date, `YYYY-MM-DD`, as produced by an `<input type="date">`. */
  date: string;
  /** Local time, `HH:MM`, as produced by an `<input type="time">`. */
  time: string;
  durationMinutes: number;
  reason?: string;
}

export type CreateResult =
  | { ok: true; appointment: Appointment }
  | { ok: false; error: string };

const STORAGE_KEY = "sanjivani-setu.appointments.v1";

function newId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Combine the date and time fields into an instant.
 *
 * `new Date("2026-03-04T09:30")` with no offset is parsed as local time by
 * every current engine, which is what we want: the person picked 9:30 in the
 * room they are standing in. Appending "Z" here would silently shift every
 * appointment by the timezone offset.
 */
function combine(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function createAppointment(
  input: AppointmentInput,
  now: Date = new Date(),
): CreateResult {
  if (!input.agentSlug || !input.agentName) {
    return { ok: false, error: "Choose which check you would like to book." };
  }
  if (!input.date || !input.time) {
    return { ok: false, error: "Pick a date and a time." };
  }

  const startsAt = combine(input.date, input.time);
  if (!startsAt) return { ok: false, error: "That date and time could not be read." };

  const leadMinutes = (startsAt.getTime() - now.getTime()) / 60000;
  if (leadMinutes < MIN_LEAD_MINUTES) {
    return { ok: false, error: "That time has already passed. Pick a time in the future." };
  }
  if (leadMinutes > MAX_LEAD_DAYS * 24 * 60) {
    return { ok: false, error: "Appointments can only be booked up to a year ahead." };
  }

  if (!DURATIONS.includes(input.durationMinutes as DurationMinutes)) {
    return { ok: false, error: "Choose one of the offered lengths." };
  }

  return {
    ok: true,
    appointment: {
      id: newId(),
      agentSlug: input.agentSlug,
      agentName: input.agentName,
      startsAt: startsAt.toISOString(),
      durationMinutes: input.durationMinutes,
      reason: (input.reason ?? "").slice(0, 300).trim(),
      status: "scheduled",
      createdAt: now.toISOString(),
    },
  };
}

export function endsAt(appointment: Appointment): Date {
  return new Date(
    new Date(appointment.startsAt).getTime() + appointment.durationMinutes * 60000,
  );
}

/**
 * Whether the session can be started now.
 *
 * The window opens ten minutes early, because nobody arrives exactly on time
 * and a "join" button that refuses to work at 9:59 for a nine o'clock
 * appointment is just annoying.
 */
export function isJoinable(appointment: Appointment, now: Date = new Date()): boolean {
  if (appointment.status !== "scheduled") return false;
  const start = new Date(appointment.startsAt).getTime();
  const end = endsAt(appointment).getTime();
  return now.getTime() >= start - 10 * 60000 && now.getTime() <= end;
}

export function isPast(appointment: Appointment, now: Date = new Date()): boolean {
  return endsAt(appointment).getTime() < now.getTime();
}

export function upcoming(list: Appointment[], now: Date = new Date()): Appointment[] {
  return list
    .filter((a) => a.status === "scheduled" && !isPast(a, now))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function history(list: Appointment[], now: Date = new Date()): Appointment[] {
  return list
    .filter((a) => a.status !== "scheduled" || isPast(a, now))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}

/** "Tomorrow at 09:30" where that is clearer than a full date. */
export function describeWhen(appointment: Appointment, now: Date = new Date()): string {
  const start = new Date(appointment.startsAt);
  const time = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(start) - startOfDay(now)) / 86400000);

  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Tomorrow at ${time}`;
  if (days === -1) return `Yesterday at ${time}`;
  if (days > 1 && days < 7) {
    return `${start.toLocaleDateString(undefined, { weekday: "long" })} at ${time}`;
  }
  return `${start.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: start.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })} at ${time}`;
}

/** RFC 5545 wants text escaped and UTC stamps with no punctuation. */
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * A calendar file for one appointment.
 *
 * Includes a 15-minute alarm, which is the whole point: this is how the
 * person actually gets reminded, since we have no way to contact them.
 */
export function toIcs(appointment: Appointment, origin = ""): string {
  const start = new Date(appointment.startsAt);
  const url = origin ? `${origin}/agents/${appointment.agentSlug}` : "";

  const description = [
    `A ${appointment.agentName} session with Sanjivani.`,
    appointment.reason ? `Reason: ${appointment.reason}` : "",
    url ? `Open: ${url}` : "",
    "This is a wellness measurement, not a medical appointment.",
  ]
    .filter(Boolean)
    .join("\n");

  // CRLF endings are required by the spec, and some calendar clients are
  // strict enough to reject the file without them.
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sanjivani//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@sanjivani`,
    `DTSTAMP:${icsStamp(new Date(appointment.createdAt))}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(endsAt(appointment))}`,
    `SUMMARY:${icsEscape(`${appointment.agentName} — Sanjivani`)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    url ? `URL:${url}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`${appointment.agentName} in 15 minutes`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function isAppointment(value: unknown): value is Appointment {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Partial<Appointment>;
  return (
    typeof a.id === "string" &&
    typeof a.agentSlug === "string" &&
    typeof a.startsAt === "string" &&
    !Number.isNaN(new Date(a.startsAt).getTime()) &&
    typeof a.durationMinutes === "number"
  );
}

export function parseAppointments(raw: unknown): Appointment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isAppointment);
}

export function loadAppointments(): Appointment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseAppointments(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveAppointments(list: Appointment[]): Appointment[] {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Storage unavailable; the list still works for this session.
    }
  }
  return list;
}
