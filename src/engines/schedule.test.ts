import { describe, expect, it } from "vitest";
import type { ClimateProfile, PlantInstance } from "../types/models";
import { plants } from "../catalog";
import { successionDates } from "./schedule";
import { finishingSoon, recommend } from "./recommendation";
import {
  feedDue,
  waterAdvice,
  weeklyNeedMm,
  weeklyWaterDeficitMm,
} from "./watering";
import { stashBadge, viabilityScore } from "./inventory";
import { addDays } from "../lib/dates";

const climate: ClimateProfile = {
  id: "c", locationId: "l", derivedFrom: "manual", hardinessZone: "8b",
  lastSpringFrost: { p50: "04-15", p10: "05-01" },
  firstFallFrost: { p50: "10-20", p10: "10-05" },
  monthlyNormals: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    tMinC: [2, 2, 4, 6, 9, 12, 14, 14, 11, 8, 4, 2][i],
    tMaxC: [8, 10, 13, 16, 19, 22, 26, 26, 23, 17, 11, 8][i],
    precipMm: [180, 140, 120, 90, 70, 50, 15, 20, 40, 90, 170, 190][i],
  })),
};

const radish = plants.find((p) => p.id === "radish")!;
const tomato = plants.find((p) => p.id === "tomato")!;

function inst(over: Partial<PlantInstance>): PlantInstance {
  return {
    id: "i", gardenId: "g", areaId: "a", plantId: "radish",
    tiles: [{ col: 0, row: 0 }], plantingMethod: "direct_sow",
    plantedOn: "2026-05-01", currentStage: "planted",
    projectedStageDates: {}, events: [], status: "active",
    watering: { mode: "auto" }, fertilizing: {}, photoEntryIds: [],
    ...over,
  };
}

describe("succession scheduling (§15)", () => {
  it("emits N dates at the chosen interval", () => {
    expect(successionDates("2026-05-01", 10, 4)).toEqual([
      "2026-05-01", "2026-05-11", "2026-05-21", "2026-05-31",
    ]);
  });
});

describe("bed handoffs (§15)", () => {
  it("surfaces instances finishing within the window, soonest first", () => {
    const a = inst({ id: "a", projectedStageDates: { senescence: "2026-06-10" } });
    const b = inst({ id: "b", projectedStageDates: { harvest: "2026-06-01" } });
    const c = inst({ id: "c", projectedStageDates: { senescence: "2026-09-01" } });
    const got = finishingSoon([a, b, c], "2026-05-28");
    expect(got.map((h) => h.instance.id)).toEqual(["b", "a"]);
    expect(got[0].daysAway).toBe(4);
  });
});

describe("watering (§17.1/§27.8)", () => {
  const recent = (mm: number) =>
    Array.from({ length: 7 }, (_, i) => ({
      date: addDays("2026-07-01", i - 6), tMinC: 14, tMaxC: 26, precipMm: mm / 7,
    }));

  it("derives weekly need from override, range, or default", () => {
    expect(weeklyNeedMm(inst({ watering: { mode: "auto", customMmPerWeek: 50 } }), radish)).toBe(50);
    expect(weeklyNeedMm(inst({}), radish)).toBe(25); // 20–30 midpoint
  });

  it("computes the deficit after recent + likely forecast rain", () => {
    const dry = weeklyWaterDeficitMm({ instance: inst({}), plant: radish, today: "2026-07-01", recent: recent(0), forecast: [] });
    expect(dry).toBe(25);
    const wet = weeklyWaterDeficitMm({ instance: inst({}), plant: radish, today: "2026-07-01", recent: recent(30), forecast: [] });
    expect(wet).toBe(0);
    const rainComing = weeklyWaterDeficitMm({
      instance: inst({}), plant: radish, today: "2026-07-01", recent: recent(0),
      forecast: [{ date: "2026-07-02", tMinC: 14, tMaxC: 22, precipMm: 20, precipProbabilityPct: 80 }],
    });
    expect(rainComing).toBe(5);
    const unlikelyRain = weeklyWaterDeficitMm({
      instance: inst({}), plant: radish, today: "2026-07-01", recent: recent(0),
      forecast: [{ date: "2026-07-02", tMinC: 14, tMaxC: 22, precipMm: 20, precipProbabilityPct: 20 }],
    });
    expect(unlikelyRain).toBe(25); // 20% chance doesn't count
  });

  it("waterlogging risk suppresses watering and alerts sensitive crops (§31.2)", () => {
    const base = { instance: inst({}), plant: tomato, today: "2026-01-10", recent: recent(80), forecast: [] };
    expect(waterAdvice(base, "high").action).toBe("alert_waterlogging"); // tomato: high sensitivity
    expect(waterAdvice({ ...base, plant: radish }, "elevated").action).toBe("skip");
    expect(waterAdvice({ ...base, recent: recent(0), today: "2026-07-01" }, "none").action).toBe("water");
  });
});

