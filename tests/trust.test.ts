import { describe, expect, it } from "vitest";

import { assessLighting, unknownLighting } from "@/lib/vitals/lighting";
import { assessRhythm } from "@/lib/vitals/rhythm";
import {
  assessTone,
  individualTypologyAngle,
  toneBand,
  toneConfidence,
} from "@/lib/vitals/skinTone";
import { agreementFrom, fusePulse, type RegionTrace } from "@/lib/signal/fusion";
import { analyseVitals, VitalsBuffer, type FrameRegion } from "@/lib/vitals/engine";

const FS = 30;

/** A clean synthetic pulse in the green channel, as an rPPG trace would carry it. */
function pulseTrace(bpm: number, seconds: number, amplitude = 1, noise = 0) {
  const n = Math.round(seconds * FS);
  const r = new Float64Array(n);
  const g = new Float64Array(n);
  const b = new Float64Array(n);
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296 - 0.5;
  };
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    const beat = Math.sin(2 * Math.PI * (bpm / 60) * t);
    // Real skin carries the pulse mostly in green, weakly and in antiphase in
    // red; the projections downstream depend on that structure.
    g[i] = 130 + amplitude * 2.2 * beat + noise * rand() * 4;
    r[i] = 165 - amplitude * 0.5 * beat + noise * rand() * 4;
    b[i] = 120 + amplitude * 0.3 * beat + noise * rand() * 4;
  }
  return { r, g, b };
}

function region(name: RegionTrace["name"], bpm: number, amplitude: number, noise = 0): RegionTrace {
  return { name, coverage: 0.7, trace: pulseTrace(bpm, 20, amplitude, noise) };
}

describe("lighting", () => {
  const even = (luma: number) =>
    [0, 1, 2].map(() => ({ luma, clipped: 0, coverage: 0.8 }));

  it("says nothing when there is nothing to say", () => {
    const report = assessLighting(even(140));
    expect(report.verdict).toBe("good");
    expect(report.advice).toBeNull();
    expect(report.ready).toBe(true);
  });

  it("refuses a frame with no skin in it, and says what to do", () => {
    const report = assessLighting([{ luma: 0, clipped: 0, coverage: 0 }]);
    expect(report.ready).toBe(false);
    expect(report.advice).toMatch(/in frame/i);
  });

  it("names darkness first when the room is dark", () => {
    const report = assessLighting(even(30));
    expect(report.score).toBeLessThan(0.2);
    expect(report.advice).toMatch(/dark/i);
  });

  it("names side lighting when one cheek is in shadow", () => {
    const report = assessLighting([
      { luma: 150, clipped: 0, coverage: 0.8 },
      { luma: 150, clipped: 0, coverage: 0.8 },
      { luma: 80, clipped: 0, coverage: 0.8 },
    ]);
    expect(report.advice).toMatch(/one side/i);
    expect(report.score).toBeLessThan(0.7);
  });

  it("names clipping when the sun is on half the face", () => {
    const report = assessLighting(
      [0, 1, 2].map(() => ({ luma: 200, clipped: 0.3, coverage: 0.8 })),
    );
    expect(report.advice).toMatch(/blown out|direct sun/i);
  });

  it("catches a flickering source from the brightness history", () => {
    const steady = Array.from({ length: 60 }, () => 130);
    const flickering = Array.from({ length: 60 }, (_, i) => 130 + (i % 2 ? 12 : -12));
    expect(assessLighting(even(130), steady).detail.flicker).toBeLessThan(0.01);
    const report = assessLighting(even(130), flickering);
    expect(report.detail.flicker).toBeGreaterThan(0.05);
    expect(report.advice).toMatch(/flicker/i);
  });

  it("ignores a history too short to mean anything", () => {
    expect(assessLighting(even(130), [10, 200, 10]).detail.flicker).toBe(0);
  });

  it("lets a dim but even room through with a warning rather than blocking it", () => {
    // Refusing to measure is its own dishonesty; the confidence score already
    // carries the consequence.
    const report = assessLighting(even(70));
    expect(report.ready).toBe(true);
    expect(report.verdict).not.toBe("good");
    expect(report.advice).not.toBeNull();
  });

  it("treats no information as unknown rather than as bad", () => {
    const report = unknownLighting();
    expect(report.verdict).toBe("unknown");
    expect(report.ready).toBe(true);
    expect(report.advice).toBeNull();
  });
});

