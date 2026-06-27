/**
 * §15 succession scheduling: a series of future sowings lands as ghost
 * placements on the field plus dated sow tasks.
 */

import { db } from "./db";
import { newId } from "../lib/ids";
import type { ISODate } from "../lib/dates";
import { successionDates } from "../engines/schedule";
import { activeInstancesForGarden, freeCells, placePlant } from "./gardenRepo";

export interface SuccessionResult {
  placed: number;
  requested: number;
}

export async function scheduleSuccession(
  gardenId: string,
  plantId: string,
  start: ISODate,
  intervalDays: number,
  count: number,
): Promise<SuccessionResult> {
  const garden = structuredClone(await db.gardens.get(gardenId));
  const plant = await db.catalog_plants.get(plantId);
  if (!garden || !plant) return { placed: 0, requested: count };

  const instances = await activeInstancesForGarden(gardenId);
  const dates = successionDates(start, intervalDays, count);
  const free = freeCells(garden.field, instances);
  let placed = 0;
  for (let i = 0; i < dates.length && i < free.length; i++) {
    await placePlant(garden, plantId, [free[i]], dates[i]);
    await db.tasks.add({
      id: newId(),
      gardenId,
      kind: "sow",
      title: `Sow ${plant.commonName} (succession ${i + 1}/${count}) — (${free[i].col},${free[i].row})`,
      dueOn: dates[i],
      done: false,
      source: "auto",
    });
    placed++;
  }
  return { placed, requested: count };
}
