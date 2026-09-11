import { describe, expect, it } from "vitest";

import { CognitiveLoadTracker, type LoadFrame } from "../src/lib/cognition/load";
import { combinePupils, measurePupil } from "../src/lib/vision/pupil";

/**
 * A synthetic eye: a grey iris disc with a darker pupil disc inside it, and
 * optionally a blown-out corneal reflection sitting on the pupil.
 */
function eyePatch(options: {
  size?: number;
  irisRadius?: number;
  pupilRadius: number;
  irisLevel?: number;
  pupilLevel?: number;
  glint?: boolean;
}): { data: Uint8ClampedArray; size: number; centre: { x: number; y: number }; irisRadius: number } {
  const size = options.size ?? 48;
  const irisRadius = options.irisRadius ?? 16;
  const irisLevel = options.irisLevel ?? 130;
  const pupilLevel = options.pupilLevel ?? 22;
  const data = new Uint8ClampedArray(size * size * 4);
  const c = { x: size / 2, y: size / 2 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c.x, y - c.y);
      let level = 210; // Sclera, outside the iris.
      if (d <= options.pupilRadius) level = pupilLevel;
      else if (d <= irisRadius) level = irisLevel;
      if (options.glint && Math.hypot(x - (c.x + 2), y - (c.y - 2)) < 1.5) level = 250;
      const i = (y * size + x) * 4;
      data[i] = level;
      data[i + 1] = level;
      data[i + 2] = level;
      data[i + 3] = 255;
    }
  }
  return { data, size, centre: c, irisRadius };
}

describe("pupil measurement", () => {
  it("recovers the pupil-to-iris ratio from the pixels", () => {
    const eye = eyePatch({ pupilRadius: 6 });
    const sample = measurePupil(eye.data, eye.size, eye.size, eye.centre, eye.irisRadius);
    expect(sample).not.toBeNull();
    // 6/16 = 0.375, with a pixel or so of quantisation at the boundary.
    expect(sample!.ratio).toBeGreaterThan(0.3);
    expect(sample!.ratio).toBeLessThan(0.47);
  });

  it("tracks a pupil that dilates", () => {
    const small = eyePatch({ pupilRadius: 5 });
    const large = eyePatch({ pupilRadius: 8 });
    const a = measurePupil(small.data, small.size, small.size, small.centre, small.irisRadius);
    const b = measurePupil(large.data, large.size, large.size, large.centre, large.irisRadius);
    expect(b!.ratio).toBeGreaterThan(a!.ratio + 0.1);
  });

  it("counts the corneal reflection as pupil rather than punching a hole in it", () => {
    const plain = eyePatch({ pupilRadius: 7 });
    const shiny = eyePatch({ pupilRadius: 7, glint: true });
    const a = measurePupil(plain.data, plain.size, plain.size, plain.centre, plain.irisRadius);
    const b = measurePupil(shiny.data, shiny.size, shiny.size, shiny.centre, shiny.irisRadius);
    expect(Math.abs(a!.ratio - b!.ratio)).toBeLessThan(0.04);
  });

  it("refuses a dark iris it cannot separate from the pupil", () => {
    const flat = eyePatch({ pupilRadius: 7, irisLevel: 30, pupilLevel: 28 });
    expect(measurePupil(flat.data, flat.size, flat.size, flat.centre, flat.irisRadius)).toBeNull();
  });

  it("reports higher contrast for a light iris than a dark one", () => {
    const light = eyePatch({ pupilRadius: 6, irisLevel: 170 });
    const dark = eyePatch({ pupilRadius: 6, irisLevel: 70 });
    const a = measurePupil(light.data, light.size, light.size, light.centre, light.irisRadius);
    const b = measurePupil(dark.data, dark.size, dark.size, dark.centre, dark.irisRadius);
    expect(a!.contrast).toBeGreaterThan(b!.contrast);
  });

  it("refuses an iris too small to hold an estimate", () => {
    const tiny = eyePatch({ size: 10, irisRadius: 2, pupilRadius: 1 });
    expect(measurePupil(tiny.data, tiny.size, tiny.size, tiny.centre, 2)).toBeNull();
  });

  it("weights the clearer eye when combining the pair", () => {
    const combined = combinePupils(
      { ratio: 0.3, contrast: 0.1, samples: 100 },
      { ratio: 0.5, contrast: 0.9, samples: 100 },
    );
    expect(combined!.ratio).toBeGreaterThan(0.45);
    expect(combined!.contrast).toBeCloseTo(0.9);
  });

  it("falls back to whichever eye was readable", () => {
    const only = { ratio: 0.4, contrast: 0.5, samples: 80 };
    expect(combinePupils(only, null)).toBe(only);
    expect(combinePupils(null, only)).toBe(only);
    expect(combinePupils(null, null)).toBeNull();
  });
});

interface SessionOptions {
  seconds: number;
  fps?: number;
  pupil: (t: number) => number | null;
  contrast?: number;
  luma?: (t: number) => number;
  /** Gaze excursion amplitude; smaller means a more tunnelled scan. */
  scan?: (t: number) => number;
  /** Seconds between blinks. */
  blinkEvery?: (t: number) => number;
}

