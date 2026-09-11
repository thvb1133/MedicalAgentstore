import { describe, expect, it } from "vitest";

import { fingerprint, isRig, RIG_MESSAGE } from "@/lib/avatar/detectRig";
import {
  affine,
  bleed,
  bump,
  displace,
  lattice,
  smoothstep,
  type Point,
} from "@/lib/avatar/warp";
import { blinkAt, headPose, nextBlinkAfter } from "@/lib/avatar/life";
import { shapeAt, supportsVisemes, textToVisemes, visemeTrack } from "@/lib/avatar/visemes";
import { presenterFrame } from "@/lib/avatar/presenter";
import { eyeAnchors, getRig, mouthAnchors, mouthPatches } from "@/lib/avatar/faceRig";
import { AVATARS } from "@/lib/avatar/presets";
import { languageInstructions, mirrorLanguageInstructions } from "@/lib/avatar/languages";

const BOX = { x: 0, y: 0, w: 1, h: 0.6 };
const ZERO: Point = { x: 0, y: 0 };

describe("lattice", () => {
  it("covers the box corner to corner", () => {
    const grid = lattice(BOX, 4, 3);
    expect(grid.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(grid.vertices[grid.vertices.length - 1]).toEqual({ x: 1, y: 0.6 });
  });

  it("has one vertex more than cell in each direction", () => {
    const grid = lattice(BOX, 4, 3);
    expect(grid.vertices).toHaveLength(5 * 4);
    expect(grid.triangles).toHaveLength(4 * 3 * 2);
  });

  it("indexes every triangle inside the vertex list", () => {
    const grid = lattice(BOX, 5, 4);
    for (const triangle of grid.triangles) {
      for (const index of triangle) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(grid.vertices.length);
      }
    }
  });

  it("pins only the edges it was asked to", () => {
    const free = lattice(BOX, 3, 3);
    expect(free.fixed.some(Boolean)).toBe(false);

    const pinned = lattice(BOX, 3, 3, { top: true, bottom: true });
    // Top and bottom rows, four vertices each.
    expect(pinned.fixed.filter(Boolean)).toHaveLength(8);
  });
});

describe("displace", () => {
  it("leaves vertices alone when the field is zero", () => {
    const grid = lattice(BOX, 3, 3);
    expect(displace(grid, () => ZERO)).toEqual(grid.vertices);
  });

  it("moves every free vertex by a constant field", () => {
    const grid = lattice(BOX, 2, 2);
    const moved = displace(grid, () => ({ x: 0.03, y: -0.02 }));
    for (let i = 0; i < grid.vertices.length; i++) {
      expect(moved[i].x).toBeCloseTo(grid.vertices[i].x + 0.03, 9);
      expect(moved[i].y).toBeCloseTo(grid.vertices[i].y - 0.02, 9);
    }
  });

  it("holds pinned vertices against the untouched photograph", () => {
    // This is what stops a warp tearing a seam along the edge of the patch.
    const grid = lattice(BOX, 2, 2, { top: true });
    const moved = displace(grid, () => ({ x: 0.5, y: 0.5 }));
    for (let i = 0; i < grid.vertices.length; i++) {
      if (grid.fixed[i]) expect(moved[i]).toEqual(grid.vertices[i]);
    }
  });

  it("does not mutate the lattice it was given", () => {
    const grid = lattice(BOX, 2, 2);
    const before = JSON.stringify(grid.vertices);
    displace(grid, () => ({ x: 1, y: 1 }));
    expect(JSON.stringify(grid.vertices)).toBe(before);
  });
});

describe("affine", () => {
  it("recovers a pure translation", () => {
    const from = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ] as const;
    const to = [
      { x: 5, y: 7 },
      { x: 6, y: 7 },
      { x: 5, y: 8 },
    ] as const;
    const m = affine(from, to);
    expect(m).not.toBeNull();
    expect(m![4]).toBeCloseTo(5, 9);
    expect(m![5]).toBeCloseTo(7, 9);
  });

  it("maps each source corner onto its target", () => {
    const from = [
      { x: 2, y: 1 },
      { x: 7, y: 3 },
      { x: 3, y: 9 },
    ] as const;
    const to = [
      { x: -1, y: 4 },
      { x: 6, y: 2 },
      { x: 2, y: 12 },
    ] as const;
    const [a, b, c, d, e, f] = affine(from, to)!;
    for (let i = 0; i < 3; i++) {
      expect(a * from[i].x + c * from[i].y + e).toBeCloseTo(to[i].x, 6);
      expect(b * from[i].x + d * from[i].y + f).toBeCloseTo(to[i].y, 6);
    }
  });

  it("refuses a degenerate triangle rather than producing a silent NaN", () => {
    // Three collinear points have no unique transform, and a NaN matrix
    // poisons the whole canvas rather than one patch.
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ] as const;
    expect(affine(line, line)).toBeNull();
  });
});

