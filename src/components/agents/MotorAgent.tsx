"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { CameraStage } from "@/components/CameraStage";
import { InterpretationPanel } from "@/components/InterpretationPanel";
import { MetricTile } from "@/components/MetricTile";
import { SafetyNotice } from "@/components/SafetyNotice";
import { useCamera } from "@/hooks/useCamera";
import { useHandTracking, type HandFrame } from "@/hooks/useHandTracking";
import { HAND_POINTS, MotorTracker, handScale, type MotorResult } from "@/lib/motor/engine";
import type { AgentDefinition } from "@/lib/agents/registry";
import type { MeasurementReport } from "@/lib/report";

type Task = "tremor" | "tapping";

const TASKS: Record<Task, { title: string; instruction: string; seconds: number }> = {
  tremor: {
    title: "Postural tremor",
    instruction:
      "Hold your hand out towards the camera, fingers spread, and keep it as still as you can.",
    seconds: 15,
  },
  tapping: {
    title: "Finger tapping",
    instruction:
      "Tap your thumb and index finger together as fast and as wide as you can, without stopping.",
    seconds: 15,
  },
};

const BAND_LABEL: Record<NonNullable<MotorResult["tremor"]["band"]>, string> = {
  none: "No distinct oscillation",
  "low-frequency": "Below 4 Hz — usually voluntary movement",
  "rest-4-6": "4–6 Hz band",
  "postural-6-12": "6–12 Hz band",
};

const EMPTY: MotorResult = {
  tremor: {
    frequencyHz: null,
    amplitude: null,
    regularity: null,
    band: null,
    frameRateLimited: false,
  },
  tapping: {
    tapCount: 0,
    frequencyHz: null,
    meanAmplitude: null,
    amplitudeDecrement: null,
    rhythmVariability: null,
    hesitations: 0,
  },
  effectiveFps: 0,
  durationSeconds: 0,
  samples: 0,
};

