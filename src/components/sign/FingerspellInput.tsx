"use client";

/**
 * Spelling to the camera.
 *
 * This runs on the same video element the vitals are being read from. That is
 * the whole point of it being here rather than on its own page: a person
 * signing to the assistant is already sitting still in front of a lit camera,
 * which is exactly the condition a pulse measurement needs. One camera pass,
 * two jobs.
 *
 * It is switched off by default because it is the one feature that adds a
 * second landmark model to the frame loop, and on a modest laptop that is
 * real work taken away from the measurement.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useHandTracking, type HandFrame } from "@/hooks/useHandTracking";
import {
  FingerspellReader,
  UNSUPPORTED_LETTERS,
  type SpellState,
} from "@/lib/sign/recognise";

const IDLE: SpellState = {
  text: "",
  candidate: null,
  progress: 0,
  confidence: 0,
  runnerUp: null,
  prompt: "Show your hand to the camera",
};

export function FingerspellInput({
  videoRef,
  enabled,
  accent = "var(--accent)",
  onSend,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  accent?: string;
  onSend: (text: string) => void;
}) {
  const readerRef = useRef(new FingerspellReader());
  const paintedAt = useRef(0);
  const [state, setState] = useState<SpellState>(IDLE);

  const handleFrame = useCallback((frame: HandFrame) => {
    const next = readerRef.current.push({
      timestampMs: frame.timestampMs,
      landmarks: frame.hands[0]?.landmarks ?? null,
    });
    // The dwell ring only needs to move at reading speed.
    if (next.text === state.text && frame.timestampMs - paintedAt.current < 80) return;
    paintedAt.current = frame.timestampMs;
    setState(next);
    // A held shape is the only thing that changes the text, and every one of
    // them is worth a repaint.
  }, [state.text]);

  const tracking = useHandTracking(videoRef, enabled, handleFrame);

  useEffect(() => {
    if (!enabled) {
      readerRef.current.reset();
      setState(IDLE);
    }
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="panel p-4" data-testid="fingerspell-input">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Spell to the camera
        </span>
        <span className="tabular text-[10.5px] text-[var(--faint)]">
          {tracking.status === "running"
            ? `${tracking.handsVisible} hand${tracking.handsVisible === 1 ? "" : "s"} · ${tracking.fps.toFixed(0)} fps`
            : tracking.status}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius)] border"
          style={{ borderColor: state.candidate ? accent : "var(--border)" }}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-b-[var(--radius)] transition-[height] duration-100"
            style={{ height: `${state.progress * 100}%`, background: accent, opacity: 0.2 }}
          />
          <span className="relative text-[28px] font-semibold text-[var(--foreground)]">
            {state.candidate ?? "—"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="tabular truncate text-[18px] tracking-[0.12em] text-[var(--foreground)]"
            data-testid="spelled-text"
          >
            {state.text || <span className="text-[var(--faint)]">…</span>}
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--muted)]">{state.prompt}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            onClick={() => {
              const text = readerRef.current.take();
              setState(IDLE);
              if (text) onSend(text);
            }}
            disabled={!state.text.trim()}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-30"
            style={{ background: accent, color: "#141414" }}
          >
            Send
          </button>
          <button
            onClick={() => {
              readerRef.current.reset();
              setState(IDLE);
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted)]"
          >
            Clear
          </button>
        </div>
      </div>

      {tracking.error && (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--bad)" }}>
          {tracking.error}
        </p>
      )}

      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <p className="text-[10.5px] leading-relaxed text-[var(--faint)]">
          This reads the manual alphabet, which is a small borrowed corner of
          sign language used for names and unfamiliar words — it is not
          understanding signing, and it should not be described as if it were.
          Hold each shape for about three quarters of a second; take your hand
          out of frame to end a word.
        </p>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--faint)]">
          Not attempted:{" "}
          {UNSUPPORTED_LETTERS.map((u) => `${u.letters} — ${u.reason}`).join("; ")}.
        </p>
      </div>
    </div>
  );
}
