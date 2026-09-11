"use client";

import type { CameraState } from "@/hooks/useCamera";
import type { TrackingStatus } from "@/hooks/useFaceTracking";

export interface CameraStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camera: CameraState & { retry: () => void };
  trackingStatus: TrackingStatus;
  trackingError: string | null;
  faceVisible: boolean;
  /** Drawn over the video, e.g. landmark overlays. */
  overlay?: React.ReactNode;
  /** Guidance shown at the bottom of the frame. */
  hint?: string | null;
  mirrored?: boolean;
}

/**
 * The camera preview and everything that can go wrong with it.
 *
 * Permission prompts, missing hardware and model download all surface here
 * rather than as a blank rectangle, because on a stage a blank rectangle is
 * indistinguishable from a crash.
 */
export function CameraStage({
  videoRef,
  camera,
  trackingStatus,
  trackingError,
  faceVisible,
  overlay,
  hint,
  mirrored = true,
}: CameraStageProps) {
  const blocking =
    camera.status === "denied" ||
    camera.status === "error" ||
    camera.status === "unavailable" ||
    trackingStatus === "error";

  return (
    <div className="panel relative aspect-video w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className={`h-full w-full object-cover ${mirrored ? "mirror" : ""}`}
      />

      {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}

      {/* Status chip */}
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: faceVisible
              ? "var(--good)"
              : trackingStatus === "running"
                ? "var(--fair)"
                : "var(--faint)",
          }}
        />
        <span className="text-[11px] font-medium text-[var(--muted)]">
          {trackingStatus === "loading"
            ? "Loading face model"
            : faceVisible
              ? "Face tracked"
              : trackingStatus === "running"
                ? "Looking for a face"
                : "Camera idle"}
        </span>
      </div>

      {camera.status === "requesting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <div className="shimmer mx-auto h-1 w-32 rounded-full bg-[var(--track)]" />
            <p className="mt-4 text-sm text-[var(--muted)]">
              Waiting for camera permission
            </p>
          </div>
        </div>
      )}

      {trackingStatus === "loading" && camera.status === "ready" && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 backdrop-blur">
          <div className="shimmer h-1 w-full rounded-full bg-[var(--track)]" />
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Loading the face model — first run only, about 4 MB
          </p>
        </div>
      )}

      {blocking && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6">
          <div className="max-w-sm text-center">
            <p className="text-sm font-medium text-[var(--bad)]">
              {trackingStatus === "error" ? "Model failed to load" : "Camera unavailable"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {trackingError ?? camera.error}
            </p>
            <button
              onClick={camera.retry}
              className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--accent)]"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {hint && !blocking && (
        <div className="absolute inset-x-3 bottom-3 rounded-lg bg-black/65 px-3 py-2 text-center text-[12px] text-[var(--foreground)] backdrop-blur">
          {hint}
        </div>
      )}
    </div>
  );
}
