/**
 * §15 Plant Next: what's plantable now / opening soon, beds freeing up with
 * rotation-respecting follow-ons, and the succession scheduler that drops
 * dated ghost placements onto the grid.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useAppStore } from "../store/appStore";
import { getActiveClimate } from "../db/climateRepo";
import { daysUntilOpen, openNow, windowsFor, type PlantingBand } from "../engines/plantingWindows";
import { finishingSoon } from "../engines/recommendation";
import { stashBadge } from "../engines/inventory";
import { scheduleSuccession } from "../db/successionRepo";
import { diffDays, formatShort, todayISO, yearOf } from "../lib/dates";
import { Badge, badgeTone, SpriteImg } from "../components";

export function PlantNextPage() {
  const hemisphere = useAppStore((s) => s.settings.hemisphere);
  const defaultLocationId = useAppStore((s) => s.settings.defaultLocationId);
  const setPendingPlant = useAppStore((s) => s.setPendingPlant);
  const today = todayISO();

  const data = useLiveQuery(async () => {
    const [climate, plants, instances, gardens, packets] = await Promise.all([
      getActiveClimate().catch(() => null),
      db.catalog_plants.orderBy("commonName").toArray(),
      db.instances.toArray(),
      db.gardens.toArray(),
      db.seedPackets.toArray(),
    ]);
    return { climate, plants, instances, gardens, packets };
  }, [defaultLocationId]);

  if (!data) return <Pad>Loading…</Pad>;
  const { climate, plants, instances, gardens, packets } = data;

  if (!climate) {
    return (
      <Pad>
        Set a location on the{" "}
        <Link to="/calendar" className="text-[var(--color-canopy)] underline">Calendar tab</Link>{" "}
        first — Plant Next needs frost dates to know what fits the season.
      </Pad>
    );
  }

  const year = yearOf(today);
  const plantById = new Map(plants.map((p) => [p.id, p]));
  const entries = plants.map((p) => {
    const bands = windowsFor(p, climate.profile, year, hemisphere).filter((b) => b.kind !== "indoor");
    const open = openNow(bands, today);
    let soonest: PlantingBand | null = null;
    let soonestIn = Infinity;
    for (const b of bands) {
      const d = daysUntilOpen(b, today);
      if (d > 0 && d < soonestIn) { soonestIn = d; soonest = b; }
    }
    return { plant: p, open, soonest, soonestIn };
  });

  const openEntries = entries
    .filter((e) => e.open.length > 0)
    .sort((a, b) => diffDays(today, a.open[0].end) - diffDays(today, b.open[0].end));
  const soonEntries = entries
    .filter((e) => e.open.length === 0 && e.soonestIn <= 35)
    .sort((a, b) => a.soonestIn - b.soonestIn);

  const handoffs = finishingSoon(instances, today);
  const gardenName = new Map(gardens.map((g) => [g.id, g.name]));

  return (
    <section className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Plant Next</h1>

      <h2 className="mb-2 font-semibold">Plantable now</h2>
      {openEntries.length === 0 ? (
        <Pad>Nothing opens today — check "opening soon."</Pad>
      ) : (
        <ul className="mb-5 space-y-1.5">
          {openEntries.map(({ plant, open }) => {
            const closesIn = diffDays(today, open[0].end);
            return (
              <li key={plant.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-paper-deep)] bg-white/50 p-2 text-sm dark:bg-white/5">
                <SpriteImg plant={plant} stage="harvest" size={36} />
                <Link to={`/encyclopedia/${plant.id}`} className="font-medium hover:underline">{plant.commonName}</Link>
                <Badge tone={badgeTone.good}>{open[0].kind.replace("_", " ")}</Badge>
                <Badge tone={closesIn <= 10 ? badgeTone.warn : badgeTone.neutral}>
                  {closesIn <= 10 ? `closes in ${closesIn}d!` : `open until ${formatShort(open[0].end)}`}
                </Badge>
                <StashChip plant={plant} packets={packets} />
                <button
                  type="button"
                  onClick={() => setPendingPlant(plant.id)}
                  className="ml-auto rounded-lg bg-[var(--color-canopy)] px-2 py-1 text-xs font-medium text-white"
                >
                  <Link to="/designer">→ place</Link>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mb-2 font-semibold">Opening soon</h2>
      {soonEntries.length === 0 ? (
        <Pad>No windows opening in the next 5 weeks.</Pad>
      ) : (
        <ul className="mb-5 flex flex-wrap gap-1.5">
          {soonEntries.map(({ plant, soonestIn, soonest }) => (
            <li key={plant.id}>
              <Link
                to={`/encyclopedia/${plant.id}`}
                className="flex items-center gap-1.5 rounded-full border border-[var(--color-paper-deep)] bg-white/50 px-2 py-1 text-xs dark:bg-white/5"
              >
                {plant.commonName} · in {soonestIn}d ({soonest!.kind.replace("_", " ")})
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 font-semibold">Beds freeing up</h2>
      {handoffs.length === 0 ? (
        <Pad>No active plantings finish in the next four weeks.</Pad>
      ) : (
        <ul className="mb-5 space-y-1.5">
          {handoffs.map((h) => {
            const plant = plantById.get(h.instance.plantId);
            if (!plant) return null;
            const followers = entries
              .filter((e) =>
                e.plant.familyId !== plant.familyId && // §20 rotation
                (e.open.length > 0 || (e.soonestIn > h.daysAway - 7 && e.soonestIn < h.daysAway + 21)),
              )
              .slice(0, 3);
            return (
              <li key={h.instance.id} className="rounded-lg border border-[var(--color-paper-deep)] bg-white/50 p-2 text-sm dark:bg-white/5">
                <p>
                  <strong>{plant.commonName}</strong> in {gardenName.get(h.instance.gardenId)} wraps up ~{formatShort(h.finishingOn)} ({h.daysAway}d).
                </p>
                {followers.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    Rotation-friendly follow-ons:{" "}
                    {followers.map((f, i) => (
                      <span key={f.plant.id}>
                        {i > 0 && ", "}
                        <Link className="text-[var(--color-canopy)] hover:underline" to={`/encyclopedia/${f.plant.id}`}>
                          {f.plant.commonName}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <SuccessionForm
        gardens={gardens}
        plants={plants.filter((p) => p.tags.includes("succession") || p.daysToMaturity.max <= 60)}
      />
    </section>
  );
}

function StashChip({ plant, packets }: { plant: Parameters<typeof stashBadge>[1] & { id: string }; packets: Parameters<typeof stashBadge>[0] }) {
  const badge = stashBadge(packets, plant);
  if (badge === "out_of_stash") return null;
  return (
    <Badge tone={badge === "in_stash" ? badgeTone.good : badgeTone.warn}>
      {badge === "in_stash" ? "seed in stash" : "stash aging"}
    </Badge>
  );
}

function SuccessionForm({
  gardens,
  plants,
}: {
  gardens: Array<{ id: string; name: string; areas: Array<{ id: string; name: string }> }>;
  plants: Array<{ id: string; commonName: string }>;
}) {
  const [gardenId, setGardenId] = useState(gardens[0]?.id ?? "");
  const garden = gardens.find((g) => g.id === gardenId) ?? gardens[0];
  const [areaId, setAreaId] = useState(garden?.areas[0]?.id ?? "");
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [start, setStart] = useState(todayISO());
  const [interval, setInterval] = useState(12);
  const [count, setCount] = useState(4);
  const [result, setResult] = useState<string>();

  if (!garden || plants.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        Create a garden in the Designer to schedule successions.
      </p>
    );
  }
  const area = garden.areas.find((a) => a.id === areaId) ?? garden.areas[0];

  return (
    <div className="rounded-xl border border-[var(--color-paper-deep)] bg-white/40 p-3 dark:bg-white/5">
      <h2 className="mb-1 font-semibold">Succession scheduler</h2>
      <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
        Repeated sowings of a fast crop, spread out for a steady harvest (§15).
        Each sowing lands as a ghost on the grid plus a dated sow task.
      </p>
      <form
        className="flex flex-wrap items-end gap-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void scheduleSuccession(garden.id, area.id, plantId, start, interval, count).then((r) =>
            setResult(
              r.placed === r.requested
                ? `Scheduled ${r.placed} sowings ✓ — see the grid ghosts and Tasks.`
                : `Placed ${r.placed} of ${r.requested} (area ran out of free tiles).`,
            ),
          );
        }}
      >
        <Sel label="Plant" value={plantId} onChange={setPlantId} options={plants.map((p) => [p.id, p.commonName])} />
        <Sel label="Garden" value={garden.id} onChange={(v) => { setGardenId(v); setAreaId(gardens.find((g) => g.id === v)?.areas[0]?.id ?? ""); }} options={gardens.map((g) => [g.id, g.name])} />
        <Sel label="Area" value={area.id} onChange={setAreaId} options={garden.areas.map((a) => [a.id, a.name])} />
        <label className="font-medium">Start
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20" />
        </label>
        <label className="font-medium">Every (days)
          <input type="number" min={5} max={30} value={interval} onChange={(e) => setInterval(Number(e.target.value))} className="mt-1 block w-20 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20" />
        </label>
        <label className="font-medium">Sowings
          <input type="number" min={2} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 block w-16 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20" />
        </label>
        <button type="submit" className="rounded-lg bg-[var(--color-canopy)] px-3 py-2 font-medium text-white">
          Schedule
        </button>
      </form>
      {result && <p className="mt-2 text-sm text-[var(--color-canopy)]">{result}</p>}
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="font-medium">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20">
        {options.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-[var(--color-ink-soft)]">{children}</p>;
}
