import { describe, expect, it } from "vitest";
import type { ClimateProfile, PlantInstance } from "../types/models";
import type { DailyRecord } from "../types/adapters";
import { plants, stageTemplates } from "../catalog";
import {
  accumulateGDD,
  autoAdvance,
  effectiveSequence,
  gddTargets,
  manualAdvance,
  manualRollback,
  projectStageDates,
  reprojectFrom,
  stageByGdd,
  stageOnDate,
} from "./growth";
import { addDays } from "../lib/dates";

const tomato = plants.find((p) => p.id === "tomato")!;
const fruiting = stageTemplates.find((t) => t.id === "tmpl_fruiting_annual")!;
const radish = plants.find((p) => p.id === "radish")!;
const rootFast = stageTemplates.find((t) => t.id === "tmpl_root_fast")!;

function makeInstance(over: Partial<PlantInstance> = {}): PlantInstance {
  const plantedOn = over.plantedOn ?? "2026-05-01";
  const method = over.plantingMethod ?? "direct_sow";
  return {
    id: "i1",
    gardenId: "g",
    areaId: "a",
    plantId: radish.id,
    tiles: [{ col: 0, row: 0 }],
    plantingMethod: method,
    plantedOn,
    currentStage: "planted",
    projectedStageDates: projectStageDates(rootFast, method, plantedOn),
    events: [],
    status: "active",
    watering: { mode: "auto" },
    fertilizing: {},
    photoEntryIds: [],
    ...over,
  };
}

describe("stage projection (§13.1)", () => {
  it("walks the template accumulating typical durations", () => {
    const p = projectStageDates(rootFast, "direct_sow", "2026-05-01");
    expect(p.planted).toBe("2026-05-01");
    expect(p.germination).toBe("2026-05-01"); // planted has no duration
    expect(p.sprout).toBe("2026-05-06"); // +5 germination
    expect(p.seedling).toBe("2026-05-10"); // +4 sprout
    expect(p.fruiting).toBe("2026-05-17"); // +7 seedling
    expect(p.harvest).toBe("2026-05-27"); // +10 sizing
  });

  it("transplants skip germination and sprout (§13.1)", () => {
    const seq = effectiveSequence(fruiting, "transplant");
    expect(seq).not.toContain("germination");
    expect(seq).not.toContain("sprout");
    const p = projectStageDates(fruiting, "transplant", "2026-05-15");
    expect(p.germination).toBeUndefined();
    expect(p.seedling).toBe("2026-05-15");
  });

  it("resolves the stage owed on a date", () => {
    const p = projectStageDates(rootFast, "direct_sow", "2026-05-01");
    const seq = effectiveSequence(rootFast, "direct_sow");
    expect(stageOnDate(p, seq, "2026-05-02")).toBe("germination");
    expect(stageOnDate(p, seq, "2026-05-08")).toBe("sprout");
    expect(stageOnDate(p, seq, "2026-07-01")).toBe("senescence");
  });
});

describe("auto-advance (§13.2)", () => {
  it("advances along the calendar projection and logs auto events", () => {
    const inst = makeInstance();
    const { instance, newEvents } = autoAdvance(inst, radish, rootFast, "2026-05-11");
    expect(instance.currentStage).toBe("seedling");
    expect(newEvents.map((e) => e.stage)).toEqual(["germination", "sprout", "seedling"]);
    expect(newEvents.every((e) => e.source === "auto")).toBe(true);
  });

  it("never moves backward and skips non-active instances", () => {
    const ahead = makeInstance({ currentStage: "harvest" });
    expect(autoAdvance(ahead, radish, rootFast, "2026-05-02").newEvents).toHaveLength(0);
    const planned = makeInstance({ status: "planned" });
    expect(autoAdvance(planned, radish, rootFast, "2026-07-01").newEvents).toHaveLength(0);
  });
});

