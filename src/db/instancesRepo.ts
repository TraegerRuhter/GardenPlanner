/**
 * Instance lifecycle persistence (§13, §31.4): activation with projection,
 * the daily auto-advance pass (runs on app open, §19), manual advance /
 * rollback, harvest logging, and status changes.
 */

import { db } from "./db";
import { newId } from "../lib/ids";
import { todayISO, type ISODate } from "../lib/dates";
import type {
  HarvestEvent,
  PlantInstance,
  StageEvent,
} from "../types/models";
import type { DailyRecord } from "../types/adapters";
import {
  autoAdvance,
  manualAdvance,
  manualRollback,
  projectStageDates,
} from "../engines/growth";
import { getActiveClimate } from "./climateRepo";
import { getRecentDaily } from "../adapters/openMeteo";

/** §13.1 — log the real planting: project stages and go active. */
export async function activateInstance(
  instanceId: string,
  plantedOn: ISODate,
  method?: PlantInstance["plantingMethod"],
): Promise<void> {
  const inst = await db.instances.get(instanceId);
  if (!inst) return;
  const plant = await db.catalog_plants.get(inst.plantId);
  const template = plant && (await db.catalog_stageTemplates.get(plant.stageTemplateId));
  if (!plant || !template) return;
  const plantingMethod = method ?? inst.plantingMethod;
  const projected = projectStageDates(template, plantingMethod, plantedOn);
  const event: StageEvent = {
    id: newId(),
    instanceId,
    stage: "planted",
    enteredOn: plantedOn,
    source: "manual_advance",
    note: "Planting logged",
  };
  await db.transaction("rw", [db.instances, db.stageEvents], async () => {
    await db.instances.put({
      ...inst,
      plantedOn,
      plantingMethod,
      status: "active",
      currentStage: "planted",
      projectedStageDates: projected,
      events: [...inst.events, event],
    });
    await db.stageEvents.add(event);
  });
}

/**
 * §13.2 / §19 — the daily pass. Cached season-to-date weather enables GDD
 * pacing (§13.3); any network failure silently degrades to calendar pacing.
 */
export async function runDailyPass(today = todayISO()): Promise<number> {
  const active = await db.instances.where("status").equals("active").toArray();
  if (active.length === 0) return 0;

  const climate = await getActiveClimate().catch(() => null);
  let recent: DailyRecord[] | null = null;
  if (climate) {
    try {
      recent = await getRecentDaily(climate.location);
    } catch {
      recent = null; // offline and no cache — calendar pacing
    }
  }

  const plantIds = [...new Set(active.map((i) => i.plantId))];
  const plants = await db.catalog_plants.bulkGet(plantIds);
  const plantById = new Map(plants.filter(Boolean).map((p) => [p!.id, p!]));
  const templateIds = [...new Set([...plantById.values()].map((p) => p.stageTemplateId))];
  const templates = await db.catalog_stageTemplates.bulkGet(templateIds);
  const templateById = new Map(templates.filter(Boolean).map((t) => [t!.id, t!]));

  let advanced = 0;
  const puts: PlantInstance[] = [];
  const events: StageEvent[] = [];
  for (const inst of active) {
    const plant = plantById.get(inst.plantId);
    const template = plant && templateById.get(plant.stageTemplateId);
    if (!plant || !template) continue;
    const result = autoAdvance(inst, plant, template, today, climate?.profile, recent);
    if (result.newEvents.length > 0) {
      advanced++;
      puts.push(result.instance);
      events.push(...result.newEvents);
    }
  }
  if (puts.length > 0) {
    await db.transaction("rw", [db.instances, db.stageEvents], async () => {
      await db.instances.bulkPut(puts);
      await db.stageEvents.bulkAdd(events);
    });
  }
  return advanced;
}

export interface MoveOutcome {
  symptom?: string;
  instance: PlantInstance;
}

/** §13.4 — manual advance/rollback; rollback returns the diagnostics symptom. */
export async function moveStage(
  instanceId: string,
  direction: "advance" | "rollback",
  today = todayISO(),
): Promise<MoveOutcome | null> {
  const inst = await db.instances.get(instanceId);
  if (!inst) return null;
  const plant = await db.catalog_plants.get(inst.plantId);
  const template = plant && (await db.catalog_stageTemplates.get(plant.stageTemplateId));
  if (!plant || !template) return null;
  const move =
    direction === "advance"
      ? manualAdvance(inst, template, today)
      : manualRollback(inst, template, today);
  if (!move) return null;
  await db.transaction("rw", [db.instances, db.stageEvents], async () => {
    await db.instances.put(move.instance);
    await db.stageEvents.add(move.event);
  });
  return { symptom: move.symptom, instance: move.instance };
}

/** §31.4 — log an actual harvest quantity. */
export async function logHarvest(
  instanceId: string,
  quantity?: number,
  unit?: HarvestEvent["unit"],
  qualityNote?: string,
): Promise<void> {
  await db.harvestEvents.add({
    id: newId(),
    instanceId,
    date: todayISO(),
    quantity,
    unit,
    qualityNote,
  });
}

export async function setInstanceStatus(
  instanceId: string,
  status: PlantInstance["status"],
): Promise<void> {
  const inst = await db.instances.get(instanceId);
  if (inst) await db.instances.put({ ...inst, status });
}

/** Attach the completed diagnostic to the rollback event (§7.10). */
export async function recordDiagnosis(
  instanceId: string,
  diagnosticId: string,
  note: string,
): Promise<void> {
  const inst = await db.instances.get(instanceId);
  if (!inst) return;
  const events = [...inst.events];
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].source === "manual_rollback") {
      events[i] = { ...events[i], diagnosticId, note };
      await db.stageEvents.put(events[i]);
      break;
    }
  }
  await db.instances.put({ ...inst, events });
}
