import { describe, expect, it } from "vitest";

import {
  FingerspellReader,
  UNSUPPORTED_LETTERS,
  handFeatures,
  readLetter,
} from "../src/lib/sign/recognise";
import type { Landmark } from "../src/lib/vision/faceRegions";

/**
 * A synthetic hand in the layout MediaPipe returns.
 *
 * Fingers are laid out as three straight segments from a knuckle, bent by a
 * curl angle at each joint, which is enough geometry to exercise everything
 * the recogniser measures: a curled finger's tip really does come back
 * towards its own knuckle, and a spread really does move two tips apart.
 */
interface FingerSpec {
  /** 0 straight up, positive rotates towards the thumb side. */
  angle: number;
  /** 0 straight, 1 fully curled. */
  curl: number;
}

const SEGMENTS: Record<string, [number, number, number]> = {
  thumb: [0.09, 0.07, 0.06],
  index: [0.12, 0.08, 0.05],
  middle: [0.13, 0.085, 0.055],
  ring: [0.12, 0.08, 0.05],
  pinky: [0.1, 0.06, 0.045],
};

/** Knuckle positions across the palm, wrist at the origin. */
const KNUCKLES: Record<string, { x: number; y: number }> = {
  thumb: { x: 0.06, y: -0.05 },
  index: { x: 0.05, y: -0.16 },
  middle: { x: 0.015, y: -0.17 },
  ring: { x: -0.02, y: -0.165 },
  pinky: { x: -0.055, y: -0.15 },
};

function finger(name: string, spec: FingerSpec): Landmark[] {
  const base = KNUCKLES[name];
  const segments = SEGMENTS[name];
  // Up to a right angle at each of the two joints, which is what takes a
  // fingertip back down beside its own knuckle.
  const perJoint = spec.curl * (Math.PI / 2);
  const points: Landmark[] = [{ x: base.x, y: base.y, z: 0 }];

  let x = base.x;
  let y = base.y;
  let heading = spec.angle;
  for (let i = 0; i < 3; i++) {
    if (i > 0) heading += perJoint;
    x += segments[i] * Math.sin(heading);
    y -= segments[i] * Math.cos(heading);
    points.push({ x, y, z: 0 });
  }
  return points;
}

function hand(spec: Record<string, FingerSpec>): Landmark[] {
  return [
    { x: 0, y: 0, z: 0 },
    ...finger("thumb", spec.thumb),
    ...finger("index", spec.index),
    ...finger("middle", spec.middle),
    ...finger("ring", spec.ring),
    ...finger("pinky", spec.pinky),
  ];
}

const CURLED: FingerSpec = { angle: 0, curl: 1 };
const STRAIGHT: FingerSpec = { angle: 0, curl: 0 };

/** Poses roughly as a right hand makes them, facing the camera. */
const POSES: Record<string, Record<string, FingerSpec>> = {
  A: {
    thumb: { angle: 0.5, curl: 0.15 },
    index: CURLED,
    middle: CURLED,
    ring: CURLED,
    pinky: CURLED,
  },
  B: {
    thumb: { angle: -1.5, curl: 0.6 },
    index: STRAIGHT,
    middle: STRAIGHT,
    ring: STRAIGHT,
    pinky: STRAIGHT,
  },
  I: {
    thumb: { angle: 0.6, curl: 0.8 },
    index: CURLED,
    middle: CURLED,
    ring: CURLED,
    pinky: STRAIGHT,
  },
  L: {
    thumb: { angle: 1.4, curl: 0 },
    index: STRAIGHT,
    middle: CURLED,
    ring: CURLED,
    pinky: CURLED,
  },
  U: {
    thumb: { angle: -1.2, curl: 0.7 },
    index: { angle: 0.02, curl: 0 },
    middle: { angle: -0.02, curl: 0 },
    ring: CURLED,
    pinky: CURLED,
  },
  V: {
    thumb: { angle: -1.2, curl: 0.7 },
    index: { angle: 0.35, curl: 0 },
    middle: { angle: -0.3, curl: 0 },
    ring: CURLED,
    pinky: CURLED,
  },
  W: {
    thumb: { angle: -1, curl: 0.6 },
    index: { angle: 0.3, curl: 0 },
    middle: { angle: 0, curl: 0 },
    ring: { angle: -0.3, curl: 0 },
    pinky: CURLED,
  },
  Y: {
    thumb: { angle: 1.5, curl: 0 },
    index: CURLED,
    middle: CURLED,
    ring: CURLED,
    pinky: { angle: -0.5, curl: 0 },
  },
};

