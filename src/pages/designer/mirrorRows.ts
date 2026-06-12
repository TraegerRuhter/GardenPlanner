/** §24 — flatten a garden into accessible mirror rows (pure). */

import type { Garden, Plant, PlantInstance } from "../../types/models";
import { HARDSCAPES, STRUCTURES, WATER } from "./palette";

export interface MirrorRow {
  areaId: string;
  areaName: string;
  col: number;
  row: number;
  kind: string;
  detail: string;
  stage?: string;
}

export function mirrorRows(
  garden: Garden,
  instances: PlantInstance[],
  plantsById: Map<string, Plant>,
): MirrorRow[] {
  const instById = new Map(instances.map((i) => [i.id, i]));
  const rows: MirrorRow[] = [];
  for (const area of garden.areas) {
    for (const t of area.tiles) {
      const c = t.content;
      if (c.type === "empty") {
        if (t.elevationCm !== 0)
          rows.push({
            areaId: area.id, areaName: area.name, col: t.col, row: t.row,
            kind: "elevation", detail: `${t.elevationCm > 0 ? "+" : ""}${t.elevationCm} cm`,
          });
        continue;
      }
      if (c.type === "plant") {
        const inst = instById.get(c.instanceId);
        const plant = inst && plantsById.get(inst.plantId);
        rows.push({
          areaId: area.id, areaName: area.name, col: t.col, row: t.row,
          kind: inst?.status === "planned" ? "plant (planned)" : "plant",
          detail: plant?.commonName ?? c.instanceId,
          stage: inst?.status === "planned" ? "—" : inst?.currentStage,
        });
      } else if (c.type === "structure") {
        rows.push({
          areaId: area.id, areaName: area.name, col: t.col, row: t.row,
          kind: "structure", detail: `${STRUCTURES[c.structure].label}, ${c.heightCm} cm`,
        });
      } else if (c.type === "hardscape") {
        rows.push({
          areaId: area.id, areaName: area.name, col: t.col, row: t.row,
          kind: "hardscape", detail: HARDSCAPES[c.hardscape].label,
        });
      } else if (c.type === "water") {
        rows.push({
          areaId: area.id, areaName: area.name, col: t.col, row: t.row,
          kind: "water", detail: WATER[c.water].label,
        });
      }
    }
  }
  return rows.sort(
    (a, b) => a.areaName.localeCompare(b.areaName) || a.row - b.row || a.col - b.col,
  );
}
