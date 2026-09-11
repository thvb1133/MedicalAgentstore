import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Get started — Sanjivani",
  description:
    "Try it in the browser, run the whole thing locally, or deploy it. What each route gives you and what it costs.",
};

const ROUTES = [
  {
    step: "01",
    title: "Try it, here, now",
    body: "No account, no key, no install. Open an agent and grant the camera. Everything runs on your device, and closing the tab is the whole of the data deletion process.",
    action: { href: "/agents/vitals", label: "Open contactless vitals" },
    cost: "Free · nothing to configure",
  },
  {
    step: "02",
    title: "Run the whole product locally",
    body: "Clone the repository, fetch the vision models once, and start it. Measurement works immediately. Add an Anthropic key for the conversation and AWS credentials for neural speech and cloud history, and the companion agent comes alive.",
    action: {
      href: "https://github.com/thvb1133/MedicalAgentstore#quick-start",
      label: "Quick start",
      external: true,
    },
    cost: "Free · two optional API keys",
  },
  {
    step: "03",
    title: "Publish it",
    body: "A static export needs no server and no keys, which is what the public demonstration is. Deploying to a Next.js host instead — Amplify, for instance — keeps the route handlers, and therefore the conversation, the neural voice and the history mirror.",
    action: {
      href: "https://github.com/thvb1133/MedicalAgentstore#the-public-demonstration",
      label: "Deployment notes",
      external: true,
    },
    cost: "Free static · hosting cost otherwise",
  },
];

const KEYS = [
  ["ANTHROPIC_API_KEY", "Claude — plain-language interpretation and the companion's replies"],
  ["AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION", "Amazon Polly — neural speech"],
  ["SANJIVANI_SESSION_BUCKET", "S3 — measurement history across more than one machine"],
];

export default function GetStartedPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <section className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Get started
          </span>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--foreground)]">
            Three ways in,
            <br />
            <span className="text-[var(--accent)]">and the first one is free.</span>
          </h1>

          <p className="mt-5 text-[15px] leading-relaxed text-[var(--muted)]">
            There is no sales gate in front of the product. The measurement is the part people
            want to evaluate, and it is the part that costs nothing to run, so it is open.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          {ROUTES.map((route) => (
            <div key={route.step} className="panel flex flex-col gap-4 p-6 sm:flex-row">
              <span className="tabular text-[26px] font-semibold leading-none text-[var(--accent)] opacity-50">
                {route.step}
              </span>
              <div className="flex-1">
                <h2 className="text-[16px] font-semibold text-[var(--foreground)]">
                  {route.title}
                </h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
                  {route.body}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {route.action.external ? (
                    <a
                      href={route.action.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                    >
                      {route.action.label}
                    </a>
                  ) : (
                    <Link
                      href={route.action.href}
                      className="rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
                      style={{ background: "var(--accent)", color: "#141414" }}
                    >
                      {route.action.label}
                    </Link>
                  )}
                  <span className="text-[11.5px] text-[var(--faint)]">{route.cost}</span>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="panel p-6">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              What needs a key, and what does not
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              Every measurement works with no credentials at all. Three optional layers sit on
              top of it:
            </p>
            <ul className="mt-4 space-y-3">
              {KEYS.map(([variable, what]) => (
                <li key={variable}>
                  <code className="block break-all rounded bg-[var(--surface-raised)] px-2 py-1 text-[11.5px] text-[var(--foreground)]">
                    {variable}
                  </code>
                  <span className="mt-1 block text-[12px] leading-relaxed text-[var(--muted)]">
                    {what}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-6">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              Talk to somebody
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              There is no contact form here that pretends to reach a sales desk. The honest
              channel is the repository: open an issue, and it goes to the people who wrote the
              code rather than into a queue.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <a
                href="https://github.com/thvb1133/MedicalAgentstore/issues/new"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                Open an issue
              </a>
              <Link
                href="/events"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                Meet in person
              </Link>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-[var(--faint)]">
              Before you commit to anything, read the accuracy page. It lists what has not been
              validated as prominently as what has.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
