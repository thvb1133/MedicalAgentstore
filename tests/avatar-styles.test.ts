import { describe, expect, it } from "vitest";

import { AVATARS } from "@/lib/avatar/presets";

/**
 * The picker's whole premise is that these are six different things rather
 * than one thing in six colours, and the copy above the grid says so out
 * loud. A shared silhouette would quietly make that claim false, and it is
 * the kind of regression that arrives by adding a seventh avatar and reaching
 * for the nearest existing style.
 */
describe("avatar silhouettes", () => {
  it("gives every avatar its own shape", () => {
    const styles = AVATARS.map((a) => a.style);
    expect(new Set(styles).size).toBe(AVATARS.length);
  });

  it("gives every avatar its own palette", () => {
    const cores = AVATARS.map((a) => a.palette.core);
    expect(new Set(cores).size).toBe(AVATARS.length);
  });

  it("keeps the persona about manner, not about expertise", () => {
    // A persona that claimed clinical standing would borrow authority the
    // system does not have, which the system prompt could not fully undo.
    for (const avatar of AVATARS) {
      expect(avatar.persona).not.toMatch(/doctor|nurse|clinician|physician|diagnos/i);
    }
  });
});
