import { describe, expect, it } from "vitest";

import {
  AffectTracker,
  fuseAffect,
  readFace,
  readVoice,
  type AffectFrame,
} from "../src/lib/affect/multimodal";
import type { VoiceAnalysis } from "../src/lib/voice/engine";

function shapes(values: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(values));
}

/** A run of frames holding one expression, optionally jittering it. */
function faceFrames(
  values: Record<string, number>,
  options: { count?: number; wobble?: number } = {},
): AffectFrame[] {
  const count = options.count ?? 60;
  return Array.from({ length: count }, (_, i) => {
    const moved: Record<string, number> = { ...values };
    if (options.wobble) {
      for (const key of Object.keys(moved)) {
        moved[key] = Math.max(0, moved[key] + (i % 2 === 0 ? options.wobble : -options.wobble));
      }
    }
    return { timestampMs: i * 33, blendshapes: shapes(moved) };
  });
}

function voice(overrides: Partial<VoiceAnalysis> = {}): VoiceAnalysis {
  return {
    medianF0Hz: 140,
    pitchRangeSemitones: 2.5,
    jitterPercent: 0.5,
    shimmerPercent: 2,
    harmonicsToNoiseDb: 22,
    speechRateHz: 4,
    pauseRatio: 0.2,
    meanPauseMs: 400,
    voicedFraction: 0.5,
    loudnessDb: -22,
    noiseFloorDb: -58,
    quality: 0.8,
    limitingFactor: "None",
    windowSeconds: 12,
    ...overrides,
  };
}

describe("face channel", () => {
  it("stands down until the face has been visible for a while", () => {
    const channel = readFace(faceFrames({ mouthSmileLeft: 0.5 }, { count: 5 }));
    expect(channel.arousal).toBeNull();
    expect(channel.withheld).toMatch(/not visible/i);
  });

  it("stands down when there is no face in the frames at all", () => {
    const blank = Array.from({ length: 60 }, (_, i) => ({
      timestampMs: i * 33,
      blendshapes: null,
    }));
    expect(readFace(blank).arousal).toBeNull();
  });

  it("reads a smile as positive and says it saw one", () => {
    const channel = readFace(
      faceFrames({ mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.4, cheekSquintRight: 0.4 }),
    );
    expect(channel.valence!).toBeGreaterThan(0.3);
    expect(channel.detail).toMatch(/smiling/);
  });

  it("weights a smile that reaches the eyes above one that does not", () => {
    const polite = readFace(faceFrames({ mouthSmileLeft: 0.6, mouthSmileRight: 0.6 }));
    const felt = readFace(
      faceFrames({ mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.6, cheekSquintRight: 0.6 }),
    );
    expect(felt.valence!).toBeGreaterThan(polite.valence!);
  });

  it("reads drawn brows and pressed lips as negative and aroused", () => {
    const channel = readFace(
      faceFrames({ browDownLeft: 0.6, browDownRight: 0.6, mouthPressLeft: 0.5, mouthPressRight: 0.5 }),
    );
    expect(channel.valence!).toBeLessThan(0);
    expect(channel.arousal!).toBeGreaterThan(0.2);
    expect(channel.detail).toMatch(/brows drawn down/);
  });

  it("calls a moving face more animated than a still one holding the same shape", () => {
    const still = readFace(faceFrames({ jawOpen: 0.3, browInnerUp: 0.2 }));
    const mobile = readFace(faceFrames({ jawOpen: 0.3, browInnerUp: 0.2 }, { wobble: 0.12 }));
    expect(mobile.arousal!).toBeGreaterThan(still.arousal!);
    expect(mobile.detail).toMatch(/mobile/);
    expect(still.detail).toMatch(/still/);
  });
});

