import { describe, expect, it } from "vitest";

import { estimateDurationSeconds, pickVoice } from "@/lib/avatar/browserSpeech";

/**
 * The browser voice cannot be tested by listening to it here, and most of it
 * is the browser's job anyway. What is this project's job is choosing which
 * installed voice to use, and that fails in a way nobody notices: a machine
 * with only `hi-IN` installed, asked for `hi`, either speaks Hindi or reads
 * Hindi text in an American accent, and both of those play a sound.
 */

const voice = (lang: string, name = lang): SpeechSynthesisVoice =>
  ({ lang, name, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

describe("choosing an installed voice", () => {
  it("takes an exact match first", () => {
    const voices = [voice("en-US"), voice("en-GB"), voice("hi-IN")];
    expect(pickVoice("en-GB", voices)?.lang).toBe("en-GB");
  });

  it("is not case sensitive, because platforms disagree about it", () => {
    expect(pickVoice("en-gb", [voice("en-GB")])?.lang).toBe("en-GB");
    expect(pickVoice("en-GB", [voice("en-gb")])?.lang).toBe("en-gb");
  });

  it("accepts the underscore form some platforms report", () => {
    expect(pickVoice("hi-IN", [voice("hi_IN")])?.lang).toBe("hi_IN");
  });

  it("falls back to any voice for the same language", () => {
    // Asking for British English on a machine that has only American should
    // speak, not stay silent.
    expect(pickVoice("en-GB", [voice("fr-FR"), voice("en-US")])?.lang).toBe("en-US");
    expect(pickVoice("hi", [voice("en-US"), voice("hi-IN")])?.lang).toBe("hi-IN");
  });

  it("returns nothing rather than a voice in the wrong language", () => {
    // Silence is recoverable. A Tamil sentence read by a German voice is not
    // speech in any language and tells the listener nothing.
    expect(pickVoice("ta-IN", [voice("de-DE"), voice("en-US")])).toBeNull();
    expect(pickVoice("en-GB", [])).toBeNull();
  });
});

describe("estimating how long a reply takes to say", () => {
  it("grows with the length of the text", () => {
    const short = estimateDurationSeconds("Hello there.", 1);
    const long = estimateDurationSeconds("Hello there. ".repeat(20), 1);
    expect(long).toBeGreaterThan(short * 10);
  });

  it("shortens as the rate rises", () => {
    const text = "Your heart rate is seventy two beats a minute.";
    expect(estimateDurationSeconds(text, 2)).toBeLessThan(estimateDurationSeconds(text, 1));
  });

  it("never returns zero, which would make the mouth finish before it started", () => {
    expect(estimateDurationSeconds("", 1)).toBeGreaterThan(0);
    expect(estimateDurationSeconds("Hi", 100)).toBeGreaterThan(0);
  });
});
