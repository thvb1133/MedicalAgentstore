/**
 * The avatar catalogue.
 *
 * These are deliberately abstract. A photoreal synthetic face on a tool that
 * measures your body and then talks to you about it borrows a clinician's
 * authority without any of a clinician's accountability, and the more
 * convincing the face, the more of that authority it borrows. Every avatar
 * here is unmistakably a piece of software.
 *
 * That constraint turned out to be freeing rather than limiting. Because
 * nothing has to look human, the presence can carry information instead:
 * every one of these pulses in time with the heart rate the camera is
 * measuring, and shows the microphone level as it listens.
 *
 * Each avatar pairs a look with a manner of speaking. The `persona` line goes
 * into Claude's system prompt, so choosing "Tara" does not merely recolour the
 * screen — it changes how the assistant talks. What it will not change is what
 * the assistant is allowed to say: the safety rules sit above the persona and
 * a persona cannot loosen them.
 */

import { VoiceOption, VOICES } from "./voices";

/**
 * How the presence is drawn. Each is a distinct silhouette, not a recolour.
 *
 * There is one style per avatar, and that is a constraint rather than a
 * coincidence: a picker where two options are the same shape in different
 * colours is not really offering a choice. The shapes also have to survive
 * being drawn at about ninety pixels in the picker grid, which rules out
 * anything whose character lives in fine detail.
 */
export type AvatarStyle = "orb" | "aurora" | "bloom" | "wave" | "lattice" | "prism";

/** Broad age bands, used only to order the presets sensibly. */
export type AgeBand = "child" | "teen" | "adult" | "older";

export interface AvatarPalette {
  /** The core fill. */
  core: string;
  /** Rings and accents. */
  ring: string;
  /** Ambient glow, usually the ring at low alpha. */
  glow: string;
}

export interface AvatarPreset {
  id: string;
  /** The name people will call it. */
  name: string;
  /** One line for the picker card. */
  tagline: string;
  style: AvatarStyle;
  palette: AvatarPalette;
  /**
   * Appended to the system prompt. Describes manner only — never expertise,
   * never a role that implies clinical standing.
   */
  persona: string;
  /** Voice chosen to match the manner. */
  defaultVoiceId: string;
  /** Age bands this is offered for first. It is never restricted to them. */
  suitedTo: AgeBand[];
  /**
   * An illustrated portrait, for people who would rather talk to a face than
   * a shape. Drawn rather than photographed, and it does not lip-sync — see
   * `PortraitPresence` for why that line is where it is.
   */
  portrait: string;
}

export const AVATARS: AvatarPreset[] = [
  {
    id: "asha",
    portrait: "/portraits/asha.webp",
    name: "Asha",
    tagline: "Warm and steady. A good default for most people.",
    style: "orb",
    palette: { core: "#f0a04b", ring: "#ffb968", glow: "#f0a04b26" },
    persona:
      "Speak warmly and plainly, like a friend who happens to be good with numbers. Keep sentences short. Do not be relentlessly cheerful — if something sounds hard, acknowledge it and move on rather than brightening past it.",
    defaultVoiceId: "Amy",
    suitedTo: ["teen", "adult", "older"],
  },
  {
    id: "vikram",
    portrait: "/portraits/vikram.webp",
    name: "Vikram",
    tagline: "Calm and precise. Explains the numbers properly.",
    style: "lattice",
    palette: { core: "#60a5fa", ring: "#93c5fd", glow: "#60a5fa26" },
    persona:
      "Speak calmly and precisely. When you mention a measurement, say briefly what it is before you say what it means. Prefer being exact over being comforting, but never be cold about it.",
    defaultVoiceId: "Arthur",
    suitedTo: ["adult", "older"],
  },
  {
    id: "tara",
    portrait: "/portraits/tara.webp",
    name: "Tara",
    tagline: "Gentle and unhurried. Made for older users.",
    style: "aurora",
    palette: { core: "#4ade80", ring: "#86efac", glow: "#4ade8026" },
    persona:
      "Speak slowly and gently. Use short, complete sentences and everyday words — never two clauses where one will do. Give the person plenty of room; if they take a while to answer, that is fine and you should not fill the silence. Never rush them and never talk down to them.",
    defaultVoiceId: "Ruth",
    suitedTo: ["older"],
  },
  {
    id: "pip",
    portrait: "/portraits/pip.webp",
    name: "Pip",
    tagline: "Simple and friendly. Made for children.",
    style: "bloom",
    palette: { core: "#f472b6", ring: "#f9a8d4", glow: "#f472b626" },
    persona:
      "You are talking with a child. Use very simple words and short sentences. Be kind and encouraging and a little playful, but never silly about anything to do with feeling unwell. If the child describes anything worrying, tell them clearly and calmly to go and tell a grown-up they trust, right now.",
    defaultVoiceId: "Ivy",
    suitedTo: ["child"],
  },
  {
    id: "kiran",
    portrait: "/portraits/kiran.webp",
    name: "Kiran",
    tagline: "Everyday Indian English. Comfortable with Indian names.",
    style: "wave",
    palette: { core: "#c084fc", ring: "#d8b4fe", glow: "#c084fc26" },
    persona:
      "Speak in natural, everyday Indian English. Pronounce Indian names and places as a matter of course. Keep the register friendly and direct rather than formal.",
    defaultVoiceId: "Kajal",
    suitedTo: ["teen", "adult", "older"],
  },
  {
    id: "nova",
    portrait: "/portraits/nova.webp",
    name: "Nova",
    tagline: "Brisk and to the point. Minimal small talk.",
    style: "prism",
    palette: { core: "#22d3ee", ring: "#67e8f9", glow: "#22d3ee26" },
    persona:
      "Be brisk and efficient. Skip pleasantries, answer what was asked, and stop. One short paragraph at most. Never pad a turn to seem friendlier.",
    defaultVoiceId: "Stephen",
    suitedTo: ["teen", "adult"],
  },
];

export const DEFAULT_AVATAR_ID = "asha";

export function getAvatar(id: string): AvatarPreset | undefined {
  return AVATARS.find((a) => a.id === id);
}

export function avatarOr(id: string | undefined): AvatarPreset {
  return getAvatar(id ?? "") ?? AVATARS[0];
}

/** Avatars offered first for an age band, with the rest following. */
export function avatarsForAge(band: AgeBand): AvatarPreset[] {
  const suited = AVATARS.filter((a) => a.suitedTo.includes(band));
  const rest = AVATARS.filter((a) => !a.suitedTo.includes(band));
  return [...suited, ...rest];
}

/**
 * Voices for a language, ordered by what suits an age band.
 *
 * Language filters rather than sorts. A voice trained on English reading
 * Hindi does not sound like an accent, it sounds like a fault, so offering
 * the wrong-language voices further down the list would only invite someone
 * to pick one.
 */
export function voicesForAge(band: AgeBand, language: string): VoiceOption[] {
  const available = VOICES.filter((v) => v.language === language);
  if (band === "child") {
    return [...available.filter((v) => v.child), ...available.filter((v) => !v.child)];
  }
  if (band === "older") {
    return [...available.filter((v) => v.clear), ...available.filter((v) => !v.clear)];
  }
  return available;
}

export const AGE_BANDS: Array<{ id: AgeBand; label: string; detail: string }> = [
  { id: "child", label: "Child", detail: "Under 13" },
  { id: "teen", label: "Teenager", detail: "13 to 17" },
  { id: "adult", label: "Adult", detail: "18 to 64" },
  { id: "older", label: "Older adult", detail: "65 and over" },
];
