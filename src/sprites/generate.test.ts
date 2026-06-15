import { describe, expect, it } from "vitest";
import type { StageKey } from "../types/models";
import { SHAPE_LABELS, type SpriteShape } from "./shapes";
import { buildSlotPalette, generateGrid, GRID_SIZE } from "./generate";

const SHAPES = Object.keys(SHAPE_LABELS) as SpriteShape[];
const STAGES: StageKey[] = [
  "planted", "germination", "sprout", "seedling", "vegetative", "budding",
  "flowering", "fruiting", "harvest", "senescence", "dormant",
];

const SRC = {
  l: "#58a854", L: "#3f8f4f", f: "#d23c2e", F: "#a02a20",
  s: "#3a7d44", m: "#7d5c46", M: "#5c4033", y: "#b8a05a", w: "#8a6a4f",
};
const SLOTS = new Set(Object.keys(buildSlotPalette(SRC)));

const has = (g: (string | null)[][], slot: string) => g.some((row) => row.includes(slot));
const filled = (g: (string | null)[][]) => g.reduce((n, row) => n + row.filter(Boolean).length, 0);

const PAIRS: [SpriteShape, StageKey][] = [];
for (const sh of SHAPES) for (const st of STAGES) PAIRS.push([sh, st]);

describe("procedural sprite generator", () => {
  it("covers all 15 shape archetypes", () => {
    expect(SHAPES).toHaveLength(15);
  });

  it.each(PAIRS)("%s/%s is a 32×32 grid of known slots and non-empty", (shape, stage) => {
    const g = generateGrid(shape, stage);
    expect(g).toHaveLength(GRID_SIZE);
    for (const row of g) {
      expect(row).toHaveLength(GRID_SIZE);
      for (const cell of row) if (cell) expect(SLOTS.has(cell)).toBe(true);
    }
    expect(filled(g)).toBeGreaterThan(8);
  });

  it("derives a complete hex slot palette including the outline", () => {
    const pal = buildSlotPalette(SRC);
    for (const hex of Object.values(pal)) expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(pal.ol).toBe("#241813");
  });

  it("gates produce by stage (no fruit while vegetative, fruit at harvest)", () => {
    expect(has(generateGrid("bush", "vegetative"), "fm")).toBe(false);
    expect(has(generateGrid("bush", "harvest"), "fm")).toBe(true);
  });

  it("recolors leaves to senescent tones at senescence", () => {
    const sen = generateGrid("bush", "senescence");
    expect(has(sen, "lm")).toBe(false);
    expect(has(sen, "ym") || has(sen, "yh") || has(sen, "yl")).toBe(true);
  });

  it("renders a bare woody stub when dormant", () => {
    expect(has(generateGrid("bush", "dormant"), "wl")).toBe(true);
  });
});
