// Reads the 10 extracted sunflower frames (data URLs) and emits a TypeScript
// PNG-sprite module mapping them onto the app's 11 lifecycle stages.
import fs from "fs";

const urls = JSON.parse(fs.readFileSync("/tmp/sunflower-urls.json", "utf8"));
// Source frames (index 0..9):
// 0 seed in soil, 1 emerging shoot, 2 seedling, 3 leafy plant, 4 bud forming,
// 5 open bloom, 6 maturing head, 7 drooping head, 8 dried seed head, 9 debris.
const stageToFrame = {
  planted: 0,
  germination: 1,
  sprout: 1,
  seedling: 2,
  vegetative: 3,
  budding: 4,
  flowering: 5,
  fruiting: 6,
  harvest: 7,
  senescence: 8,
  dormant: 9,
};

const order = [
  "planted", "germination", "sprout", "seedling", "vegetative",
  "budding", "flowering", "fruiting", "harvest", "senescence", "dormant",
];

const lines = [
  "// AUTO-GENERATED from a sunflower lifestage sprite sheet by",
  "// scripts/build-sunflower-sprites.mjs — do not edit by hand.",
  'import type { StageKey } from "../../types/models";',
  "",
  "export const SUNFLOWER_SPRITES: Partial<Record<StageKey, string>> = {",
];
for (const stage of order) {
  const url = urls[stageToFrame[stage]];
  if (!url) throw new Error(`missing frame for ${stage}`);
  lines.push(`  ${stage}: "${url}",`);
}
lines.push("};", "");

fs.writeFileSync("src/sprites/png/sunflower.ts", lines.join("\n"));
console.log("Wrote src/sprites/png/sunflower.ts");
