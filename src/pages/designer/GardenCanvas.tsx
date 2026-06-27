/**
 * §12.2/§12.3 — the Konva plot, redesigned as one continuous grass FIELD you
 * carve into. The ground plane (grass + carved soil/path/… + flora) is painted
 * once to an offscreen canvas and blitted as a single image; plants, the sun
 * overlay, harvest badges, the edit grid, and selection layer on top. Straight-
 * on view; cardinal orientation is a data property (drives the sun, not the
 * camera). Pan by dragging, zoom with the wheel / buttons.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import type { FieldOverlay, Garden, OverlaySub, Plant, PlantInstance } from "../../types/models";
import type { SunMap } from "../../engines/sunModel";
import { tileKey } from "../../engines/sunModel";
import { groundTypeAt } from "../../db/gardenRepo";
import { produceFor, spriteFor } from "../../sprites/sprites";
import { GROUND_NATIVE, paintField } from "../../sprites/ground";
import { GRID_LINE, OVERLAYS, TILE_PX } from "./palette";

export interface CanvasProps {
  garden: Garden;
  instances: PlantInstance[];
  plantsById: Map<string, Plant>;
  sunMap: SunMap | null;
  selected: { col: number; row: number } | null;
  pendingOverlay: { col: number; row: number; sub: OverlaySub } | null;
  fieldMode: boolean;
  onCellTap: (col: number, row: number) => void;
  height: number;
}

/** Integer zoom stops keep pixel sprites crisp (no fractional scaling). */
const ZOOM_STEPS = [0.25, 0.5, 1, 2, 3, 4];

