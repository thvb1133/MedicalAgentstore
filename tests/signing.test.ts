import { describe, expect, it } from "vitest";

import {
  ANCHORS,
  FOREARM,
  UPPER_ARM,
  blendFace,
  face,
  solveArm,
  type Point,
} from "../src/lib/sign/body";
import { HANDSHAPES } from "../src/lib/sign/handshapes";
import { blendPoses, buildHand } from "../src/lib/sign/hand";
import { LEXICON, frameOf, signFor } from "../src/lib/sign/lexicon";
import { compose, coverage, glossOf } from "../src/lib/sign/compose";
import { idleBlink, idleSway } from "../src/components/sign/renderBody";
import { buildTimeline, stateAt } from "../src/lib/sign/sequence";

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("arm inverse kinematics", () => {
  it("puts the wrist exactly on target when the target is reachable", () => {
    const targets: Point[] = [
      ANCHORS.chest,
      ANCHORS.chin,
      ANCHORS.forehead,
      ANCHORS.neutral,
      ANCHORS.stomach,
      ANCHORS.templeRight,
    ];
    for (const target of targets) {
      const arm = solveArm(ANCHORS.shoulderRight, target, "right");
      expect(distance(arm.wrist, target)).toBeLessThan(1e-9);
      expect(arm.strained).toBe(false);
    }
  });

  it("keeps the bones at their true lengths", () => {
    for (const target of [ANCHORS.forehead, ANCHORS.neutral, ANCHORS.heart]) {
      const arm = solveArm(ANCHORS.shoulderLeft, target, "left");
      expect(distance(arm.shoulder, arm.elbow)).toBeCloseTo(UPPER_ARM, 6);
      expect(distance(arm.elbow, arm.wrist)).toBeCloseTo(FOREARM, 6);
    }
  });

  it("pulls the wrist in rather than tearing the arm off when out of reach", () => {
    const far: Point = { x: -3, y: 3 };
    const arm = solveArm(ANCHORS.shoulderRight, far, "right");
    expect(arm.strained).toBe(true);
    expect(distance(arm.shoulder, arm.wrist)).toBeLessThanOrEqual(UPPER_ARM + FOREARM);
    // Still pointing the right way, just shorter.
    expect(arm.wrist.x).toBeLessThan(ANCHORS.shoulderRight.x);
    expect(arm.wrist.y).toBeGreaterThan(ANCHORS.shoulderRight.y);
  });

  it("bends each elbow away from the body rather than across it", () => {
    // Hand in front of the chest: elbows should sit outside the wrist on
    // each side, which is what a person does.
    const right = solveArm(ANCHORS.shoulderRight, ANCHORS.chest, "right");
    const left = solveArm(ANCHORS.shoulderLeft, ANCHORS.chest, "left");
    expect(right.elbow.x).toBeLessThan(ANCHORS.chest.x);
    expect(left.elbow.x).toBeGreaterThan(ANCHORS.chest.x);
  });

  it("every anchor in signing space is reachable by the hand meant to get there", () => {
    for (const [name, point] of Object.entries(ANCHORS)) {
      const side = name.endsWith("Left") ? "left" : "right";
      const shoulder = side === "left" ? ANCHORS.shoulderLeft : ANCHORS.shoulderRight;
      const arm = solveArm(shoulder, point, side);
      expect(arm.strained, `${name} is out of reach`).toBe(false);
    }
  });
});

describe("signing space", () => {
  it("puts the signer's right on the viewer's left", () => {
    // The figure faces the viewer, so this is the whole convention. Getting
    // it backwards mirrors every sign in the lexicon.
    expect(ANCHORS.shoulderRight.x).toBeLessThan(0);
    expect(ANCHORS.shoulderLeft.x).toBeGreaterThan(0);
    expect(ANCHORS.templeRight.x).toBeLessThan(0);
  });

  it("orders the vertical anchors the way a body is ordered", () => {
    expect(ANCHORS.forehead.y).toBeLessThan(ANCHORS.nose.y);
    expect(ANCHORS.nose.y).toBeLessThan(ANCHORS.chin.y);
    expect(ANCHORS.chin.y).toBeLessThan(ANCHORS.chest.y);
    expect(ANCHORS.chest.y).toBeLessThan(ANCHORS.stomach.y);
    expect(ANCHORS.stomach.y).toBeLessThan(ANCHORS.restRight.y);
  });
});

