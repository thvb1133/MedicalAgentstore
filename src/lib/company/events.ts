/**
 * Where Sanjivani Setu will be in person.
 *
 * Deliberately empty until something is booked. An events page that lists a
 * conference nobody from here is attending is the cheapest possible lie and
 * the easiest to catch — somebody turns up at the stand and there is no
 * stand. Adding a real one is a single entry below.
 */

export interface CompanyEvent {
  /** Stable slug, used in the URL and as the React key. */
  id: string;
  name: string;
  /** ISO date of the first day. */
  date: string;
  /** ISO date of the last day, when it runs longer than one. */
  endDate?: string;
  city: string;
  country: string;
  /** One sentence on why we are there and who should find us. */
  note: string;
  /** The organiser's page, not ours. */
  url?: string;
  /** What we are doing there, as plainly as it can be put. */
  presence: "exhibiting" | "speaking" | "attending";
}

export const EVENTS: CompanyEvent[] = [];

export function upcoming(events: CompanyEvent[], now: number = Date.now()): CompanyEvent[] {
  const day = 86_400_000;
  return events
    .filter((event) => {
      const end = new Date(event.endDate ?? event.date).getTime();
      // Still listed on the day itself, which is when somebody is most likely
      // to be looking the page up.
      return Number.isFinite(end) && end + day >= now;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function formatRange(event: CompanyEvent): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  const start = new Date(event.date);
  if (!event.endDate) return start.toLocaleDateString("en-GB", opts);

  const end = new Date(event.endDate);
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.toLocaleDateString("en-GB", opts)}`;
  }
  return `${start.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} – ${end.toLocaleDateString("en-GB", opts)}`;
}
