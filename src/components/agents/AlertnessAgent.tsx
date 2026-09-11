"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { CameraStage } from "@/components/CameraStage";
import { CognitiveLoadPanel } from "@/components/cognition/CognitiveLoadPanel";
import { InterpretationPanel } from "@/components/InterpretationPanel";
import { MetricTile } from "@/components/MetricTile";
import { SafetyNotice } from "@/components/SafetyNotice";
import { useCamera } from "@/hooks/useCamera";
import { useFaceTracking, type FaceFrame } from "@/hooks/useFaceTracking";
import { AlertnessTracker, type AlertnessResult } from "@/lib/alertness/engine";
import { CognitiveLoadTracker, type CognitiveLoad } from "@/lib/cognition/load";
import {
  FACE_POINTS,
  eyeAspectRatio,
  headPitch,
  horizontalGaze,
  mouthAspectRatio,
} from "@/lib/vision/faceRegions";
import type { AgentDefinition } from "@/lib/agents/registry";
import type { MeasurementReport } from "@/lib/report";

const LEVEL_STYLE = {
  alert: { label: "Alert", colour: "var(--good)" },
  mild: { label: "Mild fatigue", colour: "var(--fair)" },
  drowsy: { label: "Drowsy", colour: "var(--poor)" },
  severe: { label: "Severely drowsy", colour: "var(--bad)" },
  unknown: { label: "Measuring", colour: "var(--faint)" },
} as const;

const EMPTY: AlertnessResult = {
  perclos: null,
  blinkRatePerMin: null,
  medianBlinkMs: null,
  longestClosureMs: null,
  yawnCount: 0,
  noddingIndex: null,
  gazeAwayFraction: null,
  fatigueScore: null,
  level: "unknown",
  driver: null,
  baselineReady: false,
  windowSeconds: 0,
};

const EMPTY_LOAD: CognitiveLoad = new CognitiveLoadTracker().analyse([]);