describe("handshapes", () => {
  it("gives every shape four fingers and a thumb", () => {
    for (const [name, pose] of Object.entries(HANDSHAPES)) {
      expect(pose.fingers, name).toHaveLength(4);
      expect(pose.thumb, name).toBeDefined();
    }
  });

  it("distinguishes the shapes that only differ by the middle finger", () => {
    // FEEL, SICK and MEDICINE all hang on the dropped middle finger. If it
    // stops being dropped, three signs collapse into an open hand.
    expect(HANDSHAPES.MIDDLE.fingers[1].curl).toBeGreaterThan(0.4);
    expect(HANDSHAPES.MIDDLE.fingers[0].curl).toBeLessThan(0.2);
    expect(HANDSHAPES.MIDDLE.fingers[2].curl).toBeLessThan(0.2);
  });

  it("keeps the flat O closed and the claw open", () => {
    const flatO = HANDSHAPES.FLAT_O.fingers.map((f) => f.curl);
    const claw = HANDSHAPES.CLAW.fingers.map((f) => f.curl);
    expect(Math.min(...flatO)).toBeGreaterThan(Math.max(...claw));
    expect(HANDSHAPES.FLAT_O.thumb.across).toBeGreaterThan(0.4);
  });
});

describe("the lexicon", () => {
  it("has a gloss, a description and at least two keyframes for every sign", () => {
    for (const sign of LEXICON) {
      expect(sign.gloss, sign.gloss).toMatch(/^[A-Z][A-Z-]*$/);
      expect(sign.description.length, sign.gloss).toBeGreaterThan(20);
      expect(sign.frames.length, sign.gloss).toBeGreaterThanOrEqual(2);
      expect(sign.triggers.length, sign.gloss).toBeGreaterThan(0);
      expect(sign.duration, sign.gloss).toBeGreaterThan(0.3);
    }
  });

  it("starts every sign at 0 and ends it at 1, in order", () => {
    for (const sign of LEXICON) {
      expect(sign.frames[0].t, sign.gloss).toBe(0);
      expect(sign.frames[sign.frames.length - 1].t, sign.gloss).toBe(1);
      for (let i = 1; i < sign.frames.length; i++) {
        expect(sign.frames[i].t, `${sign.gloss} frame ${i}`).toBeGreaterThan(
          sign.frames[i - 1].t,
        );
      }
    }
  });

  it("actually moves — a sign with no movement is not a sign", () => {
    for (const sign of LEXICON) {
      const first = frameOf(sign, 0);
      const positions = sign.frames.map((f) => f.right?.at ?? f.left?.at ?? { x: 0, y: 0 });
      const moved = positions.some((p) => distance(p, positions[0]) > 0.01);
      const reshaped = sign.frames.some((f) => {
        const shape = f.right?.shape ?? f.left?.shape;
        const start = first.right.shape;
        if (!shape) return false;
        return (
          shape.facing !== start.facing ||
          Math.abs(shape.rotation - start.rotation) > 1 ||
          shape.fingers.some((d, i) => Math.abs(d.curl - start.fingers[i].curl) > 0.05)
        );
      });
      const depth = sign.frames.some((f) => (f.right?.z ?? 0) > 0.05);
      expect(moved || reshaped || depth, `${sign.gloss} never moves`).toBe(true);
    }
  });

  it("keeps every hand inside the space an arm can reach", () => {
    for (const sign of LEXICON) {
      for (const frame of sign.frames) {
        for (const side of ["right", "left"] as const) {
          const hand = frame[side];
          if (!hand) continue;
          const shoulder = side === "right" ? ANCHORS.shoulderRight : ANCHORS.shoulderLeft;
          const arm = solveArm(shoulder, hand.at, side);
          expect(arm.strained, `${sign.gloss} ${side} hand at t=${frame.t}`).toBe(false);
        }
      }
    }
  });

  it("does not let two signs claim the same English word", () => {
    const seen = new Map<string, string>();
    for (const sign of LEXICON) {
      for (const trigger of sign.triggers) {
        const existing = seen.get(trigger);
        expect(existing, `"${trigger}" is claimed by ${existing} and ${sign.gloss}`).toBe(
          undefined,
        );
        seen.set(trigger, sign.gloss);
      }
    }
  });

  it("marks the wh-questions with drawn-together brows", () => {
    // In ASL this is grammar, not mood. WHAT and HOW without it are not
    // questions.
    for (const gloss of ["WHAT", "HOW"]) {
      const sign = LEXICON.find((s) => s.gloss === gloss)!;
      const brows = sign.frames.map((f) => f.face?.brows ?? 0);
      expect(Math.min(...brows), gloss).toBeLessThan(-0.5);
    }
  });

  it("shakes the head on NO", () => {
    const no = LEXICON.find((s) => s.gloss === "NO")!;
    const turns = no.frames.map((f) => f.face?.headTurn ?? 0);
    expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(0.4);
  });

  it("interpolates smoothly through a sign", () => {
    const breathe = LEXICON.find((s) => s.gloss === "BREATHE")!;
    let previous = frameOf(breathe, 0);
    for (let t = 0.02; t <= 1; t += 0.02) {
      const current = frameOf(breathe, t);
      // No teleporting between adjacent samples.
      expect(distance(previous.right.at, current.right.at)).toBeLessThan(0.1);
      previous = current;
    }
  });

  it("clamps out-of-range progress instead of extrapolating", () => {
    const hello = LEXICON.find((s) => s.gloss === "HELLO")!;
    expect(frameOf(hello, -1).right.at).toEqual(frameOf(hello, 0).right.at);
    expect(frameOf(hello, 5).right.at).toEqual(frameOf(hello, 1).right.at);
  });

  it("looks up signs case-insensitively and by every trigger", () => {
    expect(signFor("HELLO")?.gloss).toBe("HELLO");
    expect(signFor("  hi  ")?.gloss).toBe("HELLO");
    expect(signFor("thank you")?.gloss).toBe("THANK-YOU");
    expect(signFor("nonsense")).toBeUndefined();
  });
});

