/**
 * ClimateEngine (§9, §27.1, §27.4): Location + historical daily records →
 * ClimateProfile. Pure functions only — fetching lives in the adapters.
 *
 * Percentile convention (§30.4, documented in-app): the "safe" frost date
 * carries 10% residual risk — spring p10 is LATER than the median (90th
 * percentile of last-frost day-of-year), fall p10 is EARLIER (10th).
 */

import type { DailyRecord } from "../types/adapters";
import type { ClimateProfile, Location } from "../types/models";
import {
  dayOfYear,
  fromDayOfYear,
  monthDayOf,
  monthOf,
  percentile,
  yearOf,
} from "../lib/dates";
import { cToF } from "../lib/units";

export interface FrostDates {
  lastSpringFrost: { p50: string; p10: string }; // "MM-DD"
  firstFallFrost: { p50: string; p10: string };
  frostFreeDays: number;
  /** Fraction of observed years with no frost at all (coastal/mild sites). */
  frostFreeYearFraction: number;
}

/** §27.1 — percentile frost dates from per-year daily minima. */
export function frostDatesFromDaily(records: DailyRecord[]): FrostDates | null {
  const byYear = new Map<number, DailyRecord[]>();
  for (const r of records) {
    const y = yearOf(r.date);
    let arr = byYear.get(y);
    if (!arr) byYear.set(y, (arr = []));
    arr.push(r);
  }

  const springDoys: number[] = [];
  const fallDoys: number[] = [];
  let frostFreeYears = 0;
  let completeYears = 0;

  for (const [, days] of byYear) {
    if (days.length < 300) continue; // partial year — skip
    completeYears++;
    let lastSpring: string | undefined;
    let firstFall: string | undefined;
    for (const d of days) {
      if (d.tMinC > 0) continue;
      const m = monthOf(d.date);
      if (m <= 6) lastSpring = d.date; // latest Jan–Jun crossing wins
      else if (!firstFall) firstFall = d.date; // earliest Jul–Dec crossing wins
    }
    if (!lastSpring && !firstFall) {
      frostFreeYears++;
      continue;
    }
    if (lastSpring) springDoys.push(dayOfYear(lastSpring));
    if (firstFall) fallDoys.push(dayOfYear(firstFall));
  }

  if (completeYears === 0) return null;
  if (springDoys.length < 3 || fallDoys.length < 3) {
    // Frost too rare to model: nominal mild-climate bounds, flagged upstream.
    return {
      lastSpringFrost: { p50: "01-15", p10: "02-01" },
      firstFallFrost: { p50: "12-15", p10: "12-01" },
      frostFreeDays: 330,
      frostFreeYearFraction: frostFreeYears / completeYears,
    };
  }

  springDoys.sort((a, b) => a - b);
  fallDoys.sort((a, b) => a - b);
  const year = 2025; // non-leap reference year for DOY→MM-DD
  const springP50 = Math.round(percentile(springDoys, 50));
  const springP10 = Math.round(percentile(springDoys, 90)); // later = safer
  const fallP50 = Math.round(percentile(fallDoys, 50));
  const fallP10 = Math.round(percentile(fallDoys, 10)); // earlier = safer

  return {
    lastSpringFrost: {
      p50: monthDayOf(fromDayOfYear(year, springP50)),
      p10: monthDayOf(fromDayOfYear(year, springP10)),
    },
    firstFallFrost: {
      p50: monthDayOf(fromDayOfYear(year, fallP50)),
      p10: monthDayOf(fromDayOfYear(year, fallP10)),
    },
    frostFreeDays: fallP50 - springP50,
    frostFreeYearFraction: frostFreeYears / completeYears,
  };
}

export interface MonthlyNormal {
  month: number;
  tMinC: number;
  tMaxC: number;
  precipMm: number;
  etoMm?: number;
}

/** §9 step 3 — mean monthly tMin/tMax and mean monthly precip totals. */
export function monthlyNormalsFromDaily(records: DailyRecord[]): MonthlyNormal[] {
  const acc = Array.from({ length: 12 }, () => ({
    tMin: 0,
    tMax: 0,
    days: 0,
    precip: 0,
    years: new Set<number>(),
  }));
  for (const r of records) {
    const m = monthOf(r.date) - 1;
    acc[m].tMin += r.tMinC;
    acc[m].tMax += r.tMaxC;
    acc[m].precip += r.precipMm;
    acc[m].days++;
    acc[m].years.add(yearOf(r.date));
  }
  return acc.map((a, i) => ({
    month: i + 1,
    tMinC: a.days ? round1(a.tMin / a.days) : 0,
    tMaxC: a.days ? round1(a.tMax / a.days) : 0,
    precipMm: a.years.size ? round1(a.precip / a.years.size) : 0,
  }));
}

