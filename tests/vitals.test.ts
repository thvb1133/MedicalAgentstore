import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { dominantPeak, magnitudeSpectrum } from "@/lib/signal/fft";
import {
  bandpass,
  detrend,
  median,
  resampleUniform,
  stdDev,
} from "@/lib/signal/filters";
import { extractPulse } from "@/lib/signal/rppg";
import { computeHrv, findBeats, stressFromSdnn } from "@/lib/signal/peaks";
import { VitalsBuffer, analyseVitals, selectPulse } from "@/lib/vitals/engine";
import {
  estimateBloodPressure,
  extractPulseFeatures,
  fitCalibration,
  type CuffReading,
  type PulseFeatures,
} from "@/lib/vitals/bloodPressure";
import { syntheticRgb } from "./synthetic";

/**
 * Heart rate recovered from a trace, in BPM, through the same method
 * selection the engine uses rather than through one hard-coded extraction.
 */
function measureBpm(bpm: number, overrides = {}): number | null {
  const fs = 30;
  const trace = syntheticRgb({ bpm, fs, seconds: 30, ...overrides });
  const chosen = selectPulse({ r: trace.r, g: trace.g, b: trace.b }, fs);
  return chosen.peak ? chosen.peak.freq * 60 : null;
}

describe("spectral estimation", () => {
  it("finds a pure tone at the frequency it was generated at", () => {
    const fs = 30;
    const n = 900;
    const signal = new Float64Array(n);
    for (let i = 0; i < n; i++) signal[i] = Math.sin((2 * Math.PI * 1.2 * i) / fs);
    const peak = dominantPeak(magnitudeSpectrum(signal, fs), 0.5, 3);
    assert.ok(peak, "expected a peak");
    assert.ok(Math.abs(peak.freq - 1.2) < 0.02, `got ${peak.freq}`);
    assert.ok(peak.prominence > 0.8, `pure tone should be highly prominent, got ${peak.prominence}`);
  });

  it("reports low prominence for broadband noise", () => {
    const fs = 30;
    const n = 900;
    const signal = new Float64Array(n);
    let seed = 3;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      signal[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    const peak = dominantPeak(magnitudeSpectrum(signal, fs), 0.66, 3);
    assert.ok(peak);
    assert.ok(peak.prominence < 0.35, `noise should spread power, got ${peak.prominence}`);
  });
});

describe("filters", () => {
  it("detrend removes a linear ramp", () => {
    const x = Array.from({ length: 200 }, (_, i) => 50 + i * 0.7);
    const out = detrend(x);
    assert.ok(Math.abs(stdDev(out)) < 1e-9, "a pure ramp should detrend to zero");
  });

  it("bandpass is zero-phase, so peak positions do not shift", () => {
    const fs = 30;
    const n = 600;
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = Math.sin((2 * Math.PI * 1.2 * i) / fs);
    const filtered = bandpass(raw, fs, 0.7, 3);

    const peaksOf = (sig: ArrayLike<number>) => {
      const out: number[] = [];
      for (let i = 1; i < sig.length - 1; i++) {
        if (sig[i] > sig[i - 1] && sig[i] >= sig[i + 1] && sig[i] > 0.5) out.push(i);
      }
      return out;
    };

    const a = peaksOf(raw);
    const b = peaksOf(filtered);
    assert.ok(a.length > 5 && b.length > 5);
    // Compare interior peaks, away from the edge transient.
    const shift = median(a.slice(2, -2).map((idx, k) => idx - (b.slice(2, -2)[k] ?? idx)));
    assert.ok(Math.abs(shift) <= 1, `peaks shifted by ${shift} samples`);
  });

  it("resampling irregular timestamps preserves frequency", () => {
    const fs = 30;
    const timestamps: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < 600; i++) {
      // Deliberately uneven spacing, as a throttled browser produces.
      const t = (i / fs) * 1000 + Math.sin(i) * 8;
      timestamps.push(t);
      values.push(Math.sin((2 * Math.PI * 1.2 * t) / 1000));
    }
    const { values: uniform } = resampleUniform(timestamps, values, fs);
    const peak = dominantPeak(magnitudeSpectrum(uniform, fs), 0.5, 3);
    assert.ok(peak);
    assert.ok(Math.abs(peak.freq - 1.2) < 0.05, `got ${peak.freq}`);
  });
});

