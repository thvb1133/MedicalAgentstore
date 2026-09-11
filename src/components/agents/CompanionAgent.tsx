"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AvatarPresence } from "@/components/AvatarPresence";
import { SwitchBoard } from "@/components/access/SwitchBoard";
import { AffectPanel } from "@/components/affect/AffectPanel";
import { CameraStage } from "@/components/CameraStage";
import { CaptionBar } from "@/components/CaptionBar";
import { CompanionSettings } from "@/components/avatar/CompanionSettings";
import { PortraitPresence } from "@/components/avatar/PortraitPresence";
import { canPresent, TalkingPresenter } from "@/components/avatar/TalkingPresenter";
import { FingerspellInput } from "@/components/sign/FingerspellInput";
import { SignAvatar } from "@/components/sign/SignAvatar";
import { SigningAvatar } from "@/components/sign/SigningAvatar";
import { SKIN_TONES } from "@/components/sign/render";
import { usePortrait } from "@/hooks/usePortrait";
import { spellableTerms } from "@/lib/sign/schedule";
import { MetricTile } from "@/components/MetricTile";
import { QualityMeter } from "@/components/QualityMeter";
import { SafetyNotice } from "@/components/SafetyNotice";
import { VoicePanel } from "@/components/VoicePanel";
import { useCamera } from "@/hooks/useCamera";
import { useCompanionProfile } from "@/hooks/useCompanionProfile";
import { useConversation } from "@/hooks/useConversation";
import { useFaceTracking, type FaceFrame } from "@/hooks/useFaceTracking";
import { useServices } from "@/hooks/useServices";
import { useVitals } from "@/hooks/useVitals";
import { useVoiceBiomarkers } from "@/hooks/useVoiceBiomarkers";
import { AffectTracker, type Affect } from "@/lib/affect/multimodal";
import {
  QUICK_REPLIES,
  SwitchInput,
  type SwitchMode,
  type SwitchState,
} from "@/lib/access/switch";
import type { AgentDefinition } from "@/lib/agents/registry";
import { browserSpeechAvailable } from "@/lib/avatar/browserSpeech";
import { avatarOr } from "@/lib/avatar/presets";
import { FACE_POINTS, eyeAspectRatio, horizontalGaze } from "@/lib/vision/faceRegions";
import { personaInstructions } from "@/lib/avatar/profile";
import type { LiveContext } from "@/lib/conversation";
import { addLocalReport } from "@/lib/history";
import type { MeasurementReport } from "@/lib/report";
import type { VoiceAnalysis } from "@/lib/voice/engine";
import { api } from "@/lib/paths";

const WINDOW_SECONDS = 30;

/** Below this there is nothing worth filing, and a bad row pollutes the trend. */
const MIN_SAVEABLE_QUALITY = 0.35;

