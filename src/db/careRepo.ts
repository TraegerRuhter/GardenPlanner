/**
 * Care pass (§17, §19): generates water/fertilize tasks for active instances
 * — deficit-aware, waterlogging-suppressed — and handles task completion
 * write-backs (lastWateredOn / lastFedOn) and recurrence respawn.
 */

import { db } from "./db";
import { newId } from "../lib/ids";
import { addDays, todayISO, type ISODate } from "../lib/dates";
import type { Task, WaterloggingRisk } from "../types/models";
import type { DailyForecast } from "../types/adapters";
import { getActiveClimate } from "./climateRepo";
import { openMeteoWeather } from "../adapters/openMeteo";
import { feedDue, waterAdvice } from "../engines/watering";
import {
  depressionDepthCm,
  waterloggingRisk,
} from "../engines/waterlogging";
import { effectiveSequence } from "../engines/growth";

export async function runCarePass(today = todayISO()): Promise<number> {
  const active = await db.instances.where("status").equals("active").toArray();
  if (active.length === 0) return 0;

  const climate = await getActiveClimate().catch(() => null);
  let forecast: DailyForecast[] = [];
  if (climate) {
    try {
      forecast = await openMeteoWeather.getDailyForecast(climate.location, 7);
    } catch {
      forecast = [];
    }
  }
  // past 3 days ride along in the forecast call (past_days=3)
  const recent = forecast.filter((f) => f.date <= today);
  const future = forecast.filter((f) => f.date > today);

  const gardens = new Map(
    (await db.gardens.toArray()).map((g) => [g.id, g] as const),
  );
  const openTasks = await db.tasks
    .filter((t) => !t.done && t.instanceId !== undefined)
    .toArray();
  const hasOpen = (instanceId: string, kind: Task["kind"]) =>
    openTasks.some((t) => t.instanceId === instanceId && t.kind === kind);

  const plants = new Map(
    (await db.catalog_plants.toArray()).map((p) => [p.id, p] as const),
  );
  const templates = new Map(
    (await db.catalog_stageTemplates.toArray()).map((t) => [t.id, t] as const),
  );

  const newTasks: Task[] = [];
  for (const inst of active) {
    const plant = plants.get(inst.plantId);
    if (!plant) continue;

    // §31.2 risk for this instance's first tile
    let risk: WaterloggingRisk = "none";
    const garden = gardens.get(inst.gardenId);
    const area = garden?.areas.find((a) => a.id === inst.areaId);
    if (area && recent.length > 0) {
      const t0 = inst.tiles[0];
      const tile = area.tiles.find((t) => t.col === t0.col && t.row === t0.row);
      const neighbors = area.tiles
        .filter((t) => Math.max(Math.abs(t.col - t0.col), Math.abs(t.row - t0.row)) === 1)
        .map((t) => t.elevationCm);
      risk = waterloggingRisk({
        drainage: area.soilDrainage,
        recentRainMm: recent.reduce((s, r) => s + r.precipMm, 0),
        forecastRainMm: future.slice(0, 2).reduce((s, r) => s + r.precipMm, 0),
        depressionDepthCm: depressionDepthCm(tile?.elevationCm ?? 0, neighbors),
      });
    }

    if (inst.watering.mode === "auto" && !hasOpen(inst.id, "water") && !hasOpen(inst.id, "remedy")) {
      const advice = waterAdvice(
        { instance: inst, plant, today, recent, forecast: future },
        risk,
      );
      if (advice.action === "water") {
        newTasks.push(task(inst.gardenId, inst.id, "water", `Water ${plant.commonName} — ${advice.reason}`, today));
      } else if (advice.action === "alert_waterlogging") {
        newTasks.push(task(inst.gardenId, inst.id, "remedy", advice.reason, today));
      }
    }

    const template = templates.get(plant.stageTemplateId);
    if (template && !hasOpen(inst.id, "fertilize")) {
      const due = feedDue(inst, plant, today, effectiveSequence(template, inst.plantingMethod));
      if (due) {
        newTasks.push(task(inst.gardenId, inst.id, "fertilize", `Feed ${plant.commonName} — ${due.why}`, today));
      }
    }
  }

  if (newTasks.length > 0) await db.tasks.bulkAdd(newTasks);
  return newTasks.length;
}

function task(gardenId: string, instanceId: string, kind: Task["kind"], title: string, dueOn: ISODate): Task {
  return { id: newId(), gardenId, instanceId, kind, title, dueOn, done: false, source: "auto" };
}

/** Complete a task: write back care fields, respawn recurrence (§19). */
export async function completeTask(taskId: string, today = todayISO()): Promise<void> {
  const t = await db.tasks.get(taskId);
  if (!t || t.done) return;
  await db.tasks.put({ ...t, done: true });

  if (t.instanceId && (t.kind === "water" || t.kind === "fertilize")) {
    const inst = await db.instances.get(t.instanceId);
    if (inst) {
      await db.instances.put(
        t.kind === "water"
          ? { ...inst, watering: { ...inst.watering, lastWateredOn: today } }
          : { ...inst, fertilizing: { ...inst.fertilizing, lastFedOn: today } },
      );
    }
  }

  if (t.recurrence) {
    const nextDue = addDays(t.dueOn, t.recurrence.everyDays);
    const expired = t.recurrence.until && nextDue > t.recurrence.until;
    if (!expired) {
      await db.tasks.add({ ...t, id: newId(), dueOn: nextDue, done: false });
    }
  }
}

export async function addUserTask(
  title: string,
  dueOn: ISODate,
  kind: Task["kind"] = "custom",
  recurrenceDays?: number,
): Promise<void> {
  await db.tasks.add({
    id: newId(),
    kind,
    title,
    dueOn,
    done: false,
    source: "user",
    recurrence: recurrenceDays ? { everyDays: recurrenceDays } : undefined,
  });
}
