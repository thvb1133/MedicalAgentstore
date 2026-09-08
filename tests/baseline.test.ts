import { describe, expect, it } from "vitest";

import { buildDrift, buildDrifts, usableReports } from "../src/lib/baseline";
import { journalSpeech, weeklyJournal } from "../src/lib/journal";
import type { MeasurementReport } from "../src/lib/report";

const DAY = 86_400_000;
const NOW = Date.parse("2026-03-20T12:00:00.000Z");

function report(options: {
  daysAgo: number;
  heartRate?: number | null;
  sdnn?: number | null;
  quality?: number;
  qualityNote?: string | null;
  extra?: Array<{ label: string; value: number | string | null; unit?: string }>;
}): MeasurementReport {
  return {
    agentSlug: "vitals",
    agentName: "Vitals",
    takenAt: new Date(NOW - options.daysAgo * DAY).toISOString(),
    durationSeconds: 30,
    quality: options.quality ?? 0.8,
    qualityNote: options.qualityNote ?? null,
    metrics: [
      { label: "Heart rate", value: options.heartRate ?? 66, unit: "bpm" },
      { label: "HRV (SDNN)", value: options.sdnn ?? 45, unit: "ms" },
      ...(options.extra ?? []),
    ],
  };
}

/** A fortnight of ordinary readings, one a day, oldest last as stored. */
function fortnight(rates: number[]): MeasurementReport[] {
  return rates.map((heartRate, i) => report({ daysAgo: rates.length - i, heartRate }));
}

describe("personal baseline", () => {
  it("will not build a baseline from too few readings", () => {
    const drift = buildDrift(fortnight([66, 68, 65]), "Heart rate", NOW);
    expect(drift.verdict).toBe("insufficient");
    expect(drift.baseline).toBeNull();
    expect(drift.note).toMatch(/more reading/i);
  });

  it("will not build a baseline from a single sitting", () => {
    // Six readings, all today: plenty of points, no days.
    const sameDay = Array.from({ length: 7 }, () => report({ daysAgo: 0 }));
    const drift = buildDrift(sameDay, "Heart rate", NOW);
    expect(drift.verdict).toBe("insufficient");
    expect(drift.note).toMatch(/more day/i);
  });

  it("calls an ordinary reading ordinary", () => {
    const drift = buildDrift(fortnight([64, 67, 66, 65, 68, 66, 67]), "Heart rate", NOW);
    expect(drift.verdict).toBe("in-range");
    expect(drift.baseline!.centre).toBeCloseTo(66, 0);
    expect(drift.note).toMatch(/within your ordinary range/i);
  });

  it("excludes the reading being judged from its own baseline", () => {
    const drift = buildDrift(fortnight([64, 66, 65, 66, 67, 66, 120]), "Heart rate", NOW);
    // A baseline including the 120 would be dragged upwards and its spread
    // inflated, which is exactly how an outlier hides itself.
    expect(drift.baseline!.centre).toBeLessThan(70);
    expect(drift.verdict).toBe("unusual");
  });

  it("floors the spread at what the measurement can resolve", () => {
    // Implausibly repeatable readings: without a floor, one beat a minute of
    // difference would read as many deviations out.
    const drift = buildDrift(fortnight([66, 66, 66, 66, 66, 66, 69]), "Heart rate", NOW);
    expect(drift.baseline!.spreadIsFloor).toBe(true);
    expect(drift.baseline!.spread).toBe(3);
    expect(drift.verdict).toBe("in-range");
    expect(drift.note).not.toMatch(/tightly clustered/i);
  });

  it("says when a verdict rests on the instrument's error rather than the person", () => {
    const drift = buildDrift(fortnight([66, 66, 66, 66, 66, 66, 78]), "Heart rate", NOW);
    expect(drift.verdict).toBe("unusual");
    expect(drift.note).toMatch(/tightly clustered/i);
  });

  it("gives blood pressure a baseline wide enough to be honest about the method", () => {
    const bp = [118, 120, 119, 121, 118, 120, 126].map((systolic, i, all) =>
      report({
        daysAgo: all.length - i,
        extra: [{ label: "Blood pressure", value: `${systolic}/78`, unit: "mmHg" }],
      }),
    );
    const drift = buildDrift(bp, "Blood pressure", NOW);
    // Eight above the usual is inside camera blood pressure's own error bar.
    expect(drift.baseline!.spread).toBe(10);
    expect(drift.verdict).toBe("in-range");
  });

  it("names a drift without escalating it", () => {
    const drift = buildDrift(fortnight([60, 64, 62, 66, 61, 63, 68]), "Heart rate", NOW);
    expect(drift.verdict).toBe("drifting");
    expect(drift.note).toMatch(/worth noticing, not worth acting on/i);
  });

  it("tells someone to repeat an unusual reading before reading anything into it", () => {
    const drift = buildDrift(fortnight([60, 64, 62, 66, 61, 63, 110]), "Heart rate", NOW);
    expect(drift.verdict).toBe("unusual");
    expect(drift.note).toMatch(/repeat the measurement/i);
  });

  it("keeps unusable readings out of the baseline entirely", () => {
    const noisy = fortnight([64, 66, 65, 66, 67, 66, 66]).map((r, i) =>
      i < 3 ? { ...r, quality: 0.2, metrics: [{ label: "Heart rate", value: 140, unit: "bpm" }] } : r,
    );
    const drift = buildDrift(noisy, "Heart rate", NOW);
    expect(drift.verdict).toBe("insufficient");
    expect(usableReports(noisy)).toHaveLength(4);
  });

  it("ranks the metrics by how far they have moved", () => {
    const reports = [66, 65, 67, 66, 64, 66].map((heartRate, i, all) =>
      report({ daysAgo: all.length - i, heartRate, sdnn: 45 }),
    );
    reports.push(report({ daysAgo: 0, heartRate: 67, sdnn: 120 }));
    const drifts = buildDrifts(reports, ["Heart rate", "HRV (SDNN)"], NOW);
    expect(drifts[0].label).toBe("HRV (SDNN)");
  });

  it("skips metrics that were never measured", () => {
    expect(buildDrifts(fortnight([66, 65]), ["Stress index"], NOW)).toHaveLength(0);
  });
});

