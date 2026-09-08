/**
 * Building a rig from a photograph somebody has just uploaded.
 *
 * The five built-in presenters have their landmarks found at build time and
 * committed, which is why they animate on the first frame. An uploaded
 * photograph obviously cannot, so this does the same work in the browser: run
 * the face mesh over the image once, keep the 478 points, and hand them to
 * the same renderer.
 *
 * Once is the important word. Detection needs a 3.8 MB model and about a
 * second of WASM start-up, and the answer is a property of the photograph
 * rather than of the session — so it is cached next to the photograph and a
 * reload picks it straight back up.
 *
 * A photograph the mesh cannot read is common and is not an error: people
 * upload pictures at an angle, in the dark, with sunglasses on, or with two
 * faces in them. The caller gets a reason it can show rather than a failure,
 * and the still frame is used instead.
 */

import type { FaceRig } from "./faceRig";
import { loadStillFaceLandmarker } from "@/lib/vision/mediapipe";

export type RigFailure = "no-face" | "unsupported" | "failed";

export interface RigResult {
  rig: FaceRig | null;
  failure: RigFailure | null;
}

const CACHE_KEY = "sanjivani-setu.portrait-rig.v1";

/**
 * Which photograph a cached rig belongs to.
 *
 * A cheap content hash rather than the image itself: storage is about five
 * megabytes and the photograph is already using a good part of it. What this
 * has to catch is a rig outliving the picture it describes, which would warp
 * the wrong face in the wrong places, and a hash catches that fine.
 */
export function fingerprint(dataUrl: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dataUrl.length; i++) {
    hash ^= dataUrl.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${dataUrl.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

interface CachedRig {
  key: string;
  rig: FaceRig;
}

export function readCachedRig(dataUrl: string): FaceRig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedRig;
    if (cached.key !== fingerprint(dataUrl)) return null;
    return isRig(cached.rig) ? cached.rig : null;
  } catch {
    return null;
  }
}

export function writeCachedRig(dataUrl: string, rig: FaceRig | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!rig) {
      window.localStorage.removeItem(CACHE_KEY);
      return;
    }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ key: fingerprint(dataUrl), rig }));
  } catch {
    // Out of quota. Detection simply runs again next time, which is slow but
    // correct, and is better than dropping the photograph to make room.
  }
}

export function isRig(value: unknown): value is FaceRig {
  if (typeof value !== "object" || value === null) return false;
  const rig = value as FaceRig;
  return (
    typeof rig.width === "number" &&
    typeof rig.height === "number" &&
    Array.isArray(rig.points) &&
    // The refined mesh, with the iris points. Everything downstream indexes
    // into it by number, so a short list is worse than no list.
    rig.points.length >= 478 &&
    rig.points.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]))
  );
}

/** Round to a hundredth of a pixel; it keeps the cached JSON a third smaller. */
function round(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

export async function detectRig(dataUrl: string): Promise<RigResult> {
  const cached = readCachedRig(dataUrl);
  if (cached) return { rig: cached, failure: null };

  if (typeof window === "undefined" || typeof createImageBitmap !== "function") {
    return { rig: null, failure: "unsupported" };
  }

  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const landmarker = await loadStillFaceLandmarker();
    const bitmap = await createImageBitmap(image);
    let points;
    try {
      points = landmarker.detect(bitmap).faceLandmarks?.[0];
    } finally {
      bitmap.close();
    }

    if (!points || points.length < 478) return { rig: null, failure: "no-face" };

    const rig: FaceRig = {
      width: image.naturalWidth,
      height: image.naturalHeight,
      points: points.map((p) => [round(p.x), round(p.y)]),
    };
    writeCachedRig(dataUrl, rig);
    return { rig, failure: null };
  } catch {
    return { rig: null, failure: "failed" };
  }
}

export const RIG_MESSAGE: Record<RigFailure, string> = {
  "no-face":
    "No face found in that picture, so it will be shown still rather than talking. A photo taken straight on, in good light, with the whole face visible usually works.",
  unsupported: "This browser cannot analyse the picture, so it will be shown still rather than talking.",
  failed: "The picture could not be analysed, so it will be shown still rather than talking.",
};
