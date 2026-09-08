"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

import { loadFaceLandmarker } from "@/lib/vision/mediapipe";
import {
  FACE_POINTS,
  irisCircle,
  sampleRegions,
  sampleRegionsSeparately,
  skinRegions,
  type Landmark,
  type RegionSample,
} from "@/lib/vision/faceRegions";
import { combinePupils, measurePupil, type PupilSample } from "@/lib/vision/pupil";

export interface FaceFrame {
  timestampMs: number;
  landmarks: Landmark[] | null;
  /** Mean skin colour of the forehead and cheeks together. */
  skin: RegionSample | null;
  /**
   * The same skin, region by region: forehead, left cheek, right cheek.
   *
   * Kept alongside the combined figure rather than replacing it because the
   * two answer different questions. Downstream, the pulse is fused from the
   * regions weighted by how much each looks like a pulse, while skin tone and
   * the blood-pressure features want the whole face at once.
   */
  skinRegions: RegionSample[] | null;
  /**
   * Pupil size as a fraction of the iris, when the caller asked for it.
   *
   * Off by default because it costs two extra pixel readbacks per frame and
   * only one screen wants it.
   */
  pupil: PupilSample | null;
  /** Named blendshape scores from MediaPipe, e.g. eyeBlinkLeft. */
  blendshapes: Map<string, number> | null;
  /** Normalised head displacement since the previous frame. */
  motion: number;
  videoWidth: number;
  videoHeight: number;
}

export type TrackingStatus = "idle" | "loading" | "running" | "error";

export interface FaceTrackingState {
  status: TrackingStatus;
  error: string | null;
  /** Measured over the last second of the render loop. */
  fps: number;
  faceVisible: boolean;
}

/**
 * Runs the face landmarker over the camera feed and hands each frame to a
 * callback.
 *
 * The callback is held in a ref so a caller can pass an inline arrow function
 * without restarting the whole detection loop on every React render, which
 * would otherwise reset the measurement each time state updated.
 */
export interface FaceTrackingOptions {
  /** Read the pupils out of the pixels as well as the landmarks. */
  pupils?: boolean;
}

