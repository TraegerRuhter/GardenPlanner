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
  // tranche 3
  eggplant: { f: "#5b2a83", F: "#3f1d5c" },
  hot_pepper: { f: "#cc2a1e", F: "#9e1f16" },
  tomatillo: { f: "#a8c24f", F: "#84993a" },
  summer_squash: { f: "#e8c33a", F: "#c39e22" },
  winter_squash: { f: "#c8893f", F: "#a06a2c" },
  pumpkin: { f: "#e0701f", F: "#b4540f" },
  watermelon: { f: "#3a7d44", F: "#2a5c33" },
  cantaloupe: { f: "#d4b06a", F: "#b08f4a" },
  lima_bean: { f: "#b6c98a", F: "#93a866" },
  fava_bean: { f: "#6a9a4f", F: "#4f7a38" },
  edamame: { f: "#7ab648", F: "#5c9233" },
  runner_bean: { f: "#d6402e", F: "#a82c1e" },
  cauliflower: { f: "#eee8d0", F: "#ccc6ae" },
  brussels_sprouts: { f: "#4f8a4a", F: "#3a6a36" },
  collards: { f: "#3a7d5c", F: "#2a5c44" },
  bok_choy: { f: "#bcd07a", F: "#97ab58" },
  mustard_greens: { f: "#6aa83f", F: "#4f8a2c" },
  turnip: { f: "#b07a9a", F: "#8a5a76" },
  parsnip: { f: "#e6d8a8", F: "#c2b483" },
  celery: { f: "#9bc46a", F: "#79a04a" },
  leek: { f: "#7aa86a", F: "#5c8a4a" },
  shallot: { f: "#c08a5a", F: "#9a6a40" },
  scallion: { f: "#8fcf6f", F: "#6aa84f" },
  zinnia: { f: "#e2487f", F: "#b8366a" },
  // tranche 4 (herbs + flowers; f = bloom/foliage accent)
  oregano: { f: "#b483a8", F: "#8a6080" },
  sage: { f: "#7e8cc0", F: "#5e6a98" },
  rosemary: { f: "#8aa6d0", F: "#6a86b0" },
  lavender: { f: "#9a7cc0", F: "#745aa0" },
  marjoram: { f: "#cdb4c8", F: "#a78aa0" },
  savory: { f: "#c8cdb0", F: "#a4aa88" },
  catnip: { f: "#c2b0d0", F: "#9a88a8" },
  chives: { f: "#b07ac0", F: "#8a5a9a" },
  tarragon: { f: "#6a9a5a", F: "#4f7a40" },
  chamomile: { f: "#f3e9c0", F: "#d2c690" },
  cosmos: { f: "#e589b0", F: "#bd6890" },
  calendula: { f: "#f0972e", F: "#c4731c" },
  fennel: { f: "#d9c24a", F: "#b09c2e" },
  chervil: { f: "#e8ecd0", F: "#c4c8ac" },
  lovage: { f: "#b6c24a", F: "#92a02e" },
  // tranche 5
  sweet_corn: { f: "#e8c84a", F: "#c2a52e" },
  okra: { f: "#7faa48", F: "#5e8634" },
  sweet_potato: { f: "#c87a3f", F: "#a05c2a" },
  cowpea: { f: "#cdbf8a", F: "#a89a64" },
  chickpea: { f: "#d2c08a", F: "#ad9a64" },
  kohlrabi: { f: "#a8c060", F: "#84a040" },
  rutabaga: { f: "#b48a6a", F: "#8e6648" },
  daikon: { f: "#eef0e2", F: "#cccebe" },
  napa_cabbage: { f: "#cdd89a", F: "#a8b478" },
  mizuna: { f: "#6aa84a", F: "#4f8a34" },
  tatsoi: { f: "#3a7d4a", F: "#2a5c36" },
  celeriac: { f: "#d8c8a0", F: "#b4a47c" },
  endive: { f: "#9bbf5a", F: "#79993e" },
  radicchio: { f: "#a83048", F: "#821f34" },
  sunchoke: { f: "#c9a86a", F: "#a4844a" },
  ground_cherry: { f: "#e8c24a", F: "#c29c2e" },
  gourd: { f: "#9aa84a", F: "#76842e" },
  amaranth: { f: "#c0305a", F: "#981f44" },
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
  // tranche 3
  eggplant: "bush",
  hot_pepper: "bush",
  tomatillo: "bush",
  summer_squash: "vine",
  winter_squash: "vine",
  pumpkin: "vine",
  watermelon: "vine",
  cantaloupe: "vine",
  lima_bean: "bush",
  fava_bean: "tall",
  edamame: "bush",
  runner_bean: "climbing",
  cauliflower: "tall",
  brussels_sprouts: "tall",
  collards: "leafy",
  bok_choy: "leafy",
  mustard_greens: "leafy",
  turnip: "root",
  parsnip: "root",
  celery: "leafy",
  leek: "bulb",
  shallot: "bulb",
  scallion: "grass",
  zinnia: "flower",
  // tranche 4
  oregano: "herb",
  sage: "herb",
  rosemary: "herb",
  lavender: "herb",
  marjoram: "herb",
  savory: "herb",
  catnip: "herb",
  chives: "grass",
  tarragon: "herb",
  chamomile: "flower",
  cosmos: "flower",
  calendula: "flower",
  fennel: "herb",
  chervil: "herb",
  lovage: "tall",
  // tranche 5
  sweet_corn: "tall",
  okra: "tall",
  sweet_potato: "root",
  cowpea: "bush",
  chickpea: "bush",
  kohlrabi: "bulb",
  rutabaga: "root",
  daikon: "root",
  napa_cabbage: "leafy",
  mizuna: "leafy",
  tatsoi: "leafy",
  celeriac: "root",
  endive: "leafy",
  radicchio: "leafy",
  sunchoke: "root",
  ground_cherry: "bush",
  gourd: "vine",
  amaranth: "leafy",
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
