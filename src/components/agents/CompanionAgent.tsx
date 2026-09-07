"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AvatarPresence } from "@/components/AvatarPresence";
import { CameraStage } from "@/components/CameraStage";
import { MetricTile } from "@/components/MetricTile";
import { QualityMeter } from "@/components/QualityMeter";
import { SafetyNotice } from "@/components/SafetyNotice";
import { VoicePanel } from "@/components/VoicePanel";
import { useCamera } from "@/hooks/useCamera";
import { useConversation } from "@/hooks/useConversation";
import { useFaceTracking, type FaceFrame } from "@/hooks/useFaceTracking";
import { useServices } from "@/hooks/useServices";
import { useVitals } from "@/hooks/useVitals";
import { useVoiceBiomarkers } from "@/hooks/useVoiceBiomarkers";
import type { AgentDefinition } from "@/lib/agents/registry";
import type { LiveContext } from "@/lib/conversation";
import type { VoiceAnalysis } from "@/lib/voice/engine";

const WINDOW_SECONDS = 30;

export function CompanionAgent({ agent }: { agent: AgentDefinition }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [typed, setTyped] = useState("");
  const startedAtRef = useRef<number>(0);

  const { services, loaded: servicesLoaded } = useServices();

  const camera = useCamera(videoRef, running, { idealFps: 30 });
  const { snapshot, pushFrame, reset: resetVitals } = useVitals({
    windowSeconds: WINDOW_SECONDS,
  });
  const handleFrame = useCallback((frame: FaceFrame) => pushFrame(frame), [pushFrame]);
  const tracking = useFaceTracking(videoRef, running && camera.status === "ready", handleFrame);

  /**
   * The two measurement streams are read through refs rather than passed as
   * dependencies, because the conversation needs a snapshot at exactly one
   * moment — when the person stops talking — and rebuilding the turn loop
   * every time a vital sign updates would restart speech recognition several
   * times a second.
   */
  const vitalsRef = useRef(snapshot);
  vitalsRef.current = snapshot;
  const voiceRef = useRef<VoiceAnalysis | null>(null);

  const getContext = useCallback((): LiveContext => {
    const v = vitalsRef.current;
    const a = voiceRef.current;
    return {
      vitals: {
        heartRateBpm: v.heartRateBpm,
        breathingRateBpm: v.breathingRateBpm,
        hrvSdnnMs: v.hrv.sdnn,
        stressIndex: v.stressIndex,
        bloodPressure:
          v.bp.systolic !== null && v.bp.diastolic !== null && v.bp.uncertainty !== null
            ? {
                systolic: v.bp.systolic,
                diastolic: v.bp.diastolic,
                uncertainty: v.bp.uncertainty,
              }
            : null,
        bloodPressureStatus: v.bp.status,
        quality: v.quality.score,
        limiting: v.quality.limiting,
      },
      voice: a
        ? {
            medianF0Hz: a.medianF0Hz,
            pitchRangeSemitones: a.pitchRangeSemitones,
            jitterPercent: Number.isFinite(a.jitterPercent) ? a.jitterPercent : null,
            shimmerPercent: Number.isFinite(a.shimmerPercent) ? a.shimmerPercent : null,
            harmonicsToNoiseDb: a.harmonicsToNoiseDb,
            speechRateHz: a.speechRateHz,
            pauseRatio: a.pauseRatio,
            quality: a.quality,
            limiting: a.limitingFactor,
          }
        : null,
      sessionSeconds: startedAtRef.current
        ? (performance.now() - startedAtRef.current) / 1000
        : 0,
    };
  }, []);

  const conversation = useConversation({
    getContext,
    speechEnabled: services.polly,
  });

  const { onTurnEnd, status: conversationStatus } = conversation;

  const voice = useVoiceBiomarkers({
    onTurnEnd,
    // Turn ends are only meaningful while the loop is waiting for the person.
    // Muting during thinking and speaking is what stops the assistant's own
    // voice, or a cough during a reply, from submitting an empty turn.
    muted: conversationStatus !== "listening",
  });

  voiceRef.current = voice.analysis;

  const start = useCallback(async () => {
    startedAtRef.current = performance.now();
    resetVitals();
    setRunning(true);
    await voice.start();
    conversation.start();
  }, [conversation, resetVitals, voice]);

  const stop = useCallback(() => {
    conversation.stop();
    voice.stop();
    setRunning(false);
  }, [conversation, voice]);

  // Keep the newest turn in view without yanking the page around.
  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [conversation.turns, conversation.partial, conversation.interim]);

  const visibleTurns = useMemo(() => conversation.turns.slice(-12), [conversation.turns]);

  const claudeMissing = servicesLoaded && !services.claude;
  const pollyMissing = servicesLoaded && !services.polly;

  return (
    <div className="space-y-4">
      {claudeMissing && (
        <div
          className="panel p-4 text-[12.5px] leading-relaxed"
          style={{ borderColor: "var(--fair)" }}
        >
          <span className="font-medium text-[var(--foreground)]">
            The conversation needs Claude.{" "}
          </span>
          <span className="text-[var(--muted)]">
            Set <span className="tabular">ANTHROPIC_API_KEY</span> and restart. The
            camera and voice measurements below work without it — they all run in
            your browser.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr_310px]">
        <div className="space-y-4">
          <AvatarPresence
            status={conversation.status}
            level={voice.level}
            heartRateBpm={snapshot.heartRateBpm}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => (running ? stop() : void start())}
              disabled={claudeMissing}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: running ? "var(--surface-raised)" : agent.accent,
                color: running ? "var(--foreground)" : "#141414",
                border: running ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {running ? "End session" : "Start conversation"}
            </button>

            {conversation.status === "speaking" && (
              <button
                onClick={conversation.interrupt}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                Interrupt
              </button>
            )}
          </div>

          <CameraStage
            videoRef={videoRef}
            camera={camera}
            trackingStatus={tracking.status}
            trackingError={tracking.error}
            faceVisible={tracking.faceVisible}
            hint={
              running && !tracking.faceVisible
                ? "Sit so your whole face is in frame"
                : null
            }
          />

          {voice.error && (
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--bad)" }}>
              {voice.error}
            </p>
          )}
          {pollyMissing && running && (
            <p className="text-[11px] leading-relaxed text-[var(--faint)]">
              Replies are shown as text. Add AWS credentials to hear them spoken by
              Polly.
            </p>
          )}
        </div>

        <div className="panel flex min-h-[520px] flex-col p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              Conversation
            </span>
            {running && (
              <span className="tabular text-[11px] text-[var(--faint)]">
                {snapshot.elapsedSeconds.toFixed(0)}s of measurement
              </span>
            )}
          </div>

          <div ref={transcriptRef} className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
            {visibleTurns.length === 0 && !conversation.partial && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className="max-w-sm text-[13px] leading-relaxed text-[var(--muted)]">
                  {running
                    ? "Say hello whenever you are ready. Pause when you finish speaking and the reply will come."
                    : "Start the conversation and the assistant will listen while the camera measures your pulse and breathing."}
                </p>
              </div>
            )}

            {visibleTurns.map((turn, index) => (
              <div
                key={`${index}-${turn.role}`}
                className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                  style={
                    turn.role === "user"
                      ? { background: "var(--surface-raised)", color: "var(--foreground)" }
                      : { background: `${agent.accent}14`, color: "var(--foreground)" }
                  }
                >
                  {turn.text}
                </div>
              </div>
            ))}

            {conversation.partial && (
              <div className="flex justify-start">
                <div
                  className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                  style={{ background: `${agent.accent}14`, color: "var(--foreground)" }}
                >
                  {conversation.partial}
                </div>
              </div>
            )}

            {conversation.interim && conversation.status === "listening" && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-xl border border-dashed border-[var(--border)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
                  {conversation.interim}
                </div>
              </div>
            )}
          </div>

          {conversation.error && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--bad)" }}>
              {conversation.error}
            </p>
          )}

          {/*
            Typing is not a fallback bolted on for completeness. Web Speech is
            missing in Firefox entirely, and speech recognition in general is
            least reliable for exactly the accents and speech differences this
            kind of tool should serve worst-first.
          */}
          <form
            className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const text = typed.trim();
              if (!text) return;
              setTyped("");
              conversation.sendText(text);
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={
                conversation.recognitionAvailable
                  ? "Or type instead of speaking"
                  : "This browser cannot listen — type here"
              }
              disabled={claudeMissing}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--border-strong)] disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={claudeMissing || !typed.trim()}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30"
            >
              Send
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <MetricTile
              label="Heart rate"
              value={snapshot.heartRateBpm}
              unit="bpm"
              accent={agent.accent}
              beat
              detail="From skin colour"
              pending={running ? "Building signal…" : "Not started"}
            />
            <MetricTile
              label="Breathing"
              value={snapshot.breathingRateBpm}
              unit="/min"
              accent="var(--info)"
              detail="From head movement"
              pending={running ? "Needs 15s" : "Not started"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MetricTile
              label="HRV · SDNN"
              value={snapshot.hrv.sdnn}
              unit="ms"
              accent="var(--good)"
              detail="Beat-to-beat spread"
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

          <QualityMeter quality={snapshot.quality} />

          <VoicePanel
            analysis={voice.analysis}
            level={voice.level}
            speaking={voice.speaking}
          />
        </div>
      </div>

      <SafetyNotice limits={agent.limits} />
    </div>
  );
}
