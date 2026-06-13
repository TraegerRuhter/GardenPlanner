/**
 * §12 Designer palette: a compact, adaptable tool dock. Each section
 * (Tools, Plants, Structures, Hardscape, Water) is a collapsible panel that
 * can be reordered by dragging its grip — Photoshop-style. The Plants panel
 * adds a search box and an internal scroll so the (now large) catalog no
 * longer swamps the sidebar. Layout — panel order and which panels are
 * collapsed — is remembered in localStorage so it survives reloads.
 */

import { useEffect, useMemo, useState } from "react";
import type { Plant, StructureKind } from "../../types/models";
import { SpriteImg } from "../../components/SpriteImg";
import { HARDSCAPES, STRUCTURES, WATER, type Tool } from "./palette";

const LS_KEY = "gp.designer.palette.v1";

interface PaletteLayout {
  order: string[];
  collapsed: Record<string, boolean>;
}

function loadLayout(): PaletteLayout {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as PaletteLayout;
  } catch {
    /* corrupt or unavailable storage — fall back to defaults */
  }
  return { order: [], collapsed: {} };
}

/** Remembers panel order + collapsed state, reconciled against current ids. */
function usePaletteLayout(ids: string[]) {
  const [layout, setLayout] = useState<PaletteLayout>(() => {
    const saved = loadLayout();
    const order = [
      ...saved.order.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !saved.order.includes(id)),
    ];
    return { order, collapsed: saved.collapsed };
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(layout));
    } catch {
      /* storage full or blocked — keep state in memory only */
    }
  }, [layout]);

  const toggle = (id: string) =>
    setLayout((l) => ({ ...l, collapsed: { ...l.collapsed, [id]: !l.collapsed[id] } }));

  const setAll = (val: boolean) =>
    setLayout((l) => ({ ...l, collapsed: Object.fromEntries(ids.map((id) => [id, val])) }));

  const move = (dragId: string, overId: string) =>
    setLayout((l) => {
      if (dragId === overId) return l;
      const order = [...l.order];
      const from = order.indexOf(dragId);
      const to = order.indexOf(overId);
      if (from < 0 || to < 0) return l;
      order.splice(from, 1);
      order.splice(to, 0, dragId);
      return { ...l, order };
    });

  return { order: layout.order, collapsed: layout.collapsed, toggle, setAll, move };
}

interface PanelDef {
  id: string;
  label: string;
  count: number;
  render: () => React.ReactNode;
}

