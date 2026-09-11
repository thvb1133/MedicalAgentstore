import type { Metadata } from "next";

import { HistoryView } from "@/components/history/HistoryView";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "History — Sanjivani",
  description:
    "Every measurement you have taken, the trend across them, and what Claude makes of it.",
};

export default function HistoryPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--foreground)]">
          Your history
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          A single webcam heart rate is a curiosity. The same measurement taken
          repeatedly, compared against your own earlier readings, is the part
          that could actually tell you something — and comparing you to
          yourself is far safer ground than comparing you to a population.
        </p>
        <div className="mt-7">
          <HistoryView />
        </div>
      </main>
    </div>
  );
}
