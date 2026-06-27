import { describe, expect, it } from "vitest";
import type { PlantInstance } from "../types/models";
import { companions, plants } from "../catalog";
import {
  companionWarnings,
  frostPocketWarning,
  rotationWarnings,
  spacingWarnings,
  sunWarning,
  type PlacementField,
} from "./placement";

const plantsById = new Map(plants.map((p) => [p.id, p]));
const tomato = plantsById.get("tomato")!;
const basil = plantsById.get("basil")!;
const kale = plantsById.get("kale")!;

const DEFAULT_CELL = 30.48;
function field(cols: number, rows: number, elev: Map<string, number> = new Map()): PlacementField {
  return { cols, rows, cellSizeCm: DEFAULT_CELL, elevationAt: (c, r) => elev.get(`${c},${r}`) ?? 0 };
}

function inst(plantId: string, tiles: Array<{ col: number; row: number }>, plantedOn = "2026-05-01", status: PlantInstance["status"] = "active"): PlantInstance {
  return {
    id: `i_${plantId}_${tiles[0].col}_${tiles[0].row}`,
    gardenId: "g",
    plantId,
    tiles,
    plantingMethod: "direct_sow",
    plantedOn,
    currentStage: "planted",
    projectedStageDates: {},
    events: [],
    status,
    watering: { mode: "auto" },
    fertilizing: {},
    photoEntryIds: [],
  };
}

describe("placement validation (§12.6)", () => {
  it("warns when same-species neighbors violate in-row spacing", () => {
    const f = field(8, 4); // 30.48 cm cells; tomato wants 45 cm
    const existing = inst("tomato", [{ col: 2, row: 1 }]);
    const tooClose = spacingWarnings(f, [{ col: 3, row: 1 }], tomato, [existing], plantsById);
    expect(tooClose).toHaveLength(1);
    expect(tooClose[0].kind).toBe("spacing");
    // two cells away ≈ 61 cm — fine
    expect(spacingWarnings(f, [{ col: 4, row: 1 }], tomato, [existing], plantsById)).toHaveLength(0);
  });

  it("flags antagonists and encourages companions on adjacent cells", () => {
    const tomatoInst = inst("tomato", [{ col: 2, row: 1 }]);
    const friendly = companionWarnings([{ col: 3, row: 1 }], basil, [tomatoInst], plantsById, companions);
    expect(friendly.some((w) => w.kind === "companion")).toBe(true);
    const hostile = companionWarnings([{ col: 3, row: 1 }], kale, [tomatoInst], plantsById, companions);
    expect(hostile.some((w) => w.kind === "antagonist")).toBe(true);
    // not adjacent → silent
    expect(companionWarnings([{ col: 6, row: 3 }], kale, [tomatoInst], plantsById, companions)).toHaveLength(0);
  });

  it("warns when the same family grew in the cell within two seasons (§20)", () => {
    const lastYear = inst("tomato", [{ col: 1, row: 1 }], "2025-05-10", "removed");
    const pepper = plantsById.get("pepper_sweet")!; // also solanaceae
    const warns = rotationWarnings([{ col: 1, row: 1 }], pepper, [lastYear], plantsById, 2026);
    expect(warns).toHaveLength(1);
    expect(warns[0].kind).toBe("rotation");
    // three years back → outside the window
    const old = inst("tomato", [{ col: 1, row: 1 }], "2023-05-10", "removed");
    expect(rotationWarnings([{ col: 1, row: 1 }], pepper, [old], plantsById, 2026)).toHaveLength(0);
    // different family → fine
    expect(rotationWarnings([{ col: 1, row: 1 }], kale, [lastYear], plantsById, 2026)).toHaveLength(0);
  });

  it("flags frost pockets for tender plants only (§12.5)", () => {
    // dig a depression at (1,1) surrounded by raised soil (+8 cm)
    const elev = new Map<string, number>();
    for (let c = 0; c <= 2; c++)
      for (let r = 0; r <= 2; r++)
        if (!(c === 1 && r === 1)) elev.set(`${c},${r}`, 8);
    const f = field(4, 4, elev);
    expect(frostPocketWarning(f, [{ col: 1, row: 1 }], tomato)).toHaveLength(1);
    expect(frostPocketWarning(f, [{ col: 1, row: 1 }], kale)).toHaveLength(0); // hardy
  });

  it("compares sun-map hours to the plant's minimum (§12.8)", () => {
    expect(sunWarning(tomato, 4.5)).toHaveLength(1);
    expect(sunWarning(tomato, 7)).toHaveLength(0);
    expect(sunWarning(tomato, undefined)).toHaveLength(0); // no map yet
  });
});
