import Link from "next/link";

import { AgentIcon } from "@/components/AgentIcon";
import { SiteHeader } from "@/components/SiteHeader";
import type { AgentDefinition } from "@/lib/agents/registry";

/** Common chrome for every agent page: header, title block and evidence note. */
export function AgentShell({
  agent,
  children,
}: {
  agent: AgentDefinition;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <SiteHeader>
        <Link
          href="/"
          className="text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          ← All agents
        </Link>
      </SiteHeader>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${agent.accent}1a`, color: agent.accent }}
          >
            <AgentIcon name={agent.icon} className="h-5.5 w-5.5" />
          </span>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--foreground)]">
              {agent.name}
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
              {agent.summary}
            </p>
          </div>
        </div>

        <div className="mt-7">{children}</div>

        <details className="panel mt-6 p-4">
          <summary className="cursor-pointer text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">
            How this measurement works, and where it fails
          </summary>
          <div className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
            <p>
              <span className="font-medium text-[var(--foreground)]">Method. </span>
              {agent.evidence}
            </p>
            <p>
              <span className="font-medium text-[var(--foreground)]">Limits. </span>
              {agent.limits}
            </p>
            <p className="text-[var(--faint)]">
              All processing runs in your browser. No video frame is uploaded or
              stored anywhere.
            </p>
          </div>
        </details>
      </main>
    </div>
  );
}
