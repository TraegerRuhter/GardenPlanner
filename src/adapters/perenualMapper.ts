/**
 * Map a Perenual API plant detail response into the app's Plant type,
 * including a procedurally-generated sprite accent derived from the
 * plant's reported colors (flower, fruit, leaf).
 */

import type { PerenualPlantDetail } from "./perenual";
import type {
  Difficulty,
  FrostTolerance,
  Level,
  Lifecycle,
  Plant,
  PlantCategory,
  PlantingMethod,
  SunRequirement,
} from "../types/models";
import { registerDynamicAccent, setPlantShape } from "../sprites/sprites";
import type { SpriteShape } from "../sprites/shapes";

const COLOR_MAP: Record<string, string> = {
  red: "#d23c2e",
  "dark red": "#8b1a1a",
  orange: "#e88a2e",
  "dark orange": "#c06a1e",
  yellow: "#e8c72e",
  "light yellow": "#f0e68c",
  green: "#3f8f4f",
  "dark green": "#2a5c33",
  "light green": "#8fcf6f",
  blue: "#4a6fa5",
  "light blue": "#7fb3d8",
  purple: "#7a4fb3",
  "dark purple": "#4a2d6e",
  violet: "#8a2be2",
  pink: "#e76fb3",
  "light pink": "#f4b8d4",
  white: "#e8e6d8",
  cream: "#f5f0dc",
  brown: "#7d5c46",
  "dark brown": "#5c4033",
  black: "#2a2a2a",
  gold: "#d4a030",
  magenta: "#c44f93",
  lavender: "#b39ed8",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  maroon: "#800020",
  burgundy: "#800020",
  coral: "#e06050",
  peach: "#f0b090",
  scarlet: "#cc2030",
  crimson: "#b01030",
  indigo: "#4b0082",
  chartreuse: "#7fff00",
};

function colorToHex(name: string): string | null {
  return COLOR_MAP[name.toLowerCase().trim()] ?? null;
}

function darken(hex: string): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function mapSunlight(sun: string[]): { sun: SunRequirement; sunHoursMin: number } {
  const joined = sun.join(" ").toLowerCase();
  if (joined.includes("full shade") || joined.includes("deep shade"))
    return { sun: "shade", sunHoursMin: 2 };
  if (joined.includes("part shade") || joined.includes("filtered") || joined.includes("part sun"))
    return { sun: "partial", sunHoursMin: 4 };
  return { sun: "full", sunHoursMin: 6 };
}

function mapWatering(w: string): { waterNeed: Level; waterMmPerWeek?: { min: number; max: number } } {
  const l = w.toLowerCase();
  if (l === "frequent" || l === "average")
    return { waterNeed: "medium", waterMmPerWeek: { min: 25, max: 40 } };
  if (l === "minimum" || l === "none")
    return { waterNeed: "low", waterMmPerWeek: { min: 10, max: 20 } };
  return { waterNeed: "medium", waterMmPerWeek: { min: 20, max: 35 } };
}

function mapCycle(cycle: string): Lifecycle {
  const c = cycle.toLowerCase();
  if (c.includes("perennial")) return "perennial";
  if (c.includes("biennial")) return "biennial";
  return "annual";
}

function mapCategory(type: string, detail: PerenualPlantDetail): PlantCategory {
  const t = type.toLowerCase();
  if (t.includes("herb")) return "herb";
  if (t.includes("flower") || t.includes("ornamental")) return "flower";
  if (t.includes("tree")) return "tree";
  if (t.includes("shrub") || t.includes("bush")) return "shrub";
  if (t.includes("fruit")) return "fruit";
  if (t.includes("cover") || t.includes("grass")) return "cover_crop";
  if (detail.edible_fruit || detail.edible_leaf || detail.cuisine) return "vegetable";
  return "vegetable";
}

