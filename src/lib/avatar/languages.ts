/**
 * The languages this can hold a conversation in.
 *
 * Three separate things have to agree for a language to actually work, and
 * getting two of three is worse than getting none: the browser has to
 * recognise speech in it, Claude has to reply in it, and Polly has to have a
 * voice for it. A language listed here has all three.
 *
 * The endonym is shown first in the picker. Someone looking for their own
 * language is scanning for the word they call it, not the English name for
 * it, and a list that reads "Hindi, Tamil, Bengali" is a list written for
 * somebody else.
 */

export interface Language {
  /** BCP-47 tag, used for speech recognition and to pick a voice. */
  code: string;
  /** English name, for people navigating in English. */
  name: string;
  /** What speakers call it. Shown first. */
  endonym: string;
  /** Right-to-left script, so captions and transcripts need reversing. */
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: "en-GB", name: "English (UK)", endonym: "English (UK)" },
  { code: "en-US", name: "English (US)", endonym: "English (US)" },
  { code: "en-IN", name: "English (India)", endonym: "English (India)" },
  { code: "en-AU", name: "English (Australia)", endonym: "English (Australia)" },
  { code: "en-IE", name: "English (Ireland)", endonym: "English (Ireland)" },
  { code: "hi-IN", name: "Hindi", endonym: "हिन्दी" },
  { code: "ar-AE", name: "Arabic", endonym: "العربية", rtl: true },
  { code: "cmn-CN", name: "Mandarin Chinese", endonym: "普通话" },
  { code: "es-ES", name: "Spanish", endonym: "Español" },
  { code: "es-US", name: "Spanish (Americas)", endonym: "Español (América)" },
  { code: "fr-FR", name: "French", endonym: "Français" },
  { code: "pt-BR", name: "Portuguese (Brazil)", endonym: "Português (Brasil)" },
  { code: "de-DE", name: "German", endonym: "Deutsch" },
  { code: "it-IT", name: "Italian", endonym: "Italiano" },
  { code: "ja-JP", name: "Japanese", endonym: "日本語" },
  { code: "ko-KR", name: "Korean", endonym: "한국어" },
  { code: "nl-NL", name: "Dutch", endonym: "Nederlands" },
  { code: "pl-PL", name: "Polish", endonym: "Polski" },
  { code: "tr-TR", name: "Turkish", endonym: "Türkçe" },
  { code: "sv-SE", name: "Swedish", endonym: "Svenska" },
  { code: "da-DK", name: "Danish", endonym: "Dansk" },
  { code: "nb-NO", name: "Norwegian", endonym: "Norsk" },
  { code: "fi-FI", name: "Finnish", endonym: "Suomi" },
  { code: "ca-ES", name: "Catalan", endonym: "Català" },
];

export const DEFAULT_LANGUAGE = "en-GB";

/**
 * Follow whoever is talking, rather than a language chosen in advance.
 *
 * The measurement agents pin a language on purpose: someone who has set Hindi
 * and then says one English word should not have the conversation switch
 * under them mid-reading. The assistant that floats over every page has the
 * opposite problem — it is answering one-off questions from whoever happens
 * to be at the keyboard, in whatever they happen to type — so there mirroring
 * the input is the right behaviour, and it is the only way to cover languages
 * the picker does not list.
 */
export const MIRROR_LANGUAGE = "auto";

export function mirrorLanguageInstructions(): string {
  return [
    "Reply in the same language the person just used, whatever it is, and write it in that language's own script rather than in transliteration.",
    "If they switch language mid-conversation, switch with them. If a message is too short to tell, use the language of the message before it.",
    'Leave measurements as digits with their standard unit — "72 bpm", "118/76 mmHg" — in every language, because those are what a clinician will ask them to repeat.',
  ].join(" ");
}

export function getLanguage(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function languageOr(code: string): Language {
  return getLanguage(code) ?? getLanguage(DEFAULT_LANGUAGE)!;
}

export function isEnglish(code: string): boolean {
  return code.startsWith("en-");
}

/**
 * What to tell Claude about which language to answer in.
 *
 * Two rules here are worth stating explicitly in the prompt rather than
 * hoping the model infers them.
 *
 * The first is that the reply follows the setting, not the input. Someone who
 * has chosen Hindi and then says an English word — which happens constantly,
 * because medical vocabulary travels in English — should not have the whole
 * conversation switch under them.
 *
 * The second is that a measurement is a number and a unit, and neither
 * translates. "72 bpm" is what is written on the machine in the clinic, and a
 * localised rendering of it is a number the person then cannot repeat to
 * anyone.
 */
export function languageInstructions(code: string): string {
  const language = languageOr(code);

  if (isEnglish(code)) {
    const variety =
      code === "en-IN"
        ? " Use Indian English spelling and idiom, and pronounce Indian names as they are said, not as they are spelled in English."
        : code === "en-US"
          ? " Use American spelling."
          : " Use British spelling.";
    return `Reply in English.${variety} If the person writes or speaks in another language, still reply in English, but keep your sentences short and plain so they are easy to follow in a second language.`;
  }

  return [
    `Reply in ${language.name} (${language.endonym}). Write in that language's own script, not in transliteration.`,
    `Reply in ${language.name} even when the person uses English words. Medical vocabulary travels in English and people mix it in constantly; that is not a request to change language.`,
    `Leave measurements as digits with their standard unit — "72 bpm", "118/76 mmHg". These are what a clinician will ask them to repeat, and a translated number is one they cannot.`,
    `If a clinical term has no everyday equivalent in ${language.name}, give the local word and then the English term once in brackets, so they can recognise it on a form.`,
  ].join(" ");
}
