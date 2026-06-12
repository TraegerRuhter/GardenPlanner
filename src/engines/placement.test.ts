import { describe, expect, it } from "vitest";
import type { PlantInstance } from "../types/models";
import { companions, plants } from "../catalog";
import { newArea, setTile } from "../db/gardenRepo";
import {
  companionWarnings,
  frostPocketWarning,
  rotationWarnings,
  spacingWarnings,
  sunWarning,
} from "./placement";

const plantsById = new Map(plants.map((p) => [p.id, p]));
const tomato = plantsById.get("tomato")!;
const basil = plantsById.get("basil")!;
const kale = plantsById.get("kale")!;

function inst(plantId: string, tiles: Array<{ col: number; row: number }>, areaId: string, plantedOn = "2026-05-01", status: PlantInstance["status"] = "active"): PlantInstance {
  return {
    id: `i_${plantId}_${tiles[0].col}_${tiles[0].row}`,
    gardenId: "g",
    areaId,
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
    const area = newArea("bed", 8, 4); // 30.48 cm cells; tomato wants 45 cm
    const existing = inst("tomato", [{ col: 2, row: 1 }], area.id);
    const tooClose = spacingWarnings(area, [{ col: 3, row: 1 }], tomato, [existing], plantsById);
    expect(tooClose).toHaveLength(1);
    expect(tooClose[0].kind).toBe("spacing");
    // two cells away ≈ 61 cm — fine
    expect(spacingWarnings(area, [{ col: 4, row: 1 }], tomato, [existing], plantsById)).toHaveLength(0);
  });

  it("flags antagonists and encourages companions on adjacent tiles", () => {
    const area = newArea("bed", 8, 4);
    const tomatoInst = inst("tomato", [{ col: 2, row: 1 }], area.id);
    const friendly = companionWarnings(area, [{ col: 3, row: 1 }], basil, [tomatoInst], plantsById, companions);
    expect(friendly.some((w) => w.kind === "companion")).toBe(true);
    const hostile = companionWarnings(area, [{ col: 3, row: 1 }], kale, [tomatoInst], plantsById, companions);
    expect(hostile.some((w) => w.kind === "antagonist")).toBe(true);
    // not adjacent → silent
    expect(companionWarnings(area, [{ col: 6, row: 3 }], kale, [tomatoInst], plantsById, companions)).toHaveLength(0);
  });

  it("warns when the same family grew in the tile within two seasons (§20)", () => {
    const area = newArea("bed", 8, 4);
    const lastYear = inst("tomato", [{ col: 1, row: 1 }], area.id, "2025-05-10", "removed");
    const pepper = plantsById.get("pepper_sweet")!; // also solanaceae
    const warns = rotationWarnings(area, [{ col: 1, row: 1 }], pepper, [lastYear], plantsById, 2026);
    expect(warns).toHaveLength(1);
    expect(warns[0].kind).toBe("rotation");
    // three years back → outside the window
    const old = inst("tomato", [{ col: 1, row: 1 }], area.id, "2023-05-10", "removed");
    expect(rotationWarnings(area, [{ col: 1, row: 1 }], pepper, [old], plantsById, 2026)).toHaveLength(0);
    // different family → fine
    expect(rotationWarnings(area, [{ col: 1, row: 1 }], kale, [lastYear], plantsById, 2026)).toHaveLength(0);
  });

  it("flags frost pockets for tender plants only (§12.5)", () => {
    const area = newArea("bed", 4, 4);
    // dig a 8cm depression at (1,1) surrounded by raised soil
    for (let c = 0; c <= 2; c++)
      for (let r = 0; r <= 2; r++)
        if (!(c === 1 && r === 1)) setTile(area, c, r, { type: "empty" }, 8);
    expect(frostPocketWarning(area, [{ col: 1, row: 1 }], tomato)).toHaveLength(1);
    expect(frostPocketWarning(area, [{ col: 1, row: 1 }], kale)).toHaveLength(0); // hardy
  });

  it("compares sun-map hours to the plant's minimum (§12.8)", () => {
    expect(sunWarning(tomato, 4.5)).toHaveLength(1);
    expect(sunWarning(tomato, 7)).toHaveLength(0);
    expect(sunWarning(tomato, undefined)).toHaveLength(0); // no map yet
  });
});
