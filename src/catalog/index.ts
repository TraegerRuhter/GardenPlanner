/**
 * Bundled catalog (§7.1): read-mostly data shipped with the app, seeded into
 * IndexedDB on first run and re-seeded when CATALOG_VERSION changes (app
 * update). Authored as type-checked TS modules rather than raw JSON so every
 * record is validated against the §7 contracts at compile time; export/import
 * (§23) still round-trips plain JSON.
 */

export { families } from "./families";
export { stageTemplates } from "./stageTemplates";
import { plants as corePlants } from "./plants";
import { plantsExpansion } from "./plantsExpansion";
import { plantsTranche3 } from "./plantsTranche3";
import { plantsTranche4 } from "./plantsTranche4";
import { plantsTranche5 } from "./plantsTranche5";
import { plantsTranche6 } from "./plantsTranche6";
import { plantsTranche7 } from "./plantsTranche7";
import { plantsTranche8 } from "./plantsTranche8";

/** Core 15 (Phase 0) + tranches 2-8 (staples, herbs, flowers, more veg). Remaining §28.2: backlog. */
export const plants = [
  ...corePlants,
  ...plantsExpansion,
  ...plantsTranche3,
  ...plantsTranche4,
  ...plantsTranche5,
  ...plantsTranche6,
  ...plantsTranche7,
  ...plantsTranche8,
];
export { varietals } from "./varietals";
export { companions } from "./companions";
export { recipes } from "./recipes";
export { diagnostics } from "./diagnostics";

/** Bump whenever bundled catalog content changes; drives re-seeding. */
export const CATALOG_VERSION = 10;
