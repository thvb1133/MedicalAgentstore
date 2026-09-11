import { describe, expect, it } from "vitest";

import { guideReply } from "@/lib/guide";
import type { LiveContext, VitalsContext } from "@/lib/conversation";

/**
 * The scripted guide is what answers when there is no model, which makes it
 * the only part of the conversation whose every possible reply can be read in
 * advance. So these tests are about the two promises it makes rather than
 * about phrasing: it always says it is scripted, and it never interprets a
 * measurement for anybody.
 */

const VITALS: VitalsContext = {
  heartRateBpm: 71.6,
  breathingRateBpm: 14.1,
  hrvSdnnMs: 44.2,
  stressIndex: 0.3,
  bloodPressure: { systolic: 118, diastolic: 76, uncertainty: 9 },
  bloodPressureStatus: "ok",
  quality: 0.81,
  limiting: null,
};

const context = (over: Partial<VitalsContext> = {}): LiveContext => ({
  vitals: { ...VITALS, ...over },
  voice: null,
  sessionSeconds: 40,
});

const QUESTIONS = [
  "what does my heart rate mean",
  "can you check my blood pressure",
  "why is the confidence low",
  "is my data uploaded anywhere",
  "how accurate is this",
  "tell me about hrv",
  "wgat is teh weather",
];

describe("the scripted guide", () => {
  it("says it is scripted in every reply, including the fallback", () => {
    for (const question of QUESTIONS) {
      expect(guideReply(question).text.startsWith("Scripted guide:")).toBe(true);
    }
  });

  it("matches a topic when one is asked about, and admits it when none is", () => {
    expect(guideReply("what is hrv").matched).toBe(true);
    expect(guideReply("who won the cup final in 1994").matched).toBe(false);
  });

  it("prefers the specific topic over the general one it contains", () => {
    // "blood pressure" contains no other cue, but "bp" would also match a
    // loose search for "b". The ordering is what keeps these apart.
    expect(guideReply("what about my bp").text).toContain("cuff");
    expect(guideReply("what is my heart rate").text).toContain("beats");
  });

  it("sends anybody in crisis to a person rather than answering", () => {
    const reply = guideReply("i have chest pain and cannot breathe").text;
    expect(reply).toContain("emergency");
    expect(reply.toLowerCase()).toContain("stop using this");
  });

  it("refuses to diagnose", () => {
    const reply = guideReply("do i have heart disease").text.toLowerCase();
    expect(reply).toContain("cannot tell you");
    expect(reply).toContain("clinician");
  });

  /**
   * The one place it touches real numbers. It may state them and must not
   * characterise them — no "healthy", no "normal", no "a little high" — since
   * a lookup table has no idea whose body it is talking about.
   */
  it("reads the live numbers back without judging them", () => {
    const reply = guideReply("what are my readings right now", context()).text;
    expect(reply).toContain("72 beats per minute");
    expect(reply).toContain("118 over 76");
    expect(reply).toMatch(/not able to interpret/i);
    expect(reply.toLowerCase()).not.toMatch(/normal|healthy|fine|high|low|good|concern/);
  });

  it("says nothing is measurable rather than reading out a bad signal", () => {
    const reply = guideReply("what are my numbers", context({ quality: 0.05 })).text;
    expect(reply).not.toMatch(/\d+ beats/);
    expect(reply).toContain("Nothing is measurable yet");
  });

  it("does not invent numbers when no measurement is running", () => {
    const reply = guideReply("show me my current vitals").text;
    expect(reply).not.toMatch(/\d+ beats/);
  });

  it("names the missing key when asked why it cannot talk properly", () => {
    expect(guideReply("why can't you talk").text).toContain("Anthropic");
  });
});
