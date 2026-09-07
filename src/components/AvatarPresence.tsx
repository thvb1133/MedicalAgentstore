"use client";

import { useEffect, useRef } from "react";

import type { ConversationStatus } from "@/hooks/useConversation";
import type { AvatarPreset, AvatarPalette } from "@/lib/avatar/presets";

export interface AvatarPresenceProps {
  avatar: AvatarPreset;
  status: ConversationStatus;
  /** Microphone level, 0-1, for the listening animation. */
  level: number;
  /** Measured heart rate. The presence pulses in time with it when known. */
  heartRateBpm: number | null;
  height?: number;
  /** Suppresses the caption strip, for the small previews in the picker. */
  compact?: boolean;
}

/**
 * The visual presence the person talks to.
 *
 * Five distinct silhouettes rather than five colourways, because a preview
 * grid where every option is the same shape in a different colour does not
 * actually offer a choice. Each style animates on the same three inputs:
 * conversation state, microphone level, and the measured heart rate.
 *
 * The heartbeat is the part worth keeping. When the camera has a pulse, the
 * presence beats in time with it, using the same sharp-rise, slow-fall shape
 * as a real pulse wave rather than a sine. It is the clearest possible signal
 * that the thing on screen is genuinely reading the person in front of it —
 * and when there is no measurement it falls back to a slow breathing rhythm,
 * deliberately far slower than any plausible pulse, so the two can never be
 * mistaken for one another.
 */

const STATE_TINT: Record<ConversationStatus, string | null> = {
  // Idle and error override the avatar's palette; the rest keep it, so the
  // avatar you chose still looks like itself while it works.
  idle: "#5b6779",
  listening: null,
  thinking: null,
  speaking: null,
  error: "#f87171",
};

function paletteFor(avatar: AvatarPreset, status: ConversationStatus): AvatarPalette {
  const tint = STATE_TINT[status];
  if (!tint) return avatar.palette;
  return { core: tint, ring: tint, glow: `${tint}22` };
}

interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  /** Base radius, already scaled by heartbeat and microphone level. */
  r: number;
  palette: AvatarPalette;
  elapsed: number;
  level: number;
  status: ConversationStatus;
  reduceMotion: boolean;
}

