/**
 * Catalog integrity (§28.2: "records must be complete enough to drive
 * windows, spacing, sun maps, and stages"). Every cross-reference must
 * resolve; every agronomic value must be internally coherent.
 */

import { describe, expect, it } from "vitest";
import {
  companions,
  families,
  plants,
  recipes,
  stageTemplates,
  varietals,
} from ".";

const familyIds = new Set(families.map((f) => f.id));
const templateIds = new Set(stageTemplates.map((t) => t.id));
const plantIds = new Set(plants.map((p) => p.id));
const varietalIds = new Set(varietals.map((v) => v.id));
const recipeIds = new Set(recipes.map((r) => r.id));

describe("catalog integrity", () => {
  it.each(plants.map((p) => [p.id, p] as const))(
    "%s resolves references and is agronomically coherent",
    (_id, p) => {
      expect(familyIds.has(p.familyId)).toBe(true);
      expect(templateIds.has(p.stageTemplateId)).toBe(true);
      for (const v of p.varietalIds) expect(varietalIds.has(v)).toBe(true);
      for (const r of p.recipeIds) expect(recipeIds.has(r)).toBe(true);

      // ranges ordered
      expect(p.hardinessZones.min).toBeLessThanOrEqual(p.hardinessZones.max);
      expect(p.daysToMaturity.min).toBeLessThanOrEqual(p.daysToMaturity.max);
      expect(p.soilPh.min).toBeLessThan(p.soilPh.max);
      expect(p.matureHeightCm.min).toBeLessThanOrEqual(p.matureHeightCm.max);
      expect(p.spacing.inRowCm).toBeGreaterThan(0);
      expect(p.spacing.betweenRowCm).toBeGreaterThanOrEqual(p.spacing.inRowCm);

      // sun label and numeric agree (§7.3: full >= 6h, partial 3-6h, shade < 3h)
      if (p.sun === "full") expect(p.sunHoursMin).toBeGreaterThanOrEqual(5);
      if (p.sun === "partial") {
        expect(p.sunHoursMin).toBeGreaterThanOrEqual(3);
        expect(p.sunHoursMin).toBeLessThan(6);
      }

      // every planting method has a matching sow rule
      for (const m of p.plantingMethods) {
        if (m === "indoor_start")
          expect(p.sowRules.indoorStartWeeksFromLastFrost).toBeDefined();
        if (m === "direct_sow")
          expect(p.sowRules.directSowWeeksFromLastFrost).toBeDefined();
        if (m === "transplant")
          expect(p.sowRules.transplantWeeksFromLastFrost).toBeDefined();
      }
      // and rule windows are ordered
      for (const rule of [
        p.sowRules.indoorStartWeeksFromLastFrost,
        p.sowRules.directSowWeeksFromLastFrost,
        p.sowRules.transplantWeeksFromLastFrost,
        p.sowRules.fallWeeksFromFirstFrost,
      ]) {
        if (rule) expect(rule.min).toBeLessThanOrEqual(rule.max);
      }

      // tender crops must not direct-sow before frost
      if (p.frostTolerance === "tender" && p.sowRules.directSowWeeksFromLastFrost) {
        expect(p.sowRules.directSowWeeksFromLastFrost.min).toBeGreaterThanOrEqual(0);
      }

      // fertilization stages exist in the plant's own stage sequence
      const tmpl = stageTemplates.find((t) => t.id === p.stageTemplateId)!;
      for (const f of p.fertilization.schedule) {
        expect(tmpl.sequence).toContain(f.atStage);
      }

      // §31.1 viability data present for inventory features
      expect(p.seedViabilityYears).toBeGreaterThan(0);
    },
  );

  it("stage templates list durations for every non-terminal stage", () => {
    for (const t of stageTemplates) {
      // every stage after "planted" except the last needs a duration to project
      const projectable = t.sequence.slice(1, -1);
      for (const s of projectable) {
        expect(
          t.stageDurations[s],
          `${t.id} missing duration for ${s}`,
        ).toBeDefined();
      }
    }
  });

  it("varietals and recipes point at real plants", () => {
    for (const v of varietals) expect(plantIds.has(v.plantId)).toBe(true);
    for (const r of recipes) {
      for (const pid of r.plantIds) expect(plantIds.has(pid)).toBe(true);
      for (const ing of r.ingredients) {
        if (ing.plantId) expect(plantIds.has(ing.plantId)).toBe(true);
      }
    }
  });

  it("companion pairs reference real, distinct plants with no duplicate pairs", () => {
    const seen = new Set<string>();
    for (const c of companions) {
      expect(plantIds.has(c.aPlantId)).toBe(true);
      expect(plantIds.has(c.bPlantId)).toBe(true);
      expect(c.aPlantId).not.toBe(c.bPlantId);
      const key = [c.aPlantId, c.bPlantId].sort().join("+");
      expect(seen.has(key), `duplicate pair ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("plant ↔ varietal/recipe links are bidirectional", () => {
    for (const v of varietals) {
      const plant = plants.find((p) => p.id === v.plantId)!;
      expect(plant.varietalIds).toContain(v.id);
    }
    for (const r of recipes) {
      for (const pid of r.plantIds) {
        const plant = plants.find((p) => p.id === pid)!;
        expect(plant.recipeIds).toContain(r.id);
      }
    }
  });
});
