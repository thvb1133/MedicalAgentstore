/**
 * The voice of last resort: the one already in the browser.
 *
 * Polly is better and is used whenever it is configured. But a published copy
 * of this application has no server and therefore no AWS credentials, and an
 * avatar that cannot say anything at all is not a lesser version of the
 * feature — it is the feature missing. Every desktop browser ships a speech
 * synthesiser; it is free, offline, and available in most of the languages
 * offered here.
 *
 * The awkward part is the mouth. The Polly path routes the audio through a
 * Web Audio analyser and drives the presenter's jaw from the measured
 * loudness, and `speechSynthesis` gives no audio stream to measure — the
 * samples go straight to the sound card. What it does give, in Chrome and
 * Safari, is a `boundary` event as each word begins. That is enough: a pulse
 * per word, decaying between them, is a far better approximation of a talking
 * mouth than a constant level, and it is honest about the one thing lip-sync
 * has to get right, which is when the mouth moves rather than how much.
 */

/** What anything animating in time with the voice needs to know. */
export interface SpeechClock {
  /** Seconds since this reply started. */
  time: number;
  /** Total length in seconds, or null while it is not yet known. */
  duration: number | null;
  /** 0-1 loudness, or null when it cannot be measured at all. */
  level: number | null;
}

export interface SpokenReply {
  text: string;
  read(): SpeechClock;
  stop(): void;
}

/** Words a minute, roughly, for ordinary synthesised speech at rate 1. */
const WORDS_PER_SECOND = 2.6;

/** How long a word's pulse takes to decay. About one syllable. */
const PULSE_MS = 170;

export function browserSpeechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Pick the closest installed voice for a BCP-47 tag.
 *
 * Exact match first, then the bare language. Falling back to the language
 * alone matters more than it looks: a machine with only `hi-IN` installed
 * should still speak Hindi when the app asks for `hi`, and a machine with
 * only `en-US` should not be silent because the profile said `en-GB`.
 */
export function pickVoice(
  languageCode: string,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const wanted = languageCode.toLowerCase();
  const base = wanted.split("-")[0];

  return (
    voices.find((v) => v.lang.toLowerCase() === wanted) ??
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === wanted) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(`${base}-`)) ??
    voices.find((v) => v.lang.toLowerCase() === base) ??
    null
  );
}

export function estimateDurationSeconds(text: string, rate: number): number {
  const words = Math.max(1, text.trim().split(/\s+/).length);
  return words / (WORDS_PER_SECOND * Math.max(0.3, rate));
}

/**
 * Speak, and hand back a handle that reports where the voice has got to.
 *
 * Returns null when the browser has no synthesiser, so callers can decide
 * between silence and refusing the turn rather than having it decided here.
 */
export function speakInBrowser(
  text: string,
  options: { languageCode?: string; rate?: number } = {},
): { reply: SpokenReply; done: Promise<void> } | null {
  if (!browserSpeechAvailable()) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const synth = window.speechSynthesis;
  const rate = clampRate(options.rate ?? 1);
  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.rate = rate;

  if (options.languageCode) {
    utterance.lang = options.languageCode;
    const voice = pickVoice(options.languageCode, synth.getVoices());
    if (voice) utterance.voice = voice;
  }

  const startedAt = performance.now();
  let lastBoundary = startedAt;
  let sawBoundary = false;
  let finished = false;

  utterance.onboundary = () => {
    sawBoundary = true;
    lastBoundary = performance.now();
  };

  const done = new Promise<void>((resolve) => {
    const settle = () => {
      finished = true;
      resolve();
    };
    utterance.onend = settle;
    utterance.onerror = settle;
  });

  const reply: SpokenReply = {
    text: trimmed,
    read() {
      const now = performance.now();
      return {
        time: (now - startedAt) / 1000,
        duration: estimateDurationSeconds(trimmed, rate),
        level: finished ? 0 : level(now, lastBoundary, sawBoundary),
      };
    },
    stop() {
      finished = true;
      try {
        synth.cancel();
      } catch {
        // Nothing to cancel.
      }
    },
  };

  // Chrome will not start a queued utterance if a cancelled one is still
  // settling, and the symptom is a mouth that moves in silence.
  synth.cancel();
  synth.speak(utterance);

  return { reply, done };
}

function clampRate(rate: number): number {
  return Math.min(2, Math.max(0.5, rate));
}

function level(now: number, lastBoundary: number, sawBoundary: boolean): number {
  if (!sawBoundary) {
    // Firefox fires no boundary events. A slow oscillation is not lip-sync,
    // but it reads as speech rather than as a frozen face.
    return 0.5 + 0.2 * Math.sin((now / 220) * Math.PI);
  }
  const since = now - lastBoundary;
  return 0.3 + 0.6 * Math.exp(-since / PULSE_MS);
}