export function CompanionAgent({ agent }: { agent: AgentDefinition }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const typedInputRef = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [typed, setTyped] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const startedAtRef = useRef<number>(0);

  const { services, loaded: servicesLoaded } = useServices();
  const { profile, update: updateProfile, ready: profileReady } = useCompanionProfile();

  /**
   * Read after mounting rather than during the render, because the server has
   * no `speechSynthesis` and a control that appears on one pass and not the
   * other is a hydration error.
   */
  const [browserVoice, setBrowserVoice] = useState(false);
  useEffect(() => setBrowserVoice(browserSpeechAvailable()), []);

  const claudeMissing = servicesLoaded && !services.claude;
  const canSpeak = services.polly || browserVoice;

  const avatar = avatarOr(profile.avatarId);
  const accent = avatar.palette.core;

  const camera = useCamera(videoRef, running, { idealFps: 30 });
  const { snapshot, pushFrame, reset: resetVitals } = useVitals({
    windowSeconds: WINDOW_SECONDS,
  });
  /**
   * The eye switch runs off the frames the vitals engine is already getting.
   *
   * That is the whole argument for it: the landmarks needed to work out
   * whether someone's eyes are shut are the same ones already on screen for
   * the health measures, so the accessibility path costs one more function
   * call per frame rather than a second camera pass.
   */
  const affectRef = useRef(new AffectTracker());
  const [affect, setAffect] = useState<Affect>(() => new AffectTracker().analyse(null));

  const switchRef = useRef(new SwitchInput());
  const switchSendRef = useRef<((text: string) => void) | null>(null);
  const switchOnRef = useRef(false);
  const switchPaintedAt = useRef(0);
  const [switchMode, setSwitchMode] = useState<SwitchMode>("scan");
  const [spellIn, setSpellIn] = useState(false);
  const [switchState, setSwitchState] = useState<SwitchState>({
    focus: 0,
    progress: 0,
    holding: false,
    chosen: null,
    ready: false,
    prompt: "Look at the screen with your eyes open",
  });

  const handleFrame = useCallback(
    (frame: FaceFrame) => {
      pushFrame(frame);
      affectRef.current.push({
        timestampMs: frame.timestampMs,
        blendshapes: frame.blendshapes,
      });
      if (!switchOnRef.current) return;

      const lm = frame.landmarks;
      const state = switchRef.current.push({
        timestampMs: frame.timestampMs,
        ear: lm
          ? (eyeAspectRatio(lm, FACE_POINTS.leftEye) +
              eyeAspectRatio(lm, FACE_POINTS.rightEye)) /
            2
          : null,
        gazeX: lm ? horizontalGaze(lm) : null,
      });

      if (state.chosen) {
        switchSendRef.current?.(state.chosen.label);
        setSwitchState(state);
        switchPaintedAt.current = frame.timestampMs;
        return;
      }
      // A dwell ring redrawn ten times a second looks identical to one
      // redrawn thirty times, and this component is expensive to re-render.
      if (frame.timestampMs - switchPaintedAt.current < 100) return;
      switchPaintedAt.current = frame.timestampMs;
      setSwitchState(state);
    },
    [pushFrame],
  );

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
    speechEnabled: canSpeak && profile.speakReplies,
    cloudSpeech: services.polly,
    source: claudeMissing ? "guide" : "model",
    voiceId: profile.voiceId,
    speechRate: profile.speechRate,
    persona: personaInstructions(profile),
    languageCode: profile.languageCode,
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
  switchSendRef.current = conversation.sendText;
  switchOnRef.current = running && profile.accessMode;

  /**
   * The two channels are read on a slow timer rather than per frame.
   *
   * Expression and prosody are both twenty-second averages by construction,
   * so recomputing them thirty times a second would produce identical numbers
   * at thirty times the cost — and re-render a very large component while
   * doing it.
   */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setAffect(affectRef.current.analyse(voiceRef.current)), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    switchRef.current.setOptions(QUICK_REPLIES);
    switchRef.current.configure({ mode: switchMode });
  }, [switchMode]);

  const start = useCallback(async () => {
    startedAtRef.current = performance.now();
    resetVitals();
    affectRef.current.reset();
    switchRef.current.reset();
    setSaved(false);
    setRunning(true);
    await voice.start();
    conversation.start();
    if (profile.accessMode) typedInputRef.current?.focus();
  }, [conversation, profile.accessMode, resetVitals, voice]);

  /**
   * Ending the session files what was measured.
   *
   * The report is written on the way out rather than continuously, because a
   * conversation's vitals only settle after the first half-minute and saving
   * every intermediate estimate would fill the history with the noisy early
   * part of every session. A measurement too poor to mean anything is not
   * saved at all — it would sit in the trend as a data point implying it was
   * a reading.
   */
  const stop = useCallback(() => {
    const v = vitalsRef.current;
    const a = voiceRef.current;

    if (v.quality.score >= MIN_SAVEABLE_QUALITY && v.heartRateBpm !== null) {
      const report: MeasurementReport = {
        agentSlug: agent.slug,
        agentName: agent.name,
        takenAt: new Date().toISOString(),
        durationSeconds: Math.round(v.elapsedSeconds),
        quality: v.quality.score,
        qualityNote: v.quality.limiting,
        metrics: [
          { label: "Heart rate", value: v.heartRateBpm, unit: "bpm" },
          { label: "Breathing rate", value: v.breathingRateBpm, unit: "/min" },
          { label: "HRV (SDNN)", value: v.hrv.sdnn, unit: "ms" },
          { label: "Stress index", value: v.stressIndex, unit: "/100" },
          {
            label: "Voice pitch",
            value: a?.medianF0Hz ?? null,
            unit: "Hz",
            confidence: a?.quality,
            note: a ? undefined : "No voice was measured.",
          },
        ],
      };
      addLocalReport(report);
      const mirror = api("/api/sessions");
      if (services.s3 && mirror) {
        void fetch(mirror, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: profile.profileId, report }),
        }).catch(() => {
          // The local copy already succeeded; a failed sync is not worth
          // interrupting the end of a session for.
        });
      }
      setSaved(true);
    }

    conversation.stop();
    voice.stop();
    setRunning(false);
  }, [agent.name, agent.slug, conversation, profile.profileId, services.s3, voice]);

  // Keep the newest turn in view without yanking the page around.
  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [conversation.turns, conversation.partial, conversation.interim]);

  const visibleTurns = useMemo(() => conversation.turns.slice(-12), [conversation.turns]);

  const lastAssistantText = useMemo(() => {
    for (let i = conversation.turns.length - 1; i >= 0; i--) {
      if (conversation.turns[i].role === "assistant") return conversation.turns[i].text;
    }
    return "";
  }, [conversation.turns]);

  const spelled = useMemo(
    () => (profile.signMode === "spell" ? spellableTerms(lastAssistantText).join(" ") : ""),
    [profile.signMode, lastAssistantText],
  );

  const signTone =
    SKIN_TONES.find((t) => t.id === profile.signTone)?.tone ?? SKIN_TONES[1].tone;

  const portrait = usePortrait();

  const pollyMissing = servicesLoaded && !services.polly;

  return (
    <div className="space-y-4">
      {/*
        Said before the first question rather than after it, and worded around
        what does work. There is no language model behind this copy, and the
        honest version of that is not an apology for a broken feature — it is
        a description of a smaller one: a written guide that answers the
        common questions, read aloud by the browser's own voice.
      */}
      {claudeMissing && (
        <div
          className="panel p-4 text-[12.5px] leading-relaxed"
          style={{ borderColor: "var(--fair)" }}
        >
          <span className="font-medium text-[var(--foreground)]">
            {avatar.name} is running as a scripted guide.{" "}
          </span>
          <span className="text-[var(--muted)]">
            There is no language model behind this copy, so the replies come from
            a written list — what the measurements are, why one is missing, what
            this will not claim — rather than from Claude.{" "}
            {browserVoice
              ? "They are spoken aloud by your browser's own voice, and you can talk or type to ask."
              : "This browser has no speech synthesiser, so they are shown as text."}{" "}
            Every measurement on the page is real and unaffected: all of it runs
            here and never needed a key. Set{" "}
            <span className="tabular">ANTHROPIC_API_KEY</span> and restart for the
            full conversation.
          </span>
        </div>
      )}

      {settingsOpen && (
        <CompanionSettings
          profile={profile}
          onChange={updateProfile}
          onClose={() => setSettingsOpen(false)}
          speechAvailable={canSpeak}
          cloudSpeech={services.polly}
          portrait={portrait}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr_310px]">
        <div className="space-y-4">
          {profile.presence === "presenter" &&
          canPresent(avatar.id, portrait.portrait, portrait.rig) ? (
            <TalkingPresenter
              avatar={avatar}
              status={conversation.status}
              readSpeech={conversation.readSpeech}
              languageCode={profile.languageCode}
              heartRateBpm={snapshot.heartRateBpm}
              customImage={portrait.portrait}
              customRig={portrait.rig}
            />
          ) : profile.presence === "presenter" ? (
            <PortraitPresence
              avatar={avatar}
              status={conversation.status}
              level={voice.level}
              heartRateBpm={snapshot.heartRateBpm}
              customImage={portrait.portrait}
            />
          ) : (
            <AvatarPresence
              avatar={avatar}
              status={conversation.status}
              level={voice.level}
              heartRateBpm={snapshot.heartRateBpm}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => (running ? stop() : void start())}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors"
              style={{
                background: running ? "var(--surface-raised)" : accent,
                color: running ? "var(--foreground)" : "#141414",
                border: running ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {running ? "End session" : `Talk to ${avatar.name}`}
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              Change avatar
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

          {profileReady && !running && (
            <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
              {avatar.tagline} Speaking as {profile.voiceId}
              {profile.speechRate !== 100 ? ` at ${profile.speechRate}% speed` : ""}.
            </p>
          )}

          {saved && !running && (
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--good)" }}>
              Saved to your history.{" "}
              <a href="/history" className="underline underline-offset-2">
                See the trend
              </a>
              .
            </p>
          )}

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
              {browserVoice
                ? "Spoken by your browser's own voice. Add AWS credentials for Polly, which sounds considerably better."
                : "Replies are shown as text. This browser has no speech synthesiser, and there are no AWS credentials for Polly either."}
            </p>
          )}
        </div>

        <div className="flex min-h-[520px] flex-col gap-4">
          {/*
            In access mode the captions are not a convenience track alongside
            the audio — they are the entire output — so they sit above the
            transcript rather than under it.
          */}
          <CaptionBar
            mode={profile.captions}
            status={conversation.status}
            speakerName={avatar.name}
            text={conversation.partial || lastAssistantText}
            accent={accent}
          />

          {/*
            Two ways to sign, because they do different jobs.

            "Key signs" runs the full signer over the reply and falls back to
            fingerspelling for anything with no sign, which is what a signer
            does with names and numbers too. "Fingerspelling" skips the signs
            and spells only the measurements and names — the parts a caption
            handles worst — because spelling a whole sentence at two letters a
            second is slower to read than the caption already on screen.

            Either way the caption stays. Neither of these is interpretation
            and neither should be the only way the reply is available.
          */}
          {/*
            In access mode the eyes are an input device as well as something
            being measured. Someone who can neither speak nor type can still
            answer yes, ask for a repeat, or call for help — from the same
            camera pass that is reading their pulse.
          */}
          {profile.accessMode && running && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSpellIn((s) => !s)}
                className="rounded-lg border px-3 py-1.5 text-[12px] transition-colors"
                style={{
                  borderColor: spellIn ? accent : "var(--border)",
                  color: spellIn ? "var(--foreground)" : "var(--muted)",
                }}
              >
                {spellIn ? "Stop reading my hand" : "Let me spell to the camera"}
              </button>
              <span className="text-[11px] text-[var(--faint)]">
                Reads the manual alphabet from the same camera pass as your pulse.
              </span>
            </div>
          )}

          {profile.accessMode && running && (
            <FingerspellInput
              videoRef={videoRef}
              enabled={spellIn}
              accent={accent}
              onSend={(text) => conversation.sendText(text)}
            />
          )}

          {profile.accessMode && running && (
            <SwitchBoard
              options={QUICK_REPLIES}
              state={switchState}
              mode={switchMode}
              onModeChange={setSwitchMode}
              accent={accent}
            />
          )}

          {profile.signMode === "sign" && lastAssistantText && (
            <SigningAvatar
              text={lastAssistantText}
              accent={accent}
              tone={signTone}
              height={280}
              loop
            />
          )}

          {profile.signMode === "spell" && spelled && (
            <SignAvatar
              text={spelled}
              accent={accent}
              tone={signTone}
              rate={2.2}
              height={200}
              loop
            />
          )}

          <div className="panel flex flex-1 flex-col p-4">
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
                  {claudeMissing
                    ? "Ask about heart rate, variability, breathing, blood pressure, voice, signal quality, lighting or privacy, and the written guide will answer. Add a Claude key for a real conversation."
                    : running
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
                      : { background: `${accent}14`, color: "var(--foreground)" }
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
                  style={{ background: `${accent}14`, color: "var(--foreground)" }}
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

          {conversation.recognitionBlocked && (
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--fair)" }}>
              Speech recognition is unavailable, so the assistant cannot hear
              you — type below instead. Everything else is unaffected: the
              camera vitals and the voice measurements on the right are still
              live.
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
              ref={typedInputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={
                profile.accessMode
                  ? "Type what you want to say"
                  : !conversation.recognitionAvailable || conversation.recognitionBlocked
                    ? "This browser cannot listen — type here"
                    : "Or type instead of speaking"
              }
              className={`flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--foreground)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--border-strong)] disabled:opacity-40 ${
                profile.accessMode ? "text-[16px]" : "text-[13px]"
              }`}
            />
            <button
              type="submit"
              disabled={!typed.trim()}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30"
            >
              Send
            </button>
          </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <MetricTile
              label="Heart rate"
              value={snapshot.heartRateBpm}
              unit="bpm"
              accent={accent}
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

          <AffectPanel affect={affect} accent={accent} />
        </div>
      </div>

      <SafetyNotice limits={agent.limits} />
    </div>
  );
}
