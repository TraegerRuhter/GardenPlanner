/**
 * Garden persistence (§7.9, §23). A garden is one continuous grass FIELD that
 * the user carves into. Three planes (see GardenField doc):
 *  - ground: sparse carved cells; flat grass is the unstored default.
 *  - plants: PlantInstances in the `instances` store — status "planned" until a
 *    planting date is logged (§12.6).
 *  - overlays: sub-cell infrastructure (Phase 2 UI).
 */

import { db } from "./db";
import { newId } from "../lib/ids";
import { todayISO } from "../lib/dates";
import type {
  Garden,
  GardenField,
  GroundCell,
  GroundType,
  PlantInstance,
} from "../types/models";

export const DEFAULT_CELL_CM = 30.48; // 1 ft — square-foot gardening default (§12.1)
export const DEFAULT_FIELD_COLS = 16;
export const DEFAULT_FIELD_ROWS = 12;

export function newField(
  cols = DEFAULT_FIELD_COLS,
  rows = DEFAULT_FIELD_ROWS,
): GardenField {
  return {
    cols,
    rows,
    cellSizeCm: DEFAULT_CELL_CM,
    soilDrainage: "moderate",
    ground: [],
    overlays: [],
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
    field: newField(),
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

// ---------------- ground plane ----------------

export function groundAt(field: GardenField, col: number, row: number): GroundCell | undefined {
  return field.ground.find((g) => g.col === col && g.row === row);
}

export function groundTypeAt(field: GardenField, col: number, row: number): GroundType {
  return groundAt(field, col, row)?.type ?? "grass";
}

export function elevationAt(field: GardenField, col: number, row: number): number {
  return groundAt(field, col, row)?.elevationCm ?? 0;
}

/**
 * Sparse ground write: a cell that is flat grass (type "grass", elevation 0) is
 * the default and is not stored, so carving back to grass removes the record.
 */
export function setGround(
  field: GardenField,
  col: number,
  row: number,
  type: GroundType,
  elevationCm?: number,
): void {
  const idx = field.ground.findIndex((g) => g.col === col && g.row === row);
  const existing = idx >= 0 ? field.ground[idx] : undefined;
  const elev = elevationCm ?? existing?.elevationCm ?? 0;
  const isDefault = type === "grass" && elev === 0;
  if (idx >= 0) {
    if (isDefault) field.ground.splice(idx, 1);
    else field.ground[idx] = { col, row, type, elevationCm: elev };
  } else if (!isDefault) {
    field.ground.push({ col, row, type, elevationCm: elev });
  }
}

/** Adjust a cell's elevation, preserving its ground type (defaults to grass). */
export function setElevation(
  field: GardenField,
  col: number,
  row: number,
  elevationCm: number,
): void {
  setGround(field, col, row, groundTypeAt(field, col, row), elevationCm);
}

// ---------------- plant plane ----------------

/** The plant instance occupying a cell, if any (plants live in `instances`). */
export function plantOccupant(
  instances: PlantInstance[],
  col: number,
  row: number,
): PlantInstance | undefined {
  return instances.find((i) => i.tiles.some((t) => t.col === col && t.row === row));
}

/** §12.6: place a plant as a planned ghost instance occupying `tiles`. */
export async function placePlant(
  garden: Garden,
  plantId: string,
  tiles: Array<{ col: number; row: number }>,
  plannedFor?: string, // §15 succession ghosts carry a future intended date
): Promise<PlantInstance> {
  const instance: PlantInstance = {
    id: newId(),
    gardenId: garden.id,
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
  await db.instances.add(instance);
  await saveGarden(garden); // bump updatedAt
  return instance;
}

/**
 * Remove the plant occupying a cell (drops the instance, or just that tile if
 * the plant spans several). Returns true if a plant was cleared.
 */
export async function clearPlantAt(
  col: number,
  row: number,
  instances: PlantInstance[],
): Promise<boolean> {
  const inst = plantOccupant(instances, col, row);
  if (!inst) return false;
  const remaining = inst.tiles.filter((t) => !(t.col === col && t.row === row));
  if (remaining.length === 0) await db.instances.delete(inst.id);
  else await db.instances.put({ ...inst, tiles: remaining });
  return true;
}

/** Cells with no plant on them (row-major). For succession placement. */
export function freeCells(
  field: GardenField,
  instances: PlantInstance[],
): Array<{ col: number; row: number }> {
  const occupied = new Set<string>();
  for (const i of instances) for (const t of i.tiles) occupied.add(`${t.col},${t.row}`);
  const out: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < field.rows; row++)
    for (let col = 0; col < field.cols; col++)
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
