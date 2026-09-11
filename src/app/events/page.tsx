import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { EVENTS, formatRange, upcoming, type CompanyEvent } from "@/lib/company/events";

export const metadata: Metadata = {
  title: "Events — Sanjivani",
  description:
    "Where to meet Sanjivani in person, and how to arrange a demonstration when there is no event nearby.",
};

const PRESENCE_LABEL: Record<CompanyEvent["presence"], string> = {
  exhibiting: "Exhibiting",
  speaking: "Speaking",
  attending: "Attending",
};

function EventCard({ event }: { event: CompanyEvent }) {
  return (
    <article className="panel flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--accent)]">
            {PRESENCE_LABEL[event.presence]}
          </span>
          <span className="tabular text-[12px] text-[var(--faint)]">{formatRange(event)}</span>
          <span className="text-[12px] text-[var(--faint)]">
            {event.city}, {event.country}
          </span>
        </div>
        <h2 className="mt-2 text-[17px] font-semibold text-[var(--foreground)]">{event.name}</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          {event.note}
        </p>
      </div>

      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          Event details
        </a>
      )}
    </article>
  );
}

export default function EventsPage() {
  const events = upcoming(EVENTS);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <section className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Events
          </span>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--foreground)]">
            Meet us in person.
          </h1>

          <p className="mt-5 text-[15px] leading-relaxed text-[var(--muted)]">
            A camera measurement is a thing to try rather than read about. Thirty seconds in
            front of a laptop tells you more about whether this works than any slide can.
          </p>
        </section>

        <section className="mt-10">
          {events.length > 0 ? (
            <div className="space-y-4">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            /*
              An empty events page is a small embarrassment. Listing a
              conference nobody is attending is a lie that gets found out by
              somebody walking to a stand that does not exist, which is worse.
            */
            <div className="panel p-8 text-center">
              <p className="text-[15px] font-medium text-[var(--foreground)]">
                Nothing booked yet.
              </p>
              <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-[var(--muted)]">
                When Sanjivani is at a conference, it will be listed here with the dates,
                the city and whether we are exhibiting, speaking or simply attending. Nothing
                will be listed that we are not actually going to.
              </p>
              <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-[var(--muted)]">
                In the meantime the demonstration needs no appointment: it runs in your browser
                on the device you are reading this on.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <Link
                  href="/agents/vitals"
                  className="rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
                  style={{ background: "var(--accent)", color: "#141414" }}
                >
                  Try it now
                </Link>
                <Link
                  href="/get-started"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                >
                  Arrange a demonstration
                </Link>
              </div>
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="panel p-6">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              Booking a session instead
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              The appointments page holds a time in your own calendar and exports it as a
              standard <code className="text-[12px]">.ics</code> file with a reminder. It is
              local to your browser — there is no scheduling server here and nobody is notified,
              which the page says plainly rather than pretending otherwise.
            </p>
            <Link
              href="/appointments"
              className="mt-4 inline-block rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              Book a time
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
