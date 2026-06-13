/**
 * Perenual plant API adapter — search and fetch plant details from the
 * Perenual database (10,000+ species). Results are cached in IndexedDB.
 */

import { cachedJson, fetchJson, TTL } from "./cache";

const BASE = "https://perenual.com/api/v2";

export interface PerenualSearchResult {
  id: number;
  common_name: string;
  scientific_name: string[];
  other_name: string[];
  cycle: string;
  watering: string;
  sunlight: string[];
  default_image?: {
    original_url?: string;
    regular_url?: string;
    medium_url?: string;
    small_url?: string;
    thumbnail?: string;
  };
}

export interface PerenualSearchResponse {
  data: PerenualSearchResult[];
  to: number;
  per_page: number;
  current_page: number;
  last_page: number;
  total: number;
}

export interface PerenualPlantDetail {
  id: number;
  common_name: string;
  scientific_name: string[];
  other_name: string[];
  family: string | null;
  type: string;
  cycle: string;
  watering: string;
  watering_general_benchmark?: { value: string; unit: string };
  sunlight: string[];
  pruning_month: string[];
  growth_rate: string | null;
  maintenance: string | null;
  hardiness: { min: string; max: string } | null;
  indoor: boolean;
  care_level: string | null;
  flowers: boolean;
  flowering_season: string | null;
  flower_color: string;
  leaf: boolean;
  leaf_color: string[];
  fruit_color: string[];
  harvest_season: string | null;
  depth_water_requirement?: { value: string; unit: string } | null;
  edible_fruit: boolean;
  edible_leaf: boolean;
  cuisine: boolean;
  medicinal: boolean;
  poisonous_to_humans: number;
  poisonous_to_pets: number;
  drought_tolerant: boolean;
  salt_tolerant: boolean;
  thorny: boolean;
  invasive: boolean;
  tropical: boolean;
  description: string;
  default_image?: {
    original_url?: string;
    medium_url?: string;
    small_url?: string;
    thumbnail?: string;
  };
  dimensions?: {
    type: string;
    min_value: number;
    max_value: number;
    unit: string;
  };
  plant_anatomy?: Array<{
    part: string;
    color: string[];
  }>;
}

export async function searchPlants(
  query: string,
  apiKey: string,
): Promise<PerenualSearchResult[]> {
  const url = `${BASE}/species-list?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  const { data } = await cachedJson<PerenualSearchResponse>(
    `perenual:search:${query.toLowerCase().trim()}`,
    TTL.geocode,
    () => fetchJson(url),
  );
  return data.data;
}

export async function getPlantDetail(
  id: number,
  apiKey: string,
): Promise<PerenualPlantDetail> {
  const url = `${BASE}/species/details/${id}?key=${encodeURIComponent(apiKey)}`;
  const { data } = await cachedJson<PerenualPlantDetail>(
    `perenual:detail:${id}`,
    TTL.normals,
    () => fetchJson(url),
  );
  return data;
}