describe("rPPG pulse extraction", () => {
  for (const bpm of [48, 62, 75, 96, 130]) {
    it(`recovers ${bpm} BPM from a synthetic trace`, () => {
      const measured = measureBpm(bpm);
      assert.ok(measured !== null, "no pulse found");
      assert.ok(
        Math.abs(measured - bpm) < 2.5,
        `expected ${bpm}, got ${measured.toFixed(1)}`,
      );
    });
  }

  it("survives moderate sensor noise", () => {
    const measured = measureBpm(72, { noise: 0.25 });
    assert.ok(measured !== null);
    assert.ok(Math.abs(measured - 72) < 4, `got ${measured.toFixed(1)}`);
  });

  it("does not double the rate when the second harmonic is tall", () => {
    // 45 BPM puts the harmonic at 90 BPM, squarely inside the search band and
    // entirely plausible as a reading, which is what makes it dangerous.
    const measured = measureBpm(45);
    assert.ok(measured !== null);
    assert.ok(Math.abs(measured - 45) < 3, `harmonic was reported: ${measured?.toFixed(1)}`);
  });

  it("survives a large illumination drift", () => {
    const measured = measureBpm(72, { drift: 25 });
    assert.ok(measured !== null);
    assert.ok(Math.abs(measured - 72) < 3, `got ${measured.toFixed(1)}`);
  });

  it("still recovers the rate on darker skin, where the signal is weaker", () => {
    const measured = measureBpm(68, { baseRgb: [78, 55, 46] as [number, number, number] });
    assert.ok(measured !== null, "no pulse found on darker skin trace");
    assert.ok(Math.abs(measured - 68) < 4, `got ${measured.toFixed(1)}`);
  });
});

describe("beat detection and HRV", () => {
  it("finds about the right number of beats", () => {
    const fs = 30;
    const bpm = 72;
    const seconds = 30;
    const trace = syntheticRgb({ bpm, fs, seconds });
    const pulse = extractPulse({ r: trace.r, g: trace.g, b: trace.b }, fs);
    const beats = findBeats(pulse, fs, bpm);
    const expected = (bpm / 60) * seconds;
    assert.ok(
      Math.abs(beats.length - expected) <= 3,
      `expected about ${expected} beats, got ${beats.length}`,
    );
  });

  it("rejects implausible intervals rather than folding them into SDNN", () => {
    const beats = [0, 0.83, 1.66, 2.49, 2.55, 3.32, 4.15].map((timeS, index) => ({
      index,
      timeS,
    }));
    const hrv = computeHrv(beats);
    assert.ok(hrv.rejectedCount >= 1, "the 60 ms interval should have been rejected");
    assert.ok(hrv.sdnn !== null);
    assert.ok(hrv.sdnn < 30, `SDNN should stay small, got ${hrv.sdnn}`);
  });

  it("maps SDNN onto a stress score that falls as variability rises", () => {
    const stressed = stressFromSdnn(18);
    const relaxed = stressFromSdnn(95);
    assert.ok(stressed !== null && relaxed !== null);
    assert.ok(stressed > relaxed, `${stressed} should exceed ${relaxed}`);
    assert.ok(stressed <= 100 && relaxed >= 0);
  });
});

describe("vitals engine", () => {
  function fill(bpm: number, seconds: number, motion = 0.0005) {
    const fs = 30;
    const buffer = new VitalsBuffer(30);
    const trace = syntheticRgb({ bpm, fs, seconds });
    for (let i = 0; i < trace.timestamps.length; i++) {
      buffer.push({
        timestampMs: trace.timestamps[i],
        r: trace.r[i],
        g: trace.g[i],
        b: trace.b[i],
        faceY: 0.5 + 0.004 * Math.sin((2 * Math.PI * 0.25 * i) / fs),
        motion,
        faceFound: true,
      });
    }
    return buffer;
  }

  it("reports a heart rate with good quality on a clean 30 second window", () => {
    const result = analyseVitals(fill(74, 30));
    assert.ok(result.heartRateBpm !== null, "expected a heart rate");
    assert.ok(Math.abs(result.heartRateBpm - 74) < 3, `got ${result.heartRateBpm}`);
    assert.ok(result.quality.score > 0.5, `quality was ${result.quality.score}`);
  });

  it("recovers the breathing rate from head movement", () => {
    const result = analyseVitals(fill(74, 30));
    assert.ok(result.breathingRateBpm !== null, "expected a breathing rate");
    // The synthetic head bob is at 0.25 Hz, which is 15 breaths per minute.
    assert.ok(
      Math.abs(result.breathingRateBpm - 15) < 2.5,
      `got ${result.breathingRateBpm}`,
    );
  });

  it("withholds every value when the subject is moving too much", () => {
    const result = analyseVitals(fill(74, 30, 0.05));
    assert.equal(result.heartRateBpm, null);
    assert.ok(result.quality.score < 0.35);
    assert.match(result.quality.limiting ?? "", /movement/i);
  });

  it("withholds values before there is enough data", () => {
    const result = analyseVitals(fill(74, 3));
    assert.equal(result.heartRateBpm, null);
  });

  it("is never confidently wrong as the signal degrades", () => {
    // The property that matters more than accuracy: across a sweep from a
    // clean trace to one where the pulse is buried, the engine must either
    // report the right rate or report nothing. A plausible-looking wrong
    // number presented with confidence is the failure mode that would make
    // this tool harmful rather than merely unhelpful.
    const fs = 30;
    let reported = 0;
    for (const noise of [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const bpm = 71;
        const buffer = new VitalsBuffer(30);
        const trace = syntheticRgb({ bpm, fs, seconds: 30, noise, seed });
        for (let i = 0; i < trace.timestamps.length; i++) {
          buffer.push({
            timestampMs: trace.timestamps[i],
            r: trace.r[i],
            g: trace.g[i],
            b: trace.b[i],
            faceY: 0.5,
            motion: 0.0005,
            faceFound: true,
          });
        }
        const result = analyseVitals(buffer);
        if (result.heartRateBpm === null) continue;
        reported++;
        assert.ok(
          Math.abs(result.heartRateBpm - bpm) < 6,
          `noise ${noise}, seed ${seed}: reported ${result.heartRateBpm.toFixed(1)} ` +
            `at quality ${result.quality.score.toFixed(2)} when the truth was ${bpm}`,
        );
      }
    }
    // Guard against the trivial way to pass this test, which is to gate so
    // hard that nothing is ever reported.
    assert.ok(reported >= 12, `only ${reported} measurements were reported at all`);
  });

  it("names the binding constraint rather than saying only 'poor signal'", () => {
    const buffer = new VitalsBuffer(30);
    const trace = syntheticRgb({ bpm: 70, fs: 30, seconds: 30 });
    for (let i = 0; i < trace.timestamps.length; i++) {
      buffer.push({
        timestampMs: trace.timestamps[i],
        r: trace.r[i],
        g: trace.g[i],
        b: trace.b[i],
        faceY: 0.5,
        motion: 0.0005,
        // Face lost for most of the window.
        faceFound: i % 5 === 0,
      });
    }
    const result = analyseVitals(buffer);
    assert.match(result.quality.limiting ?? "", /face/i);
  });
});

