import { describe, expect, it } from "vitest";

import { AVATARS, avatarsForAge, getAvatar, voicesForAge } from "@/lib/avatar/presets";
import { defaultProfile, parseProfile, personaInstructions } from "@/lib/avatar/profile";
import { LANGUAGES, languageInstructions, languageOr } from "@/lib/avatar/languages";
import {
  clampRate,
  getVoice,
  pollyVoiceId,
  RATE_MAX,
  RATE_MIN,
  voiceForLanguage,
  voicesForLanguage,
  VOICES,
} from "@/lib/avatar/voices";

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
    }
  });

  it("puts the child voice first for a child and a clear voice first for an elder", () => {
    expect(voicesForAge("child", "en-US")[0].child).toBe(true);
    expect(voicesForAge("older", "en-GB")[0].clear).toBe(true);
    expect(avatarsForAge("child")[0].suitedTo).toContain("child");
  });

  it("only offers voices that speak the chosen language", () => {
    // A voice reading a language it was not trained on does not sound
    // accented, it sounds broken, so the wrong ones must not be reachable.
    for (const language of LANGUAGES) {
      for (const voice of voicesForAge("adult", language.code)) {
        expect(voice.language, voice.id).toBe(language.code);
      }
    }
  });

  it("has a voice for every language it offers", () => {
    // A language in the picker with no voice behind it is a language that
    // half works, which is worse than not offering it.
    for (const language of LANGUAGES) {
      expect(voicesForLanguage(language.code), language.name).not.toHaveLength(0);
    }
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

  it("replaces a retired voice with one that speaks the chosen language", () => {
    // An avatar's own voice is the first candidate, but the language wins:
    // Pip's default is a US child voice, and a profile set to British
    // English has to end up with a British voice rather than that one.
    const profile = parseProfile({ avatarId: "pip", voiceId: "GoneVoice" });
    expect(getVoice(profile.voiceId)?.language).toBe(profile.languageCode);
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

describe("languages", () => {
  it("keeps codes unique and well formed", () => {
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(LANGUAGES.length);
    for (const language of LANGUAGES) {
      expect(language.code, language.name).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);
    }
  });

  it("names each language the way its speakers name it", () => {
    // Someone looking for their own language scans for the word they call
    // it, not the English name for it.
    expect(languageOr("hi-IN").endonym).toBe("हिन्दी");
    expect(languageOr("ja-JP").endonym).toBe("日本語");
  });

  it("falls back to English for an unknown code", () => {
    expect(languageOr("xx-XX").code).toBe("en-GB");
  });

  it("tells the model to answer in the chosen language, in its own script", () => {
    const hindi = languageInstructions("hi-IN");
    expect(hindi).toMatch(/Hindi/);
    expect(hindi).toMatch(/not in transliteration/i);
  });

  it("tells the model to hold the language when English words creep in", () => {
    // Medical vocabulary travels in English; mixing it in is not a request
    // to switch the whole conversation.
    expect(languageInstructions("ta-IN")).toMatch(/even when the person uses English/i);
    expect(languageInstructions("hi-IN")).toMatch(/even when the person uses English/i);
  });

  it("keeps measurements as digits and units in every language", () => {
    for (const language of LANGUAGES) {
      const instruction = languageInstructions(language.code);
      if (language.code.startsWith("en-")) continue;
      expect(instruction, language.name).toMatch(/72 bpm/);
    }
  });

  it("picks the right spelling convention for each English", () => {
    expect(languageInstructions("en-US")).toMatch(/American spelling/);
    expect(languageInstructions("en-GB")).toMatch(/British spelling/);
    expect(languageInstructions("en-IN")).toMatch(/Indian names/);
  });

  it("still answers in English when English is chosen and another is spoken", () => {
    expect(languageInstructions("en-GB")).toMatch(/still reply in English/i);
  });
});

describe("voices and languages together", () => {
  it("moves to a voice that speaks the new language", () => {
    expect(voiceForLanguage("hi-IN", "Amy")).not.toBe("Amy");
    expect(getVoice(voiceForLanguage("hi-IN", "Amy"))?.language).toBe("hi-IN");
  });

  it("keeps a voice that already speaks it", () => {
    expect(voiceForLanguage("en-GB", "Arthur")).toBe("Arthur");
  });

  it("maps a catalogue key to the name Polly knows", () => {
    // Polly's Kajal is bilingual and appears under two languages, so the
    // catalogue key and the Polly voice name cannot always be the same.
    expect(pollyVoiceId("Kajal-hi")).toBe("Kajal");
    expect(pollyVoiceId("Amy")).toBe("Amy");
  });

  it("changing language in a stored profile carries the voice with it", () => {
    const profile = parseProfile({ ...defaultProfile(), languageCode: "ja-JP", voiceId: "Amy" });
    expect(getVoice(profile.voiceId)?.language).toBe("ja-JP");
  });

  it("puts the language instruction into the persona", () => {
    const persona = personaInstructions({ ...defaultProfile(), languageCode: "es-ES" });
    expect(persona).toMatch(/Spanish/);
  });
});

describe("migrating a profile written before languages existed", () => {
  it("takes the language from the voice that was chosen", () => {
    // The voice is the only record of what the person actually picked.
    // Resetting to the default would quietly take it away from them.
    const profile = parseProfile({ voiceId: "Kajal", avatarId: "tara" });
    expect(profile.languageCode).toBe("en-IN");
    expect(profile.voiceId).toBe("Kajal");
  });

  it("falls back to the default when there is no voice either", () => {
    expect(parseProfile({}).languageCode).toBe("en-GB");
  });

  it("lets an explicit language override the voice's", () => {
    const profile = parseProfile({ languageCode: "fr-FR", voiceId: "Kajal" });
    expect(profile.languageCode).toBe("fr-FR");
    expect(getVoice(profile.voiceId)?.language).toBe("fr-FR");
  });
});
