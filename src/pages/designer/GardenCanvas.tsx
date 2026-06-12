/**
 * §12.2/§12.3 — the Konva plot: pannable, zoomable stage rendering every
 * area at its origin with layered terrain → elevation shade → content →
 * sun overlay → selection. Tap a tile to apply the active tool; drag an
 * area's title bar to reposition it on the canvas (satellites, §12.2).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KImage, Layer, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import type { Garden, GardenArea, Plant, PlantInstance, Tile } from "../../types/models";
import type { SunMap } from "../../engines/sunModel";
import { tileKey } from "../../engines/sunModel";
import { spriteFor } from "../../sprites/sprites";
import { GRID_LINE, HARDSCAPES, SOIL_BASE, STRUCTURES, TILE_PX, WATER } from "./palette";

export interface CanvasProps {
  garden: Garden;
  instances: PlantInstance[];
  plantsById: Map<string, Plant>;
  sunMaps: Map<string, SunMap> | null; // areaId → map, when overlay on
  selected: { areaId: string; col: number; row: number } | null;
  onTileTap: (areaId: string, col: number, row: number) => void;
  onAreaMove: (areaId: string, x: number, y: number) => void;
  height: number;
}

export function GardenCanvas({
  garden,
  instances,
  plantsById,
  sunMaps,
  selected,
  onTileTap,
  onAreaMove,
  height,
}: CanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const instancesById = useMemo(
    () => new Map(instances.map((i) => [i.id, i])),
    [instances],
  );

  function zoomAt(factor: number, center?: { x: number; y: number }) {
    const stage = stageRef.current;
    if (!stage) return;
    const old = stage.scaleX();
    const next = Math.max(0.35, Math.min(3, old * factor));
    const c = center ?? { x: width / 2, y: height / 2 };
    const rel = { x: (c.x - stage.x()) / old, y: (c.y - stage.y()) / old };
    stage.scale({ x: next, y: next });
    stage.position({ x: c.x - rel.x * next, y: c.y - rel.y * next });
    setScale(next);
  }

  return (
    <div ref={wrapRef} className="relative overflow-hidden rounded-xl border border-[var(--color-paper-deep)] bg-[#a8c686]/40">
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        draggable
        onWheel={(e) => {
          e.evt.preventDefault();
          zoomAt(e.evt.deltaY > 0 ? 0.92 : 1.08, e.target.getStage()!.getPointerPosition() ?? undefined);
        }}
        className="touch-none"
      >
        <Layer>
          {garden.areas.map((area) => (
            <AreaGroup
              key={area.id}
              area={area}
              instancesById={instancesById}
              plantsById={plantsById}
              sunMap={sunMaps?.get(area.id) ?? null}
              selected={selected?.areaId === area.id ? selected : null}
              onTileTap={onTileTap}
              onAreaMove={onAreaMove}
            />
          ))}
        </Layer>
      </Stage>

      {/* zoom + compass HUD */}
      <div className="absolute right-2 top-2 flex flex-col items-center gap-1">
        <div
          aria-label={`North is ${garden.northBearingDeg}° from screen-up`}
          title="Compass — N"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-sm font-bold text-[#b3412e] shadow"
          style={{ transform: `rotate(${-garden.northBearingDeg}deg)` }}
        >
          ↑N
        </div>
        <button type="button" onClick={() => zoomAt(1.2)} className="h-8 w-8 rounded-lg bg-white/85 font-bold shadow">+</button>
        <button type="button" onClick={() => zoomAt(1 / 1.2)} className="h-8 w-8 rounded-lg bg-white/85 font-bold shadow">−</button>
        <span className="rounded bg-white/70 px-1 text-[10px]">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}

function AreaGroup({
  area,
  instancesById,
  plantsById,
  sunMap,
  selected,
  onTileTap,
  onAreaMove,
}: {
  area: GardenArea;
  instancesById: Map<string, PlantInstance>;
  plantsById: Map<string, Plant>;
  sunMap: SunMap | null;
  selected: { col: number; row: number } | null;
  onTileTap: (areaId: string, col: number, row: number) => void;
  onAreaMove: (areaId: string, x: number, y: number) => void;
}) {
  const tiles = useMemo(() => {
    const m = new Map<string, Tile>();
    for (const t of area.tiles) m.set(`${t.col},${t.row}`, t);
    return m;
  }, [area.tiles]);

  const w = area.grid.cols * TILE_PX;
  const h = area.grid.rows * TILE_PX;

  const cells: React.ReactNode[] = [];
  for (let col = 0; col < area.grid.cols; col++) {
    for (let row = 0; row < area.grid.rows; row++) {
      const tile = tiles.get(`${col},${row}`);
      cells.push(
        <TileCell
          key={`${col},${row}`}
          col={col}
          row={row}
          tile={tile}
          instancesById={instancesById}
          plantsById={plantsById}
          sunHours={sunMap?.get(tileKey(col, row))}
          isSelected={selected?.col === col && selected?.row === row}
          onTap={() => onTileTap(area.id, col, row)}
        />,
      );
    }
  }

  return (
    <Group x={area.origin.x} y={area.origin.y} rotation={area.rotationDeg}>
      {/* drag handle / title bar */}
      <Group
        draggable
        onDragEnd={(e) => {
          onAreaMove(area.id, area.origin.x + e.target.x(), area.origin.y + e.target.y());
          e.target.position({ x: 0, y: 0 });
        }}
      >
        <Rect x={0} y={-22} width={w} height={20} fill="rgba(47,111,62,0.85)" cornerRadius={4} />
        <Text x={6} y={-18} text={`⠿ ${area.name}`} fontSize={12} fill="#fff" listening={false} />
      </Group>
      {/* bed backdrop */}
      <Rect x={-3} y={-3} width={w + 6} height={h + 6} fill="#6e5238" cornerRadius={6} />
      {cells}
    </Group>
  );
}

