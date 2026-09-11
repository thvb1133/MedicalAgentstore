/**
 * Expression and voice, read together.
 *
 * There is a strong claim and a weak claim available here, and this file
 * makes only the weak one.
 *
 * The strong claim — that a face plus a voice reveals what someone feels — is
 * not supported. The largest review of the evidence (Barrett, Adolphs,
 * Marsella, Martinez & Pollak, 2019) found that people do not reliably move
 * their faces in the same way when experiencing the same emotion, and that
 * emotion cannot be inferred from facial configuration alone with any
 * confidence. Adding a microphone does not repair that.
 *
 * The weak claim is worth making anyway: two independent channels agreeing
 * about something observable is much better evidence than one channel on its
 * own. So what this produces is a description of *signals* — how animated the
 * face and voice are, and whether they are tending pleasant or unpleasant —
 * with an explicit agreement figure, and it refuses to collapse into a
 * confident single answer when the two channels disagree. A tense jaw with a
 * relaxed voice is a genuinely ambiguous observation and gets reported as
 * one.
 *
 * Nothing here is a mood, a diagnosis, or an assessment of a person.
 */

import type { VoiceAnalysis } from "../voice/engine";

export interface AffectFrame {
  timestampMs: number;
  /** MediaPipe blendshape scores by name, or null when no face was found. */
  blendshapes: Map<string, number> | null;
}

export interface AffectChannel {
  /** 0-1 how animated this channel is. */
  arousal: number | null;
  /** -1 to 1, unpleasant to pleasant, as displayed *signals* only. */
  valence: number | null;
  detail: string;
  withheld: string | null;
}

export interface Affect {
  arousal: number | null;
  valence: number | null;
  /** How closely the face and the voice agree, 0-1, or null with one channel. */
  agreement: number | null;
  face: AffectChannel;
  voice: AffectChannel;
  /** Short description of the signals, never of a feeling. */
  label: string;
  /** 0-1: two agreeing channels earn far more than one. */
  confidence: number;
  note: string;
}

/** Rolling window. Long enough to average out one grimace, short enough to move. */
const WINDOW_MS = 20_000;
/** Below this the acoustic analysis is measuring the room, not the speaker. */
const MIN_VOICE_QUALITY = 0.5;
/** Frames needed before the face channel says anything. */
const MIN_FACE_FRAMES = 30;

function pair(shapes: Map<string, number>, base: string): number {
  const left = shapes.get(`${base}Left`) ?? 0;
  const right = shapes.get(`${base}Right`) ?? 0;
  return (left + right) / 2;
}

export class AffectTracker {
  private frames: AffectFrame[] = [];

  reset(): void {
    this.frames = [];
  }

  push(frame: AffectFrame): void {
    this.frames.push(frame);
    const cutoff = frame.timestampMs - WINDOW_MS;
    let drop = 0;
    while (drop < this.frames.length && this.frames[drop].timestampMs < cutoff) drop++;
    if (drop > 0) this.frames.splice(0, drop);
  }

  analyse(voice: VoiceAnalysis | null): Affect {
    return fuseAffect(readFace(this.frames), readVoice(voice));
  }
}

/**
 * The face channel.
 *
 * Arousal leans on movement as much as on any particular expression, because
 * how much a face is doing is a far more robust observation than what it is
 * doing. Valence is dominated by the smile, weighted up when the cheeks are
 * involved — a smile that reaches the eyes is the one facial signal with
 * something like a consistent meaning.
 */
export function readFace(frames: AffectFrame[]): AffectChannel {
  const withFace = frames.filter((f) => f.blendshapes !== null);
  if (withFace.length < MIN_FACE_FRAMES) {
    return { arousal: null, valence: null, detail: "—", withheld: "Face not visible for long enough" };
  }

  const shapes = withFace.map((f) => f.blendshapes as Map<string, number>);
  const avg = (read: (s: Map<string, number>) => number) =>
    shapes.reduce((sum, s) => sum + read(s), 0) / shapes.length;

  const smile = avg((s) => pair(s, "mouthSmile"));
  const cheeks = avg((s) => pair(s, "cheekSquint"));
  const frown = avg((s) => pair(s, "mouthFrown"));
  const browDown = avg((s) => pair(s, "browDown"));
  const browInner = avg((s) => s.get("browInnerUp") ?? 0);
  const eyeWide = avg((s) => pair(s, "eyeWide"));
  const press = avg((s) => pair(s, "mouthPress"));
  const jaw = avg((s) => s.get("jawOpen") ?? 0);

  // How much the face is moving, as the mean frame-to-frame change across the
  // expressions that matter. This is what separates an animated face from a
  // still one holding the same shape.
  const keys = ["mouthSmileLeft", "browDownLeft", "browInnerUp", "jawOpen", "eyeWideLeft"];
  let motion = 0;
  for (let i = 1; i < shapes.length; i++) {
    for (const key of keys) {
      motion += Math.abs((shapes[i].get(key) ?? 0) - (shapes[i - 1].get(key) ?? 0));
    }
  }
  motion = motion / Math.max(1, (shapes.length - 1) * keys.length);

  const arousal = clamp01(
    eyeWide * 0.35 + browInner * 0.2 + browDown * 0.25 + press * 0.3 + jaw * 0.2 + motion * 6,
  );
  const duchenne = 0.65 + 0.35 * clamp01(cheeks * 2);
  const valence = clamp(smile * duchenne * 1.4 - (frown * 0.9 + browDown * 0.6), -1, 1);

  return {
    arousal,
    valence,
    detail: `${describeFace(smile, browDown, press, motion)}`,
    withheld: null,
  };
}

