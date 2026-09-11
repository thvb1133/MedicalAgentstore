import type { Metadata } from "next";

import { AppointmentsView } from "@/components/appointments/AppointmentsView";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Appointments — Sanjivani",
  description:
    "Book a time to sit down with a measurement agent, and put it in your own calendar.",
};

export default function AppointmentsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--foreground)]">
          Appointments
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          Set a time to sit down and do a check properly. Measurements are only
          worth comparing when they are taken under similar conditions, and a
          standing time is the simplest way to get that.
        </p>
        <div className="mt-7">
          <AppointmentsView />
        </div>
      </main>
    </div>
  );
}
