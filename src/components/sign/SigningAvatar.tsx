"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { compose, type Segment } from "@/lib/sign/compose";
import { buildTimeline, stateAt } from "@/lib/sign/sequence";
import { bodyTheme, drawSigner } from "./renderBody";
import { DEFAULT_TONE, type SkinTone } from "./render";

/**
 * A signing avatar.
 *
 * Two hands, placed in signing space against a body, with the movement and
 * the facial markers each sign is defined by — and fingerspelling for the
 * names, numbers and terms that have no sign, which is what a signer does
 * with those words too.
 *
 * The strip underneath is not an afterthought. It shows the gloss of what is
 * being signed, and it states what this is: key signs, not interpretation.
 * Someone deciding whether to rely on this deserves to know that before they
 * do, not after.
 */

export interface SigningAvatarProps {
  text: string;
  /** Fingerspelling rate. Signs carry their own durations. */
  lettersPerSecond?: number;
  /** Playback speed for the whole sequence. */
  speed?: number;
  height?: number;
  accent: string;
  tone?: SkinTone;
  loop?: boolean;
  /** Fingerspell every word without a sign, rather than only names and numbers. */
  spellUnknown?: boolean;
}

/**
 * Follow the page theme.
 *
 * The signer is drawn on canvas, so it cannot inherit CSS variables the way
 * the rest of the interface does. Without this the garment keeps its
 * night-theme colours on a white page, and the contrast that makes a hand
 * over the chest readable is exactly what gets lost.
 */
function useDarkTheme(): boolean {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.getAttribute("data-theme") !== "morning");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function SigningAvatar({
  text,
  lettersPerSecond = 2.4,
  speed = 1,
  height = 320,
  accent,
  tone = DEFAULT_TONE,
  loop = false,
  spellUnknown = false,
}: SigningAvatarProps) {
  const dark = useDarkTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<{ index: number; letter: string | null }>({
    index: -1,
    letter: null,
  });

  const segments = useMemo(
    () => compose(text, { spellUnknown }),
    [text, spellUnknown],
  );
  const timeline = useMemo(
    () => buildTimeline(segments, lettersPerSecond),
    [segments, lettersPerSecond],
  );

  const refs = useRef({ timeline, lettersPerSecond, speed, loop, accent, tone, dark });
  refs.current = { timeline, lettersPerSecond, speed, loop, accent, tone, dark };

  const startRef = useRef(0);
  useEffect(() => {
    startRef.current = performance.now();
  }, [text, spellUnknown, lettersPerSecond, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastIndex = -2;
    let lastLetter: string | null = null;

    const render = (now: number) => {
      const current = refs.current;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      let elapsed = ((now - startRef.current) / 1000) * current.speed;
      if (current.loop && current.timeline.duration > 0 && elapsed > current.timeline.duration + 1) {
        startRef.current = now;
        elapsed = 0;
      }

      const state = stateAt(current.timeline, elapsed, current.lettersPerSecond);
      if (state.index !== lastIndex || state.letter !== lastLetter) {
        lastIndex = state.index;
        lastLetter = state.letter;
        setActive({ index: state.index, letter: state.letter });
      }

      drawSigner(
        ctx,
        state.frame,
        width,
        height,
        bodyTheme(current.tone, current.accent, current.dark),
      );

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [height]);

  const currentSign =
    active.index >= 0 && segments[active.index]?.kind === "sign"
      ? (segments[active.index] as Extract<Segment, { kind: "sign" }>).sign
      : null;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Signing
        </span>
        <span className="text-[12px] font-semibold" style={{ color: accent }}>
          {currentSign?.gloss ?? (active.letter ? `spelling ${active.letter}` : "·")}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        role="img"
        aria-label={`A signer signing: ${text}`}
      />

      <div className="border-t border-[var(--border)] px-4 py-2.5">
        <p className="text-[12.5px] leading-relaxed">
          {segments.length === 0 ? (
            <span className="text-[var(--faint)]">Nothing here has a sign yet.</span>
          ) : (
            segments.map((segment, i) => (
              <span
                key={i}
                className={segment.kind === "spell" ? "tabular" : ""}
                style={{
                  color: i === active.index ? accent : "var(--muted)",
                  fontWeight: i === active.index ? 600 : 400,
                }}
              >
                {segment.kind === "sign"
                  ? segment.sign.gloss
                  : segment.kind === "spell"
                    ? `${segment.text} `
                    : "· "}
                {segment.kind === "sign" ? " " : ""}
              </span>
            ))
          )}
        </p>

        {currentSign && (
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--faint)]">
            {currentSign.description}
            {currentSign.approximate
              ? " This one is an approximation: the real sign needs a palm orientation this flat drawing cannot show."
              : ""}
          </p>
        )}
      </div>

      <span className="sr-only" aria-live="polite">
        {currentSign ? `Signing ${currentSign.gloss}` : ""}
      </span>
    </div>
  );
}