describe("bleed", () => {
  it("pushes corners outward from the centroid", () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ] as const;
    const grown = bleed(triangle, 1);
    const area = (t: readonly Point[]) =>
      Math.abs(
        (t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y),
      ) / 2;
    expect(area(grown)).toBeGreaterThan(area(triangle));
  });

  it("stays roughly where it was rather than sliding across the face", () => {
    // Each corner moves the same distance rather than by the same scale, so
    // a scalene triangle's centroid shifts slightly. Slightly is the point:
    // this covers a seam, it does not reposition a patch.
    const triangle = [
      { x: 1, y: 2 },
      { x: 9, y: 3 },
      { x: 4, y: 11 },
    ] as const;
    const grown = bleed(triangle, 2);
    const cx = (t: readonly Point[]) => (t[0].x + t[1].x + t[2].x) / 3;
    expect(Math.abs(cx(grown) - cx(triangle))).toBeLessThan(0.1);
  });
});

describe("easing", () => {
  it("clamps outside the edges", () => {
    expect(smoothstep(0, 1, -5)).toBe(0);
    expect(smoothstep(0, 1, 5)).toBe(1);
  });

  it("is symmetric about the midpoint", () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 9);
    expect(smoothstep(0, 1, 0.25) + smoothstep(0, 1, 0.75)).toBeCloseTo(1, 9);
  });

  it("peaks at the centre and falls to nothing at the edge of the bump", () => {
    expect(bump(0, 1)).toBeCloseTo(1, 9);
    expect(bump(1, 1)).toBeCloseTo(0, 9);
    expect(bump(2, 1)).toBe(0);
    expect(bump(-0.5, 1)).toBeCloseTo(bump(0.5, 1), 9);
  });
});

describe("visemes", () => {
  it("only claims Latin script, where letters map to mouth shapes", () => {
    expect(supportsVisemes("en-GB")).toBe(true);
    expect(supportsVisemes("es-ES")).toBe(true);
    expect(supportsVisemes("hi-IN")).toBe(false);
    expect(supportsVisemes("cmn-CN")).toBe(false);
    expect(supportsVisemes("ar-AE")).toBe(false);
    expect(supportsVisemes("ja-JP")).toBe(false);
    expect(supportsVisemes("ko-KR")).toBe(false);
  });

  it("opens the jaw on vowels and shuts it on lip consonants", () => {
    const track = visemeTrack("ma", 1);
    const jaws = track.shapes.map((s) => s.jaw);
    expect(Math.max(...jaws)).toBeGreaterThan(0.3);
    expect(Math.min(...jaws)).toBeLessThan(0.15);
  });

  it("rounds the lips somewhere in a word that needs it", () => {
    expect(visemeTrack("soon", 1).shapes.some((s) => s.spread < 0)).toBe(true);
    expect(visemeTrack("see", 1).shapes.some((s) => s.spread > 0)).toBe(true);
  });

  it("says digits as words rather than skipping them", () => {
    // "72 bpm" is read aloud, so it has to have mouth shapes.
    expect(textToVisemes("72").length).toBeGreaterThan(3);
  });

  it("fits the track to however long the audio actually is", () => {
    for (const duration of [1, 3, 8]) {
      const track = visemeTrack("your heart rate looks steady", duration);
      expect(track.times[track.times.length - 1]).toBeCloseTo(duration, 6);
      expect(track.times.every((t, i, all) => i === 0 || t >= all[i - 1])).toBe(true);
    }
  });

  it("starts and finishes with the mouth shut", () => {
    const track = visemeTrack("hello there", 2);
    expect(shapeAt(track, 0).jaw).toBeCloseTo(0, 6);
    expect(shapeAt(track, 2).jaw).toBeCloseTo(0, 6);
    expect(shapeAt(track, -1).jaw).toBeCloseTo(0, 6);
    expect(shapeAt(track, 99).jaw).toBeCloseTo(0, 6);
  });

  it("blends between shapes instead of snapping", () => {
    const track = visemeTrack("ma", 1);
    const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => shapeAt(track, t).jaw);
    expect(new Set(samples.map((v) => v.toFixed(4))).size).toBeGreaterThan(2);
  });

  it("survives text with nothing sayable in it", () => {
    const track = visemeTrack("…", 1.5);
    expect(track.times.length).toBeGreaterThanOrEqual(2);
    expect(shapeAt(track, 0.7).jaw).toBeCloseTo(0, 6);
  });

  it("does not divide by a zero-length reply", () => {
    const track = visemeTrack("hello", 0);
    expect(track.times.every(Number.isFinite)).toBe(true);
  });
});

