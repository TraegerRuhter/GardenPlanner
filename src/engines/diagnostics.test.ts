import { describe, expect, it } from "vitest";
import { diagnostics } from "../catalog/diagnostics";
import type { DiagnosticBranch, DiagnosticTree } from "../types/models";
import {
  branchTarget,
  evaluateAutoCheck,
  findTree,
  treeDepth,
} from "./diagnostics";

describe("tree resolution (§14)", () => {
  const trees: DiagnosticTree[] = [
    ...diagnostics,
    {
      ...diagnostics[0],
      id: "diag_germ_tomato",
      scope: { plantId: "tomato" },
    },
    {
      ...diagnostics[0],
      id: "diag_germ_brassica",
      scope: { familyId: "brassicaceae" },
    },
  ];

  it("prefers plant scope, then family, then generic", () => {
    expect(findTree(trees, "germination_delay", "tomato", "solanaceae")?.id).toBe("diag_germ_tomato");
    expect(findTree(trees, "germination_delay", "kale", "brassicaceae")?.id).toBe("diag_germ_brassica");
    expect(findTree(trees, "germination_delay", "carrot", "apiaceae")?.id).toBe("diag_germination_delay");
    expect(findTree(trees, "made_up", "carrot", "apiaceae")).toBeUndefined();
  });

  it("ships all six spec symptoms with finite trees", () => {
    const symptoms = new Set(diagnostics.map((d) => d.symptom));
    for (const s of ["germination_delay", "stunted_growth", "yellowing_leaves", "no_fruit", "bolting", "wilting"]) {
      expect(symptoms.has(s), s).toBe(true);
    }
    for (const d of diagnostics) {
      const depth = treeDepth({ kind: "node", node: d.root });
      expect(depth).toBeGreaterThan(0);
      expect(depth).toBeLessThan(8);
    }
  });
});

describe("auto-checks (§14, §31.1, §31.2)", () => {
  it("soil temperature check compares estimate to the plant minimum", () => {
    expect(evaluateAutoCheck("soil_temp_below_min", { today: "2026-04-01", soilTempC: 8, minSoilTempC: 15.5 }).answer).toBe(true);
    expect(evaluateAutoCheck("soil_temp_below_min", { today: "2026-06-01", soilTempC: 19, minSoilTempC: 15.5 }).answer).toBe(false);
    expect(evaluateAutoCheck("soil_temp_below_min", { today: "2026-06-01" }).answer).toBeNull();
  });

  it("watering check answers 'watered recently?'", () => {
    expect(evaluateAutoCheck("no_recent_water", { today: "2026-06-10", lastWateredOn: "2026-06-08" }).answer).toBe(true);
    expect(evaluateAutoCheck("no_recent_water", { today: "2026-06-10", lastWateredOn: "2026-06-01" }).answer).toBe(false);
    expect(evaluateAutoCheck("no_recent_water", { today: "2026-06-10" }).answer).toBeNull();
  });

  it("waterlogging check rides the §31.2 risk bucket", () => {
    expect(evaluateAutoCheck("soil_saturated_recent", { today: "2026-01-10", waterloggingRisk: "high" }).answer).toBe(true);
    expect(evaluateAutoCheck("soil_saturated_recent", { today: "2026-07-10", waterloggingRisk: "none" }).answer).toBe(false);
  });

  it("seed viability check uses the §31.1 score and degrades to manual", () => {
    expect(evaluateAutoCheck("seed_past_viability", { today: "2026-04-01", seedViability: "expired" }).answer).toBe(true);
    expect(evaluateAutoCheck("seed_past_viability", { today: "2026-04-01", seedViability: "fresh" }).answer).toBe(false);
    expect(evaluateAutoCheck("seed_past_viability", { today: "2026-04-01" }).answer).toBeNull();
  });

  it("every evaluation carries human-readable evidence", () => {
    const r = evaluateAutoCheck("low_light", { today: "2026-06-01", sunHours: 3.2, sunHoursMin: 6 });
    expect(r.answer).toBe(true);
    expect(r.evidence).toMatch(/3.2h/);
  });
});

describe("walking a tree", () => {
  it("cold-soil germination walk reaches the §28.3 diagnosis", () => {
    const tree = diagnostics.find((d) => d.id === "diag_germination_delay")!;
    const b = branchTarget(tree.root, true);
    expect(b.kind).toBe("diagnosis");
    if (b.kind === "diagnosis") {
      expect(b.cause).toMatch(/cold/i);
      expect(b.createsTask?.kind).toBe("remedy");
    }
  });

  it("wilting + saturated soil warns NOT to water (§31.2)", () => {
    const tree = diagnostics.find((d) => d.symptom === "wilting")!;
    const b: DiagnosticBranch = branchTarget(tree.root, true);
    expect(b.kind).toBe("diagnosis");
    if (b.kind === "diagnosis") expect(b.cause + b.remedy).toMatch(/not water|Do not water/i);
  });
});
