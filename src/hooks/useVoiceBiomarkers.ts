"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { asset } from "@/lib/paths";
import { VoiceBuffer, type VoiceAnalysis } from "@/lib/voice/engine";

/**
 * Microphone capture feeding the acoustic analyser.
 *
 * Two jobs, on two different clocks. The speaking indicator and the level
 * meter have to react within a frame or the interface feels broken, so they
 * are updated from every incoming block. The acoustic measurements need
 * several seconds of speech before they mean anything and cost real CPU, so
 * they run on a slow timer over a rolling window.
 */

/** Analysis window. Long enough for stable jitter, short enough to feel live. */
const WINDOW_SECONDS = 6;

/** How often the full analysis runs. */
const ANALYSIS_INTERVAL_MS = 2000;

/** Target rate for analysis. Speech pitch needs nothing above this. */
const TARGET_SAMPLE_RATE = 16000;

/** Level smoothing, as a per-block coefficient. */
const LEVEL_ATTACK = 0.5;
const LEVEL_RELEASE = 0.12;

/** Silence this long ends a speaking turn. */
const TURN_END_SILENCE_MS = 900;

export interface VoiceBiomarkerState {
  /** The most recent full analysis, or null before there is enough speech. */
  analysis: VoiceAnalysis | null;
  /** Smoothed instantaneous loudness, 0-1, for meters and the avatar. */
  level: number;
  /** True while the user is judged to be speaking. */
  speaking: boolean;
  /** True once the microphone is live. */
  active: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Drop the rolling window, e.g. when a new conversation starts. */
  reset: () => void;
}

export interface VoiceBiomarkerOptions {
  /** Fired once when the user starts speaking after silence. */
  onSpeechStart?: () => void;
  /** Fired once when the user has been silent long enough to end a turn. */
  onTurnEnd?: () => void;
  /**
   * When true, level and speaking are still tracked but turn callbacks are
   * suppressed. Used while the assistant is talking so its own voice leaking
   * into the microphone cannot be mistaken for the user taking a turn.
   */
  muted?: boolean;
}

export function useVoiceBiomarkers(options: VoiceBiomarkerOptions = {}): VoiceBiomarkerState {
  const { onSpeechStart, onTurnEnd, muted = false } = options;

  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(null);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const bufferRef = useRef<VoiceBuffer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const levelRef = useRef(0);
  const noiseFloorRef = useRef(0.005);
  const speakingRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const turnPendingRef = useRef(false);

  // Callbacks live in refs so that changing them does not tear down the audio
  // graph, which would drop the rolling window and interrupt the meter.
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onSpeechStartRef = useRef(onSpeechStart);
  onSpeechStartRef.current = onSpeechStart;
  const onTurnEndRef = useRef(onTurnEnd);
  onTurnEndRef.current = onTurnEnd;

  const handleBlock = useCallback((samples: Float32Array) => {
    bufferRef.current?.push(samples);

    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);

    // Asymmetric smoothing: jump up quickly so speech onset is immediate, fall
    // slowly so the meter does not flicker between syllables.
    const coefficient = rms > levelRef.current ? LEVEL_ATTACK : LEVEL_RELEASE;
    levelRef.current += (rms - levelRef.current) * coefficient;

    // The noise floor tracks downward fast and upward very slowly, so it
    // settles on the quiet background rather than being dragged up by speech.
    const floor = noiseFloorRef.current;
    noiseFloorRef.current = rms < floor ? floor + (rms - floor) * 0.25 : floor + (rms - floor) * 0.0005;

    // Speech must clear the floor by a good margin *and* an absolute minimum.
    // The absolute term matters in a silent room, where the floor approaches
    // zero and a purely relative threshold would trigger on nothing at all.
    const threshold = Math.max(noiseFloorRef.current * 3.5, 0.008);
    const isVoice = levelRef.current > threshold;
    const now = performance.now();

    if (isVoice) {
      lastVoiceAtRef.current = now;
      if (!speakingRef.current) {
        speakingRef.current = true;
        setSpeaking(true);
        if (!mutedRef.current) {
          turnPendingRef.current = true;
          onSpeechStartRef.current?.();
        }
      }
    } else if (speakingRef.current && now - lastVoiceAtRef.current > TURN_END_SILENCE_MS) {
      speakingRef.current = false;
      setSpeaking(false);
      if (turnPendingRef.current && !mutedRef.current) {
        turnPendingRef.current = false;
        onTurnEndRef.current?.();
      }
    }

    // Rendering a number every 128 ms is fine; rendering the raw value would
    // repaint on every block for changes too small to see.
    setLevel(Math.min(1, levelRef.current * 12));
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    nodeRef.current?.port.close();
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    bufferRef.current = null;
    speakingRef.current = false;
    turnPendingRef.current = false;
    levelRef.current = 0;
    setSpeaking(false);
    setLevel(0);
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (contextRef.current) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Echo cancellation is what lets the microphone stay open while the
          // assistant is speaking without the assistant hearing itself. Noise
          // suppression and gain control are left on for the same reason: this
          // is a conversation first, and the acoustic measures are reported
          // with a quality score that reflects whatever processing did happen.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Asking for the analysis rate directly lets the browser resample, which
      // it does better and more cheaply than we would in a worklet. Not every
      // browser honours the hint, so the buffer is built from the rate we
      // actually got rather than the one we asked for.
      let context: AudioContext;
      try {
        context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      } catch {
        context = new AudioContext();
      }
      contextRef.current = context;
      if (context.state === "suspended") await context.resume();

      bufferRef.current = new VoiceBuffer(WINDOW_SECONDS, context.sampleRate);

      await context.audioWorklet.addModule(asset("/audio/voice-capture.js"));
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "voice-capture");
      node.port.onmessage = (event) => handleBlock(event.data as Float32Array);
      source.connect(node);
      // The worklet produces no output, but Chrome will not pull from a node
      // that is not connected to the destination.
      node.connect(context.destination);
      nodeRef.current = node;

      timerRef.current = setInterval(() => {
        const result = bufferRef.current?.analyse() ?? null;
        if (result) setAnalysis(result);
      }, ANALYSIS_INTERVAL_MS);

      setActive(true);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone permission was refused. The conversation needs it to hear you."
          : name === "NotFoundError"
            ? "No microphone was found."
            : `Could not start the microphone: ${err instanceof Error ? err.message : String(err)}`,
      );
      stop();
    }
  }, [handleBlock, stop]);

  const reset = useCallback(() => {
    bufferRef.current?.clear();
    setAnalysis(null);
  }, []);

  useEffect(() => stop, [stop]);

  return { analysis, level, speaking, active, error, start, stop, reset };
}
