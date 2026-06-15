/**
 * Sprite shape archetypes (§13.5). Each plant maps to one silhouette family;
 * the procedural generator (generate.ts) draws the corresponding shape across
 * growth stages. SHAPE_LABELS drives the shape picker in the customizer.
 */

export type SpriteShape =
  | "bush"
  | "root"
  | "vine"
  | "tall"
  | "leafy"
  | "herb"
  | "flower"
  | "bulb"
  | "climbing"
  | "grass"
  | "cob"
  | "head"
  | "gourd"
  | "crown"
  | "berry";

export const SHAPE_LABELS: Record<SpriteShape, string> = {
  bush: "Bush",
  root: "Root crop",
  vine: "Vine / Trailing",
  tall: "Tall / Upright",
  leafy: "Leafy / Rosette",
  herb: "Herb",
  flower: "Flower",
  bulb: "Bulb",
  climbing: "Climbing / Trellis",
  grass: "Grass / Grain",
  cob: "Cob / Ear",
  head: "Head / Ball",
  gourd: "Gourd / Ground fruit",
  crown: "Crown / Floret",
  berry: "Berry bush",
};