describe("rhythm", () => {
  const steady = (n: number, ibi = 830) =>
    Array.from({ length: n }, (_, i) => ibi + Math.sin(i) * 6);

  it("says nothing at all from too few beats", () => {
    const report = assessRhythm(steady(8));
    expect(report.rhythm).toBe("unknown");
    expect(report.note).toBeNull();
  });

  it("calls an even pulse regular, quietly", () => {
    const report = assessRhythm(steady(40));
    expect(report.rhythm).toBe("regular");
    expect(report.note).toBeNull();
  });

  it("treats ordinary respiratory variation as normal and says so", () => {
    // Sinus arrhythmia: the interval breathes with the person. At a resting
    // rate that is roughly one breath every five beats, swinging by tens of
    // milliseconds either way.
    const breathing = Array.from(
      { length: 40 },
      (_, i) => 830 + Math.sin((i * 2 * Math.PI) / 5) * 60,
    );
    const report = assessRhythm(breathing);
    expect(report.rhythm).toBe("some-variation");
    expect(report.note).toMatch(/normal/i);
  });

  it("flags scattered ectopic-looking beats", () => {
    const intervals = steady(40);
    for (const i of [7, 15, 23, 31, 36]) intervals[i] = 520;
    const report = assessRhythm(intervals);
    expect(report.rhythm).toBe("irregular");
    expect(report.ectopicLike).toBeGreaterThanOrEqual(5);
  });

  it("flags a chaotic sequence", () => {
    let seed = 3;
    const chaotic = Array.from({ length: 40 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return 600 + (seed % 500);
    });
    expect(assessRhythm(chaotic).rhythm).toBe("irregular");
  });

  it("does not name a condition, and does say to get it checked", () => {
    const intervals = steady(40);
    for (const i of [7, 15, 23, 31, 36]) intervals[i] = 520;
    const note = assessRhythm(intervals).note ?? "";
    expect(note).toMatch(/doctor/i);
    expect(note).toMatch(/not a diagnosis/i);
    expect(note).toMatch(/movement/i);
    // The whole point of the caution is that this is not a detector.
    expect(note).not.toMatch(/fibrillation|arrhythmia|AFib|atrial/i);
  });

  it("does not call a fast but even heart irregular", () => {
    // Short intervals must not read as scatter, which is why the measure is
    // relative to the mean rather than absolute.
    expect(assessRhythm(steady(40, 400)).rhythm).not.toBe("irregular");
  });
});

describe("skin tone", () => {
  it("orders tones the way the dermatological scale does", () => {
    const pale = individualTypologyAngle(240, 205, 190);
    const mid = individualTypologyAngle(180, 135, 110);
    const deep = individualTypologyAngle(90, 62, 48);
    expect(pale).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(deep);
  });

  it("sorts each into a band", () => {
    expect(toneBand(individualTypologyAngle(240, 205, 190))).toBe("lighter");
    expect(toneBand(individualTypologyAngle(90, 62, 48))).toBe("darker");
    expect(toneBand(NaN)).toBe("unknown");
  });

  it("expects less signal on darker skin, and says why", () => {
    const darker = toneConfidence("darker");
    expect(darker.expectedSnr).toBeLessThan(toneConfidence("lighter").expectedSnr);
    expect(darker.note).toMatch(/melanin/i);
    // It has to be clear the limitation belongs to the method.
    expect(darker.note).toMatch(/limitation of the method/i);
    expect(darker.note).not.toMatch(/inaccurate|wrong reading|unreliable/i);
  });

  it("has nothing to add for the tone the method was built around", () => {
    expect(toneConfidence("lighter").note).toBeNull();
  });

  it("says nothing from a black frame rather than guessing", () => {
    expect(assessTone(0, 0, 0).band).toBe("unknown");
    expect(assessTone(0, 0, 0).note).toBeNull();
  });

  it("never scales a measurement, only a sentence", () => {
    // Guarding the decision rather than the arithmetic: the confidence object
    // carries no correction factor anyone could apply to a heart rate.
    const keys = Object.keys(toneConfidence("darker")).sort();
    expect(keys).toEqual(["band", "expectedSnr", "note"]);
  });
});

describe("multi-region fusion", () => {
  it("agrees with itself when every region sees the same pulse", () => {
    const fused = fusePulse(
      [region("forehead", 72, 1), region("left cheek", 72, 1), region("right cheek", 72, 1)],
      FS,
    );
    expect(fused.peak).not.toBeNull();
    expect(fused.peak!.freq * 60).toBeCloseTo(72, 0);
    expect(fused.concurring).toBe(3);
    expect(fused.agreement).toBe(1);
  });

  it("weights a clean region above a noisy one", () => {
    const fused = fusePulse(
      [
        region("forehead", 72, 1),
        region("left cheek", 72, 0.05, 6),
        region("right cheek", 72, 1),
      ],
      FS,
    );
    const byName = Object.fromEntries(fused.regions.map((r) => [r.name, r.weight]));
    expect(byName["forehead"]).toBeGreaterThan(byName["left cheek"]);
    expect(byName["right cheek"]).toBeGreaterThan(byName["left cheek"]);
  });

  it("recovers the right rate when one region is ruined", () => {
    // A hand against one cheek, or a window on one side. Averaging the pixels
    // first would let the ruined region pull the answer; weighting does not.
    const fused = fusePulse(
      [
        region("forehead", 72, 1),
        region("left cheek", 110, 0.08, 8),
        region("right cheek", 72, 1),
      ],
      FS,
    );
    expect(fused.peak!.freq * 60).toBeCloseTo(72, 0);
  });

  it("collapses agreement when regions of the same face disagree", () => {
    const fused = fusePulse(
      [region("forehead", 62, 1), region("left cheek", 96, 1), region("right cheek", 128, 1)],
      FS,
    );
    expect(fused.concurring).toBeLessThan(fused.contributing);
    expect(fused.agreement).toBeLessThan(0.7);
  });

  it("reports no agreement rather than a confident answer from nothing", () => {
    const flat: RegionTrace = {
      name: "forehead",
      coverage: 0.7,
      trace: pulseTrace(72, 20, 0, 0),
    };
    const fused = fusePulse([flat, { ...flat, name: "left cheek" }], FS);
    expect(fused.contributing).toBe(0);
    expect(fused.agreement).toBe(0);
  });

  it("does not claim corroboration from a single region", () => {
    // One clean region is a perfectly ordinary way to measure a pulse, but
    // nothing has checked it, and the score has to say so.
    expect(agreementFrom(1, 1)).toBe(0.5);
    expect(agreementFrom(2, 2)).toBeGreaterThan(agreementFrom(1, 1));
    expect(agreementFrom(3, 3)).toBeGreaterThan(agreementFrom(2, 2));
    expect(agreementFrom(1, 3)).toBeLessThan(0.2);
    expect(agreementFrom(0, 0)).toBe(0);
  });
});

