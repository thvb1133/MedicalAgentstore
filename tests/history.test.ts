import { describe, expect, it } from "vitest";

import {
  buildTrend,
  buildTrends,
  groupByAgent,
  mergeReports,
  parseReports,
  sortNewestFirst,
} from "@/lib/history";
import type { MeasurementReport } from "@/lib/report";

function report(
  takenAt: string,
  metrics: Array<[string, number | string | null, string?]>,
  quality = 0.8,
  agentSlug = "vitals",
): MeasurementReport {
  return {
    agentSlug,
    agentName: agentSlug === "vitals" ? "Contactless Vitals" : "Companion",
    takenAt,
    durationSeconds: 45,
    quality,
    qualityNote: null,
    metrics: metrics.map(([label, value, unit]) => ({ label, value, unit })),
  };
}

describe("merging history", () => {
  it("removes the duplicates that come from having two stores", () => {
    const local = [report("2026-03-01T09:00:00Z", [["Heart rate", 70, "bpm"]])];
    const remote = [
      report("2026-03-01T09:00:00Z", [["Heart rate", 70, "bpm"]]),
      report("2026-03-02T09:00:00Z", [["Heart rate", 72, "bpm"]]),
    ];
    expect(mergeReports(local, remote)).toHaveLength(2);
  });

  it("keeps two different agents measured in the same second apart", () => {
    // Running two checks back to back is normal, so the timestamp alone is
    // not an identity.
    const merged = mergeReports(
      [report("2026-03-01T09:00:00Z", [["Heart rate", 70]], 0.8, "vitals")],
      [report("2026-03-01T09:00:00Z", [["Heart rate", 70]], 0.8, "companion")],
    );
    expect(merged).toHaveLength(2);
  });

  it("returns newest first", () => {
    const merged = mergeReports(
      [report("2026-03-01T09:00:00Z", [["Heart rate", 70]])],
      [report("2026-03-05T09:00:00Z", [["Heart rate", 72]])],
    );
    expect(merged[0].takenAt).toBe("2026-03-05T09:00:00Z");
  });

  it("does not mutate its inputs", () => {
    const a = [report("2026-03-01T09:00:00Z", [["Heart rate", 70]])];
    const frozen = [...a];
    sortNewestFirst(a);
    expect(a).toEqual(frozen);
  });
});

describe("trends", () => {
  const daily = (values: number[], quality = 0.8) =>
    values.map((v, i) =>
      report(`2026-03-0${i + 1}T09:00:00Z`, [["Heart rate", v, "bpm"]], quality),
    );

  it("needs more than one reading before it will draw a trend", () => {
    expect(buildTrend(daily([70]), "Heart rate")).toBeNull();
  });

  it("orders points oldest first, the way a trend line reads", () => {
    const trend = buildTrend(sortNewestFirst(daily([70, 74, 78])), "Heart rate");
    expect(trend?.points.map((p) => p.value)).toEqual([70, 74, 78]);
    expect(trend?.first).toBe(70);
    expect(trend?.latest).toBe(78);
  });

  it("reports the direction and the change", () => {
    expect(buildTrend(daily([70, 74, 78]), "Heart rate")?.direction).toBe("up");
    expect(buildTrend(daily([78, 74, 70]), "Heart rate")?.direction).toBe("down");
    expect(buildTrend(daily([70, 74, 78]), "Heart rate")?.change).toBe(8);
  });

  it("calls a change within measurement scatter flat", () => {
    // Reading a one-beat difference as a direction is reading noise as a
    // story, which is the failure mode this whole project tries to avoid.
    expect(buildTrend(daily([70, 71, 70.5]), "Heart rate")?.direction).toBe("flat");
  });

  it("leaves low-quality readings out entirely", () => {
    const mixed = [
      report("2026-03-01T09:00:00Z", [["Heart rate", 70, "bpm"]], 0.9),
      report("2026-03-02T09:00:00Z", [["Heart rate", 180, "bpm"]], 0.1),
      report("2026-03-03T09:00:00Z", [["Heart rate", 72, "bpm"]], 0.9),
    ];
    const trend = buildTrend(mixed, "Heart rate");
    expect(trend?.points).toHaveLength(2);
    expect(trend?.max).toBe(72);
  });

  it("skips readings where the metric was not measured", () => {
    const some = [
      report("2026-03-01T09:00:00Z", [["Heart rate", 70, "bpm"]]),
      report("2026-03-02T09:00:00Z", [["Heart rate", null, "bpm"]]),
      report("2026-03-03T09:00:00Z", [["Breathing rate", 14, "brpm"]]),
      report("2026-03-04T09:00:00Z", [["Heart rate", 74, "bpm"]]),
    ];
    expect(buildTrend(some, "Heart rate")?.points).toHaveLength(2);
  });

  it("trends the systolic figure out of a blood pressure string", () => {
    const bp = [
      report("2026-03-01T09:00:00Z", [["Blood pressure", "118/76", "mmHg"]]),
      report("2026-03-02T09:00:00Z", [["Blood pressure", "126/80", "mmHg"]]),
    ];
    const trend = buildTrend(bp, "Blood pressure");
    expect(trend?.points.map((p) => p.value)).toEqual([118, 126]);
  });

  it("carries the unit and the summary statistics", () => {
    const trend = buildTrend(daily([70, 80, 60]), "Heart rate");
    expect(trend?.unit).toBe("bpm");
    expect(trend?.min).toBe(60);
    expect(trend?.max).toBe(80);
    expect(trend?.average).toBe(70);
  });

  it("builds only the trends it has data for", () => {
    expect(buildTrends(daily([70, 74])).map((t) => t.label)).toEqual(["Heart rate"]);
  });
});

describe("grouping", () => {
  it("groups by agent with the newest reading first in each", () => {
    const groups = groupByAgent([
      report("2026-03-01T09:00:00Z", [["Heart rate", 70]], 0.8, "vitals"),
      report("2026-03-03T09:00:00Z", [["Heart rate", 72]], 0.8, "vitals"),
      report("2026-03-02T09:00:00Z", [["Heart rate", 71]], 0.8, "companion"),
    ]);
    expect(groups).toHaveLength(2);
    const vitals = groups.find((g) => g.slug === "vitals");
    expect(vitals?.reports[0].takenAt).toBe("2026-03-03T09:00:00Z");
  });
});

describe("stored data", () => {
  it("discards anything that is not a report", () => {
    expect(
      parseReports([report("2026-03-01T09:00:00Z", [["Heart rate", 70]]), null, 42, {}]),
    ).toHaveLength(1);
  });

  it("returns an empty list for a non-array", () => {
    expect(parseReports(undefined)).toEqual([]);
  });
});
