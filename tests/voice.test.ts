import { describe, expect, it } from "vitest";

import { analyseVoice, VoiceBuffer, describeVoice } from "@/lib/voice/engine";
import { syntheticVoice } from "./synthetic";

const FS = 16000;

describe("fundamental frequency", () => {
  // A male voice, a female voice and the boundary between them. Autocorrelation
  // pitch trackers characteristically fail by an octave, so these check the
  // absolute value rather than just that something was returned.
  it.each([
    [95, "low male"],
    [120, "male"],
    [180, "female"],
    [240, "high female"],
  ])("recovers %i Hz (%s)", (f0) => {
    const audio = syntheticVoice({ fs: FS, seconds: 3, f0Hz: f0, hnrDb: 25 });
    const result = analyseVoice(audio, FS);
    expect(result).not.toBeNull();
    expect(result!.medianF0Hz).toBeGreaterThan(f0 * 0.95);
    expect(result!.medianF0Hz).toBeLessThan(f0 * 1.05);
  });

  it("does not report an octave error under noise", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const audio = syntheticVoice({ fs: FS, seconds: 3, f0Hz: 130, hnrDb: 12, seed });
      const result = analyseVoice(audio, FS);
      if (!result || result.quality < 0.4) continue;
      // The failure we care about is 65 Hz or 260 Hz, not a few Hz of drift.
      expect(result.medianF0Hz).toBeGreaterThan(100);
      expect(result.medianF0Hz).toBeLessThan(170);
    }
  });
});

describe("jitter", () => {
  it("reports low jitter for a steady voice", () => {
    const audio = syntheticVoice({
      fs: FS,
      seconds: 4,
      f0Hz: 120,
      jitterPercent: 0,
      hnrDb: 30,
    });
    const result = analyseVoice(audio, FS)!;
    expect(result).not.toBeNull();
    // Not zero: quantising each period to a whole sample is itself a source of
    // jitter, and at 16 kHz that floor is a few tenths of a percent.
    expect(result.jitterPercent).toBeLessThan(1.0);
  });

  // Ordering alone is a weak check — an analyser reporting 0.1, 0.2, 0.3 would
  // pass it while being useless. These pin the measured value to the truth.
  it.each([1, 2, 3, 5, 8])("measures a true %i%% jitter accurately", (target) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const audio = syntheticVoice({
        fs: FS,
        seconds: 4,
        f0Hz: 120,
        jitterPercent: target,
        hnrDb: 30,
        seed,
      });
      const measured = analyseVoice(audio, FS)!.jitterPercent;
      expect(Math.abs(measured - target)).toBeLessThan(0.8);
    }
  });
});

describe("shimmer", () => {
  it("reports low shimmer for a steady voice", () => {
    const audio = syntheticVoice({
      fs: FS,
      seconds: 4,
      f0Hz: 120,
      shimmerPercent: 0,
      hnrDb: 30,
    });
    expect(analyseVoice(audio, FS)!.shimmerPercent).toBeLessThan(3.0);
  });

  it.each([3, 6, 12])("measures a true %i%% shimmer accurately", (target) => {
    for (const seed of [1, 2, 3]) {
      const audio = syntheticVoice({
        fs: FS,
        seconds: 4,
        f0Hz: 120,
        shimmerPercent: target,
        hnrDb: 30,
        seed,
      });
      const measured = analyseVoice(audio, FS)!.shimmerPercent;
      expect(Math.abs(measured - target)).toBeLessThan(1.0);
    }
  });
});

describe("harmonics-to-noise ratio", () => {
  it("orders a clean voice above a breathy one", () => {
    const clean = analyseVoice(
      syntheticVoice({ fs: FS, seconds: 3, f0Hz: 130, hnrDb: 30 }),
      FS,
    )!;
    const breathy = analyseVoice(
      syntheticVoice({ fs: FS, seconds: 3, f0Hz: 130, hnrDb: 5 }),
      FS,
    )!;
    expect(clean.harmonicsToNoiseDb).toBeGreaterThan(breathy.harmonicsToNoiseDb + 3);
  });

  // Reads consistently low by roughly 2 dB, which is the cost of estimating it
  // from a frame-averaged autocorrelation rather than Praat's per-cycle
  // decomposition. The bias is stable, so the tolerance covers it rather than
  // pretending it is not there.
  it.each([10, 20, 30])("lands within 3 dB of a true %i dB", (target) => {
    const audio = syntheticVoice({ fs: FS, seconds: 4, f0Hz: 120, hnrDb: target, seed: 9 });
    const measured = analyseVoice(audio, FS)!.harmonicsToNoiseDb;
    expect(Math.abs(measured - target)).toBeLessThan(3);
  });
});

describe("pitch variation", () => {
  it("separates monotone speech from animated speech", () => {
    const flat = analyseVoice(
      syntheticVoice({ fs: FS, seconds: 4, f0Hz: 140, pitchRangeSemitones: 0, hnrDb: 30 }),
      FS,
    )!;
    const animated = analyseVoice(
      syntheticVoice({ fs: FS, seconds: 4, f0Hz: 140, pitchRangeSemitones: 8, hnrDb: 30 }),
      FS,
    )!;
    expect(flat.pitchRangeSemitones).toBeLessThan(1);
    expect(animated.pitchRangeSemitones).toBeGreaterThan(1.5);
  });
});

