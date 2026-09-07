"use client";

import { useEffect, useRef, useState } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

import { loadHandLandmarker } from "@/lib/vision/mediapipe";
import type { Landmark } from "@/lib/vision/faceRegions";

export interface HandFrame {
  timestampMs: number;
  /** One entry per detected hand, in MediaPipe's 21-point layout. */
  hands: Array<{ landmarks: Landmark[]; handedness: "Left" | "Right" }>;
}

export interface HandTrackingState {
  status: "idle" | "loading" | "running" | "error";
  error: string | null;
  fps: number;
  handsVisible: number;
}

/**
 * Hand landmark tracking.
 *
 * Frame rate matters more here than anywhere else in the app: tremor sits at
 * 4-6 Hz for rest tremor and up to 12 Hz for other types, so at 30 fps we are
 * only three samples per cycle at the top of that range. The engine reports
 * the effective rate so the analysis can refuse frequencies it cannot resolve.
 */
export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onFrame: (frame: HandFrame) => void,
): HandTrackingState {
  const [state, setState] = useState<HandTrackingState>({
    status: "idle",
    error: null,
    fps: 0,
    handsVisible: 0,
  });

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, status: "idle", fps: 0, handsVisible: 0 }));
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let lastVideoTime = -1;
    let frameCount = 0;
    let windowStart = performance.now();

    setState((s) => ({ ...s, status: "loading", error: null }));

    loadHandLandmarker()
      .then((landmarker) => {
        if (cancelled) return;
        setState((s) => ({ ...s, status: "running" }));

        const tick = () => {
          if (cancelled) return;
          rafId = requestAnimationFrame(tick);

          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          if (video.currentTime === lastVideoTime) return;
          lastVideoTime = video.currentTime;

          const now = performance.now();
          let result: HandLandmarkerResult;
          try {
            result = landmarker.detectForVideo(video, now);
          } catch {
            return;
          }

          const hands = (result.landmarks ?? []).map((landmarks, i) => ({
            landmarks: landmarks as Landmark[],
            handedness:
              (result.handedness?.[i]?.[0]?.categoryName as "Left" | "Right") ?? "Right",
          }));

          onFrameRef.current({ timestampMs: now, hands });

          frameCount++;
          if (now - windowStart >= 1000) {
            const fps = (frameCount * 1000) / (now - windowStart);
            frameCount = 0;
            windowStart = now;
            setState((s) => ({ ...s, fps, handsVisible: hands.length }));
          }
        };

        rafId = requestAnimationFrame(tick);
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          error:
            err instanceof Error
              ? `Could not load the hand model: ${err.message}`
              : "Could not load the hand model.",
          fps: 0,
          handsVisible: 0,
        });
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [enabled, videoRef]);

  return state;
}
