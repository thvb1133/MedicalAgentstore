"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { CameraStage } from "@/components/CameraStage";
import { InterpretationPanel } from "@/components/InterpretationPanel";
import { MetricTile } from "@/components/MetricTile";
import { PulseTrace } from "@/components/PulseTrace";
import { QualityMeter } from "@/components/QualityMeter";
import { SafetyNotice } from "@/components/SafetyNotice";
import { BpCalibrationCard } from "@/components/agents/BpCalibrationCard";
import { useCamera } from "@/hooks/useCamera";
import { useFaceTracking, type FaceFrame } from "@/hooks/useFaceTracking";
import { useVitals } from "@/hooks/useVitals";
import type { AgentDefinition } from "@/lib/agents/registry";
import type { MeasurementReport } from "@/lib/report";

const WINDOW_SECONDS = 30;

export function VitalsAgent({ agent }: { agent: AgentDefinition }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [running, setRunning] = useState(false);

  const camera = useCamera(videoRef, running, { idealFps: 30 });
  const { snapshot, pushFrame, reset, calibration, addCuffReading, clearCalibration } =
    useVitals({ windowSeconds: WINDOW_SECONDS });

  const handleFrame = useCallback((frame: FaceFrame) => pushFrame(frame), [pushFrame]);
  const tracking = useFaceTracking(videoRef, running && camera.status === "ready", handleFrame);

  const { quality, hrv } = snapshot;
  const good = quality.score >= 0.5;
  const progress = Math.min(1, snapshot.elapsedSeconds / WINDOW_SECONDS);

  const report = useMemo<MeasurementReport | null>(() => {
    if (snapshot.heartRateBpm === null) return null;
    return {
      agentSlug: agent.slug,
      agentName: agent.name,
      takenAt: new Date().toISOString(),
      durationSeconds: Math.round(snapshot.elapsedSeconds),
      quality: Number(quality.score.toFixed(2)),
      qualityNote: quality.limiting,
      metrics: [
        {
          label: "Heart rate",
          value: Math.round(snapshot.heartRateBpm),
          unit: "bpm",
          confidence: Number(quality.score.toFixed(2)),
        },
        {
          label: "Breathing rate",
          value: snapshot.breathingRateBpm ? Math.round(snapshot.breathingRateBpm) : null,
          unit: "breaths/min",
          note: snapshot.breathingRateBpm ? undefined : "Not enough clean data yet",
        },
        {
          label: "HRV (SDNN)",
          value: hrv.sdnn ? Math.round(hrv.sdnn) : null,
          unit: "ms",
          note:
            hrv.rejectedCount > 0
              ? `${hrv.rejectedCount} beat intervals rejected as artefacts`
              : undefined,
        },
        {
          label: "Stress index",
          value: snapshot.stressIndex,
          unit: "/100",
          note: "Derived from HRV; an arousal indicator, not a clinical measure",
        },
        {
          label: "Blood pressure",
          value:
            snapshot.bp.systolic !== null
              ? `${snapshot.bp.systolic}/${snapshot.bp.diastolic}`
              : null,
          unit: "mmHg",
          note: snapshot.bp.message,
        },
      ],
    };
  }, [agent, snapshot, quality, hrv]);

  const hint = !running
    ? null
    : tracking.faceVisible
      ? quality.limiting ?? "Hold still — measuring"
      : "Sit so your whole face is in frame, evenly lit";

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
            hint={hint}
            overlay={
              running && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#ffffff14]">
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{
                      width: `${progress * 100}%`,
                      background: progress >= 1 ? "var(--good)" : agent.accent,
                    }}
                  />
                </div>
              )
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (running) {
                  setRunning(false);
                } else {
                  reset();
                  setRunning(true);
                }
              }}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
              style={{
                background: running ? "var(--surface-raised)" : "var(--accent)",
                color: running ? "var(--foreground)" : "#141414",
                border: running ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {running ? "Stop" : "Start measuring"}
            </button>

            {running && (
              <button
                onClick={reset}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                Restart window
              </button>
            )}

            <span className="tabular ml-auto text-[11px] text-[var(--faint)]">
              {running
                ? `${snapshot.elapsedSeconds.toFixed(0)}s / ${WINDOW_SECONDS}s window`
                : "Idle"}
            </span>
          </div>

          <PulseTrace
            waveform={snapshot.waveform}
            fs={snapshot.waveformFs}
            beatTimesS={snapshot.beatTimesS}
            colour={agent.accent}
            label="Pulse waveform — extracted from skin colour"
          />
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <MetricTile
              label="Heart rate"
              value={snapshot.heartRateBpm}
              unit="bpm"
              accent={agent.accent}
              size="large"
              beat
              detail={
                hrv.beatRateBpm
                  ? `${hrv.acceptedIntervals.length} clean beats`
                  : "Spectral estimate"
              }
              pending={running ? "Building signal…" : "Press start"}
            />
            <MetricTile
              label="Breathing"
              value={snapshot.breathingRateBpm}
              unit="/min"
              accent="var(--info)"
              size="large"
              detail="From head movement"
              pending={
                snapshot.elapsedSeconds < 15 ? "Needs 15s of data" : "Signal too weak"
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MetricTile
              label="HRV · SDNN"
              value={hrv.sdnn}
              unit="ms"
              accent="var(--good)"
              detail={
                hrv.rejectedCount > 0
                  ? `${hrv.rejectedCount} artefacts removed`
                  : "All intervals accepted"
              }
              pending="Needs steady beats"
            />
            <MetricTile
              label="Stress index"
              value={snapshot.stressIndex}
              unit="/100"
              accent="var(--fair)"
              detail="Arousal proxy from HRV"
              pending="Needs HRV"
            />
          </div>

          <QualityMeter quality={quality} />

          <BpCalibrationCard
            estimate={snapshot.bp}
            calibration={calibration}
            canCalibrate={good && snapshot.features !== null}
            onAddReading={addCuffReading}
            onClear={clearCalibration}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <InterpretationPanel report={report} ready={good && progress > 0.5} />
        <SafetyNotice limits={agent.limits} />
      </div>
    </div>
  );
}