export function useFaceTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onFrame: (frame: FaceFrame) => void,
  options: FaceTrackingOptions = {},
): FaceTrackingState {
  const [state, setState] = useState<FaceTrackingState>({
    status: "idle",
    error: null,
    fps: 0,
    faceVisible: false,
  });

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const wantPupils = options.pupils ?? false;

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, status: "idle", fps: 0, faceVisible: false }));
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let lastVideoTime = -1;
    let prevNose: Landmark | null = null;
    let frameCount = 0;
    let fpsWindowStart = performance.now();
    let lastFaceVisible = false;

    // One reusable canvas for pixel readback. `willReadFrequently` moves the
    // backing store to the CPU, which is roughly ten times faster for the
    // getImageData calls we do every frame.
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    setState((s) => ({ ...s, status: "loading", error: null }));

    loadFaceLandmarker()
      .then((landmarker) => {
        if (cancelled) return;
        setState((s) => ({ ...s, status: "running" }));

        const tick = () => {
          if (cancelled) return;
          rafId = requestAnimationFrame(tick);

          const video = videoRef.current;
          if (!video || video.readyState < 2 || !ctx) return;
          // The landmarker rejects a repeated timestamp, and re-running on an
          // unchanged frame would inflate the sample rate with duplicates.
          if (video.currentTime === lastVideoTime) return;
          lastVideoTime = video.currentTime;

          const now = performance.now();
          let result: FaceLandmarkerResult;
          try {
            result = landmarker.detectForVideo(video, now);
          } catch {
            return;
          }

          const landmarks = (result.faceLandmarks?.[0] as Landmark[] | undefined) ?? null;
          let skin: RegionSample | null = null;
          let perRegion: RegionSample[] | null = null;
          let pupil: PupilSample | null = null;
          let motion = 0;

          if (landmarks) {
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }
            ctx.drawImage(video, 0, 0, w, h);

            const boxes = skinRegions(landmarks);
            if (boxes.length > 0) {
              // Read back only the face's bounding box rather than the whole
              // frame; at 720p that is about a tenth of the pixels.
              const pad = 0.02;
              const bx0 = Math.max(0, Math.floor((Math.min(...boxes.map((b) => b.x0)) - pad) * w));
              const by0 = Math.max(0, Math.floor((Math.min(...boxes.map((b) => b.y0)) - pad) * h));
              const bx1 = Math.min(w, Math.ceil((Math.max(...boxes.map((b) => b.x1)) + pad) * w));
              const by1 = Math.min(h, Math.ceil((Math.max(...boxes.map((b) => b.y1)) + pad) * h));
              const rw = Math.max(1, bx1 - bx0);
              const rh = Math.max(1, by1 - by0);
              const image = ctx.getImageData(bx0, by0, rw, rh);

              // Re-express the boxes in the cropped image's coordinates.
              const local = boxes.map((b) => ({
                x0: (b.x0 * w - bx0) / rw,
                x1: (b.x1 * w - bx0) / rw,
                y0: (b.y0 * h - by0) / rh,
                y1: (b.y1 * h - by0) / rh,
              }));
              skin = sampleRegions(image.data, rw, rh, local);
              perRegion = sampleRegionsSeparately(image.data, rw, rh, local);
            }

            if (wantPupils) {
              // One small readback per eye rather than one big one: an iris
              // is a couple of dozen pixels across, and cropping tight keeps
              // this well under the cost of the detector itself.
              const eye = (iris: readonly number[]) => {
                const circle = irisCircle(landmarks, iris, w, h);
                if (!circle) return null;
                const pad = circle.r * 1.6;
                const x0 = Math.max(0, Math.floor(circle.x - pad));
                const y0 = Math.max(0, Math.floor(circle.y - pad));
                const x1 = Math.min(w, Math.ceil(circle.x + pad));
                const y1 = Math.min(h, Math.ceil(circle.y + pad));
                if (x1 - x0 < 6 || y1 - y0 < 6) return null;
                const patch = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
                return measurePupil(
                  patch.data,
                  x1 - x0,
                  y1 - y0,
                  { x: circle.x - x0, y: circle.y - y0 },
                  circle.r,
                );
              };
              pupil = combinePupils(eye(FACE_POINTS.leftIris), eye(FACE_POINTS.rightIris));
            }

            const nose = landmarks[1];
            if (prevNose) motion = Math.hypot(nose.x - prevNose.x, nose.y - prevNose.y);
            prevNose = nose;
          } else {
            prevNose = null;
          }

          let blendshapes: Map<string, number> | null = null;
          const categories = result.faceBlendshapes?.[0]?.categories;
          if (categories) {
            blendshapes = new Map();
            for (const c of categories) {
              if (c.categoryName) blendshapes.set(c.categoryName, c.score);
            }
          }

          onFrameRef.current({
            timestampMs: now,
            landmarks,
            skin,
            skinRegions: perRegion,
            pupil,
            blendshapes,
            motion,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
          });

          frameCount++;
          const visible = landmarks !== null;
          if (now - fpsWindowStart >= 1000) {
            const fps = (frameCount * 1000) / (now - fpsWindowStart);
            frameCount = 0;
            fpsWindowStart = now;
            setState((s) => ({ ...s, fps, faceVisible: visible }));
            lastFaceVisible = visible;
          } else if (visible !== lastFaceVisible) {
            lastFaceVisible = visible;
            setState((s) => ({ ...s, faceVisible: visible }));
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
              ? `Could not load the face model: ${err.message}`
              : "Could not load the face model.",
          fps: 0,
          faceVisible: false,
        });
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [enabled, videoRef, wantPupils]);

  return state;
}
