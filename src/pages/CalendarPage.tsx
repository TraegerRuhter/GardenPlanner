/**
 * §11 Calendar tab: location header (zone, frost dates, percentile note),
 * the whole-catalog band chart with per-plant filtering, and the location
 * setup flow when no climate profile exists yet. Narrows to the active
 * garden's plants once gardens exist (Phase 2, §11.2).
 */

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useAppStore } from "../store/appStore";
import { getActiveClimate } from "../db/climateRepo";
import { windowsFor } from "../engines/plantingWindows";
import { WindowChart, type ChartRow } from "../components/WindowChart";
import { LocationSetup } from "../components/LocationSetup";
import { formatShort, inYear } from "../lib/dates";
import { Badge, badgeTone } from "../components";

export function CalendarPage() {
  const hemisphere = useAppStore((s) => s.settings.hemisphere);
  const defaultLocationId = useAppStore((s) => s.settings.defaultLocationId);
  const activeGardenId = useAppStore((s) => s.activeGardenId);
  const [editing, setEditing] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selectedPlants, setSelectedPlants] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const year = new Date().getFullYear();

  const data = useLiveQuery(async () => {
    const climate = await getActiveClimate();
    const plants = await db.catalog_plants.orderBy("commonName").toArray();
    let gardenPlantIds: string[] = [];
    if (activeGardenId) {
      const instances = await db.instances.where("gardenId").equals(activeGardenId).toArray();
      gardenPlantIds = [
        ...new Set(
          instances.filter((i) => i.status === "active" || i.status === "planned").map((i) => i.plantId),
        ),
      ];
    }
    return { climate, plants, gardenPlantIds };
  }, [defaultLocationId, refresh, activeGardenId]);

  if (!data) return <Pad>Loading…</Pad>;
  const { climate, plants, gardenPlantIds } = data;

  if (!climate || editing) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold">Planting Calendar</h1>
        <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
          Set your location so we can calculate frost dates and planting windows.
        </p>
        <LocationSetup
          onDone={() => {
            setEditing(false);
            setRefresh((n) => n + 1);
          }}
        />
      </section>
    );
  }

  const { location, profile } = climate;
  // Default to the active garden's plants so the chart isn't a wall of every
  // catalog entry; the picker below lets you switch to All / None / custom.
  const allIds = plants.map((p) => p.id);
  const defaultIds = gardenPlantIds.length ? gardenPlantIds : allIds;
  const active = selectedPlants ?? new Set(defaultIds);
  const term = query.trim().toLowerCase();
  const pickerPlants = term
    ? plants.filter(
        (p) => p.commonName.toLowerCase().includes(term) || p.scientificName.toLowerCase().includes(term),
      )
    : plants;

  const togglePlant = (id: string) =>
    setSelectedPlants((prev) => {
      const next = new Set(prev ?? defaultIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: ChartRow[] = plants
    .filter((p) => active.has(p.id))
    .map((p) => ({
      label: p.commonName,
      bands: windowsFor(p, profile, year, hemisphere),
    }))
    .filter((r) => r.bands.length > 0);

  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Planting Calendar</h1>
        <span className="text-sm text-[var(--color-ink-soft)]">{location.label}</span>
        {profile.hardinessZone && <Badge tone={badgeTone.good}>zone {profile.hardinessZone}</Badge>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto rounded-md bg-[var(--color-paper-deep)] px-2 py-1 text-xs font-medium"
        >
          Edit Location
        </button>
      </div>
      <div className="mb-4 rounded-lg border border-[var(--color-paper-deep)] bg-white/30 p-2.5 text-xs text-[var(--color-ink-soft)] dark:bg-white/5">
        <p>
          <span className="font-medium text-[var(--color-ink)]">Frost Dates:</span>{" "}
          Last spring frost: {formatShort(inYear(profile.lastSpringFrost.p50, year))}{" "}
          · First fall frost: {formatShort(inYear(profile.firstFallFrost.p50, year))}
          {profile.frostFreeDays ? ` · ${profile.frostFreeDays} frost-free days` : ""}
        </p>
        <p className="mt-0.5">
          <span className="font-medium text-[var(--color-ink)]">Safe Dates (10% risk):</span>{" "}
          {formatShort(inYear(profile.lastSpringFrost.p10, year))} / {formatShort(inYear(profile.firstFallFrost.p10, year))}
          {profile.derivedFrom === "manual" ? " · Entered manually" : " · From 10-year history"}
          {profile.microclimateNotes ? ` · ${profile.microclimateNotes}` : ""}
        </p>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-ink-soft)]">Plants</span>
          <span className="text-xs text-[var(--color-ink-soft)]">
            {rows.length} of {plants.length} shown
          </span>
          <div className="ml-auto flex flex-wrap gap-1">
            {gardenPlantIds.length > 0 && (
              <button type="button" onClick={() => setSelectedPlants(new Set(gardenPlantIds))} className={quickClass}>
                My Garden ({gardenPlantIds.length})
              </button>
            )}
            <button type="button" onClick={() => setSelectedPlants(new Set(allIds))} className={quickClass}>
              All
            </button>
            <button type="button" onClick={() => setSelectedPlants(new Set())} className={quickClass}>
              None
            </button>
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              aria-expanded={showPicker}
              className={quickClass}
            >
              {showPicker ? "Hide List" : "Choose…"}
            </button>
          </div>
        </div>

        {showPicker && (
          <div className="rounded-lg border border-[var(--color-paper-deep)] bg-white/30 p-2 dark:bg-white/5">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${plants.length} plants…`}
              aria-label="Search plants"
              className="w-full rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1 text-sm dark:bg-black/20"
            />
            <div className="mt-2 flex max-h-48 flex-wrap gap-1 overflow-y-auto" role="group" aria-label="Filter plants">
              {pickerPlants.length === 0 ? (
                <p className="px-1 py-1 text-xs text-[var(--color-ink-soft)]">No plants match “{query}”.</p>
              ) : (
                pickerPlants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active.has(p.id)}
                    onClick={() => togglePlant(p.id)}
                    className={chipClass(active.has(p.id))}
                  >
                    {p.commonName}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <Pad>
          No plants selected.{" "}
          {gardenPlantIds.length > 0
            ? "Tap “My Garden” to see what you’ve planted, or "
            : "Add plants to your garden, or tap "}
          “All” / “Choose…” above to pick what to chart.
        </Pad>
      ) : (
        <WindowChart rows={rows} climate={profile} year={year} hemisphere={hemisphere} />
      )}
    </section>
  );
}

const quickClass = "rounded-md bg-[var(--color-paper-deep)] px-2 py-1 text-xs font-medium text-[var(--color-ink-soft)]";

function chipClass(on: boolean): string {
  return `rounded-full px-2.5 py-1 text-xs font-medium ${
    on
      ? "bg-[var(--color-canopy)] text-white"
      : "bg-[var(--color-paper-deep)] text-[var(--color-ink-soft)]"
  }`;
}

function Pad({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-[var(--color-ink-soft)]">{children}</p>;
}
