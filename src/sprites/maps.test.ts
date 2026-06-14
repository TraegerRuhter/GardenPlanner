import { describe, expect, it } from "vitest";
import { PALETTE_SLOTS, PLANT_MAPS, SHAPE_MAPS, SPRITE_RES } from "./maps";

const ALL_SHAPE_MAPS: [string, readonly string[]][] = [];
for (const [shape, stages] of Object.entries(SHAPE_MAPS)) {
  for (const [stage, map] of Object.entries(stages)) {
    ALL_SHAPE_MAPS.push([`${shape}/${stage}`, map]);
  }
}

const ALL_PLANT_MAPS: [string, readonly string[]][] = [];
for (const [plant, stages] of Object.entries(PLANT_MAPS)) {
  for (const [stage, map] of Object.entries(stages)) {
    ALL_PLANT_MAPS.push([`${plant}/${stage}`, map!]);
  }
}

describe("stage sprite maps (§13.5)", () => {
  it("SPRITE_RES is 16", () => {
    expect(SPRITE_RES).toBe(16);
  });

  it("covers every stage key per shape", () => {
    for (const stages of Object.values(SHAPE_MAPS)) {
      expect(Object.keys(stages)).toHaveLength(11);
    }
  });

  it.each(ALL_SHAPE_MAPS)("%s is 16×16 and uses only palette slots", (_k, map) => {
    expect(map).toHaveLength(SPRITE_RES);
    for (const row of map) {
      expect(row).toHaveLength(SPRITE_RES);
      for (const ch of row) expect(PALETTE_SLOTS.has(ch)).toBe(true);
    }
  });

  it.each(ALL_PLANT_MAPS)("plant override %s is 16×16 and uses only palette slots", (_k, map) => {
    expect(map).toHaveLength(SPRITE_RES);
    for (const row of map) {
      expect(row).toHaveLength(SPRITE_RES);
      for (const ch of row) expect(PALETTE_SLOTS.has(ch)).toBe(true);
    }
  });
});
