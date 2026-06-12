import { describe, expect, it } from "vitest";
import type { ClimateProfile } from "../types/models";
import { plants } from "../catalog";
import { daysUntilOpen, openNow, windowsFor } from "./plantingWindows";
import { addDays, diffDays, inYear } from "../lib/dates";

/** Pacific-Northwest-ish profile: LSF Apr 15, FFF Oct 20, mild winters. */
const profile: ClimateProfile = {
  id: "test",
  locationId: "loc",
  hardinessZone: "8b",
  lastSpringFrost: { p50: "04-15", p10: "05-01" },
  firstFallFrost: { p50: "10-20", p10: "10-05" },
  frostFreeDays: 188,
  monthlyNormals: [
    { month: 1, tMinC: 2, tMaxC: 8, precipMm: 180 },
    { month: 2, tMinC: 2, tMaxC: 10, precipMm: 140 },
    { month: 3, tMinC: 4, tMaxC: 13, precipMm: 120 },
    { month: 4, tMinC: 6, tMaxC: 16, precipMm: 90 },
    { month: 5, tMinC: 9, tMaxC: 19, precipMm: 70 },
    { month: 6, tMinC: 12, tMaxC: 22, precipMm: 50 },
    { month: 7, tMinC: 14, tMaxC: 26, precipMm: 15 },
    { month: 8, tMinC: 14, tMaxC: 26, precipMm: 20 },
    { month: 9, tMinC: 11, tMaxC: 23, precipMm: 40 },
    { month: 10, tMinC: 8, tMaxC: 17, precipMm: 90 },
    { month: 11, tMinC: 4, tMaxC: 11, precipMm: 170 },
    { month: 12, tMinC: 2, tMaxC: 8, precipMm: 190 },
  ],
  derivedFrom: "manual",
};

const tomato = plants.find((p) => p.id === "tomato")!;
const radish = plants.find((p) => p.id === "radish")!;
const kale = plants.find((p) => p.id === "kale")!;

describe("planting windows (§11, §27.3)", () => {
  it("tomato: indoor band 8–6 weeks before LSF, transplant after frost, no fall band", () => {
    const bands = windowsFor(tomato, profile, 2026);
    const indoor = bands.find((b) => b.kind === "indoor")!;
    expect(indoor.start).toBe("2026-02-18"); // Apr 15 − 8w
    expect(indoor.end).toBe("2026-03-04"); // Apr 15 − 6w
    const tp = bands.find((b) => b.kind === "transplant")!;
    expect(tp.start).toBe("2026-04-22"); // +1w
    expect(tp.end).toBe("2026-04-29"); // +2w
    expect(bands.find((b) => b.kind === "fall")).toBeUndefined(); // tender
    expect(bands.find((b) => b.kind === "direct")).toBeUndefined(); // not a method
  });

  it("harvest projection trails the band by DTM", () => {
    const tp = windowsFor(tomato, profile, 2026).find((b) => b.kind === "transplant")!;
    expect(tp.harvestStart).toBe(addDays(tp.start, tomato.daysToMaturity.min));
    expect(tp.harvestEnd).toBe(addDays(tp.end, tomato.daysToMaturity.max));
  });

  it("radish: spring direct band clipped by cold soil, plus a fall band", () => {
    const bands = windowsFor(radish, profile, 2026);
    const direct = bands.find((b) => b.kind === "direct")!;
    // rule says −4w (Mar 18) but March soil ≈ 7.1°C is borderline; the clip
    // may push the start but never past the rule's end
    expect(diffDays(direct.start, direct.end) >= 0).toBe(true);
    expect(direct.end).toBe("2026-05-13"); // Apr 15 + 4w
    const fall = bands.find((b) => b.kind === "fall")!;
    // sow-by = Oct 20 − 30d DTM = Sep 20; band = 6w..4w before that
    expect(fall.start).toBe("2026-08-09");
    expect(fall.end).toBe("2026-08-23");
  });

  it("clips the direct-sow start once soil warms mid-window (§27.4)", () => {
    // Synthetic: radish-like crop needing 10°C with a −4..+8 week window.
    // March soil ≈7.5°C (too cold), April ≈10°C — start should clip to April.
    const fussy = {
      ...radish,
      minSoilTempC: 10,
      sowRules: {
        ...radish.sowRules,
        directSowWeeksFromLastFrost: { min: -4, max: 8 },
      },
    };
    const direct = windowsFor(fussy, profile, 2026).find((b) => b.kind === "direct")!;
    expect(diffDays("2026-03-18", direct.start)).toBeGreaterThan(0); // moved off −4w
    expect(direct.end).toBe("2026-06-10"); // +8w untouched
    expect(direct.notes.join(" ")).toMatch(/soil warms/i);
  });

  it("keeps a cold-all-window band but warns instead of dropping it", () => {
    const warm = plants.find((p) => p.id === "bush_bean")!; // needs 15.5°C
    const direct = windowsFor(warm, profile, 2026).find((b) => b.kind === "direct")!;
    // PNW-ish soil estimate never hits 15.5°C by mid-May; the rule dates
    // survive with an honest warning attached.
    expect(direct.start).toBe("2026-04-22"); // +1w, unclipped
    expect(direct.end).toBe("2026-05-13"); // +4w
    expect(direct.notes.join(" ")).toMatch(/entire window/i);
  });

  it("southern hemisphere mirrors all bands by ~6 months (§27.7)", () => {
    const north = windowsFor(kale, profile, 2026, "northern");
    const south = windowsFor(kale, profile, 2026, "southern");
    expect(south).toHaveLength(north.length);
    for (let i = 0; i < north.length; i++) {
      expect(diffDays(north[i].start, south[i].start)).toBe(182);
    }
  });

  it("openNow and daysUntilOpen agree with band edges", () => {
    const bands = windowsFor(radish, profile, 2026);
    const direct = bands.find((b) => b.kind === "direct")!;
    expect(openNow([direct], direct.start)).toHaveLength(1);
    expect(openNow([direct], addDays(direct.end, 1))).toHaveLength(0);
    expect(daysUntilOpen(direct, addDays(direct.start, -10))).toBe(10);
  });

  it("frost dates parameterize by year", () => {
    const b26 = windowsFor(tomato, profile, 2026).find((b) => b.kind === "transplant")!;
    const b27 = windowsFor(tomato, profile, 2027).find((b) => b.kind === "transplant")!;
    expect(inYear("04-22", 2026)).toBe(b26.start);
    expect(inYear("04-22", 2027)).toBe(b27.start);
  });
});
