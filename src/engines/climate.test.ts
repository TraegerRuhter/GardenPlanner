import { describe, expect, it } from "vitest";
import type { DailyRecord } from "../types/adapters";
import {
  estSoilTempC,
  frostDatesFromDaily,
  monthlyNormalsFromDaily,
  zoneFromDaily,
  zoneNumeric,
} from "./climate";
import { addDays, dayOfYear, inYear } from "../lib/dates";

/**
 * Synthetic ten-year climate: sinusoidal temps, frost crossing around
 * mid-April and mid-October with a deterministic per-year wobble.
 */
function syntheticYears(
  years: number[],
  opts: { amplitude?: number; meanC?: number } = {},
): DailyRecord[] {
  const { amplitude = 14, meanC = 8 } = opts;
  const out: DailyRecord[] = [];
  for (const y of years) {
    const wobble = ((y * 7) % 5) - 2; // -2..2 °C deterministic variation
    let d = `${y}-01-01`;
    while (d.startsWith(String(y))) {
      const doy = dayOfYear(d);
      // coldest mid-January (doy 15), warmest mid-July
      const seasonal = -Math.cos(((doy - 15) / 365) * 2 * Math.PI);
      const mean = meanC + wobble + amplitude * seasonal;
      out.push({ date: d, tMinC: mean - 6, tMaxC: mean + 6, precipMm: 2 });
      d = addDays(d, 1);
    }
  }
  return out;
}

const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

describe("frost dates (§27.1)", () => {
  const frost = frostDatesFromDaily(syntheticYears(YEARS))!;

  it("finds spring and fall crossings in plausible months", () => {
    expect(frost).not.toBeNull();
    const springDoy = dayOfYear(inYear(frost.lastSpringFrost.p50, 2025));
    const fallDoy = dayOfYear(inYear(frost.firstFallFrost.p50, 2025));
    expect(springDoy).toBeGreaterThan(60); // after Mar 1
    expect(springDoy).toBeLessThan(150); // before Jun
    expect(fallDoy).toBeGreaterThan(270); // after late Sep
    expect(fallDoy).toBeLessThan(340); // before Dec
    expect(frost.frostFreeDays).toBe(fallDoy - springDoy);
  });

  it("p10 is the conservative date on both ends (§30.4 convention)", () => {
    expect(
      dayOfYear(inYear(frost.lastSpringFrost.p10, 2025)),
    ).toBeGreaterThanOrEqual(dayOfYear(inYear(frost.lastSpringFrost.p50, 2025)));
    expect(dayOfYear(inYear(frost.firstFallFrost.p10, 2025))).toBeLessThanOrEqual(
      dayOfYear(inYear(frost.firstFallFrost.p50, 2025)),
    );
  });

  it("flags frost-rare climates instead of failing", () => {
    const mild = frostDatesFromDaily(
      syntheticYears(YEARS, { meanC: 18, amplitude: 6 }), // never near 0°C
    )!;
    expect(mild.frostFreeYearFraction).toBe(1);
    expect(mild.frostFreeDays).toBeGreaterThan(300);
  });

  it("returns null with no usable data", () => {
    expect(frostDatesFromDaily([])).toBeNull();
  });
});

describe("normals, zone, soil temp (§9, §27.4)", () => {
  const records = syntheticYears(YEARS);
  const normals = monthlyNormalsFromDaily(records);

  it("derives 12 ordered months with sane seasonality", () => {
    expect(normals).toHaveLength(12);
    expect(normals[6].tMaxC).toBeGreaterThan(normals[0].tMaxC); // Jul > Jan
    for (const n of normals) expect(n.tMaxC).toBeGreaterThan(n.tMinC);
  });

  it("estimates soil temp lagging air temp in spring", () => {
    const aprAir = (normals[3].tMinC + normals[3].tMaxC) / 2;
    const soilApr = estSoilTempC("2026-04-15", normals);
    expect(soilApr).toBeLessThan(aprAir); // soil trails air on the way up
  });

  it("derives a plausible USDA-equivalent zone", () => {
    const zone = zoneFromDaily(records)!;
    // avg annual min ≈ meanC - wobblē - amplitude - 6 ≈ -12°C → ~zone 6
    expect(zone.numeric).toBeGreaterThanOrEqual(5);
    expect(zone.numeric).toBeLessThanOrEqual(8);
    expect(zone.label).toMatch(/^\d{1,2}[ab]$/);
  });

  it("parses zone labels back to numbers", () => {
    expect(zoneNumeric("8b")).toBe(8.5);
    expect(zoneNumeric("8a")).toBe(8);
    expect(zoneNumeric("10")).toBe(10);
    expect(zoneNumeric("garbage")).toBeUndefined();
  });
});