describe("composing a reply", () => {
  it("prefers the longest matching phrase", () => {
    // "thank you" is one sign, not THANK followed by YOU.
    const segments = compose("thank you");
    expect(segments).toHaveLength(1);
    expect(glossOf(segments)).toBe("THANK-YOU");
  });

  it("signs what it can and spells the numbers", () => {
    const segments = compose("Your heart rate is 72.");
    const gloss = glossOf(segments);
    expect(gloss).toContain("YOU");
    expect(gloss).toContain("HEART");
    expect(gloss).toContain("72");
  });

  it("drops function words rather than padding the sequence with them", () => {
    const segments = compose("it is a good thing that you are here");
    const glosses = segments.filter((s) => s.kind === "sign").map((s) => s.sign.gloss);
    expect(glosses).toContain("GOOD");
    expect(glosses).toContain("YOU");
    expect(glosses).not.toContain("THAT");
  });

  it("spells everything unmatched when asked to", () => {
    const lean = compose("pulse oximetry reading");
    const full = compose("pulse oximetry reading", { spellUnknown: true });
    expect(full.length).toBeGreaterThan(lean.length);
    expect(glossOf(full)).toContain("OXIMETRY");
  });

  it("turns sentence ends into pauses, but not a trailing one", () => {
    const segments = compose("hello. how are you?");
    expect(segments.some((s) => s.kind === "pause")).toBe(true);
    expect(segments[segments.length - 1].kind).not.toBe("pause");
  });

  it("caps the length of a long reply", () => {
    const long = Array(200).fill("you feel good and you feel tired").join(" ");
    expect(compose(long).length).toBeLessThanOrEqual(24);
  });

  it("handles empty and punctuation-only input", () => {
    expect(compose("")).toEqual([]);
    expect(compose("... !!!")).toEqual([]);
  });

  it("reports honestly how much of a reply it covered", () => {
    const stats = coverage("Take your medicine and breathe slowly with me now");
    expect(stats.signed).toBeGreaterThan(3);
    expect(stats.skipped).toBeGreaterThan(0);
  });
});

