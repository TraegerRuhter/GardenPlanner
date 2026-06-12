/**
 * PlantingWindowEngine (§11, §27.3): Plant + ClimateProfile → dated bands per
 * method for a target year. Direct-sow bands are clipped until estimated soil
 * temperature reaches the plant's germination floor (§27.4); fall bands count
 * back from first frost by DTM plus the plant's buffer; southern hemisphere
 * mirrors by six months (§27.7).
 */

import type { ClimateProfile, Hemisphere, Plant } from "../types/models";
import { addDays, addWeeks, diffDays, inYear, type ISODate } from "../lib/dates";
import { estSoilTempC } from "./climate";

export type BandKind = "indoor" | "direct" | "transplant" | "fall";

export interface PlantingBand {
  plantId: string;
  kind: BandKind;
  start: ISODate;
  end: ISODate;
  /** projected harvest span if sown across this band */
  harvestStart: ISODate;
  harvestEnd: ISODate;
  notes: string[];
}

const SOUTHERN_SHIFT_DAYS = 182;

export function windowsFor(
  plant: Plant,
  climate: ClimateProfile,
  year: number,
  hemisphere: Hemisphere = "northern",
): PlantingBand[] {
  const lsf = inYear(climate.lastSpringFrost.p50, year);
  const fff = inYear(climate.firstFallFrost.p50, year);
  const r = plant.sowRules;
  const bands: PlantingBand[] = [];

  const push = (kind: BandKind, start: ISODate, end: ISODate, notes: string[] = []) => {
    if (diffDays(start, end) < 0) return; // clipped to nothing
    bands.push({
      plantId: plant.id,
      kind,
      start,
      end,
      harvestStart: addDays(start, plant.daysToMaturity.min),
      harvestEnd: addDays(end, plant.daysToMaturity.max),
      notes,
    });
  };

  if (plant.plantingMethods.includes("indoor_start") && r.indoorStartWeeksFromLastFrost) {
    push(
      "indoor",
      addWeeks(lsf, r.indoorStartWeeksFromLastFrost.min),
      addWeeks(lsf, r.indoorStartWeeksFromLastFrost.max),
      ["Start seeds indoors; harden off ~7–10 days before transplanting."],
    );
  }

  if (plant.plantingMethods.includes("direct_sow") && r.directSowWeeksFromLastFrost) {
    let start = addWeeks(lsf, r.directSowWeeksFromLastFrost.min);
    const end = addWeeks(lsf, r.directSowWeeksFromLastFrost.max);
    const notes: string[] = [];
    if (climate.monthlyNormals?.length === 12) {
      // §27.4 clip: walk the start forward weekly until soil clears the
      // germination floor. If the estimate never clears within the window,
      // keep the rule's dates — the model is crude and the warning is the
      // honest output, not a silently vanished band.
      let probe = start;
      let moved = false;
      while (
        diffDays(probe, end) >= 0 &&
        estSoilTempC(probe, climate.monthlyNormals) < plant.minSoilTempC
      ) {
        probe = addDays(probe, 7);
        moved = true;
      }
      if (diffDays(probe, end) >= 0) {
        if (moved) {
          start = probe;
          notes.push(
            `Start pushed later until soil warms to ~${plant.minSoilTempC}°C (§27.4 estimate).`,
          );
        }
      } else {
        notes.push(
          `Soil estimate stays below ${plant.minSoilTempC}°C for this entire window — sow late in it, pre-warm the bed, or use a cover.`,
        );
      }
    }
    push("direct", start, end, notes);
  }

  if (plant.plantingMethods.includes("transplant") && r.transplantWeeksFromLastFrost) {
    push(
      "transplant",
      addWeeks(lsf, r.transplantWeeksFromLastFrost.min),
      addWeeks(lsf, r.transplantWeeksFromLastFrost.max),
    );
  }

  // Fall window only for crops that tolerate cooling weather (§11.1).
  if (r.fallWeeksFromFirstFrost && plant.frostTolerance !== "tender") {
    const sowBy = addDays(fff, -plant.daysToMaturity.max);
    push(
      "fall",
      addWeeks(sowBy, -r.fallWeeksFromFirstFrost.max),
      addWeeks(sowBy, -r.fallWeeksFromFirstFrost.min),
      ["Fall crop: matures before first frost with a safety buffer."],
    );
  }

  if (hemisphere === "southern") {
    for (const b of bands) {
      b.start = addDays(b.start, SOUTHERN_SHIFT_DAYS);
      b.end = addDays(b.end, SOUTHERN_SHIFT_DAYS);
      b.harvestStart = addDays(b.harvestStart, SOUTHERN_SHIFT_DAYS);
      b.harvestEnd = addDays(b.harvestEnd, SOUTHERN_SHIFT_DAYS);
    }
  }

  return bands;
}

/** Days until (negative: since) a band opens — drives Plant Next urgency (§15). */
export function daysUntilOpen(band: PlantingBand, today: ISODate): number {
  return diffDays(today, band.start);
}

/** Is any plantable (non-indoor) band open on `today`? */
export function openNow(bands: PlantingBand[], today: ISODate): PlantingBand[] {
  return bands.filter(
    (b) => diffDays(b.start, today) >= 0 && diffDays(today, b.end) >= 0,
  );
}
