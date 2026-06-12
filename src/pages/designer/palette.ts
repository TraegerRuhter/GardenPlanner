/**
 * §12.4 tile palette: visual + metadata definitions for every placeable
 * non-plant tile kind. Colors render on canvas; glyphs stand in for bespoke
 * structure sprites until the Phase 5 art pass.
 */

import type {
  HardscapeKind,
  StructureKind,
  WaterFeatureKind,
} from "../../types/models";

export type Tool =
  | { t: "select" }
  | { t: "erase" }
  | { t: "elev_up" }
  | { t: "elev_down" }
  | { t: "plant"; plantId: string }
  | { t: "structure"; kind: StructureKind }
  | { t: "hardscape"; kind: HardscapeKind }
  | { t: "water"; kind: WaterFeatureKind };

export const STRUCTURES: Record<StructureKind, { label: string; glyph: string; color: string; heightCm: number }> = {
  trellis: { label: "Trellis", glyph: "#", color: "#8a6a4f", heightCm: 180 },
  cage: { label: "Cage", glyph: "◫", color: "#9a8a72", heightCm: 120 },
  stake: { label: "Stake", glyph: "|", color: "#8a6a4f", heightCm: 150 },
  mound: { label: "Mound", glyph: "◠", color: "#7d5c46", heightCm: 25 },
  raised_edge: { label: "Raised edge", glyph: "▭", color: "#6e5238", heightCm: 30 },
  fence: { label: "Fence", glyph: "‖", color: "#75594a", heightCm: 180 },
  arch: { label: "Arch", glyph: "∩", color: "#8a6a4f", heightCm: 220 },
  cold_frame: { label: "Cold frame", glyph: "⌂", color: "#9bb1c4", heightCm: 40 },
  row_cover: { label: "Row cover", glyph: "≋", color: "#cfd8e3", heightCm: 60 },
};

export const HARDSCAPES: Record<HardscapeKind, { label: string; color: string }> = {
  path: { label: "Path", color: "#c4ad8b" },
  rock: { label: "Rock", color: "#9aa0a6" },
  grass: { label: "Grass", color: "#7fb069" },
  mulch: { label: "Mulch", color: "#6e4f35" },
  paver: { label: "Paver", color: "#b0a79b" },
  soil: { label: "Soil", color: "#7d5c46" },
  gravel: { label: "Gravel", color: "#b5b0a4" },
};

export const WATER: Record<WaterFeatureKind, { label: string; glyph: string; color: string }> = {
  drip_line: { label: "Drip line", glyph: "┄", color: "#4f8fc4" },
  soaker_hose: { label: "Soaker hose", glyph: "〰", color: "#4f8fc4" },
  sprinkler_head: { label: "Sprinkler", glyph: "✳", color: "#4f8fc4" },
  rain_barrel: { label: "Rain barrel", glyph: "◍", color: "#3a6f9e" },
  pond: { label: "Pond", glyph: "≈", color: "#5fa8d3" },
  spigot: { label: "Spigot", glyph: "⊤", color: "#3a6f9e" },
};

/** Canvas pixels per tile at zoom 1. */
export const TILE_PX = 40;

/** Base terrain for an empty garden-bed tile. */
export const SOIL_BASE = "#8a6a50";
export const GRID_LINE = "rgba(60,40,20,0.25)";
