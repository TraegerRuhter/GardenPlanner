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
  GardenField,
  GroundType,
  Location,
  OverlaySub,
  Plant,
  PlantInstance,
  SoilDrainage,
} from "../../types/models";
import {
  activeInstancesForGarden,
  addOverlaySegment,
  clearPlantAt,
  createGarden,
  elevationAt,
  groundTypeAt,
  placePlant,
  plantOccupant,
  removeOverlayAt,
  saveGarden,
  setElevation,
  setGround,
} from "../../db/gardenRepo";
import { validatePlacement, type PlacementField, type PlacementWarning } from "../../engines/placement";
import { blockersFromInstances, sunMapForField, tileKey, type SunMap } from "../../engines/sunModel";
import { getActiveClimate } from "../../db/climateRepo";
import { activateInstance } from "../../db/instancesRepo";
import { todayISO } from "../../lib/dates";
import { GardenCanvas } from "./GardenCanvas";
import { CanvasToolbar, DesignerPalette } from "./DesignerPalette";
import { MirrorTable } from "./MirrorTable";
import { mirrorRows } from "./mirrorRows";
import { GROUND, OVERLAYS, type Tool } from "./palette";

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
        <h1 className="mb-1 text-2xl font-bold">Garden Designer</h1>
        <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
          Create your first garden to start designing the layout.
        </p>
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
  const [selected, setSelected] = useState<{ col: number; row: number } | null>(null);
  const [warnings, setWarnings] = useState<PlacementWarning[]>([]);
  const [sunOverlay, setSunOverlay] = useState(false);
  const [showMirror, setShowMirror] = useState(false);
  // Field mode = the stark, gridded editing view; off = lively preview (§ user).
  const [fieldMode, setFieldMode] = useState(true);
  // First click of a two-click overlay run (drip/soaker/walkway): start cell.
  const [pendingOverlay, setPendingOverlay] = useState<{ col: number; row: number; sub: OverlaySub } | null>(null);

  // Changing tools drops any half-drawn overlay.
  const selectTool = (t: Tool) => { setPendingOverlay(null); setTool(t); };

  const plantsById = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);
  const latDeg = climate?.location.lat ?? 45;

  const placementField = (g: Garden): PlacementField => ({
    cols: g.field.cols,
    rows: g.field.rows,
    cellSizeCm: g.field.cellSizeCm,
    elevationAt: (c, r) => elevationAt(g.field, c, r),
  });

  // §12.8: recompute the field-wide sun map on layout change; only while shown.
  const sunMap = useMemo<SunMap | null>(() => {
    if (!sunOverlay) return null;
    const heights = new Map(plants.map((p) => [p.id, p.matureHeightCm.max]));
    const blockers = blockersFromInstances(instances, heights);
    return sunMapForField(garden.field, blockers, {
      latDeg,
      northBearingDeg: garden.northBearingDeg,
    });
  }, [garden, instances, plants, sunOverlay, latDeg]);

  function toast(w: PlacementWarning[]) {
    setWarnings(w);
    if (w.length) window.setTimeout(() => setWarnings([]), 7000);
  }

  async function eraseAt(col: number, row: number) {
    // Priority: a plant, then an overlay passing through, then carved ground.
    if (await clearPlantAt(col, row, instances)) { setSelected(null); return; }
    await mutateGarden((g) => {
      if (!removeOverlayAt(g.field, col, row)) setGround(g.field, col, row, "grass");
    });
    setSelected(null);
  }

  async function applyToolAtCell(col: number, row: number) {
    switch (tool.t) {
      case "select":
        setSelected({ col, row });
        return;
      case "erase":
        await eraseAt(col, row);
        return;
      case "elev_up":
      case "elev_down": {
        const next = elevationAt(garden.field, col, row) + (tool.t === "elev_up" ? 5 : -5);
        await mutateGarden((g) => setElevation(g.field, col, row, next));
        return;
      }
      case "ground": {
        await mutateGarden((g) => setGround(g.field, col, row, tool.kind));
        return;
      }
      case "overlay": {
        const meta = OVERLAYS[tool.sub];
        if (!meta) return;
        // First click sets the start; second click lays a straight run to here.
        if (!pendingOverlay || pendingOverlay.sub !== tool.sub) {
          setPendingOverlay({ col, row, sub: tool.sub });
          return;
        }
        if (pendingOverlay.col === col && pendingOverlay.row === row) {
          setPendingOverlay(null); // clicking the start again cancels
          return;
        }
        const start = { col: pendingOverlay.col, row: pendingOverlay.row };
        await mutateGarden((g) => addOverlaySegment(g.field, tool.sub, meta.kind, start, { col, row }, meta.widthCm));
        setPendingOverlay(null);
        return;
      }
      case "plant": {
        const plant = plantsById.get(tool.plantId);
        if (!plant) return;
        if (plantOccupant(instances, col, row)) {
          toast([{ kind: "spacing", severity: "warn", message: "A plant is already here — erase it first." }]);
          return;
        }
        const history = await db.instances.where("gardenId").equals(garden.id).toArray();
        const target = [{ col, row }];
        const w = validatePlacement({
          field: placementField(garden),
          target,
          plant,
          instances,
          history,
          plantsById,
          companions,
          sunHours: sunMap?.get(tileKey(col, row)),
        });
        await placePlant(garden, plant.id, target);
        toast(w);
        setSelected({ col, row });
        return;
      }
    }
  }

  async function mutateGarden(fn: (g: Garden) => void) {
    const g = structuredClone(garden);
    fn(g);
    await saveGarden(g);
  }

  const selectedGround = selected ? groundTypeAt(garden.field, selected.col, selected.row) : undefined;
  const selectedElev = selected ? elevationAt(garden.field, selected.col, selected.row) : 0;
  const selectedPlant = selected ? plantOccupant(instances, selected.col, selected.row) : undefined;

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
          className="rounded-lg bg-[var(--color-paper-deep)] px-2.5 py-1.5 text-xs font-medium hover:opacity-80"
        >
          + New Garden
        </button>

        <label className="ml-auto flex items-center gap-1 text-xs font-medium" title="Compass bearing where north is relative to the top of the garden. Used for sun calculations.">
          🧭 North °
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
          title="Estimated direct-sun hours overlay (solstice+equinox average)"
        >
          ☀ Sun Map
        </button>
        <button
          type="button"
          aria-pressed={!fieldMode}
          onClick={() => setFieldMode((v) => !v)}
          className={`rounded-lg px-2 py-1 text-xs font-medium ${!fieldMode ? "bg-[var(--color-leaf)] text-white" : "bg-[var(--color-paper-deep)]"}`}
          title={fieldMode ? "Editing the field (grid shown). Click to preview it living." : "Preview mode (flora, no grid). Click to edit."}
        >
          {fieldMode ? "🌿 Preview" : "✏️ Edit Field"}
        </button>
        <button
          type="button"
          aria-pressed={showMirror}
          onClick={() => setShowMirror((v) => !v)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${showMirror ? "bg-[var(--color-canopy)] text-white" : "bg-[var(--color-paper-deep)]"}`}
        >
          ☰ Table View
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* palette */}
        <DesignerPalette plants={plants} tool={tool} setTool={selectTool} />

        {/* canvas + inspector */}
        <div className="order-1 min-w-0 flex-1 lg:order-2">
          <CanvasToolbar tool={tool} setTool={selectTool} />
          <GardenCanvas
            garden={garden}
            instances={instances}
            plantsById={plantsById}
            sunMap={sunMap}
            selected={selected}
            pendingOverlay={pendingOverlay}
            fieldMode={fieldMode}
            onCellTap={(c, r) => void applyToolAtCell(c, r)}
            height={460}
          />

          {/* warnings toast */}
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

          {/* field settings */}
          <FieldConfig
            cols={garden.field.cols}
            rows={garden.field.rows}
            soilDrainage={garden.field.soilDrainage}
            onChange={(patch) => void mutateGarden((g) => Object.assign(g.field, patch))}
          />

          {/* inspector */}
          {selected && (
            <Inspector
              col={selected.col}
              row={selected.row}
              groundType={selectedGround ?? "grass"}
              elevationCm={selectedElev}
              plant={selectedPlant}
              plantsById={plantsById}
              onActivate={(instanceId, date) => void activateInstance(instanceId, date)}
              onRemove={() => void eraseAt(selected.col, selected.row)}
            />
          )}

          {showMirror && (
            <MirrorTable
              garden={garden}
              rows={mirrorRows(garden, instances, plantsById)}
              toolLabel={toolLabel(tool, plantsById)}
              onApplyAt={(c, r) => void applyToolAtCell(c, r)}
              onRemoveAt={(c, r) => void eraseAt(c, r)}
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
    case "ground": return GROUND[tool.kind].label;
    case "overlay": return OVERLAYS[tool.sub]?.label ?? "Overlay";
  }
}

function FieldConfig({
  cols,
  rows,
  soilDrainage,
  onChange,
}: {
  cols: number;
  rows: number;
  soilDrainage: SoilDrainage;
  onChange: (patch: Partial<Pick<GardenField, "cols" | "rows" | "soilDrainage">>) => void;
}) {
  return (
    <details className="mt-3 rounded-lg border border-[var(--color-paper-deep)] bg-white/40 p-2 text-xs dark:bg-white/5">
      <summary className="cursor-pointer font-medium">Field · {cols}×{rows} cells</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label>Width (cells)
          <input type="number" min={1} max={64} value={cols} onChange={(e) => onChange({ cols: clampInt(e.target.value, 1, 64) })} className="mt-1 block w-20 rounded border border-[var(--color-paper-deep)] bg-white/60 px-1.5 py-1 dark:bg-black/20" />
        </label>
        <label>Height (cells)
          <input type="number" min={1} max={64} value={rows} onChange={(e) => onChange({ rows: clampInt(e.target.value, 1, 64) })} className="mt-1 block w-20 rounded border border-[var(--color-paper-deep)] bg-white/60 px-1.5 py-1 dark:bg-black/20" />
        </label>
        <label>Soil Drainage
          <select value={soilDrainage} onChange={(e) => onChange({ soilDrainage: e.target.value as SoilDrainage })} className="mt-1 block rounded border border-[var(--color-paper-deep)] bg-white/60 px-1.5 py-1 dark:bg-black/20">
            <option value="fast">Fast</option>
            <option value="moderate">Moderate</option>
            <option value="poor">Poor</option>
          </select>
        </label>
      </div>
    </details>
  );
}

function Inspector({
  col,
  row,
  groundType,
  elevationCm,
  plant,
  plantsById,
  onActivate,
  onRemove,
}: {
  col: number;
  row: number;
  groundType: GroundType;
  elevationCm: number;
  plant: PlantInstance | undefined;
  plantsById: Map<string, Plant>;
  onActivate: (instanceId: string, date: string) => void;
  onRemove: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const plantName = plant ? plantsById.get(plant.plantId)?.commonName : undefined;

  return (
    <div className="mt-3 rounded-xl border border-[var(--color-paper-deep)] bg-white/40 p-3 text-sm dark:bg-white/5">
      <p className="font-semibold">
        Cell ({col}, {row}) · <span className="capitalize">{groundType}</span>
        {elevationCm ? ` · elevation ${elevationCm > 0 ? "+" : ""}${elevationCm} cm` : ""}
      </p>
      {plant ? (
        <div className="mt-1 space-y-2">
          <p>
            <span className="font-medium">{plantName}</span>{" — "}
            {plant.status === "planned" ? (
              <span className="text-[var(--color-warn)]">Planned (not yet planted)</span>
            ) : (
              <span className="capitalize">Status: {plant.status} · Stage: {plant.currentStage} · Planted {plant.plantedOn}</span>
            )}
          </p>
          {plant.status === "planned" && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1 text-xs dark:bg-black/20" />
              <button type="button" onClick={() => onActivate(plant.id, date)} className="rounded-lg bg-[var(--color-canopy)] px-3 py-1 text-xs font-medium text-white">
                🌱 Log planting
              </button>
            </div>
          )}
          <button type="button" onClick={onRemove} className="rounded-lg bg-[var(--color-warn)]/15 px-3 py-1 text-xs font-medium text-[var(--color-warn)]">
            Remove plant
          </button>
        </div>
      ) : (
        <p className="text-[var(--color-ink-soft)]">
          {groundType === "grass"
            ? "Grass — carve ground or place a plant from the palette."
            : "Carved ground — place a plant, or erase to restore grass."}
        </p>
      )}
    </div>
  );
}

function NewGardenForm({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState(`Garden ${new Date().getFullYear()}`);
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--color-paper-deep)] bg-white/30 p-4 dark:bg-white/5">
        <p className="font-medium text-[var(--color-ink)]">What you can do:</p>
        <ul className="mt-1.5 space-y-0.5 text-sm text-[var(--color-ink-soft)]">
          <li>🌿 Start from an expanse of grass and carve your garden into it</li>
          <li>🟫 Brush in soil beds, paths, and mulch (each cell = 1 sq ft)</li>
          <li>🌱 Plant onto the field; 🧭 set north so the sun estimate is right</li>
          <li>☀ View estimated sun exposure · 📐 raise/lower cells</li>
        </ul>
      </div>
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
          className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90"
        >
          Create Garden
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
