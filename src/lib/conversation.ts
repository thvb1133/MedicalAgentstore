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

/**
 * Render the sensor snapshot as prose for the model.
 *
 * This lives here, next to the types, rather than in the route, for two
 * reasons. It is pure string formatting with no server dependencies, so
 * keeping it out of the route means it can be unit tested without dragging in
 * the Anthropic client and the credential loader. And it is the single most
 * safety-relevant piece of text the system produces — it is the entire
 * interface between what the sensors measured and what the model believes —
 * so it deserves to be somewhere it will be found and read.
 *
 * Prose rather than JSON is deliberate. Given raw JSON the model reads values
 * back verbatim, decimals and all, which sounds absurd spoken aloud. Sentences
 * that state outright when something is unmeasured produce turns that sound
 * like a person noticing something, and they leave no ambiguous empty fields
 * for the model to fill in on its own.
 */
export function describeContext(context: LiveContext): string {
  const lines: string[] = [];

  lines.push(`Session length so far: ${Math.round(context.sessionSeconds)} seconds.`);

  const v = context.vitals;
  if (!v || v.quality < 0.15) {
    lines.push(
      "Camera vitals: nothing measurable yet. Do not refer to any vital signs as if you had them.",
    );
  } else {
    const parts: string[] = [];
    parts.push(
      v.heartRateBpm === null
        ? "heart rate could not be measured"
        : `heart rate ${Math.round(v.heartRateBpm)} beats per minute`,
    );
    parts.push(
      v.breathingRateBpm === null
        ? "breathing rate could not be measured"
        : `breathing ${Math.round(v.breathingRateBpm)} breaths per minute`,
    );
    if (v.hrvSdnnMs !== null) parts.push(`heart rate variability ${Math.round(v.hrvSdnnMs)} ms`);
    if (v.stressIndex !== null) {
      parts.push(`a derived stress index of ${v.stressIndex.toFixed(2)} out of 1`);
    }
    if (v.bloodPressure) {
      parts.push(
        `blood pressure about ${v.bloodPressure.systolic} over ${v.bloodPressure.diastolic}, give or take ${v.bloodPressure.uncertainty}`,
      );
    } else {
      parts.push(`blood pressure unavailable (${v.bloodPressureStatus})`);
    }
    lines.push(`Camera vitals: ${parts.join(", ")}.`);
    lines.push(
      `Camera signal quality ${v.quality.toFixed(2)} out of 1${v.limiting ? ` — ${v.limiting}` : ""}.`,
    );
  }

  const a = context.voice;
  if (!a || a.quality < 0.15) {
    lines.push("Voice acoustics: not enough clean speech to measure yet.");
  } else {
    const parts: string[] = [];
    if (a.medianF0Hz !== null) parts.push(`pitch around ${Math.round(a.medianF0Hz)} Hz`);
    if (a.pitchRangeSemitones !== null) {
      parts.push(`pitch variation ${a.pitchRangeSemitones.toFixed(1)} semitones`);
    }
    if (a.jitterPercent !== null) parts.push(`jitter ${a.jitterPercent.toFixed(2)}%`);
    if (a.shimmerPercent !== null) parts.push(`shimmer ${a.shimmerPercent.toFixed(2)}%`);
    if (a.harmonicsToNoiseDb !== null) {
      parts.push(`harmonics-to-noise ${a.harmonicsToNoiseDb.toFixed(1)} dB`);
    }
    if (a.speechRateHz !== null) {
      parts.push(`speaking about ${a.speechRateHz.toFixed(1)} syllables per second`);
    }
    if (a.pauseRatio !== null) parts.push(`pausing ${Math.round(a.pauseRatio * 100)}% of the time`);
    lines.push(`Voice acoustics: ${parts.join(", ")}.`);
    lines.push(
      `Voice signal quality ${a.quality.toFixed(2)} out of 1${a.limiting ? ` — ${a.limiting}` : ""}.`,
    );
    lines.push(
      "Reminder: these are descriptions of sound only. Do not infer mood, mental health or neurological state from them.",
    );
  }

  return lines.join("\n");
}
