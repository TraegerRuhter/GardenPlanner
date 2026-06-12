/**
 * Catalog seeding (§7.1, §23): copy the bundled catalog into the catalog_*
 * stores on first run and whenever CATALOG_VERSION changes. Idempotent —
 * keyed by a version marker in `caches`. User stores are never touched.
 */

import {
  CATALOG_VERSION,
  companions,
  diagnostics,
  families,
  plants,
  recipes,
  stageTemplates,
  varietals,
} from "../catalog";
import type { PlotDB } from "./db";

const MARKER_KEY = "catalog:version";

export async function seedCatalogIfNeeded(db: PlotDB): Promise<boolean> {
  const marker = await db.caches.get(MARKER_KEY);
  if (marker && marker.payload === CATALOG_VERSION) return false;

  await db.transaction(
    "rw",
    [
      db.catalog_families,
      db.catalog_stageTemplates,
      db.catalog_plants,
      db.catalog_varietals,
      db.catalog_companions,
      db.catalog_recipes,
      db.catalog_diagnostics,
      db.caches,
    ],
    async () => {
      await Promise.all([
        db.catalog_families.clear(),
        db.catalog_stageTemplates.clear(),
        db.catalog_plants.clear(),
        db.catalog_varietals.clear(),
        db.catalog_companions.clear(),
        db.catalog_recipes.clear(),
        db.catalog_diagnostics.clear(),
      ]);
      await Promise.all([
        db.catalog_families.bulkAdd(families),
        db.catalog_stageTemplates.bulkAdd(stageTemplates),
        db.catalog_plants.bulkAdd(plants),
        db.catalog_varietals.bulkAdd(varietals),
        db.catalog_companions.bulkAdd(companions),
        db.catalog_recipes.bulkAdd(recipes),
        db.catalog_diagnostics.bulkAdd(diagnostics),
      ]);
      await db.caches.put({
        key: MARKER_KEY,
        fetchedAt: new Date().toISOString(),
        payload: CATALOG_VERSION,
      });
    },
  );
  return true;
}
