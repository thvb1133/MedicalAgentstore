"use client";

import type { ConversationStatus } from "@/hooks/useConversation";
import type { CaptionMode } from "@/lib/avatar/profile";

/**
 * Captions for the spoken reply.
 *
 * For a Deaf or hard-of-hearing user this is not a convenience, it is the
 * entire output of the system, so it gets treated as a primary surface rather
 * than a strip along the bottom: high contrast, a generous line height, and a
 * width capped near 60 characters because long measures are exactly what makes
 * a wall of text hard to read.
 *
 * It also carries the state that a hearing user gets from the audio itself —
 * that the assistant is thinking, or has finished. Without that, silence is
 * ambiguous between "working" and "broken".
 */
export function CaptionBar({
  mode,
  status,
  speakerName,
  text,
  accent,
}: {
  mode: CaptionMode;
  status: ConversationStatus;
  speakerName: string;
  /** The reply being spoken, or the most recent one. */
  text: string;
  accent: string;
}) {
  if (mode === "off") return null;

  const large = mode === "large";
  const thinking = status === "thinking";

  return (
    <div
      className="panel px-5 py-4"
      // Announced politely so a screen reader is not interrupted mid-sentence
      // by each streamed token.
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: status === "speaking" || thinking ? accent : "var(--faint)",
          }}
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          {speakerName}
          {thinking ? " is thinking" : status === "speaking" ? " is speaking" : ""}
        </span>
      </div>

      <p
        className={`mt-2 max-w-[60ch] font-medium text-[var(--foreground)] ${
          large ? "text-[22px] leading-[1.5]" : "text-[15px] leading-[1.65]"
        }`}
      >
        {text ? (
          text
        ) : thinking ? (
          <span className="text-[var(--muted)]">Working on a reply…</span>
        ) : (
          <span className="text-[var(--muted)]">
            Captions of everything said will appear here.
          </span>
        )}
      </p>
    </div>
  );
}
