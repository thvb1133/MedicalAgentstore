"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CameraStage } from "@/components/CameraStage";
import { InterpretationPanel } from "@/components/InterpretationPanel";
import { EmergencyBanner, SafetyNotice } from "@/components/SafetyNotice";
import { useCamera } from "@/hooks/useCamera";
import { useFaceTracking, type FaceFrame } from "@/hooks/useFaceTracking";
import { usePoseTracking, POSE_POINTS, type PoseFrame } from "@/hooks/usePoseTracking";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import {
  SPEECH_PROMPTS,
  assessArms,
  assessFace,
  assessSpeech,
  summarise,
  type ArmEvidence,
  type ArmSample,
  type FaceEvidence,
  type FaceSample,
  type SpeechEvidence,
} from "@/lib/fast/engine";
import { facialAsymmetry, headYaw } from "@/lib/vision/faceRegions";
import type { AgentDefinition } from "@/lib/agents/registry";
import type { MeasurementReport } from "@/lib/report";

type Step = "intro" | "face" | "arms" | "speech" | "result";

const FACE_SECONDS = 6;
const ARM_SECONDS = 10;

export function FastAgent({ agent }: { agent: AgentDefinition }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState<Step>("intro");
  const [countdown, setCountdown] = useState(0);

  const faceSamplesRef = useRef<FaceSample[]>([]);
  const armSamplesRef = useRef<ArmSample[]>([]);
  const [face, setFace] = useState<FaceEvidence | null>(null);
  const [arms, setArms] = useState<ArmEvidence | null>(null);
  const [speech, setSpeech] = useState<SpeechEvidence | null>(null);

  const prompt = useMemo(
    () => SPEECH_PROMPTS[Math.floor(Math.random() * SPEECH_PROMPTS.length)],
    [],
  );

  const active = step === "face" || step === "arms" || step === "speech";
  const camera = useCamera(videoRef, active, { idealFps: 30 });
  const recognition = useSpeechRecognition();

  const onFaceFrame = useCallback(
    (frame: FaceFrame) => {
      if (step !== "face" || !frame.landmarks) return;
      const asym = facialAsymmetry(frame.landmarks);
      faceSamplesRef.current.push({
        mouthAsymmetry: asym.mouthCornerDelta,
        eyeAsymmetry: asym.eyeOpeningDelta,
        yaw: headYaw(frame.landmarks),
      });
    },
    [step],
  );

  const onPoseFrame = useCallback(
    (frame: PoseFrame) => {
      if (step !== "arms" || !frame.landmarks || !frame.visibility) return;
      const lm = frame.landmarks;
      const vis = frame.visibility;
      armSamplesRef.current.push({
        timestampMs: frame.timestampMs,
        leftWristY: lm[POSE_POINTS.leftWrist].y,
        rightWristY: lm[POSE_POINTS.rightWrist].y,
        shoulderY:
          (lm[POSE_POINTS.leftShoulder].y + lm[POSE_POINTS.rightShoulder].y) / 2,
        leftVisible: (vis[POSE_POINTS.leftWrist] ?? 0) > 0.6,
        rightVisible: (vis[POSE_POINTS.rightWrist] ?? 0) > 0.6,
      });
    },
    [step],
  );

  const faceTracking = useFaceTracking(
    videoRef,
    step === "face" && camera.status === "ready",
    onFaceFrame,
  );
  const poseTracking = usePoseTracking(
    videoRef,
    step === "arms" && camera.status === "ready",
    onPoseFrame,
  );

  // Timed steps advance themselves so the person can keep both arms out.
  useEffect(() => {
    if (step !== "face" && step !== "arms") return;
    const total = step === "face" ? FACE_SECONDS : ARM_SECONDS;
    setCountdown(total);
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = total - (Date.now() - started) / 1000;
      setCountdown(Math.max(0, remaining));
      if (remaining > 0) return;
      clearInterval(id);
      if (step === "face") {
        setFace(assessFace(faceSamplesRef.current));
        setStep("arms");
      } else {
        setArms(assessArms(armSamplesRef.current));
        setStep("speech");
      }
    }, 100);
    return () => clearInterval(id);
  }, [step]);

  const finishSpeech = useCallback(() => {
    recognition.stop();
    setSpeech(assessSpeech(prompt, recognition.transcript, recognition.available));
    setStep("result");
  }, [prompt, recognition]);

  const assessment = summarise(face, arms, speech);

  const restart = () => {
    faceSamplesRef.current = [];
    armSamplesRef.current = [];
    setFace(null);
    setArms(null);
    setSpeech(null);
    recognition.reset();
    setStep("face");
  };

  const report = useMemo<MeasurementReport | null>(() => {
    if (step !== "result") return null;
    return {
      agentSlug: agent.slug,
      agentName: agent.name,
      takenAt: new Date().toISOString(),
      durationSeconds: FACE_SECONDS + ARM_SECONDS + 10,
      quality: face?.poseValid ? 0.75 : 0.4,
      qualityNote: face?.poseValid ? null : "Head was not frontal enough for the face test",
      metrics: [
        {
          label: "Facial asymmetry",
          value: face ? Number((face.mouthAsymmetry * 100).toFixed(2)) : null,
          unit: "% of face width",
          note: face?.flagged ? "Above the screening threshold" : "Below the threshold",
        },
        {
          label: "Arm drift difference",
          value: arms ? Number((arms.driftAsymmetry * 100).toFixed(2)) : null,
          unit: "% of frame height",
          note: arms?.flagged ? "One arm drifted noticeably more" : "Both arms held evenly",
        },
        {
          label: "Speech accuracy",
          value: speech?.accuracy !== null && speech ? Number((speech.accuracy * 100).toFixed(0)) : null,
          unit: "% word match",
          note: speech?.available ? undefined : "Speech recognition unavailable in this browser",
        },
        {
          label: "Domains flagged",
          value: assessment.flaggedCount,
          unit: "of 3",
        },
      ],
    };
  }, [agent, arms, assessment.flaggedCount, face, speech, step]);

  return (
    <div className="space-y-4">
      {step === "result" && assessment.urgent && (
        <EmergencyBanner>
          Possible stroke signs detected — seek emergency medical care now.
        </EmergencyBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          {step === "intro" ? (
            <div className="panel p-6">
              <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
                Before you start
              </h2>
              <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
                This runs the three observable parts of the FAST check in
                sequence: smile at the camera, hold both arms out for ten
                seconds, then read a sentence aloud. It takes under a minute.
              </p>
              <div className="mt-4 rounded-lg border border-[var(--bad)]/35 bg-[var(--bad)]/[0.06] p-3.5">
                <p className="text-[12.5px] font-medium leading-relaxed text-[var(--foreground)]">
                  If you or someone near you already has sudden weakness,
                  drooping, confusion or difficulty speaking, stop and call
                  emergency services now. Do not run this test first.
                </p>
              </div>
              <p className="mt-4 text-[12px] leading-relaxed text-[var(--faint)]">
                A clear result here does not rule out a stroke. This is set for
                high sensitivity, so false alarms are expected — that is the
                intended trade-off.
              </p>
              <button
                onClick={restart}
                className="mt-5 rounded-lg px-4 py-2 text-[13px] font-semibold text-[#0b0b0b] transition-colors"
                style={{ background: agent.accent }}
              >
                Begin the check
              </button>
            </div>
          ) : (
            <CameraStage
              videoRef={videoRef}
              camera={camera}
              trackingStatus={
                step === "arms" ? poseTracking.status : faceTracking.status
              }
              trackingError={
                step === "arms" ? poseTracking.error : faceTracking.error
              }
              faceVisible={
                step === "arms" ? poseTracking.poseVisible : faceTracking.faceVisible
              }
              hint={
                step === "face"
                  ? "Look straight at the camera and smile, showing your teeth"
                  : step === "arms"
                    ? "Hold both arms straight out in front of you, palms up, eyes closed if you can"
                    : step === "speech"
                      ? "Read the sentence below aloud, clearly"
                      : null
              }
              overlay={
                (step === "face" || step === "arms") && (
                  <div className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-black/65 backdrop-blur">
                    <span className="tabular text-lg font-semibold text-[var(--foreground)]">
                      {Math.ceil(countdown)}
                    </span>
                  </div>
                )
              }
            />
          )}

          {step === "speech" && (
            <div className="panel p-5">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
                Read this aloud
              </div>
              <p className="mt-3 text-xl font-medium leading-snug text-[var(--foreground)]">
                “{prompt}”
              </p>

              {recognition.available ? (
                <>
                  <div className="mt-4 min-h-[42px] rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                    <p className="text-[13px] text-[var(--muted)]">
                      {recognition.transcript || (
                        <span className="text-[var(--faint)]">
                          {recognition.listening ? "Listening…" : "Not started"}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {!recognition.listening ? (
                      <button
                        onClick={recognition.start}
                        className="rounded-lg px-3.5 py-2 text-[12px] font-semibold text-[#0b0b0b]"
                        style={{ background: agent.accent }}
                      >
                        Start listening
                      </button>
                    ) : (
                      <button
                        onClick={finishSpeech}
                        className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[12px] font-medium text-[var(--foreground)]"
                      >
                        Done
                      </button>
                    )}
                  </div>
                  {recognition.error && (
                    <p className="mt-2 text-[11.5px] text-[var(--bad)]">
                      {recognition.error}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
                    This browser has no built-in speech recognition, so the
                    speech domain cannot be scored automatically. Judge it
                    yourself: did the words come out slurred, or was any of it
                    hard to get out?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        setSpeech({
                          target: prompt,
                          heard: "",
                          accuracy: null,
                          available: false,
                          flagged: true,
                        });
                        setStep("result");
                      }}
                      className="rounded-lg border border-[var(--bad)]/35 bg-[var(--bad)]/[0.06] px-3.5 py-2 text-[12px] font-medium text-[var(--bad)]"
                    >
                      Speech sounded wrong
                    </button>
                    <button
                      onClick={finishSpeech}
                      className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[12px] font-medium text-[var(--foreground)]"
                    >
                      Speech was normal
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "result" && (
            <div className="panel p-6">
              <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
                {assessment.urgent
                  ? "One or more signs were flagged"
                  : "No signs flagged on this check"}
              </h2>
              <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
                {assessment.urgent
                  ? "This screen is deliberately over-sensitive, so a flag does not mean a stroke has happened. It means the observation should be made by a person who can act on it, urgently."
                  : "A clear screen is not reassurance. If symptoms came on suddenly — weakness, numbness, confusion, trouble speaking or seeing — call emergency services regardless of what this says."}
              </p>
              <button
                onClick={restart}
                className="mt-4 rounded-lg border border-[var(--border)] px-3.5 py-2 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--accent)]"
              >
                Run again
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <StepCard
            index="F"
            title="Face"
            state={step === "face" ? "active" : face ? "done" : "pending"}
            flagged={face?.flagged ?? false}
            detail={
              face
                ? face.poseValid
                  ? `Mouth-corner asymmetry ${(face.mouthAsymmetry * 100).toFixed(2)}% of face width`
                  : "Head was not frontal enough to measure reliably"
                : "Smile at the camera"
            }
          />
          <StepCard
            index="A"
            title="Arms"
            state={step === "arms" ? "active" : arms ? "done" : "pending"}
            flagged={arms?.flagged ?? false}
            detail={
              arms
                ? arms.samples < 20
                  ? "Not enough of the hold was visible to measure"
                  : `Drift difference ${(arms.driftAsymmetry * 100).toFixed(2)}% over ${arms.holdSeconds.toFixed(0)}s`
                : "Hold both arms out for ten seconds"
            }
          />
          <StepCard
            index="S"
            title="Speech"
            state={step === "speech" ? "active" : speech ? "done" : "pending"}
            flagged={speech?.flagged ?? false}
            detail={
              speech
                ? speech.accuracy !== null
                  ? `${(speech.accuracy * 100).toFixed(0)}% word match against the prompt`
                  : "Scored by self-report"
                : "Read a sentence aloud"
            }
          />
          <StepCard
            index="T"
            title="Time"
            state={step === "result" ? "done" : "pending"}
            flagged={false}
            detail="Stroke treatment is time-critical. Note when the symptoms started."
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <InterpretationPanel report={report} ready={step === "result"} />
        <SafetyNotice limits={agent.limits} tone="urgent" />
      </div>
    </div>
  );
}

function StepCard({
  index,
  title,
  state,
  flagged,
  detail,
}: {
  index: string;
  title: string;
  state: "pending" | "active" | "done";
  flagged: boolean;
  detail: string;
}) {
  const colour = flagged
    ? "var(--bad)"
    : state === "done"
      ? "var(--good)"
      : state === "active"
        ? "var(--accent)"
        : "var(--faint)";

  return (
    <div
      className="panel flex items-start gap-3.5 p-4 transition-colors"
      style={{ borderColor: state === "active" ? colour : undefined }}
    >
      <span
        className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold"
        style={{ background: `${colour}1f`, color: colour }}
      >
        {index}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--foreground)]">{title}</span>
          {flagged && (
            <span className="rounded-full border border-[#f8717155] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em] text-[var(--bad)]">
              Flagged
            </span>
          )}
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-[var(--muted)]">{detail}</p>
      </div>
    </div>
  );
}