describe("hand features", () => {
  it("refuses a hand that is not all there", () => {
    expect(handFeatures([])).toBeNull();
    expect(handFeatures(hand(POSES.A).slice(0, 12))).toBeNull();
  });

  it("tells a curled finger from a straight one", () => {
    const open = handFeatures(hand(POSES.B))!;
    const fist = handFeatures(hand(POSES.A))!;
    expect(open.extension.index).toBeGreaterThan(0.8);
    expect(fist.extension.index).toBeLessThan(0.2);
  });

  it("measures the gap between the index and middle fingers", () => {
    const together = handFeatures(hand(POSES.U))!;
    const apart = handFeatures(hand(POSES.V))!;
    expect(apart.spread).toBeGreaterThan(together.spread + 0.2);
  });

  it("does not change when the hand moves closer to the camera", () => {
    const near = handFeatures(hand(POSES.V))!;
    const far = handFeatures(
      hand(POSES.V).map((p) => ({ x: p.x * 0.4 + 0.5, y: p.y * 0.4 + 0.5, z: 0 })),
    )!;
    expect(far.extension.index).toBeCloseTo(near.extension.index, 4);
    expect(far.spread).toBeCloseTo(near.spread, 4);
  });

  it("does not change when the hand is rotated", () => {
    const upright = handFeatures(hand(POSES.V))!;
    const angle = 0.7;
    const tilted = handFeatures(
      hand(POSES.V).map((p) => ({
        x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
        y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
        z: 0,
      })),
    )!;
    expect(tilted.extension.middle).toBeCloseTo(upright.extension.middle, 4);
    expect(tilted.spread).toBeCloseTo(upright.spread, 4);
    expect(tilted.thumbOut).toBeCloseTo(upright.thumbOut, 4);
  });

  it("sees a thumb held out at the side and one folded across the palm", () => {
    const out = handFeatures(hand(POSES.L))!;
    const across = handFeatures(hand(POSES.B))!;
    expect(out.thumbOut).toBeGreaterThan(across.thumbOut);
    expect(across.thumbAcross).toBeGreaterThan(out.thumbAcross);
  });
});

describe("reading letters", () => {
  it("reads the shapes it claims to read", () => {
    for (const [letter, pose] of Object.entries(POSES)) {
      const reading = readLetter(handFeatures(hand(pose)));
      expect(reading, `expected to read ${letter}`).not.toBeNull();
      expect(reading!.letter, `pose for ${letter}`).toBe(letter);
    }
  });

  it("separates the two-finger letters by how far apart the fingers are", () => {
    expect(readLetter(handFeatures(hand(POSES.U)))!.letter).toBe("U");
    expect(readLetter(handFeatures(hand(POSES.V)))!.letter).toBe("V");
  });

  it("returns nothing for a hand doing something else entirely", () => {
    const shrug = hand({
      thumb: { angle: 0.5, curl: 0.5 },
      index: { angle: 0.2, curl: 0.5 },
      middle: { angle: 0, curl: 0.5 },
      ring: { angle: -0.2, curl: 0.5 },
      pinky: { angle: -0.4, curl: 0.5 },
    });
    const reading = readLetter(handFeatures(shrug));
    // Either nothing, or something it is honest about being unsure of.
    if (reading) expect(reading.confidence).toBeLessThan(0.7);
  });

  it("says nothing at all when handed nothing", () => {
    expect(readLetter(null)).toBeNull();
  });

  it("warns that A is one of a family it cannot fully separate", () => {
    expect(readLetter(handFeatures(hand(POSES.A)))!.near).toMatch(/S, M, N, T/);
  });

  it("names the letters it refuses, with the reason", () => {
    const all = UNSUPPORTED_LETTERS.map((u) => u.letters).join(" ");
    expect(all).toMatch(/J/);
    expect(all).toMatch(/Z/);
    expect(all).toMatch(/M, N, S, T/);
    for (const entry of UNSUPPORTED_LETTERS) expect(entry.reason.length).toBeGreaterThan(10);
  });
});

