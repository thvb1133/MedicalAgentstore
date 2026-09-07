import { describe, expect, it } from "vitest";

import { AVATARS, avatarsForAge, getAvatar, voicesForAge } from "@/lib/avatar/presets";
import { defaultProfile, parseProfile, personaInstructions } from "@/lib/avatar/profile";
import { clampRate, getVoice, RATE_MAX, RATE_MIN, VOICES } from "@/lib/avatar/voices";

describe("the catalogue", () => {
  it("gives every avatar a voice that actually exists", () => {
    for (const avatar of AVATARS) {
      expect(getVoice(avatar.defaultVoiceId), `${avatar.id} -> ${avatar.defaultVoiceId}`)
        .toBeDefined();
    }
  });

  it("has no duplicate ids", () => {
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(new Set(VOICES.map((v) => v.id)).size).toBe(VOICES.length);
  });

  it("offers every avatar for every age, just in a different order", () => {
    for (const band of ["child", "teen", "adult", "older"] as const) {
      expect(avatarsForAge(band)).toHaveLength(AVATARS.length);
      expect(voicesForAge(band)).toHaveLength(VOICES.length);
    }
  });

  it("puts the child voice first for a child and a clear voice first for an elder", () => {
    expect(voicesForAge("child")[0].child).toBe(true);
    expect(voicesForAge("older")[0].clear).toBe(true);
    expect(avatarsForAge("child")[0].suitedTo).toContain("child");
  });
});

describe("parseProfile", () => {
  it("falls back to defaults for junk", () => {
    const profile = parseProfile("not an object");
    expect(getAvatar(profile.avatarId)).toBeDefined();
    expect(getVoice(profile.voiceId)).toBeDefined();
  });

  it("keeps values it recognises", () => {
    const profile = parseProfile({
      displayName: "Meera",
      ageBand: "older",
      avatarId: "tara",
      voiceId: "Kajal",
      speechRate: 80,
      captions: "on",
      simpleLanguage: true,
    });
    expect(profile.displayName).toBe("Meera");
    expect(profile.ageBand).toBe("older");
    expect(profile.avatarId).toBe("tara");
    expect(profile.voiceId).toBe("Kajal");
    expect(profile.speechRate).toBe(80);
    expect(profile.simpleLanguage).toBe(true);
  });

  it("replaces a retired avatar id with the default", () => {
    // A stored id from an older build must not leave the picker with nothing
    // selected and the presence with no palette.
    const profile = parseProfile({ avatarId: "avatar-that-no-longer-exists" });
    expect(getAvatar(profile.avatarId)).toBeDefined();
  });

  it("replaces a retired voice with the chosen avatar's own", () => {
    const profile = parseProfile({ avatarId: "pip", voiceId: "GoneVoice" });
    expect(profile.voiceId).toBe(getAvatar("pip")!.defaultVoiceId);
  });

  it("clamps an out-of-range speaking rate", () => {
    expect(parseProfile({ speechRate: 5 }).speechRate).toBe(RATE_MIN);
    expect(parseProfile({ speechRate: 900 }).speechRate).toBe(RATE_MAX);
    expect(clampRate(Number.NaN)).toBe(100);
  });

  it("forces large captions when access mode is on", () => {
    // A setting that silently contradicts itself is worse than no setting.
    const profile = parseProfile({ accessMode: true, captions: "off" });
    expect(profile.captions).toBe("large");
  });

  it("rejects a profile id the history route would refuse", () => {
    const bad = parseProfile({ profileId: "SHOUTING WITH SPACES!" });
    expect(bad.profileId).toMatch(/^[a-z0-9-]{8,64}$/);

    const good = parseProfile({ profileId: "abcdef0123456789" });
    expect(good.profileId).toBe("abcdef0123456789");
  });

  it("truncates an over-long display name", () => {
    expect(parseProfile({ displayName: "n".repeat(500) }).displayName.length).toBe(40);
  });

  it("generates a distinct id per profile", () => {
    expect(defaultProfile().profileId).not.toBe(defaultProfile().profileId);
  });
});

describe("personaInstructions", () => {
  it("names the avatar and carries its manner", () => {
    const text = personaInstructions(parseProfile({ avatarId: "vikram" }));
    expect(text).toContain("Vikram");
    expect(text).toMatch(/precise/i);
  });

  it("passes on the preferred name only when there is one", () => {
    expect(personaInstructions(parseProfile({ displayName: "Ravi" }))).toContain("Ravi");
    expect(personaInstructions(parseProfile({ displayName: "   " }))).not.toMatch(
      /prefers to be called/,
    );
  });

  it("tells the model to send a child to an adult", () => {
    const text = personaInstructions(parseProfile({ ageBand: "child" }));
    expect(text).toMatch(/trusted adult/i);
  });

  it("warns against condescension for older adults", () => {
    expect(personaInstructions(parseProfile({ ageBand: "older" }))).toMatch(
      /condescension/i,
    );
  });

  it("stops the model referring to sound when replies are only read", () => {
    const text = personaInstructions(parseProfile({ accessMode: true }));
    expect(text).toMatch(/never refer to hearing you/i);
    expect(text).toMatch(/typing/i);
  });

  it("asks for plain language when requested", () => {
    expect(personaInstructions(parseProfile({ simpleLanguage: true }))).toMatch(
      /short sentences/i,
    );
  });
});
