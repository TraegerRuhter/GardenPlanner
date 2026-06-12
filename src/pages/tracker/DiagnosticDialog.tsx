/**
 * §14 guided diagnostics: walks the symptom's decision tree. Nodes with an
 * autoCheck are pre-answered from app data with the evidence shown — the
 * user can always override. Terminal diagnoses offer a remedy task.
 */

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type {
  DiagnosticBranch,
  DiagnosticNode,
  Plant,
  PlantInstance,
  Task,
} from "../../types/models";
import {
  evaluateAutoCheck,
  findTree,
  type AutoCheckContext,
} from "../../engines/diagnostics";
import { estSoilTempC } from "../../engines/climate";
import { getActiveClimate } from "../../db/climateRepo";
import { diffDays, todayISO } from "../../lib/dates";
import { newId } from "../../lib/ids";

export function DiagnosticDialog({
  instance,
  plant,
  symptom,
  onClose,
}: {
  instance: PlantInstance;
  plant: Plant;
  symptom: string;
  onClose: (diagnosticId?: string, note?: string) => void;
}) {
  const today = todayISO();

  const setup = useLiveQuery(async () => {
    const trees = await db.catalog_diagnostics.toArray();
    const tree = findTree(trees, symptom, plant.id, plant.familyId);
    const climate = await getActiveClimate().catch(() => null);
    const template = await db.catalog_stageTemplates.get(plant.stageTemplateId);
    return { tree, climate, template };
  }, [symptom, plant.id]);

  const ctx: AutoCheckContext = useMemo(() => {
    const profile = setup?.climate?.profile;
    const enteredOn = instance.projectedStageDates[instance.currentStage] ?? instance.plantedOn;
    return {
      today,
      soilTempC:
        profile?.monthlyNormals?.length === 12
          ? estSoilTempC(today, profile.monthlyNormals)
          : undefined,
      minSoilTempC: plant.minSoilTempC,
      daysInStage: Math.max(0, diffDays(enteredOn, today)),
      typicalStageDays: setup?.template?.stageDurations[instance.currentStage]?.typical,
      lastWateredOn: instance.watering.lastWateredOn,
      sunHoursMin: plant.sunHoursMin,
      // sunHours / waterloggingRisk / seedViability join as those subsystems
      // land (§12.8 map cache, §31.1 packets, §31.2 forecast risk)
    };
  }, [setup, instance, plant, today]);

  const [node, setNode] = useState<DiagnosticNode | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [diagnosis, setDiagnosis] = useState<Extract<DiagnosticBranch, { kind: "diagnosis" }> | null>(null);
  const [taskMade, setTaskMade] = useState(false);

  if (!setup) return null;
  if (!setup.tree) {
    return (
      <Overlay onClose={() => onClose()}>
        <p>No diagnostic tree for "{symptom}" yet — rolled back without diagnosis.</p>
      </Overlay>
    );
  }

  const current = diagnosis ? null : (node ?? setup.tree?.root ?? null);

  function answer(a: boolean) {
    if (!current) return;
    setTrail((t) => [...t, `${current.question} → ${a ? "yes" : "no"}`]);
    const next = a ? current.yes : current.no;
    if (next.kind === "diagnosis") setDiagnosis(next);
    else setNode(next.node);
  }

  async function makeTask(partial: Partial<Task>) {
    const task: Task = {
      id: newId(),
      gardenId: instance.gardenId,
      instanceId: instance.id,
      kind: partial.kind ?? "remedy",
      title: partial.title ?? "Remedy",
      dueOn: today,
      done: false,
      source: "auto",
      ...partial,
    };
    await db.tasks.add(task);
    setTaskMade(true);
  }

  const auto = current?.autoCheck ? evaluateAutoCheck(current.autoCheck, ctx) : null;

  return (
    <Overlay onClose={() => onClose()}>
      <h2 className="mb-1 text-lg font-bold">
        Why is the {plant.commonName.toLowerCase()} behind?
      </h2>
      <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
        Symptom: {symptom.replace(/_/g, " ")} · answers the app can check are
        pre-filled with evidence — override freely.
      </p>

      {current && (
        <div className="space-y-3">
          <p className="font-medium">{current.question}</p>
          {auto && auto.answer !== null && (
            <p className="rounded-lg bg-[var(--color-paper-deep)]/60 p-2 text-xs">
              🔎 App's read: <strong>{auto.answer ? "yes" : "no"}</strong> — {auto.evidence}
            </p>
          )}
          {auto && auto.answer === null && auto.evidence && (
            <p className="text-xs text-[var(--color-ink-soft)]">({auto.evidence})</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => answer(true)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${auto?.answer === true ? "bg-[var(--color-canopy)] text-white" : "bg-[var(--color-paper-deep)]"}`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => answer(false)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${auto?.answer === false ? "bg-[var(--color-canopy)] text-white" : "bg-[var(--color-paper-deep)]"}`}
            >
              No
            </button>
          </div>
        </div>
      )}

      {diagnosis && (
        <div className="space-y-3">
          <p className="rounded-lg bg-[var(--color-warn)]/10 p-3 text-sm">
            <strong>Probable cause:</strong> {diagnosis.cause}
          </p>
          <p className="rounded-lg bg-[var(--color-leaf)]/15 p-3 text-sm">
            <strong>Remedy:</strong> {diagnosis.remedy}
          </p>
          <div className="flex flex-wrap gap-2">
            {diagnosis.createsTask && !taskMade && (
              <button
                type="button"
                onClick={() => void makeTask(diagnosis.createsTask!)}
                className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 text-sm font-medium text-white"
              >
                + Create remedy task
              </button>
            )}
            {taskMade && <span className="py-1.5 text-sm text-[var(--color-canopy)]">✓ Task created</span>}
            <button
              type="button"
              onClick={() => onClose(setup.tree!.id, diagnosis.cause)}
              className="rounded-lg bg-[var(--color-paper-deep)] px-3 py-1.5 text-sm font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {trail.length > 0 && (
        <details className="mt-3 text-xs text-[var(--color-ink-soft)]">
          <summary className="cursor-pointer">Path taken</summary>
          <ol className="mt-1 list-decimal pl-4">
            {trail.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </details>
      )}
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--color-paper)] p-5 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="float-right -mt-1 rounded-lg px-2 py-0.5 text-lg text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-deep)]"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
