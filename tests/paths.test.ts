import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { api, asset, BASE_PATH, STATIC_BUILD } from "../src/lib/paths";

/**
 * The failure this guards against is silent and total.
 *
 * Under a base path, a hard-coded "/mediapipe/models/face_landmarker.task"
 * still parses, still type-checks, still renders — and returns 404, so every
 * camera feature on a published site does nothing while the pages look
 * perfect. Nothing in the build catches it, and neither does a unit test of
 * any individual module, because each one is correct in isolation.
 *
 * So this walks the source instead, and fails on any absolute path into
 * `public/` or `/api/` that was written as a bare string.
 */
const PUBLIC_PREFIXES = ["mediapipe", "portraits", "audio", "api"];
const WRAPPERS = ["asset(", "api(", "publicPath(", "assetPath("];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("public paths", () => {
  it("prefixes assets and routes with the base path", () => {
    expect(asset("/portraits/maya.webp")).toBe(`${BASE_PATH}/portraits/maya.webp`);
    expect(asset("portraits/maya.webp")).toBe(`${BASE_PATH}/portraits/maya.webp`);
  });

  it("returns a usable route in a build that has a server", () => {
    // The test environment is not a static build, so the API is present.
    expect(STATIC_BUILD).toBe(false);
    expect(api("/api/speak")).toBe(`${BASE_PATH}/api/speak`);
  });

  it("is used everywhere an absolute public path is written", () => {
    const offenders: string[] = [];
    const pattern = new RegExp(`["\`](/(?:${PUBLIC_PREFIXES.join("|")})/[^"\`$]*)["\`]`, "g");

    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      if (file.endsWith(join("lib", "paths.ts"))) continue;
      // Route handlers are files on disk under src/app/api, not URLs.
      if (file.includes(join("app", "api"))) continue;

      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;

        for (const match of line.matchAll(pattern)) {
          const before = line.slice(0, match.index ?? 0);
          if (WRAPPERS.some((wrapper) => before.endsWith(wrapper))) continue;
          offenders.push(`${file.replace(process.cwd(), ".")}: ${trimmed}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
