/**
 * Shared types for the live conversation agent.
 *
 * The browser measures, the server interprets. These are the shapes that
 * cross that boundary: the dialogue so far, plus whatever the camera and
 * microphone could measure at the moment the person finished speaking.
 *
 * Every measurement is optional and nullable on purpose. "We could not
 * measure your heart rate" is real information and has to survive the trip to
 * the model intact, because the alternative — omitting the field, or worse,
 * defaulting it to zero — invites the model to talk about a number that was
 * never taken.
 */

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

/** Camera-derived vitals at the moment of the turn. */
export interface VitalsContext {
  heartRateBpm: number | null;
  breathingRateBpm: number | null;
  hrvSdnnMs: number | null;
  stressIndex: number | null;
  bloodPressure: { systolic: number; diastolic: number; uncertainty: number } | null;
  bloodPressureStatus: string;
  /** 0-1 confidence in the camera measurements. */
  quality: number;
  /** What is holding the quality back, in plain language. */
  limiting: string | null;
}

/** Microphone-derived acoustics at the moment of the turn. */
export interface VoiceContext {
  medianF0Hz: number | null;
  pitchRangeSemitones: number | null;
  jitterPercent: number | null;
  shimmerPercent: number | null;
  harmonicsToNoiseDb: number | null;
  speechRateHz: number | null;
  pauseRatio: number | null;
  /** 0-1 confidence in the acoustic measurements. */
  quality: number;
  limiting: string | null;
}

export interface LiveContext {
  vitals: VitalsContext | null;
  voice: VoiceContext | null;
  /** Seconds since the session started, so the model knows how settled the numbers are. */
  sessionSeconds: number;
}

export interface ConverseRequest {
  messages: ConversationTurn[];
  context: LiveContext;
}
