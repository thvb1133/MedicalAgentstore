import Link from "next/link";

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
        <span className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">
          संजीवनी सेतु
        </span>
      </span>
    </Link>
  );
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[#07090dcc] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Wordmark />
        <div className="flex items-center gap-3">{children}</div>
      </div>
    </header>
  );
}
