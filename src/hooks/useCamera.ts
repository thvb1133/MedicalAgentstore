"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "denied"
  | "unavailable"
  | "error";

export interface CameraState {
  status: CameraStatus;
  error: string | null;
  /** Frame rate the browser actually granted, once known. */
  actualFps: number | null;
  width: number | null;
  height: number | null;
}

export interface CameraOptions {
  /** 60 fps matters for saccade timing; 30 is plenty for pulse. */
  idealFps?: number;
  idealWidth?: number;
  idealHeight?: number;
  facingMode?: "user" | "environment";
}

/**
 * Camera acquisition with the failure modes spelled out.
 *
 * Browsers throw half a dozen different errors here and the generic message
 * is useless to a user standing in front of a laptop, so each one is mapped
 * to something actionable.
 */
export function useCamera(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  options: CameraOptions = {},
): CameraState & { retry: () => void } {
  const {
    idealFps = 30,
    idealWidth = 1280,
    idealHeight = 720,
    facingMode = "user",
  } = options;

  const [state, setState] = useState<CameraState>({
    status: "idle",
    error: null,
    actualFps: null,
    width: null,
    height: null,
  });
  const streamRef = useRef<MediaStream | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!enabled) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setState((s) => ({ ...s, status: "idle", error: null }));
      return;
    }

    let cancelled = false;

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState({
          status: "unavailable",
          error:
            "This browser cannot access the camera. Chrome, Edge or Safari over HTTPS is required.",
          actualFps: null,
          width: null,
          height: null,
        });
        return;
      }

      setState((s) => ({ ...s, status: "requesting", error: null }));

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: idealWidth },
            height: { ideal: idealHeight },
            frameRate: { ideal: idealFps },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }

        const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
        setState({
          status: "ready",
          error: null,
          actualFps: settings.frameRate ?? null,
          width: settings.width ?? null,
          height: settings.height ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        const message =
          name === "NotAllowedError"
            ? "Camera permission was refused. Allow it in the browser address bar, then retry."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : name === "NotReadableError"
                ? "The camera is already in use by another application. Close it and retry."
                : name === "OverconstrainedError"
                  ? "This camera cannot provide the requested resolution or frame rate."
                  : err instanceof Error
                    ? err.message
                    : "Unknown camera error.";
        setState({
          status: name === "NotAllowedError" ? "denied" : "error",
          error: message,
          actualFps: null,
          width: null,
          height: null,
        });
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled, attempt, facingMode, idealFps, idealWidth, idealHeight, videoRef]);

  return { ...state, retry };
}
