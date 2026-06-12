/**
 * Placement validation (§12.6): spacing, companions, rotation, frost pockets.
 * Pure functions — warnings are non-blocking badges, never hard stops.
 */

import type {
  CompanionRelationship,
  GardenArea,
  Plant,
  PlantInstance,
  Tile,
} from "../types/models";
import { depressionDepthCm } from "./waterlogging";

export interface PlacementWarning {
  kind: "spacing" | "antagonist" | "companion" | "rotation" | "frost_pocket" | "sun";
  severity: "warn" | "info";
  message: string;
}

interface Cell {
  col: number;
  row: number;
}

const dist = (a: Cell, b: Cell) =>
  Math.hypot(a.col - b.col, a.row - b.row);

/** §12.6 spacing: same-species neighbors closer than spacing.inRowCm. */
export function spacingWarnings(
  area: GardenArea,
  target: Cell[],
  plant: Plant,
  instances: PlantInstance[],
  plantsById: Map<string, Plant>,
): PlacementWarning[] {
  const out: PlacementWarning[] = [];
  const cell = area.grid.cellSizeCm;
  const neededCells = plant.spacing.inRowCm / cell;
  for (const inst of instances) {
    if (inst.areaId !== area.id) continue;
    const other = plantsById.get(inst.plantId);
    if (!other || other.id !== plant.id) continue;
    for (const t of target) {
      for (const ot of inst.tiles) {
        const d = dist(t, ot);
        if (d > 0 && d < neededCells) {
          out.push({
            kind: "spacing",
            severity: "warn",
            message: `${plant.commonName} wants ~${plant.spacing.inRowCm} cm in-row; a neighbor sits ${Math.round(d * cell)} cm away.`,
          });
          return out; // one spacing warning is enough
        }
      }
    }
  }
  return out;
}

/** §12.6 companions: scan adjacent (8-neighborhood) tiles for relationships. */
export function companionWarnings(
  area: GardenArea,
  target: Cell[],
  plant: Plant,
  instances: PlantInstance[],
  plantsById: Map<string, Plant>,
  companions: CompanionRelationship[],
): PlacementWarning[] {
  const adjacentPlantIds = new Set<string>();
  for (const inst of instances) {
    if (inst.areaId !== area.id) continue;
    for (const t of target) {
      for (const ot of inst.tiles) {
        const d = Math.max(Math.abs(t.col - ot.col), Math.abs(t.row - ot.row));
        if (d === 1) adjacentPlantIds.add(inst.plantId);
      }
    }
  }
  const out: PlacementWarning[] = [];
  for (const rel of companions) {
    const partnerId =
      rel.aPlantId === plant.id ? rel.bPlantId
      : rel.bPlantId === plant.id ? rel.aPlantId
      : undefined;
    if (!partnerId || !adjacentPlantIds.has(partnerId)) continue;
    const partner = plantsById.get(partnerId);
    if (!partner) continue;
    out.push(
      rel.type === "antagonistic"
        ? {
            kind: "antagonist",
            severity: "warn",
            message: `${partner.commonName} next door: ${rel.reason}.`,
          }
        : {
            kind: "companion",
            severity: "info",
            message: `Good neighbor ${partner.commonName}: ${rel.reason}.`,
          },
    );
  }
  return out;
}

/**
 * §20 rotation: warn when the same family occupied any target tile within
 * the lookback window (default 2 seasons ≈ 2 years), using instance history.
 */
export function rotationWarnings(
  area: GardenArea,
  target: Cell[],
  plant: Plant,
  history: PlantInstance[],
  plantsById: Map<string, Plant>,
  currentYear: number,
  lookbackYears = 2,
): PlacementWarning[] {
  for (const inst of history) {
    if (inst.areaId !== area.id) continue;
    const other = plantsById.get(inst.plantId);
    if (!other || other.familyId !== plant.familyId) continue;
    if (other.id === plant.id && inst.status === "planned") continue; // self
    const year = Number(inst.plantedOn.slice(0, 4));
    if (currentYear - year > lookbackYears || currentYear - year < 1) continue;
    for (const t of target) {
      if (inst.tiles.some((ot) => ot.col === t.col && ot.row === t.row)) {
        return [
          {
            kind: "rotation",
            severity: "warn",
            message: `${other.commonName} (${plant.familyId}) grew in this spot in ${year} — rotate families to dodge soil-borne disease.`,
          },
        ];
      }
    }
  }
  return [];
}

/** §12.5 frost pocket: tile sits ≥5 cm below its neighbors. */
export function frostPocketWarning(
  area: GardenArea,
  target: Cell[],
  plant: Plant,
): PlacementWarning[] {
  if (plant.frostTolerance !== "tender") return [];
  for (const t of target) {
    const tile = area.tiles.find((x) => x.col === t.col && x.row === t.row);
    const elev = tile?.elevationCm ?? 0;
    const neighbors = neighborsOf(area, t).map((n) => n?.elevationCm ?? 0);
    if (depressionDepthCm(elev, neighbors) >= 5) {
      return [
        {
          kind: "frost_pocket",
          severity: "warn",
          message:
            "Low spot: cold air pools here on frost nights — risky for a tender plant.",
        },
      ];
    }
  }
  return [];
}

function neighborsOf(area: GardenArea, c: Cell): Array<Tile | undefined> {
  const out: Array<Tile | undefined> = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const col = c.col + dc;
      const row = c.row + dr;
      if (col < 0 || row < 0 || col >= area.grid.cols || row >= area.grid.rows) continue;
      out.push(area.tiles.find((t) => t.col === col && t.row === row));
    }
  }
  return out;
}

/** §12.8.4 sun check once a sun map exists. */
export function sunWarning(
  plant: Plant,
  sunHours: number | undefined,
): PlacementWarning[] {
  if (sunHours === undefined) return [];
  if (sunHours + 0.25 < plant.sunHoursMin) {
    return [
      {
        kind: "sun",
        severity: "warn",
        message: `Estimated ${sunHours.toFixed(1)}h direct sun here; ${plant.commonName} wants ${plant.sunHoursMin}h+.`,
      },
    ];
  }
  return [];
}

export function validatePlacement(args: {
  area: GardenArea;
  target: Cell[];
  plant: Plant;
  instances: PlantInstance[];
  history: PlantInstance[];
  plantsById: Map<string, Plant>;
  companions: CompanionRelationship[];
  sunHours?: number;
  currentYear?: number;
}): PlacementWarning[] {
  const year = args.currentYear ?? new Date().getFullYear();
  return [
    ...spacingWarnings(args.area, args.target, args.plant, args.instances, args.plantsById),
    ...companionWarnings(args.area, args.target, args.plant, args.instances, args.plantsById, args.companions),
    ...rotationWarnings(args.area, args.target, args.plant, args.history, args.plantsById, year),
    ...frostPocketWarning(args.area, args.target, args.plant),
    ...sunWarning(args.plant, args.sunHours),
  ];
}
