import { describe, expect, it } from "vitest";

import {
  ACCEPTED_TYPES,
  cropBox,
  MAX_UPLOAD_BYTES,
  PORTRAIT_SIZE,
  validateFile,
} from "@/lib/avatar/portrait";
import { AVATARS } from "@/lib/avatar/presets";

function fakeFile(type: string, size: number): File {
  return { type, size, name: "photo" } as File;
}

describe("validateFile", () => {
  it("accepts the formats a phone actually produces", () => {
    for (const type of ACCEPTED_TYPES) {
      expect(validateFile(fakeFile(type, 1024)), type).toBeNull();
    }
  });

  it("rejects anything that is not an image it can decode", () => {
    expect(validateFile(fakeFile("application/pdf", 1024))).not.toBeNull();
    expect(validateFile(fakeFile("image/heic", 1024))).not.toBeNull();
  });

  it("rejects a file too large to re-encode comfortably", () => {
    expect(validateFile(fakeFile("image/jpeg", MAX_UPLOAD_BYTES + 1))).not.toBeNull();
    expect(validateFile(fakeFile("image/jpeg", MAX_UPLOAD_BYTES - 1))).toBeNull();
  });

  it("explains what to do rather than just refusing", () => {
    expect(validateFile(fakeFile("application/pdf", 10))?.message).toMatch(/JPEG|PNG|WebP/);
    expect(validateFile(fakeFile("image/jpeg", 1e9))?.message).toMatch(/smaller/i);
  });
});

describe("cropBox", () => {
  it("takes the largest square that fits", () => {
    expect(cropBox(1000, 600).size).toBe(600);
    expect(cropBox(600, 1000).size).toBe(600);
  });

  it("centres the crop on a landscape image", () => {
    const box = cropBox(1000, 600);
    expect(box.x).toBe(200);
    expect(box.y).toBe(0);
  });

  it("biases upward on a portrait image so the chin stays in frame", () => {
    // A phone portrait is 3:4 with the face in the upper half. A centred
    // crop of one takes the chin off.
    const box = cropBox(600, 1000);
    expect(box.y).toBeLessThan((1000 - 600) / 2);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  it("leaves a square image alone", () => {
    expect(cropBox(800, 800)).toEqual({ x: 0, y: 0, size: 800 });
  });

  it("never crops outside the source", () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [100, 4000],
      [4000, 100],
    ]) {
      const box = cropBox(w, h);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.size).toBeLessThanOrEqual(w);
      expect(box.y + box.size).toBeLessThanOrEqual(h);
    }
  });
});

describe("portraits", () => {
  it("gives every avatar one", () => {
    for (const avatar of AVATARS) {
      expect(avatar.portrait, avatar.id).toMatch(/^\/portraits\/[a-z]+\.webp$/);
    }
  });

  it("does not reuse a face between two avatars", () => {
    const portraits = AVATARS.map((a) => a.portrait);
    expect(new Set(portraits).size).toBe(portraits.length);
  });

  it("stores at a size that suits a retina portrait frame", () => {
    // The frame is around 300 CSS pixels; anything smaller is visibly soft on
    // a 2x display, and much larger will not fit in localStorage.
    expect(PORTRAIT_SIZE).toBeGreaterThanOrEqual(300 * 1.25);
    expect(PORTRAIT_SIZE).toBeLessThanOrEqual(512);
  });
});
