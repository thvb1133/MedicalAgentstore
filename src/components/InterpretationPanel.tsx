"use client";

import { useCallback, useRef, useState } from "react";

import { useServices } from "@/hooks/useServices";
import type { MeasurementReport } from "@/lib/report";
import { api, NO_SERVER } from "@/lib/paths";

export interface InterpretationPanelProps {
  /** Null until a measurement has produced something worth interpreting. */
  report: MeasurementReport | null;
  /** Blocks the request when the signal is not good enough to discuss. */
  ready: boolean;
}

/**
 * Claude's plain-language reading of the measurement, with Polly reading it
 * aloud.
 *
 * The interpretation is opt-in rather than automatic. Firing a language model
 * at every measurement update would be expensive, and more importantly it
 * would encourage treating a live number as something to be explained rather
 * than something still settling.
 */
export function InterpretationPanel({ report, ready }: InterpretationPanelProps) {
  const { services } = useServices();
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (userQuestion?: string) => {
      if (!report) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState("streaming");
      setText("");
      setError(null);

      try {
        const interpretUrl = api("/api/interpret");
        if (!interpretUrl) throw new Error(NO_SERVER);
        const res = await fetch(interpretUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report, question: userQuestion }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const detail = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(detail.error ?? "Request failed");
        }
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setText(acc);
        }
        setState("done");
      } catch (err) {
        if (controller.signal.aborted) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Interpretation failed.");
      }
    },
    [report],
  );

  const speak = useCallback(async () => {
    if (!text) return;
    setSpeaking(true);
    try {
      const speakUrl = api("/api/speak");
      if (!speakUrl) throw new Error(NO_SERVER);
      const res = await fetch(speakUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Speech request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }, [text]);

  if (!services.claude) {
    return (
      <div className="panel p-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Interpretation
        </div>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
          Claude is not configured, so plain-language interpretation is off. The
          measurements above are unaffected — every agent runs entirely in your
          browser and needs no keys.
        </p>
        <p className="mt-2 text-[11px] text-[var(--faint)]">
          Set <code className="tabular">ANTHROPIC_API_KEY</code> to turn this on.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Interpretation
        </div>
        {state === "done" && services.polly && (
          <button
            onClick={speak}
            disabled={speaking}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition-colors enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--foreground)] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5" aria-hidden>
              <path d="M11 5 6 9H3v6h3l5 4z" strokeLinejoin="round" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
            </svg>
            {speaking ? "Speaking" : "Read aloud"}
          </button>
        )}
      </div>

      {state === "idle" && (
        <>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
            Claude can explain what these numbers mean in plain language, and
            say clearly where they should not be relied on.
          </p>
          <button
            onClick={() => run()}
            disabled={!ready || !report}
            className="mt-3.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12px] font-semibold text-[#141414] transition-colors enabled:hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Explain my measurement
          </button>
          {!ready && (
            <p className="mt-2 text-[11px] text-[var(--faint)]">
              Available once the measurement has enough clean signal.
            </p>
          )}
        </>
      )}

      {state === "streaming" && text === "" && (
        <div className="mt-4 space-y-2">
          {[100, 92, 78].map((w) => (
            <div key={w} className="shimmer h-2.5 rounded bg-[var(--track)]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {text && (
        <div className="mt-3 space-y-3 text-[13px] leading-relaxed text-[var(--foreground)]">
          {text.split(/\n\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          {state === "streaming" && (
            <span className="inline-block h-3.5 w-1.5 animate-pulse bg-[var(--accent)] align-middle" />
          )}
        </div>
      )}

      {state === "error" && (
        <p className="mt-3 text-[12px] text-[var(--bad)]">{error}</p>
      )}

      {(state === "done" || state === "error") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!question.trim()) return;
            run(question.trim());
            setQuestion("");
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a follow-up…"
            maxLength={500}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12.5px] text-[var(--foreground)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--foreground)]"
          >
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
