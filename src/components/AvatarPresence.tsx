"use client";

import { useEffect, useRef } from "react";

import type { ConversationStatus } from "@/hooks/useConversation";

export interface AvatarPresenceProps {
  status: ConversationStatus;
  /** Microphone level, 0-1, for the listening animation. */
  level: number;
  /** Measured heart rate. The presence pulses in time with it when known. */
  heartRateBpm: number | null;
  height?: number;
}

/**
 * The visual presence the person talks to.
 *
 * The project this mirrors used a photoreal video avatar from a commercial
 * provider. This is deliberately not that, and not only because the avatar was
 * the one paid service with no free substitute. A synthetic face that looks
 * almost human, in a tool that is measuring your body and talking to you about
 * it, is asking to be read as a clinician. An abstract presence cannot be
 * mistaken for a person, which is the honest position for something that is
 * explicitly not one.
 *
 * What it does instead is show the measurement. When the camera has a heart
 * rate, the inner core pulses in time with the person's own pulse. That is not
 * decoration — it is the clearest possible signal that the thing on screen is
 * genuinely reading them, and it is the same beat the pulse trace is drawing.
 */

interface Palette {
  core: string;
  ring: string;
  glow: string;
}

const PALETTES: Record<ConversationStatus, Palette> = {
  idle: { core: "#5b6779", ring: "#33405480", glow: "#5b677922" },
  listening: { core: "#60a5fa", ring: "#60a5fa", glow: "#60a5fa22" },
  thinking: { core: "#f0a04b", ring: "#f0a04b", glow: "#f0a04b22" },
  speaking: { core: "#4ade80", ring: "#4ade80", glow: "#4ade8022" },
  error: { core: "#f87171", ring: "#f87171", glow: "#f8717122" },
};

export function AvatarPresence({
  status,
  level,
  heartRateBpm,
  height = 260,
}: AvatarPresenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation inputs live in refs so that a new level arriving every 128 ms
  // does not restart the render loop.
  const statusRef = useRef(status);
  statusRef.current = status;
  const levelRef = useRef(level);
  levelRef.current = level;
  const heartRateRef = useRef(heartRateBpm);
  heartRateRef.current = heartRateBpm;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let smoothedLevel = 0;
    const startedAt = performance.now();

    const render = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = height;
      if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const cx = cssWidth / 2;
      const cy = cssHeight / 2;
      const base = Math.min(cssWidth, cssHeight) * 0.22;
      const palette = PALETTES[statusRef.current];

      smoothedLevel += (levelRef.current - smoothedLevel) * 0.2;

      // The heartbeat term. With a measured rate the core pulses at exactly
      // that rate; without one it falls back to a slow breathing rhythm that
      // is visibly slower than any plausible pulse, so the two cannot be
      // confused for one another.
      const bpm = heartRateRef.current;
      const beatHz = bpm !== null && bpm > 30 && bpm < 220 ? bpm / 60 : 0;
      let beat: number;
      if (reduceMotion) {
        beat = 0;
      } else if (beatHz > 0) {
        // Sharp rise, slower fall — the shape of a pulse rather than a sine.
        const phase = (elapsed * beatHz) % 1;
        beat = Math.exp(-(((phase - 0.15) / 0.11) ** 2)) * 0.16;
      } else {
        beat = Math.sin(elapsed * 1.1) * 0.035;
      }

      let radius = base * (1 + beat);
      if (statusRef.current === "listening") radius *= 1 + smoothedLevel * 0.35;
      if (statusRef.current === "speaking" && !reduceMotion) {
        radius *= 1 + Math.sin(elapsed * 9) * 0.05 + Math.sin(elapsed * 14.3) * 0.03;
      }

      // Outer glow.
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 3.2);
      glow.addColorStop(0, palette.glow);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Concentric rings. While thinking they rotate; otherwise they sit still
      // and simply breathe with the core.
      const ringCount = 3;
      for (let i = 0; i < ringCount; i++) {
        const spread = 1 + (i + 1) * 0.42;
        const wobble =
          statusRef.current === "thinking" && !reduceMotion
            ? Math.sin(elapsed * 2.2 + i * 1.7) * 0.06
            : 0;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (spread + wobble), 0, Math.PI * 2);
        ctx.strokeStyle = palette.ring;
        ctx.globalAlpha = 0.28 - i * 0.07;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // While listening, the ring is drawn as a level meter so the person can
      // see they are actually being heard.
      if (statusRef.current === "listening") {
        const sweep = Math.PI * 2 * Math.min(1, smoothedLevel);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.42, -Math.PI / 2, -Math.PI / 2 + sweep);
        ctx.strokeStyle = palette.ring;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // The core.
      const core = ctx.createRadialGradient(
        cx - radius * 0.25,
        cy - radius * 0.3,
        radius * 0.1,
        cx,
        cy,
        radius,
      );
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.35, palette.core);
      core.addColorStop(1, palette.core);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [height]);

  const caption =
    status === "listening"
      ? "Listening"
      : status === "thinking"
        ? "Thinking"
        : status === "speaking"
          ? "Speaking"
          : status === "error"
            ? "Stopped"
            : "Ready";

  return (
    <div className="panel relative overflow-hidden p-4">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        role="img"
        aria-label={`Conversation status: ${caption}`}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          {caption}
        </span>
        {heartRateBpm !== null && (
          <span className="tabular text-[11px] text-[var(--faint)]">
            pulsing at your {Math.round(heartRateBpm)} bpm
          </span>
        )}
      </div>
    </div>
  );
}
