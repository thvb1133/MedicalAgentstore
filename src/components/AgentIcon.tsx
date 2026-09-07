import type { AgentIcon as IconName } from "@/lib/agents/registry";

const PATHS: Record<IconName, React.ReactNode> = {
  heart: (
    <path d="M12 20.3 4.6 13a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6A4.8 4.8 0 0 1 19.4 13Z" />
  ),
  eye: (
    <>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  hand: (
    <>
      <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.7a6 6 0 0 1-4.6-2.2L5 17" />
      <path d="M8 12v3l-2-1.6a1.6 1.6 0 0 0-2.2 2.3" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10h.01M15 10h.01" />
      <path d="M8.5 15c1 .9 2.2 1.3 3.5 1.3s2.5-.4 3.5-1.3" />
    </>
  ),
  strip: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 9h8M8 13h8" />
    </>
  ),
  dish: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9.5" cy="10" r="1.4" />
      <circle cx="14.5" cy="13" r="1.8" />
      <circle cx="10" cy="15" r="1" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20c0-8 6-14 16-14 0 10-6 14-16 14Z" />
      <path d="M4 20 14 10" />
    </>
  ),
  waveform: (
    <>
      <path d="M3 12h2.5l2-6 3 13 3-9.5 2 4.5H21" />
    </>
  ),
};

export function AgentIcon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
