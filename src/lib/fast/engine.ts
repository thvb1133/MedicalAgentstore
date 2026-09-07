/**
 * FAST stroke screening: Face, Arms, Speech, Time.
 *
 * The design brief for this file is different from every other agent. Stroke
 * is time-critical and treatable, so the cost of the two error types is
 * wildly asymmetric: a false alarm wastes an ambulance call, a miss can cost
 * someone the use of half their body. Every threshold here is therefore set
 * for sensitivity, and the output is always an instruction to seek care
 * rather than a probability.
 *
 * This tool cannot rule a stroke out. If the person has symptoms and this
 * screen is clear, the symptoms win. That is stated in the UI, not just here.
 */

import { mean, median, stdDev } from "../signal/filters";

export type FastStep = "face" | "arms" | "speech";

export interface FaceEvidence {
  /** Mouth-corner height difference, normalised by face width. */
  mouthAsymmetry: number;
  /** Difference in eye aspect ratio between sides. */
  eyeAsymmetry: number;
  /** Samples contributing, and whether the head stayed near-frontal. */
  samples: number;
  poseValid: boolean;
  flagged: boolean;
}

export interface ArmEvidence {
  /** Downward drift of each wrist over the hold, in normalised units. */
  leftDrift: number;
  rightDrift: number;
  /** Difference between the two, the actual sign of interest. */
  driftAsymmetry: number;
  /** Seconds the person actually held the position. */
  holdSeconds: number;
  samples: number;
  flagged: boolean;
}

export interface SpeechEvidence {
  /** What the person was asked to say. */
  target: string;
  /** What the recogniser heard, empty when unavailable. */
  heard: string;
  /** Word-level accuracy, 0-1. */
  accuracy: number | null;
  available: boolean;
  flagged: boolean;
}

export interface FastAssessment {
  face: FaceEvidence | null;
  arms: ArmEvidence | null;
  speech: SpeechEvidence | null;
  /** Number of the three domains showing a possible sign. */
  flaggedCount: number;
  /** True as soon as any single domain flags. */
  urgent: boolean;
  complete: boolean;
}

/**
 * Thresholds.
 *
 * Deliberately low. Facial asymmetry of 3% of face width is small enough that
 * many healthy faces will occasionally cross it, and that is the intended
 * behaviour — the screen is a prompt to get looked at, not a filter.
 */
const MOUTH_ASYMMETRY_FLAG = 0.03;
const EYE_ASYMMETRY_FLAG = 0.07;
const ARM_DRIFT_ASYMMETRY_FLAG = 0.045;
const SPEECH_ACCURACY_FLAG = 0.7;
/** Beyond this yaw the face is too turned for symmetry to mean anything. */
const MAX_YAW_FOR_SYMMETRY = 0.18;

export interface FaceSample {
  mouthAsymmetry: number;
  eyeAsymmetry: number;
  yaw: number;
}

/**
 * Facial droop from a series of samples taken while the person smiles.
 *
 * The median is used rather than the mean because a single frame with a bad
 * landmark fit would otherwise dominate, and because a smile is a transient —
 * we want the typical asymmetry across the expression, not its extreme.
 */
export function assessFace(samples: FaceSample[]): FaceEvidence {
  const frontal = samples.filter((s) => Math.abs(s.yaw) <= MAX_YAW_FOR_SYMMETRY);
  const poseValid = frontal.length >= Math.max(10, samples.length * 0.4);

  if (!poseValid || frontal.length < 10) {
    return {
      mouthAsymmetry: 0,
      eyeAsymmetry: 0,
      samples: frontal.length,
      poseValid: false,
      flagged: false,
    };
  }

  const mouthAsymmetry = median(frontal.map((s) => s.mouthAsymmetry));
  const eyeAsymmetry = median(frontal.map((s) => s.eyeAsymmetry));

  return {
    mouthAsymmetry,
    eyeAsymmetry,
    samples: frontal.length,
    poseValid: true,
    flagged:
      mouthAsymmetry > MOUTH_ASYMMETRY_FLAG || eyeAsymmetry > EYE_ASYMMETRY_FLAG,
  };
}

