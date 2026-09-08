/**
 * What the presenter's face is doing at a given instant.
 *
 * Kept apart from the component that draws it so the behaviour can be tested
 * without a canvas. The component's job is then only to take this answer and
 * push pixels around; every decision about how far the mouth opens is here.
 */

import type { Expression } from "./faceRig";
import { blinkAt, headPose, type HeadPose } from "./life";
import { shapeAt, type VisemeTrack } from "./visemes";

export type PresenterStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface PresenterInput {
  /** Seconds since the presenter appeared. */
  time: number;
  status: PresenterStatus;
  /** The reply being spoken, and when playback started on the same clock. */
  speech: { track: VisemeTrack; startedAt: number } | null;
  /**
   * Loudness of the speech coming out, 0 to 1, or null when it cannot be
   * measured. Shapes the amplitude; never the shape itself.
   */
  loudness: number | null;
}

export interface PresenterFrame {
  expression: Expression;
  pose: HeadPose;
}

/**
 * How much of the mouth's travel the text alone is allowed to command.
 *
 * The rest is handed to loudness. At 0.45 the mouth still moves through the
 * right shapes when the audio cannot be analysed, and when it can, a pause
 * between two words closes it properly instead of leaving it hanging open on
 * a vowel the text says should still be running.
 */
const TEXT_SHARE = 0.45;

export function presenterFrame(input: PresenterInput): PresenterFrame {
  const speaking = input.status === "speaking";
  const pose = headPose(input.time, speaking);
  const blink = blinkAt(input.time);

  if (!speaking) {
    return { expression: { jaw: 0, spread: 0, blink }, pose };
  }

  const loudness = input.loudness === null ? null : clamp01(input.loudness);

  if (!input.speech) {
    /**
     * No usable text track: this is a language the grapheme rules cannot
     * read. The mouth then does the only honest thing available, which is to
     * open in proportion to the sound coming out. It will not be in the
     * right shape, and it is better that it is not pretending to be.
     */
    const jaw = loudness === null ? 0 : clamp01(loudness * 1.5);
    return { expression: { jaw, spread: 0, blink }, pose };
  }

  const shape = shapeAt(input.speech.track, input.time - input.speech.startedAt);
  const gate = loudness === null ? 1 : TEXT_SHARE + (1 - TEXT_SHARE) * loudness;

  return {
    expression: {
      jaw: clamp01(shape.jaw * gate),
      spread: Math.max(-1, Math.min(1, shape.spread)),
      blink,
    },
    pose,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
