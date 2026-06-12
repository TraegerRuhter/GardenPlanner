/**
 * Network smoke test — NOT part of `npm test` (lives outside src/).
 * Run explicitly: npx vitest run scripts/climate.smoke.test.ts
 * Exercises the real Open-Meteo pipeline end-to-end: geocode → 10y history →
 * frost dates / normals / zone, for the spec's own example site (§7.8).
 */

import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openMeteoGeocode, openMeteoWeather } from "../src/adapters/openMeteo";
import {
  frostDatesFromDaily,
  monthlyNormalsFromDaily,
  zoneFromDaily,
} from "../src/engines/climate";

describe("Open-Meteo pipeline (real network)", () => {
  it("derives a sane climate profile for Pacific City, Oregon", async () => {
    const places = await openMeteoGeocode.search("Pacific City");
    const pc = places.find((p) => p.label.includes("Oregon")) ?? places[0];
    expect(pc).toBeDefined();

    const records = await openMeteoWeather.getHistoricalDaily(
      { id: "x", label: pc.label, lat: pc.lat, lon: pc.lon, source: "geocode" },
      new Date().getFullYear() - 11,
    );
    expect(records.length).toBeGreaterThan(3000); // ~10 years of days

    const frost = frostDatesFromDaily(records)!;
    const normals = monthlyNormalsFromDaily(records);
    const zone = zoneFromDaily(records)!;

    // Oregon coast: mild maritime — zone 8–9, long frost-free season,
    // wet winters and dry summers.
    expect(zone.numeric).toBeGreaterThanOrEqual(8);
    expect(zone.numeric).toBeLessThanOrEqual(10);
    expect(frost.frostFreeDays).toBeGreaterThan(150);
    expect(normals[11].precipMm).toBeGreaterThan(normals[6].precipMm * 3);

    console.log("Pacific City:", {
      label: pc.label,
      zone: zone.label,
      lastSpring: frost.lastSpringFrost,
      firstFall: frost.firstFallFrost,
      frostFree: frost.frostFreeDays,
      janPrecip: normals[0].precipMm,
      julPrecip: normals[6].precipMm,
    });
  }, 60_000);
});