export interface ArmSample {
  timestampMs: number;
  /** Wrist heights in normalised image coordinates, y increases downwards. */
  leftWristY: number;
  rightWristY: number;
  /** Shoulder height, used as the reference so leaning does not count as drift. */
  shoulderY: number;
  leftVisible: boolean;
  rightVisible: boolean;
}

/**
 * Arm drift across a ten-second hold.
 *
 * Both wrists are measured relative to shoulder height so that leaning
 * forwards, or the camera being knocked, moves both equally and cancels. The
 * signal of interest is the *difference* between the two arms, since a person
 * who is simply tired lowers both.
 */
export function assessArms(samples: ArmSample[]): ArmEvidence {
  const usable = samples.filter((s) => s.leftVisible && s.rightVisible);
  const holdSeconds =
    usable.length < 2
      ? 0
      : (usable[usable.length - 1].timestampMs - usable[0].timestampMs) / 1000;

  if (usable.length < 20 || holdSeconds < 4) {
    return {
      leftDrift: 0,
      rightDrift: 0,
      driftAsymmetry: 0,
      holdSeconds,
      samples: usable.length,
      flagged: false,
    };
  }

  // Compare the first fifth of the hold against the last fifth.
  const chunk = Math.max(5, Math.floor(usable.length / 5));
  const startWindow = usable.slice(0, chunk);
  const endWindow = usable.slice(-chunk);

  const relative = (s: ArmSample, side: "left" | "right") =>
    (side === "left" ? s.leftWristY : s.rightWristY) - s.shoulderY;

  const leftDrift =
    mean(endWindow.map((s) => relative(s, "left"))) -
    mean(startWindow.map((s) => relative(s, "left")));
  const rightDrift =
    mean(endWindow.map((s) => relative(s, "right"))) -
    mean(startWindow.map((s) => relative(s, "right")));

  const driftAsymmetry = Math.abs(leftDrift - rightDrift);

  return {
    leftDrift,
    rightDrift,
    driftAsymmetry,
    holdSeconds,
    samples: usable.length,
    flagged: driftAsymmetry > ARM_DRIFT_ASYMMETRY_FLAG,
  };
}

/** Sentences with enough consonant clusters to expose slurring. */
export const SPEECH_PROMPTS = [
  "The early bird catches the worm",
  "You can't teach an old dog new tricks",
  "She sells seashells by the seashore",
] as const;

/**
 * Word-level accuracy between the target sentence and what was recognised.
 *
 * This is a crude proxy — a speech recogniser failing is not the same as a
 * person slurring, and background noise breaks it — so a low score flags for
 * review rather than being treated as a finding on its own.
 */
export function assessSpeech(target: string, heard: string, available: boolean): SpeechEvidence {
  if (!available || !heard.trim()) {
    return { target, heard, accuracy: null, available, flagged: false };
  }

  const normalise = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z\s']/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const targetWords = normalise(target);
  const heardWords = normalise(heard);
  if (targetWords.length === 0) {
    return { target, heard, accuracy: null, available, flagged: false };
  }

  const distance = levenshtein(targetWords, heardWords);
  const accuracy = Math.max(0, 1 - distance / targetWords.length);

  return {
    target,
    heard,
    accuracy,
    available,
    flagged: accuracy < SPEECH_ACCURACY_FLAG,
  };
}

/** Word-level edit distance. */
function levenshtein(a: string[], b: string[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array<number>(cols);
  let cur = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;

  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[cols - 1];
}

export function summarise(
  face: FaceEvidence | null,
  arms: ArmEvidence | null,
  speech: SpeechEvidence | null,
): FastAssessment {
  const flaggedCount =
    (face?.flagged ? 1 : 0) + (arms?.flagged ? 1 : 0) + (speech?.flagged ? 1 : 0);
  return {
    face,
    arms,
    speech,
    flaggedCount,
    urgent: flaggedCount > 0,
    complete: face !== null && arms !== null && speech !== null,
  };
}

/** Exposed for the arm-hold steadiness readout in the UI. */
export function holdSteadiness(samples: ArmSample[]): number | null {
  const usable = samples.filter((s) => s.leftVisible && s.rightVisible);
  if (usable.length < 10) return null;
  const spread = stdDev(usable.map((s) => s.leftWristY - s.rightWristY));
  return Math.max(0, 1 - spread / 0.06);
}
