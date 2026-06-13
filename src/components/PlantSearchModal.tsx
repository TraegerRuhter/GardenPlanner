/**
 * "Search online plants" modal — searches the Perenual API, shows results
 * with preview colors, and imports selected plants into the local catalog.
 */

import { useState } from "react";
import { searchPlants, getPlantDetail, type PerenualSearchResult } from "../adapters/perenual";
import { mapPerenualToPlant } from "../adapters/perenualMapper";
import { db } from "../db/db";

export function PlantSearchModal({
  apiKey,
  onClose,
  onImported,
}: {
  apiKey: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PerenualSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<number>>(new Set());

  async function doSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const r = await searchPlants(q, apiKey);
      setResults(r);
      if (r.length === 0) setError("No plants found.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function doImport(result: PerenualSearchResult) {
    setImporting(result.id);
    setError(null);
    try {
      const detail = await getPlantDetail(result.id, apiKey);
      const plant = mapPerenualToPlant(detail);

      const exists = await db.catalog_plants.get(plant.id);
      if (exists) {
        setError(`"${plant.commonName}" is already in your catalog.`);
        setImporting(null);
        return;
      }

      await db.catalog_plants.add(plant);
      setImported((prev) => new Set(prev).add(result.id));
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10dvh]" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-[var(--color-paper)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Search online plants</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm hover:bg-[var(--color-paper-deep)]">✕</button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); void doSearch(); }}
          className="mb-4 flex gap-2"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. black radish, purple basil, lavender…"
            autoFocus
            className="flex-1 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-canopy)] dark:bg-black/20"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "…" : "Search"}
          </button>
        </form>

        {error && (
          <p className="mb-3 rounded-lg bg-[var(--color-warn)]/15 px-3 py-2 text-sm text-[var(--color-warn)]">{error}</p>
        )}

        <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
          {results.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-paper-deep)] bg-white/40 p-3 dark:bg-white/5"
            >
              {r.default_image?.thumbnail ? (
                <img
                  src={r.default_image.thumbnail}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-paper-deep)] text-xl">🌱</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{r.common_name}</p>
                <p className="truncate text-xs text-[var(--color-ink-soft)]">
                  {r.scientific_name?.[0]}
                  {r.cycle ? ` · ${r.cycle}` : ""}
                  {r.watering ? ` · ${r.watering} water` : ""}
                </p>
              </div>
              {imported.has(r.id) ? (
                <span className="rounded-lg bg-[var(--color-canopy)]/20 px-3 py-1.5 text-xs font-medium text-[var(--color-canopy)]">Added</span>
              ) : (
                <button
                  type="button"
                  disabled={importing === r.id}
                  onClick={() => void doImport(r)}
                  className="shrink-0 rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {importing === r.id ? "…" : "+ Add"}
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 text-center text-[10px] text-[var(--color-ink-soft)]">
          Plant data from Perenual · sprites generated from plant colors
        </p>
      </div>
    </div>
  );
}