describe("weekly journal", () => {
  it("has nothing to say with no history at all", () => {
    expect(weeklyJournal([], NOW)).toBeNull();
  });

  it("says so when a week produced no usable readings", () => {
    const entry = weeklyJournal(
      [report({ daysAgo: 2, quality: 0.2 }), report({ daysAgo: 3, quality: 0.1 })],
      NOW,
    )!;
    expect(entry.sessions).toBe(0);
    expect(entry.discarded).toBe(2);
    expect(entry.headline).toMatch(/nothing measured/i);
    expect(entry.lines[0]).toMatch(/clean enough/i);
  });

  it("counts the week's readings and the days they fell on", () => {
    const entry = weeklyJournal(
      [
        report({ daysAgo: 1 }),
        report({ daysAgo: 1 }),
        report({ daysAgo: 3 }),
        // Outside the window, so it must not be counted.
        report({ daysAgo: 20 }),
      ],
      NOW,
    )!;
    expect(entry.sessions).toBe(3);
    expect(entry.days).toBe(2);
    expect(entry.lines[0]).toMatch(/3 readings over 2 days/);
  });

  it("admits when there is not enough history to know what is usual", () => {
    const entry = weeklyJournal([report({ daysAgo: 1 }), report({ daysAgo: 2 })], NOW)!;
    expect(entry.lines.join(" ")).toMatch(/not enough history/i);
  });

  it("compares the week against everything before it, not against itself", () => {
    const older = [66, 65, 67, 66, 64, 66, 65].map((heartRate, i, all) =>
      report({ daysAgo: 10 + (all.length - i), heartRate }),
    );
    const week = [78, 79, 80].map((heartRate, i) => report({ daysAgo: i + 1, heartRate }));
    const entry = weeklyJournal([...older, ...week], NOW)!;
    const text = entry.lines.join(" ");
    expect(text).toMatch(/Heart rate averaged 79/);
    expect(text).toMatch(/above your usual 66/);
    expect(entry.headline).toMatch(/heart rate/i);
  });

  it("calls a steady week steady", () => {
    const older = [66, 65, 67, 66, 64, 66, 65].map((heartRate, i, all) =>
      report({ daysAgo: 10 + (all.length - i), heartRate }),
    );
    const week = [66, 65, 67, 66].map((heartRate, i) => report({ daysAgo: i + 1, heartRate }));
    const entry = weeklyJournal([...older, ...week], NOW)!;
    expect(entry.headline).toMatch(/steady week/i);
    expect(entry.lines.join(" ")).toMatch(/in line with your usual/);
    expect(entry.drifts).toHaveLength(0);
  });

  it("surfaces a recurring quality problem but not a one-off", () => {
    const twice = weeklyJournal(
      [
        report({ daysAgo: 1, qualityNote: "Lighting is limiting the reading" }),
        report({ daysAgo: 2, qualityNote: "Lighting is limiting the reading" }),
        report({ daysAgo: 3 }),
      ],
      NOW,
    )!;
    expect(twice.lines.join(" ")).toMatch(/holding readings back/i);

    const once = weeklyJournal(
      [report({ daysAgo: 1, qualityNote: "Too much movement" }), report({ daysAgo: 2 })],
      NOW,
    )!;
    expect(once.lines.join(" ")).not.toMatch(/holding readings back/i);
  });

  it("always closes on what the numbers are not", () => {
    const entry = weeklyJournal([report({ daysAgo: 1 })], NOW)!;
    expect(entry.lines[entry.lines.length - 1]).toMatch(/not a diagnosis/i);
  });

  it("reads aloud as one block starting with the headline", () => {
    const entry = weeklyJournal([report({ daysAgo: 1 })], NOW)!;
    const spoken = journalSpeech(entry);
    expect(spoken.startsWith(`Your week: ${entry.headline}.`)).toBe(true);
    expect(spoken).toContain(entry.lines[0]);
  });
});
