/**
 * ScheduleEngine (§15): succession date generation. (Window logic lives in
 * plantingWindows; bed handoffs in recommendation.finishingSoon.)
 */

import { addDays, type ISODate } from "../lib/dates";

/** N sowing dates spaced `intervalDays` apart, starting at `start`. */
export function successionDates(
  start: ISODate,
  intervalDays: number,
  count: number,
): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i * intervalDays));
}
