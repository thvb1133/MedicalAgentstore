import { describe, expect, it } from "vitest";

import {
  describeContext,
  type LiveContext,
  type VitalsContext,
  type VoiceContext,
} from "@/lib/conversation";

/**
 * These test the sentence that gets sent to Claude.
 *
 * That string is the whole interface between the measurements and the model.
 * If a null leaks through as a number, or a reading taken from an unusable
 * signal arrives looking authoritative, the model will talk about it in a
 * confident human voice and the person will believe it. So the assertions
 * here are mostly about what must *not* appear.
 */

const GOOD_VITALS: VitalsContext = {
  heartRateBpm: 72.4,
  breathingRateBpm: 14.2,
  hrvSdnnMs: 48.6,
  stressIndex: 0.32,
  bloodPressure: { systolic: 118, diastolic: 76, uncertainty: 9 },
  bloodPressureStatus: "ok",
  quality: 0.82,
  limiting: null,
};

const GOOD_VOICE: VoiceContext = {
  medianF0Hz: 128.3,
  pitchRangeSemitones: 2.4,
  jitterPercent: 0.61,
  shimmerPercent: 2.9,
  harmonicsToNoiseDb: 21.5,
  speechRateHz: 4.4,
  pauseRatio: 0.22,
  quality: 0.74,
  limiting: null,
};

const base = (over: Partial<LiveContext> = {}): LiveContext => ({
  vitals: GOOD_VITALS,
  voice: GOOD_VOICE,
  sessionSeconds: 45,
  ...over,
});

describe("sensor context rendering", () => {
  it("states the measurements it has", () => {
    const text = describeContext(base());
    expect(text).toContain("72 beats per minute");
    expect(text).toContain("14 breaths per minute");
    expect(text).toContain("118 over 76");
    expect(text).toContain("128 Hz");
  });

  it("rounds rather than passing through sensor precision", () => {
    // "72.4 beats per minute" spoken aloud sounds like a machine, and implies
    // a precision the measurement does not have.
    const text = describeContext(base());
    expect(text).not.toContain("72.4");
    expect(text).not.toContain("14.2");
  });

  it("says outright when a vital sign could not be measured", () => {
    const text = describeContext(
      base({ vitals: { ...GOOD_VITALS, heartRateBpm: null, breathingRateBpm: null } }),
    );
    expect(text).toContain("heart rate could not be measured");
    expect(text).toContain("breathing rate could not be measured");
  });

  it("never invents a number for a null", () => {
    const empty: VitalsContext = {
      heartRateBpm: null,
      breathingRateBpm: null,
      hrvSdnnMs: null,
      stressIndex: null,
      bloodPressure: null,
      bloodPressureStatus: "needs-calibration",
      quality: 0.7,
      limiting: null,
    };
    const text = describeContext(base({ vitals: empty }));
    expect(text).not.toMatch(/\b0 beats per minute\b/);
    expect(text).not.toMatch(/\bNaN\b/);
    expect(text).not.toMatch(/\bnull\b/);
    expect(text).not.toMatch(/\bundefined\b/);
  });

  it("withholds blood pressure and says why when it is not calibrated", () => {
    const text = describeContext(
      base({
        vitals: {
          ...GOOD_VITALS,
          bloodPressure: null,
          bloodPressureStatus: "needs-calibration",
        },
      }),
    );
    expect(text).toContain("blood pressure unavailable");
    expect(text).toContain("needs-calibration");
  });

  it("tells the model to ignore vitals entirely when there is no signal", () => {
    const text = describeContext(base({ vitals: { ...GOOD_VITALS, quality: 0.05 } }));
    expect(text).toContain("nothing measurable yet");
    expect(text).toMatch(/Do not refer to any vital signs/i);
    // The unusable numbers must not also be present for the model to find.
    expect(text).not.toContain("72 beats per minute");
  });

  it("reports the quality score and what is limiting it", () => {
    const text = describeContext(
      base({ vitals: { ...GOOD_VITALS, quality: 0.41, limiting: "Face not steady" } }),
    );
    expect(text).toContain("0.41");
    expect(text).toContain("Face not steady");
  });

  it("handles a missing voice analysis without inventing acoustics", () => {
    const text = describeContext(base({ voice: null }));
    expect(text).toContain("not enough clean speech");
    expect(text).not.toContain("jitter");
  });

  it("attaches the do-not-interpret warning whenever acoustics are present", () => {
    // This is the guard against the model reaching for the depression and
    // Parkinson's literature, which is the single likeliest failure of this
    // agent. It has to be present every single time the numbers are.
    const text = describeContext(base());
    expect(text).toMatch(/descriptions of sound only/i);
    expect(text).toMatch(/Do not infer mood, mental health or neurological state/i);
  });

  it("omits the acoustics, and the warning, when there is no voice signal", () => {
    const text = describeContext(base({ voice: { ...GOOD_VOICE, quality: 0.02 } }));
    expect(text).not.toContain("jitter 0.61");
    expect(text).toContain("not enough clean speech");
  });

  it("includes the session length so the model knows how settled things are", () => {
    expect(describeContext(base({ sessionSeconds: 8 }))).toContain("8 seconds");
  });

  it("survives a context with nothing in it at all", () => {
    const text = describeContext({ vitals: null, voice: null, sessionSeconds: 0 });
    expect(text).toContain("nothing measurable yet");
    expect(text).toContain("not enough clean speech");
    expect(text).not.toMatch(/NaN|undefined|null/);
  });
});
