"use client";

import { useEffect, useRef } from "react";

export interface PulseTraceProps {
  waveform: Float64Array;
  fs: number;
  beatTimesS?: number[];
  /** Seconds of history to draw. */
  seconds?: number;
  colour?: string;
  height?: number;
  label?: string;
}

/**
 * The pulse waveform, drawn on a canvas.
 *
 * This is the single most convincing element in the whole interface — a
 * number could come from anywhere, but a trace that visibly beats in time
 * with the subject shows the measurement is real. It is also the fastest way
 * to spot that something is wrong: a noisy or flat trace next to a confident
 * number means the number should not be trusted.
 */
export function PulseTrace({
  waveform,
  fs,
  beatTimesS = [],
  seconds = 10,
  colour = "var(--accent)",
  height = 120,
  label,
}: PulseTraceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = height;
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Baseline grid.
    ctx.strokeStyle = "#1b2431";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (cssHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
    }

    const wanted = Math.round(seconds * fs);
    const start = Math.max(0, waveform.length - wanted);
    const slice = waveform.subarray(start);
    if (slice.length < 4) {
      ctx.fillStyle = "#5b6779";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText("Waiting for signal", 10, cssHeight / 2);
      return;
    }

    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < slice.length; i++) {
      if (slice[i] < lo) lo = slice[i];
      if (slice[i] > hi) hi = slice[i];
    }
    const span = hi - lo || 1;
    const pad = cssHeight * 0.12;
    const toY = (v: number) =>
      cssHeight - pad - ((v - lo) / span) * (cssHeight - pad * 2);
    const toX = (i: number) => (i / (slice.length - 1)) * cssWidth;

    // Beat markers, drawn behind the trace.
    const startTimeS = start / fs;
    const endTimeS = waveform.length / fs;
    for (const t of beatTimesS) {
      if (t < startTimeS || t > endTimeS) continue;
      const x = ((t - startTimeS) / (endTimeS - startTimeS || 1)) * cssWidth;
      ctx.strokeStyle = "#f0a04b33";
      ctx.beginPath();
      ctx.moveTo(x, pad * 0.4);
      ctx.lineTo(x, cssHeight - pad * 0.4);
      ctx.stroke();
    }

    // Soft fill under the curve, then the curve itself.
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(colour.startsWith("var(") ? colour.slice(4, -1) : "")
      .trim();
    const stroke = resolved || colour;

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(slice[0]));
    for (let i = 1; i < slice.length; i++) ctx.lineTo(toX(i), toY(slice[i]));

    const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
    gradient.addColorStop(0, `${stroke}33`);
    gradient.addColorStop(1, `${stroke}00`);
    ctx.save();
    ctx.lineTo(cssWidth, cssHeight);
    ctx.lineTo(0, cssHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(slice[0]));
    for (let i = 1; i < slice.length; i++) ctx.lineTo(toX(i), toY(slice[i]));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.stroke();
  }, [waveform, fs, beatTimesS, seconds, colour, height]);

  return (
    <div className="panel overflow-hidden p-4">
      {label && (
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          {label}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        role="img"
        aria-label={label ?? "Pulse waveform"}
      />
    </div>
  );
}
