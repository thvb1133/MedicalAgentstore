import { describe, expect, it } from "vitest";

import {
  ACCEPTED_TYPES,
  cropBox,
  MAX_UPLOAD_BYTES,
  PORTRAIT_HEIGHT,
  PORTRAIT_WIDTH,
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

const ASPECT = PORTRAIT_WIDTH / PORTRAIT_HEIGHT;

describe("cropBox", () => {
  it("takes the largest four-by-three window that fits", () => {
    // Landscape wider than 4:3: full height, trimmed at the sides.
    expect(cropBox(1000, 600)).toMatchObject({ w: 800, h: 600 });
    // Anything taller than 4:3: full width, trimmed top and bottom.
    expect(cropBox(600, 1000)).toMatchObject({ w: 600, h: 450 });
  });

  it("always produces the aspect the tile expects", () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [100, 4000],
      [4000, 100],
      [800, 800],
    ]) {
      const box = cropBox(w, h);
      expect(box.w / box.h, `${w}x${h}`).toBeCloseTo(ASPECT, 6);
    }
  });

  it("centres the crop on a landscape image", () => {
    const box = cropBox(1000, 600);
    expect(box.x).toBe(100);
    expect(box.y).toBe(0);
  });

  it("biases upward on a portrait image so the chin stays in frame", () => {
    // A phone portrait is 3:4 with the face in the upper half. A centred
    // crop of one takes the chin off.
    const box = cropBox(600, 1000);
    expect(box.y).toBeLessThan((1000 - 450) / 2);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  it("never crops outside the source", () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [100, 4000],
      [4000, 100],
      [800, 800],
    ]) {
      const box = cropBox(w, h);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(w + 1e-9);
      expect(box.y + box.h).toBeLessThanOrEqual(h + 1e-9);
    }
  });
});

describe("portraits", () => {
  it("gives every avatar one", () => {
    for (const avatar of AVATARS) {
      expect(avatar.portrait, avatar.id).toMatch(/^\/portraits\/[a-z.]+\.webp$/);
    }
  });

  it("does not reuse a face between two avatars", () => {
    const portraits = AVATARS.map((a) => a.portrait);
    expect(new Set(portraits).size).toBe(portraits.length);
  });

  it("stores at a size that suits a retina presenter tile", () => {
    // The tile is around 320 CSS pixels wide; anything smaller is visibly
    // soft on a 2x display, and much larger will not fit in localStorage.
    expect(PORTRAIT_WIDTH).toBeGreaterThanOrEqual(320 * 1.5);
    expect(PORTRAIT_WIDTH).toBeLessThanOrEqual(1024);
    expect(ASPECT).toBeCloseTo(4 / 3, 6);
  });
});
