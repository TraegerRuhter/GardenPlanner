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
  const [editing, setEditing] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selectedPlants, setSelectedPlants] = useState<Set<string> | null>(null);

  const year = new Date().getFullYear();

  const data = useLiveQuery(async () => {
    const climate = await getActiveClimate();
    const plants = await db.catalog_plants.orderBy("commonName").toArray();
    return { climate, plants };
  }, [defaultLocationId, refresh]);

  if (!data) return <Pad>Loading…</Pad>;
  const { climate, plants } = data;

  if (!climate || editing) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">Calendar</h1>
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
  const active = selectedPlants ?? new Set(plants.map((p) => p.id));

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
        <h1 className="text-2xl font-bold">Calendar</h1>
        <span className="text-sm text-[var(--color-ink-soft)]">{location.label}</span>
        {profile.hardinessZone && <Badge tone={badgeTone.good}>zone {profile.hardinessZone}</Badge>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto rounded-md bg-[var(--color-paper-deep)] px-2 py-1 text-xs font-medium"
        >
          Change location
        </button>
      </div>
      <p className="mb-4 text-xs text-[var(--color-ink-soft)]">
        Median frost: last spring {formatShort(inYear(profile.lastSpringFrost.p50, year))}, first
        fall {formatShort(inYear(profile.firstFallFrost.p50, year))}
        {" · "}frost-safe (10% risk): {formatShort(inYear(profile.lastSpringFrost.p10, year))} /{" "}
        {formatShort(inYear(profile.firstFallFrost.p10, year))}
        {profile.frostFreeDays ? ` · ${profile.frostFreeDays} frost-free days` : ""}
        {profile.derivedFrom === "manual" ? " · entered manually" : " · derived from 10y history"}
        {profile.microclimateNotes ? ` · ${profile.microclimateNotes}` : ""}
      </p>

      <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Plants shown">
        <button
          type="button"
          onClick={() => setSelectedPlants(null)}
          aria-pressed={selectedPlants === null}
          className={chipClass(selectedPlants === null)}
        >
          All
        </button>
        {plants.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={active.has(p.id)}
            onClick={() =>
              setSelectedPlants((prev) => {
                const next = new Set(prev ?? plants.map((x) => x.id));
                if (next.has(p.id)) next.delete(p.id);
                else next.add(p.id);
                return next;
              })
            }
            className={chipClass(active.has(p.id))}
          >
            {p.commonName}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Pad>No plants selected.</Pad>
      ) : (
        <WindowChart rows={rows} climate={profile} year={year} hemisphere={hemisphere} />
      )}
    </section>
  );
}

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
