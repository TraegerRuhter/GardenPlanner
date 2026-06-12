/**
 * GrowthEngine (§13, §27.2): stage projection at planting, calendar- or
 * GDD-paced auto-advance, and manual advance/rollback with re-projection.
 *
 * §30.2 decision (hybrid, as recommended): stages advance on projected
 * calendar dates by default; when the plant has a GDD base temperature and
 * recent daily weather is cached, stage targets convert to GDD and pacing
 * follows accumulated heat — a cool spring slows the timeline, a hot spell
 * speeds it up. Calendar is always the fallback.
 */

import type { DailyRecord } from "../types/adapters";
import type {
  ClimateProfile,
  GrowthStageTemplate,
  Plant,
  PlantInstance,
  StageEvent,
  StageKey,
} from "../types/models";
import { addDays, diffDays, monthOf, type ISODate } from "../lib/dates";
import { newId } from "../lib/ids";

/** Stages a transplant enters the ground already past (§13.1). */
const TRANSPLANT_SKIPS: ReadonlySet<StageKey> = new Set(["germination", "sprout"]);

export function effectiveSequence(
  template: GrowthStageTemplate,
  method: PlantInstance["plantingMethod"],
): StageKey[] {
  return method === "transplant"
    ? template.sequence.filter((s) => !TRANSPLANT_SKIPS.has(s))
    : [...template.sequence];
}

/** §13.1 — projected entry date for every stage from the planting date. */
export function projectStageDates(
  template: GrowthStageTemplate,
  method: PlantInstance["plantingMethod"],
  plantedOn: ISODate,
): Partial<Record<StageKey, ISODate>> {
  const seq = effectiveSequence(template, method);
  const out: Partial<Record<StageKey, ISODate>> = {};
  let cursor = plantedOn;
  for (let i = 0; i < seq.length; i++) {
    out[seq[i]] = cursor;
    const dur = template.stageDurations[seq[i]]?.typical ?? 0;
    cursor = addDays(cursor, dur);
  }
  return out;
}

/** Stage that should be current on `date` per the projection (§13.2). */
export function stageOnDate(
  projected: Partial<Record<StageKey, ISODate>>,
  sequence: StageKey[],
  date: ISODate,
): StageKey {
  let current = sequence[0];
  for (const s of sequence) {
    const entry = projected[s];
    if (entry && diffDays(entry, date) >= 0) current = s;
  }
  return current;
}

// ---------------------------------------------------------------------------
// §27.2 GDD
// ---------------------------------------------------------------------------

export function gddForDay(tMaxC: number, tMinC: number, baseC: number): number {
  return Math.max(0, (tMaxC + tMinC) / 2 - baseC);
}

export function accumulateGDD(
  records: DailyRecord[],
  baseC: number,
  fromDate: ISODate,
  toDate: ISODate,
): number {
  let total = 0;
  for (const r of records) {
    if (diffDays(fromDate, r.date) < 0) continue;
    if (diffDays(r.date, toDate) < 0) continue;
    total += gddForDay(r.tMaxC, r.tMinC, baseC);
  }
  return total;
}

/** Expected GDD/day for a month from climate normals. */
function expectedDailyGdd(climate: ClimateProfile, month: number, baseC: number): number {
  const n = climate.monthlyNormals?.[month - 1];
  if (!n) return 0;
  return gddForDay(n.tMaxC, n.tMinC, baseC);
}

/**
 * §13.3 — convert each stage's projected calendar span into a cumulative GDD
 * target (expected heat over that span, from normals).
 */
export function gddTargets(
  template: GrowthStageTemplate,
  method: PlantInstance["plantingMethod"],
  plantedOn: ISODate,
  climate: ClimateProfile,
  baseC: number,
): Partial<Record<StageKey, number>> {
  const seq = effectiveSequence(template, method);
  const out: Partial<Record<StageKey, number>> = {};
  let cumulative = 0;
  let cursor = plantedOn;
  for (const s of seq) {
    out[s] = cumulative;
    const days = template.stageDurations[s]?.typical ?? 0;
    for (let d = 0; d < days; d++) {
      cumulative += expectedDailyGdd(climate, monthOf(cursor), baseC);
      cursor = addDays(cursor, 1);
    }
  }
  return out;
}

