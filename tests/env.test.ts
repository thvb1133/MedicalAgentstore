import { describe, expect, it } from "vitest";

import { readFirst, readSetting } from "@/lib/env";

/**
 * This exists because of a real afternoon lost to it. An AWS key reached the
 * server with a space in front of it, so every check said the service was
 * configured, every request was signed and sent, and Polly answered with a
 * 400 that the SDK reports as "UnknownError". Nothing in that chain mentions
 * whitespace, and the obvious suspect — permissions — is innocent.
 */
describe("reading a setting", () => {
  it("strips the whitespace a pasted credential arrives with", () => {
    expect(readSetting({ KEY: " AKIAEXAMPLE " }, "KEY")).toBe("AKIAEXAMPLE");
    expect(readSetting({ KEY: "secret\n" }, "KEY")).toBe("secret");
    expect(readSetting({ KEY: "\tsk-ant-example" }, "KEY")).toBe("sk-ant-example");
  });

  it("leaves the value itself alone", () => {
    expect(readSetting({ KEY: "sk-ant api03/AB+cd==" }, "KEY")).toBe("sk-ant api03/AB+cd==");
  });

  it("treats a blank value as absent, since that is what was meant", () => {
    expect(readSetting({ KEY: "   " }, "KEY", "fallback")).toBe("fallback");
    expect(readSetting({ KEY: "" }, "KEY", "fallback")).toBe("fallback");
  });

  it("falls back when the variable is not set at all", () => {
    expect(readSetting({}, "KEY", "fallback")).toBe("fallback");
    expect(readSetting({}, "KEY")).toBe("");
  });
});

/**
 * The aliases matter on a host that is itself AWS. Amplify and Lambda fill
 * `AWS_ACCESS_KEY_ID` with the execution role's own credentials, so without a
 * name of our own a deployment signs Polly requests as the platform and fails
 * against a principal nobody configured.
 */
describe("a setting with an alias", () => {
  const names = ["SANJIVANI_AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"];

  it("prefers the name that cannot collide", () => {
    const env = { SANJIVANI_AWS_ACCESS_KEY_ID: "ours", AWS_ACCESS_KEY_ID: "the platform's" };
    expect(readFirst(env, names)).toBe("ours");
  });

  it("uses the plain name everywhere else", () => {
    expect(readFirst({ AWS_ACCESS_KEY_ID: "ours" }, names)).toBe("ours");
  });

  it("skips a name that is set to nothing but whitespace", () => {
    expect(readFirst({ SANJIVANI_AWS_ACCESS_KEY_ID: "  ", AWS_ACCESS_KEY_ID: "ours" }, names)).toBe(
      "ours",
    );
  });

  it("falls back when none of them is set", () => {
    expect(readFirst({}, names, "none")).toBe("none");
    expect(readFirst({}, names)).toBe("");
  });
});
