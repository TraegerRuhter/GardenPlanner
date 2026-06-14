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

// Quality invariants for the hand-crafted growth stages. The soil band is the
// last 8 rows, so plant content lives in rows 0..23 and the tile center is
// col 15.5. Sprout/seedling are exempt — a just-emerged seedling is legitimately
// a few px of stem.
const MATURE_STAGES = ["vegetative", "budding", "flowering", "fruiting", "harvest"] as const;
const CONTENT_ROWS = SPRITE_RES - 8; // 24
const SHAPE_NAMES = Object.keys(SHAPE_MAPS);

function contentBox(map: readonly string[]) {
  let minCol = SPRITE_RES;
  let maxCol = -1;
  let maxRow = -1;
  for (let r = 0; r < CONTENT_ROWS; r++) {
    for (let c = 0; c < SPRITE_RES; c++) {
      if (map[r][c] !== ".") {
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
        if (r > maxRow) maxRow = r;
      }
    }
  }
  return { minCol, maxCol, maxRow };
}

describe("growth-stage sprite quality (§13.5)", () => {
  it.each(SHAPE_NAMES)("%s mature stages have no bare thin-stem lines", (shape) => {
    for (const stage of MATURE_STAGES) {
      const map = (SHAPE_MAPS as Record<string, Record<string, readonly string[]>>)[shape][stage];
      // Count rows whose only content is a thin run of green stem (≤3 `s`).
      // Wood `w` (trellis poles, woody stubs) is intentional and excluded.
      let thin = 0;
      for (let r = 0; r < CONTENT_ROWS; r++) {
        const nonDot = map[r].replace(/\./g, "");
        if (nonDot.length > 0 && nonDot.length <= 3 && /^s+$/.test(nonDot)) thin++;
      }
      expect(thin, `${shape}/${stage} thin-stem rows`).toBeLessThanOrEqual(2);
    }
  });

  it.each(SHAPE_NAMES)("%s mature stages are centered on the tile and reach the soil", (shape) => {
    for (const stage of MATURE_STAGES) {
      const map = (SHAPE_MAPS as Record<string, Record<string, readonly string[]>>)[shape][stage];
      const { minCol, maxCol, maxRow } = contentBox(map);
      const offset = Math.abs((minCol + maxCol) / 2 - (SPRITE_RES / 2 - 0.5));
      expect(offset, `${shape}/${stage} horizontal center offset`).toBeLessThanOrEqual(2);
      expect(maxRow, `${shape}/${stage} lowest content row`).toBeGreaterThanOrEqual(CONTENT_ROWS - 2);
    }
  });
});
