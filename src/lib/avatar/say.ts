/**
 * Saying a reply out loud, by whichever means is available.
 *
 * There are two voices in this application and the difference between them is
 * not a detail: Polly is a paid cloud service reached through this project's
 * own server, and `speechSynthesis` is already inside every desktop browser.
 * The published copy has no server, so for most people who will ever open
 * this, the browser voice is the only voice there is.
 *
 * Both are funnelled through one handle so that nothing downstream has to
 * care. The presenter's mouth, the interrupt button and the status line all
 * ask the same three questions — what is being said, how far in are we, how
 * loud is it right now — and get an answer whether the samples came over the
 * network or out of the operating system.
 *
 * Polly is tried first and failure is silent. A missing key, an expired one,
 * a network that dropped: none of those are worth an error message when there
 * is a working voice sitting behind them.
 */

import { speakInBrowser, type SpokenReply } from "./browserSpeech";
import { measureLevel, routeForAnalysis, type AnalysisRef } from "./speechAudio";
import { pollyVoiceId } from "./voices";
import { api } from "@/lib/paths";

export type { SpokenReply } from "./browserSpeech";

export interface SpeakRequest {
  text: string;
  /** The chosen voice, which only means anything to Polly. */
  voiceId?: string;
  /** Speaking speed as a percentage of normal, as the profile stores it. */
  ratePercent?: number;
  /** BCP-47 tag, used to choose an installed voice for the browser path. */
  languageCode?: string;
  /**
   * Whether Polly is configured. False skips the request entirely rather than
   * spending a round trip per turn discovering the same refusal again.
   */
  cloud: boolean;
}

export interface SpeakHandle {
  reply: SpokenReply;
  /** Resolves when the voice stops, whether it finished or was cut off. */
  done: Promise<void>;
}

/** Start speaking, or return null when there is no voice at all. */
export async function speakReply(
  request: SpeakRequest,
  analysis: AnalysisRef,
): Promise<SpeakHandle | null> {
  const text = request.text.trim();
  if (!text) return null;

  if (request.cloud) {
    const cloud = await throughPolly(text, request, analysis);
    if (cloud) return cloud;
  }

  return speakInBrowser(text, {
    languageCode: request.languageCode,
    rate: (request.ratePercent ?? 100) / 100,
  });
}

async function throughPolly(
  text: string,
  request: SpeakRequest,
  analysis: AnalysisRef,
): Promise<SpeakHandle | null> {
  const speakUrl = api("/api/speak");
  if (!speakUrl) return null;

  let blob: Blob;
  try {
    const response = await fetch(speakUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: pollyVoiceId(request.voiceId ?? ""),
        rate: request.ratePercent ?? 100,
      }),
    });
    if (!response.ok) return null;
    blob = await response.blob();
  } catch {
    return null;
  }

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await routeForAnalysis(analysis, audio);

  let settle = () => {};
  const done = new Promise<void>((resolve) => {
    settle = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
  });

  audio.onended = () => settle();
  audio.onerror = () => settle();
  audio.play().catch(() => settle());

  const reply: SpokenReply = {
    text,
    read: () => ({
      time: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : null,
      level: measureLevel(analysis.current),
    }),
    stop: () => {
      audio.pause();
      // Pausing fires nothing, so a cut-off reply would leave whoever is
      // awaiting the turn waiting for a sound that has already stopped.
      settle();
    },
  };

  return { reply, done };
}
