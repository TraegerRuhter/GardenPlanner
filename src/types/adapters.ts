/**
 * Network adapter contracts (§8). All network access goes through these
 * interfaces — never a raw fetch in a component (§0.1 rule 5). Every adapter
 * implementation is cached in the `caches` store with a timestamp and reads
 * cache-first (default staleness: 7 days for normals, 6 hours for forecast).
 * Every adapter has a manual fallback path (§8, §9).
 *
 * Concrete implementations (Open-Meteo, Nominatim) land in Phase 1.
 */

import type { Location } from "./models";

/** One day of observed historical weather (§8.1, drives frost dates + GDD). */
export interface DailyRecord {
  date: string; // ISO date
  tMinC: number;
  tMaxC: number;
  precipMm: number;
  etoMm?: number; // reference evapotranspiration if the source provides it
}

/** One day of forecast weather (§8.1, drives watering deficit + frost alerts). */
export interface DailyForecast extends DailyRecord {
  precipProbabilityPct?: number;
}

export interface WeatherAdapter {
  getDailyForecast(loc: Location, days: number): Promise<DailyForecast[]>;
  getHistoricalDaily(loc: Location, fromYear: number): Promise<DailyRecord[]>;
}

export interface GeocodeAdapter {
  search(
    query: string,
  ): Promise<Array<{ label: string; lat: number; lon: number; elevationM?: number }>>;
}

/**
 * Hardiness lookup (§5.1, §8.1): derive an equivalent USDA zone from average
 * annual minimum temperature so it works internationally.
 */
export interface HardinessAdapter {
  getZone(loc: Location): Promise<{ zone: string; avgAnnualMinC: number }>;
}
