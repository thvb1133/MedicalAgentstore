import Link from "next/link";

const COLUMNS: { heading: string; links: { href: string; label: string; external?: boolean }[] }[] =
  [
    {
      heading: "Measure",
      links: [
        { href: "/", label: "All agents" },
        { href: "/agents/vitals", label: "Contactless vitals" },
        { href: "/agents/companion", label: "Live companion" },
        { href: "/sign", label: "Sign language" },
        { href: "/history", label: "Your history" },
      ],
    },
    {
      heading: "Company",
      links: [
        { href: "/platform", label: "Platform" },
        { href: "/evidence", label: "Accuracy and evidence" },
        { href: "/events", label: "Events" },
        { href: "/get-started", label: "Get started" },
      ],
    },
    {
      heading: "Build on it",
      links: [
        {
          href: "https://github.com/thvb1133/MedicalAgentstore",
          label: "Source code",
          external: true,
        },
        {
          href: "https://github.com/thvb1133/MedicalAgentstore#how-the-pulse-is-actually-extracted",
          label: "How the pulse is extracted",
          external: true,
        },
        {
          href: "https://github.com/thvb1133/MedicalAgentstore/issues",
          label: "Report a problem",
          external: true,
        },
      ],
    },
  ];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface-raised)]">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <p className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
              Sanjivani Setu
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
              Physiological measurement from an ordinary camera, computed on the device and
              reported with its own uncertainty attached.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
                {column.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12.5px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[12.5px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/*
          The regulatory line belongs on every page of a site that measures
          people, and a footer is the one component that is on every page.
          Stating what we are *not* registered as is the part competitors
          leave out, and it is the part somebody buying this has to know.
        */}
        <div className="mt-10 border-t border-[var(--border)] pt-6">
          <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
            <span className="font-medium text-[var(--muted)]">Not a medical device.</span>{" "}
            Sanjivani Setu produces wellness and research estimates. It does not diagnose, treat
            or rule out any condition, and it holds no CE mark, FDA clearance or other medical
            device registration. Blood pressure is shown only after calibration against a real
            arm cuff. If you feel unwell, contact a clinician.
          </p>
        </div>
      </div>
    </footer>
  );
}
