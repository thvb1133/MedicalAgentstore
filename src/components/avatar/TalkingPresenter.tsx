"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { asset } from "@/lib/paths";
import type { AvatarPreset } from "@/lib/avatar/presets";
import { getRig, type FaceRig } from "@/lib/avatar/faceRig";
import { presenterFrame, type PresenterStatus } from "@/lib/avatar/presenter";
import { supportsVisemes, visemeTrack, type VisemeTrack } from "@/lib/avatar/visemes";
import type { SpeechFrame } from "@/hooks/useConversation";

import { buildScene, drawPresenter } from "./renderPresenter";

/**
 * A photograph of somebody who does not exist, animated while it talks.
 *
 * The earlier portraits were illustrations and deliberately still, and the
 * reason given was a good one: driving a mouth on a face from audio is the
 * mechanism of a deepfake, and a face that appears to be speaking borrows the
 * authority of whoever it belongs to.
 *
 * That reasoning turns entirely on the face belonging to someone. These do
 * not. Every presenter here was generated — there is no sitter, no likeness,
 * nobody who could be made to appear to say something they did not say. The
 * risk the stillness was protecting against is absent, so the stillness costs
 * something and protects nothing.
 *
 * What the line protects instead is the case where the risk is real: a
 * photograph a person uploads. Those are almost always of somebody — the user
 * or, worse, their doctor — and they stay still. `PortraitPresence` handles
 * them and does not have a mouth rig at all, which is a stronger guarantee
 * than a flag would be.
 *
 * The remaining honesty problem is that a convincing face makes health
 * information sound more authoritative than it is, and that is not solved by
 * refusing to animate. It is solved by the badge on the tile, which says this
 * is synthetic and stays on screen the whole time.
 */

export interface TalkingPresenterProps {
  avatar: AvatarPreset;
  status: PresenterStatus;
  /** Polled once per frame for what is currently being spoken. */
  readSpeech?: () => SpeechFrame | null;
  /** Decides whether mouth shapes can be read out of the reply's spelling. */
  languageCode?: string;
  heartRateBpm?: number | null;
  /**
   * Mouth a line of text on a synthetic clock, with no audio, so the effect
   * can be seen before committing to an avatar. Silent on purpose, and
   * labelled as a preview so a moving mouth with no sound is never mistaken
   * for a fault.
   */
  preview?: string | null;
  /** Picker size, where the full disclosure would cover the face it labels. */
  compact?: boolean;
  /** An uploaded photograph, used in place of the preset presenter. */
  customImage?: string | null;
  /** The mesh found in that photograph. Without it there is nothing to warp. */
  customRig?: FaceRig | null;
  className?: string;
}

const STATUS_LABEL: Record<PresenterStatus, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Stopped",
};

/** Words a minute for the preview clock, at an unhurried speaking pace. */
const PREVIEW_WPM = 130;