describe("blood pressure gating", () => {
  const features: PulseFeatures = {
    heartRateBpm: 72,
    upstrokeRatio: 0.18,
    halfWidthRatio: 0.31,
    augmentationIndex: 0.42,
    morphologyStability: 0.85,
  };

  it("refuses to produce a number without calibration", () => {
    const estimate = estimateBloodPressure(features, { readings: [], model: null }, 0.9);
    assert.equal(estimate.status, "needs-calibration");
    assert.equal(estimate.systolic, null);
    assert.equal(estimate.diastolic, null);
  });

  it("reproduces a single cuff anchor at the calibration point", () => {
    const readings: CuffReading[] = [
      { systolic: 128, diastolic: 82, takenAtMs: Date.now(), features },
    ];
    const model = fitCalibration(readings);
    assert.ok(model);
    const estimate = estimateBloodPressure(features, { readings, model }, 0.9);
    assert.equal(estimate.status, "ok");
    assert.equal(estimate.systolic, 128);
    assert.equal(estimate.diastolic, 82);
  });

  it("moves in the right direction when the pulse changes", () => {
    const readings: CuffReading[] = [
      { systolic: 120, diastolic: 78, takenAtMs: Date.now(), features },
    ];
    const model = fitCalibration(readings);
    const faster: PulseFeatures = { ...features, heartRateBpm: 95 };
    const estimate = estimateBloodPressure(faster, { readings, model }, 0.9);
    assert.ok(estimate.systolic !== null);
    assert.ok(estimate.systolic > 120, `expected a rise, got ${estimate.systolic}`);
  });

  it("hides the number when the waveform is not clean enough", () => {
    const readings: CuffReading[] = [
      { systolic: 120, diastolic: 78, takenAtMs: Date.now(), features },
    ];
    const model = fitCalibration(readings);
    const estimate = estimateBloodPressure(features, { readings, model }, 0.3);
    assert.equal(estimate.status, "signal-too-weak");
    assert.equal(estimate.systolic, null);
  });

  it("marks an old calibration stale and widens the uncertainty", () => {
    const old = Date.now() - 45 * 86_400_000;
    const readings: CuffReading[] = [
      { systolic: 120, diastolic: 78, takenAtMs: old, features },
    ];
    const model = fitCalibration(readings);
    const estimate = estimateBloodPressure(features, { readings, model }, 0.9);
    assert.equal(estimate.status, "calibration-stale");
    assert.ok(estimate.uncertainty !== null && estimate.uncertainty > 12);
  });

  it("never emits a physiologically absurd value", () => {
    const readings: CuffReading[] = [
      { systolic: 120, diastolic: 78, takenAtMs: Date.now(), features },
    ];
    const model = fitCalibration(readings);
    const extreme: PulseFeatures = {
      ...features,
      heartRateBpm: 300,
      upstrokeRatio: 0.98,
      augmentationIndex: 1,
    };
    const estimate = estimateBloodPressure(extreme, { readings, model }, 0.9);
    assert.ok(estimate.systolic !== null && estimate.systolic <= 200);
    assert.ok(estimate.diastolic !== null && estimate.diastolic >= 45);
  });

  it("extracts stable morphology features from a clean synthetic pulse", () => {
    const fs = 30;
    const trace = syntheticRgb({ bpm: 72, fs, seconds: 20, noise: 0.2 });
    const pulse = extractPulse({ r: trace.r, g: trace.g, b: trace.b }, fs);
    const beats = findBeats(pulse, fs, 72);
    const extracted = extractPulseFeatures(pulse, fs, beats.map((b) => b.timeS), 72);
    assert.ok(extracted, "expected features from a clean trace");
    assert.ok(extracted.morphologyStability > 0.5);
    assert.ok(extracted.upstrokeRatio > 0 && extracted.upstrokeRatio < 1);
  });
});
