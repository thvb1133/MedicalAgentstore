import { describe, expect, it } from "vitest";

import {
  APPROXIMATE_GLYPHS,
  RESTING,
  SIGNS,
  signFor,
  toFingerspelling,
} from "@/lib/sign/alphabet";
import { blendPoses, buildHand, easeInOut, type HandPose } from "@/lib/sign/hand";
import { frameAt, spellableTerms, totalDuration } from "@/lib/sign/schedule";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DIGITS = "0123456789".split("");

describe("the alphabet", () => {
  it("covers every letter and every digit", () => {
    for (const glyph of [...ALPHABET, ...DIGITS]) {
      expect(signFor(glyph), glyph).not.toBeNull();
    }
  });

  it("is case insensitive", () => {
    expect(signFor("a")).toBe(signFor("A"));
  });

  it("returns nothing for a character with no handshape", () => {
    expect(signFor("!")).toBeNull();
    expect(signFor(" ")).toBeNull();
  });

  it("gives J and Z the movement that defines them", () => {
    // Without its path, J is indistinguishable from I and Z from a pointed
    // index finger. The movement is not decoration, it is the letter.
    expect(SIGNS.J.motion?.length).toBeGreaterThan(2);
    expect(SIGNS.Z.motion?.length).toBeGreaterThan(2);
    expect(SIGNS.A.motion).toBeUndefined();
  });

  it("keeps every pose value inside the model's range", () => {
    for (const [glyph, entry] of Object.entries(SIGNS)) {
      for (const finger of entry.pose.fingers) {
        expect(finger.curl, glyph).toBeGreaterThanOrEqual(0);
        expect(finger.curl, glyph).toBeLessThanOrEqual(1);
        expect(Math.abs(finger.spread), glyph).toBeLessThanOrEqual(20);
      }
      const { curl, abduction, across } = entry.pose.thumb;
      for (const value of [curl, abduction, across]) {
        expect(value, glyph).toBeGreaterThanOrEqual(0);
        expect(value, glyph).toBeLessThanOrEqual(1);
      }
    }
  });

  it("declares which shapes the flat model cannot reproduce", () => {
    // Silently shipping a wrong handshape as correct is the failure that
    // matters here: a reader told the shape is right cannot compensate.
    expect(APPROXIMATE_GLYPHS).toContain("R");
    expect(APPROXIMATE_GLYPHS).toContain("M");
    expect(APPROXIMATE_GLYPHS).toContain("T");
    expect(APPROXIMATE_GLYPHS).toContain("N");
    expect(APPROXIMATE_GLYPHS).not.toContain("A");
    expect(APPROXIMATE_GLYPHS).not.toContain("B");
  });

  it("distinguishes the letters that differ only by one finger", () => {
    // U and V are the same hand apart from whether two fingers are apart. If
    // the poses ever converged, the alphabet would be unreadable at exactly
    // the point readers rely on it most.
    const u = SIGNS.U.pose;
    const v = SIGNS.V.pose;
    const separation = (p: HandPose) => Math.abs(p.fingers[0].spread - p.fingers[1].spread);
    expect(separation(v)).toBeGreaterThan(separation(u) + 10);
  });

  it("keeps A and S apart by where the thumb sits", () => {
    // Both are fists. The only difference is the thumb alongside versus
    // folded across the front.
    expect(SIGNS.S.pose.thumb.across).toBeGreaterThan(0.6);
    expect(SIGNS.A.pose.thumb.across).toBeLessThan(0.3);
  });
});

describe("toFingerspelling", () => {
  it("maps letters to entries", () => {
    const units = toFingerspelling("HI");
    expect(units.map((u) => u.glyph)).toEqual(["H", "I"]);
    expect(units.every((u) => u.entry !== null)).toBe(true);
  });

  it("upper-cases as it goes", () => {
    expect(toFingerspelling("hi").map((u) => u.glyph)).toEqual(["H", "I"]);
  });

  it("turns a gap into a pause rather than dropping it", () => {
    // Word gaps are the only sentence structure fingerspelling has.
    const units = toFingerspelling("A B");
    expect(units.map((u) => u.glyph)).toEqual(["A", " ", "B"]);
    expect(units[1].entry).toBeNull();
  });

  it("collapses a run of punctuation and spaces into one pause", () => {
    expect(toFingerspelling("A, ... B").filter((u) => u.entry === null)).toHaveLength(1);
  });

  it("does not start or end on a pause", () => {
    const units = toFingerspelling("  hi!  ");
    expect(units[0].entry).not.toBeNull();
    expect(units[units.length - 1].entry).not.toBeNull();
  });

  it("handles a string with nothing spellable in it", () => {
    expect(toFingerspelling("!!! ???")).toEqual([]);
  });

  it("spells digits, which is the point of having them", () => {
    expect(toFingerspelling("72 bpm").map((u) => u.glyph)).toEqual([
      "7",
      "2",
      " ",
      "B",
      "P",
      "M",
    ]);
  });
});

