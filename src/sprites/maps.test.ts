import { describe, expect, it } from "vitest";
import { PALETTE_SLOTS, SHAPE_MAPS, SPRITE_RES } from "./maps";

const ALL_MAPS: [string, readonly string[]][] = [];
for (const [shape, stages] of Object.entries(SHAPE_MAPS)) {
  for (const [stage, map] of Object.entries(stages)) {
    ALL_MAPS.push([`${shape}/${stage}`, map]);
  }
}

describe("stage sprite maps (§13.5)", () => {
  it("covers every stage key per shape", () => {
    for (const stages of Object.values(SHAPE_MAPS)) {
      expect(Object.keys(stages)).toHaveLength(11);
    }
  });

  it.each(ALL_MAPS)("%s is 32×32 and uses only palette slots", (_k, map) => {
    expect(map).toHaveLength(SPRITE_RES);
    for (const row of map) {
      expect(row).toHaveLength(SPRITE_RES);
      for (const ch of row) expect(PALETTE_SLOTS.has(ch)).toBe(true);
    }
  });
});
