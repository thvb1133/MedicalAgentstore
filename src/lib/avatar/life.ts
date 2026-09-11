/**
 * The small movements that stop a photograph looking like a photograph.
 *
 * A face that holds perfectly still for ten seconds stops reading as a face
 * and starts reading as a freeze-frame, and the viewer's next thought is that
 * the call has dropped. Two things fix it, both below the level anyone
 * consciously notices: blinking, and a very slight drift.
 *
 * Blinking is the one that matters. People blink every few seconds without
 * ever deciding to, and its absence is conspicuous in a way its presence
 * never is. The interval here is jittered rather than fixed, because a face
 * blinking on a metronome is its own kind of wrong.
 *
 * The drift moves the whole frame, background included, which is a
 * compromise. A real sitter's head moves against a still room, and separating
 * the two would mean cutting the head out and warping the neck to match. At
 * this amplitude — a fraction of a percent — what it reads as is the small
 * instability of a webcam being held up by a laptop hinge, which is what the
 * eye expects from a video call anyway.
 *
 * All of it is a pure function of elapsed time, so it is deterministic, it
 * needs no state, and a test can ask what the face is doing at any moment.
 */

export interface HeadPose {
  /** Fractions of the frame's width and height. */
  dx: number;
  dy: number;
  /** Radians. */
  tilt: number;
  scale: number;
}

const BLINK = {
  /** Shortest gap between blinks. */
  minGap: 2.2,
  /** How much the gap wanders on top of the minimum. */
  jitter: 4.4,
  /** A blink is quick: shutting is faster than opening again. */
  close: 0.075,
  open: 0.12,
} as const;

/**
 * A stable pseudo-random value for the nth blink.
 *
 * Deliberately not `Math.random`: the schedule has to be the same every time
 * it is asked about a given moment, or a component that re-renders would give
 * a different answer for the same instant and the eyes would stutter.
 */
function jitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How shut the eyes are at a given time, 0 to 1.
 *
 * Walks forward through the schedule rather than solving it, which is fine
 * because it is only ever asked about the current frame and a blink or two
 * per second of elapsed time is nothing. The walk is capped so that a tab
 * left open overnight cannot turn one frame into a long loop.
 */
export function blinkAt(time: number): number {
  if (time <= 0) return 0;

  let cursor = 0;
  for (let n = 0; n < 4096; n++) {
    const gap = BLINK.minGap + jitter(n) * BLINK.jitter;
    const start = cursor + gap;
    if (start > time) return 0;

    const shut = start + BLINK.close;
    const done = shut + BLINK.open;
    if (time < shut) return ease((time - start) / BLINK.close);
    if (time < done) return 1 - ease((time - shut) / BLINK.open);

    cursor = done;
  }
  return 0;
}

/** Seconds until the next blink begins, for tests and for scheduling. */
export function nextBlinkAfter(time: number): number {
  let cursor = 0;
  for (let n = 0; n < 4096; n++) {
    const start = cursor + BLINK.minGap + jitter(n) * BLINK.jitter;
    if (start > time) return start - time;
    cursor = start + BLINK.close + BLINK.open;
  }
  return BLINK.minGap;
}

/**
 * The drift.
 *
 * Three periods that share no common multiple, so the movement never lands
 * back where it started and never reads as a loop. `speaking` lifts the
 * amplitude a little, because someone who is talking moves more than someone
 * who is listening.
 */
export function headPose(time: number, speaking = false): HeadPose {
  const gain = speaking ? 1.6 : 1;
  return {
    dx: Math.sin(time * 0.31) * 0.0022 * gain + Math.sin(time * 0.73) * 0.0009 * gain,
    dy: Math.sin(time * 0.24 + 1.1) * 0.0026 * gain + Math.sin(time * 0.61) * 0.0011 * gain,
    tilt: Math.sin(time * 0.19 + 0.5) * 0.0035 * gain,
    // Breathing: a slow rise and fall at about fourteen breaths a minute.
    scale: 1 + Math.sin(time * 1.45) * 0.0016,
  };
}

function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}