describe("fertilizing (§17.2)", () => {
  const order = ["planted", "germination", "sprout", "seedling", "vegetative", "flowering", "fruiting", "harvest", "senescence"];

  it("first feed due once its stage arrives; not before", () => {
    const young = inst({ plantId: "tomato", currentStage: "planted", projectedStageDates: { planted: "2026-05-01" } });
    expect(feedDue(young, tomato, "2026-05-02", order)?.why).toMatch(/planted/);
    const preFlower = { ...tomato, fertilization: { schedule: [{ atStage: "flowering" as const, type: "low-N" }] } };
    expect(feedDue(young, preFlower, "2026-05-02", order)).toBeNull();
  });

  it("interval feeds repeat; stage-entry feeds re-trigger after a new stage", () => {
    const flowering = inst({
      plantId: "tomato", currentStage: "flowering",
      projectedStageDates: { planted: "2026-05-01", flowering: "2026-06-20" },
      fertilizing: { lastFedOn: "2026-06-21" },
    });
    expect(feedDue(flowering, tomato, "2026-06-25", order)).toBeNull(); // fed 4d ago, interval 14
    expect(feedDue(flowering, tomato, "2026-07-06", order)?.why).toMatch(/14 days/);
  });
});

describe("inventory (§31.1)", () => {
  const packet = (over: object) => ({
    id: "p", plantId: "radish", quantity: "high" as const, addedAt: "2026-01-01", ...over,
  });

  it("scores viability from the packed-for year vs plant longevity", () => {
    expect(viabilityScore(packet({ packedForYear: 2026 }), radish, 2026)).toBe("fresh");
    expect(viabilityScore(packet({ packedForYear: 2024 }), radish, 2026)).toBe("good"); // 4y span
    expect(viabilityScore(packet({ packedForYear: 2022 }), radish, 2026)).toBe("aging");
    expect(viabilityScore(packet({ packedForYear: 2020 }), radish, 2026)).toBe("expired");
  });

  it("badges the stash; empty packets don't count", () => {
    expect(stashBadge([], radish, 2026)).toBe("out_of_stash");
    expect(stashBadge([packet({ packedForYear: 2026 })], radish, 2026)).toBe("in_stash");
    expect(stashBadge([packet({ packedForYear: 2022 })], radish, 2026)).toBe("in_stash_aging");
    expect(stashBadge([packet({ packedForYear: 2026, quantity: "empty" })], radish, 2026)).toBe("out_of_stash");
  });
});

describe("recommendations (§16/§27.9)", () => {
  it("ranks in-season, in-stash, easy crops above out-of-season hard ones", () => {
    const recs = recommend(plants, {
      climate,
      hemisphere: "northern",
      packets: [{ id: "pk", plantId: "radish", quantity: "high", addedAt: "2026-01-01", packedForYear: 2026 }],
      today: "2026-04-20",
    });
    const radishRec = recs.find((r) => r.plant.id === "radish")!;
    const tomatoRec = recs.find((r) => r.plant.id === "tomato")!;
    expect(radishRec.score).toBeGreaterThan(tomatoRec.score);
    expect(radishRec.reasons.join(" ")).toMatch(/stash/);
    expect(radishRec.opensInDays).toBe(-1); // open now in late April
  });

  it("honors preference filters", () => {
    const fast = recommend(plants, { climate, hemisphere: "northern", today: "2026-04-20" }, { fastOnly: true });
    expect(fast.every((r) => r.plant.daysToMaturity.max <= 50)).toBe(true);
    expect(fast.length).toBeGreaterThan(0);
  });

  it("penalizes a family grown recently (rotation, §20)", () => {
    const plantsById = new Map(plants.map((p) => [p.id, p]));
    const withHistory = recommend(plants, {
      climate, hemisphere: "northern", today: "2026-04-20", plantsById,
      instances: [inst({ plantId: "kale", plantedOn: "2025-06-01" })],
    });
    const without = recommend(plants, { climate, hemisphere: "northern", today: "2026-04-20" });
    const broc = (rs: typeof withHistory) => rs.find((r) => r.plant.id === "broccoli")!.score;
    expect(broc(withHistory)).toBeLessThan(broc(without));
  });
});
