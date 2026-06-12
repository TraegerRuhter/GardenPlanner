/**
 * Unit rendering (§0): everything is stored metric; these helpers render in
 * the user's chosen system. Conversions only — no rounding surprises in
 * stored data.
 */

import type { UnitSystem } from "../types/models";

const CM_PER_IN = 2.54;
const MM_PER_IN = 25.4;

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

/** "45 cm" | "18 in" — lengths under ~1 m use cm/in. */
export function formatLength(cm: number, units: UnitSystem): string {
  if (units === "metric") {
    return cm >= 100 ? `${trim(cm / 100)} m` : `${trim(cm)} cm`;
  }
  const inches = cm / CM_PER_IN;
  return inches >= 24 ? `${trim(inches / 12)} ft` : `${trim(inches)} in`;
}

/** "25 mm" | "1 in" — weekly water depth. */
export function formatDepthMm(mm: number, units: UnitSystem): string {
  return units === "metric" ? `${trim(mm)} mm` : `${trim(mm / MM_PER_IN)} in`;
}

/** "21°C" | "70°F" */
export function formatTemp(c: number, units: UnitSystem): string {
  return units === "metric" ? `${trim(c)}°C` : `${trim(cToF(c))}°F`;
}

export function formatRange(
  min: number,
  max: number,
  format: (v: number) => string,
): string {
  return min === max ? format(min) : `${format(min)}–${format(max)}`;
}

function trim(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}