describe("the timeline", () => {
  const segments = compose("hello. your heart rate is 72.");
  const timeline = buildTimeline(segments, 2.5);

  it("lays the steps out end to end without overlap", () => {
    for (let i = 1; i < timeline.steps.length; i++) {
      expect(timeline.steps[i].start).toBeGreaterThanOrEqual(timeline.steps[i - 1].end);
    }
    expect(timeline.duration).toBeGreaterThan(0);
  });

  it("gives each sign the duration written in the lexicon", () => {
    for (const step of timeline.steps) {
      if (step.segment.kind !== "sign") continue;
      expect(step.end - step.start).toBeCloseTo(step.segment.sign.duration, 6);
    }
  });

  it("scales spelling with the letter rate rather than the sign durations", () => {
    const slow = buildTimeline(compose("72"), 1);
    const fast = buildTimeline(compose("72"), 4);
    expect(slow.duration).toBeGreaterThan(fast.duration * 2);
  });

  it("rests before it starts and after it finishes", () => {
    const before = stateAt(timeline, -0.5, 2.5);
    const after = stateAt(timeline, timeline.duration + 5, 2.5);
    expect(before.step).toBeNull();
    expect(after.finished).toBe(true);
    expect(after.frame.right.at.y).toBeGreaterThan(0);
  });

  it("never jumps between consecutive moments, including across signs", () => {
    // The transition between signs carries information to a reader; a hard
    // cut is both harder to read and obviously mechanical.
    let previous = stateAt(timeline, 0, 2.5);
    for (let t = 0.01; t < timeline.duration; t += 0.01) {
      const current = stateAt(timeline, t, 2.5);
      expect(
        distance(previous.frame.right.at, current.frame.right.at),
        `right hand jumped at t=${t.toFixed(2)}`,
      ).toBeLessThan(0.09);
      expect(
        distance(previous.frame.left.at, current.frame.left.at),
        `left hand jumped at t=${t.toFixed(2)}`,
      ).toBeLessThan(0.09);
      previous = current;
    }
  });

  it("reports which step is running and which letter is being formed", () => {
    const spellStep = timeline.steps.find((s) => s.segment.kind === "spell")!;
    const mid = (spellStep.start + spellStep.end) / 2;
    const state = stateAt(timeline, mid, 2.5);
    expect(state.letter).toBeTruthy();
    expect(state.index).toBeGreaterThanOrEqual(0);
  });

  it("puts fingerspelling in a consistent place near the face", () => {
    const spellStep = timeline.steps.find((s) => s.segment.kind === "spell")!;
    const state = stateAt(timeline, spellStep.start + 0.05, 2.5);
    // Dominant side, above the chest — where a signer holds it so a reader
    // can watch the hand and the face together.
    expect(state.frame.right.at.x).toBeLessThan(0);
    expect(state.frame.right.at.y).toBeLessThan(ANCHORS.chest.y);
  });

  it("brings the hands down at the end instead of cutting to rest", () => {
    // Cutting was the single most visible discontinuity in the animation,
    // and on a loop it happened once per pass.
    expect(timeline.settle).toBeGreaterThan(0.1);
    let previous = stateAt(timeline, timeline.duration - 0.02, 2.5);
    for (let t = timeline.duration; t <= timeline.duration + timeline.settle + 0.3; t += 0.01) {
      const current = stateAt(timeline, t, 2.5);
      expect(
        distance(previous.frame.right.at, current.frame.right.at),
        `right hand jumped at t=${t.toFixed(2)}`,
      ).toBeLessThan(0.09);
      previous = current;
    }
    const settled = stateAt(timeline, timeline.duration + timeline.settle + 1, 2.5);
    expect(settled.finished).toBe(true);
    expect(settled.frame.right.at).toEqual(ANCHORS.restRight);
  });

  it("copes with an empty timeline", () => {
    const empty = buildTimeline([], 2.5);
    const state = stateAt(empty, 1, 2.5);
    expect(state.finished).toBe(true);
    expect(state.step).toBeNull();
  });
});

describe("question marking", () => {
  it("marks a yes/no question with raised brows across the whole clause", () => {
    const segments = compose("Do you feel tired?");
    const signs = segments.filter((s) => s.kind === "sign");
    expect(signs.length).toBeGreaterThan(1);
    for (const segment of signs) expect(segment.marking).toBe("yes-no");
  });

  it("marks a wh-question with drawn-together brows instead", () => {
    const segments = compose("How do you feel?");
    for (const segment of segments) {
      if (segment.kind === "sign") expect(segment.marking).toBe("wh");
    }
  });

  it("leaves a statement unmarked", () => {
    for (const segment of compose("You feel tired.")) {
      if (segment.kind === "sign") expect(segment.marking).toBe("none");
    }
  });

  it("scopes the marking to its own sentence", () => {
    const segments = compose("You feel tired. Do you feel pain?");
    const byGloss = new Map(
      segments.filter((s) => s.kind === "sign").map((s) => [s.sign.gloss, s.marking]),
    );
    expect(byGloss.get("TIRED")).toBe("none");
    expect(byGloss.get("HURT")).toBe("yes-no");
  });

  it("holds the brows raised through every sign of a yes/no question", () => {
    const timeline = buildTimeline(compose("Do you feel tired?"), 2.5);
    const signSteps = timeline.steps.filter((s) => s.segment.kind === "sign");
    for (const step of signSteps) {
      const mid = (step.start + step.end) / 2;
      expect(
        stateAt(timeline, mid, 2.5).frame.face.brows,
        (step.segment as { sign: { gloss: string } }).sign.gloss,
      ).toBeGreaterThan(0.5);
    }
  });

  it("does not let a clause marker override a sign's own stronger brows", () => {
    // WHAT is a wh-question by itself. A sentence-level yes/no marker must
    // not flip its brows to raised, which would make it ungrammatical.
    const timeline = buildTimeline(compose("You know what?"), 2.5);
    const step = timeline.steps.find(
      (s) => s.segment.kind === "sign" && s.segment.sign.gloss === "WHAT",
    )!;
    const brows = stateAt(timeline, (step.start + step.end) / 2, 2.5).frame.face.brows;
    expect(brows).toBeLessThan(0);
  });
});