function TileCell({
  col,
  row,
  tile,
  instancesById,
  plantsById,
  sunHours,
  isSelected,
  onTap,
}: {
  col: number;
  row: number;
  tile: Tile | undefined;
  instancesById: Map<string, PlantInstance>;
  plantsById: Map<string, Plant>;
  sunHours: number | undefined;
  isSelected: boolean;
  onTap: () => void;
}) {
  const x = col * TILE_PX;
  const y = row * TILE_PX;
  const content = tile?.content ?? { type: "empty" as const };
  const elev = tile?.elevationCm ?? 0;

  let base = SOIL_BASE;
  let glyph: { text: string; color: string } | null = null;
  let sprite: string | null = null;
  let ghost = false;

  if (content.type === "hardscape") {
    base = HARDSCAPES[content.hardscape].color;
  } else if (content.type === "water") {
    base = "#7d5c46";
    glyph = { text: WATER[content.water].glyph, color: WATER[content.water].color };
  } else if (content.type === "structure") {
    glyph = { text: STRUCTURES[content.structure].glyph, color: STRUCTURES[content.structure].color };
  } else if (content.type === "plant") {
    const inst = instancesById.get(content.instanceId);
    const plant = inst && plantsById.get(inst.plantId);
    if (inst && plant) {
      sprite = spriteFor(plant.iconKey, plant.category, inst.status === "planned" ? "planted" : inst.currentStage, 4);
      ghost = inst.status === "planned";
    }
  }

  // §12.5 elevation shading: lighter when raised, darker when sunken
  const elevShade =
    elev > 0
      ? { fill: "#ffffff", opacity: Math.min(0.35, elev / 90) }
      : elev < 0
        ? { fill: "#000000", opacity: Math.min(0.35, -elev / 90) }
        : null;

  // §12.8 sun overlay: deep shade = dark slate wash
  const sunWash =
    sunHours !== undefined
      ? { opacity: Math.max(0, Math.min(0.7, (9 - sunHours) / 12)) }
      : null;

  return (
    <Group x={x} y={y} onClick={onTap} onTap={onTap}>
      <Rect width={TILE_PX} height={TILE_PX} fill={base} stroke={GRID_LINE} strokeWidth={1} />
      {elevShade && <Rect width={TILE_PX} height={TILE_PX} fill={elevShade.fill} opacity={elevShade.opacity} listening={false} />}
      {sprite && <SpriteNode url={sprite} ghost={ghost} />}
      {glyph && (
        <Text
          text={glyph.text}
          fontSize={22}
          fill={glyph.color}
          width={TILE_PX}
          height={TILE_PX}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
      {sunWash && <Rect width={TILE_PX} height={TILE_PX} fill="#1e2a4a" opacity={sunWash.opacity} listening={false} />}
      {isSelected && <Rect width={TILE_PX} height={TILE_PX} stroke="#f3c14b" strokeWidth={2.5} listening={false} />}
      {elev !== 0 && (
        <Text text={`${elev > 0 ? "+" : ""}${elev}`} fontSize={8} fill="rgba(255,255,255,0.85)" x={2} y={2} listening={false} />
      )}
    </Group>
  );
}

const imageCache = new Map<string, HTMLImageElement>();

function SpriteNode({ url, ghost }: { url: string; ghost: boolean }) {
  const [, bump] = useState(0);
  const img = imageCache.get(url) ?? null;
  useEffect(() => {
    if (imageCache.has(url)) return;
    const el = new window.Image();
    el.onload = () => {
      imageCache.set(url, el);
      bump((n) => n + 1); // async: re-render once decoded
    };
    el.src = url;
  }, [url]);
  if (!img) return null;
  return <KImage image={img} width={TILE_PX} height={TILE_PX} opacity={ghost ? 0.55 : 1} listening={false} />;
}
