import { describe, expect, it } from "vitest";

import {
  PACES,
  assessCoherence,
  cycleSeconds,
  pacerAt,
  paceRatePerMin,
  unknownCoherence,
} from "../src/lib/vitals/coherence";

/**
 * A tachogram with a sinusoidal modulation on it, which is what respiratory
 * sinus arrhythmia looks like: the interval between beats lengthens on the
 * out-breath and shortens on the in-breath.
 */
function intervals(options: {
  seconds: number;
  meanMs?: number;
  breathHz?: number;
  swingMs?: number;
  noiseMs?: number;
  /** Extra oscillations at other frequencies, which spread the spectrum. */
  clutter?: Array<{ hz: number; ms: number }>;
}): number[] {
  const meanMs = options.meanMs ?? 900;
  const swing = options.swingMs ?? 0;
  const out: number[] = [];
  let t = 0;
  // A deterministic pseudo-random sequence: a test that fails one run in
  // twenty is worse than no test.
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };

  while (t < options.seconds * 1000) {
    const s = t / 1000;
    let ms = meanMs;
    if (options.breathHz) ms += swing * Math.sin(2 * Math.PI * options.breathHz * s);
    for (const c of options.clutter ?? []) ms += c.ms * Math.sin(2 * Math.PI * c.hz * s + 1);
    if (options.noiseMs) ms += rand() * options.noiseMs;
    out.push(ms);
    t += ms;
  }
  return out;
}

describe("breath-to-heart coherence", () => {
  it("withholds a verdict until there are enough beats", () => {
    const c = assessCoherence([900, 890, 910], 6);
    expect(c.score).toBeNull();
    expect(c.band).toBe("unknown");
    expect(c.note).toMatch(/half a minute/i);
  });

  it("withholds a verdict on beats spanning too little time", () => {
    // Plenty of intervals, but a racing pulse packs them into a few seconds.
    const c = assessCoherence(new Array(25).fill(300), 6);
    expect(c.score).toBeNull();
  });

  it("scores clean slow breathing as coherent", () => {
    const c = assessCoherence(
      intervals({ seconds: 70, breathHz: 0.1, swingMs: 70, noiseMs: 4 }),
      6,
    );
    expect(c.band).toBe("coherent");
    expect(c.score!).toBeGreaterThan(50);
    expect(c.rhythmPerMin!).toBeGreaterThan(4.5);
    expect(c.rhythmPerMin!).toBeLessThan(7.5);
  });

  it("scores a scattered rhythm as scattered", () => {
    const c = assessCoherence(
      intervals({
        seconds: 70,
        breathHz: 0.1,
        swingMs: 25,
        clutter: [
          { hz: 0.05, ms: 25 },
          { hz: 0.22, ms: 25 },
          { hz: 0.33, ms: 25 },
        ],
        noiseMs: 40,
      }),
      6,
    );
    expect(c.score!).toBeLessThan(50);
    expect(c.note).toMatch(/unevenly|settle/i);
  });

  it("says the heart is following the breath when the two frequencies match", () => {
    const c = assessCoherence(
      intervals({ seconds: 70, breathHz: 0.1, swingMs: 70, noiseMs: 4 }),
      6,
    );
    expect(c.locked!).toBeGreaterThan(0.6);
    expect(c.note).toMatch(/following your breath/i);
  });

  it("says it is not following when the breath is somewhere else entirely", () => {
    const c = assessCoherence(
      intervals({ seconds: 70, breathHz: 0.1, swingMs: 70, noiseMs: 4 }),
      // Breathing at 15 a minute while the heart oscillates at 6.
      15,
    );
    expect(c.locked!).toBeLessThan(0.3);
    expect(c.note).toMatch(/not tracking your breath/i);
  });

  it("reports the heart rhythm alone when breathing was not measured", () => {
    const c = assessCoherence(
      intervals({ seconds: 70, breathHz: 0.1, swingMs: 70, noiseMs: 4 }),
      null,
    );
    expect(c.locked).toBeNull();
    expect(c.note).toMatch(/not measured/i);
    expect(c.score).not.toBeNull();
  });

  it("carries the reason through an unknown verdict", () => {
    expect(unknownCoherence("Signal not clean enough").note).toBe("Signal not clean enough");
  });
});

describe("breathing pacer", () => {
  const pace = PACES[0].pace;

  it("asks for the rate its phases add up to", () => {
    expect(cycleSeconds(pace)).toBe(10);
    expect(paceRatePerMin(pace)).toBeCloseTo(6);
  });

  it("walks in, then out, then round again", () => {
    expect(pacerAt(1, pace).phase).toBe("in");
    expect(pacerAt(6, pace).phase).toBe("out");
    expect(pacerAt(11, pace).phase).toBe("in");
    expect(pacerAt(11, pace).cycles).toBe(1);
  });

  it("empties and fills the lungs smoothly", () => {
    expect(pacerAt(0, pace).fullness).toBeCloseTo(0);
    expect(pacerAt(4, pace).fullness).toBeCloseTo(1);
    expect(pacerAt(10, pace).fullness).toBeCloseTo(0, 5);
    // Monotone through the in-breath, with no jump at the turn.
    let previous = -1;
    for (let t = 0; t <= 4; t += 0.25) {
      const f = pacerAt(t, pace).fullness;
      expect(f).toBeGreaterThanOrEqual(previous);
      previous = f;
    }
  });

  it("holds at the top when the pace asks for a hold", () => {
    const box = PACES.find((p) => p.id === "box")!.pace;
    const held = pacerAt(6, box);
    expect(held.phase).toBe("hold");
    expect(held.fullness).toBe(1);
    expect(held.label).toBe("Hold");
  });

  it("treats a negative time as the very start", () => {
    expect(pacerAt(-5, pace).cycles).toBe(0);
    expect(pacerAt(-5, pace).phase).toBe("in");
  });

  it("offers a longer out-breath than in-breath on the resonant paces", () => {
    for (const id of ["resonant", "slow", "gentle"]) {
      const p = PACES.find((x) => x.id === id)!.pace;
      expect(p.exhaleS).toBeGreaterThan(p.inhaleS);
    }
  });
});
