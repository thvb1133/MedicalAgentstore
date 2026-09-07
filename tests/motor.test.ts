import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { MotorTracker } from "@/lib/motor/engine";
import { assessArms, assessFace, assessSpeech } from "@/lib/fast/engine";
import { syntheticTapping, syntheticTremor } from "./synthetic";

function tremorTracker(frequencyHz: number, amplitude: number, fs: number, seconds: number) {
  const tracker = new MotorTracker(30);
  const { timestamps, x, y } = syntheticTremor(frequencyHz, amplitude, fs, seconds);
  for (let i = 0; i < timestamps.length; i++) {
    tracker.push({
      timestampMs: timestamps[i],
      tipX: 0.5 + x[i],
      tipY: 0.5 + y[i],
      pinchDistance: 0.4,
      wristX: 0.5,
      wristY: 0.62,
    });
  }
  return tracker;
}

describe("tremor analysis", () => {
  for (const hz of [4.5, 6, 8]) {
    it(`recovers a ${hz} Hz tremor at 60 fps`, () => {
      const result = tremorTracker(hz, 0.01, 60, 12).analyse();
      assert.ok(result.tremor.frequencyHz !== null, "no tremor found");
      assert.ok(
        Math.abs(result.tremor.frequencyHz - hz) < 0.4,
        `expected ${hz} Hz, got ${result.tremor.frequencyHz.toFixed(2)}`,
      );
    });
  }

  it("classifies a 5 Hz oscillation into the rest-tremor band", () => {
    const result = tremorTracker(5, 0.01, 60, 12).analyse();
    assert.equal(result.tremor.band, "rest-4-6");
  });

  it("reports no tremor for a steady hand", () => {
    const tracker = new MotorTracker(30);
    for (let i = 0; i < 720; i++) {
      tracker.push({
        timestampMs: (i / 60) * 1000,
        // Slow voluntary drift only, no oscillation.
        tipX: 0.5 + 0.02 * Math.sin((2 * Math.PI * 0.2 * i) / 60),
        tipY: 0.5,
        pinchDistance: 0.4,
        wristX: 0.5,
        wristY: 0.62,
      });
    }
    const result = tracker.analyse();
    assert.equal(result.tremor.frequencyHz, null, "steady hand should not report a tremor");
  });

  it("does not mistake whole-arm movement for hand tremor", () => {
    const tracker = new MotorTracker(30);
    for (let i = 0; i < 720; i++) {
      // Fingertip and wrist move together at 5 Hz: the arm is shaking, the
      // hand is not, and the relative measurement must cancel it.
      const shake = 0.01 * Math.sin((2 * Math.PI * 5 * i) / 60);
      tracker.push({
        timestampMs: (i / 60) * 1000,
        tipX: 0.5 + shake,
        tipY: 0.5 + shake,
        pinchDistance: 0.4,
        wristX: 0.5 + shake,
        wristY: 0.62 + shake,
      });
    }
    assert.equal(tracker.analyse().tremor.frequencyHz, null);
  });

  it("refuses to report frequencies the frame rate cannot resolve", () => {
    const result = tremorTracker(9, 0.01, 15, 12).analyse();
    assert.ok(result.tremor.frameRateLimited, "should flag the frame rate");
    if (result.tremor.frequencyHz !== null) {
      assert.ok(
        result.tremor.frequencyHz <= 15 / 3 + 0.5,
        `reported ${result.tremor.frequencyHz} Hz at 15 fps`,
      );
    }
  });
});