function drawCore({ ctx, cx, cy, r, palette }: DrawArgs) {
  const gradient = ctx.createRadialGradient(
    cx - r * 0.25,
    cy - r * 0.3,
    r * 0.1,
    cx,
    cy,
    r,
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.35, palette.core);
  gradient.addColorStop(1, palette.core);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawOrb(args: DrawArgs) {
  const { ctx, cx, cy, r, palette, elapsed, status, reduceMotion } = args;
  for (let i = 0; i < 3; i++) {
    const spread = 1 + (i + 1) * 0.42;
    const wobble =
      status === "thinking" && !reduceMotion ? Math.sin(elapsed * 2.2 + i * 1.7) * 0.06 : 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (spread + wobble), 0, Math.PI * 2);
    ctx.strokeStyle = palette.ring;
    ctx.globalAlpha = 0.28 - i * 0.07;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawCore(args);
}

function drawAurora(args: DrawArgs) {
  const { ctx, cx, cy, r, palette, elapsed, status, reduceMotion } = args;
  const drift = reduceMotion ? 0 : elapsed * (status === "thinking" ? 0.9 : 0.25);
  for (let i = 0; i < 5; i++) {
    const radius = r * (1.15 + i * 0.33);
    const arc = Math.PI * (0.55 + i * 0.12);
    const start = drift * (i % 2 === 0 ? 1 : -1) + i * 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + arc);
    ctx.strokeStyle = palette.ring;
    ctx.globalAlpha = 0.5 - i * 0.08;
    ctx.lineWidth = 3.5 - i * 0.5;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawCore({ ...args, r: r * 0.72 });
}

function drawBloom(args: DrawArgs) {
  const { ctx, cx, cy, r, palette, elapsed, status, reduceMotion } = args;
  const petals = 8;
  const spin = reduceMotion ? 0 : elapsed * (status === "thinking" ? 0.7 : 0.16);
  for (let i = 0; i < petals; i++) {
    const angle = spin + (i / petals) * Math.PI * 2;
    const reach = r * (1.5 + (reduceMotion ? 0 : Math.sin(elapsed * 1.6 + i) * 0.12));
    const px = cx + Math.cos(angle) * reach;
    const py = cy + Math.sin(angle) * reach;
    ctx.beginPath();
    ctx.ellipse(px, py, r * 0.42, r * 0.24, angle, 0, Math.PI * 2);
    ctx.fillStyle = palette.ring;
    ctx.globalAlpha = 0.3;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawCore({ ...args, r: r * 0.82 });
}

function drawWave(args: DrawArgs) {
  const { ctx, cx, cy, r, palette, elapsed, level, status, reduceMotion } = args;
  const bars = 9;
  const gap = r * 0.32;
  const width = r * 0.16;
  const totalWidth = (bars - 1) * gap;

  for (let i = 0; i < bars; i++) {
    const x = cx - totalWidth / 2 + i * gap;
    // Tallest in the middle, so the shape reads as a voice rather than a bar
    // chart, with an animation that only moves when there is something to say.
    const centreWeight = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
    const activity =
      status === "listening"
        ? level
        : status === "speaking" && !reduceMotion
          ? 0.55 + Math.sin(elapsed * 8 + i * 0.9) * 0.35
          : status === "thinking" && !reduceMotion
            ? 0.3 + Math.sin(elapsed * 3 + i * 0.6) * 0.2
            : 0.16;
    const height = r * (0.35 + centreWeight * 1.5 * Math.max(0.08, activity));
    ctx.beginPath();
    ctx.roundRect(x - width / 2, cy - height / 2, width, height, width / 2);
    ctx.fillStyle = palette.core;
    ctx.globalAlpha = 0.55 + centreWeight * 0.4;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLattice(args: DrawArgs) {
  const { ctx, cx, cy, r, palette, elapsed, status, reduceMotion } = args;
  const spin = reduceMotion ? 0 : elapsed * (status === "thinking" ? 0.6 : 0.12);

  const hexagon = (radius: number, rotation: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = rotation + (i / 6) * Math.PI * 2;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  for (let i = 0; i < 3; i++) {
    hexagon(r * (1.2 + i * 0.45), spin * (i % 2 === 0 ? 1 : -1));
    ctx.strokeStyle = palette.ring;
    ctx.globalAlpha = 0.32 - i * 0.08;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  hexagon(r * 0.85, spin);
  const gradient = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.4, palette.core);
  gradient.addColorStop(1, palette.core);
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
}

const RENDERERS: Record<AvatarPreset["style"], (args: DrawArgs) => void> = {
  orb: drawOrb,
  aurora: drawAurora,
  bloom: drawBloom,
  wave: drawWave,
  lattice: drawLattice,
};

export function AvatarPresence({
  avatar,
  status,
  level,
  heartRateBpm,
  height = 260,
  compact = false,
}: AvatarPresenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation inputs live in refs so a new level arriving every 128 ms does
  // not restart the render loop.
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
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

      const currentStatus = statusRef.current;
      const currentAvatar = avatarRef.current;
      const cx = cssWidth / 2;
      const cy = cssHeight / 2;
      const base = Math.min(cssWidth, cssHeight) * 0.2;
      const palette = paletteFor(currentAvatar, currentStatus);

      smoothedLevel += (levelRef.current - smoothedLevel) * 0.2;

      const bpm = heartRateRef.current;
      const beatHz = bpm !== null && bpm > 30 && bpm < 220 ? bpm / 60 : 0;
      let beat: number;
      if (reduceMotion) {
        beat = 0;
      } else if (beatHz > 0) {
        const phase = (elapsed * beatHz) % 1;
        beat = Math.exp(-(((phase - 0.15) / 0.11) ** 2)) * 0.16;
      } else {
        beat = Math.sin(elapsed * 1.1) * 0.035;
      }

      let radius = base * (1 + beat);
      if (currentStatus === "listening") radius *= 1 + smoothedLevel * 0.3;

      const glow = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 3.4);
      glow.addColorStop(0, palette.glow);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      RENDERERS[currentAvatar.style]({
        ctx,
        cx,
        cy,
        r: radius,
        palette,
        elapsed,
        level: smoothedLevel,
        status: currentStatus,
        reduceMotion,
      });

      // The level ring doubles as proof the microphone is working, which is
      // the question people actually have when nothing seems to be happening.
      if (currentStatus === "listening") {
        const sweep = Math.PI * 2 * Math.min(1, smoothedLevel);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 2.1, -Math.PI / 2, -Math.PI / 2 + sweep);
        ctx.strokeStyle = palette.ring;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
      }

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
        aria-label={`${avatar.name}, ${caption.toLowerCase()}`}
      />
      {!compact && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
            {avatar.name} · {caption}
          </span>
          {heartRateBpm !== null && (
            <span className="tabular text-[11px] text-[var(--faint)]">
              beating at your {Math.round(heartRateBpm)} bpm
            </span>
          )}
        </div>
      )}
    </div>
  );
}