/** Drive the reader at 30 fps with a fixed pose. */
function hold(
  reader: FingerspellReader,
  landmarks: Landmark[] | null,
  seconds: number,
  startAt: number,
) {
  let last = reader.push({ timestampMs: startAt, landmarks });
  for (let i = 1; i < seconds * 30; i++) {
    last = reader.push({ timestampMs: startAt + (i / 30) * 1000, landmarks });
  }
  return { state: last, endMs: startAt + seconds * 1000 };
}

describe("spelling to the camera", () => {
  it("commits a letter only once it has been held", () => {
    const reader = new FingerspellReader();
    const brief = hold(reader, hand(POSES.V), 0.4, 0);
    expect(brief.state.text).toBe("");
    expect(brief.state.candidate).toBe("V");
    expect(brief.state.progress).toBeGreaterThan(0.3);

    const settled = hold(reader, hand(POSES.V), 1, brief.endMs);
    expect(settled.state.text).toBe("V");
  });

  it("does not emit a letter for every pose the hand passes through", () => {
    const reader = new FingerspellReader();
    let at = 0;
    // Flick through three shapes too quickly for any of them to count.
    for (const pose of [POSES.A, POSES.B, POSES.V, POSES.Y]) {
      at = hold(reader, hand(pose), 0.3, at).endMs;
    }
    expect(reader.push({ timestampMs: at, landmarks: null }).text).toBe("");
  });

  it("spells a word one held shape at a time", () => {
    const reader = new FingerspellReader();
    let at = 0;
    for (const pose of [POSES.Y, POSES.A, POSES.W]) {
      at = hold(reader, hand(pose), 1.1, at).endMs;
    }
    expect(reader.push({ timestampMs: at, landmarks: hand(POSES.W) }).text).toBe("YAW");
  });

  it("ends a word when the hand leaves the frame", () => {
    const reader = new FingerspellReader();
    let at = hold(reader, hand(POSES.I), 1.1, 0).endMs;
    at = hold(reader, null, 1.5, at).endMs;
    const state = hold(reader, hand(POSES.L), 1.1, at).state;
    expect(state.text).toBe("I L");
  });

  it("does not run a string of spaces together", () => {
    const reader = new FingerspellReader();
    let at = hold(reader, hand(POSES.I), 1.1, 0).endMs;
    at = hold(reader, null, 5, at).endMs;
    expect(reader.push({ timestampMs: at, landmarks: null }).text).toBe("I ");
  });

  it("asks for the hand back rather than spacing forever from an empty start", () => {
    const reader = new FingerspellReader();
    const { state } = hold(reader, null, 3, 0);
    expect(state.text).toBe("");
    expect(state.prompt).toMatch(/show your hand/i);
  });

  it("says when the shape it is holding is close to another", () => {
    const reader = new FingerspellReader();
    const { state } = hold(reader, hand(POSES.A), 0.4, 0);
    expect(state.candidate).toBe("A");
    if (state.runnerUp) expect(state.prompt).toMatch(/could also be/);
  });

  it("hands over the text and starts again", () => {
    const reader = new FingerspellReader();
    hold(reader, hand(POSES.V), 1.1, 0);
    expect(reader.take()).toBe("V");
    expect(reader.push({ timestampMs: 5000, landmarks: null }).text).toBe("");
  });

  it("forgets everything on reset", () => {
    const reader = new FingerspellReader();
    hold(reader, hand(POSES.V), 1.1, 0);
    reader.reset();
    expect(reader.push({ timestampMs: 6000, landmarks: null }).text).toBe("");
  });
});
