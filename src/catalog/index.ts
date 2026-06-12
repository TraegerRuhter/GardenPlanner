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

/** Core 15 (Phase 0) + tranche 2 (Phase 5). Remaining §28.2 list: backlog. */
export const plants = [...corePlants, ...plantsExpansion];
export { varietals } from "./varietals";
export { companions } from "./companions";
export { recipes } from "./recipes";
export { diagnostics } from "./diagnostics";

/** Bump whenever bundled catalog content changes; drives re-seeding. */
export const CATALOG_VERSION = 3;
