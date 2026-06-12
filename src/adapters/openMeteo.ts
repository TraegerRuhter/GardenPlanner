/**
 * Open-Meteo adapters (§8.1, §8.2): free, keyless weather/geocoding.
 * Historical daily data drives frost dates + normals (ClimateEngine);
 * the forecast drives watering deficit (§17) and waterlogging risk (§31.2).
 * All calls go through the IndexedDB cache with stale fallback.
 */

import type { DailyForecast, DailyRecord, GeocodeAdapter, WeatherAdapter } from "../types/adapters";
import type { Location } from "../types/models";
import { cachedJson, fetchJson, TTL } from "./cache";

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

interface OMDaily {
  daily?: {
    time: string[];
    temperature_2m_min: (number | null)[];
    temperature_2m_max: (number | null)[];
    precipitation_sum: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
}

function key(loc: Location): string {
  return `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
}

function toRecords(d: NonNullable<OMDaily["daily"]>): DailyRecord[] {
  const out: DailyRecord[] = [];
  for (let i = 0; i < d.time.length; i++) {
    const tMin = d.temperature_2m_min[i];
    const tMax = d.temperature_2m_max[i];
    if (tMin == null || tMax == null) continue; // incomplete tail days
    out.push({
      date: d.time[i],
      tMinC: tMin,
      tMaxC: tMax,
      precipMm: d.precipitation_sum[i] ?? 0,
    });
  }
  return out;
}

/**
 * Season-to-date daily actuals for GDD pacing (§13.3): the forecast endpoint
 * serves up to 92 past days, covering most of a growing season without the
 * archive's completeness lag.
 */
export async function getRecentDaily(
  loc: Location,
  pastDays = 92,
): Promise<DailyRecord[]> {
  const url =
    `${FORECAST}?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum` +
    `&past_days=${Math.min(pastDays, 92)}&forecast_days=1&timezone=auto`;
  const { data } = await cachedJson(
    `weather:recent:${key(loc)}`,
    TTL.forecast,
    () => fetchJson<OMDaily>(url),
  );
  return data.daily ? toRecords(data.daily) : [];
}

export const openMeteoWeather: WeatherAdapter = {
  async getHistoricalDaily(loc, fromYear) {
    const endYear = new Date().getFullYear() - 1; // archive lags ~5 days; whole years only
    const url =
      `${ARCHIVE}?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&start_date=${fromYear}-01-01&end_date=${endYear}-12-31` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=auto`;
    const { data } = await cachedJson(
      `weather:history:${key(loc)}:${fromYear}-${endYear}`,
      TTL.normals,
      () => fetchJson<OMDaily>(url),
    );
    return data.daily ? toRecords(data.daily) : [];
  },

  async getDailyForecast(loc, days) {
    const url =
      `${FORECAST}?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max` +
      `&forecast_days=${Math.min(days, 16)}&past_days=3&timezone=auto`;
    const { data } = await cachedJson(
      `weather:forecast:${key(loc)}`,
      TTL.forecast,
      () => fetchJson<OMDaily>(url),
    );
    if (!data.daily) return [];
    const records = toRecords(data.daily);
    return records.map((r, i): DailyForecast => {
      const p = data.daily!.precipitation_probability_max?.[i];
      return p == null ? r : { ...r, precipProbabilityPct: p };
    });
  },
};

interface OMGeo {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    elevation?: number;
    admin1?: string;
    country_code?: string;
  }>;
}

export const openMeteoGeocode: GeocodeAdapter = {
  async search(query) {
    const q = query.trim();
    if (!q) return [];
    const url = `${GEOCODE}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
    const { data } = await cachedJson(
      `geocode:${q.toLowerCase()}`,
      TTL.geocode,
      () => fetchJson<OMGeo>(url),
    );
    return (data.results ?? []).map((r) => ({
      label: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
      elevationM: r.elevation,
    }));
  },
};