describe("facial markers", () => {
  it("blends the continuous parts and switches the mouth at the midpoint", () => {
    const a = face({ brows: 0, mouth: "neutral" });
    const b = face({ brows: 1, mouth: "smile" });
    expect(blendFace(a, b, 0.5).brows).toBeCloseTo(0.5, 6);
    expect(blendFace(a, b, 0.4).mouth).toBe("neutral");
    expect(blendFace(a, b, 0.6).mouth).toBe("smile");
  });
});

describe("turning the palm over", () => {
  it("passes through edge-on rather than popping inside out", () => {
    // `facing` is categorical, so without this the hand flips in a single
    // frame and reads as a rendering glitch instead of as a wrist.
    const front = HANDSHAPES.FLAT;
    const back = { ...HANDSHAPES.FLAT, facing: "back" as const };

    const widths = [];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      widths.push(blendPoses(front, back, t).squash ?? 1);
    }
    expect(widths[0]).toBeCloseTo(1, 2);
    expect(widths[widths.length - 1]).toBeCloseTo(1, 2);
    // Narrow at the midpoint, which is where the flip happens, and widening
    // away from it in both directions.
    expect(blendPoses(front, back, 0.5).squash).toBeLessThan(0.2);
    const middle = (widths.length - 1) / 2;
    for (let i = 1; i < middle; i++) expect(widths[i]).toBeLessThan(widths[i - 1]);
    for (let i = middle + 2; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
  });

  it("leaves a blend that does not change facing at full width", () => {
    const a = HANDSHAPES.FLAT;
    const b = HANDSHAPES.S;
    for (let t = 0; t <= 1; t += 0.1) {
      expect(blendPoses(a, b, t).squash ?? 1).toBeCloseTo(1, 5);
    }
  });

  it("keeps a side-facing shape narrow throughout", () => {
    const c = HANDSHAPES.C;
    const o = HANDSHAPES.O;
    for (let t = 0; t <= 1; t += 0.1) {
      const squash = blendPoses(c, o, t).squash ?? 1;
      expect(squash).toBeLessThan(1);
      expect(squash).toBeGreaterThan(0.2);
    }
  });

  it("actually narrows the drawn palm", () => {
    const wide = buildHand({ ...HANDSHAPES.FLAT, squash: 1 });
    const edge = buildHand({ ...HANDSHAPES.FLAT, squash: 0.12 });
    const span = (g: ReturnType<typeof buildHand>) => {
      const xs = g.palm.map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(span(edge)).toBeLessThan(span(wide) * 0.3);
  });
});

describe("the idle", () => {
  it("blinks at a plausible rate, and only briefly", () => {
    let shut = 0;
    let blinks = 0;
    let wasShut = false;
    for (let t = 0; t < 60; t += 1 / 60) {
      const closed = idleBlink(t) > 0.5;
      if (closed) shut += 1 / 60;
      if (closed && !wasShut) blinks++;
      wasShut = closed;
    }
    // Humans blink somewhere around ten to twenty times a minute.
    expect(blinks).toBeGreaterThanOrEqual(10);
    expect(blinks).toBeLessThanOrEqual(20);
    // And the eyes are open the overwhelming majority of the time.
    expect(shut / 60).toBeLessThan(0.05);
  });

  it("never leaves the eyes shut or half shut at rest", () => {
    expect(idleBlink(0.5)).toBe(0);
    expect(idleBlink(2)).toBe(0);
  });

  it("sways gently enough not to compete with the signing", () => {
    const samples = [];
    for (let t = 0; t < 40; t += 0.05) samples.push(idleSway(t));
    const amplitude = Math.max(...samples) - Math.min(...samples);
    // In body units, where a head is 0.62 across.
    expect(amplitude).toBeGreaterThan(0.02);
    expect(amplitude).toBeLessThan(0.08);
  });

  it("does not settle into a visible loop", () => {
    // Two incommensurate periods, so the figure never repeats exactly.
    expect(Math.abs(idleSway(0) - idleSway(2 * Math.PI / 0.9))).toBeGreaterThan(1e-4);
  });
});