describe("the hand model", () => {
  it("builds a palm and five digits", () => {
    const geometry = buildHand(RESTING);
    expect(geometry.digits).toHaveLength(5);
    expect(geometry.palm.length).toBeGreaterThanOrEqual(4);
  });

  it("gives each finger three segments", () => {
    for (const digit of buildHand(RESTING).digits) {
      expect(digit.joints).toHaveLength(4);
      expect(digit.widths).toHaveLength(3);
    }
  });

  it("puts an extended fingertip further from the wrist than a curled one", () => {
    const reach = (curl: number) => {
      const geometry = buildHand({
        ...RESTING,
        fingers: [
          { curl, spread: 0 },
          { curl, spread: 0 },
          { curl, spread: 0 },
          { curl, spread: 0 },
        ],
      });
      const tip = geometry.digits[0].joints[3];
      return Math.hypot(tip.x, tip.y);
    };
    expect(reach(0)).toBeGreaterThan(reach(0.5));
    expect(reach(0.5)).toBeGreaterThan(reach(1));
  });

  it("points an extended finger away from the wrist, not toward it", () => {
    const geometry = buildHand({
      ...RESTING,
      fingers: [
        { curl: 0, spread: 0 },
        { curl: 0, spread: 0 },
        { curl: 0, spread: 0 },
        { curl: 0, spread: 0 },
      ],
      rotation: 0,
    });
    // Screen coordinates: up the screen is negative y.
    expect(geometry.digits[0].joints[3].y).toBeLessThan(-0.6);
  });

  it("makes the middle finger the longest and the little finger the shortest", () => {
    const straight = {
      ...RESTING,
      fingers: [
        { curl: 0, spread: 0 },
        { curl: 0, spread: 0 },
        { curl: 0, spread: 0 },
        { curl: 0, spread: 0 },
      ],
    } as HandPose;
    const geometry = buildHand(straight);
    const reach = (i: number) => -geometry.digits[i].joints[3].y;
    expect(reach(1)).toBeGreaterThan(reach(0));
    expect(reach(0)).toBeGreaterThan(reach(3));
  });

  it("rotates the whole hand about the wrist", () => {
    const upright = buildHand({ ...RESTING, rotation: 0 });
    const turned = buildHand({ ...RESTING, rotation: 90 });
    expect(turned.wrist).toEqual(upright.wrist);
    // A hand turned a quarter-turn has its fingers out to the side.
    const tip = turned.digits[1].joints[3];
    expect(Math.abs(tip.x)).toBeGreaterThan(Math.abs(tip.y));
  });

  it("clamps a pose that asks for more than the joints allow", () => {
    const overdriven = buildHand({
      ...RESTING,
      fingers: [
        { curl: 5, spread: 0 },
        { curl: -3, spread: 0 },
        { curl: 0.5, spread: 0 },
        { curl: 0.5, spread: 0 },
      ],
    });
    for (const digit of overdriven.digits) {
      for (const joint of digit.joints) {
        expect(Number.isFinite(joint.x)).toBe(true);
        expect(Number.isFinite(joint.y)).toBe(true);
      }
    }
  });
});

describe("blending", () => {
  it("returns the endpoints exactly", () => {
    const a = SIGNS.A.pose;
    const b = SIGNS.B.pose;
    expect(blendPoses(a, b, 0).fingers[0].curl).toBeCloseTo(a.fingers[0].curl);
    expect(blendPoses(a, b, 1).fingers[0].curl).toBeCloseTo(b.fingers[0].curl);
  });

  it("moves monotonically between them", () => {
    const a = SIGNS.A.pose;
    const b = SIGNS.B.pose;
    const at = (t: number) => blendPoses(a, b, t).fingers[0].curl;
    expect(at(0.25)).toBeGreaterThan(at(0.75));
  });

  it("switches palm facing at the midpoint rather than interpolating it", () => {
    // There is no hand halfway between palm-forward and palm-back that this
    // flat model can draw, so the seam goes where it shows least.
    const front = { ...SIGNS.A.pose, facing: "front" as const };
    const back = { ...SIGNS.A.pose, facing: "back" as const };
    expect(blendPoses(front, back, 0.4).facing).toBe("front");
    expect(blendPoses(front, back, 0.6).facing).toBe("back");
  });

  it("clamps out-of-range blend factors", () => {
    const a = SIGNS.A.pose;
    const b = SIGNS.B.pose;
    expect(blendPoses(a, b, -1).fingers[0].curl).toBeCloseTo(a.fingers[0].curl);
    expect(blendPoses(a, b, 9).fingers[0].curl).toBeCloseTo(b.fingers[0].curl);
  });

  it("eases in and out", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    // Slower at the start than a straight line.
    expect(easeInOut(0.2)).toBeLessThan(0.2);
  });
});

