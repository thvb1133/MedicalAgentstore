"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_ENGINE_OPTIONS,
  VitalsBuffer,
  analyseVitals,
  type EngineOptions,
  type VitalsResult,
} from "@/lib/vitals/engine";
import {
  estimateBloodPressure,
  extractPulseFeatures,
  loadCalibration,
  saveCalibration,
  type BpCalibration,
  type BpEstimate,
  type CuffReading,
  type PulseFeatures,
} from "@/lib/vitals/bloodPressure";
import { unknownLighting } from "@/lib/vitals/lighting";
import { assessRhythm } from "@/lib/vitals/rhythm";
import { assessTone } from "@/lib/vitals/skinTone";
import type { FaceFrame } from "./useFaceTracking";

export interface VitalsSnapshot extends VitalsResult {
  bp: BpEstimate;
  features: PulseFeatures | null;
  /** Seconds of data held in the analysis window. */
  elapsedSeconds: number;
}

const EMPTY: VitalsSnapshot = {
  heartRateBpm: null,
  method: null,
  breathingRateBpm: null,
  hrv: {
    sdnn: null,
    rmssd: null,
    meanIbi: null,
    beatRateBpm: null,
    acceptedIntervals: [],
    rejectedCount: 0,
  },
  stressIndex: null,
  quality: { score: 0, grade: "no-signal", limiting: null, effectiveFps: 0, fill: 0 },
  lighting: unknownLighting(),
  rhythm: assessRhythm([]),
  tone: assessTone(0, 0, 0),
  fusion: null,
  waveform: new Float64Array(0),
  waveformFs: 30,
  beatTimesS: [],
  bp: {
    status: "needs-calibration",
    systolic: null,
    diastolic: null,
    uncertainty: null,
    calibrationAgeDays: null,
    calibrationPoints: 0,
    message: "Waiting for a measurement.",
  },
  features: null,
  elapsedSeconds: 0,
};

/**
 * Accumulates camera frames into the vitals engine and republishes results at
 * a fixed cadence.
 *
 * Analysis is throttled to about twice a second rather than run per frame:
 * the numbers cannot meaningfully change faster than that, and re-rendering
 * the whole panel at 30 Hz competes with the detector for main-thread time.
 */
export function useVitals(options: Partial<EngineOptions> = {}) {
  const opts = useMemo<EngineOptions>(
    () => ({ ...DEFAULT_ENGINE_OPTIONS, ...options }),
    [options],
  );

  const bufferRef = useRef(new VitalsBuffer(opts.windowSeconds));
  const lastAnalysisRef = useRef(0);
  const [snapshot, setSnapshot] = useState<VitalsSnapshot>(EMPTY);
  const [calibration, setCalibration] = useState<BpCalibration>({
    readings: [],
    model: null,
  });

  useEffect(() => {
    setCalibration(loadCalibration());
  }, []);

  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;

  useEffect(() => {
    bufferRef.current = new VitalsBuffer(opts.windowSeconds);
  }, [opts.windowSeconds]);

  const pushFrame = useCallback(
    (frame: FaceFrame) => {
      const buffer = bufferRef.current;
      buffer.push({
        timestampMs: frame.timestampMs,
        r: frame.skin?.r ?? 0,
        g: frame.skin?.g ?? 0,
        b: frame.skin?.b ?? 0,
        regions: frame.skinRegions ?? undefined,
        // The nose tip's vertical position carries the breathing-driven
        // head bob; landmark 1 is stable enough to use directly.
        faceY: frame.landmarks?.[1]?.y ?? 0,
        motion: frame.motion,
        faceFound: frame.landmarks !== null && (frame.skin?.coverage ?? 0) > 0.2,
      });

      const now = frame.timestampMs;
      if (now - lastAnalysisRef.current < 500) return;
      lastAnalysisRef.current = now;

      const result = analyseVitals(buffer, opts);
      const features =
        result.heartRateBpm !== null
          ? extractPulseFeatures(
              result.waveform,
              result.waveformFs,
              result.beatTimesS,
              result.heartRateBpm,
            )
          : null;

      setSnapshot({
        ...result,
        features,
        bp: estimateBloodPressure(features, calibrationRef.current, result.quality.score),
        elapsedSeconds: buffer.spanSeconds,
      });
    },
    [opts],
  );

  const reset = useCallback(() => {
    bufferRef.current.clear();
    lastAnalysisRef.current = 0;
    setSnapshot((s) => ({ ...EMPTY, bp: s.bp }));
  }, []);

  /**
   * Record a cuff reading against the pulse features measured right now.
   *
   * Refuses when the current signal is not clean enough, because a
   * calibration point built on a noisy waveform poisons every later estimate.
   */
  const addCuffReading = useCallback(
    (systolic: number, diastolic: number): { ok: boolean; reason?: string } => {
      const features = snapshot.features;
      if (!features) {
        return {
          ok: false,
          reason: "No usable pulse waveform right now. Wait for a good signal, then save.",
        };
      }
      if (features.morphologyStability < 0.6 || snapshot.quality.score < 0.6) {
        return {
          ok: false,
          reason:
            "Signal quality is too low to calibrate against. Improve the lighting and hold still.",
        };
      }
      if (systolic <= diastolic) {
        return { ok: false, reason: "Systolic must be higher than diastolic." };
      }
      if (systolic < 70 || systolic > 250 || diastolic < 40 || diastolic > 150) {
        return { ok: false, reason: "Those values are outside the plausible range." };
      }

      const reading: CuffReading = {
        systolic,
        diastolic,
        takenAtMs: Date.now(),
        features,
      };
      setCalibration(saveCalibration([...calibrationRef.current.readings, reading]));
      return { ok: true };
    },
    [snapshot.features, snapshot.quality.score],
  );

  const clearCalibration = useCallback(() => {
    setCalibration(saveCalibration([]));
  }, []);

  return { snapshot, pushFrame, reset, calibration, addCuffReading, clearCalibration };
}