export function MotorAgent({ agent }: { agent: AgentDefinition }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef(new MotorTracker(20));
  const lastAnalysisRef = useRef(0);
  const [task, setTask] = useState<Task>("tremor");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MotorResult>(EMPTY);

  const camera = useCamera(videoRef, running, { idealFps: 60 });

  const handleFrame = useCallback((frame: HandFrame) => {
    const hand = frame.hands[0];
    if (hand) {
      const lm = hand.landmarks;
      const scale = handScale(lm);
      const thumb = lm[HAND_POINTS.thumbTip];
      const index = lm[HAND_POINTS.indexTip];
      const wrist = lm[HAND_POINTS.wrist];
      trackerRef.current.push({
        timestampMs: frame.timestampMs,
        tipX: index.x,
        tipY: index.y,
        pinchDistance: Math.hypot(thumb.x - index.x, thumb.y - index.y) / scale,
        wristX: wrist.x,
        wristY: wrist.y,
      });
    }

    if (frame.timestampMs - lastAnalysisRef.current < 500) return;
    lastAnalysisRef.current = frame.timestampMs;
    setResult(trackerRef.current.analyse());
  }, []);

  const tracking = useHandTracking(
    videoRef,
    running && camera.status === "ready",
    handleFrame,
  );

  const spec = TASKS[task];
  const progress = Math.min(1, result.durationSeconds / spec.seconds);
  const { tremor, tapping } = result;

  const report = useMemo<MeasurementReport | null>(() => {
    if (result.samples < 40) return null;
    const metrics =
      task === "tremor"
        ? [
            {
              label: "Tremor frequency",
              value: tremor.frequencyHz !== null ? Number(tremor.frequencyHz.toFixed(2)) : null,
              unit: "Hz",
              note:
                tremor.band !== null ? BAND_LABEL[tremor.band] : "No oscillation detected",
            },
            {
              label: "Tremor amplitude",
              value: tremor.amplitude !== null ? Number((tremor.amplitude * 1000).toFixed(2)) : null,
              unit: "×10⁻³ of frame width",
            },
            {
              label: "Oscillation regularity",
              value: tremor.regularity !== null ? Number(tremor.regularity.toFixed(2)) : null,
              unit: "0–1",
            },
          ]
        : [
            { label: "Taps", value: tapping.tapCount, unit: "detected" },
            {
              label: "Tapping frequency",
              value: tapping.frequencyHz !== null ? Number(tapping.frequencyHz.toFixed(2)) : null,
              unit: "Hz",
            },
            {
              label: "Amplitude decrement",
              value:
                tapping.amplitudeDecrement !== null
                  ? Number((tapping.amplitudeDecrement * 100).toFixed(1))
                  : null,
              unit: "% change first third to last third",
              note: "Negative means the taps got smaller as the sequence went on",
            },
            {
              label: "Rhythm variability",
              value:
                tapping.rhythmVariability !== null
                  ? Number(tapping.rhythmVariability.toFixed(3))
                  : null,
              unit: "coefficient of variation",
            },
            { label: "Hesitations", value: tapping.hesitations, unit: "pauses" },
          ];

    return {
      agentSlug: agent.slug,
      agentName: `${agent.name} — ${spec.title}`,
      takenAt: new Date().toISOString(),
      durationSeconds: Math.round(result.durationSeconds),
      quality: Math.min(1, result.effectiveFps / 30),
      qualityNote: tremor.frameRateLimited
        ? "Camera frame rate limits the highest measurable tremor frequency"
        : null,
      metrics,
    };
  }, [agent, result, spec.title, task, tapping, tremor]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(Object.keys(TASKS) as Task[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTask(t);
              trackerRef.current.reset();
              setResult(EMPTY);
            }}
            className="rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              borderColor: task === t ? agent.accent : "var(--border)",
              color: task === t ? agent.accent : "var(--muted)",
              background: task === t ? `${agent.accent}14` : "transparent",
            }}
          >
            {TASKS[t].title}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <CameraStage
            videoRef={videoRef}
            camera={camera}
            trackingStatus={tracking.status}
            trackingError={tracking.error}
            faceVisible={tracking.handsVisible > 0}
            hint={running ? spec.instruction : null}
            overlay={
              running && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--track)]">
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
                  trackerRef.current.reset();
                  setResult(EMPTY);
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
              {running ? "Stop" : `Start ${spec.title.toLowerCase()}`}
            </button>
            <span className="tabular ml-auto text-[11px] text-[var(--faint)]">
              {running
                ? `${result.durationSeconds.toFixed(0)}s · ${result.effectiveFps.toFixed(0)} fps`
                : "Idle"}
            </span>
          </div>

          {tremor.frameRateLimited && running && (
            <p className="text-[11.5px] text-[var(--poor)]">
              This camera is running below 24 fps, so frequencies above roughly{" "}
              {(result.effectiveFps / 3).toFixed(0)} Hz cannot be resolved. The
              4–6 Hz band is still measurable.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {task === "tremor" ? (
            <>
              <MetricTile
                label="Tremor frequency"
                value={tremor.frequencyHz}
                unit="Hz"
                precision={2}
                size="large"
                accent={agent.accent}
                detail={tremor.band ? BAND_LABEL[tremor.band] : null}
                pending={running ? "Hold still…" : "Press start"}
              />
              <div className="grid grid-cols-2 gap-4">
                <MetricTile
                  label="Amplitude"
                  value={tremor.amplitude !== null ? tremor.amplitude * 1000 : null}
                  unit="×10⁻³"
                  precision={2}
                  accent="var(--info)"
                  detail="Of frame width"
                  pending="No oscillation"
                />
                <MetricTile
                  label="Regularity"
                  value={tremor.regularity}
                  unit="/1"
                  precision={2}
                  accent="var(--good)"
                  detail="Spectral concentration"
                  pending="Needs signal"
                />
              </div>
            </>
          ) : (
            <>
              <MetricTile
                label="Tapping frequency"
                value={tapping.frequencyHz}
                unit="Hz"
                precision={2}
                size="large"
                accent={agent.accent}
                detail={`${tapping.tapCount} taps detected`}
                pending={running ? "Start tapping" : "Press start"}
              />
              <div className="grid grid-cols-2 gap-4">
                <MetricTile
                  label="Amplitude decrement"
                  value={
                    tapping.amplitudeDecrement !== null
                      ? tapping.amplitudeDecrement * 100
                      : null
                  }
                  unit="%"
                  precision={1}
                  accent={
                    (tapping.amplitudeDecrement ?? 0) < -0.2 ? "var(--poor)" : "var(--good)"
                  }
                  detail="Negative = taps shrinking"
                  pending="Needs 6+ taps"
                />
                <MetricTile
                  label="Rhythm variability"
                  value={tapping.rhythmVariability}
                  unit="CV"
                  precision={3}
                  accent="var(--fair)"
                  detail={`${tapping.hesitations} hesitation${tapping.hesitations === 1 ? "" : "s"}`}
                  pending="Needs 3+ taps"
                />
              </div>
            </>
          )}

          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              What is being measured
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
              {task === "tremor"
                ? "Fingertip position relative to the wrist, so moving your whole arm is not counted as tremor. The trajectory goes through an FFT and a narrow spectral peak is reported; a broad one is voluntary movement and is rejected."
                : "Thumb-to-index distance, normalised by the size of your hand so it does not change when you move closer to the camera. Each closure is a tap; amplitude is the opening that follows it."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <InterpretationPanel report={report} ready={result.samples >= 40} />
        <SafetyNotice limits={agent.limits} />
      </div>
    </div>
  );
}
