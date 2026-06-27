/**
 * Sprite resolution (§13.5, §21.4): iconKey + stage → rendered data URL.
 * A procedural generator builds a 32×32 grid of palette slots for the plant's
 * shape archetype + growth stage (see generate.ts); the per-category palette,
 * per-plant accents (tomato red, carrot orange…) and runtime customizations
 * derive the slot colors, so every plant stays fully recolorable. A
 * canvas-backed cache keeps re-renders free.
 */

import type { PlantCategory, StageKey } from "../types/models";
import type { SpriteShape } from "./shapes";
import { buildSlotPalette, generateGrid, generateProduce, GRID_SIZE } from "./generate";

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

/** Per-plant accent colors, keyed by iconKey (sprite-layer data, not catalog).
 *  Usually just the fruit/bloom accent (f/F), but any palette slot may be
 *  overridden — e.g. red rhubarb stalks (s) or blue-green aloe pads (l/L). */
const ACCENTS: Record<string, Partial<Palette>> = {
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
  cabbage: { f: "#a8d08a", F: "#84ab66" },
  sunflower: { f: "#f2c12e", F: "#d29a1e" },
  // tranche 3
  eggplant: { f: "#5b2a83", F: "#3f1d5c" },
  hot_pepper: { f: "#cc2a1e", F: "#9e1f16" },
  tomatillo: { f: "#a8c24f", F: "#84993a" },
  summer_squash: { f: "#e8c33a", F: "#c39e22" },
  winter_squash: { f: "#c8893f", F: "#a06a2c" },
  pumpkin: { f: "#e0701f", F: "#b4540f" },
  watermelon: { f: "#4a8f54", F: "#2a5c33" },
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
  // tranche 6
  snow_pea: { f: "#9ccf6f", F: "#78a84f" },
  shelling_pea: { f: "#7ab648", F: "#5c9233" },
  yardlong_bean: { f: "#6a9a4a", F: "#4f7a36" },
  lentil: { f: "#c9b884", F: "#a4945e" },
  bitter_melon: { f: "#8fbf5a", F: "#6c993e" },
  luffa: { f: "#7faa48", F: "#5e8634" },
  cucamelon: { f: "#5a9a4a", F: "#42763a" },
  rapini: { f: "#5a9a3a", F: "#42762a" },
  romanesco: { f: "#b0d050", F: "#88b038" },
  gai_lan: { f: "#4f8a5a", F: "#3a6a42" },
  watercress: { f: "#6abf6a", F: "#4f9a4f" },
  komatsuna: { f: "#5aa83a", F: "#42822a" },
  cress: { f: "#7fc060", F: "#5e9842" },
  salsify: { f: "#ddd2a8", F: "#b8ac80" },
  burdock: { f: "#a8845a", F: "#826240" },
  orach: { f: "#9a3a5a", F: "#762a44" },
  spinach_beet: { f: "#3a7d44", F: "#2a5c33" },
  garlic_chives: { f: "#cfe0a8", F: "#abbd80" },
  romaine_lettuce: { f: "#8fcf6f", F: "#6aa84f" },
  butterhead_lettuce: { f: "#b0d88a", F: "#8cb466" },
  // tranche 7
  cherry_tomato: { f: "#e0452e", F: "#b0331f" },
  paste_tomato: { f: "#d23c2e", F: "#a02a20" },
  cape_gooseberry: { f: "#e8b53a", F: "#c2911e" },
  spaghetti_squash: { f: "#e8d26a", F: "#c2ab44" },
  acorn_squash: { f: "#2f5f3a", F: "#234628" },
  honeydew: { f: "#cfe0a0", F: "#abbd78" },
  armenian_cucumber: { f: "#b6cf7a", F: "#92ab56" },
  florence_fennel: { f: "#cfe0a8", F: "#abbd80" },
  cumin: { f: "#c9bf7a", F: "#a49a54" },
  caraway: { f: "#b8a86a", F: "#928444" },
  good_king_henry: { f: "#3a7d44", F: "#2a5c33" },
  horseradish: { f: "#e8e2c8", F: "#c4bea0" },
  land_cress: { f: "#6abf5a", F: "#4f9a40" },
  elephant_garlic: { f: "#d8c0c8", F: "#b09aa0" },
  globe_artichoke: { f: "#7a9a6a", F: "#5c7a4c" },
  cardoon: { f: "#9ab08a", F: "#76906a" },
  shiso: { f: "#8a4a6a", F: "#6a3450" },
  anise_hyssop: { f: "#8a6abf", F: "#6a4f9a" },
  bee_balm: { f: "#d6402e", F: "#a82c1e" },
  lemongrass: { f: "#9bbf6a", F: "#78994a" },
  // tranche 8
  bachelor_button: { f: "#4a6fc0", F: "#3654a0" },
  tithonia: { f: "#e8641f", F: "#bd4810" },
  strawflower: { f: "#e8b13a", F: "#c28e1e" },
  echinacea: { f: "#c95a8a", F: "#a23f6a" },
  dahlia: { f: "#d6447a", F: "#b0305f" },
  china_aster: { f: "#a06ac0", F: "#7c4f9a" },
  safflower: { f: "#e88a1f", F: "#bd6810" },
  quinoa: { f: "#d2a83a", F: "#ad861e" },
  peanut: { f: "#d8c590", F: "#b4a068" },
  hyacinth_bean: { f: "#7a4fb3", F: "#5b3a8c" },
  purple_sprouting_broccoli: { f: "#7a5a8a", F: "#5c4068" },
  sea_kale: { f: "#9ab0a0", F: "#76907c" },
  winter_melon: { f: "#8aa86a", F: "#68844a" },
  anise: { f: "#c9c27a", F: "#a49c54" },
  angelica: { f: "#9ab06a", F: "#76904a" },
  winter_savory: { f: "#b0c0a0", F: "#8a9a7a" },
  hyssop: { f: "#6a7abf", F: "#4f5e9a" },
  stevia: { f: "#8fbf6a", F: "#6c994a" },
  yarrow: { f: "#ddd0a8", F: "#b8ac80" },
  feverfew: { f: "#f0ead0", F: "#ccc6aa" },
  celtuce: { f: "#9bc46a", F: "#79a04a" },
  cutting_celery: { f: "#8fb05a", F: "#6c8a3e" },
  // tranche 9 (perennial fruit + specialty)
  apple: { f: "#d6403a", F: "#a82c28" },
  pear: { f: "#c3d24a", F: "#9aa82e" },
  raspberry: { f: "#c0304f", F: "#8e2038" },
  blackberry: { f: "#3a2a4a", F: "#241a30" },
  blueberry: { f: "#5566b0", F: "#3a4684" },
  strawberry: { f: "#e23b4b", F: "#b22a38" },
  potato: { f: "#c9a26a", F: "#9a774a" },
  rhubarb: { f: "#c0392b", F: "#8e2b20", s: "#c0392b" }, // red leaf stalks
  asparagus: { f: "#6aa83f", F: "#4f8a2c" },
  aloe_vera: { f: "#e8703a", F: "#bd5526", l: "#6fae84", L: "#4c8a64" }, // blue-green pads

  prickly_pear: { f: "#c0407a", F: "#922f5c" },
  // tranche 10 (more perennial fruit + creeping herb)
  cherry: { f: "#a01828", F: "#7a101c" },
  fig: { f: "#6a4a6e", F: "#4a3050" },
  currant: { f: "#9a1f3a", F: "#6e1428" },
  gooseberry: { f: "#9ab84a", F: "#76902e" },
  grape: { f: "#6a3a8a", F: "#4a2860" },
  thyme: { f: "#9a7cc0", F: "#745aa0" },
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
  broccoli: "crown",
  kale: "leafy",
  lettuce_leaf: "leafy",
  spinach: "leafy",
  basil: "herb",
  sunflower: "tall",
  // tranche 3
  eggplant: "bush",
  hot_pepper: "bush",
  tomatillo: "bush",
  summer_squash: "gourd",
  winter_squash: "gourd",
  pumpkin: "gourd",
  watermelon: "gourd",
  cantaloupe: "gourd",
  lima_bean: "bush",
  fava_bean: "tall",
  edamame: "bush",
  runner_bean: "climbing",
  cauliflower: "crown",
  cabbage: "head",
  brussels_sprouts: "sprouts",
  collards: "leafy",
  bok_choy: "leafy",
  mustard_greens: "leafy",
  turnip: "root",
  parsnip: "root",
  celery: "stalk",
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
  sweet_corn: "cob",
  okra: "tall",
  sweet_potato: "tuber",
  cowpea: "bush",
  chickpea: "bush",
  kohlrabi: "bulb",
  rutabaga: "root",
  daikon: "root",
  napa_cabbage: "head",
  mizuna: "leafy",
  tatsoi: "leafy",
  celeriac: "root",
  endive: "leafy",
  radicchio: "head",
  sunchoke: "tuber",
  ground_cherry: "bush",
  gourd: "gourd",
  amaranth: "leafy",
  // tranche 6
  snow_pea: "climbing",
  shelling_pea: "climbing",
  yardlong_bean: "climbing",
  lentil: "bush",
  bitter_melon: "gourd",
  luffa: "gourd",
  cucamelon: "vine",
  rapini: "leafy",
  romanesco: "crown",
  gai_lan: "leafy",
  watercress: "leafy",
  komatsuna: "leafy",
  cress: "leafy",
  salsify: "root",
  burdock: "root",
  orach: "leafy",
  spinach_beet: "leafy",
  garlic_chives: "grass",
  romaine_lettuce: "head",
  butterhead_lettuce: "head",
  // tranche 7
  cherry_tomato: "bush",
  paste_tomato: "bush",
  cape_gooseberry: "bush",
  spaghetti_squash: "gourd",
  acorn_squash: "gourd",
  honeydew: "gourd",
  armenian_cucumber: "vine",
  florence_fennel: "bulb",
  cumin: "herb",
  caraway: "herb",
  good_king_henry: "leafy",
  horseradish: "root",
  land_cress: "leafy",
  elephant_garlic: "bulb",
  globe_artichoke: "tall",
  cardoon: "stalk",
  shiso: "herb",
  anise_hyssop: "herb",
  bee_balm: "flower",
  lemongrass: "grass",
  // tranche 8
  bachelor_button: "flower",
  tithonia: "flower",
  strawflower: "flower",
  echinacea: "flower",
  dahlia: "flower",
  china_aster: "flower",
  safflower: "flower",
  quinoa: "tall",
  peanut: "bush",
  hyacinth_bean: "climbing",
  purple_sprouting_broccoli: "crown",
  sea_kale: "leafy",
  winter_melon: "gourd",
  anise: "herb",
  angelica: "tall",
  winter_savory: "herb",
  hyssop: "herb",
  stevia: "herb",
  yarrow: "flower",
  feverfew: "flower",
  celtuce: "stalk",
  cutting_celery: "herb",
  // tranche 9 (perennial fruit + specialty)
  apple: "tree",
  pear: "tree",
  raspberry: "cane",
  blackberry: "cane",
  blueberry: "shrub",
  strawberry: "mat",
  potato: "tuber",
  rhubarb: "stalk",
  asparagus: "fern",
  aloe_vera: "succulent",
  prickly_pear: "cactus",
  // tranche 10 (more perennial fruit + creeping herb)
  cherry: "tree",
  fig: "tree",
  currant: "shrub",
  gooseberry: "shrub",
  grape: "climbing",
  thyme: "mat",
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

/** Shapes whose silhouette IS the foliage: the harvested part is the plant
 *  body, so the per-plant accent — picked to match the crop's real color (red
 *  radicchio, white cauliflower, purple sprouting broccoli) — should drive the
 *  leaf slot, not an otherwise-unused fruit slot. Stalk crops promote to the
 *  stem slot (pale celery, grey-green cardoon) instead. This keeps each plant
 *  sprite and its produce icon in the same hue. */
const LEAF_SHAPES = new Set<SpriteShape>(["leafy", "head", "crown", "sprouts", "fern"]);

function paletteFor(iconKey: string, category: PlantCategory): Palette {
  const base = CATEGORY_PALETTES[category];
  const accent = ACCENTS[iconKey];
  const dynamic = DYNAMIC_ACCENTS.get(iconKey);
  const resolved: Palette = { ...base, ...accent, ...dynamic };
  // Only promote when an explicit accent color exists, so plants relying on the
  // category default stay their default green rather than borrowing a red fruit.
  const accentColor = dynamic?.f ?? accent?.f;
  const accentDeep = dynamic?.F ?? accent?.F;
  if (accentColor !== undefined) {
    const has = (k: keyof Palette) => accent?.[k] !== undefined || dynamic?.[k] !== undefined;
    const shape = getPlantShape(iconKey);
    if (LEAF_SHAPES.has(shape)) {
      if (!has("l")) resolved.l = accentColor;
      if (!has("L")) resolved.L = accentDeep ?? resolved.L;
    } else if (shape === "stalk" && !has("s")) {
      resolved.s = accentColor;
    }
  }
  return resolved;
}

/** Paint a slot grid to a crisp data URL.
 *  32px art. scale 2 → 1× (32px = TILE_PX, blits 1:1), scale 6 → 3× (96px).
 *  Output dims equal the old 16px maps' (16×scale), so consumers are unchanged. */
function renderToDataURL(
  grid: (string | null)[][],
  slots: Record<string, string>,
  scale: number,
): string {
  const px = Math.max(1, Math.round(scale / 2));
  const canvas = document.createElement("canvas");
  canvas.width = GRID_SIZE * px;
  canvas.height = GRID_SIZE * px;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const slot = grid[y][x];
      if (!slot) continue;
      ctx.fillStyle = slots[slot] ?? "#ff00ff";
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
  return canvas.toDataURL();
}

/** Render (and cache) the sprite for a plant at a stage as a data URL. */
export function spriteFor(
  iconKey: string,
  category: PlantCategory,
  stage: StageKey,
  scale = 2,
): string {
  const key = `${iconKey}/${category}/${stage}/${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const grid = generateGrid(getPlantShape(iconKey), stage);
  const slots = buildSlotPalette(paletteFor(iconKey, category));
  const url = renderToDataURL(grid, slots, scale);
  cache.set(key, url);
  return url;
}

/** Render (and cache) the harvested-produce icon for a plant as a data URL.
 *  Stage-independent (the ripe yield only); recolors via the same palette as
 *  the plant sprite. Keyed under the iconKey so accent/shape edits invalidate it. */
export function produceFor(
  iconKey: string,
  category: PlantCategory,
  scale = 2,
): string {
  const key = `${iconKey}/produce/${category}/${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const grid = generateProduce(getPlantShape(iconKey));
  const slots = buildSlotPalette(paletteFor(iconKey, category));
  const url = renderToDataURL(grid, slots, scale);
  cache.set(key, url);
  return url;
}
