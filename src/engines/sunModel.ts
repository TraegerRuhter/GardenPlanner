/**
 * SunModel (§12.8, §27.5, §27.6): per-tile direct-sun hours from solar
 * geometry plus obstruction casting by structures, plants, and elevation.
 * An estimate — ignores diffuse light, weather, and terrain beyond the plot;
 * label it as such in the UI.
 *
 * Defaults per §30.6: two sample dates (summer solstice + spring equinox),
 * 30-minute steps, averaged.
 */

import type { GardenArea, PlantInstance } from "../types/models";

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

export interface SunMapOptions {
  latDeg: number;
  northBearingDeg: number; // garden orientation (§7.9)
  sampleDays?: number[]; // day-of-year samples; default solstice+equinox
  stepMinutes?: number;
  /** resolve a placed plant's blocking height (cm) */
  plantHeightCm?: (instanceId: string) => number;
  maxReachTiles?: number;
}

export type SunMap = Map<string, number>; // "col,row" → hours

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** §27.6 — per-tile lit hours averaged over the sample days. */
export function sunMapForArea(area: GardenArea, opts: SunMapOptions): SunMap {
  const {
    latDeg,
    northBearingDeg,
    sampleDays = [172, 79], // Jun 21, Mar 20
    stepMinutes = 30,
    plantHeightCm = () => 60,
    maxReachTiles = 24,
  } = opts;

  const cell = area.grid.cellSizeCm;

  // index blockers once: key → {topCm: height+elev}
  const elev = new Map<string, number>();
  const blockerH = new Map<string, number>();
  for (const t of area.tiles) {
    elev.set(tileKey(t.col, t.row), t.elevationCm);
    if (t.content.type === "structure") {
      blockerH.set(tileKey(t.col, t.row), t.content.heightCm);
    } else if (t.content.type === "plant") {
      blockerH.set(tileKey(t.col, t.row), plantHeightCm(t.content.instanceId));
    }
  }

  const map: SunMap = new Map();
  const stepsPerHour = 60 / stepMinutes;

  for (let col = 0; col < area.grid.cols; col++) {
    for (let row = 0; row < area.grid.rows; row++) {
      let litSteps = 0;
      let totalDaySteps = 0;
      for (const doy of sampleDays) {
        for (let h = 4; h <= 21; h += stepMinutes / 60) {
          const sun = solarPosition(latDeg, doy, h);
          if (sun.altitudeDeg <= 0) continue;
          totalDaySteps++;
          if (!blocked(col, row, sun, area, elev, blockerH, cell, northBearingDeg, maxReachTiles)) {
            litSteps++;
          }
        }
      }
      void totalDaySteps;
      map.set(tileKey(col, row), litSteps / stepsPerHour / sampleDays.length);
    }
  }
  return map;
}

function blocked(
  col: number,
  row: number,
  sun: SolarPosition,
  area: GardenArea,
  elev: Map<string, number>,
  blockerH: Map<string, number>,
  cellCm: number,
  northBearingDeg: number,
  maxReach: number,
): boolean {
  if (blockerH.size === 0) return false;
  // direction toward the sun in grid space: screen-up corresponds to
  // northBearingDeg; area may be rotated further (§7.9).
  const theta = (sun.azimuthDeg - northBearingDeg - area.rotationDeg) * RAD;
  const dx = Math.sin(theta); // +col toward screen-right
  const dy = -Math.cos(theta); // +row toward screen-down
  const tanAlt = Math.tan(sun.altitudeDeg * RAD);
  const myElev = elev.get(tileKey(col, row)) ?? 0;

  for (let t = 1; t <= maxReach; t++) {
    const c = Math.round(col + dx * t);
    const r = Math.round(row + dy * t);
    if (c < 0 || r < 0 || c >= area.grid.cols || r >= area.grid.rows) return false;
    const h = blockerH.get(tileKey(c, r));
    if (h === undefined) continue;
    const distCm = Math.hypot(c - col, r - row) * cellCm;
    const neededCm = distCm * tanAlt; // how tall a blocker must be at this distance
    const blockerTop = h + ((elev.get(tileKey(c, r)) ?? 0) - myElev);
    if (blockerTop >= neededCm) return true;
  }
  return false;
}

/** Convenience: build the plant-height resolver from instances + heights. */
export function plantHeightResolver(
  instances: PlantInstance[],
  heightByPlantId: Map<string, number>,
): (instanceId: string) => number {
  const byInstance = new Map<string, number>();
  for (const i of instances) {
    byInstance.set(i.id, heightByPlantId.get(i.plantId) ?? 60);
  }
  return (id) => byInstance.get(id) ?? 60;
}
