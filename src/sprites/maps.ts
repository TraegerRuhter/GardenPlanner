/**
 * Stage sprite pixel maps (§13.5, §21.4). One 16×16 map per StageKey, drawn
 * side-on, plus root-crop overrides for the sizing/harvest stages (the yield
 * is at the soil line, not on the plant). Characters are palette slots so a
 * single map renders per-category (and per-plant accent) variants:
 *
 *   .  transparent      s  stem          f  accent (fruit/bloom)
 *   m  soil light       l  leaf          F  accent shade
 *   M  soil dark        L  leaf shade    y  dry/senescent
 *   w  wood/stub
 */

import type { StageKey } from "../types/models";

export type PixelMap = readonly string[];

const SOIL = [
  "....mmmmmmmm....",
  "..mmMMMMMMMMmm..",
  ".mMMMMMMMMMMMMm.",
  "................",
] as const;

function withSoil(top: readonly string[]): PixelMap {
  return [...top, ...SOIL];
}

export const STAGE_MAPS: Record<StageKey, PixelMap> = {
  planted: withSoil([
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "......ff........", // seed peeking at the soil line
    "................",
  ]),

  germination: withSoil([
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".......ll.......",
    "......ss........", // crack + emerging nub
    "................",
  ]),

  sprout: withSoil([
    "................",
    "................",
    "................",
    "...ll......ll...",
    "..llll....llll..",
    "..lllll..lllll..",
    "...llllssllll...",
    ".....llssll.....",
    ".......ss.......",
    ".......ss.......",
    ".......ss.......",
    ".......ss.......",
  ]),

  seedling: withSoil([
    "................",
    "................",
    "......llll......",
    ".....llllll.....",
    "..ll..llll..ll..",
    ".llll..ss..llll.",
    ".lllll.ss.lllll.",
    "..llllsssslll...",
    "....llssssll....",
    ".......ss.......",
    ".......ss.......",
    ".......ss.......",
  ]),

  vegetative: withSoil([
    "......llll......",
    "....llllllll....",
    "...llllLlllll...",
    "..lllLllllLlll..",
    "..llllllllllll..",
    ".lllLllssllLlll.",
    ".lllllsssslllll.",
    "..lllLssssLlll..",
    "...llllssllll...",
    ".....llssll.....",
    ".......ss.......",
    ".......ss.......",
  ]),

  budding: withSoil([
    "....f.llll.f....",
    "....llllllll....",
    "...lfllLllfll...",
    "..lllLllllLlll..",
    "..llllllllllll..",
    ".lllLllssllLlll.",
    ".lllllsssslllll.",
    "..lllLssssLlll..",
    "...llllssllll...",
    ".....llssll.....",
    ".......ss.......",
    ".......ss.......",
  ]),

  flowering: withSoil([
    "...ff.llll.ff...",
    "...fFllllllFf...",
    "..llfllLlllfll..",
    "..lllLllllLlll..",
    ".lfFllllllllFfl.",
    ".lllLllssllLlll.",
    ".lllllsssslllll.",
    "..lllLssssLlll..",
    "...llllssllll...",
    ".....llssll.....",
    ".......ss.......",
    ".......ss.......",
  ]),

  fruiting: withSoil([
    "......llll......",
    "....llllllll....",
    "...lllLllllll...",
    "..lfflllllffll..",
    "..lffLllllffFl..",
    ".lllLllssllLlll.",
    ".llffLssssffll..",
    "..lfFlssssfFll..",
    "...llllssllll...",
    ".....llssll.....",
    ".......ss.......",
    ".......ss.......",
  ]),

  harvest: withSoil([
    "....ffllllff....",
    "...fFFllllFFf...",
    "..lffllLlllffl..",
    "..lllLllllLlll..",
    ".lffllllllllffl.",
    ".lfFLllssllLfFl.",
    ".lllllsssslllll.",
    "..lffLssssLffl..",
    "...lfFlsslfFl...",
    ".....llssll.....",
    ".......ss.......",
    ".......ss.......",
  ]),

  senescence: withSoil([
    "................",
    "....yy..........",
    "...yyyy....yy...",
    "....yyy...yyyy..",
    ".....yy..yyy....",
    "......yy.yy.....",
    ".......yyy......",
    ".......yy.......",
    "......yy........",
    "......yy........",
    ".......yy.......",
    ".......yy.......",
  ]),

  dormant: withSoil([
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "......ww........",
    "......ww........",
    "......ww........",
    "......ww........",
  ]),
};

/** Root crops show the swelling root at the soil line instead of canopy fruit. */
export const ROOT_STAGE_MAPS: Partial<Record<StageKey, PixelMap>> = {
  fruiting: withSoil([
    "................",
    "....ll....ll....",
    "...llll..llll...",
    "....lllsslll....",
    ".....llssll.....",
    "......ssss......",
    ".......ss.......",
    ".......ss.......",
    ".......ss.......",
    "......ffff......",
    "......ffFf......", // shoulders emerging
    "................",
  ]),
  harvest: withSoil([
    "....ll....ll....",
    "...llll..llll...",
    "..lllll..lllll..",
    "....lllsslll....",
    ".....llssll.....",
    "......ssss......",
    ".......ss.......",
    "......ffff......",
    ".....ffffff.....",
    ".....ffFFff.....",
    "......ffff......",
    "................",
  ]),
};

/** Maps must stay 16×16 and only use palette slots; verified by tests. */
export const PALETTE_SLOTS = new Set([
  ".",
  "m",
  "M",
  "s",
  "l",
  "L",
  "f",
  "F",
  "y",
  "w",
]);