describe("life", () => {
  it("blinks sometimes and not most of the time", () => {
    let blinking = 0;
    const steps = 3000;
    for (let i = 0; i < steps; i++) blinking += blinkAt(i * 0.02) > 0.5 ? 1 : 0;
    const share = blinking / steps;
    // A person blinks for a few per cent of the time they are awake. Zero
    // would be a statue and a third would be a nervous tic.
    expect(share).toBeGreaterThan(0.002);
    expect(share).toBeLessThan(0.12);
  });

  it("gives the same answer for the same moment", () => {
    expect(blinkAt(12.34)).toBe(blinkAt(12.34));
    expect(headPose(12.34)).toEqual(headPose(12.34));
  });

  it("has eyes open at the start rather than mid-blink", () => {
    expect(blinkAt(0)).toBe(0);
    expect(blinkAt(-1)).toBe(0);
  });

  it("always says the next blink is still ahead", () => {
    // The answer is a wait, not an instant, and a negative wait would mean
    // something downstream had already missed it.
    for (let t = 0; t < 60; t += 0.31) {
      expect(nextBlinkAfter(t), String(t)).toBeGreaterThan(0);
    }
  });

  it("keeps the head near where it started", () => {
    for (let t = 0; t < 120; t += 0.37) {
      for (const speaking of [false, true]) {
        const pose = headPose(t, speaking);
        expect(Math.abs(pose.dx)).toBeLessThan(0.02);
        expect(Math.abs(pose.dy)).toBeLessThan(0.02);
        expect(Math.abs(pose.tilt)).toBeLessThan(0.05);
        expect(pose.scale).toBeGreaterThan(0.98);
        expect(pose.scale).toBeLessThan(1.02);
      }
    }
  });

  it("moves more while speaking than while listening", () => {
    const still = headPose(3.3);
    const talking = headPose(3.3, true);
    expect(Math.abs(talking.tilt)).toBeGreaterThan(Math.abs(still.tilt));
  });

  it("does not repeat on an obvious cycle", () => {
    // Two sines with a rational period ratio produce a visible loop.
    expect(headPose(0)).not.toEqual(headPose(4));
  });
});

