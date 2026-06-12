# PLOT — Garden Planner PWA

**P**lanting, **L**ayout & **O**perations **T**racker: an offline-first,
installable garden planner. A living garden model (a tile grid with real
plants at real growth stages) tied to a climate-aware planting engine
(location, frost dates, sun exposure), so the advice is specific to this
site, this bed, this day.

Built section-by-section against **[docs/SPEC.md](docs/SPEC.md)** (v1.2),
following its implementation protocol (§0.1): one phase per turn, domain
engines ship with unit tests, all network behind cached adapters.

## Stack

Vite · React 19 · TypeScript (strict) · Zustand · Dexie (IndexedDB) ·
React Router · Tailwind CSS 4 · Konva · vite-plugin-pwa (Workbox) · Vitest

## Commands

```bash
npm install
npm run dev       # dev server
npm run build     # type-check + production build (PWA assets generated here)
npm test          # vitest run (128 tests)
npm run lint      # eslint
npx vitest run --config vitest.smoke.config.ts   # real-network Open-Meteo smoke test
python3 scripts/make_icons.py                    # regenerate PWA icons
```

## Build phases (SPEC §29)

| Phase | Scope | Status |
| ----- | ----- | ------ |
| **Scaffold** | Project init, all §7/§31 model types, Dexie stores, PWA shell, tab routing, tokens, icons | ✅ |
| **0 — Skeleton & data** | 15-plant catalog, encyclopedia (search/filter/detail), sprite system, settings persistence | ✅ |
| **1 — Climate & calendar** | ClimateEngine (frost p50/p10, normals, zone), PlantingWindowEngine + band chart, Open-Meteo adapters + cache, location setup w/ manual fallback, waterlogging risk | ✅ |
| **2 — Designer core** | Konva grid (pan/zoom), satellite areas, orientation, full palette, elevation, placement checks, SunModel + overlay, accessible mirror | ✅ |
| **3 — Tracking & diagnostics** | Stage projection, auto-advance (hybrid GDD), manual advance/rollback → 6 diagnostic trees with auto-checks, harvest logging, daily pass | ✅ |
| **4 — Plan-ahead & care** | Plant Next + succession→grid, RecommendationEngine, deficit-aware WateringEngine + feeds, Tasks, seed stash, §32.7 settings | ✅ |
| **5 — Depth & polish** | Export/import (JSON + tidy CSVs), photo journal, SW runtime caching, catalog → 29 plants, dark theme | ✅ core |
| **Backlog** | see below | — |

### Phase 5+ backlog (spec'd, not yet built)

Remaining §28.2 catalog tranches (~70 plants) · varietal/recipe content for
tranche-2 plants · relational pests/diseases + sightings (§31.3) · aerial
underlay w/ two-point calibration (§31.5) · rotation view overlay (§20) ·
`instance_daily.csv` weather join (§31.4) · Time Machine scrubber (§32.3) ·
analytics dashboard (§32.4) · saturation overlay (§32.5) · field-mode layout
+ voice memo (§32.1) · juice/ambient FX (§32.6) · SW update toast (§22) ·
notifications via SW (§19) · Playwright smoke flows · sync backend stub,
3D viewer, hardware refs (Phase 6).

## Builder decisions log (per SPEC §0.1 rule 6 / §30)

| # | Decision | Choice | Why |
| - | -------- | ------ | --- |
| §6 | IndexedDB wrapper | **Dexie** | typed tables, compound/multi-entry indexes, ergonomic queries for the append-heavy stores §23 says must be DB-queried |
| §30.1 | Grid renderer | **Konva**, lazy-loaded | spec-recommended; Canvas perf at 64×64; §24 mirror table carries a11y |
| §30.2 | Stage pacing | **hybrid** | GDD when the plant has a base temp + cached daily actuals (forecast `past_days=92`); calendar floor under partial coverage, calendar fallback offline |
| §30.3 | Sync backend | stub | spec default; local store authoritative |
| §30.4 | Frost percentiles | "safe" = 10% residual risk | spring p10 later than median, fall p10 earlier; labeled in Calendar header + Settings |
| §30.5 | Sprites | programmatic 16×16 pixel maps | 11 stage maps + root-crop overrides, category palettes, per-plant accents, canvas-rendered + cached; bespoke art can replace the maps file without touching call sites |
| §30.6 | Sun sampling | solstice + equinox, 30-min steps | spec default; recomputed on layout change, only while the overlay is on |
| §30.7 | Notifications | in-app only for now | iOS web push can't be depended on (spec's own caveat); SW push is backlog |
| §30.8 | Catalog values | mainstream references, internally consistent | enforced by the catalog integrity test suite |
| §31.8.9 | Waterlogging auto-advance pause | OFF | warning + diagnostics path is primary |
| §31.8.11 | Drainage constants | fast 40 / moderate 20 / poor 8 mm·day | exported as tunables in `engines/waterlogging.ts` |
| §7.10 | `InstanceStatus` | added `"planned"` | §12.6/§15 ghosts had no state in the §7.10 union — flagged reconciliation |
| §7.12 | Default units | imperial (display only) | storage always metric (§0) |
| §22 | SW updates | `autoUpdate` | switches to prompt+toast when the toast UI lands |
| schema | `tasks.done` not indexed | IDB can't index booleans | query by `dueOn` range |
| repo | App in `garden-planner/` | | keeps the PWA clear of the PyCitySchools coursework at repo root |

## Layout

```
docs/SPEC.md            the governing specification (v1.2)
scripts/                icon generator + real-network smoke test
src/
  types/                §7+§31 data contracts, §8 adapter interfaces
  db/                   Dexie schema (§23) + repos: seed, climate, garden,
                        instances, care, succession
  engines/              pure, tested: climate, plantingWindows, waterlogging,
                        placement, sunModel, growth, diagnostics, watering,
                        recommendation, inventory, schedule
  adapters/             Open-Meteo behind an IndexedDB cache (§8)
  catalog/              29 plants, 12 templates, 10 families, 30 varietals,
                        16 recipes, 29 companions, 6 diagnostic trees
  sprites/              16×16 stage pixel maps + renderer (§13.5)
  pages/                Encyclopedia, Calendar, Designer, Tracker,
                        Plant Next, Suggest, Tasks, Settings
  components/           WindowChart, LocationSetup, sprites, badges
```
