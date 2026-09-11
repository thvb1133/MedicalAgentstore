import { describe, expect, it } from "vitest";

import { readSetting } from "@/lib/env";

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
