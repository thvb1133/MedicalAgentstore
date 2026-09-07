"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";

import { loadPoseLandmarker } from "@/lib/vision/mediapipe";
import type { Landmark } from "@/lib/vision/faceRegions";

export interface PoseFrame {
  timestampMs: number;
  /** 33-point body pose, or null when no person was detected. */
  landmarks: Landmark[] | null;
  /** Per-landmark visibility, used to ignore occluded joints. */
  visibility: number[] | null;
}

export interface PoseTrackingState {
  status: "idle" | "loading" | "running" | "error";
  error: string | null;
  poseVisible: boolean;
}

/** MediaPipe pose landmark indices used by the arm-drift test. */
export const POSE_POINTS = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

export function usePoseTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onFrame: (frame: PoseFrame) => void,
): PoseTrackingState {
  const [state, setState] = useState<PoseTrackingState>({
    status: "idle",
    error: null,
    poseVisible: false,
  });

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, status: "idle", poseVisible: false }));
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let lastVideoTime = -1;
    let lastVisible = false;

    setState((s) => ({ ...s, status: "loading", error: null }));

    loadPoseLandmarker()
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
          let result: PoseLandmarkerResult;
          try {
            result = landmarker.detectForVideo(video, now);
          } catch {
            return;
          }

          const raw = result.landmarks?.[0];
          const landmarks = (raw as Landmark[] | undefined) ?? null;
          const visibility = raw
            ? raw.map((p) => (p as { visibility?: number }).visibility ?? 1)
            : null;

          onFrameRef.current({ timestampMs: now, landmarks, visibility });

          const visible = landmarks !== null;
          if (visible !== lastVisible) {
            lastVisible = visible;
            setState((s) => ({ ...s, poseVisible: visible }));
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
              ? `Could not load the pose model: ${err.message}`
              : "Could not load the pose model.",
          poseVisible: false,
        });
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [enabled, videoRef]);

  return state;
}
