/**
 * IndexedDB layer (§23) via Dexie.
 *
 * Dexie chosen over bare `idb` (§6 allows either) for typed tables, compound
 * and multi-entry indexes, and ergonomic queries over the append-heavy stores
 * (instances, stageEvents, journal) that must be queried directly rather than
 * held in memory (§23).
 *
 * Version 1 declares every store named in §23 (including the §31 additions:
 * harvestEvents, seedPackets, pestSightings, pests, diseases) so the database
 * shape is stable from first install. Index notes:
 * - Schema strings list primary key first, then secondary indexes; only
 *   queried-by fields are indexed.
 * - `tasks.done` is intentionally NOT indexed: IndexedDB cannot index
 *   booleans. Open-task queries filter on a `dueOn` range instead.
 * - `catalog_companions` has no natural id; the pair is the compound key.
 */

import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  ClimateProfile,
  CompanionRelationship,
  Disease,
  DiagnosticTree,
  Garden,
  GrowthStageTemplate,
  HarvestEvent,
  JournalEntry,
  Location,
  Pest,
  PestSighting,
  Plant,
  PlantFamily,
  PlantInstance,
  Recipe,
  SeedPacket,
  Settings,
  StageEvent,
  StructureDefinition,
  Task,
  Varietal,
} from "../types/models";

/** Settings are a single keyed row; SETTINGS_ID is the only id ever used. */
export interface SettingsRecord extends Settings {
  id: string;
}
export const SETTINGS_ID = "app";

/** Photos, voice memos, and the garden background image (§23 `blobs`). */
export interface BlobRecord {
  id: string;
  blob: Blob;
  mimeType?: string;
  createdAt: string;
}

/** Timestamped adapter cache entries (§8.3, §23 `caches`). */
export interface CacheRecord {
  key: string; // e.g. "weather:forecast:<lat>,<lon>"
  fetchedAt: string;
  payload: unknown;
}

export class PlotDB extends Dexie {
  // --- Catalog (read-mostly, seeded from bundled JSON) ---
  catalog_plants!: EntityTable<Plant, "id">;
  catalog_varietals!: EntityTable<Varietal, "id">;
  catalog_recipes!: EntityTable<Recipe, "id">;
  catalog_stageTemplates!: EntityTable<GrowthStageTemplate, "id">;
  catalog_companions!: Table<CompanionRelationship, [string, string]>;
  catalog_diagnostics!: EntityTable<DiagnosticTree, "id">;
  catalog_families!: EntityTable<PlantFamily, "id">;
  catalog_pests!: EntityTable<Pest, "id">;
  catalog_diseases!: EntityTable<Disease, "id">;
  catalog_structureDefs!: EntityTable<StructureDefinition, "kind">;

  // --- User data (read/write, on device) ---
  gardens!: EntityTable<Garden, "id">;
  instances!: EntityTable<PlantInstance, "id">;
  stageEvents!: EntityTable<StageEvent, "id">;
  harvestEvents!: EntityTable<HarvestEvent, "id">;
  seedPackets!: EntityTable<SeedPacket, "id">;
  pestSightings!: EntityTable<PestSighting, "id">;
  tasks!: EntityTable<Task, "id">;
  journal!: EntityTable<JournalEntry, "id">;
  blobs!: EntityTable<BlobRecord, "id">;
  locations!: EntityTable<Location, "id">;
  climateProfiles!: EntityTable<ClimateProfile, "id">;
  settings!: EntityTable<SettingsRecord, "id">;
  caches!: EntityTable<CacheRecord, "key">;

  constructor() {
    super("plot");
    this.version(1).stores({
      catalog_plants: "id, familyId, category",
      catalog_varietals: "id, plantId",
      catalog_recipes: "id, *plantIds",
      catalog_stageTemplates: "id",
      catalog_companions: "[aPlantId+bPlantId], aPlantId, bPlantId",
      catalog_diagnostics: "id, symptom",
      catalog_families: "id",
      catalog_pests: "id",
      catalog_diseases: "id",
      catalog_structureDefs: "kind",
      gardens: "id, locationId",
      instances: "id, gardenId, areaId, plantId, status",
      stageEvents: "id, instanceId, enteredOn",
      harvestEvents: "id, instanceId, date",
      seedPackets: "id, plantId",
      pestSightings: "id, instanceId",
      tasks: "id, dueOn, gardenId, instanceId, kind",
      journal: "id, instanceId, gardenId, date",
      blobs: "id",
      locations: "id",
      climateProfiles: "id, locationId",
      settings: "id",
      caches: "key",
    });
  }
}

export const db = new PlotDB();