export function CanvasToolbar({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  const tools: { t: Tool; label: string; icon: string; title: string }[] = [
    { t: { t: "select" }, label: "Select", icon: "👆", title: "Select a tile" },
    { t: { t: "erase" }, label: "Erase", icon: "🧹", title: "Erase a tile" },
    { t: { t: "elev_up" }, label: "Raise", icon: "⬆", title: "Raise tile +5 cm" },
    { t: { t: "elev_down" }, label: "Lower", icon: "⬇", title: "Lower tile −5 cm" },
  ];

  return (
    <div className="mb-2 flex justify-center">
      <div
        role="toolbar"
        aria-label="Tile tools"
        className="inline-flex items-center gap-1 rounded-xl bg-[var(--color-ink)]/85 p-1 shadow-md ring-1 ring-black/20 backdrop-blur"
      >
        {tools.map((item) => {
          const active = tool.t === item.t.t;
          return (
            <button
              key={item.t.t}
              type="button"
              aria-pressed={active}
              onClick={() => setTool(item.t)}
              title={item.title}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? "bg-[var(--color-canopy)] text-white"
                  : "text-[var(--color-paper)] hover:bg-white/15"
              }`}
            >
              {item.icon} {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DesignerPalette({
  plants,
  tool,
  setTool,
}: {
  plants: Plant[];
  tool: Tool;
  setTool: (t: Tool) => void;
}) {
  const panels: PanelDef[] = [
    {
      id: "plants",
      label: "Plants",
      count: plants.length,
      render: () => <PlantPalette plants={plants} tool={tool} setTool={setTool} />,
    },
    {
      id: "structures",
      label: "Structures",
      count: Object.keys(STRUCTURES).length,
      render: () => (
        <div className="flex flex-col gap-1">
          {(Object.keys(STRUCTURES) as StructureKind[]).map((k) => (
            <ToolBtn key={k} active={tool.t === "structure" && tool.kind === k} onClick={() => setTool({ t: "structure", kind: k })}>
              {STRUCTURES[k].glyph} {STRUCTURES[k].label}
            </ToolBtn>
          ))}
        </div>
      ),
    },
    {
      id: "hardscape",
      label: "Hardscape",
      count: Object.keys(HARDSCAPES).length,
      render: () => (
        <div className="flex flex-col gap-1">
          {(Object.keys(HARDSCAPES) as Array<keyof typeof HARDSCAPES>).map((k) => (
            <ToolBtn key={k} active={tool.t === "hardscape" && tool.kind === k} onClick={() => setTool({ t: "hardscape", kind: k })}>
              <span className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: HARDSCAPES[k].color }} />
              {HARDSCAPES[k].label}
            </ToolBtn>
          ))}
        </div>
      ),
    },
    {
      id: "water",
      label: "Water",
      count: Object.keys(WATER).length,
      render: () => (
        <div className="flex flex-col gap-1">
          {(Object.keys(WATER) as Array<keyof typeof WATER>).map((k) => (
            <ToolBtn key={k} active={tool.t === "water" && tool.kind === k} onClick={() => setTool({ t: "water", kind: k })}>
              {WATER[k].glyph} {WATER[k].label}
            </ToolBtn>
          ))}
        </div>
      ),
    },
  ];

  const ids = panels.map((p) => p.id);
  const { order, collapsed, toggle, setAll, move } = usePaletteLayout(ids);
  const byId = new Map(panels.map((p) => [p.id, p]));
  const ordered = order.map((id) => byId.get(id)).filter((p): p is PanelDef => !!p);
  const allCollapsed = ids.every((id) => collapsed[id]);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <aside className="order-2 flex shrink-0 flex-col gap-2 lg:order-1 lg:w-56" aria-label="Tile palette">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">Palette</span>
        <button
          type="button"
          onClick={() => setAll(!allCollapsed)}
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-deep)]/60"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      {ordered.map((panel) => (
        <PalettePanel
          key={panel.id}
          panel={panel}
          collapsed={!!collapsed[panel.id]}
          dragging={dragId === panel.id}
          onToggle={() => toggle(panel.id)}
          onDragStart={() => setDragId(panel.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={() => {
            if (dragId && dragId !== panel.id) move(dragId, panel.id);
          }}
        />
      ))}
    </aside>
  );
}

function PalettePanel({
  panel,
  collapsed,
  dragging,
  onToggle,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  panel: PanelDef;
  collapsed: boolean;
  dragging: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      className={`rounded-xl border border-[var(--color-paper-deep)] bg-white/40 dark:bg-white/5 ${
        dragging ? "opacity-50 ring-2 ring-[var(--color-canopy)]" : ""
      }`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="cursor-grab select-none text-sm leading-none text-[var(--color-ink-soft)] active:cursor-grabbing"
          title="Drag to reorder"
          aria-hidden
        >
          ⠿
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex flex-1 items-center gap-1 text-left text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]"
        >
          <span className={`inline-block text-[10px] transition-transform ${collapsed ? "" : "rotate-90"}`}>▸</span>
          {panel.label}
          <span className="ml-auto rounded-full bg-[var(--color-paper-deep)]/70 px-1.5 text-[10px] font-medium normal-case">
            {panel.count}
          </span>
        </button>
      </div>
      {!collapsed && <div className="px-2 pb-2">{panel.render()}</div>}
    </div>
  );
}

function PlantPalette({
  plants,
  tool,
  setTool,
}: {
  plants: Plant[];
  tool: Tool;
  setTool: (t: Tool) => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      term
        ? plants.filter(
            (p) =>
              p.commonName.toLowerCase().includes(term) ||
              p.scientificName.toLowerCase().includes(term),
          )
        : plants,
    [plants, term],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${plants.length} plants…`}
        aria-label="Search plants"
        className="w-full rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-1 text-xs dark:bg-black/20"
      />
      {filtered.length === 0 ? (
        <p className="px-1 py-2 text-xs text-[var(--color-ink-soft)]">No plants match “{q}”.</p>
      ) : (
        <div className="grid max-h-72 grid-cols-5 gap-1 overflow-y-auto pr-0.5 lg:grid-cols-4">
          {filtered.map((p) => {
            const active = tool.t === "plant" && tool.plantId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                title={p.commonName}
                aria-pressed={active}
                onClick={() => setTool({ t: "plant", plantId: p.id })}
                className={`rounded-lg p-1 ${
                  active
                    ? "bg-[var(--color-canopy)]/30 ring-2 ring-[var(--color-canopy)]"
                    : "bg-white/40 hover:bg-[var(--color-paper-deep)]/60 dark:bg-white/5"
                }`}
              >
                <SpriteImg plant={p} stage="harvest" size={32} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-left text-xs font-medium ${
        active ? "bg-[var(--color-canopy)] text-white" : "bg-white/40 hover:bg-[var(--color-paper-deep)]/60 dark:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}