describe("the engine with regions", () => {
  function fill(
    buffer: VitalsBuffer,
    seconds: number,
    make: (t: number, i: number) => FrameRegion[],
  ) {
    const n = Math.round(seconds * FS);
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      const regions = make(t, i);
      const mean = (pick: (r: FrameRegion) => number) =>
        regions.reduce((s, r) => s + pick(r), 0) / regions.length;
      buffer.push({
        timestampMs: t * 1000,
        r: mean((r) => r.r),
        g: mean((r) => r.g),
        b: mean((r) => r.b),
        regions,
        faceY: 0.5,
        motion: 0.0005,
        faceFound: true,
      });
    }
  }

  const beating = (t: number, bpm: number, amplitude: number, luma: number): FrameRegion => {
    const beat = Math.sin(2 * Math.PI * (bpm / 60) * t);
    return {
      r: 165 - amplitude * 0.5 * beat,
      g: 130 + amplitude * 2.2 * beat,
      b: 120 + amplitude * 0.3 * beat,
      coverage: 0.75,
      luma,
      clipped: 0,
    };
  };

  it("reads a rate and a per-region breakdown", () => {
    const buffer = new VitalsBuffer(30);
    fill(buffer, 25, (t) => [
      beating(t, 68, 1, 140),
      beating(t, 68, 1, 138),
      beating(t, 68, 1, 142),
    ]);
    const result = analyseVitals(buffer);
    expect(result.heartRateBpm).not.toBeNull();
    expect(Math.abs(result.heartRateBpm! - 68)).toBeLessThan(3);
    expect(result.fusion?.contributing).toBe(3);
    expect(result.fusion?.concurring).toBe(3);
    expect(result.lighting.verdict).toBe("good");
  });

  it("holds the reading down when the light is bad", () => {
    const bright = new VitalsBuffer(30);
    fill(bright, 25, (t) => [
      beating(t, 68, 1, 140),
      beating(t, 68, 1, 138),
      beating(t, 68, 1, 142),
    ]);
    const dim = new VitalsBuffer(30);
    fill(dim, 25, (t) => [beating(t, 68, 1, 25), beating(t, 68, 1, 24), beating(t, 68, 1, 26)]);

    const lit = analyseVitals(bright);
    const dark = analyseVitals(dim);
    expect(dark.lighting.verdict).toBe("unusable");
    expect(dark.lighting.advice).toMatch(/dark/i);
    expect(dark.quality.score).toBeLessThan(lit.quality.score);
  });

  it("tells the person which side the light is on", () => {
    const buffer = new VitalsBuffer(30);
    fill(buffer, 25, (t) => [
      beating(t, 68, 1, 150),
      beating(t, 68, 1, 150),
      beating(t, 68, 1, 70),
    ]);
    expect(analyseVitals(buffer).lighting.advice).toMatch(/one side/i);
  });

  it("still works for a caller with no region data", () => {
    const buffer = new VitalsBuffer(30);
    const n = 25 * FS;
    for (let i = 0; i < n; i++) {
      const t = i / FS;
      const beat = Math.sin(2 * Math.PI * (68 / 60) * t);
      buffer.push({
        timestampMs: t * 1000,
        r: 165 - 0.5 * beat,
        g: 130 + 2.2 * beat,
        b: 120 + 0.3 * beat,
        faceY: 0.5,
        motion: 0.0005,
        faceFound: true,
      });
    }
    const result = analyseVitals(buffer);
    expect(result.heartRateBpm).not.toBeNull();
    expect(result.fusion).toBeNull();
    expect(result.lighting.verdict).toBe("unknown");
  });
});
