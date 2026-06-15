/**
 * PNG sprite registry — full-color 32x32 sprites keyed by iconKey and stage.
 * Falls back to character-map rendering for plants without PNG sprites.
 */

import type { StageKey } from "../../types/models";
import { CORN_SPRITES } from "./corn";

/** Resolution of PNG sprites in pixels. */
export const PNG_RES = 32;

/**
 * Registry of PNG sprite data URLs, keyed by iconKey then stage.
 * Values are base64-encoded data:image/png URLs ready for <img src> or canvas drawImage.
 */
export const PNG_SPRITES: Record<string, Partial<Record<StageKey, string>>> = {};

// Register per-plant PNG sprite modules
PNG_SPRITES["sweet_corn"] = CORN_SPRITES;