export function GardenCanvas({
  garden,
  instances,
  plantsById,
  sunMap,
  selected,
  pendingOverlay,
  fieldMode,
  onCellTap,
  height,
}: CanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [scale, setScale] = useState(1);
  const { field } = garden;
  const fieldW = field.cols * TILE_PX;
  const fieldH = field.rows * TILE_PX;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Paint the whole ground plane once; repaint only when the carve / size /
  // mode changes. Flora shows in view mode, hides in the stark field mode.
  const groundSig = useMemo(() => JSON.stringify(field.ground), [field.ground]);
  const groundCanvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = field.cols * GROUND_NATIVE;
    c.height = field.rows * GROUND_NATIVE;
    const ctx = c.getContext("2d")!;
    paintField(
      ctx,
      { cols: field.cols, rows: field.rows, groundType: (col, row) => groundTypeAt(field, col, row) },
      { flora: !fieldMode },
    );
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.cols, field.rows, groundSig, fieldMode]);

  function cellFromPointer(): { col: number; row: number } | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const pt = stage.getPointerPosition();
    if (!pt) return null;
    const tr = stage.getAbsoluteTransform().copy();
    tr.invert();
    const p = tr.point(pt);
    const col = Math.floor(p.x / TILE_PX);
    const row = Math.floor(p.y / TILE_PX);
    if (col < 0 || row < 0 || col >= field.cols || row >= field.rows) return null;
    return { col, row };
  }

  function zoomStep(dir: 1 | -1, center?: { x: number; y: number }) {
    const stage = stageRef.current;
    if (!stage) return;
    const old = stage.scaleX();
    let idx = 0;
    for (let i = 1; i < ZOOM_STEPS.length; i++) {
      if (Math.abs(ZOOM_STEPS[i] - old) < Math.abs(ZOOM_STEPS[idx] - old)) idx = i;
    }
    const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + dir))];
    if (next === old) return;
    const c = center ?? { x: width / 2, y: height / 2 };
    const rel = { x: (c.x - stage.x()) / old, y: (c.y - stage.y()) / old };
    stage.scale({ x: next, y: next });
    stage.position({ x: c.x - rel.x * next, y: c.y - rel.y * next });
    setScale(next);
  }

  // grid lines (edit aid, field mode only)
  const gridLines: React.ReactNode[] = [];
  if (fieldMode) {
    for (let c = 0; c <= field.cols; c++)
      gridLines.push(<Line key={`v${c}`} points={[c * TILE_PX, 0, c * TILE_PX, fieldH]} stroke={GRID_LINE} strokeWidth={1} listening={false} />);
    for (let r = 0; r <= field.rows; r++)
      gridLines.push(<Line key={`h${r}`} points={[0, r * TILE_PX, fieldW, r * TILE_PX]} stroke={GRID_LINE} strokeWidth={1} listening={false} />);
  }

  // sun overlay (per cell) when a map is present
  const sunRects: React.ReactNode[] = [];
  if (sunMap) {
    for (let col = 0; col < field.cols; col++)
      for (let row = 0; row < field.rows; row++) {
        const hrs = sunMap.get(tileKey(col, row)) ?? 9;
        const opacity = Math.max(0, Math.min(0.7, (9 - hrs) / 12));
        if (opacity < 0.02) continue;
        sunRects.push(<Rect key={`s${col},${row}`} x={col * TILE_PX} y={row * TILE_PX} width={TILE_PX} height={TILE_PX} fill="#1e2a4a" opacity={opacity} listening={false} />);
      }
  }

  // plants + harvest badges (one sprite per occupied cell)
  const plantNodes: React.ReactNode[] = [];
  for (const inst of instances) {
    const plant = plantsById.get(inst.plantId);
    if (!plant) continue;
    const stage = inst.status === "planned" ? "planted" : inst.currentStage;
    const url = spriteFor(plant.iconKey, plant.category, stage, 2);
    const ghost = inst.status === "planned";
    const ripe = inst.status === "active" && inst.currentStage === "harvest";
    const badge = ripe ? produceFor(plant.iconKey, plant.category, 2) : null;
    for (const t of inst.tiles) {
      plantNodes.push(
        <ImageNode key={`p${inst.id},${t.col},${t.row}`} url={url} x={t.col * TILE_PX} y={t.row * TILE_PX} size={TILE_PX} opacity={ghost ? 0.55 : 1} />,
      );
      if (badge) plantNodes.push(<ProduceBadge key={`b${inst.id},${t.col},${t.row}`} url={badge} x={t.col * TILE_PX} y={t.row * TILE_PX} />);
    }
  }

  // overlays (sub-cell infrastructure): lines through cell centers, strips between
  const cellCm = field.cellSizeCm;
  const overlayNodes: React.ReactNode[] = [];
  for (const o of field.overlays) {
    const meta = OVERLAYS[o.sub];
    const color = meta?.color ?? "#4f8fc4";
    const pts = o.path.flatMap((p) => [p.x * TILE_PX, p.y * TILE_PX]);
    if (o.kind === "strip") {
      const wPx = ((o.widthCm ?? meta?.widthCm ?? 45) / cellCm) * TILE_PX;
      overlayNodes.push(<Line key={`o${o.id}`} points={pts} stroke={color} strokeWidth={wPx} lineCap="round" lineJoin="round" opacity={0.92} listening={false} />);
    } else {
      overlayNodes.push(<Line key={`o${o.id}`} points={pts} stroke={color} strokeWidth={2.5} dash={o.sub === "soaker" ? [5, 4] : undefined} lineCap="round" listening={false} />);
      if (o.sub === "drip") for (const e of emittersAlong(o)) overlayNodes.push(<Circle key={`e${o.id},${e.x.toFixed(1)},${e.y.toFixed(1)}`} x={e.x * TILE_PX} y={e.y * TILE_PX} radius={2.2} fill="#bfe0f5" listening={false} />);
    }
  }
  const pendingMarker = pendingOverlay ? (
    <Circle x={(pendingOverlay.col + 0.5) * TILE_PX} y={(pendingOverlay.row + 0.5) * TILE_PX} radius={TILE_PX * 0.32} stroke={OVERLAYS[pendingOverlay.sub]?.color ?? "#4f8fc4"} strokeWidth={2} dash={[4, 3]} listening={false} />
  ) : null;

  return (
    <div ref={wrapRef} className="relative overflow-hidden rounded-xl border border-[var(--color-paper-deep)] bg-[#5f9f46]">
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        draggable
        onWheel={(e) => {
          e.evt.preventDefault();
          zoomStep(e.evt.deltaY > 0 ? -1 : 1, e.target.getStage()!.getPointerPosition() ?? undefined);
        }}
        onClick={() => { const c = cellFromPointer(); if (c) onCellTap(c.col, c.row); }}
        onTap={() => { const c = cellFromPointer(); if (c) onCellTap(c.col, c.row); }}
        className="touch-none"
      >
        <Layer imageSmoothingEnabled={false}>
          {/* a thin soil border frames the plot edge */}
          <Rect x={-2} y={-2} width={fieldW + 4} height={fieldH + 4} fill="#4a3a28" cornerRadius={4} listening={false} />
          <KImage image={groundCanvas} x={0} y={0} width={fieldW} height={fieldH} />
          {sunRects}
          {gridLines}
          {overlayNodes}
          {plantNodes}
          {selected && (
            <Rect x={selected.col * TILE_PX} y={selected.row * TILE_PX} width={TILE_PX} height={TILE_PX} stroke="#f3c14b" strokeWidth={2.5} listening={false} />
          )}
          {pendingMarker}
        </Layer>
      </Stage>

      {/* zoom + compass HUD */}
      <div className="absolute right-2 top-2 flex flex-col items-center gap-1">
        <div
          aria-label={`North is ${garden.northBearingDeg}° from screen-up`}
          title="Compass — N (drives the sun estimate)"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-sm font-bold text-[#b3412e] shadow"
          style={{ transform: `rotate(${-garden.northBearingDeg}deg)` }}
        >
          ↑N
        </div>
        <button type="button" onClick={() => zoomStep(1)} className="h-8 w-8 rounded-lg bg-white/85 font-bold shadow">+</button>
        <button type="button" onClick={() => zoomStep(-1)} className="h-8 w-8 rounded-lg bg-white/85 font-bold shadow">−</button>
        <span className="rounded bg-white/70 px-1 text-[10px]">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}

/** Cell-center points along an overlay's segments (drip emitter spots). */
function emittersAlong(o: FieldOverlay): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < o.path.length; i++) {
    const a = o.path[i], b = o.path[i + 1];
    const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const imageCache = new Map<string, HTMLImageElement>();
function useDecoded(url: string): HTMLImageElement | null {
  const [, bump] = useState(0);
  const img = imageCache.get(url) ?? null;
  useEffect(() => {
    if (imageCache.has(url)) return;
    const el = new window.Image();
    el.onload = () => { imageCache.set(url, el); bump((n) => n + 1); };
    el.src = url;
  }, [url]);
  return img;
}

function ImageNode({ url, x, y, size, opacity }: { url: string; x: number; y: number; size: number; opacity: number }) {
  const img = useDecoded(url);
  if (!img) return null;
  return <KImage image={img} x={x} y={y} width={size} height={size} opacity={opacity} listening={false} />;
}

/** Small corner badge marking a harvest-ready cell with its produce icon. */
function ProduceBadge({ url, x, y }: { url: string; x: number; y: number }) {
  const img = useDecoded(url);
  if (!img) return null;
  const S = 15;
  return (
    <Group x={x + TILE_PX - S - 1} y={y + 1} listening={false}>
      <Rect width={S} height={S} cornerRadius={S / 2} fill="rgba(255,255,255,0.85)" stroke="#3a2a18" strokeWidth={1} />
      <KImage image={img} x={1} y={1} width={S - 2} height={S - 2} />
    </Group>
  );
}
