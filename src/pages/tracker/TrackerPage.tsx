/**
 * §13.6 Tracker: garden roll-up of every planned/active instance with stage
 * timeline, days-in-stage, manual advance/rollback (§13.4 — rollback opens
 * the diagnostics flow, §14), harvest logging (§31.4), and status changes.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type {
  GrowthStageTemplate,
  Plant,
  PlantInstance,
} from "../../types/models";
import {
  logHarvest,
  moveStage,
  recordDiagnosis,
  runDailyPass,
  setInstanceStatus,
} from "../../db/instancesRepo";
import { effectiveSequence } from "../../engines/growth";
import { diffDays, formatShort, todayISO } from "../../lib/dates";
import { SpriteImg } from "../../components/SpriteImg";
import { Badge, badgeTone } from "../../components";
import { DiagnosticDialog } from "./DiagnosticDialog";
import { JournalPanel } from "./JournalPanel";

export function TrackerPage() {
  const [diagnosing, setDiagnosing] = useState<{ instance: PlantInstance; symptom: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  const data = useLiveQuery(async () => {
    const instances = await db.instances
      .filter((i) => i.status === "active" || i.status === "planned")
      .toArray();
    const gardens = await db.gardens.toArray();
    const plants = await db.catalog_plants.toArray();
    const templates = await db.catalog_stageTemplates.toArray();
    return { instances, gardens, plants, templates };
  }, [refresh]);

  if (!data) return <Pad>Loading…</Pad>;
  const { instances, gardens, plants, templates } = data;
  const plantById = new Map(plants.map((p) => [p.id, p]));
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const gardenName = new Map(gardens.map((g) => [g.id, g.name]));
  const today = todayISO();

  const active = instances
    .filter((i) => i.status === "active")
    .sort((a, b) => a.plantedOn.localeCompare(b.plantedOn));
  const planned = instances.filter((i) => i.status === "planned");

  if (instances.length === 0) {
    return (
      <Pad>
        Nothing growing yet — place plants in the{" "}
        <Link to="/designer" className="text-[var(--color-canopy)] underline">
          Designer
        </Link>{" "}
        and log their planting dates.
      </Pad>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Tracker</h1>
        <button
          type="button"
          onClick={() => void runDailyPass().then(() => setRefresh((n) => n + 1))}
          className="rounded-lg bg-[var(--color-paper-deep)] px-2 py-1 text-xs font-medium"
          title="Re-run the daily stage pass now"
        >
          ↻ Update stages
        </button>
      </div>

      {diagnosing && (
        <DiagnosticDialog
          instance={diagnosing.instance}
          plant={plantById.get(diagnosing.instance.plantId)!}
          symptom={diagnosing.symptom}
          onClose={(diagnosticId, note) => {
            if (diagnosticId) void recordDiagnosis(diagnosing.instance.id, diagnosticId, note ?? "");
            setDiagnosing(null);
          }}
        />
      )}

      <ul className="space-y-3">
        {active.map((inst) => {
          const plant = plantById.get(inst.plantId);
          const template = plant && templateById.get(plant.stageTemplateId);
          if (!plant || !template) return null;
          return (
            <InstanceCard
              key={inst.id}
              inst={inst}
              plant={plant}
              template={template}
              gardenName={gardenName.get(inst.gardenId) ?? ""}
              today={today}
              onMove={async (dir) => {
                const out = await moveStage(inst.id, dir);
                if (dir === "rollback" && out?.symptom) {
                  setDiagnosing({ instance: out.instance, symptom: out.symptom });
                }
              }}
            />
          );
        })}
      </ul>

      {planned.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 font-semibold text-[var(--color-ink-soft)]">
            Planned (ghosts on the grid — log planting in the Designer)
          </h2>
          <ul className="space-y-1 text-sm">
            {planned.map((inst) => {
              const plant = plantById.get(inst.plantId);
              return plant ? (
                <li key={inst.id} className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-paper-deep)] p-2">
                  <SpriteImg plant={plant} stage="planted" size={28} />
                  {plant.commonName} · {gardenName.get(inst.gardenId)} · intended {formatShort(inst.plantedOn)}
                </li>
              ) : null;
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function InstanceCard({
  inst,
  plant,
  template,
  gardenName,
  today,
  onMove,
}: {
  inst: PlantInstance;
  plant: Plant;
  template: GrowthStageTemplate;
  gardenName: string;
  today: string;
  onMove: (dir: "advance" | "rollback") => Promise<void>;
}) {
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<"g" | "kg" | "count" | "bunch" | "L">("count");

  const seq = effectiveSequence(template, inst.plantingMethod);
  const idx = seq.indexOf(inst.currentStage);
  const enteredOn = inst.projectedStageDates[inst.currentStage] ?? inst.plantedOn;
  const daysIn = Math.max(0, diffDays(enteredOn, today));
  const next = idx < seq.length - 1 ? seq[idx + 1] : null;
  const nextDate = next ? inst.projectedStageDates[next] : undefined;
  const harvestReady = idx >= seq.indexOf("harvest") && seq.includes("harvest");

  const totalHarvest = useLiveQuery(
    () => db.harvestEvents.where("instanceId").equals(inst.id).count(),
    [inst.id],
  );

  return (
    <li className="rounded-xl border border-[var(--color-paper-deep)] bg-white/50 p-3 dark:bg-white/5">
      <div className="flex items-start gap-3">
        <SpriteImg plant={plant} stage={inst.currentStage} size={56} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold">
            {plant.commonName}
            <Badge tone={badgeTone.good}>{inst.currentStage}</Badge>
            <Badge>day {daysIn + 1} of stage</Badge>
            {harvestReady && <Badge tone={badgeTone.sun}>🧺 harvest-ready</Badge>}
          </p>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {gardenName} · planted {formatShort(inst.plantedOn)} ({inst.plantingMethod.replace("_", " ")})
            {next && nextDate ? ` · ${next} ~${formatShort(nextDate)}` : " · final stage"}
            {totalHarvest ? ` · ${totalHarvest} harvest log${totalHarvest === 1 ? "" : "s"}` : ""}
          </p>
          <StageTimeline seq={seq} idx={idx} projected={inst.projectedStageDates} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <CardBtn onClick={() => void onMove("advance")} title="It really is ahead of the projection">
          ⬆ Advance
        </CardBtn>
        <CardBtn onClick={() => void onMove("rollback")} title="It looks behind — roll back and diagnose (§13.4)">
          ⬇ Roll back & diagnose
        </CardBtn>
        {harvestReady && (
          <CardBtn onClick={() => setHarvestOpen((v) => !v)}>🧺 Log harvest</CardBtn>
        )}
        <CardBtn onClick={() => setJournalOpen((v) => !v)}>📓 Journal</CardBtn>
        <CardBtn onClick={() => void setInstanceStatus(inst.id, "harvested")}>✓ Done</CardBtn>
        <CardBtn onClick={() => void setInstanceStatus(inst.id, "failed")}>✗ Failed</CardBtn>
      </div>

      {journalOpen && <JournalPanel instance={inst} />}

      {harvestOpen && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            void logHarvest(inst.id, qty ? Number(qty) : undefined, unit).then(() => {
              setHarvestOpen(false);
              setQty("");
            });
          }}
        >
          <input
            type="number"
            step="any"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Quantity"
            aria-label="Harvest quantity"
            className="w-24 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20"
          />
          <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} aria-label="Unit" className="rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20">
            <option value="count">count</option>
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="bunch">bunch</option>
            <option value="L">L</option>
          </select>
          <button type="submit" className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 font-medium text-white">
            Log
          </button>
        </form>
      )}
    </li>
  );
}

/** §13.6 horizontal stage track: past solid, current ringed, future hollow. */
function StageTimeline({
  seq,
  idx,
  projected,
}: {
  seq: string[];
  idx: number;
  projected: Partial<Record<string, string>>;
}) {
  return (
    <ol className="mt-1.5 flex flex-wrap items-center gap-0" aria-label="Stage timeline">
      {seq.map((s, i) => (
        <li key={s} className="flex items-center" title={`${s}${projected[s] ? ` — ${projected[s]}` : ""}`}>
          {i > 0 && <span className={`h-0.5 w-3 ${i <= idx ? "bg-[var(--color-canopy)]" : "bg-[var(--color-paper-deep)]"}`} />}
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              i < idx
                ? "bg-[var(--color-canopy)]"
                : i === idx
                  ? "bg-[var(--color-leaf)] ring-2 ring-[var(--color-canopy)]"
                  : "border border-[var(--color-ink-soft)]/40 bg-transparent"
            }`}
          />
        </li>
      ))}
    </ol>
  );
}

function CardBtn({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-lg bg-[var(--color-paper-deep)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--color-paper-deep)]/70"
    >
      {children}
    </button>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-[var(--color-ink-soft)]">{children}</p>;
}