function mapDifficulty(care: string | null, maintenance: string | null): Difficulty {
  const c = (care ?? maintenance ?? "").toLowerCase();
  if (c.includes("low") || c.includes("easy")) return "easy";
  if (c.includes("high") || c.includes("hard")) return "hard";
  return "moderate";
}

function mapHardiness(h: { min: string; max: string } | null): { min: number; max: number } {
  if (!h) return { min: 3, max: 11 };
  const toNum = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 5;
  return { min: toNum(h.min), max: toNum(h.max) };
}

function mapFrost(hardiness: { min: number; max: number }, tropical: boolean): FrostTolerance {
  if (tropical || hardiness.min >= 9) return "tender";
  if (hardiness.min >= 6) return "half_hardy";
  return "hardy";
}

function guessTemplate(category: PlantCategory, lifecycle: Lifecycle, detail: PerenualPlantDetail): string {
  if (category === "herb") return lifecycle === "perennial" ? "tmpl_herb_perennial" : "tmpl_herb_leafy";
  if (category === "flower") return "tmpl_flower_annual";
  if (category === "fruit" || category === "tree" || category === "shrub") return "tmpl_perennial_fruit";
  if (detail.edible_leaf) return "tmpl_leafy";
  if (detail.edible_fruit) return lifecycle === "perennial" ? "tmpl_perennial_fruit" : "tmpl_fruiting_annual";
  return "tmpl_fruiting_annual";
}

const KNOWN_FAMILIES: Record<string, string> = {
  solanaceae: "solanaceae",
  cucurbitaceae: "cucurbitaceae",
  fabaceae: "fabaceae",
  leguminosae: "fabaceae",
  brassicaceae: "brassicaceae",
  cruciferae: "brassicaceae",
  apiaceae: "apiaceae",
  umbelliferae: "apiaceae",
  amaryllidaceae: "amaryllidaceae",
  asteraceae: "asteraceae",
  compositae: "asteraceae",
  amaranthaceae: "amaranthaceae",
  chenopodiaceae: "amaranthaceae",
  rosaceae: "rosaceae",
  lamiaceae: "lamiaceae",
  labiatae: "lamiaceae",
};

function mapFamily(family: string | null): string {
  if (!family) return "other";
  const key = family.toLowerCase().trim();
  return KNOWN_FAMILIES[key] ?? key;
}

function inferShape(type: string, category: PlantCategory, detail: PerenualPlantDetail): SpriteShape {
  const t = type.toLowerCase();
  if (t.includes("grass") || t.includes("grain")) return "grass";
  if (t.includes("climber") || t.includes("vine") || t.includes("climbing")) return "climbing";
  if (t.includes("bulb")) return "bulb";
  if (category === "herb") return "herb";
  if (category === "flower") return "flower";
  if (category === "tree" || category === "shrub") return "tall";
  if (detail.edible_leaf && !detail.edible_fruit) return "leafy";
  const name = detail.common_name.toLowerCase();
  if (name.includes("carrot") || name.includes("radish") || name.includes("beet") || name.includes("turnip") || name.includes("parsnip")) return "root";
  if (name.includes("onion") || name.includes("garlic") || name.includes("shallot")) return "bulb";
  if (name.includes("cucumber") || name.includes("squash") || name.includes("melon") || name.includes("pumpkin") || name.includes("zucchini")) return "vine";
  if (name.includes("pea") || name.includes("bean") && name.includes("pole")) return "climbing";
  if (name.includes("corn") || name.includes("sunflower")) return "tall";
  if (name.includes("lettuce") || name.includes("spinach") || name.includes("chard") || name.includes("kale")) return "leafy";
  return "bush";
}

function makeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function mapPerenualToPlant(detail: PerenualPlantDetail): Plant {
  const lifecycle = mapCycle(detail.cycle);
  const category = mapCategory(detail.type, detail);
  const { sun, sunHoursMin } = mapSunlight(detail.sunlight);
  const { waterNeed, waterMmPerWeek } = mapWatering(detail.watering);
  const hardiness = mapHardiness(detail.hardiness);
  const iconKey = makeId(detail.common_name);

  // --- Procedural sprite accent from plant colors ---
  const fruitColorName = detail.fruit_color?.[0];
  const flowerColorName = detail.flower_color
    ? detail.flower_color.split(",")[0].trim()
    : null;
  const leafColorName = detail.leaf_color?.[0];

  const accentColor = (fruitColorName && colorToHex(fruitColorName))
    ?? (flowerColorName && colorToHex(flowerColorName))
    ?? null;

  const leafColor = leafColorName ? colorToHex(leafColorName) : null;

  if (accentColor || leafColor) {
    registerDynamicAccent(iconKey, {
      ...(accentColor ? { f: accentColor, F: darken(accentColor) } : {}),
      ...(leafColor && leafColor !== "#3f8f4f" ? { l: leafColor, L: darken(leafColor) } : {}),
    });
  }

  const spriteShape = inferShape(detail.type, category, detail);
  setPlantShape(iconKey, spriteShape);

  const heightCm = detail.dimensions
    ? { min: Math.round(detail.dimensions.min_value * (detail.dimensions.unit === "feet" ? 30.48 : 1)),
        max: Math.round(detail.dimensions.max_value * (detail.dimensions.unit === "feet" ? 30.48 : 1)) }
    : { min: 30, max: 60 };

  const plantingMethods: PlantingMethod[] = detail.indoor
    ? ["indoor_start", "transplant"]
    : ["direct_sow"];

  return {
    id: `perenual_${detail.id}`,
    commonName: detail.common_name,
    scientificName: detail.scientific_name?.[0] ?? detail.common_name,
    familyId: mapFamily(detail.family),
    category,
    lifecycle,
    hardinessZones: hardiness,
    heatTolerance: detail.tropical ? "high" : "medium",
    frostTolerance: mapFrost(hardiness, detail.tropical),
    waterloggingSensitivity: detail.drought_tolerant ? "low" : "medium",
    minSoilTempC: mapFrost(hardiness, detail.tropical) === "tender" ? 15 : 8,
    daysToMaturity: { min: 60, max: 90, from: "transplant" },
    sun,
    sunHoursMin,
    waterNeed,
    waterMmPerWeek,
    soilPh: { min: 6.0, max: 7.0 },
    matureHeightCm: heightCm,
    matureSpreadCm: { min: Math.round(heightCm.min * 0.5), max: Math.round(heightCm.max * 0.7) },
    spacing: { inRowCm: 30, betweenRowCm: 60 },
    plantingMethods,
    sowRules: {
      directSowWeeksFromLastFrost: { min: 0, max: 2 },
      plantingDepthCm: 1,
      germinationDays: { min: 7, max: 14 },
    },
    stageTemplateId: guessTemplate(category, lifecycle, detail),
    fertilization: {
      schedule: [
        { atStage: "vegetative", type: "balanced 10-10-10" },
      ],
    },
    commonPests: [],
    commonDiseases: [],
    harvest: {
      indicators: detail.harvest_season ? [`harvest season: ${detail.harvest_season}`] : ["check maturity"],
    },
    varietalIds: [],
    recipeIds: [],
    difficulty: mapDifficulty(detail.care_level, detail.maintenance),
    description: detail.description || `${detail.common_name} — imported from Perenual.`,
    iconKey,
    tags: [
      ...(detail.edible_fruit ? ["edible-fruit"] : []),
      ...(detail.edible_leaf ? ["edible-leaf"] : []),
      ...(detail.drought_tolerant ? ["drought-tolerant"] : []),
      ...(detail.indoor ? ["indoor"] : []),
      ...(detail.flowers ? ["flowering"] : []),
      ...(detail.cuisine ? ["culinary"] : []),
    ],
  };
}