describe("scheduling", () => {
  const units = toFingerspelling("CAB");

  it("gives every letter the same slot", () => {
    expect(totalDuration(toFingerspelling("AB"), 2)).toBeCloseTo(1);
    expect(totalDuration(toFingerspelling("ABCD"), 2)).toBeCloseTo(2);
  });

  it("walks through the letters in order", () => {
    expect(frameAt(units, 0.1, 2).glyph).toBe("C");
    expect(frameAt(units, 0.6, 2).glyph).toBe("A");
    expect(frameAt(units, 1.1, 2).glyph).toBe("B");
  });

  it("rests before the first letter and after the last", () => {
    expect(frameAt(units, -1, 2).glyph).toBeNull();
    const after = frameAt(units, 99, 2);
    expect(after.finished).toBe(true);
    expect(after.pose).toEqual(RESTING);
  });

  it("settles into the exact target pose during the hold", () => {
    // The reader has to see the shape held still, not a hand permanently in
    // transit between two shapes.
    const held = frameAt(units, 0.45, 2);
    expect(held.glyph).toBe("C");
    expect(held.pose.fingers[0].curl).toBeCloseTo(SIGNS.C.pose.fingers[0].curl);
  });

  it("is still moving early in a letter's slot", () => {
    const moving = frameAt(units, 0.02, 2);
    expect(moving.pose.fingers[0].curl).not.toBeCloseTo(SIGNS.C.pose.fingers[0].curl, 2);
  });

  it("puts a visible dip between doubled letters", () => {
    // Otherwise "LL" is a hand that does not move for two beats and the
    // reader cannot tell one letter from two.
    const doubled = toFingerspelling("LL");
    const dip = frameAt(doubled, 0.5 + 0.1, 2);
    expect(dip.glyph).toBe("L");
    expect(dip.pose.fingers[1].curl).toBeLessThan(SIGNS.L.pose.fingers[1].curl);
  });

  it("applies the path for a letter that has one", () => {
    const j = toFingerspelling("J");
    const early = frameAt(j, 0.3, 2);
    const late = frameAt(j, 0.48, 2);
    expect(early.offset).not.toEqual(late.offset);
  });

  it("leaves a stationary letter at the origin", () => {
    expect(frameAt(toFingerspelling("A"), 0.4, 2).offset).toEqual({ x: 0, y: 0 });
  });

  it("survives an empty string", () => {
    const empty = frameAt([], 1, 2);
    expect(empty.finished).toBe(true);
    expect(empty.pose).toEqual(RESTING);
  });

  it("refuses to divide by a zero rate", () => {
    expect(Number.isFinite(totalDuration(units, 0))).toBe(true);
  });
});

describe("spellableTerms", () => {
  it("pulls out numbers with their units", () => {
    const terms = spellableTerms("Your heart rate is 72 bpm right now.");
    expect(terms.some((t) => t.replace(/\s+/g, " ") === "72 bpm")).toBe(true);
  });

  it("picks up a blood pressure pair", () => {
    expect(spellableTerms("It read 118/76 mmHg.")[0]).toMatch(/118\/76/);
  });

  it("finds a name in the middle of a sentence", () => {
    expect(spellableTerms("That sounds right, Meera.")).toContain("Meera");
  });

  it("does not treat the first word as a name", () => {
    expect(spellableTerms("Breathing looks steady.")).not.toContain("Breathing");
  });

  it("does not repeat a term", () => {
    const terms = spellableTerms("72 bpm, still 72 bpm a minute later.");
    expect(terms.filter((t) => t.startsWith("72"))).toHaveLength(1);
  });

  it("caps how many it returns", () => {
    expect(spellableTerms("1 2 3 4 5 6 7 8 9 10", 3)).toHaveLength(3);
  });

  it("returns nothing when there is nothing worth spelling", () => {
    expect(spellableTerms("how are you feeling today")).toEqual([]);
  });
});
