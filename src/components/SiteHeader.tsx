import Link from "next/link";

import { ThemeToggle } from "./ThemeToggle";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        {/* A bridge arch over a pulse line: setu (bridge) carrying a vital sign. */}
        <path
          d="M3 22c0-7.2 5.8-13 13-13s13 5.8 13 13"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M2 24h7l2.5-5 3 9 2.5-6 2 2h9"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
          Sanjivani Setu
        </span>
        {/* No letter-spacing here: tracking breaks Devanagari conjunct forms. */}
        <span lang="hi" className="mt-1 text-[11px] leading-none text-[var(--faint)]">
          संजीवनी सेतु
        </span>
      </span>
    </Link>
  );
}

const NAV = [
  { href: "/", label: "Checks" },
  { href: "/appointments", label: "Appointments" },
  { href: "/history", label: "History" },
  { href: "/sign", label: "Fingerspelling" },
];
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--header-bg)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-6">
          <Wordmark />
          <nav className="hidden items-center gap-5 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[12.5px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
