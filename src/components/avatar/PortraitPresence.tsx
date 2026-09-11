"use client";

import { useEffect, useRef } from "react";

import type { AvatarPreset } from "@/lib/avatar/presets";
import type { ConversationStatus } from "@/hooks/useConversation";

/**
 * A face instead of a shape.
 *
 * People asked for a human-looking companion, and the reason is sound: a face
 * is easier to sit with for ten minutes than an abstract glow, and it is what
 * every product in this space now shows.
 *
 * What it does not do is move its mouth, and that is a deliberate line rather
 * than a missing feature. Driving a mouth on a face from an audio envelope is
 * the same technique as a deepfake, differing only in intent. On a tool that
 * says things like "your blood pressure looks raised", a face that appears to
 * be speaking borrows the authority of a clinician who never said any of it —
 * and if someone uploads a photograph of their own doctor, that face would be
 * made to say things the person it belongs to never agreed to. So the
 * portraits are illustrations, they are still, and everything that has to
 * move is around the frame rather than on the face.
 *
 * The motion carries the same information the abstract presence carried: a
 * ring that pulses on the heartbeat, a rim that brightens with the voice, and
 * a state colour that says listening, thinking or speaking. That turned out
 * to be enough — the thing people needed was to know they were being heard,
 * not to watch lips move.
 */

export interface PortraitPresenceProps {
  avatar: AvatarPreset;
  status: ConversationStatus;
  /** Microphone level, 0 to 1. */
  level: number;
  heartRateBpm?: number | null;
  height?: number;
  compact?: boolean;
  /** A data URL from an uploaded photograph, used in place of the preset. */
  customImage?: string | null;
}

const STATUS_LABEL: Record<ConversationStatus, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Stopped",
};

export function PortraitPresence({
  avatar,
  status,
  level,
  heartRateBpm,
  height = 300,
  compact = false,
  customImage = null,
}: PortraitPresenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const source = customImage ?? avatar.portrait;

  const stateRef = useRef({ status, level, heartRateBpm, palette: avatar.palette });
  stateRef.current = { status, level, heartRateBpm, palette: avatar.palette };

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = source;
    image.onload = () => {
      imageRef.current = image;
    };
    return () => {
      image.onload = null;
    };
  }, [source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let smoothedLevel = 0;
    const started = performance.now();

    const render = (now: number) => {
      const { status, level, heartRateBpm, palette } = stateRef.current;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const elapsed = (now - started) / 1000;
      // Follow the microphone quickly on the way up and slowly on the way
      // down, so a consonant does not make the rim strobe.
      const target = Math.min(1, Math.max(0, level));
      smoothedLevel += (target - smoothedLevel) * (target > smoothedLevel ? 0.35 : 0.08);

      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * (compact ? 0.4 : 0.36);

      /**
       * The heartbeat ring.
       *
       * Timed off the measured rate rather than a fixed animation, so what is
       * on screen is the person's own pulse. If the camera has not produced a
       * reliable rate yet there is no ring at all — inventing a plausible
       * heartbeat on a page whose whole claim is that it measures one would
       * be indefensible.
       */
      if (heartRateBpm && heartRateBpm > 30 && heartRateBpm < 220) {
        const period = 60 / heartRateBpm;
        const phase = (elapsed % period) / period;
        // A quick expansion and fade, like the systolic upstroke.
        const beat = Math.max(0, 1 - phase * 3.2);
        if (beat > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius * (1.04 + (1 - beat) * 0.14), 0, Math.PI * 2);
          ctx.strokeStyle = palette.ring;
          ctx.globalAlpha = beat * 0.5;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Ambient glow, brighter while speaking.
      const glowStrength = status === "speaking" ? 0.55 + smoothedLevel * 0.35 : 0.28;
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.5);
      glow.addColorStop(0, `${palette.core}00`);
      glow.addColorStop(0.45, `${palette.core}${alpha(glowStrength * 0.5)}`);
      glow.addColorStop(1, `${palette.core}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // The portrait, clipped to a circle.
      const image = imageRef.current;
      if (image) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = "var(--surface-raised)";
        ctx.fillStyle = `${palette.core}22`;
        ctx.fill();
      }

      // A rim that tracks the voice while listening and the reply while
      // speaking. This is the only thing that moves in time with audio, and
      // it is around the face rather than on it.
      const rimWeight =
        status === "listening"
          ? 1.5 + smoothedLevel * 5
          : status === "speaking"
            ? 2.5 + smoothedLevel * 4
            : 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + rimWeight / 2, 0, Math.PI * 2);
      ctx.strokeStyle = status === "error" ? "#f87171" : palette.core;
      ctx.globalAlpha = status === "idle" ? 0.45 : 0.9;
      ctx.lineWidth = rimWeight;
      ctx.stroke();
      ctx.globalAlpha = 1;

      /**
       * While thinking, an arc travels round the rim.
       *
       * The gap between a person finishing a sentence and the reply arriving
       * is several seconds, and with a still face and no indicator it reads
       * as the thing having crashed.
       */
      if (status === "thinking") {
        const sweep = (elapsed * 1.6) % (Math.PI * 2);
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 7, sweep, sweep + 1.1);
        ctx.strokeStyle = palette.ring;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [height, compact]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        role="img"
        aria-label={`${avatar.name}, ${STATUS_LABEL[status].toLowerCase()}`}
      />
      {!compact && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span
            className="rounded-full border px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em]"
            style={{
              borderColor: `${avatar.palette.core}55`,
              background: "var(--surface)",
              color: status === "error" ? "var(--bad)" : avatar.palette.core,
            }}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
      )}
    </div>
  );
}

function alpha(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");
}