/** Stage owed by accumulated actual GDD against the targets (§13.3). */
export function stageByGdd(
  targets: Partial<Record<StageKey, number>>,
  sequence: StageKey[],
  accumulated: number,
): StageKey {
  let current = sequence[0];
  for (const s of sequence) {
    const t = targets[s];
    if (t !== undefined && accumulated >= t) current = s;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Auto-advance + manual transitions (§13.2, §13.4)
// ---------------------------------------------------------------------------

export interface AdvanceResult {
  instance: PlantInstance;
  newEvents: StageEvent[];
}

/**
 * §13.2 daily pass for one instance. `recent` (cached daily actuals) enables
 * GDD pacing when the plant has a base temperature; otherwise calendar.
 */
export function autoAdvance(
  instance: PlantInstance,
  plant: Plant,
  template: GrowthStageTemplate,
  today: ISODate,
  climate?: ClimateProfile | null,
  recent?: DailyRecord[] | null,
): AdvanceResult {
  if (instance.status !== "active") return { instance, newEvents: [] };
  const seq = effectiveSequence(template, instance.plantingMethod);

  let target: StageKey;
  if (plant.gddBaseTempC && climate?.monthlyNormals?.length === 12 && recent && recent.length > 0) {
    const targets = gddTargets(template, instance.plantingMethod, instance.plantedOn, climate, plant.gddBaseTempC);
    const acc = accumulateGDD(recent, plant.gddBaseTempC, instance.plantedOn, today);
    target = stageByGdd(targets, seq, acc);
    // never let GDD pace beyond what the calendar projection plus a margin
    // would allow when actual coverage is partial — calendar remains the floor
    const calendarStage = stageOnDate(instance.projectedStageDates, seq, today);
    if (seq.indexOf(target) < seq.indexOf(calendarStage) && recent.length < diffDays(instance.plantedOn, today)) {
      target = calendarStage;
    }
  } else {
    target = stageOnDate(instance.projectedStageDates, seq, today);
  }

  const fromIdx = seq.indexOf(instance.currentStage);
  const toIdx = seq.indexOf(target);
  if (toIdx <= fromIdx) return { instance, newEvents: [] };

  const newEvents: StageEvent[] = [];
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    newEvents.push({
      id: newId(),
      instanceId: instance.id,
      stage: seq[i],
      enteredOn: instance.projectedStageDates[seq[i]] ?? today,
      source: "auto",
    });
  }
  return {
    instance: { ...instance, currentStage: target, events: [...instance.events, ...newEvents] },
    newEvents,
  };
}

/** §13.4 — re-project the remaining stages so `stage` begins `from` today. */
export function reprojectFrom(
  template: GrowthStageTemplate,
  method: PlantInstance["plantingMethod"],
  existing: Partial<Record<StageKey, ISODate>>,
  stage: StageKey,
  today: ISODate,
): Partial<Record<StageKey, ISODate>> {
  const seq = effectiveSequence(template, method);
  const out = { ...existing };
  let cursor = today;
  let started = false;
  for (const s of seq) {
    if (s === stage) started = true;
    if (!started) continue;
    out[s] = cursor;
    cursor = addDays(cursor, template.stageDurations[s]?.typical ?? 0);
  }
  return out;
}

export interface ManualMove {
  instance: PlantInstance;
  event: StageEvent;
  /** symptom key for the diagnostics flow on rollback (§14) */
  symptom?: string;
}

export function manualAdvance(
  instance: PlantInstance,
  template: GrowthStageTemplate,
  today: ISODate,
): ManualMove | null {
  const seq = effectiveSequence(template, instance.plantingMethod);
  const idx = seq.indexOf(instance.currentStage);
  if (idx >= seq.length - 1) return null;
  const next = seq[idx + 1];
  const event: StageEvent = {
    id: newId(),
    instanceId: instance.id,
    stage: next,
    enteredOn: today,
    source: "manual_advance",
  };
  return {
    instance: {
      ...instance,
      currentStage: next,
      projectedStageDates: reprojectFrom(template, instance.plantingMethod, instance.projectedStageDates, next, today),
      events: [...instance.events, event],
    },
    event,
  };
}

/** §13.4 rollback: one stage back + re-projection + a diagnostics symptom. */
export function manualRollback(
  instance: PlantInstance,
  template: GrowthStageTemplate,
  today: ISODate,
): ManualMove | null {
  const seq = effectiveSequence(template, instance.plantingMethod);
  const idx = seq.indexOf(instance.currentStage);
  if (idx <= 0) return null;
  const prev = seq[idx - 1];
  const event: StageEvent = {
    id: newId(),
    instanceId: instance.id,
    stage: prev,
    enteredOn: today,
    source: "manual_rollback",
  };
  return {
    instance: {
      ...instance,
      currentStage: prev,
      projectedStageDates: reprojectFrom(template, instance.plantingMethod, instance.projectedStageDates, seq[idx], today),
      events: [...instance.events, event],
    },
    event,
    symptom: symptomForStage(prev),
  };
}

/** Map a rolled-back-to stage onto the §14 symptom taxonomy. */
export function symptomForStage(stage: StageKey): string {
  switch (stage) {
    case "planted":
    case "germination":
      return "germination_delay";
    case "sprout":
    case "seedling":
    case "vegetative":
      return "stunted_growth";
    case "budding":
    case "flowering":
    case "fruiting":
      return "no_fruit";
    default:
      return "stunted_growth";
  }
}
