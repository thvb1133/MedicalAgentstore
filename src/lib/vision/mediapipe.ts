/**
 * MediaPipe Tasks Vision loading.
 *
 * Models and the WASM runtime are served from `/mediapipe` in our own public
 * directory when `npm run fetch-models` has been run, and fall back to the
 * Google CDN otherwise. Local files are strongly preferred for a live demo:
 * a venue's wifi failing should not take the app down, and the first-load
 * delay disappears.
 */

import type {
  FaceLandmarker,
  HandLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

const LOCAL_WASM = "/mediapipe/wasm";
const CDN_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

const MODELS = {
  face: {
    local: "/mediapipe/models/face_landmarker.task",
    cdn: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  },
  hand: {
    local: "/mediapipe/models/hand_landmarker.task",
    cdn: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
  pose: {
    local: "/mediapipe/models/pose_landmarker_lite.task",
    cdn: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  },
} as const;

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveAsset(asset: { local: string; cdn: string }): Promise<string> {
  return (await exists(asset.local)) ? asset.local : asset.cdn;
}

let visionResolverPromise: Promise<unknown> | null = null;

async function getVisionResolver() {
  if (!visionResolverPromise) {
    visionResolverPromise = (async () => {
      const { FilesetResolver } = await import("@mediapipe/tasks-vision");
      const base = (await exists(`${LOCAL_WASM}/vision_wasm_internal.js`))
        ? LOCAL_WASM
        : CDN_WASM;
      return FilesetResolver.forVisionTasks(base);
    })();
  }
  return visionResolverPromise;
}

let facePromise: Promise<FaceLandmarker> | null = null;

/**
 * Face landmarker with iris refinement and blendshapes.
 *
 * Iris landmarks are what make gaze and pupillometry possible at all, and
 * blendshapes give us a well-calibrated eye-closure signal for free, which is
 * more stable than computing eye aspect ratio from raw points.
 */
export async function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (!facePromise) {
    facePromise = (async () => {
      const [{ FaceLandmarker: FL }, resolver, modelAssetPath] = await Promise.all([
        import("@mediapipe/tasks-vision"),
        getVisionResolver(),
        resolveAsset(MODELS.face),
      ]);
      return FL.createFromOptions(resolver as never, {
        baseOptions: { modelAssetPath, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })();
  }
  return facePromise;
}

let handPromise: Promise<HandLandmarker> | null = null;

export async function loadHandLandmarker(): Promise<HandLandmarker> {
  if (!handPromise) {
    handPromise = (async () => {
      const [{ HandLandmarker: HL }, resolver, modelAssetPath] = await Promise.all([
        import("@mediapipe/tasks-vision"),
        getVisionResolver(),
        resolveAsset(MODELS.hand),
      ]);
      return HL.createFromOptions(resolver as never, {
        baseOptions: { modelAssetPath, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })();
  }
  return handPromise;
}

let posePromise: Promise<PoseLandmarker> | null = null;

export async function loadPoseLandmarker(): Promise<PoseLandmarker> {
  if (!posePromise) {
    posePromise = (async () => {
      const [{ PoseLandmarker: PL }, resolver, modelAssetPath] = await Promise.all([
        import("@mediapipe/tasks-vision"),
        getVisionResolver(),
        resolveAsset(MODELS.pose),
      ]);
      return PL.createFromOptions(resolver as never, {
        baseOptions: { modelAssetPath, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })();
  }
  return posePromise;
}
