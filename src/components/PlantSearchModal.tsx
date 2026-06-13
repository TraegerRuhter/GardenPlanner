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
      if (r.length === 0) setError("No plants found — try a different search term.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed — check your API key and try again.");
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
      setError(e instanceof Error ? e.message : "Import failed — please try again.");
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8dvh]" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-[var(--color-paper)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">Search Online Plants</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm hover:bg-[var(--color-paper-deep)]">✕</button>
        </div>
        <p className="mb-4 text-xs text-[var(--color-ink-soft)]">
          Search the Perenual database to find and add plants to your catalog.
          Each imported plant gets a procedurally generated sprite.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); void doSearch(); }}
          className="mb-4 flex gap-2"
        >
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]">🔍</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. black radish, purple basil, lavender…"
              autoFocus
              className="w-full rounded-lg border border-[var(--color-paper-deep)] bg-white/60 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-canopy)] dark:bg-black/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {error && (
          <p className="mb-3 rounded-lg bg-[var(--color-warn)]/10 px-3 py-2 text-sm font-medium text-[var(--color-warn)]">{error}</p>
        )}

        {results.length > 0 && (
          <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
            {results.length} result{results.length !== 1 ? "s" : ""} found
            {imported.size > 0 && ` · ${imported.size} added to catalog`}
          </p>
        )}

        <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
          {results.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-paper-deep)] bg-white/40 p-3 transition-colors hover:border-[var(--color-canopy)]/40 dark:bg-white/5"
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
                <span className="rounded-lg bg-[var(--color-canopy)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-canopy)]">
                  ✓ Added
                </span>
              ) : (
                <button
                  type="button"
                  disabled={importing === r.id}
                  onClick={() => void doImport(r)}
                  className="shrink-0 rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:opacity-90"
                >
                  {importing === r.id ? "Adding…" : "+ Add to Catalog"}
                </button>
              )}
            </div>
          ))}
        </div>

        {results.length === 0 && !loading && !error && (
          <div className="py-8 text-center text-[var(--color-ink-soft)]">
            <p className="text-lg">🌿</p>
            <p className="mt-1 text-sm">Search for a plant to get started</p>
          </div>
        )}

        <p className="mt-3 text-center text-[10px] text-[var(--color-ink-soft)]">
          Plant data from Perenual · sprites are procedurally generated from plant colors
        </p>
      </div>
    </div>
  );
}
