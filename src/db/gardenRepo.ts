/**
 * Garden persistence (§7.9, §23): gardens embed their areas; tiles are sparse
 * (only non-empty stored). Plant placements create PlantInstances — status
 * "planned" until a planting date is logged (§12.6).
 */

import { db } from "./db";
import { newId } from "../lib/ids";
import { todayISO } from "../lib/dates";
import type {
  Garden,
  GardenArea,
  PlantInstance,
  Tile,
  TileContent,
} from "../types/models";

export const DEFAULT_CELL_CM = 30.48; // 1 ft — square-foot gardening default (§12.1)

export function newArea(
  name: string,
  cols: number,
  rows: number,
  origin = { x: 0, y: 0 },
  kind: GardenArea["kind"] = "raised_bed",
): GardenArea {
  return {
    id: newId(),
    name,
    kind,
    soilDrainage: "moderate",
    origin,
    rotationDeg: 0,
    grid: { cols, rows, cellSizeCm: DEFAULT_CELL_CM },
    tiles: [],
  };
}

export async function createGarden(
  name: string,
  locationId: string | undefined,
  unitSystem: Garden["unitSystem"],
): Promise<Garden> {
  const garden: Garden = {
    id: newId(),
    name,
    locationId: locationId ?? "",
    unitSystem,
    northBearingDeg: 0,
    areas: [newArea("Bed A", 8, 4)],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.gardens.add(garden);
  return garden;
}

export async function saveGarden(garden: Garden): Promise<void> {
  garden.updatedAt = new Date().toISOString();
  await db.gardens.put(garden);
}

/** Sparse tile write: empty content removes the tile record entirely. */
export function setTile(
  area: GardenArea,
  col: number,
  row: number,
  content: TileContent,
  elevationCm?: number,
): void {
  const idx = area.tiles.findIndex((t) => t.col === col && t.row === row);
  const existing = idx >= 0 ? area.tiles[idx] : undefined;
  const elev = elevationCm ?? existing?.elevationCm ?? 0;
  const isEmpty = content.type === "empty" && elev === 0;
  if (idx >= 0) {
    if (isEmpty) area.tiles.splice(idx, 1);
    else area.tiles[idx] = { col, row, elevationCm: elev, content };
  } else if (!isEmpty) {
    area.tiles.push({ col, row, elevationCm: elev, content });
  }
}

export function tileAt(area: GardenArea, col: number, row: number): Tile | undefined {
  return area.tiles.find((t) => t.col === col && t.row === row);
}

/** §12.6: place a plant as a planned ghost instance occupying `tiles`. */
export async function placePlant(
  garden: Garden,
  area: GardenArea,
  plantId: string,
  tiles: Array<{ col: number; row: number }>,
  plannedFor?: string, // §15 succession ghosts carry a future intended date
): Promise<PlantInstance> {
  const instance: PlantInstance = {
    id: newId(),
    gardenId: garden.id,
    areaId: area.id,
    plantId,
    tiles,
    plantingMethod: "direct_sow",
    plantedOn: plannedFor ?? todayISO(), // intended date; real when activated (§13.1)
    currentStage: "planted",
    projectedStageDates: {},
    events: [],
    status: "planned",
    watering: { mode: "auto" },
    fertilizing: {},
    photoEntryIds: [],
  };
  for (const t of tiles) {
    setTile(area, t.col, t.row, { type: "plant", instanceId: instance.id });
  }
  await db.transaction("rw", [db.gardens, db.instances], async () => {
    await db.instances.add(instance);
    await saveGarden(garden);
  });
  return instance;
}

/** Remove whatever occupies a tile; deletes plant instances losing their last tile. */
export async function clearTile(
  garden: Garden,
  area: GardenArea,
  col: number,
  row: number,
): Promise<void> {
  const tile = tileAt(area, col, row);
  if (!tile) return;
  if (tile.content.type === "plant") {
    const inst = await db.instances.get(tile.content.instanceId);
    if (inst) {
      const remaining = inst.tiles.filter((t) => !(t.col === col && t.row === row));
      if (remaining.length === 0) await db.instances.delete(inst.id);
      else await db.instances.put({ ...inst, tiles: remaining });
    }
  }
  setTile(area, col, row, { type: "empty" }, tile.elevationCm);
  await saveGarden(garden);
}

/** Row-major free cells of an area (no content; elevation-only is free). */
export function freeCells(area: GardenArea): Array<{ col: number; row: number }> {
  const occupied = new Set(
    area.tiles.filter((t) => t.content.type !== "empty").map((t) => `${t.col},${t.row}`),
  );
  const out: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < area.grid.rows; row++)
    for (let col = 0; col < area.grid.cols; col++)
      if (!occupied.has(`${col},${row}`)) out.push({ col, row });
  return out;
}

export async function activeInstancesForGarden(gardenId: string): Promise<PlantInstance[]> {
  return db.instances
    .where("gardenId")
    .equals(gardenId)
    .filter((i) => i.status === "active" || i.status === "planned")
    .toArray();
}