describe("voice channel", () => {
  it("stands down with no speech", () => {
    expect(readVoice(null).withheld).toMatch(/no speech/i);
  });

  it("stands down when the recording is too poor to describe", () => {
    const channel = readVoice(voice({ quality: 0.2, limitingFactor: "Background noise" }));
    expect(channel.arousal).toBeNull();
    expect(channel.withheld).toMatch(/background noise/i);
  });

  it("calls fast wide-ranging speech animated", () => {
    const channel = readVoice(voice({ speechRateHz: 5.5, pitchRangeSemitones: 4.5 }));
    expect(channel.arousal!).toBeGreaterThan(0.6);
  });

  it("calls flat, slow, heavily paused speech unanimated and low", () => {
    const channel = readVoice(
      voice({ speechRateHz: 2.2, pitchRangeSemitones: 1, pauseRatio: 0.6 }),
    );
    expect(channel.arousal!).toBeLessThan(0.3);
    expect(channel.valence!).toBeLessThan(0);
  });

  it("describes what it measured rather than what it concluded", () => {
    expect(readVoice(voice()).detail).toMatch(/semitones of pitch/);
  });
});

describe("fusing the two", () => {
  const bright = readFace(
    faceFrames({ mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.5, cheekSquintRight: 0.5, jawOpen: 0.3 }, { wobble: 0.1 }),
  );
  const tense = readFace(
    faceFrames({ browDownLeft: 0.7, browDownRight: 0.7, mouthPressLeft: 0.6, mouthPressRight: 0.6 }),
  );

  it("says nothing when neither channel is reporting", () => {
    const affect = fuseAffect(readFace([]), readVoice(null));
    expect(affect.arousal).toBeNull();
    expect(affect.confidence).toBe(0);
    expect(affect.label).toBe("Not measured");
  });

  it("earns much more confidence from two agreeing channels than from one", () => {
    const alone = fuseAffect(bright, readVoice(null));
    const together = fuseAffect(bright, readVoice(voice({ speechRateHz: 5, pitchRangeSemitones: 4 })));
    expect(together.confidence).toBeGreaterThan(alone.confidence * 2);
    expect(alone.note).toMatch(/half the evidence/i);
  });

  it("refuses a confident answer when the channels disagree", () => {
    const affect = fuseAffect(
      tense,
      readVoice(voice({ speechRateHz: 5.5, pitchRangeSemitones: 4.5 })),
    );
    expect(affect.label).toBe("Mixed signals");
    expect(affect.note).toMatch(/different things/i);
    expect(affect.confidence).toBeLessThan(0.5);
  });

  it("reports agreement as a number, not just a word", () => {
    const affect = fuseAffect(bright, readVoice(voice({ speechRateHz: 5, pitchRangeSemitones: 4 })));
    expect(affect.agreement!).toBeGreaterThan(0.6);
  });

  it("has no agreement figure to give with one channel", () => {
    expect(fuseAffect(bright, readVoice(null)).agreement).toBeNull();
  });

  it("always says this is not a reading of how someone feels", () => {
    for (const affect of [
      fuseAffect(bright, readVoice(voice())),
      fuseAffect(tense, readVoice(voice({ speechRateHz: 2, pitchRangeSemitones: 1 }))),
      fuseAffect(bright, readVoice(null)),
    ]) {
      expect(affect.note).toMatch(/not how the person feels|does not reliably indicate emotion/i);
    }
  });
});

describe("the tracker over time", () => {
  it("drops frames older than its window", () => {
    const tracker = new AffectTracker();
    for (const frame of faceFrames({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 })) {
      tracker.push(frame);
    }
    // Twenty-five seconds later, wearing a completely different expression.
    for (let i = 0; i < 60; i++) {
      tracker.push({
        timestampMs: 25_000 + i * 33,
        blendshapes: shapes({ browDownLeft: 0.7, browDownRight: 0.7 }),
      });
    }
    expect(tracker.analyse(null).valence!).toBeLessThan(0);
  });

  it("forgets everything on reset", () => {
    const tracker = new AffectTracker();
    for (const frame of faceFrames({ mouthSmileLeft: 0.8 })) tracker.push(frame);
    tracker.reset();
    expect(tracker.analyse(null).arousal).toBeNull();
  });
});