function session(options: SessionOptions): { frames: LoadFrame[]; blinks: number[] } {
  const fps = options.fps ?? 30;
  const frames: LoadFrame[] = [];
  const blinks: number[] = [];
  let nextBlink = 2;

  for (let i = 0; i < options.seconds * fps; i++) {
    const t = i / fps;
    const amplitude = options.scan ? options.scan(t) : 0.25;
    frames.push({
      timestampMs: t * 1000,
      pupilRatio: options.pupil(t),
      pupilContrast: options.contrast ?? 0.4,
      // A square-ish scan pattern: the gaze rests, jumps, and rests again.
      gazeX: amplitude * (Math.floor(t * 1.5) % 2 === 0 ? 1 : -1),
      luma: options.luma ? options.luma(t) : 120,
    });
    if (options.blinkEvery && t >= nextBlink) {
      blinks.push(t * 1000);
      nextBlink = t + options.blinkEvery(t);
    }
  }
  return { frames, blinks };
}

function run(options: SessionOptions) {
  const tracker = new CognitiveLoadTracker();
  const { frames, blinks } = session(options);
  for (const frame of frames) tracker.push(frame);
  return tracker.analyse(blinks);
}

describe("cognitive load", () => {
  it("says it is still learning during the baseline", () => {
    const load = run({ seconds: 6, pupil: () => 0.4, blinkEvery: () => 4 });
    expect(load.index).toBeNull();
    expect(load.baselineReady).toBe(false);
    expect(load.driver).toMatch(/resting eyes/i);
  });

  it("scores an unchanged person as lightly loaded", () => {
    const load = run({ seconds: 40, pupil: () => 0.4, blinkEvery: () => 4 });
    expect(load.baselineReady).toBe(true);
    expect(load.index).not.toBeNull();
    expect(load.index!).toBeLessThan(20);
    expect(load.band).toBe("light");
  });

  it("scores dilated pupils, suppressed blinking and a narrowed scan as heavy", () => {
    const load = run({
      seconds: 40,
      // Twelve percent dilation, blinks four times rarer, scan halved.
      pupil: (t) => (t < 10 ? 0.4 : 0.45),
      blinkEvery: (t) => (t < 10 ? 4 : 16),
      scan: (t) => (t < 10 ? 0.25 : 0.1),
    });
    expect(load.index!).toBeGreaterThan(60);
    expect(load.band).toBe("heavy");
    expect(load.confidence).toBeCloseTo(1, 5);
  });

  it("names the channel that moved most", () => {
    const load = run({
      seconds: 40,
      pupil: (t) => (t < 10 ? 0.4 : 0.46),
      blinkEvery: () => 4,
    });
    expect(load.driver).toMatch(/pupil/i);
  });

  it("stands the pupil down when the light on the face changes", () => {
    const load = run({
      seconds: 40,
      pupil: (t) => (t < 10 ? 0.4 : 0.45),
      luma: (t) => (t < 10 ? 120 : 180),
      blinkEvery: () => 4,
    });
    expect(load.pupil.value).toBeNull();
    expect(load.pupil.withheld).toMatch(/light/i);
    // The score survives on the other two channels, and says so.
    expect(load.index).not.toBeNull();
    expect(load.confidence).toBeLessThan(0.6);
  });

  it("stands the pupil down when the iris never separated", () => {
    const load = run({ seconds: 40, pupil: () => null, blinkEvery: () => 4 });
    expect(load.pupil.value).toBeNull();
    expect(load.pupil.withheld).toMatch(/dark irises|not readable/i);
  });

  it("stands the pupil down when contrast is below the floor", () => {
    const load = run({ seconds: 40, pupil: () => 0.4, contrast: 0.02, blinkEvery: () => 4 });
    expect(load.pupil.value).toBeNull();
  });

  it("will not compare against a baseline with too few blinks in it", () => {
    const load = run({ seconds: 40, pupil: () => 0.4 });
    expect(load.blink.value).toBeNull();
    expect(load.blink.withheld).toMatch(/few blinks/i);
  });

  it("reports nothing at all rather than guessing when every channel is out", () => {
    const load = run({
      seconds: 40,
      pupil: () => null,
      luma: () => 120,
      scan: () => 0,
    });
    expect(load.index).toBeNull();
    expect(load.band).toBe("unknown");
    expect(load.confidence).toBe(0);
  });

  it("forgets everything on reset", () => {
    const tracker = new CognitiveLoadTracker();
    const { frames, blinks } = session({ seconds: 40, pupil: () => 0.4, blinkEvery: () => 4 });
    for (const frame of frames) tracker.push(frame);
    expect(tracker.analyse(blinks).baselineReady).toBe(true);
    tracker.reset();
    expect(tracker.analyse([]).baselineReady).toBe(false);
    expect(tracker.baselineState.ready).toBe(false);
  });
});
