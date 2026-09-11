"use client";

import { useEffect, useRef } from "react";

import { buildHand, type HandPose } from "@/lib/sign/hand";
import { drawHand, DEFAULT_TONE, type SkinTone } from "./render";

/** One handshape, held still. Used for the alphabet chart. */
export function SignGlyph({
  pose,
  size = 96,
  accent,
  tone = DEFAULT_TONE,
  label,
}: {
  pose: HandPose;
  size?: number;
  accent: string;
  tone?: SkinTone;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    drawHand(
      ctx,
      buildHand(pose),
      size * 0.44,
      { x: size / 2, y: size * 0.76 },
      accent,
      tone,
    );
  }, [pose, size, accent, tone]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`The handshape for ${label}`}
    />
  );
}
