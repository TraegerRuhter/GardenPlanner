/** §24 — flatten a garden field into accessible mirror rows (pure). */

import type { Garden, Plant, PlantInstance } from "../../types/models";
import { GROUND, OVERLAYS } from "./palette";

export interface MirrorRow {
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
  const rows: MirrorRow[] = [];

  // carved ground (non-default cells: a ground type and/or an elevation)
  for (const g of garden.field.ground) {
    const parts: string[] = [];
    if (g.type !== "grass") parts.push(GROUND[g.type].label);
    if (g.elevationCm !== 0) parts.push(`${g.elevationCm > 0 ? "+" : ""}${g.elevationCm} cm`);
    if (parts.length === 0) continue;
    rows.push({
      col: g.col,
      row: g.row,
      kind: g.type !== "grass" ? "ground" : "elevation",
      detail: parts.join(", "),
    });
  }

  // plants
  for (const inst of instances) {
    const plant = plantsById.get(inst.plantId);
    for (const t of inst.tiles) {
      rows.push({
        col: t.col,
        row: t.row,
        kind: inst.status === "planned" ? "plant (planned)" : "plant",
        detail: plant?.commonName ?? inst.plantId,
        stage: inst.status === "planned" ? "—" : inst.currentStage,
      });
    }
  }

  // infrastructure overlays (listed at their start cell)
  for (const o of garden.field.overlays) {
    const a = o.path[0];
    const b = o.path[o.path.length - 1];
    rows.push({
      col: Math.floor(a.x),
      row: Math.floor(a.y),
      kind: "infrastructure",
      detail: `${OVERLAYS[o.sub]?.label ?? o.sub} → (${Math.floor(b.x)},${Math.floor(b.y)})`,
    });
  }

  return rows.sort((a, b) => a.row - b.row || a.col - b.col);
}
