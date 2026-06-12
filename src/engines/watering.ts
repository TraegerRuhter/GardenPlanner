/**
 * WateringEngine (§17.1, §27.8): deficit-aware weekly need vs what nature
 * delivered/will deliver. Waterlogging risk (§31.2) suppresses water tasks
 * outright and raises root-rot alerts for sensitive crops.
 */

import type { DailyForecast, DailyRecord } from "../types/adapters";
import type { Plant, PlantInstance, WaterloggingRisk } from "../types/models";
import { diffDays, type ISODate } from "../lib/dates";

/** Default weekly need (mm) by coarse waterNeed when the plant lacks a range. */
export const DEFAULT_MM_PER_WEEK = { low: 15, medium: 25, high: 40 } as const;

export function weeklyNeedMm(instance: PlantInstance, plant: Plant): number {
  if (instance.watering.customMmPerWeek) return instance.watering.customMmPerWeek;
  if (plant.waterMmPerWeek)
    return (plant.waterMmPerWeek.min + plant.waterMmPerWeek.max) / 2;
  return DEFAULT_MM_PER_WEEK[plant.waterNeed];
}

export interface DeficitInput {
  instance: PlantInstance;
  plant: Plant;
  today: ISODate;
  /** trailing daily records incl. precip (cached); empty = unknown */
  recent: DailyRecord[];
  forecast: DailyForecast[];
}

/** §27.8 — mm of water the gardener still owes this week. */
export function weeklyWaterDeficitMm(input: DeficitInput): number {
  const need = weeklyNeedMm(input.instance, input.plant);
  let supply = 0;
  for (const r of input.recent) {
    const back = diffDays(r.date, input.today);
    if (back >= 0 && back < 7) supply += r.precipMm;
  }
  for (const f of input.forecast) {
    const ahead = diffDays(input.today, f.date);
    if (ahead > 0 && ahead <= 3) {
      // count likely rain only
      const p = f.precipProbabilityPct ?? 100;
      if (p >= 50) supply += f.precipMm;
    }
  }
  return Math.max(0, need - supply);
}

export interface WaterAdvice {
  action: "water" | "skip" | "alert_waterlogging";
  deficitMm: number;
  reason: string;
}

/** Threshold below which we don't nag (§27.8 "only if deficit > threshold"). */
export const DEFICIT_THRESHOLD_MM = 8;

export function waterAdvice(
  input: DeficitInput,
  risk: WaterloggingRisk,
): WaterAdvice {
  if (risk !== "none") {
    return input.plant.waterloggingSensitivity === "high"
      ? {
          action: "alert_waterlogging",
          deficitMm: 0,
          reason: `Waterlogging risk is ${risk} and ${input.plant.commonName} hates wet feet — hold water, check drainage (§31.2).`,
        }
      : {
          action: "skip",
          deficitMm: 0,
          reason: `Soil is carrying recent rain (risk ${risk}); nature has this covered.`,
        };
  }
  const deficit = weeklyWaterDeficitMm(input);
  if (deficit <= DEFICIT_THRESHOLD_MM) {
    return { action: "skip", deficitMm: deficit, reason: "Rain has covered the need this week." };
  }
  return {
    action: "water",
    deficitMm: deficit,
    reason: `~${Math.round(deficit)} mm short of the weekly target after rain.`,
  };
}

// ---------------------------------------------------------------------------
// §17.2 fertilizing
// ---------------------------------------------------------------------------

export interface FeedDue {
  type: string;
  why: string;
}

/** A feed is due when its stage has arrived and (first time, or interval elapsed). */
export function feedDue(
  instance: PlantInstance,
  plant: Plant,
  today: ISODate,
  stageOrder: string[],
): FeedDue | null {
  const curIdx = stageOrder.indexOf(instance.currentStage);
  for (const f of plant.fertilization.schedule) {
    const feedIdx = stageOrder.indexOf(f.atStage);
    if (feedIdx < 0 || feedIdx > curIdx) continue;
    const stageEntered = instance.projectedStageDates[f.atStage];
    const last = instance.fertilizing.lastFedOn;
    if (!last) {
      return { type: f.type, why: `First feed at ${f.atStage}: ${f.type}` };
    }
    if (stageEntered && diffDays(last, stageEntered) > 0) {
      // entered a new feed stage after the last feed
      return { type: f.type, why: `Feed on entering ${f.atStage}: ${f.type}` };
    }
    if (f.intervalDays && diffDays(last, today) >= f.intervalDays) {
      return { type: f.type, why: `Every ${f.intervalDays} days at ${f.atStage}: ${f.type}` };
    }
  }
  return null;
}
