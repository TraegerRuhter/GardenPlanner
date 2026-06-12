import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { PlotDB } from "./db";
import { seedCatalogIfNeeded } from "./seed";
import { plants } from "../catalog";

describe("catalog seeding (§7.1)", () => {
  let db: PlotDB;

  beforeAll(async () => {
    db = new PlotDB();
    await seedCatalogIfNeeded(db);
  });

  it("seeds every catalog store", async () => {
    expect(await db.catalog_plants.count()).toBe(plants.length);
    expect(await db.catalog_families.count()).toBeGreaterThan(0);
    expect(await db.catalog_stageTemplates.count()).toBeGreaterThan(0);
    expect(await db.catalog_varietals.count()).toBeGreaterThan(0);
    expect(await db.catalog_companions.count()).toBeGreaterThan(0);
    expect(await db.catalog_recipes.count()).toBeGreaterThan(0);
  });

  it("is idempotent at the same version", async () => {
    const reseeded = await seedCatalogIfNeeded(db);
    expect(reseeded).toBe(false);
    expect(await db.catalog_plants.count()).toBe(plants.length);
  });

  it("supports indexed queries (family, category)", async () => {
    const brassicas = await db.catalog_plants
      .where("familyId")
      .equals("brassicaceae")
      .toArray();
    expect(brassicas.map((p) => p.id).sort()).toEqual([
      "arugula",
      "broccoli",
      "cabbage",
      "kale",
      "radish",
    ]);
  });
});