describe("presenterFrame", () => {
  const idle = { status: "idle" as const, time: 3, speech: null, loudness: null };

  it("keeps the mouth shut when nothing is being said", () => {
    expect(presenterFrame(idle).expression.jaw).toBeCloseTo(0, 6);
  });

  it("still breathes when idle, rather than freezing", () => {
    expect(presenterFrame({ ...idle, time: 1 }).pose).not.toEqual(
      presenterFrame({ ...idle, time: 9 }).pose,
    );
  });

  it("opens the mouth while speaking", () => {
    const track = visemeTrack("your heart rate looks steady", 2);
    let widest = 0;
    for (let t = 0; t < 2; t += 0.02) {
      widest = Math.max(
        widest,
        presenterFrame({
          status: "speaking",
          time: 10 + t,
          speech: { track, startedAt: 10 },
          loudness: 0.6,
        }).expression.jaw,
      );
    }
    expect(widest).toBeGreaterThan(0.2);
  });

  it("lets loudness carry the mouth when the text cannot", () => {
    // Non-Latin scripts have no viseme track, so the caller passes none and
    // the mouth has to come from the audio alone.
    const loud = presenterFrame({ status: "speaking", time: 4, speech: null, loudness: 0.9 });
    const quiet = presenterFrame({ status: "speaking", time: 4, speech: null, loudness: 0 });
    expect(loud.expression.jaw).toBeGreaterThan(quiet.expression.jaw);
  });

  it("shuts the mouth in a silence the text thinks is still a vowel", () => {
    const track = visemeTrack("aaaa", 2);
    const speaking = { status: "speaking" as const, time: 11, speech: { track, startedAt: 10 } };
    expect(presenterFrame({ ...speaking, loudness: 0 }).expression.jaw).toBeLessThan(
      presenterFrame({ ...speaking, loudness: 1 }).expression.jaw,
    );
  });

  it("never opens the mouth further than a face can", () => {
    const track = visemeTrack("aaa ooo eee", 3);
    for (let t = 0; t < 3; t += 0.02) {
      for (const loudness of [null, 0, 0.5, 1]) {
        const { expression } = presenterFrame({
          status: "speaking",
          time: t,
          speech: { track, startedAt: 0 },
          loudness,
        });
        expect(expression.jaw).toBeLessThanOrEqual(1);
        expect(expression.jaw).toBeGreaterThanOrEqual(0);
        expect(Math.abs(expression.spread)).toBeLessThanOrEqual(1);
        expect(expression.blink).toBeGreaterThanOrEqual(0);
        expect(expression.blink).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("rigs", () => {
  const presenters = AVATARS.filter((a) => a.id !== "pip");

  it("ships one for every presenter, and none for Pip", () => {
    for (const avatar of AVATARS) {
      const rig = getRig(avatar.id);
      if (avatar.id === "pip") expect(rig, "pip").toBeNull();
      else expect(rig, avatar.id).not.toBeNull();
    }
  });

  it("has the refined mesh, which is what the iris and mouth work needs", () => {
    for (const avatar of presenters) {
      expect(getRig(avatar.id)!.points.length, avatar.id).toBeGreaterThanOrEqual(478);
    }
  });

  it("keeps landmarks inside the picture", () => {
    for (const avatar of presenters) {
      for (const [x, y] of getRig(avatar.id)!.points) {
        expect(x, avatar.id).toBeGreaterThan(-0.2);
        expect(x, avatar.id).toBeLessThan(1.2);
        expect(y, avatar.id).toBeGreaterThan(-0.2);
        expect(y, avatar.id).toBeLessThan(1.2);
      }
    }
  });

  it("finds a mouth the right way up on every one of them", () => {
    for (const avatar of presenters) {
      const mouth = mouthAnchors(getRig(avatar.id)!);
      // Nose above the lips, lips above the chin, and a mouth with width.
      expect(mouth.noseBase, avatar.id).toBeLessThan(mouth.lipLine);
      expect(mouth.lipLine, avatar.id).toBeLessThan(mouth.chin);
      expect(mouth.halfWidth, avatar.id).toBeGreaterThan(0.02);
    }
  });

  it("finds two eyes, apart from each other and above the mouth", () => {
    for (const avatar of presenters) {
      const rig = getRig(avatar.id)!;
      const [a, b] = eyeAnchors(rig);
      const mouth = mouthAnchors(rig);
      expect(a.centre.y, avatar.id).toBeLessThan(mouth.lipLine);
      expect(b.centre.y, avatar.id).toBeLessThan(mouth.lipLine);
      expect(Math.abs(a.centre.x - b.centre.x), avatar.id).toBeGreaterThan(0.04);
      expect(a.upperLid, avatar.id).toBeLessThan(a.lowerLid);
      expect(b.upperLid, avatar.id).toBeLessThan(b.lowerLid);
    }
  });

  it("builds mouth patches that meet rather than overlap", () => {
    for (const avatar of presenters) {
      const { upper, lower } = mouthPatches(getRig(avatar.id)!);
      expect(upper.box.y + upper.box.h, avatar.id).toBeCloseTo(lower.box.y, 5);
    }
  });
});

describe("uploaded rigs", () => {
  it("changes fingerprint when the picture changes", () => {
    expect(fingerprint("data:image/webp;base64,AAAA")).not.toBe(
      fingerprint("data:image/webp;base64,AAAB"),
    );
    expect(fingerprint("same")).toBe(fingerprint("same"));
  });

  it("rejects anything that is not a usable mesh", () => {
    const points = Array.from({ length: 478 }, () => [0.5, 0.5]);
    expect(isRig({ width: 640, height: 480, points })).toBe(true);
    expect(isRig(null)).toBe(false);
    expect(isRig(undefined)).toBe(false);
    // A short list is worse than none: everything downstream indexes into it
    // by number and would read undefined off the end.
    expect(isRig({ width: 640, height: 480, points: points.slice(0, 100) })).toBe(false);
    expect(isRig({ width: 640, height: 480, points: [["a", "b"]] })).toBe(false);
    expect(isRig({ width: "640", height: 480, points })).toBe(false);
  });

  it("accepts a rig that came back out of storage as JSON", () => {
    const rig = getRig("maya")!;
    expect(isRig(JSON.parse(JSON.stringify(rig)))).toBe(true);
  });

  it("explains every failure in terms of what happens next", () => {
    for (const message of Object.values(RIG_MESSAGE)) {
      expect(message).toMatch(/still/i);
      expect(message.length).toBeGreaterThan(40);
    }
  });
});

describe("mirrored language", () => {
  it("tells the model to follow the person rather than a setting", () => {
    const text = mirrorLanguageInstructions();
    expect(text).toMatch(/same language/i);
    expect(text).toMatch(/switch/i);
  });

  it("still refuses to translate a measurement", () => {
    expect(mirrorLanguageInstructions()).toMatch(/bpm/);
  });

  it("is deliberately the opposite of what the agents do", () => {
    // An agent pins the language: someone mid-reading who says one English
    // word should not have the conversation switch under them.
    expect(languageInstructions("hi-IN")).toMatch(/even when the person uses English/i);
  });
});
