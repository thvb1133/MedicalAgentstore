import type { Metadata } from "next";

import { SignPageTabs } from "@/components/sign/SignPageTabs";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Sign language — Sanjivani",
  description:
    "A signing avatar with two hands, body placement and facial markers, plus the ASL manual alphabet for names and numbers.",
};

export default function SignPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--foreground)]">
          Sign language
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          Two things, because signing and spelling do different jobs. Signs
          carry meaning through handshape, placement on the body, movement and
          facial expression. Fingerspelling carries the names, drug names and
          numbers that have no sign — which is exactly what it is for in real
          conversation too.
        </p>
        <div className="mt-7">
          <SignPageTabs />
        </div>
      </main>
    </div>
  );
}
