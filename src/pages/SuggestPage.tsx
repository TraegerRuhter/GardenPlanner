/**
 * §16 Suggest: site-scored, ranked recommendations with reasons, preference
 * toggles, stash badges (§31.1), and a pipe into the Designer palette.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useAppStore } from "../store/appStore";
import { getActiveClimate } from "../db/climateRepo";
import { recommend, type RecommendationPrefs } from "../engines/recommendation";
import { Badge, badgeTone, SpriteImg } from "../components";

export function SuggestPage() {
  const hemisphere = useAppStore((s) => s.settings.hemisphere);
  const defaultLocationId = useAppStore((s) => s.settings.defaultLocationId);
  const activeGardenId = useAppStore((s) => s.activeGardenId);
  const setPendingPlant = useAppStore((s) => s.setPendingPlant);
  const [prefs, setPrefs] = useState<RecommendationPrefs>({ experience: "beginner" });

  const data = useLiveQuery(async () => {
    const [climate, plants, packets, companions, gardens, instances] = await Promise.all([
      getActiveClimate().catch(() => null),
      db.catalog_plants.toArray(),
      db.seedPackets.toArray(),
      db.catalog_companions.toArray(),
      db.gardens.toArray(),
      db.instances.toArray(),
    ]);
    return { climate, plants, packets, companions, gardens, instances };
  }, [defaultLocationId]);

  if (!data) return <Pad>Loading…</Pad>;
  const { climate, plants, packets, companions, gardens, instances } = data;

  if (!climate) {
    return (
      <Pad>
        Suggestions are site-specific — set a location on the{" "}
        <Link to="/calendar" className="text-[var(--color-canopy)] underline">Calendar tab</Link>{" "}
        first.
      </Pad>
    );
  }

  const garden = gardens.find((g) => g.id === activeGardenId) ?? gardens[0] ?? null;
  const recs = recommend(plants, {
    climate: climate.profile,
    hemisphere,
    garden,
    instances,
    packets,
    companions,
    plantsById: new Map(plants.map((p) => [p.id, p])),
  }, prefs).slice(0, 12);

  return (
    <section className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold">Suggest</h1>
      <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
        Scored for {climate.location.label}
        {climate.profile.hardinessZone ? ` (zone ${climate.profile.hardinessZone})` : ""} — season,
        sun, space, water, companions, rotation, and your seed stash (§16).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
        <Toggle on={!!prefs.easyOnly} onClick={() => setPrefs((p) => ({ ...p, easyOnly: !p.easyOnly }))}>easy crops only</Toggle>
        <Toggle on={!!prefs.fastOnly} onClick={() => setPrefs((p) => ({ ...p, fastOnly: !p.fastOnly }))}>fast crops</Toggle>
        <Toggle on={!!prefs.pollinatorFriendly} onClick={() => setPrefs((p) => ({ ...p, pollinatorFriendly: !p.pollinatorFriendly }))}>pollinator-friendly</Toggle>
        <label className="ml-auto font-medium">
          Experience{" "}
          <select
            value={prefs.experience}
            onChange={(e) => setPrefs((p) => ({ ...p, experience: e.target.value as RecommendationPrefs["experience"] }))}
            className="rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1 dark:bg-black/20"
          >
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </label>
      </div>

      <ol className="space-y-2">
        {recs.map((r, i) => (
          <li key={r.plant.id} className="flex items-start gap-3 rounded-xl border border-[var(--color-paper-deep)] bg-white/50 p-3 dark:bg-white/5">
            <span className="mt-1 w-5 text-right font-bold text-[var(--color-ink-soft)]">{i + 1}</span>
            <SpriteImg plant={r.plant} stage="harvest" size={48} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                <Link to={`/encyclopedia/${r.plant.id}`} className="hover:underline">{r.plant.commonName}</Link>
                {r.opensInDays === -1 && <Badge tone={badgeTone.good}>plantable now</Badge>}
                {r.stash === "in_stash" && <Badge tone={badgeTone.good}>in stash</Badge>}
                {r.stash === "in_stash_aging" && <Badge tone={badgeTone.warn}>stash aging</Badge>}
              </p>
              <p className="text-xs text-[var(--color-ink-soft)]">{r.reasons.join(" · ")}</p>
            </div>
            {garden && (
              <Link
                to="/designer"
                onClick={() => setPendingPlant(r.plant.id)}
                className="rounded-lg bg-[var(--color-canopy)] px-2 py-1 text-xs font-medium text-white"
              >
                → place
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-medium ${on ? "bg-[var(--color-canopy)] text-white" : "bg-[var(--color-paper-deep)] text-[var(--color-ink-soft)]"}`}
    >
      {children}
    </button>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-[var(--color-ink-soft)]">{children}</p>;
}
