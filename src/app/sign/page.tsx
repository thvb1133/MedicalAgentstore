import type { Metadata } from "next";

import { SignStudio } from "@/components/sign/SignStudio";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Fingerspelling — Sanjivani Setu",
  description:
    "The ASL manual alphabet, drawn from a posed hand model. Type anything and watch it spelled.",
};

export default function SignPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--foreground)]">
          Fingerspelling
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          The ASL manual alphabet and the digits, posed from a hand model
          rather than drawn as pictures, so the hand moves between shapes the
          way a hand does. Type anything below and watch it spelled.
        </p>
        <div className="mt-7">
          <SignStudio />
        </div>
      </main>
    </div>
  );
}
