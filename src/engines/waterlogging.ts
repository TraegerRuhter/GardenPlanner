/**
 * Waterlogging risk (§31.2, §27.10): recent + imminent rain vs what the
 * soil can shed, scaled by how much a tile sits in a depression. Drainage
 * capacities are rough and exposed as tunable constants (§31.8 decision 11).
 */

import type { SoilDrainage, WaterloggingRisk } from "../types/models";

/** Approx. mm/day the soil sheds; assumption documented in the README. */
export const DRAINAGE_CAPACITY_MM_DAY: Record<SoilDrainage, number> = {
  fast: 40,
  moderate: 20,
  poor: 8,
};

/** Risk thresholds on net carried water (mm), after pooling scaling. */
export const RISK_THRESHOLDS = { elevated: 10, high: 35 };

export interface WaterloggingInput {
  drainage: SoilDrainage;
  /** total precip over the trailing 3 days (mm) */
  recentRainMm: number;
  /** expected precip over the next 2 days (mm) */
  forecastRainMm: number;
  /** how far this tile sits below its neighbors (cm); 0 = flat or raised */
  depressionDepthCm: number;
}

export function waterloggingRisk(input: WaterloggingInput): WaterloggingRisk {
  const capacity = DRAINAGE_CAPACITY_MM_DAY[input.drainage];
  // §27.10: net mm the soil is carrying across the 5-day window.
  const load = input.recentRainMm + input.forecastRainMm - capacity * 5;
  if (load <= 0) return "none";
  const pooling = depressionFactor(input.depressionDepthCm);
  const risk = load * pooling;
  if (risk >= RISK_THRESHOLDS.high) return "high";
  if (risk >= RISK_THRESHOLDS.elevated) return "elevated";
  return "none";
}

/** 1.0 on flat ground, up to 2.0 for a 10 cm-deep pocket. */
export function depressionFactor(depthCm: number): number {
  return 1 + Math.min(Math.max(depthCm, 0), 10) / 10;
}

/**
 * Depression depth of a tile relative to its 8-neighborhood (§12.5 reuse):
 * how far below the average neighbor elevation it sits.
 */
export function depressionDepthCm(
  tileElevationCm: number,
  neighborElevationsCm: number[],
): number {
  if (neighborElevationsCm.length === 0) return 0;
  const avg =
    neighborElevationsCm.reduce((s, v) => s + v, 0) / neighborElevationsCm.length;
  return Math.max(0, avg - tileElevationCm);
}
