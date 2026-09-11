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
  /**
   * Catalogue key. Usually the Polly VoiceId, but not always: Polly's Kajal
   * is bilingual and appears under both Hindi and Indian English, and two
   * catalogue entries cannot share a key.
   */
  id: string;
  /** Polly VoiceId, when it differs from the catalogue key. */
  polly?: string;
  /**
   * The language this voice speaks, as a code in `languages.ts`.
   *
   * A voice reading text in a language it was not trained on does not sound
   * accented, it sounds broken — it applies the wrong phonology letter by
   * letter. So the picker filters by language rather than offering every
   * voice for every language.
   */
  language: string;
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
  /**
   * Polly has no neural model for this voice, so it falls back to the older
   * engine. Marked because the difference is audible and people should not
   * have to guess why one voice sounds flatter than the rest.
   */
  standardOnly?: boolean;
}

export const VOICES: VoiceOption[] = [
  {
    id: "Amy",
    language: "en-GB",
    name: "Amy",
    locale: "en-GB",
    accent: "British English",
    character: "Warm and unhurried",
    gender: "female",
    clear: true,
  },
  {
    id: "Arthur",
    language: "en-GB",
    name: "Arthur",
    locale: "en-GB",
    accent: "British English",
    character: "Calm and measured",
    gender: "male",
    clear: true,
  },
  {
    id: "Emma",
    language: "en-GB",
    name: "Emma",
    locale: "en-GB",
    accent: "British English",
    character: "Bright and quick",
    gender: "female",
  },
  {
    id: "Brian",
    language: "en-GB",
    name: "Brian",
    locale: "en-GB",
    accent: "British English",
    character: "Low and steady",
    gender: "male",
  },
  {
    id: "Kajal",
    language: "en-IN",
    name: "Kajal",
    locale: "en-IN",
    accent: "Indian English",
    character: "Clear, natural with Indian names",
    gender: "female",
    clear: true,
  },
  {
    id: "Joanna",
    language: "en-US",
    name: "Joanna",
    locale: "en-US",
    accent: "American English",
    character: "Even and professional",
    gender: "female",
  },
  {
    id: "Matthew",
    language: "en-US",
    name: "Matthew",
    locale: "en-US",
    accent: "American English",
    character: "Grounded and reassuring",
    gender: "male",
  },
  {
    id: "Ruth",
    language: "en-US",
    name: "Ruth",
    locale: "en-US",
    accent: "American English",
    character: "Soft and conversational",
    gender: "female",
    clear: true,
  },
  {
    id: "Stephen",
    language: "en-US",
    name: "Stephen",
    locale: "en-US",
    accent: "American English",
    character: "Crisp and articulate",
    gender: "male",
  },
  {
    id: "Ivy",
    language: "en-US",
    name: "Ivy",
    locale: "en-US",
    accent: "American English",
    character: "A child's voice, gentle and simple",
    gender: "neutral",
    child: true,
  },
  {
    id: "Niamh",
    language: "en-IE",
    name: "Niamh",
    locale: "en-IE",
    accent: "Irish English",
    character: "Lilting and friendly",
    gender: "female",
  },
  {
    id: "Olivia",
    language: "en-AU",
    name: "Olivia",
    locale: "en-AU",
    accent: "Australian English",
    character: "Relaxed and open",
    gender: "female",
  },
  // Beyond English.
  //
  // Someone describing chest pain or a panic attack is reaching for words
  // they learned as a child, and asking them to do that in a second language
  // costs both accuracy and dignity. These are the languages where Polly has
  // a voice, the browser recognises speech, and Claude answers fluently —
  // anything short of all three would be a language that half works.
  {
    id: "Kajal-hi",
    polly: "Kajal",
    language: "hi-IN",
    name: "Kajal",
    locale: "hi-IN",
    accent: "Hindi",
    character: "Warm; moves between Hindi and English naturally",
    gender: "female",
    clear: true,
  },
  {
    id: "Hala",
    language: "ar-AE",
    name: "Hala",
    locale: "ar-AE",
    accent: "Gulf Arabic",
    character: "Gentle and even",
    gender: "female",
    clear: true,
  },
  {
    id: "Zhiyu",
    language: "cmn-CN",
    name: "Zhiyu",
    locale: "cmn-CN",
    accent: "Mandarin",
    character: "Clear and level",
    gender: "female",
    clear: true,
  },
  {
    id: "Lucia",
    language: "es-ES",
    name: "Lucía",
    locale: "es-ES",
    accent: "European Spanish",
    character: "Bright and articulate",
    gender: "female",
  },
  {
    id: "Sergio",
    language: "es-ES",
    name: "Sergio",
    locale: "es-ES",
    accent: "European Spanish",
    character: "Steady and low",
    gender: "male",
  },
  {
    id: "Lupe",
    language: "es-US",
    name: "Lupe",
    locale: "es-US",
    accent: "American Spanish",
    character: "Warm and unhurried",
    gender: "female",
    clear: true,
  },
  {
    id: "Pedro",
    language: "es-US",
    name: "Pedro",
    locale: "es-US",
    accent: "American Spanish",
    character: "Friendly and open",
    gender: "male",
  },
  {
    id: "Lea",
    language: "fr-FR",
    name: "Léa",
    locale: "fr-FR",
    accent: "French",
    character: "Calm and precise",
    gender: "female",
    clear: true,
  },
  {
    id: "Remi",
    language: "fr-FR",
    name: "Rémi",
    locale: "fr-FR",
    accent: "French",
    character: "Measured and warm",
    gender: "male",
  },
  {
    id: "Camila",
    language: "pt-BR",
    name: "Camila",
    locale: "pt-BR",
    accent: "Brazilian Portuguese",
    character: "Bright and easy",
    gender: "female",
  },
  {
    id: "Thiago",
    language: "pt-BR",
    name: "Thiago",
    locale: "pt-BR",
    accent: "Brazilian Portuguese",
    character: "Grounded and clear",
    gender: "male",
    clear: true,
  },
  {
    id: "Vicki",
    language: "de-DE",
    name: "Vicki",
    locale: "de-DE",
    accent: "German",
    character: "Direct and clear",
    gender: "female",
    clear: true,
  },
  {
    id: "Daniel",
    language: "de-DE",
    name: "Daniel",
    locale: "de-DE",
    accent: "German",
    character: "Low and unhurried",
    gender: "male",
  },
  {
    id: "Bianca",
    language: "it-IT",
    name: "Bianca",
    locale: "it-IT",
    accent: "Italian",
    character: "Expressive and warm",
    gender: "female",
  },
  {
    id: "Adriano",
    language: "it-IT",
    name: "Adriano",
    locale: "it-IT",
    accent: "Italian",
    character: "Even and reassuring",
    gender: "male",
    clear: true,
  },
  {
    id: "Kazuha",
    language: "ja-JP",
    name: "Kazuha",
    locale: "ja-JP",
    accent: "Japanese",
    character: "Soft and polite",
    gender: "female",
    clear: true,
  },
  {
    id: "Takumi",
    language: "ja-JP",
    name: "Takumi",
    locale: "ja-JP",
    accent: "Japanese",
    character: "Calm and level",
    gender: "male",
  },
  {
    id: "Seoyeon",
    language: "ko-KR",
    name: "Seoyeon",
    locale: "ko-KR",
    accent: "Korean",
    character: "Clear and gentle",
    gender: "female",
    clear: true,
  },
  {
    id: "Laura",
    language: "nl-NL",
    name: "Laura",
    locale: "nl-NL",
    accent: "Dutch",
    character: "Plain and friendly",
    gender: "female",
    clear: true,
  },
  {
    id: "Ola",
    language: "pl-PL",
    name: "Ola",
    locale: "pl-PL",
    accent: "Polish",
    character: "Warm and steady",
    gender: "female",
    clear: true,
  },
  {
    id: "Burcu",
    language: "tr-TR",
    name: "Burcu",
    locale: "tr-TR",
    accent: "Turkish",
    character: "Bright and clear",
    gender: "female",
    clear: true,
  },
  {
    id: "Elin",
    language: "sv-SE",
    name: "Elin",
    locale: "sv-SE",
    accent: "Swedish",
    character: "Even and calm",
    gender: "female",
    clear: true,
  },
  {
    id: "Sofie",
    language: "da-DK",
    name: "Sofie",
    locale: "da-DK",
    accent: "Danish",
    character: "Soft and unhurried",
    gender: "female",
    clear: true,
  },
  {
    id: "Ida",
    language: "nb-NO",
    name: "Ida",
    locale: "nb-NO",
    accent: "Norwegian",
    character: "Light and clear",
    gender: "female",
    clear: true,
  },
  {
    id: "Suvi",
    language: "fi-FI",
    name: "Suvi",
    locale: "fi-FI",
    accent: "Finnish",
    character: "Even and precise",
    gender: "female",
    clear: true,
  },
  {
    id: "Arlet",
    language: "ca-ES",
    name: "Arlet",
    locale: "ca-ES",
    accent: "Catalan",
    character: "Warm and conversational",
    gender: "female",
    clear: true,
  },
];


export const DEFAULT_VOICE_ID = "Amy";

export function getVoice(id: string): VoiceOption | undefined {
  return VOICES.find((v) => v.id === id);
}

/** The name Polly knows this voice by, which is not always the catalogue key. */
export function pollyVoiceId(id: string): string {
  return getVoice(id)?.polly ?? id;
}

export function voicesForLanguage(code: string): VoiceOption[] {
  return VOICES.filter((v) => v.language === code);
}

/**
 * A voice that speaks the given language, preferring one already chosen.
 *
 * Switching language has to switch voice, because a voice reading text in a
 * language it was not trained on does not sound accented — it applies the
 * wrong phonology letter by letter and comes out as noise. Keeping the
 * current voice would be the more conservative-looking choice and the worse
 * one.
 */
export function voiceForLanguage(code: string, preferredId?: string): string {
  const available = voicesForLanguage(code);
  if (available.length === 0) return DEFAULT_VOICE_ID;
  if (preferredId && available.some((v) => v.id === preferredId)) return preferredId;
  return (available.find((v) => v.clear) ?? available[0]).id;
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
