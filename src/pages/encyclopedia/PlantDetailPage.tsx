/**
 * §10 plant detail: Overview · Calendar (Phase 1) · Stages · Care ·
 * Varieties (§18) · Recipes (§18) · Companions (§20). Data joins resolve
 * live from the catalog stores.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { Plant } from "../../types/models";
import { useAppStore } from "../../store/appStore";
import { formatDepthMm, formatLength, formatRange, formatTemp } from "../../lib/units";
import { SpriteImg } from "../../components/SpriteImg";
import { Badge } from "../../components/Badge";
import { badgeTone } from "../../components/badgeTone";
import { getActiveClimate } from "../../db/climateRepo";
import { windowsFor } from "../../engines/plantingWindows";
import { WindowChart, type ChartRow } from "../../components/WindowChart";

const TABS = ["Overview", "Calendar", "Stages", "Care", "Varieties", "Recipes", "Companions"] as const;
type Tab = (typeof TABS)[number];

export function PlantDetailPage() {
  const { plantId } = useParams<{ plantId: string }>();
  const [tab, setTab] = useState<Tab>("Overview");
  const units = useAppStore((s) => s.settings.unitSystem);

  const data = useLiveQuery(async () => {
    if (!plantId) return undefined;
    const plant = await db.catalog_plants.get(plantId);
    if (!plant) return null;
    const [family, template, varietals, recipes, companionsA, companionsB] =
      await Promise.all([
        db.catalog_families.get(plant.familyId),
        db.catalog_stageTemplates.get(plant.stageTemplateId),
        db.catalog_varietals.where("plantId").equals(plant.id).toArray(),
        db.catalog_recipes.where("plantIds").equals(plant.id).toArray(),
        db.catalog_companions.where("aPlantId").equals(plant.id).toArray(),
        db.catalog_companions.where("bPlantId").equals(plant.id).toArray(),
      ]);
    const partnerIds = [
      ...companionsA.map((c) => c.bPlantId),
      ...companionsB.map((c) => c.aPlantId),
    ];
    const partners = await db.catalog_plants.bulkGet(partnerIds);
    const companions = [...companionsA, ...companionsB].map((c, i) => ({
      rel: c,
      partner: partners[i],
    }));
    return { plant, family, template, varietals, recipes, companions };
  }, [plantId]);

  if (data === undefined) return <Pad>Loading…</Pad>;
  if (data === null)
    return (
      <Pad>
        Unknown plant. <Link className="underline" to="/encyclopedia">Back to the encyclopedia.</Link>
      </Pad>
    );
  const { plant, family, template, varietals, recipes, companions } = data;

  return (
    <section className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/encyclopedia" className="text-sm text-[var(--color-ink-soft)] hover:underline">
        ← Encyclopedia
      </Link>

      <header className="mt-2 mb-4 flex items-center gap-4">
        <SpriteImg plant={plant} stage="harvest" size={80} />
        <div>
          <h1 className="text-2xl font-bold leading-tight">{plant.commonName}</h1>
          <p className="text-sm italic text-[var(--color-ink-soft)]">
            {plant.scientificName} · {family?.commonName ?? plant.familyId}
          </p>
          <p className="mt-1 flex flex-wrap gap-1">
            <Badge tone={badgeTone.neutral}>{plant.lifecycle}</Badge>
            <Badge tone={badgeTone.sun}>☀ {plant.sun} ({plant.sunHoursMin}h+)</Badge>
            <Badge tone={badgeTone.water}>💧 {plant.waterNeed}</Badge>
            <Badge tone={plant.frostTolerance === "tender" ? badgeTone.warn : badgeTone.good}>
              ❄ {plant.frostTolerance.replace("_", "-")}
            </Badge>
            <Badge tone={badgeTone.neutral}>
              {plant.daysToMaturity.min}–{plant.daysToMaturity.max}d from {plant.daysToMaturity.from}
            </Badge>
          </p>
        </div>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--color-paper-deep)]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-[var(--color-canopy)] text-[var(--color-canopy)]"
                : "text-[var(--color-ink-soft)]"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Overview" && (
        <div className="space-y-4">
          <p>{plant.description}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Fact k="Hardiness zones" v={`${plant.hardinessZones.min}–${plant.hardinessZones.max}`} />
            <Fact k="Heat tolerance" v={plant.heatTolerance} />
            <Fact k="Soil pH" v={`${plant.soilPh.min}–${plant.soilPh.max}`} />
            <Fact k="Min soil temp" v={formatTemp(plant.minSoilTempC, units)} />
            <Fact
              k="Height"
              v={formatRange(plant.matureHeightCm.min, plant.matureHeightCm.max, (v) => formatLength(v, units))}
            />
            <Fact
              k="Spread"
              v={formatRange(plant.matureSpreadCm.min, plant.matureSpreadCm.max, (v) => formatLength(v, units))}
            />
            <Fact k="Spacing in row" v={formatLength(plant.spacing.inRowCm, units)} />
            <Fact k="Between rows" v={formatLength(plant.spacing.betweenRowCm, units)} />
            {plant.spacing.squareFootCount && (
              <Fact k="Per square foot" v={String(plant.spacing.squareFootCount)} />
            )}
            {plant.waterMmPerWeek && (
              <Fact
                k="Water / week"
                v={formatRange(plant.waterMmPerWeek.min, plant.waterMmPerWeek.max, (v) => formatDepthMm(v, units))}
              />
            )}
            <Fact k="Waterlogging risk" v={plant.waterloggingSensitivity} />
            <Fact k="Seed viability" v={`~${plant.seedViabilityYears} yr`} />
            {plant.soilPreference && <Fact k="Soil" v={plant.soilPreference.join(", ")} />}
            {plant.photoperiod && <Fact k="Day length" v={plant.photoperiod.replace("_", " ")} />}
          </dl>
          <p className="flex flex-wrap gap-1">
            {plant.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </p>
        </div>
      )}

      {tab === "Calendar" && <PlantCalendarTab plant={plant} />}

      {tab === "Stages" && template && (
        <ol className="space-y-2">
          {template.sequence.map((s) => {
            const d = template.stageDurations[s];
            return (
              <li
                key={s}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-paper-deep)] bg-white/50 p-2 dark:bg-white/5"
              >
                <SpriteImg plant={plant} stage={s} size={44} />
                <div>
                  <p className="font-semibold capitalize">{s}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {d ? `${d.min}–${d.max} days (typically ${d.typical})` : "until done"}
                    {template.stageCareHints?.[s] && ` — ${template.stageCareHints[s]!.join(" ")}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {tab === "Care" && (
        <div className="space-y-4 text-sm">
          <section>
            <h2 className="mb-1 font-semibold">Feeding</h2>
            <ul className="list-disc space-y-1 pl-5">
              {plant.fertilization.schedule.map((f, i) => (
                <li key={i}>
                  At <span className="capitalize">{f.atStage}</span>: {f.type}
                  {f.intervalDays ? `, every ${f.intervalDays} days` : ""}
                  {f.notes ? ` — ${f.notes}` : ""}
                </li>
              ))}
            </ul>
          </section>
          {plant.supportStructures && plant.supportStructures.length > 0 && (
            <section>
              <h2 className="mb-1 font-semibold">Support</h2>
              <p>{plant.supportStructures.join(", ")}</p>
            </section>
          )}
          <section>
            <h2 className="mb-1 font-semibold">Watch for</h2>
            <p>
              Pests: {plant.commonPests.join(", ") || "—"}. Diseases:{" "}
              {plant.commonDiseases.join(", ") || "—"}.
            </p>
          </section>
          <section>
            <h2 className="mb-1 font-semibold">Harvest</h2>
            <p>
              {plant.harvest.indicators.join("; ")}
              {plant.harvest.method ? ` Method: ${plant.harvest.method}.` : ""}
              {plant.harvest.yieldPerPlant ? ` Expect ${plant.harvest.yieldPerPlant}.` : ""}
            </p>
          </section>
        </div>
      )}

      {tab === "Varieties" &&
        (varietals.length === 0 ? (
          <Pad>No varietals on file.</Pad>
        ) : (
          <ul className="space-y-2">
            {varietals.map((v) => (
              <li
                key={v.id}
                className="rounded-lg border border-[var(--color-paper-deep)] bg-white/50 p-3 dark:bg-white/5"
              >
                <p className="font-semibold">
                  {v.name}
                  {v.daysToMaturity && (
                    <span className="ml-2 text-xs font-normal text-[var(--color-ink-soft)]">
                      {v.daysToMaturity.min}–{v.daysToMaturity.max}d
                    </span>
                  )}
                </p>
                <p className="text-sm">{v.description}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {v.traits.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                  {v.bestFor?.map((t) => (
                    <Badge key={t} tone={badgeTone.good}>
                      {t}
                    </Badge>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        ))}

      {tab === "Recipes" &&
        (recipes.length === 0 ? (
          <Pad>No recipes on file.</Pad>
        ) : (
          <ul className="space-y-3">
            {recipes.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-[var(--color-paper-deep)] bg-white/50 p-3 dark:bg-white/5"
              >
                <p className="font-semibold">{r.title}</p>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  Serves {r.servings}
                  {r.prepMinutes ? ` · ${r.prepMinutes} min prep` : ""}
                  {r.cookMinutes ? ` · ${r.cookMinutes} min cook` : ""}
                </p>
                <details className="mt-1 text-sm">
                  <summary className="cursor-pointer text-[var(--color-canopy)]">
                    Ingredients & steps
                  </summary>
                  <ul className="mt-1 list-disc pl-5">
                    {r.ingredients.map((ing, i) => (
                      <li key={i}>
                        {ing.quantity} {ing.unit ?? ""} {ing.item}
                      </li>
                    ))}
                  </ul>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {r.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        ))}

      {tab === "Companions" &&
        (companions.length === 0 ? (
          <Pad>No companion data on file.</Pad>
        ) : (
          <ul className="space-y-2">
            {companions.map(({ rel, partner }) =>
              partner ? (
                <li
                  key={partner.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-paper-deep)] bg-white/50 p-2 dark:bg-white/5"
                >
                  <SpriteImg plant={partner} stage="harvest" size={40} />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <Link className="hover:underline" to={`/encyclopedia/${partner.id}`}>
                        {partner.commonName}
                      </Link>{" "}
                      <Badge tone={rel.type === "beneficial" ? badgeTone.good : badgeTone.warn}>
                        {rel.type === "beneficial" ? "friend" : "avoid"} · {rel.strength}
                      </Badge>
                    </p>
                    <p className="text-xs text-[var(--color-ink-soft)]">{rel.reason}</p>
                  </div>
                </li>
              ) : null,
            )}
          </ul>
        ))}
    </section>
  );
}

/** §10/§11: per-plant windows chart, one row per method. */
function PlantCalendarTab({ plant }: { plant: Plant }) {
  const hemisphere = useAppStore((s) => s.settings.hemisphere);
  const defaultLocationId = useAppStore((s) => s.settings.defaultLocationId);
  const year = new Date().getFullYear();
  const climate = useLiveQuery(() => getActiveClimate(), [defaultLocationId]);

  if (climate === undefined) return <Pad>Loading…</Pad>;
  if (climate === null)
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        Set a garden location on the{" "}
        <Link className="text-[var(--color-canopy)] underline" to="/calendar">
          Calendar tab
        </Link>{" "}
        to see dated windows. Frost-relative rules on file: {describeSowRules(plant)}.
      </p>
    );

  const bands = windowsFor(plant, climate.profile, year, hemisphere);
  if (bands.length === 0) return <Pad>No planting windows derived for this plant.</Pad>;
  const rows: ChartRow[] = bands.map((b) => ({
    label: { indoor: "Indoor start", direct: "Direct sow", transplant: "Transplant", fall: "Fall sow" }[b.kind],
    bands: [b],
  }));
  return (
    <div>
      <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
        {climate.location.label}
        {climate.profile.hardinessZone ? ` · zone ${climate.profile.hardinessZone}` : ""}
      </p>
      <WindowChart rows={rows} climate={climate.profile} year={year} hemisphere={hemisphere} />
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[var(--color-ink-soft)]">{k}</dt>
      <dd className="font-medium capitalize">{v}</dd>
    </div>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-[var(--color-ink-soft)]">{children}</p>;
}

function describeSowRules(plant: Plant): string {
  const r = plant.sowRules;
  const parts: string[] = [];
  if (r.indoorStartWeeksFromLastFrost)
    parts.push(
      `start indoors ${fmtWeeks(r.indoorStartWeeksFromLastFrost)} last frost`,
    );
  if (r.directSowWeeksFromLastFrost)
    parts.push(`direct sow ${fmtWeeks(r.directSowWeeksFromLastFrost)} last frost`);
  if (r.transplantWeeksFromLastFrost)
    parts.push(`transplant ${fmtWeeks(r.transplantWeeksFromLastFrost)} last frost`);
  if (r.fallWeeksFromFirstFrost)
    parts.push(
      `fall crop matures ${r.fallWeeksFromFirstFrost.min}–${r.fallWeeksFromFirstFrost.max} weeks before first frost`,
    );
  return parts.join("; ");
}

function fmtWeeks(w: { min: number; max: number }): string {
  const f = (n: number) =>
    n === 0 ? "at" : n < 0 ? `${-n}w before` : `${n}w after`;
  return w.min === w.max ? f(w.min) : `${f(w.min)} to ${f(w.max)}`;
}
