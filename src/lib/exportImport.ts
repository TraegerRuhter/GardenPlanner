/**
 * Data ownership (§23, §2.4): one-tap export of all user data as JSON,
 * import with replace semantics, and tidy long-format CSVs for analysis
 * (§31.4). The catalog is not exported — it re-seeds from the app bundle.
 *
 * §31.4 note: instance_daily.csv (the per-day weather join) is deferred
 * until a full-season weather cache lands; instances/stage_events/harvests
 * ship now and cover yield-vs-planting analysis.
 */

import { db } from "../db/db";

const USER_STORES = [
  "gardens",
  "instances",
  "stageEvents",
  "harvestEvents",
  "seedPackets",
  "pestSightings",
  "tasks",
  "journal",
  "locations",
  "climateProfiles",
  "settings",
] as const;

export interface ExportBundle {
  app: "plot";
  formatVersion: 1;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export async function exportAll(): Promise<ExportBundle> {
  const data: Record<string, unknown[]> = {};
  for (const name of USER_STORES) {
    data[name] = await db.table(name).toArray();
  }
  return {
    app: "plot",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/** Replace-import: wipes user stores and loads the bundle (§23). */
export async function importAll(bundle: ExportBundle): Promise<void> {
  if (bundle.app !== "plot" || bundle.formatVersion !== 1) {
    throw new Error("Not a PLOT export file (or a newer format).");
  }
  const tables = USER_STORES.map((n) => db.table(n));
  await db.transaction("rw", tables, async () => {
    for (const name of USER_STORES) {
      await db.table(name).clear();
      const rows = bundle.data[name];
      if (Array.isArray(rows) && rows.length > 0) {
        await db.table(name).bulkAdd(rows);
      }
    }
  });
}

export function downloadJson(obj: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// §31.4 tidy CSVs — long format, ISO dates, stable column order
// ---------------------------------------------------------------------------

function csv(rows: Array<Array<string | number | undefined>>): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === undefined ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

export async function exportCsvs(): Promise<void> {
  const [instances, gardens, stageEvents, harvests, locations] = await Promise.all([
    db.instances.toArray(),
    db.gardens.toArray(),
    db.stageEvents.toArray(),
    db.harvestEvents.toArray(),
    db.locations.toArray(),
  ]);
  const gardenById = new Map(gardens.map((g) => [g.id, g]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const instById = new Map(instances.map((i) => [i.id, i]));

  const instancesCsv = csv([
    ["id", "gardenName", "areaName", "plantId", "varietalId", "plantingMethod", "plantedOn", "currentStage", "status", "tileCount", "lat", "lon"],
    ...instances.map((i) => {
      const g = gardenById.get(i.gardenId);
      const area = g?.areas.find((a) => a.id === i.areaId);
      const loc = g ? locById.get(g.locationId) : undefined;
      return [
        i.id, g?.name, area?.name, i.plantId, i.varietalId, i.plantingMethod,
        i.plantedOn, i.currentStage, i.status, i.tiles.length, loc?.lat, loc?.lon,
      ];
    }),
  ]);

  const sorted = [...stageEvents].sort(
    (a, b) => a.instanceId.localeCompare(b.instanceId) || a.enteredOn.localeCompare(b.enteredOn),
  );
  const prevByInstance = new Map<string, string>();
  const eventsCsv = csv([
    ["instanceId", "plantId", "stage", "enteredOn", "source", "daysInPreviousStage"],
    ...sorted.map((e) => {
      const prev = prevByInstance.get(e.instanceId);
      prevByInstance.set(e.instanceId, e.enteredOn);
      const days =
        prev !== undefined
          ? Math.round((Date.parse(e.enteredOn) - Date.parse(prev)) / 86_400_000)
          : undefined;
      return [e.instanceId, instById.get(e.instanceId)?.plantId, e.stage, e.enteredOn, e.source, days];
    }),
  ]);

  const harvestsCsv = csv([
    ["instanceId", "plantId", "date", "quantity", "unit", "qualityNote"],
    ...harvests.map((h) => [
      h.instanceId, instById.get(h.instanceId)?.plantId, h.date, h.quantity, h.unit, h.qualityNote,
    ]),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  for (const [name, content] of [
    ["instances", instancesCsv],
    ["stage_events", eventsCsv],
    ["harvests", harvestsCsv],
  ] as const) {
    triggerDownload(new Blob([content], { type: "text/csv" }), `plot_${name}_${stamp}.csv`);
  }
}
