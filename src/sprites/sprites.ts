/**
 * Sprite resolution (§13.5, §21.4): iconKey + stage → rendered data URL.
 * Generic stage maps render with a per-category palette; per-plant accents
 * (tomato red, carrot orange…) override the accent slot; root crops swap in
 * the root-yield maps. A canvas-backed cache keeps re-renders free.
 */

import type { PlantCategory, StageKey } from "../types/models";
import { SHAPE_MAPS, type PixelMap, type SpriteShape } from "./maps";

interface Palette {
  m: string;
  M: string;
  s: string;
  l: string;
  L: string;
  f: string;
  F: string;
  y: string;
  w: string;
}

export type { Palette as SpritePalette };

const BASE: Omit<Palette, "f" | "F"> = {
  m: "#7d5c46",
  M: "#5c4033",
  s: "#3a7d44",
  l: "#58a854",
  L: "#3f8f4f",
  y: "#b8a05a",
  w: "#8a6a4f",
};

const CATEGORY_PALETTES: Record<PlantCategory, Palette> = {
  vegetable: { ...BASE, f: "#d23c2e", F: "#a02a20" },
  herb: { ...BASE, l: "#6fbf63", L: "#4c9950", f: "#e9e6ff", F: "#c9c2f0" },
  fruit: { ...BASE, l: "#4c9950", L: "#2f6f3e", f: "#7a4fb3", F: "#5b3a8c" },
  flower: { ...BASE, f: "#e76fb3", F: "#c44f93" },
  cover_crop: { ...BASE, l: "#7aa85c", L: "#5c8a45", f: "#d9c26a", F: "#b5a04e" },
  shrub: { ...BASE, l: "#3f8f4f", L: "#2f6f3e", f: "#c94f4f", F: "#a03a3a" },
  tree: { ...BASE, l: "#3f8f4f", L: "#2f6f3e", f: "#c94f4f", F: "#a03a3a" },
};

/** Dynamic accents registered at runtime for API-imported plants. */
const DYNAMIC_ACCENTS = new Map<string, Partial<Palette>>();

export function registerDynamicAccent(iconKey: string, accent: Partial<Palette>) {
  DYNAMIC_ACCENTS.set(iconKey, accent);
  // Invalidate cached sprites for this iconKey so they re-render.
  for (const k of cache.keys()) {
    if (k.startsWith(`${iconKey}/`)) cache.delete(k);
  }
}

/** Per-plant accent colors, keyed by iconKey (sprite-layer data, not catalog). */
const ACCENTS: Record<string, { f: string; F: string }> = {
  tomato: { f: "#d23c2e", F: "#a02a20" },
  pepper_sweet: { f: "#e2542f", F: "#b03c1e" },
  cucumber: { f: "#3f8f4f", F: "#2f6f3e" },
  zucchini: { f: "#2f6f3e", F: "#24512f" },
  bush_bean: { f: "#6fbf63", F: "#4c9950" },
  snap_pea: { f: "#8fcf6f", F: "#6aa84f" },
  broccoli: { f: "#3f8f4f", F: "#2f6f3e" },
  kale: { f: "#3a7d5c", F: "#2a5c44" },
  carrot: { f: "#e88a2e", F: "#c06a1e" },
  radish: { f: "#d23c50", F: "#a02a3c" },
  beet: { f: "#8c2f4f", F: "#6a2240" },
  onion_bulb: { f: "#c9a26a", F: "#a8854f" },
  lettuce_leaf: { f: "#8fcf6f", F: "#6aa84f" },
  spinach: { f: "#3a7d44", F: "#2a5c33" },
  basil: { f: "#efe9ff", F: "#cfc6ee" },
};

/** Per-plant sprite shape overrides. */
const PLANT_SHAPES = new Map<string, SpriteShape>();

/** Default shape assignments for built-in catalog plants. */
const DEFAULT_SHAPES: Record<string, SpriteShape> = {
  carrot: "root",
  radish: "root",
  beet: "root",
  onion_bulb: "bulb",
  tomato: "bush",
  pepper_sweet: "bush",
  cucumber: "vine",
  zucchini: "vine",
  bush_bean: "bush",
  snap_pea: "climbing",
  broccoli: "tall",
  kale: "leafy",
  lettuce_leaf: "leafy",
  spinach: "leafy",
  basil: "herb",
};

export function setPlantShape(iconKey: string, shape: SpriteShape) {
  PLANT_SHAPES.set(iconKey, shape);
  for (const k of cache.keys()) {
    if (k.startsWith(`${iconKey}/`)) cache.delete(k);
  }
}

export function getPlantShape(iconKey: string): SpriteShape {
  return PLANT_SHAPES.get(iconKey) ?? DEFAULT_SHAPES[iconKey] ?? "bush";
}

/** @deprecated Use setPlantShape(iconKey, "root") / setPlantShape(iconKey, "bush") */
export function setRootIcon(iconKey: string, isRoot: boolean) {
  setPlantShape(iconKey, isRoot ? "root" : "bush");
}

/** @deprecated Use getPlantShape(iconKey) === "root" */
export function isRootIcon(iconKey: string): boolean {
  return getPlantShape(iconKey) === "root";
}

export function resolvedPalette(iconKey: string, category: PlantCategory): Palette {
  return paletteFor(iconKey, category);
}

const cache = new Map<string, string>();

function mapFor(iconKey: string, stage: StageKey): PixelMap {
  const shape = getPlantShape(iconKey);
  return SHAPE_MAPS[shape][stage];
}

function paletteFor(iconKey: string, category: PlantCategory): Palette {
  const base = CATEGORY_PALETTES[category];
  const accent = ACCENTS[iconKey];
  const dynamic = DYNAMIC_ACCENTS.get(iconKey);
  return { ...base, ...accent, ...dynamic };
}

/** Render (and cache) the sprite for a plant at a stage as a data URL. */
export function spriteFor(
  iconKey: string,
  category: PlantCategory,
  stage: StageKey,
  scale = 4,
): string {
  const key = `${iconKey}/${category}/${stage}/${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const map = mapFor(iconKey, stage);
  const palette = paletteFor(iconKey, category);
  const canvas = document.createElement("canvas");
  canvas.width = 16 * scale;
  canvas.height = 16 * scale;
  const ctx = canvas.getContext("2d")!;
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const slot = map[row][col];
      if (slot === ".") continue;
      ctx.fillStyle = palette[slot as keyof Palette];
      ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}
