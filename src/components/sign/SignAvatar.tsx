"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { APPROXIMATE_GLYPHS, toFingerspelling } from "@/lib/sign/alphabet";
import { buildHand } from "@/lib/sign/hand";
import { frameAt, totalDuration } from "@/lib/sign/schedule";
import { drawHand, DEFAULT_TONE, type SkinTone } from "./render";

/**
 * A hand that fingerspells.
 *
 * Drawn rather than filmed, from the parametric model in `lib/sign/hand.ts`,
 * so it can move between shapes instead of cutting between stills — the
 * travel between letters is a real part of what a fingerspelling reader
 * follows.
 *
 * The label under it is not boilerplate. Calling this "sign language" would
 * be a false claim of access, and a Deaf reader deserves to know exactly what
 * they are being shown before they decide whether to bother with it.
 */

export interface SignAvatarProps {
  /** What to spell. Changing it restarts from the first letter. */
  text: string;
  /** Letters per second. Comfortable reading is around 2 to 3. */
  rate?: number;
  height?: number;
  accent: string;
  /** Repeat once finished, for a single term shown as a reference. */
  loop?: boolean;
  tone?: SkinTone;
}

export function SignAvatar({
  text,
  rate = 2.4,
  height = 240,
  accent,
  loop = false,
  tone = DEFAULT_TONE,
}: SignAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Only the letter and its position cross into React state, and only when
  // they change. Re-rendering on every animation frame to move a highlight
  // would cost far more than the highlight is worth.
  const [current, setCurrent] = useState<{ glyph: string | null; index: number }>({
    glyph: null,
    index: -1,
  });

  const units = useMemo(() => toFingerspelling(text), [text]);
  const duration = useMemo(() => totalDuration(units, rate), [units, rate]);

  const unitsRef = useRef(units);
  unitsRef.current = units;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const accentRef = useRef(accent);
  accentRef.current = accent;
  const toneRef = useRef(tone);
  toneRef.current = tone;

  // Restart whenever the text changes, so a new reply spells from the top.
  const startRef = useRef(0);
  useEffect(() => {
    startRef.current = performance.now();
  }, [text, rate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let lastIndex = -2;

    const render = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      let elapsed = (now - startRef.current) / 1000;
      const total = totalDuration(unitsRef.current, rateRef.current);
      if (loopRef.current && total > 0 && elapsed > total + 0.6) {
        startRef.current = now;
        elapsed = 0;
      }

      const state = frameAt(unitsRef.current, elapsed, rateRef.current);
      if (state.index !== lastIndex) {
        lastIndex = state.index;
        setCurrent({ glyph: state.glyph, index: state.index });
      }

      const scale = height * 0.5;
      const origin = {
        x: width / 2 - state.offset.x * scale,
        y: height * 0.74 - state.offset.y * scale,
      };
      drawHand(ctx, buildHand(state.pose), scale, origin, accentRef.current, toneRef.current);

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [height]);

  const approximate = current.glyph !== null && APPROXIMATE_GLYPHS.includes(current.glyph);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Fingerspelling
        </span>
        <span
          className="tabular text-[18px] font-semibold leading-none"
          style={{ color: accent }}
          aria-hidden
        >
          {current.glyph ?? "·"}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        role="img"
        aria-label={`A hand fingerspelling: ${text}`}
      />

      <div className="border-t border-[var(--border)] px-4 py-2.5">
        <p className="tabular text-[13px] leading-relaxed text-[var(--muted)]">
          {units.map((unit, i) => (
            <span key={i} style={{ color: i === current.index ? accent : undefined }}>
              {unit.glyph === " " ? "\u00a0\u00a0" : unit.glyph}
            </span>
          ))}
        </p>
        <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--faint)]">
          The ASL manual alphabet, not ASL. Fingerspelling carries names,
          numbers and terms; it is not the language.
          {approximate
            ? ` The shape for ${current.glyph} needs one finger behind another, which this drawing cannot show.`
            : ""}
        </p>
      </div>

      <span className="sr-only" aria-live="polite">
        {duration > 0 ? `Spelling ${text}` : ""}
      </span>
    </div>
  );
}