/**
 * Playing a composed reply as a sequence of signs and spelled words.
 *
 * Kept free of any canvas so the timing can be tested directly. "What is the
 * signer doing 2.3 seconds in" has one right answer and should not need a
 * browser to ask.
 *
 * Signs and fingerspelling run on the same clock but not at the same rate. A
 * sign has its own duration written into the lexicon, because HELLO is a
 * single sweep and BREATHE is two full cycles and giving them the same slot
 * makes one rushed and the other dead. Fingerspelling runs at a letters-per
 * second rate instead, which is how a signer thinks about it.
 */

import { toFingerspelling } from "./alphabet";
import { blendFace, NEUTRAL_FACE } from "./body";
import { blendPoses } from "./hand";
import { REST_FRAME, frameOf, type ResolvedFrame } from "./lexicon";
import { frameAt as spellFrameAt } from "./schedule";
import type { Marking, Segment } from "./compose";

/** The shortest transition between two segments, even adjacent ones. */
const MIN_GAP = 0.14;
const MAX_GAP = 0.55;

/**
 * How fast a hand crosses signing space between segments, in body units per
 * second.
 *
 * Transitions are timed from the distance actually travelled rather than
 * given a fixed beat. A hand going from the forehead to the opposite hip has
 * four times as far to go as one moving across the chest, and giving them the
 * same slot makes the long one snap — which reads as a dropped frame rather
 * than as movement.
 */
const TRAVEL_SPEED = 2;

/** A pause at a sentence boundary. */
const PAUSE = 0.45;

export interface SequenceStep {
  segment: Segment;
  start: number;
  end: number;
}

export interface Timeline {
  steps: SequenceStep[];
  duration: number;
}

function lengthOf(segment: Segment, lettersPerSecond: number): number {
  if (segment.kind === "sign") return segment.sign.duration;
  if (segment.kind === "spell") {
    return toFingerspelling(segment.text).length / Math.max(0.4, lettersPerSecond);
  }
  return PAUSE;
}

function travelTime(from: ResolvedFrame, to: ResolvedFrame): number {
  const reach = Math.max(
    Math.hypot(to.right.at.x - from.right.at.x, to.right.at.y - from.right.at.y),
    Math.hypot(to.left.at.x - from.left.at.x, to.left.at.y - from.left.at.y),
  );
  return Math.min(MAX_GAP, Math.max(MIN_GAP, reach / TRAVEL_SPEED));
}

export function buildTimeline(segments: Segment[], lettersPerSecond: number): Timeline {
  const steps: SequenceStep[] = [];
  let clock = 0;
  let previous: Segment | null = null;

  for (const segment of segments) {
    if (previous) {
      clock += travelTime(
        endFrameOf(previous, lettersPerSecond),
        startFrameOf(segment, lettersPerSecond),
      );
    } else {
      // A lead-in from rest, so the first sign is arrived at rather than
      // being there already the instant playback starts.
      clock += travelTime(RESTING, startFrameOf(segment, lettersPerSecond));
    }
    const length = lengthOf(segment, lettersPerSecond);
    steps.push({ segment, start: clock, end: clock + length });
    clock += length;
    previous = segment;
  }

  return { steps, duration: clock };
}

export interface SigningState {
  frame: ResolvedFrame;
  /** The step being performed, or null between and after them. */
  step: SequenceStep | null;
  /** Index into the step list, for highlighting the gloss. */
  index: number;
  /** The letter currently being formed, when fingerspelling. */
  letter: string | null;
  finished: boolean;
}

const RESTING: ResolvedFrame = {
  right: REST_FRAME.right!,
  left: REST_FRAME.left!,
  face: NEUTRAL_FACE,
};

/**
 * Where the hands wait at a sentence boundary.
 *
 * Not all the way down at the sides. A signer pausing mid-utterance holds
 * their hands up in neutral space, and dropping fully to rest reads as
 * "finished" — which is a real distinction in the language, not a stylistic
 * one.
 */
const PAUSED: ResolvedFrame = {
  right: { ...RESTING.right, at: { x: -0.42, y: 0.3 } },
  left: { ...RESTING.left, at: { x: 0.42, y: 0.3 } },
  face: NEUTRAL_FACE,
};

/**
 * The signer at a moment in time.
 *
 * Between steps the hands travel back toward rest rather than jumping from
 * the end of one sign to the start of the next. The transitional movement
 * between signs carries real information to a reader — it is where sign
 * boundaries live — and a hard cut is both harder to read and obviously
 * mechanical.
 */
