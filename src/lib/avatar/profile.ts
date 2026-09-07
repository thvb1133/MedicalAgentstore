/**
 * The companion profile: everything a person can set about how this talks
 * to them.
 *
 * Stored in localStorage, never on a server. It contains a display name and
 * an age band, which are the two fields most likely to be treated as personal
 * data, and there is no reason for either to leave the device.
 *
 * `parseProfile` is separate from the loading so it can be tested directly,
 * and it is defensive on purpose. This object is read from storage that a
 * previous version of the app wrote, that a user may have edited by hand, and
 * that survives every deployment. Anything unrecognised falls back to a
 * default rather than propagating undefined into the interface.
 */

import { DEFAULT_LANGUAGE, getLanguage, languageInstructions } from "./languages";
import { avatarOr, DEFAULT_AVATAR_ID, getAvatar, type AgeBand } from "./presets";
import { clampRate, getVoice, RATE_DEFAULT, voiceForLanguage } from "./voices";

/** How prominent the on-screen captions are. */
export type CaptionMode = "off" | "on" | "large";

/** Whether the companion appears as an illustrated face or an abstract shape. */
export type PresenceStyle = "portrait" | "abstract";

export interface CompanionProfile {
  /** What the person would like to be called. Optional and never required. */
  displayName: string;
  ageBand: AgeBand;
  avatarId: string;
  /**
   * A drawn face, or an abstract shape.
   *
   * Both are offered rather than one being replaced. A face is easier to sit
   * with for ten minutes and is what most people expect; a shape does not
   * imply a person who never said any of this, which some people prefer from
   * something giving them health information.
   */
  presence: PresenceStyle;
  /**
   * The language of the whole conversation: what the browser listens for,
   * what Claude replies in, and which voices the picker offers.
   */
  languageCode: string;
  voiceId: string;
  /** Percentage of normal speaking rate. */
  speechRate: number;
  captions: CaptionMode;
  /**
   * Turns on the access mode: captions forced large, typing promoted over
   * speaking, and every audio-only cue given a visible equivalent.
   */
  accessMode: boolean;
  /** Asks the assistant for short sentences and everyday words. */
  simpleLanguage: boolean;
  /** When false the reply is shown but never spoken. */
  speakReplies: boolean;
  /**
   * Show a hand fingerspelling the numbers and names out of each reply,
   * alongside the caption. Off by default: it is useful to a specific group
   * of people and clutter to everyone else.
   */
  fingerspelling: boolean;
  /** Which skin tone the drawn hand uses. */
  signTone: string;
  /**
   * Pseudonymous id used to file measurement history. Generated locally,
   * never tied to a name or an account.
   */
  profileId: string;
}

const STORAGE_KEY = "sanjivani-setu.companion-profile.v1";

const AGE_BANDS: AgeBand[] = ["child", "teen", "adult", "older"];
const CAPTION_MODES: CaptionMode[] = ["off", "on", "large"];
const SIGN_TONES = ["light", "medium", "tan", "deep"];
const PRESENCE_STYLES: PresenceStyle[] = ["portrait", "abstract"];

/** Constrained to what the history route will accept as a key segment. */
export function generateProfileId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function defaultProfile(): CompanionProfile {
  const avatar = avatarOr(DEFAULT_AVATAR_ID);
  return {
    displayName: "",
    ageBand: "adult",
    avatarId: avatar.id,
    presence: "portrait",
    languageCode: DEFAULT_LANGUAGE,
    voiceId: avatar.defaultVoiceId,
    speechRate: RATE_DEFAULT,
    captions: "on",
    accessMode: false,
    simpleLanguage: false,
    speakReplies: true,
    fingerspelling: false,
    signTone: "medium",
    profileId: generateProfileId(),
  };
}

