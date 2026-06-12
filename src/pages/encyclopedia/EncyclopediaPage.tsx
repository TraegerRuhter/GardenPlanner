/**
 * §10 Encyclopedia: searchable, filterable catalog list. Filters: category,
 * sun, water, frost tolerance, difficulty, fast (DTM ≤ 50), container tag.
 * Sort: name | days-to-maturity | difficulty. Zone-suitability filter joins
 * in Phase 1 when ClimateProfiles exist.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/db";
import type { Difficulty, Plant } from "../../types/models";
import { SpriteImg } from "../../components/SpriteImg";
import { Badge } from "../../components/Badge";
import { badgeTone } from "../../components/badgeTone";

type SortKey = "name" | "dtm" | "difficulty";
const DIFF_ORDER: Record<Difficulty, number> = { easy: 0, moderate: 1, hard: 2 };

const FILTERS = [
  { key: "cool", label: "Cool-season" },
  { key: "summer", label: "Warm-season" },
  { key: "fast", label: "Fast (≤50d)" },
  { key: "container", label: "Container" },
  { key: "easy", label: "Easy" },
  { key: "shade", label: "Part-shade OK" },
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
  const plants = useLiveQuery(() => db.catalog_plants.toArray(), []);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Set<FilterKey>>(new Set());
  const [sort, setSort] = useState<SortKey>("name");

  const shown = useMemo(() => {
    if (!plants) return [];
    const q = search.trim().toLowerCase();
    const out = plants.filter((p) => {
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
  }, [plants, search, active, sort]);

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
      <h1 className="mb-4 text-2xl font-bold">Encyclopedia</h1>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search plants, names, tags…"
          aria-label="Search plants"
          className="w-full rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-canopy)] sm:w-72 dark:bg-black/20"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort plants"
          className="rounded-lg border border-[var(--color-paper-deep)] bg-white/60 px-2 py-2 text-sm dark:bg-black/20"
        >
          <option value="name">Sort: name</option>
          <option value="dtm">Sort: days to maturity</option>
          <option value="difficulty">Sort: difficulty</option>
        </select>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => toggle(f.key)}
            aria-pressed={active.has(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active.has(f.key)
                ? "bg-[var(--color-canopy)] text-white"
                : "bg-[var(--color-paper-deep)] text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-deep)]/70"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!plants ? (
        <p className="text-[var(--color-ink-soft)]">Loading catalog…</p>
      ) : shown.length === 0 ? (
        <p className="text-[var(--color-ink-soft)]">No plants match.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => (
            <li key={p.id}>
              <Link
                to={`/encyclopedia/${p.id}`}
                className="flex h-full flex-col items-center gap-2 rounded-xl border border-[var(--color-paper-deep)] bg-white/50 p-3 text-center hover:border-[var(--color-canopy)] dark:bg-white/5"
              >
                <SpriteImg plant={p} stage="harvest" size={64} />
                <span className="font-semibold leading-tight">{p.commonName}</span>
                <span className="flex flex-wrap justify-center gap-1">
                  <Badge tone={badgeTone.sun}>
                    {p.sun === "full" ? "☀ full" : p.sun === "partial" ? "⛅ part" : "☁ shade"}
                  </Badge>
                  <Badge tone={badgeTone.water}>💧 {p.waterNeed}</Badge>
                  <Badge tone={badgeTone.neutral}>
                    {p.daysToMaturity.min}–{p.daysToMaturity.max}d
                  </Badge>
                  {p.daysToMaturity.max <= 50 && <Badge tone={badgeTone.good}>fast</Badge>}
                  <Badge
                    tone={p.difficulty === "easy" ? badgeTone.good : badgeTone.neutral}
                  >
                    {p.difficulty}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
