/**
 * §24 accessible mirror: every placed object as a keyboard-navigable table,
 * plus a coordinate form so placement works without a pointer. All designer
 * actions stay reachable from here.
 */

import { useState } from "react";
import type { Garden } from "../../types/models";
import type { MirrorRow } from "./mirrorRows";

export function MirrorTable({
  garden,
  rows,
  onApplyAt,
  onRemoveAt,
  toolLabel,
}: {
  garden: Garden;
  rows: MirrorRow[];
  onApplyAt: (areaId: string, col: number, row: number) => void;
  onRemoveAt: (areaId: string, col: number, row: number) => void;
  toolLabel: string;
}) {
  const [areaId, setAreaId] = useState(garden.areas[0]?.id ?? "");
  const [col, setCol] = useState(0);
  const [row, setRow] = useState(0);
  const area = garden.areas.find((a) => a.id === areaId) ?? garden.areas[0];

  return (
    <section aria-label="Placed objects (accessible mirror)" className="mt-4 rounded-xl border border-[var(--color-paper-deep)] bg-white/40 p-3 text-sm dark:bg-white/5">
      <h2 className="mb-2 font-semibold">Placed objects</h2>

      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (area) onApplyAt(area.id, col, row);
        }}
      >
        <label className="text-xs font-medium">
          Area
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="mt-1 block rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20">
            {garden.areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Column (0–{(area?.grid.cols ?? 1) - 1})
          <input type="number" min={0} max={(area?.grid.cols ?? 1) - 1} value={col} onChange={(e) => setCol(Number(e.target.value))} className="mt-1 block w-20 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20" />
        </label>
        <label className="text-xs font-medium">
          Row (0–{(area?.grid.rows ?? 1) - 1})
          <input type="number" min={0} max={(area?.grid.rows ?? 1) - 1} value={row} onChange={(e) => setRow(Number(e.target.value))} className="mt-1 block w-20 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1.5 dark:bg-black/20" />
        </label>
        <button type="submit" className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 text-xs font-medium text-white">
          Apply "{toolLabel}" here
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-[var(--color-ink-soft)]">Nothing placed yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-paper-deep)]">
                <th className="py-1 pr-2">Area</th>
                <th className="py-1 pr-2">Col</th>
                <th className="py-1 pr-2">Row</th>
                <th className="py-1 pr-2">Kind</th>
                <th className="py-1 pr-2">What</th>
                <th className="py-1 pr-2">Stage</th>
                <th className="py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-[var(--color-paper-deep)]/50">
                  <td className="py-1 pr-2">{r.areaName}</td>
                  <td className="py-1 pr-2">{r.col}</td>
                  <td className="py-1 pr-2">{r.row}</td>
                  <td className="py-1 pr-2">{r.kind}</td>
                  <td className="py-1 pr-2">{r.detail}</td>
                  <td className="py-1 pr-2 capitalize">{r.stage ?? "—"}</td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => onRemoveAt(r.areaId, r.col, r.row)}
                      className="rounded bg-[var(--color-warn)]/15 px-2 py-0.5 font-medium text-[var(--color-warn)]"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