/** §8.1 — equivalent USDA zone from average annual minimum temperature. */
export function zoneFromDaily(records: DailyRecord[]): {
  label: string;
  numeric: number;
} | null {
  const minByYear = new Map<number, number>();
  for (const r of records) {
    const y = yearOf(r.date);
    const cur = minByYear.get(y);
    if (cur === undefined || r.tMinC < cur) minByYear.set(y, r.tMinC);
  }
  const minima = [...minByYear.values()];
  if (minima.length === 0) return null;
  const avgMinF = cToF(minima.reduce((s, v) => s + v, 0) / minima.length);
  // USDA zone n spans [-60 + 10(n-1), -60 + 10n) °F; halves give a/b.
  const n = Math.min(13, Math.max(1, Math.floor((avgMinF + 60) / 10) + 1));
  const within = avgMinF - (-60 + 10 * (n - 1));
  const half = within < 5 ? "a" : "b";
  return { label: `${n}${half}`, numeric: n + (half === "b" ? 0.5 : 0) };
}

/** §27.4 — crude soil temperature: damped trailing mix of monthly air means. */
export function estSoilTempC(
  isoDate: string,
  normals: MonthlyNormal[],
): number {
  const m = monthOf(isoDate);
  const cur = normals[m - 1];
  const prev = normals[(m + 10) % 12]; // previous month, 0-indexed
  const curMean = (cur.tMinC + cur.tMaxC) / 2;
  const prevMean = (prev.tMinC + prev.tMaxC) / 2;
  return round1(0.6 * curMean + 0.4 * prevMean);
}

/** §9 — assemble a full profile from history; null when records unusable. */
export function buildClimateProfile(
  location: Location,
  records: DailyRecord[],
  id: string,
): ClimateProfile | null {
  const frost = frostDatesFromDaily(records);
  if (!frost) return null;
  const normals = monthlyNormalsFromDaily(records);
  const zone = zoneFromDaily(records);
  const notes: string[] = [];
  if (frost.frostFreeYearFraction > 0.5)
    notes.push(
      "Frost is rare here; frost dates are nominal mild-climate bounds.",
    );
  return {
    id,
    locationId: location.id,
    hardinessZone: zone?.label,
    lastSpringFrost: frost.lastSpringFrost,
    firstFallFrost: frost.firstFallFrost,
    frostFreeDays: frost.frostFreeDays,
    monthlyNormals: normals,
    microclimateNotes: notes.join(" ") || undefined,
    derivedFrom: "api",
    fetchedAt: new Date().toISOString(),
  };
}

/** §9 manual fallback — user-entered frost dates (+ optional zone). */
export function manualClimateProfile(
  locationId: string,
  id: string,
  lastSpringFrost: string, // "MM-DD"
  firstFallFrost: string,
  hardinessZone?: string,
): ClimateProfile {
  const spring = dayOfYear(`2025-${lastSpringFrost}`);
  const fall = dayOfYear(`2025-${firstFallFrost}`);
  return {
    id,
    locationId,
    hardinessZone,
    // No distribution to draw from: treat the entered dates as the median and
    // pad one week for the "safe" date.
    lastSpringFrost: {
      p50: lastSpringFrost,
      p10: monthDayOf(fromDayOfYear(2025, Math.min(spring + 7, 180))),
    },
    firstFallFrost: {
      p50: firstFallFrost,
      p10: monthDayOf(fromDayOfYear(2025, Math.max(fall - 7, 186))),
    },
    frostFreeDays: fall - spring,
    derivedFrom: "manual",
    fetchedAt: new Date().toISOString(),
  };
}

/** Numeric zone from a stored label ("8b" → 8.5) for fit comparisons (§16). */
export function zoneNumeric(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const m = /^(\d{1,2})([ab])?$/i.exec(label.trim());
  if (!m) return undefined;
  return Number(m[1]) + (m[2]?.toLowerCase() === "b" ? 0.5 : 0);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