function describeFace(smile: number, browDown: number, press: number, motion: number): string {
  const parts: string[] = [];
  if (smile > 0.15) parts.push("smiling");
  if (browDown > 0.2) parts.push("brows drawn down");
  if (press > 0.2) parts.push("lips pressed");
  if (motion > 0.02) parts.push("mobile");
  else parts.push("still");
  return parts.join(", ");
}

/**
 * The voice channel.
 *
 * Only features that survive being measured on a laptop microphone in an
 * unknown room. Absolute pitch is excluded: it says more about who is
 * speaking than about how, and there is no population comparison here worth
 * making. Pitch *range*, rate and pausing are all relative to the speaker's
 * own utterance and are what a listener actually hears as animation.
 */
export function readVoice(voice: VoiceAnalysis | null): AffectChannel {
  if (!voice) {
    return { arousal: null, valence: null, detail: "—", withheld: "No speech measured yet" };
  }
  if (voice.quality < MIN_VOICE_QUALITY) {
    return {
      arousal: null,
      valence: null,
      detail: "—",
      withheld: `Not enough clean speech — ${voice.limitingFactor.toLowerCase()}`,
    };
  }

  // Two to six syllables a second spans deliberate to hurried.
  const rate = clamp01((voice.speechRateHz - 2) / 4);
  // A semitone of variation is close to monotone; four is animated speech.
  const range = clamp01((voice.pitchRangeSemitones - 1) / 3);
  const pausing = clamp01(voice.pauseRatio);

  const arousal = clamp01(rate * 0.45 + range * 0.4 + (1 - pausing) * 0.15);
  // Flat, slow, heavily paused speech is the well-attested acoustic pattern;
  // it is still only a description of sound.
  const valence = clamp(range * 0.9 + rate * 0.3 - pausing * 0.8 - 0.2, -1, 1);

  return {
    arousal,
    valence,
    detail: `${voice.pitchRangeSemitones.toFixed(1)} semitones of pitch, ${voice.speechRateHz.toFixed(1)} syllables/s, ${Math.round(voice.pauseRatio * 100)}% pauses`,
    withheld: null,
  };
}

export function fuseAffect(face: AffectChannel, voice: AffectChannel): Affect {
  const both = face.arousal !== null && voice.arousal !== null;
  const one = face.arousal !== null || voice.arousal !== null;

  if (!one) {
    return {
      arousal: null,
      valence: null,
      agreement: null,
      face,
      voice,
      label: "Not measured",
      confidence: 0,
      note: face.withheld ?? voice.withheld ?? "Nothing measured yet.",
    };
  }

  const arousal = both
    ? ((face.arousal as number) + (voice.arousal as number)) / 2
    : ((face.arousal ?? voice.arousal) as number);
  const valence = both
    ? ((face.valence as number) + (voice.valence as number)) / 2
    : ((face.valence ?? voice.valence) as number);

  // Agreement over both axes, with valence on a scale twice as wide so a
  // disagreement of the same size counts the same on either.
  const agreement = both
    ? clamp01(
        1 -
          (Math.abs((face.arousal as number) - (voice.arousal as number)) +
            Math.abs((face.valence as number) - (voice.valence as number)) / 2) /
            2,
      )
    : null;

  const mixed = agreement !== null && agreement < 0.6;
  const confidence = both ? (mixed ? 0.4 : 0.85) * (agreement ?? 1) : 0.3;

  return {
    arousal,
    valence,
    agreement,
    face,
    voice,
    label: mixed ? "Mixed signals" : describeAffect(arousal, valence),
    confidence,
    note: noteFor(both, mixed, face, voice),
  };
}

function describeAffect(arousal: number, valence: number): string {
  const lively = arousal >= 0.5;
  if (Math.abs(valence) < 0.15) return lively ? "Animated" : "Settled";
  if (valence > 0) return lively ? "Bright and animated" : "Warm and settled";
  return lively ? "Tense" : "Flat and quiet";
}

function noteFor(
  both: boolean,
  mixed: boolean,
  face: AffectChannel,
  voice: AffectChannel,
): string {
  const base =
    "This describes how expressive the face and voice are, not how the person feels. Facial configuration does not reliably indicate emotion, and a microphone does not fix that.";

  if (!both) {
    const missing = face.arousal === null ? face.withheld : voice.withheld;
    return `Only one channel is reporting${missing ? ` — ${missing.toLowerCase()}` : ""}, so this rests on half the evidence. ${base}`;
  }
  if (mixed) {
    return `The face and the voice are describing different things, which is a real observation rather than a fault. ${base}`;
  }
  return `Face and voice agree. ${base}`;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}
