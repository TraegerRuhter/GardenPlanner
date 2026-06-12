import { describe, expect, it } from "vitest";
import { PALETTE_SLOTS, ROOT_STAGE_MAPS, STAGE_MAPS } from "./maps";

const ALL_MAPS = [
  ...Object.entries(STAGE_MAPS),
  ...Object.entries(ROOT_STAGE_MAPS),
];

describe("stage sprite maps (§13.5)", () => {
  it("covers every stage key", () => {
    expect(Object.keys(STAGE_MAPS)).toHaveLength(11);
  });

  it.each(ALL_MAPS)("%s is 16×16 and uses only palette slots", (_k, map) => {
    expect(map).toHaveLength(16);
    for (const row of map) {
      expect(row).toHaveLength(16);
      for (const ch of row) expect(PALETTE_SLOTS.has(ch)).toBe(true);
    }
  });
});
