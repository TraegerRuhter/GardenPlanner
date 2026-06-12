/**
 * §12 Designer: garden CRUD, area management, tile palette, the Konva plot,
 * placement validation toasts, orientation control, sun overlay, and the
 * accessible mirror. Auto-saves on every change (§2.1 goal 6).
 *
 * Split: the outer component loads data; DesignerBody works with concrete
 * (non-optional) props so memoized derivations have stable dependencies.
 */

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import { useAppStore } from "../../store/appStore";
import type {
  ClimateProfile,
  CompanionRelationship,
  Garden,
  GardenArea,
  Location,
  Plant,
  PlantInstance,
  StructureKind,
} from "../../types/models";
import {
  activeInstancesForGarden,
  clearTile,
  createGarden,
  newArea,
  placePlant,
  saveGarden,
  setTile,
  tileAt,
} from "../../db/gardenRepo";
import { validatePlacement, type PlacementWarning } from "../../engines/placement";
import { plantHeightResolver, sunMapForArea, tileKey, type SunMap } from "../../engines/sunModel";
import { getActiveClimate } from "../../db/climateRepo";
import { activateInstance } from "../../db/instancesRepo";
import { todayISO } from "../../lib/dates";
import { SpriteImg } from "../../components/SpriteImg";
import { GardenCanvas } from "./GardenCanvas";
import { MirrorTable } from "./MirrorTable";
import { mirrorRows } from "./mirrorRows";
import { HARDSCAPES, STRUCTURES, TILE_PX, WATER, type Tool } from "./palette";

export default function DesignerPage() {
  const activeGardenId = useAppStore((s) => s.activeGardenId);
  const setActiveGarden = useAppStore((s) => s.setActiveGarden);
  const unitSystem = useAppStore((s) => s.settings.unitSystem);
  const defaultLocationId = useAppStore((s) => s.settings.defaultLocationId);

  const data = useLiveQuery(async () => {
    const gardens = await db.gardens.toArray();
    const garden =
      gardens.find((g) => g.id === activeGardenId) ?? gardens[0] ?? null;
    const [plants, companions, climate, instances] = await Promise.all([
      db.catalog_plants.orderBy("commonName").toArray(),
      db.catalog_companions.toArray(),
      getActiveClimate(),
      garden ? activeInstancesForGarden(garden.id) : Promise.resolve([]),
    ]);
    return { gardens, garden, plants, companions, climate, instances };
  }, [activeGardenId, defaultLocationId]);

  if (!data) return <Pad>Loading…</Pad>;

  if (!data.garden) {
    return (
      <section className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-3 text-2xl font-bold">Designer</h1>
        <NewGardenForm
          onCreate={async (name) => {
            const g = await createGarden(name, defaultLocationId, unitSystem);
            setActiveGarden(g.id);
          }}
        />
      </section>
    );
  }

  return (
    <DesignerBody
      key={data.garden.id}
      garden={data.garden}
      gardens={data.gardens}
      plants={data.plants}
      companions={data.companions}
      instances={data.instances}
      climate={data.climate}
      onSwitchGarden={setActiveGarden}
      onNewGarden={async () => {
        const g = await createGarden(
          `Garden ${data.gardens.length + 1}`,
          defaultLocationId,
          unitSystem,
        );
        setActiveGarden(g.id);
      }}
    />
  );
}

