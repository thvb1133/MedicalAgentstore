import { describe, expect, it } from "vitest";

import {
  QUICK_REPLIES,
  SwitchInput,
  type SwitchFrame,
  type SwitchOption,
  type SwitchState,
} from "../src/lib/access/switch";

const OPEN_EAR = 0.3;
const OPTIONS: SwitchOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "help", label: "Help" },
];

/**
 * Feed frames at 30 fps and collect what came back.
 *
 * `at` describes the eyes at a given moment: how open they are and where they
 * are looking, both in the units the face mesh produces.
 */
function drive(
  input: SwitchInput,
  seconds: number,
  at: (t: number) => { ear?: number | null; gaze?: number },
  startAt = 0,
): { states: SwitchState[]; taken: SwitchOption[]; endMs: number } {
  const states: SwitchState[] = [];
  const taken: SwitchOption[] = [];
  let t = startAt;
  for (let i = 0; i < seconds * 30; i++) {
    t = startAt + (i / 30) * 1000;
    const eyes = at((t - startAt) / 1000);
    const frame: SwitchFrame = {
      timestampMs: t,
      ear: eyes.ear === undefined ? OPEN_EAR : eyes.ear,
      gazeX: eyes.gaze ?? 0,
    };
    const state = input.push(frame);
    states.push(state);
    if (state.chosen) taken.push(state.chosen);
  }
  return { states, taken, endMs: t };
}

function calibrated(mode: "scan" | "gaze" = "scan"): { input: SwitchInput; endMs: number } {
  const input = new SwitchInput({ mode });
  input.setOptions(OPTIONS);
  // Eyes open, looking ahead, long enough to learn the baseline.
  const { endMs } = drive(input, 3, () => ({}));
  return { input, endMs };
}

describe("eye switch", () => {
  it("learns the open-eye baseline before accepting anything", () => {
    const input = new SwitchInput();
    input.setOptions(OPTIONS);
    const early = drive(input, 1, () => ({}));
    expect(early.states[early.states.length - 1].ready).toBe(false);
    expect(early.states[early.states.length - 1].prompt).toMatch(/eyes open/i);
    expect(early.taken).toHaveLength(0);
  });

  it("ignores an ordinary blink", () => {
    const { input, endMs } = calibrated();
    // A 200 ms closure, which is a normal spontaneous blink.
    const { taken } = drive(input, 2, (t) => ({ ear: t > 0.5 && t < 0.7 ? 0.1 : OPEN_EAR }), endMs);
    expect(taken).toHaveLength(0);
  });

  it("takes the highlighted choice on a deliberate closure", () => {
    const { input, endMs } = calibrated();
    const { taken } = drive(input, 2, (t) => ({ ear: t > 0.3 && t < 1.2 ? 0.1 : OPEN_EAR }), endMs);
    expect(taken).toHaveLength(1);
    expect(taken[0].id).toBe("yes");
  });

  it("steps the highlight along on a timer while scanning", () => {
    const { input, endMs } = calibrated();
    const { states } = drive(input, 4, () => ({}), endMs);
    const seen = new Set(states.map((s) => s.focus));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("stops the highlight moving the moment the eyes shut", () => {
    const { input, endMs } = calibrated();
    // Shut the eyes right through what would have been two scan steps.
    const { states, taken } = drive(
      input,
      5,
      (t) => ({ ear: t > 0.2 ? 0.1 : OPEN_EAR }),
      endMs,
    );
    expect(taken).toHaveLength(1);
    // Whatever was lit when the eyes closed is what got taken, not whatever
    // the timer would have moved on to.
    expect(taken[0].id).toBe(OPTIONS[states[0].focus].id);
  });

  it("does not take the same choice twice from one long closure", () => {
    const { input, endMs } = calibrated();
    const { taken } = drive(input, 4, () => ({ ear: 0.1 }), endMs);
    expect(taken).toHaveLength(1);
  });

  it("treats a lost face as neither a blink nor a choice", () => {
    const { input, endMs } = calibrated();
    const { taken, states } = drive(input, 3, () => ({ ear: null }), endMs);
    expect(taken).toHaveLength(0);
    expect(states[states.length - 1].prompt).toMatch(/camera/i);
  });

  it("moves the highlight on a glance and takes it on a steady gaze", () => {
    const { input, endMs } = calibrated("gaze");
    const { taken, states } = drive(
      input,
      3,
      (t) => ({ gaze: t < 0.4 ? 0.6 : 0 }),
      endMs,
    );
    // One glance right moves from the first choice to the second, then
    // looking ahead for the dwell period takes it.
    expect(states.some((s) => s.focus === 1)).toBe(true);
    expect(taken[0].id).toBe("no");
  });

  it("does not run the highlight along the list while a glance is held", () => {
    const { input, endMs } = calibrated("gaze");
    const { states } = drive(input, 2, () => ({ gaze: 0.6 }), endMs);
    expect(new Set(states.map((s) => s.focus))).toEqual(new Set([1]));
  });

  it("goes back on a glance the other way", () => {
    const { input, endMs } = calibrated("gaze");
    const walked = drive(input, 0.5, () => ({ gaze: 0.6 }), endMs);
    const back = drive(input, 0.5, () => ({ gaze: -0.6 }), walked.endMs + 33);
    expect(back.states[back.states.length - 1].focus).toBe(0);
  });

  it("wraps around rather than stopping at the end of the list", () => {
    const { input, endMs } = calibrated("gaze");
    let at = endMs;
    for (let i = 0; i < 3; i++) {
      at = drive(input, 0.3, () => ({ gaze: 0.6 }), at + 33).endMs;
      at = drive(input, 0.3, () => ({ gaze: 0 }), at + 33).endMs;
    }
    // Three moves through three options lands back where it started.
    expect(input.push({ timestampMs: at + 33, ear: OPEN_EAR, gazeX: 0 }).focus).toBe(0);
  });

  it("starts from the top when the options change", () => {
    const { input, endMs } = calibrated();
    drive(input, 4, () => ({}), endMs);
    input.setOptions([{ id: "a", label: "A" }]);
    expect(input.push({ timestampMs: endMs + 5000, ear: OPEN_EAR, gazeX: 0 }).focus).toBe(0);
  });

  it("has nothing to say with an empty board", () => {
    const { input, endMs } = calibrated();
    input.setOptions([]);
    const state = input.push({ timestampMs: endMs + 100, ear: OPEN_EAR, gazeX: 0 });
    expect(state.chosen).toBeNull();
    expect(state.prompt).toMatch(/nothing to choose/i);
  });

  it("relearns the baseline after a reset", () => {
    const { input, endMs } = calibrated();
    input.reset();
    const state = input.push({ timestampMs: endMs + 100, ear: OPEN_EAR, gazeX: 0 });
    expect(state.ready).toBe(false);
  });

  it("offers answers a person actually needs, short enough to scan", () => {
    expect(QUICK_REPLIES.length).toBeLessThanOrEqual(6);
    expect(QUICK_REPLIES.map((o) => o.id)).toContain("yes");
    expect(QUICK_REPLIES.map((o) => o.id)).toContain("help");
    for (const option of QUICK_REPLIES) expect(option.label.length).toBeLessThan(20);
  });
});
