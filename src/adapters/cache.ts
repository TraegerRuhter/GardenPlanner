/**
 * Adapter cache (§8.3): every network result lands in the `caches` store with
 * a timestamp; reads are cache-first with TTL, and a failed refetch falls
 * back to stale data rather than erroring — offline must never block (§2.4).
 */

import { db } from "../db/db";

export const TTL = {
  forecast: 6 * 60 * 60 * 1000, // 6 h (§8.3)
  normals: 7 * 24 * 60 * 60 * 1000, // 7 d
  geocode: 30 * 24 * 60 * 60 * 1000, // 30 d
} as const;

export async function cachedJson<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; stale: boolean }> {
  const hit = await db.caches.get(key);
  const age = hit ? Date.now() - new Date(hit.fetchedAt).getTime() : Infinity;
  if (hit && age < ttlMs) return { data: hit.payload as T, stale: false };

  try {
    const data = await fetcher();
    await db.caches.put({
      key,
      fetchedAt: new Date().toISOString(),
      payload: data,
    });
    return { data, stale: false };
  } catch (err) {
    if (hit) return { data: hit.payload as T, stale: true }; // offline fallback
    throw err;
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}