export function AlertnessAgent({ agent }: { agent: AgentDefinition }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef(new AlertnessTracker(60));
  const loadRef = useRef(new CognitiveLoadTracker());
  const lastAnalysisRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AlertnessResult>(EMPTY);
  const [load, setLoad] = useState<CognitiveLoad>(EMPTY_LOAD);

  const camera = useCamera(videoRef, running, { idealFps: 30 });

  const handleFrame = useCallback((frame: FaceFrame) => {
    const lm = frame.landmarks;
    const gaze = lm ? horizontalGaze(lm) : null;
    trackerRef.current.push({
      timestampMs: frame.timestampMs,
      ear: lm
        ? (eyeAspectRatio(lm, FACE_POINTS.leftEye) +
            eyeAspectRatio(lm, FACE_POINTS.rightEye)) /
          2
        : null,
      mar: lm ? mouthAspectRatio(lm) : null,
      pitch: lm ? headPitch(lm) : null,
      gaze,
    });

    // The same landmark pass feeds both measures: fatigue is about how long
    // the eyes close, load is about how wide the pupils are and where the
    // gaze goes. One camera, one detector, two questions.
    loadRef.current.push({
      timestampMs: frame.timestampMs,
      pupilRatio: frame.pupil?.ratio ?? null,
      pupilContrast: frame.pupil?.contrast ?? 0,
      gazeX: gaze,
      luma: frame.skin?.luma ?? null,
    });

    if (frame.timestampMs - lastAnalysisRef.current < 400) return;
    lastAnalysisRef.current = frame.timestampMs;
    setResult(trackerRef.current.analyse());
    setLoad(loadRef.current.analyse(trackerRef.current.blinkEndTimes()));
  }, []);

  const tracking = useFaceTracking(
    videoRef,
    running && camera.status === "ready",
    handleFrame,
    { pupils: true },
  );

  const style = LEVEL_STYLE[result.level];
  const severe = result.level === "severe" || result.level === "drowsy";

  const report = useMemo<MeasurementReport | null>(() => {
    if (result.fatigueScore === null) return null;
    return {
      agentSlug: agent.slug,
      agentName: agent.name,
      takenAt: new Date().toISOString(),
      durationSeconds: Math.round(result.windowSeconds),
      quality: result.baselineReady ? 0.8 : 0.3,
      qualityNote: result.baselineReady ? null : "Baseline not established",
      metrics: [
        { label: "Fatigue score", value: result.fatigueScore, unit: "/100" },
        {
          label: "PERCLOS",
          value: result.perclos !== null ? Number((result.perclos * 100).toFixed(1)) : null,
          unit: "% of time eyes closed",
        },
        {
          label: "Blink rate",
          value: result.blinkRatePerMin !== null ? Math.round(result.blinkRatePerMin) : null,
          unit: "per minute",
        },
        {
          label: "Median blink duration",
          value: result.medianBlinkMs !== null ? Math.round(result.medianBlinkMs) : null,
          unit: "ms",
        },
        {
          label: "Longest eye closure",
          value: result.longestClosureMs !== null ? Math.round(result.longestClosureMs) : null,
          unit: "ms",
          note: "Closures beyond about 500 ms suggest a microsleep",
        },
        { label: "Yawns", value: result.yawnCount, unit: "in window" },
        {
          label: "Looking away",
          value:
            result.gazeAwayFraction !== null
              ? Number((result.gazeAwayFraction * 100).toFixed(0))
              : null,
          unit: "% of time",
        },
        {
          label: "Cognitive load",
          value: load.index,
          unit: "/100",
          confidence: load.confidence,
          note:
            load.index === null
              ? "Not enough of the eye signals were readable."
              : `From ${[
                  load.pupil.value !== null ? "pupil size" : null,
                  load.blink.value !== null ? "blink rate" : null,
                  load.scan.value !== null ? "gaze scan" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}, against this person's own resting baseline. An interface-effort measure, not a clinical one.`,
        },
      ],
    };
  }, [agent, result, load]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <CameraStage
            videoRef={videoRef}
            camera={camera}
            trackingStatus={tracking.status}
            trackingError={tracking.error}
            faceVisible={tracking.faceVisible}
            hint={
              !running
                ? null
                : !result.baselineReady
                  ? "Look at the screen with your eyes open — establishing your baseline"
                  : (result.driver ?? "Monitoring")
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (running) {
                  setRunning(false);
                } else {
                  trackerRef.current.reset();
                  loadRef.current.reset();
                  setResult(EMPTY);
                  setLoad(EMPTY_LOAD);
                  setRunning(true);
                }
              }}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
              style={{
                background: running ? "var(--surface-raised)" : agent.accent,
                color: running ? "var(--foreground)" : "#0b0b0b",
                border: running ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {running ? "Stop monitoring" : "Start monitoring"}
            </button>
            <span className="tabular ml-auto text-[11px] text-[var(--faint)]">
              {running ? `${result.windowSeconds.toFixed(0)}s of a 60s window` : "Idle"}
            </span>
          </div>

          {severe && (
            <div
              role="alert"
              className="rounded-[var(--radius)] border p-4"
              style={{ borderColor: `${style.colour}66`, background: `${style.colour}14` }}
            >
              <p className="text-sm font-semibold" style={{ color: style.colour }}>
                {result.level === "severe"
                  ? "Severe drowsiness signs — stop and rest"
                  : "Drowsiness signs detected — take a break"}
              </p>
              <p className="mt-1 text-[12px] text-[var(--muted)]">{result.driver}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
                Fatigue score
              </span>
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
                style={{ borderColor: `${style.colour}44`, color: style.colour }}
              >
                {style.label}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span
                className="tabular text-5xl font-semibold leading-none"
                style={{ color: result.fatigueScore === null ? "var(--faint)" : style.colour }}
              >
                {result.fatigueScore ?? "—"}
              </span>
              <span className="text-xs text-[var(--muted)]">/100</span>
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--track)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(2, result.fatigueScore ?? 0)}%`,
                  background: style.colour,
                }}
              />
            </div>
            <p className="mt-3 text-[11.5px] text-[var(--muted)]">
              {result.driver ?? "Waiting for data"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MetricTile
              label="PERCLOS"
              value={result.perclos !== null ? result.perclos * 100 : null}
              unit="%"
              precision={1}
              accent="var(--info)"
              detail="Time with eyes closed"
              pending="Needs baseline"
            />
            <MetricTile
              label="Blink rate"
              value={result.blinkRatePerMin}
              unit="/min"
              accent="var(--good)"
              detail="Typical rest: 15–20"
              pending="Counting blinks"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MetricTile
              label="Blink duration"
              value={result.medianBlinkMs}
              unit="ms"
              accent="var(--fair)"
              detail="Longer means sleepier"
              pending="No blinks yet"
            />
            <MetricTile
              label="Looking away"
              value={result.gazeAwayFraction !== null ? result.gazeAwayFraction * 100 : null}
              unit="%"
              accent="var(--accent)"
              detail="Gaze off centre"
              pending="Tracking iris"
            />
          </div>

          <CognitiveLoadPanel load={load} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <InterpretationPanel report={report} ready={result.baselineReady} />
        <SafetyNotice limits={agent.limits} />
      </div>
    </div>
  );
}
