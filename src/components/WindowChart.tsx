/**
 * §11.2 — the planting-window band chart. A 14-month SVG timeline: one row
 * per entry, colored bands per activity, lighter trailing harvest bands,
 * frost-risk shading (p50 solid, p50→p10 graded), and a today marker.
 * Tap a band for exact dates and notes. A data-table toggle mirrors the
 * chart for screen readers (§24).
 */

import { useMemo, useState } from "react";
import type { ClimateProfile, Hemisphere } from "../types/models";
import type { BandKind, PlantingBand } from "../engines/plantingWindows";
import { addDays, diffDays, formatShort, inYear, todayISO } from "../lib/dates";

export interface ChartRow {
  label: string;
  bands: PlantingBand[];
}

const KIND_COLOR: Record<BandKind, string> = {
  indoor: "#9b6dd6",
  direct: "#58a854",
  transplant: "#3aa6a0",
  fall: "#d9a23c",
};
const KIND_LABEL: Record<BandKind, string> = {
  indoor: "indoor start",
  direct: "direct sow",
  transplant: "transplant",
  fall: "fall sow",
};
const HARVEST_COLOR = "#b8b08a";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];

export function WindowChart({
  rows,
  climate,
  year,
  hemisphere = "northern",
}: {
  rows: ChartRow[];
  climate: ClimateProfile;
  year: number;
  hemisphere?: Hemisphere;
}) {
  const [selected, setSelected] = useState<PlantingBand | null>(null);
  const [showTable, setShowTable] = useState(false);

  const ROW_H = 30;
  const TOP = 22;
  const W = 980;
  const H = TOP + rows.length * ROW_H + 6;
  const domainStart = `${year}-01-01`;
  const domainDays = 425; // ~14 months

  const x = (iso: string) =>
    Math.max(0, Math.min(W, (diffDays(domainStart, iso) / domainDays) * W));

  const shift = hemisphere === "southern" ? 182 : 0;
  const frost = useMemo(() => {
    const lsf50 = addDays(inYear(climate.lastSpringFrost.p50, year), shift);
    const lsf10 = addDays(inYear(climate.lastSpringFrost.p10, year), shift);
    const fff50 = addDays(inYear(climate.firstFallFrost.p50, year), shift);
    const fff10 = addDays(inYear(climate.firstFallFrost.p10, year), shift);
    return { lsf50, lsf10, fff50, fff10 };
  }, [climate, year, shift]);

  const today = todayISO();

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        {(Object.keys(KIND_COLOR) as BandKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: HARVEST_COLOR }} />
          harvest
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-sky-200 dark:bg-sky-900" />
          frost risk
        </span>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="ml-auto rounded-md bg-[var(--color-paper-deep)] px-2 py-1 font-medium"
        >
          {showTable ? "Hide" : "Show"} data table
        </button>
      </div>

      <div className="flex">
        {/* sticky labels */}
        <div className="w-28 shrink-0 sm:w-36" aria-hidden>
          <div style={{ height: TOP }} />
          {rows.map((r) => (
            <div
              key={r.label}
              style={{ height: ROW_H }}
              className="flex items-center truncate pr-2 text-xs font-medium"
            >
              {r.label}
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Planting windows chart; use the data table for details"
            className="min-w-[640px]"
          >
            {/* frost shading: hard risk before lsf50/after fff50, graded to p10 */}
            <rect x={0} y={TOP} width={x(frost.lsf50)} height={H - TOP} fill="#7da7c4" opacity={0.18} />
            <rect
              x={x(frost.lsf50)}
              y={TOP}
              width={Math.max(0, x(frost.lsf10) - x(frost.lsf50))}
              height={H - TOP}
              fill="#7da7c4"
              opacity={0.09}
            />
            <rect x={x(frost.fff50)} y={TOP} width={W - x(frost.fff50)} height={H - TOP} fill="#7da7c4" opacity={0.18} />
            <rect
              x={x(frost.fff10)}
              y={TOP}
              width={Math.max(0, x(frost.fff50) - x(frost.fff10))}
              height={H - TOP}
              fill="#7da7c4"
              opacity={0.09}
            />

            {/* month grid */}
            {MONTHS.map((m, i) => {
              const iso =
                i < 12 ? `${year}-${String(i + 1).padStart(2, "0")}-01` : `${year + 1}-${String(i - 11).padStart(2, "0")}-01`;
              return (
                <g key={i}>
                  <line x1={x(iso)} y1={TOP - 4} x2={x(iso)} y2={H} stroke="currentColor" opacity={0.12} />
                  <text x={x(iso) + 3} y={12} fontSize={10} fill="currentColor" opacity={0.7}>
                    {m}
                  </text>
                </g>
              );
            })}

            {/* rows */}
            {rows.map((row, i) => {
              const y = TOP + i * ROW_H;
              return (
                <g key={row.label}>
                  <line x1={0} y1={y + ROW_H} x2={W} y2={y + ROW_H} stroke="currentColor" opacity={0.06} />
                  {row.bands.map((b, j) => (
                    <g key={j}>
                      {/* harvest trail */}
                      <rect
                        x={x(b.harvestStart)}
                        y={y + 19}
                        width={Math.max(2, x(b.harvestEnd) - x(b.harvestStart))}
                        height={5}
                        rx={2}
                        fill={HARVEST_COLOR}
                        opacity={0.7}
                      />
                      {/* activity band */}
                      <rect
                        x={x(b.start)}
                        y={y + 5}
                        width={Math.max(3, x(b.end) - x(b.start))}
                        height={12}
                        rx={3}
                        fill={KIND_COLOR[b.kind]}
                        opacity={selected === b ? 1 : 0.85}
                        stroke={selected === b ? "var(--color-ink)" : "none"}
                        className="cursor-pointer"
                        onClick={() => setSelected(selected === b ? null : b)}
                      >
                        <title>
                          {`${row.label} — ${KIND_LABEL[b.kind]}: ${formatShort(b.start)} – ${formatShort(b.end)}`}
                        </title>
                      </rect>
                    </g>
                  ))}
                </g>
              );
            })}

            {/* today */}
            {diffDays(domainStart, today) >= 0 && diffDays(domainStart, today) <= domainDays && (
              <g>
                <line x1={x(today)} y1={TOP - 2} x2={x(today)} y2={H} stroke="#d23c2e" strokeWidth={1.5} />
                <text x={x(today) + 3} y={TOP + 8} fontSize={9} fill="#d23c2e">
                  today
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {selected && (
        <p className="mt-2 rounded-lg bg-[var(--color-paper-deep)]/60 p-2 text-sm">
          <strong>{KIND_LABEL[selected.kind]}</strong>: {formatShort(selected.start)} –{" "}
          {formatShort(selected.end)} · harvest {formatShort(selected.harvestStart)} –{" "}
          {formatShort(selected.harvestEnd)}
          {selected.notes.map((n, i) => (
            <span key={i} className="block text-xs text-[var(--color-ink-soft)]">
              {n}
            </span>
          ))}
        </p>
      )}

      {showTable && (
        <table className="mt-3 w-full border-collapse text-left text-xs">
          <caption className="sr-only">Planting windows as data</caption>
          <thead>
            <tr className="border-b border-[var(--color-paper-deep)]">
              <th className="py-1 pr-2">Plant</th>
              <th className="py-1 pr-2">Activity</th>
              <th className="py-1 pr-2">Start</th>
              <th className="py-1 pr-2">End</th>
              <th className="py-1 pr-2">Harvest</th>
              <th className="py-1">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row) =>
              row.bands.map((b, j) => (
                <tr key={`${row.label}-${j}`} className="border-b border-[var(--color-paper-deep)]/50">
                  <td className="py-1 pr-2 font-medium">{row.label}</td>
                  <td className="py-1 pr-2">{KIND_LABEL[b.kind]}</td>
                  <td className="py-1 pr-2">{b.start}</td>
                  <td className="py-1 pr-2">{b.end}</td>
                  <td className="py-1 pr-2">
                    {b.harvestStart} – {b.harvestEnd}
                  </td>
                  <td className="py-1">{b.notes.join(" ")}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
