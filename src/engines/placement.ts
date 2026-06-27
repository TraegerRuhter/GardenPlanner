/**
 * Placement validation (§12.6): spacing, companions, rotation, frost pockets.
 * Pure functions — warnings are non-blocking badges, never hard stops. All
 * placements share one garden field, so checks scan every instance in it.
 */

import type {
  CompanionRelationship,
  Plant,
  PlantInstance,
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

/** Light geometry view of the field the placement engine needs. */
export interface PlacementField {
  cols: number;
  rows: number;
  cellSizeCm: number;
  elevationAt: (col: number, row: number) => number;
}

const dist = (a: Cell, b: Cell) => Math.hypot(a.col - b.col, a.row - b.row);

/** §12.6 spacing: same-species neighbors closer than spacing.inRowCm. */
export function spacingWarnings(
  field: PlacementField,
  target: Cell[],
  plant: Plant,
  instances: PlantInstance[],
  plantsById: Map<string, Plant>,
): PlacementWarning[] {
  const out: PlacementWarning[] = [];
  const cell = field.cellSizeCm;
  const neededCells = plant.spacing.inRowCm / cell;
  for (const inst of instances) {
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

/** §12.6 companions: scan adjacent (8-neighborhood) cells for relationships. */
export function companionWarnings(
  target: Cell[],
  plant: Plant,
  instances: PlantInstance[],
  plantsById: Map<string, Plant>,
  companions: CompanionRelationship[],
): PlacementWarning[] {
  const adjacentPlantIds = new Set<string>();
  for (const inst of instances) {
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
 * §20 rotation: warn when the same family occupied any target cell within
 * the lookback window (default 2 seasons ≈ 2 years), using instance history.
 */
export function rotationWarnings(
  target: Cell[],
  plant: Plant,
  history: PlantInstance[],
  plantsById: Map<string, Plant>,
  currentYear: number,
  lookbackYears = 2,
): PlacementWarning[] {
  for (const inst of history) {
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

/** §12.5 frost pocket: cell sits ≥5 cm below its neighbors. */
export function frostPocketWarning(
  field: PlacementField,
  target: Cell[],
  plant: Plant,
): PlacementWarning[] {
  if (plant.frostTolerance !== "tender") return [];
  for (const t of target) {
    const elev = field.elevationAt(t.col, t.row);
    const neighbors = neighborElevations(field, t);
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

function neighborElevations(field: PlacementField, c: Cell): number[] {
  const out: number[] = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const col = c.col + dc;
      const row = c.row + dr;
      if (col < 0 || row < 0 || col >= field.cols || row >= field.rows) continue;
      out.push(field.elevationAt(col, row));
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
  field: PlacementField;
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
    ...spacingWarnings(args.field, args.target, args.plant, args.instances, args.plantsById),
    ...companionWarnings(args.target, args.plant, args.instances, args.plantsById, args.companions),
    ...rotationWarnings(args.target, args.plant, args.history, args.plantsById, year),
    ...frostPocketWarning(args.field, args.target, args.plant),
    ...sunWarning(args.plant, args.sunHours),
  ];
}
