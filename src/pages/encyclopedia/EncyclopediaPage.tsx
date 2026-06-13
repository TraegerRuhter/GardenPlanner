import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { Difficulty, Plant, PlantCategory } from "../../types/models";
import { useAppStore } from "../../store/appStore";
import { SpriteImg } from "../../components/SpriteImg";
import { PlantSearchModal } from "../../components/PlantSearchModal";
import { Badge } from "../../components/Badge";
import { badgeTone } from "../../components/badgeTone";

type SortKey = "name" | "dtm" | "difficulty";
const DIFF_ORDER: Record<Difficulty, number> = { easy: 0, moderate: 1, hard: 2 };

const CATEGORY_LABELS: Record<PlantCategory, string> = {
  vegetable: "Vegetables",
  herb: "Herbs",
  fruit: "Fruits",
  flower: "Flowers",
  cover_crop: "Cover Crops",
  shrub: "Shrubs",
  tree: "Trees",
};

const FILTERS = [
  { key: "cool", label: "Cool-season", icon: "❄️" },
  { key: "summer", label: "Warm-season", icon: "☀️" },
  { key: "fast", label: "Fast (≤50 days)", icon: "⚡" },
  { key: "container", label: "Container-friendly", icon: "🪴" },
  { key: "easy", label: "Beginner-friendly", icon: "👍" },
  { key: "shade", label: "Part-shade OK", icon: "⛅" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function matches(p: Plant, f: FilterKey): boolean {
  switch (f) {
    case "cool":
      return p.tags.includes("cool-season");
    case "summer":
      return p.tags.includes("summer");
    case "fast":
      return p.daysToMaturity.max <= 50;
    case "container":
      return p.tags.includes("container-friendly");
    case "easy":
      return p.difficulty === "easy";
    case "shade":
      return p.sunHoursMin < 6;
  }
}

export function EncyclopediaPage() {
  const plants = useLiveQuery(() => db.catalog_plants.toArray());
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Set<FilterKey>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<PlantCategory | "all">("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [showSearch, setShowSearch] = useState(false);
  const apiKey = useAppStore((s) => s.settings.perenualApiKey);

  const shown = useMemo(() => {
    if (!plants) return [];
    const q = search.trim().toLowerCase();
    const out = plants.filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (
        q &&
        !p.commonName.toLowerCase().includes(q) &&
        !p.scientificName.toLowerCase().includes(q) &&
        !p.tags.some((t) => t.includes(q))
      )
        return false;
      for (const f of active) if (!matches(p, f)) return false;
      return true;
    });
    out.sort((a, b) =>
      sort === "name"
        ? a.commonName.localeCompare(b.commonName)
        : sort === "dtm"
          ? a.daysToMaturity.min - b.daysToMaturity.min
          : DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty],
    );
    return out;
  }, [plants, search, active, categoryFilter, sort]);

  const categoryCounts = useMemo(() => {
    if (!plants) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const p of plants) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return counts;
  }, [plants]);

  function toggle(f: FilterKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Plant Encyclopedia</h1>
        {apiKey && (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="rounded-lg bg-[var(--color-canopy)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            + Search Online
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
        {plants ? `${plants.length} plants in your catalog` : "Loading…"}
        {!apiKey && " — add a Perenual API key in Settings to search online databases"}
      </p>

      {showSearch && apiKey && (
        <PlantSearchModal
          apiKey={apiKey}
          onClose={() => setShowSearch(false)}
          onImported={() => {}}
        />
      )}

      {/* Search + Sort */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, species, or tag…"
            aria-label="Search plants"
            className="w-full rounded-lg border border-[var(--color-paper-deep)] bg-white/60 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--color-canopy)] dark:bg-black/20"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort plants"
          className="rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-3 py-2 text-sm dark:bg-black/20"
        >
          <option value="name">Sort by Name</option>
          <option value="dtm">Sort by Days to Maturity</option>
          <option value="difficulty">Sort by Difficulty</option>
        </select>
      </div>

      {/* Category tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Categories">
        <button
          type="button"
          onClick={() => setCategoryFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            categoryFilter === "all"
              ? "bg-[var(--color-canopy)] text-white"
              : "bg-[var(--color-paper-deep)] text-[var(--color-ink-soft)] hover:opacity-80"
          }`}
        >
          All ({plants?.length ?? 0})
        </button>
        {(Object.keys(CATEGORY_LABELS) as PlantCategory[]).map((cat) => {
          const count = categoryCounts.get(cat) ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? "bg-[var(--color-canopy)] text-white"
                  : "bg-[var(--color-paper-deep)] text-[var(--color-ink-soft)] hover:opacity-80"
              }`}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* Quick filters */}
      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Quick filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => toggle(f.key)}
            aria-pressed={active.has(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active.has(f.key)
                ? "bg-[var(--color-canopy)] text-white"
                : "bg-[var(--color-paper-deep)] text-[var(--color-ink-soft)] hover:opacity-80"
            }`}
          >
            <span aria-hidden>{f.icon}</span> {f.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {!plants ? (
        <p className="py-8 text-center text-[var(--color-ink-soft)]">Loading catalog…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-paper-deep)] p-8 text-center">
          <p className="text-lg font-medium text-[var(--color-ink-soft)]">No plants match your filters</p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Try adjusting your search or removing some filters.
          </p>
          {(active.size > 0 || categoryFilter !== "all" || search) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setActive(new Set()); setCategoryFilter("all"); }}
              className="mt-3 rounded-lg bg-[var(--color-paper-deep)] px-4 py-2 text-sm font-medium hover:opacity-80"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
            Showing {shown.length} plant{shown.length !== 1 ? "s" : ""}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/encyclopedia/${p.id}`}
                  className="card-hover flex h-full flex-col items-center gap-2 rounded-xl border border-[var(--color-paper-deep)] bg-white/50 p-3 text-center hover:border-[var(--color-canopy)] dark:bg-white/5"
                >
                  <SpriteImg plant={p} stage="harvest" size={64} />
                  <span className="font-semibold leading-tight">{p.commonName}</span>
                  <span className="text-[10px] capitalize text-[var(--color-ink-soft)]">{p.category.replace("_", " ")}</span>
                  <span className="flex flex-wrap justify-center gap-1">
                    <Badge tone={badgeTone.sun}>
                      {p.sun === "full" ? "☀ Full sun" : p.sun === "partial" ? "⛅ Part sun" : "☁ Shade"}
                    </Badge>
                    <Badge tone={badgeTone.water}>💧 {p.waterNeed}</Badge>
                    <Badge tone={badgeTone.neutral}>
                      {p.daysToMaturity.min}–{p.daysToMaturity.max} days
                    </Badge>
                    {p.daysToMaturity.max <= 50 && <Badge tone={badgeTone.good}>⚡ Fast</Badge>}
                    <Badge
                      tone={p.difficulty === "easy" ? badgeTone.good : badgeTone.neutral}
                    >
                      {p.difficulty === "easy" ? "👍 Easy" : p.difficulty === "moderate" ? "Moderate" : "Advanced"}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