export function stateAt(
  timeline: Timeline,
  time: number,
  lettersPerSecond: number,
): SigningState {
  if (timeline.steps.length === 0) {
    return { frame: RESTING, step: null, index: -1, letter: null, finished: true };
  }
  if (time < 0) {
    return { frame: RESTING, step: null, index: -1, letter: null, finished: false };
  }

  for (let i = 0; i < timeline.steps.length; i++) {
    const step = timeline.steps[i];
    if (time > step.end) continue;

    if (time < step.start) {
      // In the gap before this step: ease out of the previous shape toward
      // the start of this one, through a partial relaxation.
      const previous = i > 0 ? timeline.steps[i - 1] : null;
      const gapStart = previous ? previous.end : 0;
      const span = Math.max(1e-6, step.start - gapStart);
      const t = (time - gapStart) / span;
      const from = previous ? endFrameOf(previous.segment, lettersPerSecond) : RESTING;
      const to = startFrameOf(step.segment, lettersPerSecond);
      return {
        frame: blendResolved(from, to, ease(t)),
        step: null,
        index: -1,
        letter: null,
        finished: false,
      };
    }

    const progress = (time - step.start) / Math.max(1e-6, step.end - step.start);

    if (step.segment.kind === "sign") {
      return {
        frame: marked(frameOf(step.segment.sign, progress), step.segment.marking),
        step,
        index: i,
        letter: null,
        finished: false,
      };
    }

    if (step.segment.kind === "spell") {
      const units = toFingerspelling(step.segment.text);
      const spelling = spellFrameAt(units, time - step.start, lettersPerSecond);
      return {
        frame: marked(spellingFrame(spelling.pose, spelling.offset), step.segment.marking),
        step,
        index: i,
        letter: spelling.glyph,
        finished: false,
      };
    }

    return { frame: PAUSED, step, index: i, letter: null, finished: false };
  }

  return {
    frame: RESTING,
    step: null,
    index: timeline.steps.length,
    letter: null,
    finished: true,
  };
}

/**
 * Fingerspelling, placed in signing space.
 *
 * A signer fingerspells at a consistent spot — roughly shoulder height on the
 * dominant side, near the face so a reader can watch the hand and the face at
 * once — rather than wherever the last sign happened to finish. Putting it in
 * a fixed place is part of what makes it readable.
 */
function spellingFrame(
  pose: ResolvedFrame["right"]["shape"],
  offset: { x: number; y: number },
): ResolvedFrame {
  return {
    right: {
      shape: pose,
      at: { x: -0.42 + offset.x * 0.5, y: -0.36 + offset.y * 0.5 },
      z: 0.25,
    },
    left: RESTING.left,
    face: NEUTRAL_FACE,
  };
}

/**
 * Apply the clause-level question marking to a frame.
 *
 * The brows are held across every sign in the question rather than being
 * pulsed on one of them, because that is what the marker is: it scopes over
 * the clause. A sign's own brow position only wins where the sign already
 * calls for something stronger — WHAT is a wh-question whether or not the
 * sentence around it was punctuated as one.
 */
function marked(frame: ResolvedFrame, marking: Marking): ResolvedFrame {
  if (marking === "none") return frame;
  const target = marking === "yes-no" ? 1 : -1;
  const own = frame.face.brows;
  const brows = Math.abs(own) > Math.abs(target) ? own : target;
  return { ...frame, face: { ...frame.face, brows } };
}

function startFrameOf(segment: Segment, lettersPerSecond: number): ResolvedFrame {
  if (segment.kind === "sign") return frameOf(segment.sign, 0);
  if (segment.kind === "spell") {
    const spelling = spellFrameAt(toFingerspelling(segment.text), 0, lettersPerSecond);
    return spellingFrame(spelling.pose, spelling.offset);
  }
  return PAUSED;
}

function endFrameOf(segment: Segment, lettersPerSecond: number): ResolvedFrame {
  if (segment.kind === "sign") return frameOf(segment.sign, 1);
  if (segment.kind === "spell") {
    const units = toFingerspelling(segment.text);
    const spelling = spellFrameAt(units, lengthOf(segment, lettersPerSecond), lettersPerSecond);
    return spellingFrame(spelling.pose, spelling.offset);
  }
  return PAUSED;
}

function ease(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

function blendResolved(a: ResolvedFrame, b: ResolvedFrame, t: number): ResolvedFrame {
  return {
    right: blendHandFrame(a.right, b.right, t),
    left: blendHandFrame(a.left, b.left, t),
    face: blendFace(a.face, b.face, t),
  };
}

function blendHandFrame(
  a: ResolvedFrame["right"],
  b: ResolvedFrame["right"],
  t: number,
): ResolvedFrame["right"] {
  return {
    shape: blendPoses(a.shape, b.shape, t),
    at: { x: a.at.x + (b.at.x - a.at.x) * t, y: a.at.y + (b.at.y - a.at.y) * t },
    z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
  };
}