describe("manual advance / rollback (§13.4)", () => {
  it("rollback steps back one stage, re-projects, and names a symptom", () => {
    const inst = makeInstance({ currentStage: "sprout" });
    const move = manualRollback(inst, rootFast, "2026-05-12")!;
    expect(move.instance.currentStage).toBe("germination");
    expect(move.event.source).toBe("manual_rollback");
    expect(move.symptom).toBe("germination_delay");
    // the stage it fell back FROM now re-projects from today
    expect(move.instance.projectedStageDates.sprout).toBe("2026-05-12");
  });

  it("advance steps forward and re-projects downstream", () => {
    const inst = makeInstance({ currentStage: "seedling" });
    const move = manualAdvance(inst, rootFast, "2026-05-12")!;
    expect(move.instance.currentStage).toBe("fruiting");
    expect(move.instance.projectedStageDates.fruiting).toBe("2026-05-12");
    expect(move.instance.projectedStageDates.harvest).toBe("2026-05-22");
  });

  it("cannot roll back past the first or advance past the last stage", () => {
    expect(manualRollback(makeInstance(), rootFast, "2026-05-02")).toBeNull();
    expect(manualAdvance(makeInstance({ currentStage: "senescence" }), rootFast, "2026-05-02")).toBeNull();
  });

  it("reprojectFrom leaves earlier stages untouched", () => {
    const p = projectStageDates(rootFast, "direct_sow", "2026-05-01");
    const re = reprojectFrom(rootFast, "direct_sow", p, "fruiting", "2026-06-01");
    expect(re.germination).toBe(p.germination);
    expect(re.fruiting).toBe("2026-06-01");
    expect(re.harvest).toBe("2026-06-11");
  });
});

describe("GDD pacing (§13.3, §27.2)", () => {
  const climate: ClimateProfile = {
    id: "c", locationId: "l", derivedFrom: "manual",
    lastSpringFrost: { p50: "04-15", p10: "05-01" },
    firstFallFrost: { p50: "10-20", p10: "10-05" },
    monthlyNormals: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      tMinC: 10,
      tMaxC: 20, // mean 15 → 5 GDD/day at base 10
      precipMm: 50,
    })),
  };

  function days(from: string, n: number, tMin: number, tMax: number): DailyRecord[] {
    return Array.from({ length: n }, (_, i) => ({
      date: addDays(from, i),
      tMinC: tMin,
      tMaxC: tMax,
      precipMm: 0,
    }));
  }

  it("accumulates max(0, mean − base) per day", () => {
    expect(accumulateGDD(days("2026-05-01", 10, 10, 20), 10, "2026-05-01", "2026-05-10")).toBe(50);
    expect(accumulateGDD(days("2026-05-01", 5, 2, 8), 10, "2026-05-01", "2026-05-05")).toBe(0);
  });

  it("converts stage spans into cumulative GDD targets from normals", () => {
    const targets = gddTargets(fruiting, "transplant", "2026-05-01", climate, 10);
    expect(targets.seedling).toBe(0); // first stage for a transplant
    expect(targets.vegetative).toBe(14 * 5); // 14 seedling days × 5 GDD
    const seq = effectiveSequence(fruiting, "transplant");
    expect(stageByGdd(targets, seq, 14 * 5 + 1)).toBe("vegetative");
  });

  it("a hot spell advances faster than the calendar; a cold snap slower", () => {
    const tomatoInst = makeInstance({
      plantId: tomato.id,
      plantingMethod: "transplant",
      plantedOn: "2026-06-01",
      projectedStageDates: projectStageDates(fruiting, "transplant", "2026-06-01"),
    });
    const today = addDays("2026-06-01", 14); // calendar says: entering vegetative
    const hot = autoAdvance(tomatoInst, tomato, fruiting, today, climate, days("2026-06-01", 14, 20, 34)); // 17 GDD/day
    const cold = autoAdvance(tomatoInst, tomato, fruiting, today, climate, days("2026-06-01", 14, 4, 12)); // 0 GDD/day... below base
    expect(["vegetative", "flowering"]).toContain(hot.instance.currentStage);
    // a transplant is a seedling on day one; with zero accumulated heat it
    // gets stuck there instead of marching down the calendar
    expect(cold.instance.currentStage).toBe("seedling");
    const seqIdx = (s: string) => effectiveSequence(fruiting, "transplant").indexOf(s as never);
    expect(seqIdx(hot.instance.currentStage)).toBeGreaterThan(seqIdx(cold.instance.currentStage));
  });
});
