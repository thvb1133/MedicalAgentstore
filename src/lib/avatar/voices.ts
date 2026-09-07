/**
 * The voice catalogue.
 *
 * Every entry is an Amazon Polly *neural* voice. The standard engine is
 * cheaper but reads numbers with a flat, mechanical cadence, and this
 * assistant mostly says numbers — "one hundred and eighteen over seventy six"
 * has to sound like a person saying it or the whole conversation falls apart.
 *
 * Voices are described by how they sound rather than by gender. A person
 * choosing a voice for their grandmother wants to know it is slow and clear;
 * "female" does not tell them that. Gender is still listed, because some
 * people have a firm preference and hiding it would be its own kind of
 * unhelpful, but it is never the primary label.
 */

export type VoiceGender = "female" | "male" | "neutral";

export interface VoiceOption {
  /** Polly VoiceId. */
  id: string;
  /** What to show in the picker. */
  name: string;
  /** BCP-47 locale, shown so people can find their own accent. */
  locale: string;
  /** Human-readable accent, e.g. "British English". */
  accent: string;
  /** How it sounds, in plain words. This is the label people actually use. */
  character: string;
  gender: VoiceGender;
  /** True for voices that read clearly at a slow rate — the default for elders. */
  clear?: boolean;
  /** True for the child voice, offered for young users. */
  child?: boolean;
}

export const VOICES: VoiceOption[] = [
  {
    id: "Amy",
    name: "Amy",
    locale: "en-GB",
    accent: "British English",
    character: "Warm and unhurried",
    gender: "female",
    clear: true,
  },
  {
    id: "Arthur",
    name: "Arthur",
    locale: "en-GB",
    accent: "British English",
    character: "Calm and measured",
    gender: "male",
    clear: true,
  },
  {
    id: "Emma",
    name: "Emma",
    locale: "en-GB",
    accent: "British English",
    character: "Bright and quick",
    gender: "female",
  },
  {
    id: "Brian",
    name: "Brian",
    locale: "en-GB",
    accent: "British English",
    character: "Low and steady",
    gender: "male",
  },
  {
    id: "Kajal",
    name: "Kajal",
    locale: "en-IN",
    accent: "Indian English",
    character: "Clear, natural with Indian names",
    gender: "female",
    clear: true,
  },
  {
    id: "Joanna",
    name: "Joanna",
    locale: "en-US",
    accent: "American English",
    character: "Even and professional",
    gender: "female",
  },
  {
    id: "Matthew",
    name: "Matthew",
    locale: "en-US",
    accent: "American English",
    character: "Grounded and reassuring",
    gender: "male",
  },
  {
    id: "Ruth",
    name: "Ruth",
    locale: "en-US",
    accent: "American English",
    character: "Soft and conversational",
    gender: "female",
    clear: true,
  },
  {
    id: "Stephen",
    name: "Stephen",
    locale: "en-US",
    accent: "American English",
    character: "Crisp and articulate",
    gender: "male",
  },
  {
    id: "Ivy",
    name: "Ivy",
    locale: "en-US",
    accent: "American English",
    character: "A child's voice, gentle and simple",
    gender: "neutral",
    child: true,
  },
  {
    id: "Niamh",
    name: "Niamh",
    locale: "en-IE",
    accent: "Irish English",
    character: "Lilting and friendly",
    gender: "female",
  },
  {
    id: "Olivia",
    name: "Olivia",
    locale: "en-AU",
    accent: "Australian English",
    character: "Relaxed and open",
    gender: "female",
  },
];

export const DEFAULT_VOICE_ID = "Amy";

export function getVoice(id: string): VoiceOption | undefined {
  return VOICES.find((v) => v.id === id);
}

/**
 * Speaking rate as a percentage of normal, applied through SSML prosody.
 *
 * The range is asymmetric on purpose. Slowing down helps a great many people —
 * anyone hard of hearing, anyone reading captions alongside the audio, anyone
 * hearing this accent for the first time — so there is plenty of room below
 * 100. Speeding up past about 125% starts to slur the neural voices and helps
 * almost nobody, so the ceiling is low.
 */
export const RATE_MIN = 60;
export const RATE_MAX = 125;
export const RATE_DEFAULT = 100;

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return RATE_DEFAULT;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(rate)));
}

export function describeRate(rate: number): string {
  if (rate <= 70) return "Much slower";
  if (rate < 90) return "Slower";
  if (rate <= 110) return "Normal";
  return "Faster";
}