function asString(value: unknown, fallback: string, maxLength = 40): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLength);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseProfile(raw: unknown): CompanionProfile {
  const base = defaultProfile();
  if (typeof raw !== "object" || raw === null) return base;
  const p = raw as Record<string, unknown>;

  const ageBand = AGE_BANDS.includes(p.ageBand as AgeBand)
    ? (p.ageBand as AgeBand)
    : base.ageBand;

  // An avatar id from an older build may no longer exist. Falling back to the
  // default is right; carrying the dead id forward would leave the picker with
  // nothing selected and the presence with no palette.
  const avatarId = getAvatar(asString(p.avatarId, "")) ? (p.avatarId as string) : base.avatarId;

  const storedVoice = getVoice(asString(p.voiceId, ""));

  /**
   * Language, or the language of the stored voice.
   *
   * Profiles written before this setting existed have no language field, but
   * they do have a voice, and the voice is the only record of what the person
   * actually chose. Someone who picked an Indian English voice should come
   * back to Indian English, not be reset to the default and have their voice
   * taken away as a side effect.
   */
  const languageCode = getLanguage(asString(p.languageCode, ""))
    ? (p.languageCode as string)
    : (storedVoice?.language ?? base.languageCode);

  // Beyond that migration the language wins. A voice reading text in a
  // language it was not trained on applies the wrong phonology and comes out
  // as noise, so a mismatch has to be resolved rather than carried forward.
  const voiceId = voiceForLanguage(
    languageCode,
    storedVoice?.id ?? avatarOr(avatarId).defaultVoiceId,
  );

  const captions = CAPTION_MODES.includes(p.captions as CaptionMode)
    ? (p.captions as CaptionMode)
    : base.captions;

  const accessMode = asBoolean(p.accessMode, base.accessMode);

  const profileIdRaw = asString(p.profileId, "", 64);
  const profileId = /^[a-z0-9-]{8,64}$/.test(profileIdRaw) ? profileIdRaw : base.profileId;

  return {
    displayName: asString(p.displayName, base.displayName),
    ageBand,
    avatarId,
    presence: PRESENCE_STYLES.includes(p.presence as PresenceStyle)
      ? (p.presence as PresenceStyle)
      : base.presence,
    languageCode,
    voiceId,
    speechRate: clampRate(typeof p.speechRate === "number" ? p.speechRate : base.speechRate),
    // Access mode implies large captions. Letting someone turn on the access
    // mode and still have captions off would be a setting that silently
    // contradicts itself.
    captions: accessMode ? "large" : captions,
    accessMode,
    simpleLanguage: asBoolean(p.simpleLanguage, base.simpleLanguage),
    speakReplies: asBoolean(p.speakReplies, base.speakReplies),
    fingerspelling: asBoolean(p.fingerspelling, base.fingerspelling),
    signTone: SIGN_TONES.includes(asString(p.signTone, "")) ? (p.signTone as string) : base.signTone,
    profileId,
  };
}

export function loadProfile(): CompanionProfile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    return parseProfile(JSON.parse(raw));
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: CompanionProfile): CompanionProfile {
  const clean = parseProfile(profile);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Private browsing, or storage full. The session still works; the
      // choices simply will not be remembered next time.
    }
  }
  return clean;
}

/**
 * The persona and delivery instructions this profile implies.
 *
 * Returned as a string appended below the safety rules in the system prompt,
 * never above them. A persona can change how the assistant sounds. It cannot
 * change what the assistant is permitted to say, and the ordering in the
 * prompt is what enforces that.
 */
export function personaInstructions(profile: CompanionProfile): string {
  const avatar = avatarOr(profile.avatarId);
  const lines: string[] = [`You are speaking as "${avatar.name}". ${avatar.persona}`];

  lines.push(languageInstructions(profile.languageCode));

  if (profile.displayName.trim()) {
    lines.push(`The person prefers to be called ${profile.displayName.trim()}.`);
  }

  if (profile.ageBand === "child") {
    lines.push(
      "The person is a child. Use very simple words, keep every sentence short, and if anything they say sounds worrying, tell them plainly to go and tell a trusted adult now.",
    );
  } else if (profile.ageBand === "older") {
    lines.push(
      "The person is an older adult. Be unhurried and clear. Do not simplify to the point of condescension — clarity and talking down are not the same thing.",
    );
  }

  if (profile.simpleLanguage) {
    lines.push(
      "Use plain language throughout: short sentences, everyday words, one idea per sentence. Aim for the reading level of a popular newspaper. Never use a clinical term without immediately saying what it means.",
    );
  }

  if (profile.fingerspelling) {
    lines.push(
      "Numbers and names in your reply are also being fingerspelled on screen, one letter at a time, which is slow. Say each measurement once, as digits with its unit, rather than repeating it in words.",
    );
  }

  if (profile.accessMode) {
    lines.push(
      "Your replies are being read as text rather than heard, by someone who may be Deaf or unable to speak. Never refer to hearing you, to your tone of voice, or to how you sound. If the person is typing rather than speaking, that is expected and you should not remark on it or ask them to speak. The microphone may still be measuring the acoustics of a voice they are not using to talk to you, so do not treat silence as reluctance.",
    );
  }

  return lines.join("\n");
}