function DesignerBody({
  garden,
  gardens,
  plants,
  companions,
  instances,
  climate,
  onSwitchGarden,
  onNewGarden,
}: {
  garden: Garden;
  gardens: Garden[];
  plants: Plant[];
  companions: CompanionRelationship[];
  instances: PlantInstance[];
  climate: { location: Location; profile: ClimateProfile } | null;
  onSwitchGarden: (id: string) => void;
  onNewGarden: () => Promise<void>;
}) {
  // §16 pipe: a plant chosen in Suggest/Plant Next preselects the brush.
  const [tool, setTool] = useState<Tool>(() => {
    const pending = useAppStore.getState().pendingPlantId;
    if (pending) {
      queueMicrotask(() => useAppStore.getState().setPendingPlant(undefined));
      return { t: "plant", plantId: pending };
    }
    return { t: "select" };
  });
  const [selected, setSelected] = useState<{ areaId: string; col: number; row: number } | null>(null);
  const [warnings, setWarnings] = useState<PlacementWarning[]>([]);
  const [sunOverlay, setSunOverlay] = useState(false);
  const [showMirror, setShowMirror] = useState(false);

  const plantsById = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);
  const latDeg = climate?.location.lat ?? 45;

  // §12.8: recompute per-area sun maps on layout change; only while shown.
  const sunMaps = useMemo(() => {
    if (!sunOverlay) return null;
    const heights = new Map(plants.map((p) => [p.id, p.matureHeightCm.max]));
    const resolver = plantHeightResolver(instances, heights);
    const maps = new Map<string, SunMap>();
    for (const area of garden.areas) {
      maps.set(
        area.id,
        sunMapForArea(area, {
          latDeg,
          northBearingDeg: garden.northBearingDeg,
          plantHeightCm: resolver,
        }),
      );
    }
    return maps;
  }, [garden, instances, plants, sunOverlay, latDeg]);

  function toast(w: PlacementWarning[]) {
    setWarnings(w);
    if (w.length) window.setTimeout(() => setWarnings([]), 7000);
  }

  async function eraseAt(areaId: string, col: number, row: number) {
    const g = structuredClone(garden);
    const area = g.areas.find((a) => a.id === areaId);
    if (!area) return;
    await clearTile(g, area, col, row);
    setSelected(null);
  }

  async function applyToolAt(areaId: string, col: number, row: number) {
    const g = structuredClone(garden);
    const area = g.areas.find((a) => a.id === areaId);
    if (!area) return;

    switch (tool.t) {
      case "select":
        setSelected({ areaId, col, row });
        return;
      case "erase":
        await eraseAt(areaId, col, row);
        return;
      case "elev_up":
      case "elev_down": {
        const t = tileAt(area, col, row);
        const next = (t?.elevationCm ?? 0) + (tool.t === "elev_up" ? 5 : -5);
        setTile(area, col, row, t?.content ?? { type: "empty" }, next);
        await saveGarden(g);
        return;
      }
      case "structure": {
        setTile(area, col, row, {
          type: "structure",
          structure: tool.kind,
          heightCm: STRUCTURES[tool.kind].heightCm,
        });
        await saveGarden(g);
        return;
      }
      case "hardscape": {
        setTile(area, col, row, { type: "hardscape", hardscape: tool.kind });
        await saveGarden(g);
        return;
      }
      case "water": {
        setTile(area, col, row, { type: "water", water: tool.kind });
        await saveGarden(g);
        return;
      }
      case "plant": {
        const plant = plantsById.get(tool.plantId);
        if (!plant) return;
        const occupied = tileAt(area, col, row);
        if (occupied && occupied.content.type !== "empty") {
          toast([{ kind: "spacing", severity: "warn", message: "Tile is occupied — erase it first." }]);
          return;
        }
        const history = await db.instances.where("gardenId").equals(g.id).toArray();
        const target = [{ col, row }];
        const w = validatePlacement({
          area,
          target,
          plant,
          instances,
          history,
          plantsById,
          companions,
          sunHours: sunMaps?.get(areaId)?.get(tileKey(col, row)),
        });
        await placePlant(g, area, plant.id, target);
        toast(w);
        setSelected({ areaId, col, row });
        return;
      }
    }
  }

  async function mutateGarden(fn: (g: Garden) => void) {
    const g = structuredClone(garden);
    fn(g);
    await saveGarden(g);
  }

  const selectedArea = selected ? garden.areas.find((a) => a.id === selected.areaId) : undefined;
  const selectedTile = selected && selectedArea ? tileAt(selectedArea, selected.col, selected.row) : undefined;

  return (
    <section className="mx-auto max-w-6xl px-3 py-4">
      {/* header row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{garden.name}</h1>
        {gardens.length > 1 && (
          <select
            value={garden.id}
            onChange={(e) => onSwitchGarden(e.target.value)}
            aria-label="Switch garden"
            className="rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1 text-sm dark:bg-black/20"
          >
            {gardens.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => void onNewGarden()}
          className="rounded-lg bg-[var(--color-paper-deep)] px-2 py-1 text-xs font-medium"
        >
          + New garden
        </button>

        <label className="ml-auto flex items-center gap-1 text-xs font-medium">
          North bearing
          <input
            type="number"
            min={0}
            max={359}
            value={garden.northBearingDeg}
            onChange={(e) => void mutateGarden((g) => { g.northBearingDeg = ((Number(e.target.value) % 360) + 360) % 360; })}
            className="w-16 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1 dark:bg-black/20"
          />
          °
        </label>
        <button
          type="button"
          aria-pressed={sunOverlay}
          onClick={() => setSunOverlay((v) => !v)}
          className={`rounded-lg px-2 py-1 text-xs font-medium ${sunOverlay ? "bg-amber-400 text-amber-950" : "bg-[var(--color-paper-deep)]"}`}
          title="Estimated direct-sun hours (solstice+equinox average) — an estimate, not a measurement"
        >
          ☀ Sun map
        </button>
        <button
          type="button"
          aria-pressed={showMirror}
          onClick={() => setShowMirror((v) => !v)}
          className="rounded-lg bg-[var(--color-paper-deep)] px-2 py-1 text-xs font-medium"
        >
          ☰ List view
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* palette */}
        <aside className="order-2 flex shrink-0 flex-row gap-2 overflow-x-auto lg:order-1 lg:w-56 lg:flex-col lg:overflow-visible" aria-label="Tile palette">
          <PaletteGroup label="Tools">
            <ToolBtn active={tool.t === "select"} onClick={() => setTool({ t: "select" })}>👆 Select</ToolBtn>
            <ToolBtn active={tool.t === "erase"} onClick={() => setTool({ t: "erase" })}>🧹 Erase</ToolBtn>
            <ToolBtn active={tool.t === "elev_up"} onClick={() => setTool({ t: "elev_up" })}>⬆ Raise +5cm</ToolBtn>
            <ToolBtn active={tool.t === "elev_down"} onClick={() => setTool({ t: "elev_down" })}>⬇ Lower −5cm</ToolBtn>
          </PaletteGroup>

          <PaletteGroup label="Plants">
            <div className="grid grid-cols-5 gap-1 lg:grid-cols-4">
              {plants.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.commonName}
                  aria-pressed={tool.t === "plant" && tool.plantId === p.id}
                  onClick={() => setTool({ t: "plant", plantId: p.id })}
                  className={`rounded-lg p-1 ${tool.t === "plant" && tool.plantId === p.id ? "bg-[var(--color-canopy)]/30 ring-2 ring-[var(--color-canopy)]" : "bg-white/40 dark:bg-white/5"}`}
                >
                  <SpriteImg plant={p} stage="harvest" size={32} />
                </button>
              ))}
            </div>
          </PaletteGroup>

          <PaletteGroup label="Structures">
            {(Object.keys(STRUCTURES) as StructureKind[]).map((k) => (
              <ToolBtn key={k} active={tool.t === "structure" && tool.kind === k} onClick={() => setTool({ t: "structure", kind: k })}>
                {STRUCTURES[k].glyph} {STRUCTURES[k].label}
              </ToolBtn>
            ))}
          </PaletteGroup>

          <PaletteGroup label="Hardscape">
            {(Object.keys(HARDSCAPES) as Array<keyof typeof HARDSCAPES>).map((k) => (
              <ToolBtn key={k} active={tool.t === "hardscape" && tool.kind === k} onClick={() => setTool({ t: "hardscape", kind: k })}>
                <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: HARDSCAPES[k].color }} />
                {HARDSCAPES[k].label}
              </ToolBtn>
            ))}
          </PaletteGroup>

          <PaletteGroup label="Water">
            {(Object.keys(WATER) as Array<keyof typeof WATER>).map((k) => (
              <ToolBtn key={k} active={tool.t === "water" && tool.kind === k} onClick={() => setTool({ t: "water", kind: k })}>
                {WATER[k].glyph} {WATER[k].label}
              </ToolBtn>
            ))}
          </PaletteGroup>
        </aside>

        {/* canvas + inspector */}
        <div className="order-1 min-w-0 flex-1 lg:order-2">
          <GardenCanvas
            garden={garden}
            instances={instances}
            plantsById={plantsById}
            sunMaps={sunMaps}
            selected={selected}
            onTileTap={(a, c, r) => void applyToolAt(a, c, r)}
            onAreaMove={(areaId, x, y) =>
              void mutateGarden((g) => {
                const a = g.areas.find((ar) => ar.id === areaId);
                if (a) a.origin = { x: Math.round(x), y: Math.round(y) };
              })
            }
            height={460}
          />

          {/* warnings toast (§12.6: non-blocking) */}
          {warnings.length > 0 && (
            <div role="status" className="mt-2 space-y-1">
              {warnings.map((w, i) => (
                <p
                  key={i}
                  className={`rounded-lg px-3 py-1.5 text-sm ${w.severity === "warn" ? "bg-[var(--color-warn)]/15 text-[var(--color-warn)]" : "bg-[var(--color-leaf)]/20 text-[var(--color-canopy)]"}`}
                >
                  {w.severity === "warn" ? "⚠" : "✓"} {w.message}
                </p>
              ))}
            </div>
          )}

          {/* area management */}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            {garden.areas.map((a) => (
              <AreaConfig key={a.id} area={a} onChange={(patch) =>
                void mutateGarden((g) => {
                  const target = g.areas.find((x) => x.id === a.id);
                  if (target) Object.assign(target, patch);
                })
              } onRemove={garden.areas.length > 1 ? () =>
                void mutateGarden((g) => {
                  g.areas = g.areas.filter((x) => x.id !== a.id);
                }) : undefined}
              />
            ))}
            <button
              type="button"
              onClick={() =>
                void mutateGarden((g) => {
                  const maxX = Math.max(...g.areas.map((a) => a.origin.x + a.grid.cols * TILE_PX));
                  g.areas.push(newArea(`Bed ${String.fromCharCode(65 + g.areas.length)}`, 4, 4, { x: maxX + 60, y: 0 }));
                })
              }
              className="h-9 rounded-lg bg-[var(--color-paper-deep)] px-3 text-sm font-medium"
            >
              + Add area (satellite)
            </button>
          </div>

          {/* inspector */}
          {selected && selectedArea && (
            <Inspector
              areaName={selectedArea.name}
              col={selected.col}
              row={selected.row}
              tile={selectedTile}
              instances={instances}
              plantsById={plantsById}
              onActivate={(instanceId, date) => void activateInstance(instanceId, date)}
              onRemove={() => void eraseAt(selected.areaId, selected.col, selected.row)}
            />
          )}

          {showMirror && (
            <MirrorTable
              garden={garden}
              rows={mirrorRows(garden, instances, plantsById)}
              toolLabel={toolLabel(tool, plantsById)}
              onApplyAt={(a, c, r) => void applyToolAt(a, c, r)}
              onRemoveAt={(a, c, r) => void eraseAt(a, c, r)}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function toolLabel(tool: Tool, plantsById: Map<string, { commonName: string }>): string {
  switch (tool.t) {
    case "select": return "Select";
    case "erase": return "Erase";
    case "elev_up": return "Raise +5cm";
    case "elev_down": return "Lower −5cm";
    case "plant": return plantsById.get(tool.plantId)?.commonName ?? "Plant";
    case "structure": return STRUCTURES[tool.kind].label;
    case "hardscape": return HARDSCAPES[tool.kind].label;
    case "water": return WATER[tool.kind].label;
  }
}

function PaletteGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-44 rounded-xl border border-[var(--color-paper-deep)] bg-white/40 p-2 dark:bg-white/5">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">{label}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function ToolBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-left text-xs font-medium ${active ? "bg-[var(--color-canopy)] text-white" : "bg-white/40 hover:bg-[var(--color-paper-deep)]/60 dark:bg-white/5"}`}
    >
      {children}
    </button>
  );
}

function AreaConfig({
  area,
  onChange,
  onRemove,
}: {
  area: GardenArea;
  onChange: (patch: Partial<GardenArea>) => void;
  onRemove?: () => void;
}) {
  return (
    <details className="rounded-lg border border-[var(--color-paper-deep)] bg-white/40 p-2 text-xs dark:bg-white/5">
      <summary className="cursor-pointer font-medium">{area.name} · {area.grid.cols}×{area.grid.rows}</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label>Name
          <input value={area.name} onChange={(e) => onChange({ name: e.target.value })} className="mt-1 block w-28 rounded border border-[var(--color-paper-deep)] bg-white/60 px-1.5 py-1 dark:bg-black/20" />
        </label>
        <label>Cols
          <input type="number" min={1} max={64} value={area.grid.cols} onChange={(e) => onChange({ grid: { ...area.grid, cols: clampInt(e.target.value, 1, 64) } })} className="mt-1 block w-16 rounded border border-[var(--color-paper-deep)] bg-white/60 px-1.5 py-1 dark:bg-black/20" />
        </label>
        <label>Rows
          <input type="number" min={1} max={64} value={area.grid.rows} onChange={(e) => onChange({ grid: { ...area.grid, rows: clampInt(e.target.value, 1, 64) } })} className="mt-1 block w-16 rounded border border-[var(--color-paper-deep)] bg-white/60 px-1.5 py-1 dark:bg-black/20" />
        </label>
        <label>Drainage (§31.2)
          <select value={area.soilDrainage} onChange={(e) => onChange({ soilDrainage: e.target.value as GardenArea["soilDrainage"] })} className="mt-1 block rounded border border-[var(--color-paper-deep)] bg-white/60 px-1.5 py-1 dark:bg-black/20">
            <option value="fast">fast</option>
            <option value="moderate">moderate</option>
            <option value="poor">poor</option>
          </select>
        </label>
        <label>Rotation°
          <input type="number" min={-180} max={180} value={area.rotationDeg} onChange={(e) => onChange({ rotationDeg: clampInt(e.target.value, -180, 180) })} className="mt-1 block w-16 rounded border border-[var(--color-paper-deep)] bg-white/60 px-1.5 py-1 dark:bg-black/20" />
        </label>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded bg-[var(--color-warn)]/15 px-2 py-1 font-medium text-[var(--color-warn)]">
            Delete area
          </button>
        )}
      </div>
    </details>
  );
}

function Inspector({
  areaName,
  col,
  row,
  tile,
  instances,
  plantsById,
  onActivate,
  onRemove,
}: {
  areaName: string;
  col: number;
  row: number;
  tile: ReturnType<typeof tileAt>;
  instances: PlantInstance[];
  plantsById: Map<string, Plant>;
  onActivate: (instanceId: string, date: string) => void;
  onRemove: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const content = tile?.content;
  const inst = content?.type === "plant" ? instances.find((i) => i.id === content.instanceId) : undefined;
  const plantName = inst ? plantsById.get(inst.plantId)?.commonName : undefined;

  return (
    <div className="mt-3 rounded-xl border border-[var(--color-paper-deep)] bg-white/40 p-3 text-sm dark:bg-white/5">
      <p className="font-semibold">
        {areaName} · tile ({col}, {row})
        {tile?.elevationCm ? ` · elevation ${tile.elevationCm > 0 ? "+" : ""}${tile.elevationCm} cm` : ""}
      </p>
      {!content || content.type === "empty" ? (
        <p className="text-[var(--color-ink-soft)]">Empty soil.</p>
      ) : content.type === "plant" && inst ? (
        <div className="mt-1 space-y-2">
          <p>
            {plantName} —{" "}
            {inst.status === "planned" ? (
              <span className="text-[var(--color-warn)]">planned (not yet planted)</span>
            ) : (
              <span className="capitalize">{inst.status}, stage: {inst.currentStage}, planted {inst.plantedOn}</span>
            )}
          </p>
          {inst.status === "planned" && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1 text-xs dark:bg-black/20" />
              <button type="button" onClick={() => onActivate(inst.id, date)} className="rounded-lg bg-[var(--color-canopy)] px-3 py-1 text-xs font-medium text-white">
                🌱 Log planting
              </button>
            </div>
          )}
          <button type="button" onClick={onRemove} className="rounded-lg bg-[var(--color-warn)]/15 px-3 py-1 text-xs font-medium text-[var(--color-warn)]">
            Remove plant
          </button>
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-3">
          <p className="capitalize">{content.type}</p>
          <button type="button" onClick={onRemove} className="rounded-lg bg-[var(--color-warn)]/15 px-3 py-1 text-xs font-medium text-[var(--color-warn)]">
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

function NewGardenForm({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState(`Garden ${new Date().getFullYear()}`);
  return (
    <div className="space-y-3">
      <p className="text-[var(--color-ink-soft)]">
        Lay out your real beds on a tile grid — every tile is one square foot
        by default. Plants, trellises, paths, drip lines, elevation; the works.
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Garden name"
          className="flex-1 rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-3 py-2 text-sm dark:bg-black/20"
        />
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => void onCreate(name.trim())}
          className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create garden
        </button>
      </div>
    </div>
  );
}

function clampInt(v: string, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
}

function Pad({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-[var(--color-ink-soft)]">{children}</p>;
}