describe("pauses", () => {
  it("measures the fraction of time spent silent", () => {
    // Four seconds of audio with 1.5 s of inserted silence.
    const audio = syntheticVoice({
      fs: FS,
      seconds: 4,
      f0Hz: 130,
      hnrDb: 30,
      pauses: [
        [1.0, 1.75],
        [2.5, 3.25],
      ],
    });
    const result = analyseVoice(audio, FS)!;
    expect(result.pauseRatio).toBeGreaterThan(0.25);
    expect(result.pauseRatio).toBeLessThan(0.55);
    expect(result.meanPauseMs).toBeGreaterThan(500);
    expect(result.meanPauseMs).toBeLessThan(1000);
  });

  it("reports almost no pausing for continuous speech", () => {
    const audio = syntheticVoice({ fs: FS, seconds: 4, f0Hz: 130, hnrDb: 30 });
    expect(analyseVoice(audio, FS)!.pauseRatio).toBeLessThan(0.15);
  });
});

describe("refusing to answer", () => {
  it("returns null for silence", () => {
    expect(analyseVoice(new Float64Array(FS * 3), FS)).toBeNull();
  });

  it("returns null for a window that is too short", () => {
    expect(analyseVoice(new Float64Array(100), FS)).toBeNull();
  });

  it("returns null or low quality for pure noise", () => {
    const noise = new Float64Array(FS * 3);
    let a = 12345;
    for (let i = 0; i < noise.length; i++) {
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = (a / 0x7fffffff - 0.5) * 0.2;
    }
    const result = analyseVoice(noise, FS);
    if (result !== null) {
      expect(result.quality).toBeLessThan(0.5);
    }
  });

  it("never claims high quality on a signal it cannot really measure", () => {
    // The property that matters: a confident number from an unusable recording
    // is worse than no number at all.
    for (const hnr of [-5, 0, 3]) {
      for (const seed of [1, 2, 3]) {
        const audio = syntheticVoice({
          fs: FS,
          seconds: 3,
          f0Hz: 125,
          hnrDb: hnr,
          seed,
        });
        const result = analyseVoice(audio, FS);
        if (result === null) continue;
        const wrong = Math.abs(result.medianF0Hz - 125) > 15;
        if (wrong) {
          expect(result.quality).toBeLessThan(0.6);
        }
      }
    }
  });
});

describe("quality", () => {
  it("is high for a clean, well-recorded voice", () => {
    const audio = syntheticVoice({ fs: FS, seconds: 5, f0Hz: 130, hnrDb: 28 });
    expect(analyseVoice(audio, FS)!.quality).toBeGreaterThan(0.6);
  });

  it("names what is limiting it", () => {
    const audio = syntheticVoice({ fs: FS, seconds: 5, f0Hz: 130, hnrDb: 28 });
    expect(analyseVoice(audio, FS)!.limitingFactor).toBeTruthy();
  });
});

describe("VoiceBuffer", () => {
  it("holds a rolling window and analyses it", () => {
    const buffer = new VoiceBuffer(4, FS);
    expect(buffer.analyse()).toBeNull();

    const audio = syntheticVoice({ fs: FS, seconds: 3, f0Hz: 150, hnrDb: 28 });
    const block = 1024;
    for (let i = 0; i < audio.length; i += block) {
      buffer.push(audio.slice(i, Math.min(i + block, audio.length)));
    }

    expect(buffer.seconds).toBeCloseTo(3, 0);
    const result = buffer.analyse();
    expect(result).not.toBeNull();
    expect(result!.medianF0Hz).toBeGreaterThan(140);
    expect(result!.medianF0Hz).toBeLessThan(160);
  });

  it("discards the oldest audio once full", () => {
    const buffer = new VoiceBuffer(2, FS);
    const audio = syntheticVoice({ fs: FS, seconds: 6, f0Hz: 150, hnrDb: 28 });
    for (let i = 0; i < audio.length; i += 1024) {
      buffer.push(audio.slice(i, Math.min(i + 1024, audio.length)));
    }
    expect(buffer.seconds).toBeCloseTo(2, 1);
    expect(buffer.snapshot().length).toBe(FS * 2);
  });

  it("clears back to empty", () => {
    const buffer = new VoiceBuffer(2, FS);
    buffer.push(syntheticVoice({ fs: FS, seconds: 1, f0Hz: 150 }));
    buffer.clear();
    expect(buffer.seconds).toBe(0);
    expect(buffer.analyse()).toBeNull();
  });
});

describe("plain-language description", () => {
  it("describes a clean voice without hedging into nonsense", () => {
    const audio = syntheticVoice({ fs: FS, seconds: 5, f0Hz: 130, hnrDb: 28 });
    const notes = describeVoice(analyseVoice(audio, FS)!);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.join(" ")).not.toMatch(/NaN|undefined/);
  });

  it("says so rather than describing an unusable recording", () => {
    const unusable = {
      ...analyseVoice(syntheticVoice({ fs: FS, seconds: 3, f0Hz: 130 }), FS)!,
      quality: 0.2,
    };
    expect(describeVoice(unusable)[0]).toMatch(/too low/i);
  });
});