describe("finger tapping", () => {
  function tapTracker(rate: number, seconds: number, decrement = 0, fs = 60) {
    const tracker = new MotorTracker(30);
    const { timestamps, pinch } = syntheticTapping(rate, fs, seconds, decrement);
    for (let i = 0; i < timestamps.length; i++) {
      tracker.push({
        timestampMs: timestamps[i],
        tipX: 0.5,
        tipY: 0.5,
        pinchDistance: pinch[i],
        wristX: 0.5,
        wristY: 0.62,
      });
    }
    return tracker;
  }

  it("counts taps at roughly the right rate", () => {
    const result = tapTracker(3, 10).analyse();
    assert.ok(result.tapping.frequencyHz !== null);
    assert.ok(
      Math.abs(result.tapping.frequencyHz - 3) < 0.4,
      `expected 3 Hz, got ${result.tapping.frequencyHz.toFixed(2)}`,
    );
    assert.ok(result.tapping.tapCount >= 25, `only ${result.tapping.tapCount} taps`);
  });

  it("detects a decaying tap amplitude", () => {
    const result = tapTracker(3, 12, -0.6).analyse();
    assert.ok(result.tapping.amplitudeDecrement !== null);
    assert.ok(
      result.tapping.amplitudeDecrement < -0.15,
      `expected a clear decrement, got ${result.tapping.amplitudeDecrement}`,
    );
  });

  it("reports no decrement for a steady sequence", () => {
    const result = tapTracker(3, 12, 0).analyse();
    assert.ok(result.tapping.amplitudeDecrement !== null);
    assert.ok(
      Math.abs(result.tapping.amplitudeDecrement) < 0.15,
      `expected no decrement, got ${result.tapping.amplitudeDecrement}`,
    );
  });

  it("reports nothing when the fingers are not moving", () => {
    const tracker = new MotorTracker(30);
    for (let i = 0; i < 600; i++) {
      tracker.push({
        timestampMs: (i / 60) * 1000,
        tipX: 0.5,
        tipY: 0.5,
        pinchDistance: 0.4,
        wristX: 0.5,
        wristY: 0.62,
      });
    }
    assert.equal(tracker.analyse().tapping.frequencyHz, null);
  });
});

describe("FAST screening", () => {
  const symmetric = Array.from({ length: 60 }, () => ({
    mouthAsymmetry: 0.005,
    eyeAsymmetry: 0.01,
    yaw: 0.02,
  }));

  it("does not flag a symmetric face", () => {
    const result = assessFace(symmetric);
    assert.ok(result.poseValid);
    assert.equal(result.flagged, false);
  });

  it("flags a drooping mouth corner", () => {
    const drooping = symmetric.map((s) => ({ ...s, mouthAsymmetry: 0.06 }));
    assert.equal(assessFace(drooping).flagged, true);
  });

  it("refuses to judge symmetry when the head is turned", () => {
    const turned = symmetric.map((s) => ({ ...s, mouthAsymmetry: 0.09, yaw: 0.5 }));
    const result = assessFace(turned);
    assert.equal(result.poseValid, false);
    assert.equal(result.flagged, false, "a turned head must not produce a flag");
  });

  it("flags one arm drifting down while the other holds", () => {
    const samples = Array.from({ length: 120 }, (_, i) => ({
      timestampMs: i * 83,
      leftWristY: 0.4 + (i / 120) * 0.12,
      rightWristY: 0.4,
      shoulderY: 0.35,
      leftVisible: true,
      rightVisible: true,
    }));
    const result = assessArms(samples);
    assert.equal(result.flagged, true);
    assert.ok(result.driftAsymmetry > 0.05);
  });

  it("does not flag both arms tiring together", () => {
    const samples = Array.from({ length: 120 }, (_, i) => ({
      timestampMs: i * 83,
      leftWristY: 0.4 + (i / 120) * 0.1,
      rightWristY: 0.4 + (i / 120) * 0.1,
      shoulderY: 0.35,
      leftVisible: true,
      rightVisible: true,
    }));
    assert.equal(assessArms(samples).flagged, false);
  });

  it("scores speech against the prompt and flags poor matches", () => {
    const target = "The early bird catches the worm";
    assert.equal(assessSpeech(target, target, true).accuracy, 1);
    assert.equal(assessSpeech(target, target, true).flagged, false);

    const slurred = assessSpeech(target, "the burly bard", true);
    assert.ok(slurred.accuracy !== null && slurred.accuracy < 0.7);
    assert.equal(slurred.flagged, true);
  });

  it("does not flag speech when recognition is unavailable", () => {
    const result = assessSpeech("The early bird catches the worm", "", false);
    assert.equal(result.accuracy, null);
    assert.equal(result.flagged, false);
  });
});
