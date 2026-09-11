"use client";

/**
 * The switch board: answers you can give with your eyes alone.
 *
 * Deliberately large, deliberately few. A switch interface with twenty
 * choices on it is unusable at a scan rate slow enough to be reliable, so the
 * board holds six things a person actually needs to say and everything else
 * goes through typing or speech.
 */

import type { SwitchMode, SwitchOption, SwitchState } from "@/lib/access/switch";

export function SwitchBoard({
  options,
  state,
  mode,
  onModeChange,
  accent = "var(--accent)",
}: {
  options: SwitchOption[];
  state: SwitchState;
  mode: SwitchMode;
  onModeChange: (mode: SwitchMode) => void;
  accent?: string;
}) {
  return (
    <div className="panel p-4" data-testid="switch-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Answer with your eyes
        </span>
        <div className="flex gap-1.5">
          {(["scan", "gaze"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className="rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors"
              style={{
                borderColor: m === mode ? accent : "var(--border)",
                color: m === mode ? "var(--foreground)" : "var(--muted)",
              }}
            >
              {m === "scan" ? "Scanning" : "Look and hold"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {options.map((option, i) => {
          const focused = state.focus === i && state.ready;
          return (
            <div
              key={option.id}
              data-focused={focused ? "true" : "false"}
              className="relative overflow-hidden rounded-[var(--radius)] border px-3 py-4 text-center transition-colors"
              style={{
                borderColor: focused ? accent : "var(--border)",
                background: focused ? `${accent}18` : "var(--surface-raised)",
              }}
            >
              {focused && (
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${state.progress * 100}%`,
                    background: accent,
                    opacity: 0.18,
                  }}
                />
              )}
              <span className="relative text-[15px] font-medium text-[var(--foreground)]">
                {option.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[12px] text-[var(--muted)]" role="status">
        {state.prompt}
      </p>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--faint)]">
        {mode === "scan"
          ? "The highlight moves on its own. Shut your eyes for about half a second to take whatever is lit — ordinary blinks are too short to count."
          : "Glance left or right to move the highlight, then look straight ahead and hold still to take it."}
      </p>
    </div>
  );
}