export function TalkingPresenter({
  avatar,
  status,
  readSpeech,
  languageCode = "en-GB",
  heartRateBpm,
  preview = null,
  compact = false,
  customImage = null,
  customRig = null,
  className,
}: TalkingPresenterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  // An uploaded photograph wins over the preset, but only when its face was
  // actually found. A picture with a rig from some other picture would warp
  // the wrong places, so the two always travel together.
  const uploaded = customImage && customRig ? { rig: customRig, source: customImage } : null;
  const rig = useMemo(
    () => uploaded?.rig ?? getRig(avatar.id),
    [uploaded?.rig, avatar.id],
  );
  const scene = useMemo(() => (rig ? buildScene(rig) : null), [rig]);
  const source = uploaded?.source ?? photoFor(avatar.id);
  const isUpload = uploaded !== null;

  const imageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!source) return;
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    const done = () => {
      imageRef.current = image;
      setReady(true);
    };
    if (image.complete) done();
    else image.onload = done;
    return () => {
      image.onload = null;
      setReady(false);
    };
  }, [source]);

  const previewTrack = useMemo(
    () => (preview ? visemeTrack(preview, wordCount(preview) / (PREVIEW_WPM / 60)) : null),
    [preview],
  );

  // Everything the loop reads that can change between frames, kept in a ref so
  // that changing the status does not tear down and rebuild the animation.
  const live = useRef({ status, readSpeech, languageCode, heartRateBpm, previewTrack });
  live.current = { status, readSpeech, languageCode, heartRateBpm, previewTrack };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || !ready) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let handle = 0;
    const started = performance.now();

    /** Cached so the whole reply is not re-parsed on every frame. */
    let track: { text: string; duration: number; value: VisemeTrack } | null = null;
    let smoothed = 0;

    const render = (now: number) => {
      const state = live.current;
      const image = imageRef.current;
      if (!image) {
        handle = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const elapsed = (now - started) / 1000;
      const speech = state.readSpeech?.() ?? null;

      let input;
      if (speech && state.status === "speaking") {
        /**
         * Shapes need the whole reply and its length. The length arrives from
         * the audio element a moment after playback begins, so until it does
         * the mouth runs on loudness alone rather than on a guessed duration
         * that would put every shape in the wrong place.
         */
        const usable = supportsVisemes(state.languageCode ?? "en-GB") && speech.duration !== null;
        if (usable && (!track || track.text !== speech.text || track.duration !== speech.duration)) {
          track = {
            text: speech.text,
            duration: speech.duration as number,
            value: visemeTrack(speech.text, speech.duration as number),
          };
        }
        const level = speech.level;
        smoothed = level === null ? 0 : smoothed + (level - smoothed) * (level > smoothed ? 0.5 : 0.16);
        input = {
          time: elapsed,
          status: state.status,
          speech: usable && track ? { track: track.value, startedAt: elapsed - speech.time } : null,
          loudness: level === null ? null : smoothed,
        };
      } else if (state.previewTrack && state.status !== "speaking") {
        const period = state.previewTrack.duration + 1.4;
        input = {
          time: elapsed,
          status: "speaking" as PresenterStatus,
          speech: { track: state.previewTrack, startedAt: elapsed - (elapsed % period) },
          loudness: null,
        };
      } else {
        track = null;
        input = { time: elapsed, status: state.status, speech: null, loudness: null };
      }

      const frame = presenterFrame(input);
      drawPresenter(ctx, scene, image, frame.expression, frame.pose, width, height);

      // Read by the browser verification, which has no way to look at a
      // canvas and tell whether the mouth is moving for the right reason.
      canvas.dataset.jaw = frame.expression.jaw.toFixed(3);
      canvas.dataset.blink = frame.expression.blink.toFixed(3);

      handle = requestAnimationFrame(render);
    };

    handle = requestAnimationFrame(render);
    return () => cancelAnimationFrame(handle);
  }, [scene, ready]);

  if (!rig || !source) return null;

  const speaking = status === "speaking";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${className ?? ""}`}
      style={{
        borderColor: speaking ? `${avatar.palette.core}aa` : "var(--border)",
        background: "var(--surface-raised)",
        aspectRatio: "4 / 3",
      }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        role="img"
        aria-label={
          isUpload
            ? `An AI presenter animated from your own picture, ${STATUS_LABEL[status].toLowerCase()}`
            : `${avatar.name}, a synthetic presenter, ${STATUS_LABEL[status].toLowerCase()}`
        }
      />

      {/*
        The badge is not decoration and is not dismissible. A face this
        convincing saying "your blood pressure looks raised" is exactly the
        situation where somebody needs to be able to see, at a glance and at
        any moment, that there is no clinician on the other end of it.
      */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 ${
          compact ? "p-1.5" : "p-2.5"
        }`}
      >
        <span
          className={`rounded-md font-medium tracking-tight text-white backdrop-blur-sm ${
            compact ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-1 text-[11px]"
          }`}
          style={{ background: "#0f172acc" }}
        >
          {compact
            ? "AI avatar"
            : isUpload
              ? "AI avatar · animated from your picture"
              : `${avatar.name} · AI avatar, not a real person`}
        </span>
        {!compact && (
          <span
            className="rounded-md px-2 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em] backdrop-blur-sm"
            style={{
              background: "#0f172acc",
              color: status === "error" ? "#fca5a5" : avatar.palette.ring,
            }}
          >
            {preview && !speaking ? "Preview" : STATUS_LABEL[status]}
          </span>
        )}
      </div>

      {!compact && heartRateBpm && heartRateBpm > 30 && heartRateBpm < 220 ? (
        <span
          className="pointer-events-none absolute right-2.5 top-2.5 rounded-md px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
          style={{ background: "#0f172acc" }}
        >
          {Math.round(heartRateBpm)} bpm
        </span>
      ) : null}
    </div>
  );
}

/** Whether an avatar has a built-in presenter at all. */
export function hasPresenter(avatarId: string): boolean {
  return getRig(avatarId) !== null;
}

/**
 * Whether there is anything to animate: an uploaded photograph whose face was
 * found, or a preset that ships with a rig. Pip has neither, by design.
 */
export function canPresent(
  avatarId: string,
  customImage: string | null,
  customRig: FaceRig | null,
): boolean {
  if (customImage && customRig) return true;
  return hasPresenter(avatarId);
}

export function photoFor(avatarId: string): string | null {
  return getRig(avatarId) ? asset(`/portraits/${avatarId}.photo.webp`) : null;
}

export function photoSquareFor(avatarId: string): string | null {
  return getRig(avatarId) ? asset(`/portraits/${avatarId}.photo.square.webp`) : null;
}

function wordCount(text: string): number {
  return Math.max(1, text.trim().split(/\s+/).length);
}
