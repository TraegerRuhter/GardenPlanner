/**
 * SunModel (§12.8, §27.5, §27.6): per-cell direct-sun hours from solar geometry
 * plus obstruction casting by plants and elevation across the garden field.
 * An estimate — ignores diffuse light, weather, and terrain beyond the plot;
 * label it as such in the UI.
 *
 * Defaults per §30.6: two sample dates (summer solstice + spring equinox),
 * 30-minute steps, averaged.
 */

import type { GardenField, GroundCell, PlantInstance } from "../types/models";

const RAD = Math.PI / 180;

export interface SolarPosition {
  altitudeDeg: number;
  /** bearing from true north, clockwise (0=N, 90=E, 180=S) */
  azimuthDeg: number;
}

/** §27.5 NOAA-style approximation (good to ~1° — plenty for a garden). */
export function solarPosition(
  latDeg: number,
  dayOfYear: number,
  solarHour: number, // 0..24, 12 = solar noon
): SolarPosition {
  const decl = 23.45 * Math.sin(RAD * ((360 * (284 + dayOfYear)) / 365));
  const H = 15 * (solarHour - 12); // hour angle, deg
  const L = latDeg * RAD;
  const D = decl * RAD;
  const sinAlt = Math.sin(L) * Math.sin(D) + Math.cos(L) * Math.cos(D) * Math.cos(H * RAD);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // azimuth from south (+west), then rebased to from-north clockwise
  const aziSouth = Math.atan2(
    Math.sin(H * RAD),
    Math.cos(H * RAD) * Math.sin(L) - Math.tan(D) * Math.cos(L),
  );
  const azimuthDeg = (aziSouth / RAD + 180 + 360) % 360;
  return { altitudeDeg: alt / RAD, azimuthDeg };
}

/** A vertical sun-blocker at a cell (a plant or, later, a structure). */
export interface Blocker {
  col: number;
  row: number;
  heightCm: number;
}

export interface FieldSunOptions {
  latDeg: number;
  northBearingDeg: number; // garden orientation (§7.9)
  sampleDays?: number[]; // day-of-year samples; default solstice+equinox
  stepMinutes?: number;
  maxReachTiles?: number;
}

export type SunMap = Map<string, number>; // "col,row" → hours

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

type FieldGeom = Pick<GardenField, "cols" | "rows" | "cellSizeCm"> & { ground: GroundCell[] };

/** §27.6 — per-cell lit hours over the field, averaged across the sample days. */
export function sunMapForField(
  field: FieldGeom,
  blockers: Blocker[],
  opts: FieldSunOptions,
): SunMap {
  const {
    latDeg,
    northBearingDeg,
    sampleDays = [172, 79], // Jun 21, Mar 20
    stepMinutes = 30,
    maxReachTiles = 24,
  } = opts;

  const cell = field.cellSizeCm;
  const elev = new Map<string, number>();
  for (const g of field.ground) elev.set(tileKey(g.col, g.row), g.elevationCm);
  const blockerH = new Map<string, number>();
  for (const b of blockers) blockerH.set(tileKey(b.col, b.row), b.heightCm);

  const map: SunMap = new Map();
  const stepsPerHour = 60 / stepMinutes;

  for (let col = 0; col < field.cols; col++) {
    for (let row = 0; row < field.rows; row++) {
      let litSteps = 0;
      for (const doy of sampleDays) {
        for (let h = 4; h <= 21; h += stepMinutes / 60) {
          const sun = solarPosition(latDeg, doy, h);
          if (sun.altitudeDeg <= 0) continue;
          if (!blocked(col, row, sun, field, elev, blockerH, cell, northBearingDeg, maxReachTiles)) {
            litSteps++;
          }
        }
      }
      map.set(tileKey(col, row), litSteps / stepsPerHour / sampleDays.length);
    }
  }
  return map;
}

function blocked(
  col: number,
  row: number,
  sun: SolarPosition,
  field: FieldGeom,
  elev: Map<string, number>,
  blockerH: Map<string, number>,
  cellCm: number,
  northBearingDeg: number,
  maxReach: number,
): boolean {
  if (blockerH.size === 0) return false;
  // direction toward the sun in grid space: screen-up corresponds to
  // northBearingDeg (the field is not independently rotated — the view is
  // straight-on, orientation is a data property).
  const theta = (sun.azimuthDeg - northBearingDeg) * RAD;
  const dx = Math.sin(theta); // +col toward screen-right
  const dy = -Math.cos(theta); // +row toward screen-down
  const tanAlt = Math.tan(sun.altitudeDeg * RAD);
  const myElev = elev.get(tileKey(col, row)) ?? 0;

  for (let t = 1; t <= maxReach; t++) {
    const c = Math.round(col + dx * t);
    const r = Math.round(row + dy * t);
    if (c < 0 || r < 0 || c >= field.cols || r >= field.rows) return false;
    const h = blockerH.get(tileKey(c, r));
    if (h === undefined) continue;
    const distCm = Math.hypot(c - col, r - row) * cellCm;
    const neededCm = distCm * tanAlt; // how tall a blocker must be at this distance
    const blockerTop = h + ((elev.get(tileKey(c, r)) ?? 0) - myElev);
    if (blockerTop >= neededCm) return true;
  }
  return false;
}

/** Build sun-blockers from placed plants and their mature heights. */
export function blockersFromInstances(
  instances: PlantInstance[],
  heightByPlantId: Map<string, number>,
): Blocker[] {
  const out: Blocker[] = [];
  for (const inst of instances) {
    const h = heightByPlantId.get(inst.plantId) ?? 60;
    for (const t of inst.tiles) out.push({ col: t.col, row: t.row, heightCm: h });
  }
  return out;
}
