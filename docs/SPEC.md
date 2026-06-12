# Garden Planner PWA — Build Brief & Technical Specification

**Working title:** PLOT (Planting, Layout & Operations Tracker). Rename at will.
**Audience:** an AI coding agent (and the human reviewing its output).
**Status:** v1.2 specification, written to be buildable without further clarification.
**Changelog:** v1.1 added Section 0.1 (implementation protocol) and Section 31 (seed inventory, soil drainage & waterlogging, relational pests/diseases, harvest logging & analytics export, aerial underlay, hardware references). v1.2 adds Section 32 (Field "dirty hands" mode, embedded 3D hardware viewer, Time Machine scrubber, in-app analytics dashboard, environmental feedback overlays, and a consolidated presentation/feel/performance settings surface with animation guardrails). All v1.2 features are back-half/polish and assume the Phase 0 to 3 core already ships.

---

## 0. How to use this document

This is a complete description of a single-page, offline-capable Progressive Web App for planning and managing a garden. It is written so a coding agent can implement it section by section. Sections 1 to 6 set scope and architecture. Section 7 is the data layer and is the single most important part: get the models right and the rest follows. Sections 8 to 21 specify each feature module. Sections 22 to 26 are cross-cutting (PWA, persistence, accessibility, performance). Section 27 is an algorithms appendix with pseudocode. Section 28 is seed data. Section 29 is a phased roadmap. Section 30 is the list of decisions left to the builder.

Conventions used below:
- **[BRIEF]** marks a feature explicitly requested by the product owner.
- **[ADDED]** marks something not in the original brief that the owner should know was added because it materially affects success.
- Field names are written in `camelCase` to match the recommended stack.
- All measurements are stored in metric internally and rendered in the user's chosen unit system. Both unit systems must be first-class. **[ADDED]**

## 0.1 Implementation protocol (directive to the building agent)

Do not attempt to output the entire application in one pass. Output limits will clip a build this size, leaving broken, half-written files. Follow this protocol:

1. **Acknowledge first.** Confirm you have read this brief and restate the phase plan (Section 29) in one short list. Do not write code yet.
2. **Scaffold only, then stop.** Initialize the Vite + React + TypeScript project with the chosen state library (Zustand), the IndexedDB layer, the PWA plugin, Tailwind, and the tab-shell routing. Create the full TypeScript type file for every model in Section 7 and Section 31 (types only, no logic). Then stop and wait.
3. **Proceed one phase at a time, on command.** After scaffolding, wait for an explicit instruction to begin Phase 1. Build exactly one phase per turn. Within a phase, prefer to define a module's files (stubs/signatures) before filling them, so structure is visible early.
4. **Domain logic gets tests.** Every engine in the architecture (climate, planting windows, sun model, growth, diagnostics, watering, recommendation, waterlogging) ships with Vitest unit tests in the same turn it is written. The agronomy math must be verifiable.
5. **Keep network behind adapters.** Never call an external API directly from a component. Every fetch goes through a cached adapter with a manual fallback (Section 8).
6. **State your open-decision choices.** When you hit any item in Section 30, state the choice you made and why, in the turn you make it.
7. **No silent scope changes.** If something in the brief is ambiguous or conflicts, flag it and ask rather than guessing in a way that is hard to reverse.

---

## 1. Product vision

A gardener opens the app, sets a location, and immediately sees what they can plant right now and when each crop should go in. They lay out their actual garden on a tile grid that looks like a top-down pixel-art plot, drop in plants and structures, and the app tracks each planted thing through its growth stages over real calendar time. When a plant falls behind, they roll it back a stage and the app walks them through why. They get watering and feeding reminders, succession schedules for fast crops, variety and recipe deep-dives, and suggestions for what to grow given their specific site.

The core insight: most garden apps are either a static plant encyclopedia or a generic to-do list. This one ties a **living garden model** (the grid, with real plants at real growth stages) to a **climate-aware planting engine** (location, frost dates, sun exposure) so the advice is specific to this site, this bed, this day.

---

## 2. Goals, non-goals, constraints

### 2.1 MVP goals
1. Plant database with rich per-plant agronomic data and search/filter. **[BRIEF]**
2. Location-aware planting windows with a visual calendar chart. **[BRIEF]**
3. Tile-based 2D garden designer with plants, structures, and hardscape. **[BRIEF]**
4. Growth-stage tracking with auto-advance over time and per-stage graphics. **[BRIEF]**
5. Stage rollback that triggers a diagnostic flow. **[BRIEF]**
6. Saved gardens persisted locally and reopenable. **[BRIEF]**
7. Installable PWA, fully responsive from phone to desktop. **[BRIEF]**

### 2.2 Stretch goals
8. "Plant next" / succession scheduling piped into the grid. **[BRIEF]**
9. Variety and recipe deep-dives per plant. **[BRIEF]**
10. Recommendation engine for site-appropriate plants. **[BRIEF]**
11. Watering and fertilizing parameters and reminders. **[BRIEF]**
12. Sun/shade modeling from orientation, elevation, and shadow casting. **[ADDED]**
13. Companion-planting and crop-rotation warnings. **[ADDED]**
14. Photo journal per planted instance. **[ADDED]**

### 2.3 Non-goals (explicitly out of scope for v1)
- Multi-user accounts, social sharing, marketplaces.
- A mandatory backend. The app must work fully offline with local storage; any cloud sync is optional and additive (section 23).
- Plant-ID from photos (ML image classification). Stub the hook, do not build it.
- E-commerce or seed purchasing.

### 2.4 Hard constraints
- Offline-first. No network call may block a core workflow. Weather/geocoding degrade gracefully to cached or manual values.
- Responsive and touch-first. The grid designer must be usable with a finger on a phone and a mouse on a desktop.
- Performance: the grid must stay at 60fps interaction for plots up to 64x64 tiles with several hundred placed objects (section 25).
- Data ownership: all user data exportable and importable as JSON. No lock-in.

---

## 3. Personas and primary journeys

**Persona A, "New raised-bed gardener."** Has a 4x8 ft raised bed, knows little. Wants to be told what to plant, when, and where. Relies on recommendations, the calendar, and reminders.

**Persona B, "Experienced planner."** Manages several beds plus containers, plans succession and rotation, wants the grid to be precise (spacing, sun, companions) and the data to be deep.

**Journey 1 (onboarding to first plant):** open app, grant or skip location, app derives climate profile, user creates a garden, sizes a bed, taps "what can I plant now," picks a crop, app suggests placement respecting spacing and sun, user logs the planting date.

**Journey 2 (ongoing management):** user opens a saved garden, sees stages advanced since last visit, gets a watering reminder, notices a plant looks behind, rolls it back a stage, completes the diagnostic, applies a remedy task.

**Journey 3 (planning the next round):** user opens "Plant next," sees that a bed frees up in three weeks, schedules a succession of radishes and lettuce, and those land as ghost placements on the grid with future planting dates.

---

## 4. Glossary (so the builder gets the horticulture right)

Implement these as real, distinct concepts. Do not collapse them.

- **Hardiness zone (USDA or equivalent):** a band keyed to average annual minimum winter temperature; gates which perennials survive a site. Coarse, winter-survival only.
- **Heat zone:** complementary band keyed to days above ~30 C; gates heat tolerance. Optional but useful.
- **Last spring frost / first fall frost:** the dates bounding the frost-free growing window for a site, given as probabilistic dates (e.g., 50% and 10% risk). The backbone of planting windows.
- **Frost-free days / season length:** days between last spring frost and first fall frost.
- **Growing Degree Days (GDD):** accumulated heat units = sum over days of `max(0, (Tmax+Tmin)/2 - Tbase)`. Many crops mature on GDD, not calendar days. Tbase is crop-specific (commonly 10 C for warm crops, 4 to 5 C for cool crops).
- **Days to maturity (DTM):** typical days from sow (or transplant) to harvest under good conditions. A planning estimate, not a guarantee.
- **Direct sow vs transplant:** seed placed in the ground vs started indoors and moved out. Many crops support both; timing differs.
- **Hardening off:** acclimating indoor-started seedlings to outdoor conditions over ~7 to 10 days before transplant.
- **Bolting:** premature flowering/seed-set (lettuce, spinach, cilantro) triggered by heat or long days, ending edible quality.
- **Photoperiod sensitivity:** response to day length (e.g., short-day onions vs long-day onions). Affects regional suitability.
- **Succession planting:** repeated small sowings at intervals to spread harvest (classic for radish, lettuce, beans).
- **Companion / antagonist plants:** pairings that help (pest deterrence, nitrogen, shade) or hurt (competition, allelopathy) each other.
- **Crop rotation:** not planting the same plant family in the same bed in consecutive seasons, to limit disease and nutrient depletion.
- **Microclimate:** local deviation from the regional climate due to elevation, slope, aspect, structures, water bodies, and urban heat. A frost pocket in a low spot and a warm south wall are microclimates.
- **Aspect:** the compass direction a slope faces; affects sun and warmth.
- **Hydrozone:** a group of plants with similar water needs, watered together.
- **Square-foot gardening:** a layout method dividing a bed into 1 ft squares with a per-square plant count by crop.

---

## 5. System architecture

### 5.1 Shape
A client-only Progressive Web App is the default. Everything runs in the browser; all state persists in on-device storage. This satisfies offline-first and data-ownership constraints with the least complexity. An optional thin sync backend is described in section 23 but must not be required.

```
┌──────────────────────────── Browser (PWA) ────────────────────────────┐
│  UI layer (React components, tabbed shell)                            │
│  ├─ Encyclopedia · Calendar · Designer · Tracker · PlantNext · Suggest │
│  State layer (store + selectors)                                      │
│  Domain services (pure logic, no UI):                                 │
│  ├─ ClimateEngine   ├─ PlantingWindowEngine   ├─ SunModel             │
│  ├─ GrowthEngine    ├─ DiagnosticsEngine      ├─ RecommendationEngine │
│  ├─ ScheduleEngine  ├─ WateringEngine                                 │
│  Persistence (IndexedDB via wrapper) + export/import (JSON)           │
│  PWA shell (service worker, manifest, install, notifications)         │
│  Adapters (network, behind interfaces, all optional/cached):          │
│  ├─ WeatherAdapter  ├─ GeocodeAdapter  ├─ HardinessAdapter            │
└────────────────────────────────────────────────────────────────────────┘
        │ (optional)                         │ (optional)
   Weather API                          Sync backend
```

### 5.2 Key architectural rules
- **Domain services are pure and testable.** They take data in and return data out, no DOM, no fetch. This is what lets the agent unit-test the horticulture logic.
- **Network is always behind an adapter with a cache and a manual fallback.** If the weather API is down, the user can type frost dates by hand.
- **The garden model is the source of truth at runtime;** derived views (calendar, sun map, schedule) are computed selectors over it, memoized.

---

## 6. Technology stack (recommended, with rationale)

- **Language:** TypeScript, strict mode. The data models below are the type definitions; do not weaken them to `any`.
- **Framework:** React (18+) with Vite. Mature PWA tooling, owner has prior React experience.
- **Routing:** a lightweight router (React Router) for tab deep-links and back-button behavior.
- **State:** Zustand or Redux Toolkit. Zustand preferred for low ceremony; persist middleware to IndexedDB.
- **Persistence:** IndexedDB via `idb` (or Dexie for query ergonomics). Not localStorage: data volume (gardens, instance logs, photos) exceeds localStorage limits and needs structured queries.
- **Grid rendering:** two viable paths, builder chooses (section 12.7):
  - Canvas via **PixiJS** or **Konva** for performance with many sprites and pan/zoom.
  - DOM/SVG grid for simplicity and accessibility on small plots.
  Recommendation: Canvas (Konva) for the plot, with an accessible list/table mirror of placed objects for screen readers.
- **Charts:** a declarative chart lib (Recharts or visx) for the planting-window timeline and stage timelines. The planting-window chart is essentially a Gantt; if the lib lacks one, render custom horizontal bands on an SVG.
- **Styling:** Tailwind CSS plus a small token set (section 21). Pixel-art aesthetic via a sprite system, not CSS art.
- **PWA:** `vite-plugin-pwa` (Workbox under the hood) for service worker, manifest, precaching, and runtime caching.
- **Dates:** a tz-aware date lib (Luxon or date-fns-tz). All horticulture math is date-heavy and DST/timezone bugs are easy.
- **IDs:** UUID v4 for all entities.
- **Testing:** Vitest for domain services (the agronomy math must have tests), Playwright for a couple of end-to-end smoke flows.

---

## 7. Data models

These are the contract. Implement as TypeScript interfaces and as IndexedDB stores. JSON-schema-style descriptions follow; types are illustrative.

### 7.1 Catalog vs user data
Split the data into two layers:
- **Catalog (read-mostly, shipped with the app):** `Plant`, `Varietal`, `Recipe`, `GrowthStageTemplate`, `CompanionRelationship`, `DiagnosticTree`, `PlantFamily`. Seeded from bundled JSON; updatable via an app update or an optional remote pull.
- **User data (read/write, on device):** `Location`, `ClimateProfile`, `Garden`, `Tile`, `PlantInstance`, `StageEvent`, `Task`, `JournalEntry`, `Settings`.

### 7.2 PlantFamily
Used for crop rotation and shared pest/disease.
```ts
interface PlantFamily {
  id: string;              // "solanaceae"
  commonName: string;      // "Nightshade family"
  rotationGroup: string;   // "fruiting" | "leafy" | "root" | "legume" | "brassica" | ...
  notes?: string;
}
```

### 7.3 Plant (the central catalog entity)
Every field here drives a feature; none are decorative.
```ts
interface Plant {
  id: string;                         // "tomato"
  commonName: string;                 // "Tomato"
  scientificName: string;             // "Solanum lycopersicum"
  familyId: string;                   // -> PlantFamily
  category: PlantCategory;            // "vegetable" | "herb" | "fruit" | "flower" | "cover_crop" | "shrub" | "tree"
  lifecycle: "annual" | "biennial" | "perennial";
  // --- Climate gating ---
  hardinessZones: { min: number; max: number };   // USDA numeric, e.g. 2..11 (perennials); annuals: tolerance band
  heatTolerance: "low" | "medium" | "high";
  frostTolerance: "tender" | "half_hardy" | "hardy"; // gates relation to frost dates
  waterloggingSensitivity: "low" | "medium" | "high"; // §31.2; high = lavender/rosemary/tomato
  seedViabilityYears?: number;        // typical seed longevity; default for SeedPacket (§31.1)
  minSoilTempC: number;               // germination floor, e.g. tomato ~15.5
  optSoilTempC?: { min: number; max: number };
  gddBaseTempC?: number;              // for GDD maturity, e.g. 10
  gddToMaturity?: number;             // optional alternative to DTM
  daysToMaturity: { min: number; max: number; from: "sow" | "transplant" };
  photoperiod?: "day_neutral" | "short_day" | "long_day";
  // --- Placement / site ---
  sun: "full" | "partial" | "shade";  // full >= 6h direct, partial 3-6h, shade < 3h
  sunHoursMin: number;                // numeric for sun-map comparison, e.g. 6
  waterNeed: "low" | "medium" | "high";
  waterMmPerWeek?: { min: number; max: number }; // for watering engine
  soilPh: { min: number; max: number };
  soilPreference?: string[];          // ["well-drained","loamy"]
  matureHeightCm: { min: number; max: number };   // drives shadow casting
  matureSpreadCm: { min: number; max: number };
  // --- Spacing ---
  spacing: {
    inRowCm: number;
    betweenRowCm: number;
    squareFootCount?: number;         // plants per 1 ft square if using SFG
  };
  // --- Planting method/timing rules (relative to frost dates) ---
  plantingMethods: Array<"direct_sow" | "indoor_start" | "transplant">;
  sowRules: {
    // weeks relative to last spring frost (negative = before). Null if not applicable.
    indoorStartWeeksFromLastFrost?: { min: number; max: number };   // e.g. -8..-6
    directSowWeeksFromLastFrost?: { min: number; max: number };     // e.g. 1..3
    transplantWeeksFromLastFrost?: { min: number; max: number };    // e.g. 1..2
    fallWeeksFromFirstFrost?: { min: number; max: number };         // for fall/cool crops, before first frost
    plantingDepthCm: number;
    germinationDays: { min: number; max: number };
  };
  // --- Lifecycle modeling ---
  stageTemplateId: string;            // -> GrowthStageTemplate
  // --- Care ---
  fertilization: {
    schedule: Array<{
      atStage: StageKey;              // when to feed
      type: string;                   // "balanced 10-10-10" | "nitrogen" | "compost top-dress"
      intervalDays?: number;          // repeat cadence if ongoing
      notes?: string;
    }>;
  };
  supportStructures?: Array<"trellis" | "cage" | "stake" | "mound" | "row_cover">; // hints for grid structures
  // --- Pests / disease / companions ---
  commonPests: string[];              // denormalized convenience list; cross-warnings derive from Pest.hosts (§31.3)
  commonDiseases: string[];           // denormalized convenience list; see Disease.hosts (§31.3)
  // companions handled via CompanionRelationship to keep it relational
  // --- Outputs ---
  harvest: {
    windowDays?: { min: number; max: number };   // how long harvest lasts once it starts
    yieldPerPlant?: string;                       // "3-5 kg" (human-readable ok)
    indicators: string[];                         // "fruit fully colored, slight give"
    method?: string;
  };
  // --- Content ---
  varietalIds: string[];              // -> Varietal[]
  recipeIds: string[];                // -> Recipe[]
  difficulty: "easy" | "moderate" | "hard";
  description: string;
  iconKey: string;                    // base sprite key; stages resolve to iconKey + stage
  tags: string[];                     // "container-friendly","pollinator","fast","shade-tolerant"
}
```

### 7.4 Varietal
```ts
interface Varietal {
  id: string;
  plantId: string;
  name: string;                 // "Sungold"
  description: string;
  daysToMaturity?: { min: number; max: number }; // overrides plant if present
  traits: string[];             // "cherry","indeterminate","disease-resistant VFN","heat-tolerant"
  colorHex?: string;            // tints the sprite if desired
  flavorNotes?: string;
  bestFor?: string[];           // "containers","short-season","fresh eating"
}
```

### 7.5 Recipe
```ts
interface Recipe {
  id: string;
  title: string;
  plantIds: string[];           // featured ingredients linking back to plants
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: Array<{ item: string; quantity: number; unit?: string; plantId?: string }>;
  steps: string[];
  usesStage?: StageKey;         // e.g. uses "harvest" produce; or "thinnings" for microgreens
  tags: string[];              // "preserving","quick","vegetarian"
}
```

### 7.6 GrowthStageTemplate and stages
The stage list is the spine of tracking. Use a canonical ordered set of stage keys; each template assigns typical durations.
```ts
type StageKey =
  | "planted"        // seed in ground / transplant set
  | "germination"    // (seed only) emergence underway
  | "sprout"         // cotyledons / first emergence above soil
  | "seedling"       // true leaves
  | "vegetative"     // active leafy growth
  | "budding"        // flower buds / heading
  | "flowering"      // (or "heading" for brassicas/lettuce)
  | "fruiting"       // fruit/pod/root sizing
  | "harvest"        // ready / harvesting
  | "senescence"     // spent / end of life
  | "dormant";       // perennials overwintering

interface GrowthStageTemplate {
  id: string;
  appliesTo: string;                 // plant id or family, for reuse
  // Ordered stages this plant actually passes through (subset of StageKey, in order)
  sequence: StageKey[];
  // Typical days each stage lasts under good conditions. Modeled on calendar days,
  // optionally scaled by GDD when climate data is present (section 13.3).
  stageDurations: Partial<Record<StageKey, { min: number; typical: number; max: number }>>;
  // Optional per-stage care prompts shown in the tracker
  stageCareHints?: Partial<Record<StageKey, string[]>>;
}
```

### 7.7 CompanionRelationship **[ADDED]**
```ts
interface CompanionRelationship {
  aPlantId: string;
  bPlantId: string;
  type: "beneficial" | "antagonistic";
  reason: string;               // "deters aphids" | "competes for nitrogen" | "allelopathic"
  strength: "weak" | "moderate" | "strong";
}
```

### 7.8 Location and ClimateProfile
```ts
interface Location {
  id: string;
  label: string;                 // "Home — Pacific City"
  lat: number;
  lon: number;
  elevationM?: number;
  source: "geolocation" | "geocode" | "manual";
}

interface ClimateProfile {
  id: string;
  locationId: string;
  hardinessZone?: string;        // "9a"
  lastSpringFrost: { p50: string; p10: string }; // ISO month-day or date; probabilistic
  firstFallFrost: { p50: string; p10: string };
  frostFreeDays?: number;
  // Monthly climate normals (for windows, GDD estimation, watering deficit)
  monthlyNormals?: Array<{
    month: number;               // 1..12
    tMinC: number;
    tMaxC: number;
    precipMm: number;
    etoMm?: number;              // reference evapotranspiration if available
  }>;
  microclimateNotes?: string;    // "coastal, mild summers, frequent fog, frost rare"
  derivedFrom: "api" | "manual" | "zone_default";
  fetchedAt?: string;
}
```

### 7.9 Garden, Tile, satellite areas **[grid model]**
A garden contains one or more **areas** (the main plot plus satellites). Each area is its own grid with its own position and orientation. **[BRIEF: satellite planting locations]**
```ts
interface Garden {
  id: string;
  name: string;                  // "Backyard 2026"
  locationId: string;
  unitSystem: "metric" | "imperial";
  // Whole-garden orientation: bearing in degrees that "up/north on screen" maps to.
  // 0 = screen-up is true north. Lets the user rotate the plot to reality. [BRIEF: orientation]
  northBearingDeg: number;
  areas: GardenArea[];
  createdAt: string;
  updatedAt: string;
}

interface GardenArea {
  id: string;
  name: string;                  // "Raised bed A", "Patio containers"
  kind: "in_ground" | "raised_bed" | "container_group" | "field";
  soilDrainage: "fast" | "moderate" | "poor"; // §31.2; combines with tile elevation for waterlogging risk
  // Position of this area's origin within the garden canvas (for satellite layout)
  origin: { x: number; y: number };   // in garden canvas units
  rotationDeg: number;                // area can be rotated independently of garden north
  grid: {
    cols: number;
    rows: number;
    cellSizeCm: number;               // real-world size of one tile edge (e.g. 30.48 = 1 ft)
  };
  tiles: Tile[];                      // sparse: only non-empty tiles stored
}

type TileContent =
  | { type: "empty" }
  | { type: "plant"; instanceId: string }              // -> PlantInstance
  | { type: "structure"; structure: StructureKind; heightCm: number }
  | { type: "hardscape"; hardscape: HardscapeKind }
  | { type: "water"; water: WaterFeatureKind };

type StructureKind = "trellis" | "cage" | "stake" | "mound" | "raised_edge" | "fence" | "arch" | "cold_frame" | "row_cover"; // [BRIEF: trellises, mounds + ADDED others]
type HardscapeKind = "path" | "rock" | "grass" | "mulch" | "paver" | "soil" | "gravel"; // [BRIEF: rocks, paths, grass]
type WaterFeatureKind = "drip_line" | "soaker_hose" | "sprinkler_head" | "rain_barrel" | "pond" | "spigot"; // [BRIEF: watering components]

interface Tile {
  col: number;
  row: number;
  elevationCm: number;            // relative elevation for slope/frost-pocket modeling [BRIEF: elevation]
  content: TileContent;
  // Derived (not stored, computed by SunModel): sunHoursEstimate, isFrostPocket
}
```

### 7.10 PlantInstance (a real planted thing) and StageEvent **[tracking]**
```ts
interface PlantInstance {
  id: string;
  gardenId: string;
  areaId: string;
  plantId: string;
  varietalId?: string;
  // placement: one or more tiles (a tomato is one tile; a row of carrots may span tiles)
  tiles: Array<{ col: number; row: number }>;
  plantingMethod: "direct_sow" | "transplant";
  plantedOn: string;              // ISO date the user logged
  // Stage state machine:
  currentStage: StageKey;
  // The schedule of expected stage-entry dates, computed at planting and on edits.
  projectedStageDates: Partial<Record<StageKey, string>>;  // [BRIEF: timeline projection]
  // History of stage transitions (auto and manual)
  events: StageEvent[];           // also stored relationally if preferred
  status: "active" | "harvested" | "removed" | "failed";
  watering: {
    mode: "auto" | "manual";
    lastWateredOn?: string;
    customMmPerWeek?: number;     // override plant default [BRIEF: watering parameters]
  };
  fertilizing: {
    lastFedOn?: string;
    nextDueOn?: string;           // [BRIEF: fertilizing parameters]
  };
  notes?: string;
  photoEntryIds: string[];        // -> JournalEntry [ADDED]
}

interface StageEvent {
  id: string;
  instanceId: string;
  stage: StageKey;
  enteredOn: string;              // ISO date
  source: "auto" | "manual_advance" | "manual_rollback";
  diagnosticId?: string;          // if a rollback triggered a diagnostic session
  note?: string;
}
```

### 7.11 DiagnosticTree **[rollback diagnosis]**
A decision tree per symptom; rollback opens the tree for "delay at stage X."
```ts
interface DiagnosticTree {
  id: string;
  // What triggers it: a stage where delay/rollback commonly happens, plus optional plant/family scope
  symptom: string;               // "germination_delay" | "stunted_growth" | "yellowing_leaves" | "bolting" | "no_fruit"
  appliesToStage?: StageKey;
  scope?: { plantId?: string; familyId?: string };
  root: DiagnosticNode;
}

interface DiagnosticNode {
  id: string;
  question: string;              // "Has soil temperature stayed below the plant's minimum?"
  // Optional auto-answer hint: which data the app can check itself (soil temp, days elapsed, water log)
  autoCheck?: "soil_temp_below_min" | "days_exceeded_expected" | "no_recent_water" | "low_light" | null;
  yes: DiagnosticBranch;
  no: DiagnosticBranch;
}

type DiagnosticBranch =
  | { kind: "node"; node: DiagnosticNode }
  | { kind: "diagnosis"; cause: string; remedy: string; createsTask?: Partial<Task> };
```

### 7.12 Task / Reminder, JournalEntry, Settings
```ts
interface Task {
  id: string;
  gardenId?: string;
  instanceId?: string;
  kind: "water" | "fertilize" | "sow" | "transplant" | "harvest" | "harden_off" | "succession" | "custom" | "remedy";
  title: string;
  dueOn: string;
  recurrence?: { everyDays: number; until?: string };
  done: boolean;
  source: "auto" | "user";
}

interface JournalEntry {
  id: string;
  instanceId?: string;
  gardenId?: string;
  date: string;
  text?: string;
  photoBlobId?: string;          // image stored in IndexedDB as Blob
  stageAtEntry?: StageKey;
}

interface Settings {
  unitSystem: "metric" | "imperial";
  hemisphere: "northern" | "southern";  // flips seasonal logic [ADDED]
  notificationsEnabled: boolean;
  theme: "light" | "dark" | "system";
  defaultLocationId?: string;
  // --- v1.2 presentation, field, and performance (§32.7) ---
  fieldMode: boolean;                    // chunky "dirty hands" UI
  reducedMotion: "system" | "on" | "off"; // default "system"; gates all animation
  performanceTier: "auto" | "high" | "low"; // "low" disables ambient FX, throttles recompute
  feel: {
    soundEnabled: boolean;               // default FALSE (autoplay is blocked anyway)
    hapticsEnabled: boolean;             // default true; no-ops where unsupported (iOS)
    ambientWeather: boolean;             // default true on high tier, off on low/field
    placementJuice: boolean;             // dirt puff / snap / pop animations; default true
  };
}
```

---

## 8. External data sources and adapters

All optional, all cached, all with manual fallback.

### 8.1 Weather and climate
- **Open-Meteo** (`open-meteo.com`) is the recommended primary: free, no API key, returns historical normals, daily forecast, and has an Elevation API. Use the forecast for near-term watering decisions and frost alerts, and historical archive to derive monthly normals and frost dates.
- **Climate normals / frost dates:** derive from historical daily data (last ~10 years) rather than relying on a single dataset. Compute the last spring day and first fall day where min temp crossed 0 C, per year, then take percentiles across years for p50/p10 (see 27.1). This works anywhere on Earth and avoids US-only frost-date tables.
- **Hardiness zone:** for US, an offline lookup table keyed by the nearest climate band is acceptable; better, derive an equivalent zone from the computed average annual minimum temperature so it works internationally. Store as a label and as the numeric value.

### 8.2 Geocoding
- Forward/reverse geocoding via Open-Meteo's geocoding endpoint or Nominatim. Used only to turn a place name into lat/lon/elevation. Always allow manual lat/lon entry.

### 8.3 Adapter contract
```ts
interface WeatherAdapter {
  getDailyForecast(loc: Location, days: number): Promise<DailyForecast[]>;
  getHistoricalDaily(loc: Location, fromYear: number): Promise<DailyRecord[]>;
}
interface GeocodeAdapter {
  search(query: string): Promise<Array<{ label: string; lat: number; lon: number; elevationM?: number }>>;
}
```
Every adapter result is written to an IndexedDB cache with a timestamp; the engines read cache-first and only refetch when stale (configurable, default 7 days for normals, 6 hours for forecast).

---

## 9. Climate engine (ClimateEngine)

**Input:** a `Location`. **Output:** a `ClimateProfile`.

Steps:
1. Pull cached historical daily data; if absent and online, fetch ~10 years; if offline, prompt the user to enter frost dates and zone manually, or fall back to a zone default table.
2. Compute last spring frost and first fall frost as p50/p10 dates (27.1).
3. Compute monthly normals (mean tMin, tMax, precip; eto if available).
4. Derive hardiness zone from average annual minimum temperature.
5. Apply microclimate adjustments from site data (elevation, coastal flag): for example, raise frost tolerance and shift frost dates earlier/later when the site is coastal or on a slope (27.6). Surface these as notes, not silent changes.

Persist the profile; recompute on location change or manual refresh. Everything downstream reads from the profile, never from the network directly.

---

## 10. Plant encyclopedia module

**Tab: Encyclopedia.** **[BRIEF: huge plant list + deeper dives]**

- **List/grid view** of all catalog plants with the stage-0 sprite, name, category, difficulty, and quick badges (sun, water, frost tolerance, "fast," "container").
- **Search** by name/scientific name/tag; **filter** by category, sun, water, frost tolerance, days-to-maturity bucket, difficulty, container-friendliness, and "suitable for my zone" (uses ClimateProfile).
- **Sort** by name, DTM, difficulty, suitability score.
- **Detail view** with tabs:
  - *Overview:* description, family, lifecycle, key agronomy (zones, frost tolerance, sun, water, soil pH, spacing, height/spread, DTM).
  - *Calendar:* this plant's planting windows for the active location (section 11), rendered as the band chart.
  - *Stages:* the growth-stage sequence with the sprite for each stage and typical durations.
  - *Care:* watering and fertilizing schedule, support structures, common pests/diseases.
  - *Varieties:* list of `Varietal`s with traits and DTM deltas. **[BRIEF]**
  - *Recipes:* `Recipe`s referencing this plant; tapping opens the recipe. **[BRIEF]**
  - *Companions:* beneficial and antagonistic plants from `CompanionRelationship`. **[ADDED]**
- **"Add to garden" action** from the detail view drops the plant into the active garden's placement flow (section 12.6).

Seeding requirements for the "huge list": ship at minimum the list in section 28.2 with full `Plant` records. Records must be complete enough to drive windows, spacing, sun maps, and stages, not just names.

---

## 11. Planting calendar and window engine

**Tab: Calendar.** **[BRIEF: best planting times + chart of windows]**

### 11.1 PlantingWindowEngine
**Input:** a `Plant` + a `ClimateProfile`. **Output:** a set of dated bands per method.

For each applicable method, convert the plant's frost-relative `sowRules` into concrete date ranges:
- `indoorStart` band = `lastSpringFrost.p50` shifted by `indoorStartWeeksFromLastFrost`.
- `directSow` band = `lastSpringFrost` shifted by `directSowWeeksFromLastFrost`, clipped so it never starts before soil reaches `minSoilTempC` (estimate soil temp from monthly normals, 27.4).
- `transplant` band similarly.
- `fallSow` band = `firstFallFrost.p50` minus `(daysToMaturity + fallWeeksFromFirstFrost)` so the crop matures before frost; only emitted for frost-tolerant or fall-suitable crops.
- Optionally split spring/fall windows when season length supports two crops.
- For southern hemisphere, mirror seasons via the `hemisphere` setting (27.7).

Each band carries: method, start, end, confidence (narrower when frost dates are p10-tight), and a "harvest by" projection (`start + DTM`).

### 11.2 The chart **[BRIEF: cool chart of windows]**
A horizontal timeline spanning the calendar year (or 14 months to show wrap-around), with one row per method:
- Bands colored by activity: indoor-start, direct-sow, transplant, harvest.
- A "today" marker line; a shaded frost-risk region before last spring and after first fall frost.
- A secondary harvest band (lighter) trailing each sow/transplant band by DTM.
- Hover/tap a band for exact dates, soil-temp note, and confidence.
- Two scopes: **per-plant** (in the encyclopedia detail) and **whole-garden** (all plants in the active garden stacked, so the user sees the season at a glance and spots gaps).

Implementation: if the chart lib has a Gantt/range mode, use it; otherwise draw bands as positioned SVG rects on a month-scaled x-axis. Keep it responsive: on phones, make it horizontally scrollable with a sticky row-label column.

---

## 12. Garden designer (the 2D tile plot)

**Tab: Designer.** **[BRIEF: Minecraft-style 2D garden model, elevation, orientation, satellites, tiles, structures, water]**

### 12.1 Visual model
Top-down, tile-based, pixel-art aesthetic ("Minecraft from above"). Each tile is a square cell rendered with a base terrain sprite plus an optional object sprite (plant at its current stage, structure, hardscape, or water feature). Tiles map to real-world size via `cellSizeCm` (default 30.48 cm = 1 ft, supporting square-foot gardening).

### 12.2 Canvas, pan, zoom
- Infinite-feeling canvas holding multiple `GardenArea`s positioned by their `origin`. **[BRIEF: satellite locations]** Satellites are just additional areas placed anywhere on the canvas; the user can name and rotate each.
- Pan (drag/two-finger), zoom (wheel/pinch), snap-to-grid placement.
- A compass rose reflecting `northBearingDeg`; the user can rotate the whole garden to match reality. **[BRIEF: orientation]**

### 12.3 Layers
Render in order: terrain/hardscape, elevation shading, water features, structures, plants, sun/shade overlay (toggle), labels/badges. Keep plants above structures so a caged tomato reads correctly.

### 12.4 Tile palette (placement tools)
A palette grouped into:
- **Plants** (from catalog, becomes a `PlantInstance` on placement). **[BRIEF: plant icons]**
- **Structures:** trellis, cage, stake, mound, raised edge, fence, arch, cold frame, row cover. Each has a `heightCm` used by the sun model. **[BRIEF: trellises, mounds]**
- **Hardscape:** path, rock, grass, mulch, paver, soil, gravel. **[BRIEF: rocks, paths, grass]**
- **Water:** drip line, soaker hose, sprinkler head, rain barrel, pond, spigot. Lines snap along tile edges/runs. **[BRIEF: watering components]**
- **Elevation brush:** raise/lower a tile's `elevationCm`; render as subtle contour shading. **[BRIEF: elevation]**

### 12.5 Elevation and frost pockets **[ADDED depth on a BRIEF item]**
Elevation does three things: (1) shades tiles for readability; (2) derives slope/aspect from neighboring tile heights, feeding the sun model; (3) flags low-lying tiles as potential frost pockets (cold air pools in depressions), shown as a cold-risk badge that nudges placement of frost-tender plants to higher/sloped tiles.

### 12.6 Placement flow with validation
When a plant is placed:
- Auto-create a `PlantInstance` (status active only after the user logs a planting date; before that it is a "planned" ghost).
- **Spacing check:** using `spacing`, warn if neighbors of the same/competing plant are too close; optionally auto-expand the footprint to the required number of tiles.
- **Sun check:** compare the tile's estimated sun hours (section 12.8) to `sunHoursMin`; flag a sun mismatch.
- **Companion check:** scan adjacent tiles for `antagonistic` relationships (warn) and surface `beneficial` ones (encourage). **[ADDED]**
- **Rotation check:** if this tile grew the same `familyId` in a recent season (history), warn. **[ADDED]**
Warnings are non-blocking badges, never hard stops.

### 12.7 Rendering tech decision
Use Konva (Canvas) for the plot to hit the performance target with many sprites and smooth pan/zoom. Maintain an accessible mirror: a collapsible table listing every placed object with its position, type, and stage, navigable by keyboard and screen reader (section 24). For very small plots the builder may instead use an SVG/DOM grid; either is acceptable if the perf and a11y bars are met.

### 12.8 Sun/shade model (SunModel) **[ADDED — this is what makes orientation+elevation meaningful]**
Goal: estimate direct-sun hours per tile across a representative day so placement advice is real, not cosmetic.

1. **Solar position:** for the garden's latitude and a chosen date (default: a summer and an equinox sample), compute the sun's altitude and azimuth at, say, 30-minute steps from sunrise to sunset (27.5, NOAA-style formulas).
2. **Obstruction casting:** for each time step, for each tile, walk in the direction of the sun's azimuth (rotated by `northBearingDeg`) and test whether any structure or tall plant between the tile and the sun is high enough to block the sun at that altitude. Shadow length `L = height / tan(altitude)`; a blocker at distance `d` shades the tile if `d <= L` and the blocker's top exceeds the line of sight. Account for tile elevation differences in the height comparison.
3. **Accumulate:** count lit time steps per tile, convert to hours. Cache as a per-tile `sunHoursEstimate`.
4. **Overlay:** a toggle renders a heat overlay (full sun to deep shade) so the user sees the bed's light map and can place shade-tolerant crops in the shadow of a trellis or fence.
This is an estimate (ignores diffuse light, weather, terrain beyond the plot); label it as such. Recompute on layout/orientation/elevation change, debounced.

---

## 13. Growth tracking and the stage state machine

**Tab: Tracker** (and inline on the Designer). **[BRIEF: stage tracking, per-stage graphics, auto-advance, rollback]**

### 13.1 Projection at planting
When the user logs `plantedOn`, compute `projectedStageDates` by walking `GrowthStageTemplate.sequence` and accumulating `stageDurations.typical`, starting from the planting date (or from emergence for transplants, which skip `germination`). Store these dates. The timeline UI shows past (logged), present (current stage), and future (projected) stages.

### 13.2 Auto-advance over real time
A daily pass (run on app open and via periodic background sync) compares `today` to `projectedStageDates`:
- If today has reached the next stage's projected entry date and the user has not manually set the stage, advance `currentStage` and append an `auto` `StageEvent`. **[BRIEF: updates itself along the timeline]**
- The sprite swaps to the new stage's graphic. **[BRIEF: different graphics per stage]**
Auto-advance is a projection, not a claim of ground truth; the user can correct it (13.4).

### 13.3 Optional GDD-based pacing **[ADDED]**
When climate data is present and the plant has `gddBaseTempC`, pace stage advancement by accumulated GDD since planting (27.2) instead of raw calendar days. This makes a cool spring correctly slow things down and a hot spell speed them up, which is the single biggest realism win. Fall back to calendar days when GDD data is unavailable.

### 13.4 Manual advance and rollback **[BRIEF: click to go back a stage + diagnose delay]**
- The user can tap a plant and **advance** (it really is ahead) or **roll back** a stage (it looks behind where the app placed it).
- A **rollback** records a `manual_rollback` `StageEvent` and **opens the diagnostics flow** for "delay at stage X" (section 14). It also re-projects downstream stage dates from today, shifting the remaining timeline.
- A manual advance similarly re-projects and records `manual_advance`.

### 13.5 Stage graphics (sprite system)
Each plant has an `iconKey`; the rendered sprite resolves to `iconKey + "_" + stage`. Provide a full sprite set per plant (or per family as a fallback) covering: planted (soil mound/seed), germination (cracked seed/nub below soil line), sprout (cotyledons), seedling (true leaves), vegetative (bushy), budding, flowering/heading, fruiting, harvest (ripe), senescence (spent/brown), dormant (perennial stub). A generic per-category fallback set covers plants lacking bespoke art so the app never shows a blank tile.

### 13.6 Tracker views
- **Timeline per instance:** horizontal stage track with dates, current marker, projected remainder, and any rollback annotations.
- **Garden roll-up:** all active instances with current stage, days-in-stage, next action, and any overdue care.

---

## 14. Diagnostics engine (DiagnosticsEngine)

**[BRIEF: rollback triggers a dialog that helps diagnose why the plant is delayed]**

- Keyed by symptom and stage. A rollback at, say, `germination` opens the `germination_delay` tree scoped to the plant/family if a specific tree exists, else a generic one.
- The flow is a guided Q&A walking `DiagnosticNode`s. Where a node has an `autoCheck`, the app pre-answers from its own data (soil temp from climate, days elapsed vs expected, water log, sun estimate) and shows the user the evidence, which they can override.
- Terminal `diagnosis` nodes give a probable cause and a concrete remedy, and can spawn a `remedy` `Task` (e.g., "re-sow, soil too cold; wait until soil > 15 C" or "side-dress nitrogen").
- Ship trees for at least: germination delay, stunted/slow growth, yellowing leaves, failure to flower/fruit, bolting, wilting. Each tree's questions should branch on the usual suspects: soil temperature, moisture (too little/too much), light, nutrients, pests/disease, transplant shock, seed viability/depth. Section 28.3 gives an example tree.

---

## 15. "Plant next" and succession scheduling

**Tab: Plant Next.** **[BRIEF: what to plant after seasons, schedules for fast crops, pipes into the plot]**

- **Season-based suggestions:** given the ClimateProfile and today's date, list crops whose planting window is open or opening soon, with a "plant within N days" urgency. Cool-season vs warm-season logic flows from frost dates and each plant's frost tolerance.
- **Bed-aware suggestions:** if a `PlantInstance` is projected to reach `harvest`/`senescence` soon, surface what could follow it in that tile (respecting rotation: avoid same family), so the user plans the handoff. **[ADDED tie-in]**
- **Succession scheduler:** for fast/repeatable crops (radish, lettuce, bush beans, spinach, cilantro), let the user set an interval (e.g., every 10 to 14 days) and a count; generate a series of future sow `Task`s and **ghost placements** on the grid with future planting dates. **[BRIEF: schedules for quick plants]**
- **Pipe into the plot:** every suggestion and succession item has an "add to garden" action that creates the ghost `PlantInstance` on a chosen tile, ready to be confirmed when actually sown. **[BRIEF: pipes into the garden plot]**

---

## 16. Recommendation engine (RecommendationEngine)

**Tab: Suggest** (and surfaced as badges elsewhere). **[BRIEF: suggest plants that fit the location]**

Score every catalog plant for the active site and context, return a ranked list with reasons.

```
score(plant) =
    w1 * zoneFit            // hardiness/heat within plant range -> 1, else penalty
  + w2 * seasonFit          // is a planting window open/near now
  + w3 * sunFit             // garden has tiles meeting plant.sunHoursMin
  + w4 * spaceFit           // free tiles >= needed footprint
  + w5 * waterFit           // climate precip vs plant.waterNeed alignment
  + w6 * companionBonus     // beneficial neighbors already placed
  - w7 * rotationPenalty    // same family grown here recently
  - w8 * difficultyPenalty  // scaled by a user "experience" setting
```
Weights are constants the builder can tune; expose a couple as user toggles ("easy crops only," "fast crops," "pollinator-friendly"). Each recommendation lists the top contributing reasons ("opens this week, full sun available, container-friendly"). Recommendations feed directly into placement and succession.

---

## 17. Watering and fertilizing module

**[BRIEF: parameters for watering and fertilizing in the garden model]**

### 17.1 WateringEngine
- Per instance, target weekly water = `customMmPerWeek` or `plant.waterMmPerWeek` (or a default by `waterNeed`).
- **Deficit-aware (when climate present):** subtract recent/forecast precip (and optionally ETo) so reminders only fire when nature has not covered the need (27.8). On the rainy Oregon coast this prevents nonsense "water now" prompts in February.
- **Hydrozones:** group instances/areas served by the same water feature (drip line, etc.) so the user waters/schedules by zone, not plant by plant. **[ADDED]**
- Generates `water` `Task`s with recurrence.

### 17.2 Fertilizing
- From `plant.fertilization.schedule`, generate `fertilize` `Task`s anchored to stages (e.g., feed at `vegetative`, again at `flowering`) and/or intervals. Track `lastFedOn`/`nextDueOn` on the instance.
- Surface upcoming feeds on the tracker and as reminders.

---

## 18. Varieties and recipes module

**[BRIEF: dive deeper into varietals and recipes]**

- **Varieties:** within a plant's detail, browse `Varietal`s with traits, DTM deltas, and "best for" tags; selecting one for a `PlantInstance` overrides DTM and can tint the sprite.
- **Recipes:** a recipe library filterable by plant; a plant's detail lists recipes using it; a "harvest-ready" nudge can suggest recipes when an instance hits `harvest`. **[ADDED tie-in]** Recipes can reference non-harvest yields (thinnings, edible flowers) via `usesStage`.

---

## 19. Notifications, reminders, and tasks

**[ADDED — needed to make tracking/watering/feeding actionable]**

- A unified `Task` list (tab or drawer) aggregating sow/transplant/harden-off/water/fertilize/harvest/succession/remedy tasks, grouped by due date.
- **Local notifications** via the service worker and the Notifications API where permitted; degrade to in-app badges where not (iOS web push is limited, so never depend on it). Periodic Background Sync (where supported) runs the daily stage/water pass; otherwise it runs on app open.
- Tasks are generated by the engines and by the user; completing a care task updates the relevant instance fields.

---

## 20. Companion planting and crop rotation

**[ADDED — both materially affect outcomes and are cheap to model]**

- **Companions:** `CompanionRelationship` data drives placement warnings/encouragement (12.6) and a companions tab in the encyclopedia.
- **Rotation:** keep a per-tile family history across seasons; when placing, warn if the same `rotationGroup` recurs in the same tile within a configurable window (default two seasons). Offer a "rotation view" overlay coloring tiles by last family grown.

---

## 21. UI/UX and design system

### 21.1 Aesthetic
Pixel-art, tile-forward, friendly. The plot is the hero. Outside the plot, a clean, legible UI (not pixelated chrome) so data stays readable. Think "cozy gardening game meets practical planner."

### 21.2 Tabs / navigation **[BRIEF lists these as tabs]**
Bottom tab bar on mobile, side rail on desktop:
Encyclopedia · Calendar · Designer · Tracker · Plant Next · Suggest · (Tasks) · (Settings).
Designer is the default landing once a garden exists; Suggest/Calendar lead before one does.

### 21.3 Tokens
Define CSS variables for color, spacing, radius, typography. Provide a light and dark theme. Stage and category colors are tokens so sprites and chart bands stay consistent.

### 21.4 Sprites
A single source of truth: a sprite manifest mapping `iconKey + stage` and tile kinds to assets (sprite sheet or per-asset). Provide category-level fallbacks. Keep art crisp at multiple DPRs (`image-rendering: pixelated` for the pixel layer).

### 21.5 Responsiveness **[BRIEF: scale to any device]**
- Phone: single-column, bottom tabs, horizontally scrollable charts, finger-first canvas (large hit targets, long-press for context menus).
- Tablet/desktop: multi-pane (palette + canvas + inspector), hover affordances, keyboard shortcuts.
- The grid canvas scales to viewport; UI never assumes a fixed width.

---

## 22. PWA requirements

- **Manifest:** name, short_name, icons (192/512 + maskable), `display: standalone`, theme/background colors, start_url, orientation `any`.
- **Service worker (Workbox via vite-plugin-pwa):**
  - Precache the app shell and bundled catalog JSON and sprites.
  - Runtime caching: network-first for weather/geocode with a cache fallback and TTL; cache-first for static assets.
  - Offline page and offline-aware UI states.
- **Install:** custom install prompt handling (`beforeinstallprompt`) with an in-app "Install" affordance.
- **Background work:** Periodic Background Sync for the daily pass where supported; always also run the pass on launch. Push/local notifications where permitted, with graceful no-op fallback (notably iOS).
- **Updates:** show a "new version available, reload" toast when a new SW is waiting.

---

## 23. State management and persistence

- **IndexedDB stores:** `catalog_*` (plants, varietals, recipes, stageTemplates, companions, diagnostics, families, **pests**, **diseases**), `gardens`, `instances`, `stageEvents`, **`harvestEvents`**, **`seedPackets`**, **`pestSightings`**, `tasks`, `journal` (+ a `blobs` store for photos and the **garden background image**), `locations`, `climateProfiles`, `settings`, `caches` (weather/geocode). New stores in bold are specified in Section 31.
- **Store wrapper:** Zustand with persist middleware backed by IndexedDB; large/append-heavy collections (instances, events, journal) queried directly via the DB layer rather than held entirely in memory.
- **Export/import:** one-tap export of all user data (and optionally the catalog) to a JSON file; import merges or replaces. This is the backup story and satisfies data ownership. **[constraint]**
- **Optional sync backend (additive, never required):** if built, a simple authenticated key-value/document sync (e.g., per-user JSON blobs with last-write-wins or per-record timestamps). Keep the offline-first local store authoritative; sync reconciles in the background. Do not let any sync failure block local use.

---

## 24. Accessibility

- The canvas plot has an **accessible mirror**: a keyboard-navigable, screen-reader-readable table/list of every placed object (area, position, type, plant, stage, warnings). All placement/edit actions are reachable from this mirror, not only by pointer.
- Color is never the sole signal (sun overlay, frost badges, warnings also use icons/text).
- Meet WCAG AA contrast for chrome; provide focus rings, ARIA labels, and respects `prefers-reduced-motion` (stage transitions/animations).
- Charts expose underlying data in a table on demand.

---

## 25. Performance and scalability

- Target 60fps interaction for plots up to 64x64 with several hundred objects. Use a single Canvas stage with batched draws and sprite atlases; avoid one DOM node per tile at scale.
- Memoize derived selectors (calendar bands, sun map, schedules); recompute only on relevant state changes, debounced for expensive ones (sun model).
- Virtualize long lists (encyclopedia, tasks).
- Sparse tile storage (store only non-empty tiles).
- Lazy-load tab modules and the recipe/variety content.
- **Animation and heavy-recompute guardrail (§32):** every animated or compute-heavy v1.2 feature (ambient weather, Time Machine scrubbing, saturation/sun overlays, juice) must pause when `document.hidden`, throttle or disable under `performanceTier: "low"`, respect `reducedMotion`, and never regress the 60fps grid target. The sun model is precomputed per sample date and interpolated during scrubbing, never recomputed per frame.

---

## 26. Privacy and data ownership

- Local-first; no account required; no analytics by default. If any telemetry is added, it is opt-in and documented.
- Location is used only to derive climate and is stored locally; the user can enter a place manually and never grant geolocation.
- Full export/delete of all data on demand.

---

## 27. Algorithms appendix (pseudocode)

### 27.1 Frost dates from historical daily data
```
function frostDates(dailyRecordsByYear):
  springCrossings = []   // last spring day Tmin <= 0
  fallCrossings   = []   // first fall day Tmin <= 0 after midsummer
  for each year in dailyRecordsByYear:
    lastSpring = latest date in [Jan..Jun] where Tmin <= 0
    firstFall  = earliest date in [Jul..Dec] where Tmin <= 0
    push dayOfYear(lastSpring) to springCrossings
    push dayOfYear(firstFall)  to fallCrossings
  lastSpringFrost.p50 = percentileDate(springCrossings, 50)
  lastSpringFrost.p10 = percentileDate(springCrossings, 90) // later date = safer (10% risk remaining)
  firstFallFrost.p50  = percentileDate(fallCrossings, 50)
  firstFallFrost.p10  = percentileDate(fallCrossings, 10)   // earlier date = safer
  frostFreeDays = firstFallFrost.p50 - lastSpringFrost.p50
```
(Choose p10 conventions so the "safe" date is the conservative one; document it.)

### 27.2 GDD accumulation
```
function gdd(dayTmax, dayTmin, base):
  mean = (dayTmax + dayTmin) / 2
  return max(0, mean - base)

function accumulateGDD(records, base, fromDate):
  total = 0
  for d in records where d.date >= fromDate:
    total += gdd(d.tmax, d.tmin, base)
    yield { date: d.date, cumulativeGDD: total }
```
Stage pacing: map each stage's typical-days to a GDD share (or store per-stage GDD targets); advance when cumulative GDD reaches the stage threshold.

### 27.3 Planting window from frost-relative rules
```
function windowsFor(plant, climate, hemisphere):
  bands = []
  lsf = climate.lastSpringFrost.p50
  fff = climate.firstFallFrost.p50
  for method in plant.plantingMethods:
    rule = plant.sowRules[method]
    if method == indoor_start and rule.indoorStartWeeksFromLastFrost:
      bands.push(makeBand("indoor", lsf + weeks(rule.range)))
    if method == direct_sow and rule.directSowWeeksFromLastFrost:
      b = makeBand("direct", lsf + weeks(rule.range))
      b = clipToSoilTemp(b, plant.minSoilTempC, climate)   // 27.4
      bands.push(b)
    if method == transplant and rule.transplantWeeksFromLastFrost:
      bands.push(makeBand("transplant", lsf + weeks(rule.range)))
    if plant suitable for fall and rule.fallWeeksFromFirstFrost:
      sowBy = fff - days(plant.daysToMaturity.max) - weeks(rule.fallWeeksFromFirstFrost)
      bands.push(makeBand("fall", sowBy window))
  if hemisphere == southern: shiftBandsBySixMonths(bands)
  for b in bands: b.harvestBy = b.start + days(plant.daysToMaturity.typicalOrMax)
  return bands
```

### 27.4 Soil-temperature estimate (clip cold-season direct sow)
```
// crude monthly model: soil temp ~ trailing-weighted mean air temp, damped
function estSoilTempC(date, climate):
  m = month(date)
  airMean = (climate.monthlyNormals[m].tMinC + climate.monthlyNormals[m].tMaxC)/2
  prev = climate.monthlyNormals[(m-2+12)%12 + 1] // simple lag
  return 0.6*airMean + 0.4*((prev.tMinC+prev.tMaxC)/2)
function clipToSoilTemp(band, minSoilTempC, climate):
  advance band.start until estSoilTempC(band.start, climate) >= minSoilTempC
  return band
```

### 27.5 Solar position (for the sun model)
```
// inputs: latitude L, date -> day-of-year n, local time t (hours)
decl   = 23.45 * sin(deg2rad(360*(284+n)/365))         // solar declination
B      = deg2rad(360*(n-81)/365)
EoT    = 9.87*sin(2B) - 7.53*cos(B) - 1.5*sin(B)        // equation of time (min)
solarTime = t + EoT/60 + longitudeCorrection
H      = 15*(solarTime - 12)                            // hour angle (deg)
alt    = asin( sin(L)*sin(decl) + cos(L)*cos(decl)*cos(deg2rad(H)) )   // altitude
azi    = atan2( sin(deg2rad(H)),
                cos(deg2rad(H))*sin(L) - tan(decl)*cos(L) )            // azimuth (from south/north per convention)
// sample alt/azi every 30 min from sunrise (alt crosses 0 up) to sunset (alt crosses 0 down)
```

### 27.6 Shadow casting per tile
```
function sunHours(tile, area, garden, climate, sampleDates):
  litMinutes = 0
  for date in sampleDates:
    for step in timeSteps(date):          // 30-min steps, daylight only
      (alt, azi) = solarPosition(climate.lat, date, step.time)
      if alt <= 0: continue
      dir = rotate(azi, garden.northBearingDeg) // map sun azimuth into grid space
      if not blocked(tile, dir, alt, area):
        litMinutes += step.durationMinutes / count(sampleDates)
  return litMinutes / 60

function blocked(tile, dir, alt, area):
  for blocker along ray from tile toward dir, up to maxShadowReach:
    needed = (blocker.distanceCm) * tan(alt)          // how tall to block at this distance
    blockerTop = blocker.heightCm + (blocker.elevationCm - tile.elevationCm)
    if blockerTop >= needed: return true
  return false
```

### 27.7 Hemisphere handling
```
if settings.hemisphere == southern:
  // seasons offset by ~6 months; swap "spring/fall" frost roles accordingly,
  // shift all calendar bands by +6 months (mod 12), and flip sun azimuth convention.
```

### 27.8 Watering deficit
```
function weeklyWaterDeficitMm(instance, climate, forecast):
  need = instance.watering.customMmPerWeek
         ?? plant.waterMmPerWeek.typical
         ?? defaultByWaterNeed(plant.waterNeed)
  supply = sum(precipMm over trailing 7 days) + expectedRainNext3Days(forecast)
  // optional: subtract crop ET if ETo available: et = eto * cropCoefficient(stage)
  deficit = max(0, need - supply)
  return deficit            // generate a water Task only if deficit > threshold
```

### 27.9 Recommendation score
```
function recommend(plant, site, garden, history, prefs):
  s = 0
  s += W.zone   * within(plant.hardinessZones, site.zoneNumeric) ? 1 : -1
  s += W.season * seasonProximity(windowsFor(plant, site).nearestOpening, today)
  s += W.sun    * (maxTileSunHours(garden) >= plant.sunHoursMin ? 1 : -0.5)
  s += W.space  * (freeTiles(garden) >= neededTiles(plant) ? 1 : -0.5)
  s += W.water  * waterAlignment(climate.precip, plant.waterNeed)
  s += W.comp   * beneficialNeighborsScore(plant, garden)
  s -= W.rot    * sameFamilyRecently(plant.familyId, garden, history)
  s -= W.diff   * difficultyPenalty(plant.difficulty, prefs.experience)
  if prefs.fastOnly and plant.daysToMaturity.max > 50: s -= big
  return { plant, score: s, reasons: topReasons(...) }
```

---

## 28. Seed data appendix

### 28.1 Two fully-populated example `Plant` records (show the shape; the catalog ships dozens)

```json
{
  "id": "tomato",
  "commonName": "Tomato",
  "scientificName": "Solanum lycopersicum",
  "familyId": "solanaceae",
  "category": "vegetable",
  "lifecycle": "annual",
  "hardinessZones": { "min": 2, "max": 11 },
  "heatTolerance": "high",
  "frostTolerance": "tender",
  "minSoilTempC": 15.5,
  "optSoilTempC": { "min": 21, "max": 29 },
  "gddBaseTempC": 10,
  "gddToMaturity": 1300,
  "daysToMaturity": { "min": 55, "max": 90, "from": "transplant" },
  "photoperiod": "day_neutral",
  "sun": "full", "sunHoursMin": 6,
  "waterNeed": "medium", "waterMmPerWeek": { "min": 25, "max": 40 },
  "soilPh": { "min": 6.0, "max": 6.8 },
  "soilPreference": ["well-drained", "loamy", "rich"],
  "matureHeightCm": { "min": 90, "max": 200 },
  "matureSpreadCm": { "min": 45, "max": 90 },
  "spacing": { "inRowCm": 45, "betweenRowCm": 90, "squareFootCount": 1 },
  "plantingMethods": ["indoor_start", "transplant"],
  "sowRules": {
    "indoorStartWeeksFromLastFrost": { "min": -8, "max": -6 },
    "transplantWeeksFromLastFrost": { "min": 1, "max": 2 },
    "plantingDepthCm": 0.6,
    "germinationDays": { "min": 5, "max": 10 }
  },
  "stageTemplateId": "tmpl_fruiting_annual",
  "fertilization": { "schedule": [
    { "atStage": "transplant", "type": "balanced 10-10-10" },
    { "atStage": "flowering", "type": "low-N high-P/K", "intervalDays": 14 }
  ]},
  "supportStructures": ["cage", "stake", "trellis"],
  "commonPests": ["hornworm", "aphid", "whitefly"],
  "commonDiseases": ["early blight", "blossom end rot", "late blight"],
  "harvest": {
    "windowDays": { "min": 30, "max": 70 },
    "yieldPerPlant": "3-5 kg",
    "indicators": ["full color", "slight give when pressed"],
    "method": "twist or snip ripe fruit"
  },
  "varietalIds": ["tomato_sungold", "tomato_san_marzano", "tomato_early_girl"],
  "recipeIds": ["recipe_fresh_salsa", "recipe_roasted_sauce"],
  "difficulty": "moderate",
  "description": "Warm-season fruiting crop; needs full sun, steady water, and support.",
  "iconKey": "tomato",
  "tags": ["container-friendly", "pollinator", "summer"]
}
```
```json
{
  "id": "radish",
  "commonName": "Radish",
  "scientificName": "Raphanus sativus",
  "familyId": "brassicaceae",
  "category": "vegetable",
  "lifecycle": "annual",
  "hardinessZones": { "min": 2, "max": 11 },
  "heatTolerance": "low",
  "frostTolerance": "half_hardy",
  "minSoilTempC": 7,
  "gddBaseTempC": 5,
  "daysToMaturity": { "min": 22, "max": 30, "from": "sow" },
  "photoperiod": "long_day",
  "sun": "full", "sunHoursMin": 6,
  "waterNeed": "medium", "waterMmPerWeek": { "min": 20, "max": 30 },
  "soilPh": { "min": 6.0, "max": 7.0 },
  "matureHeightCm": { "min": 10, "max": 20 },
  "matureSpreadCm": { "min": 5, "max": 8 },
  "spacing": { "inRowCm": 3, "betweenRowCm": 15, "squareFootCount": 16 },
  "plantingMethods": ["direct_sow"],
  "sowRules": {
    "directSowWeeksFromLastFrost": { "min": -4, "max": 4 },
    "fallWeeksFromFirstFrost": { "min": 4, "max": 6 },
    "plantingDepthCm": 1.2,
    "germinationDays": { "min": 3, "max": 7 }
  },
  "stageTemplateId": "tmpl_root_fast",
  "fertilization": { "schedule": [
    { "atStage": "planted", "type": "compost-amended bed" }
  ]},
  "supportStructures": [],
  "commonPests": ["flea beetle", "root maggot"],
  "commonDiseases": ["clubroot"],
  "harvest": {
    "windowDays": { "min": 5, "max": 10 },
    "yieldPerPlant": "1 root",
    "indicators": ["shoulders ~2-3 cm at soil line"],
    "method": "pull"
  },
  "varietalIds": ["radish_cherry_belle", "radish_french_breakfast"],
  "recipeIds": ["recipe_quick_pickled_radish"],
  "difficulty": "easy",
  "description": "Fast cool-season root; ideal for succession sowing and intercropping.",
  "iconKey": "radish",
  "tags": ["fast", "container-friendly", "succession", "cool-season"]
}
```

Example stage template:
```json
{
  "id": "tmpl_fruiting_annual",
  "appliesTo": "fruiting-annuals",
  "sequence": ["planted","germination","sprout","seedling","vegetative","flowering","fruiting","harvest","senescence"],
  "stageDurations": {
    "germination": { "min": 5, "typical": 7, "max": 12 },
    "sprout":      { "min": 5, "typical": 7, "max": 10 },
    "seedling":    { "min": 10, "typical": 14, "max": 21 },
    "vegetative":  { "min": 20, "typical": 28, "max": 40 },
    "flowering":   { "min": 10, "typical": 14, "max": 21 },
    "fruiting":    { "min": 14, "typical": 21, "max": 35 },
    "harvest":     { "min": 21, "typical": 40, "max": 70 }
  }
}
```

### 28.2 Catalog plant list to ship (full records, not just names)
Provide complete `Plant` records for at least the following. Group by category in the encyclopedia.

- **Vegetables — fruiting:** tomato, pepper (sweet), pepper (hot/chili), eggplant, tomatillo, cucumber, zucchini, summer squash, winter squash, pumpkin, melon (cantaloupe), watermelon, okra, ground cherry.
- **Vegetables — legumes:** bush bean, pole bean, snap pea, snow pea, shelling pea, fava bean, soybean (edamame), lima bean.
- **Vegetables — brassicas:** broccoli, cauliflower, cabbage, kale, collards, Brussels sprouts, kohlrabi, bok choy, broccoli raab, mustard greens, turnip, rutabaga.
- **Vegetables — roots/alliums:** carrot, radish, beet, parsnip, onion (bulb), shallot, garlic, leek, scallion, sweet potato, potato, ginger, celeriac.
- **Vegetables — leafy/stem:** lettuce (leaf), lettuce (head/romaine), spinach, Swiss chard, arugula, endive, celery, fennel, asparagus, rhubarb, artichoke.
- **Vegetables — corn:** sweet corn.
- **Herbs:** basil, cilantro/coriander, parsley, dill, thyme, rosemary, sage, oregano, mint, chives, tarragon, marjoram, lavender, lemon balm, fennel (herb), bay.
- **Fruit — berries/perennial:** strawberry, blueberry, raspberry, blackberry, currant, gooseberry, grape, kiwi (hardy).
- **Fruit — tree (note: long horizon, perennial modeling):** apple, pear, plum, cherry, peach, fig, citrus (where zone allows).
- **Flowers — annual/pollinator:** sunflower, marigold, nasturtium, zinnia, cosmos, calendula, borage, sweet alyssum, snapdragon, petunia.
- **Flowers — perennial/bulb:** dahlia, echinacea, lavender (also herb), tulip, daffodil, allium (ornamental).
- **Cover crops:** crimson clover, field peas, buckwheat, winter rye, hairy vetch.

For each, the agronomic fields (frost tolerance, soil temp, DTM, spacing, sun, water, sow rules, stages, pests/diseases, fertilization, varietals, recipes, icon) must be filled with horticulturally sound values. Where exact numbers vary by source, choose reasonable mainstream values and keep them internally consistent.

### 28.3 Example diagnostic tree (germination delay)
```json
{
  "id": "diag_germination_delay",
  "symptom": "germination_delay",
  "appliesToStage": "germination",
  "root": {
    "id": "n1",
    "question": "Has soil temperature stayed below this plant's minimum to germinate?",
    "autoCheck": "soil_temp_below_min",
    "yes": { "kind": "diagnosis",
      "cause": "Soil too cold; seeds dormant or rotting.",
      "remedy": "Wait for soil to reach the plant's minimum, use a cold frame/row cover, or pre-warm the bed. Re-sow if seeds have sat wet and cold for long.",
      "createsTask": { "kind": "remedy", "title": "Re-sow when soil warms" } },
    "no": { "kind": "node", "node": {
      "id": "n2",
      "question": "Has the bed been kept consistently moist (not waterlogged)?",
      "autoCheck": "no_recent_water",
      "yes": { "kind": "node", "node": {
        "id": "n3",
        "question": "Were seeds sown deeper than recommended?",
        "autoCheck": null,
        "yes": { "kind": "diagnosis",
          "cause": "Sown too deep; seedlings exhausted reserves before reaching light.",
          "remedy": "Re-sow at the recommended depth (see plant's plantingDepth)." },
        "no": { "kind": "diagnosis",
          "cause": "Likely old or low-viability seed.",
          "remedy": "Test viability (paper-towel germination) and re-sow with fresh seed." } } },
      "no": { "kind": "diagnosis",
        "cause": "Inconsistent moisture; seedbed dried out or crusted.",
        "remedy": "Keep evenly moist until emergence; consider a humidity cover or surface mulch.",
        "createsTask": { "kind": "water", "title": "Keep seedbed moist daily until emergence" } } } }
  }
}
```

---

## 29. Phased build roadmap

**Phase 0 — Skeleton & data:** TypeScript types for all models, IndexedDB layer, store, PWA shell (manifest + SW + install), tab navigation, bundled catalog JSON (start with ~15 plants fully populated), unit/imperial setting. Exit: app installs, opens offline, lists plants.

**Phase 1 — Climate & calendar:** WeatherAdapter + ClimateEngine (frost dates, normals, zone) with manual fallback; PlantingWindowEngine; the band chart (per-plant and whole-garden). Exit: enter a location, see correct windows on the chart.

**Phase 2 — Designer core:** Canvas grid, areas + satellites, orientation, tile palette (plants/structures/hardscape/water), elevation brush, placement with spacing checks, sparse persistence, accessible mirror. Exit: lay out a real bed and save it.

**Phase 3 — Tracking & diagnostics:** PlantInstance lifecycle, projection at planting, auto-advance (calendar; GDD if climate present), per-stage sprites, manual advance/rollback, diagnostics flow. Exit: log a planting, watch it advance, roll back and get a diagnosis.

**Phase 4 — Plan-ahead & care:** Plant Next + succession piped to grid, RecommendationEngine, WateringEngine (deficit-aware) + fertilizing schedules, Tasks/reminders. Exit: schedule successions and get sensible care reminders.

**Phase 5 — Depth & polish:** Varieties + recipes, companions + rotation overlays, sun/shade overlay, photo journal, export/import, accessibility/performance pass, expand catalog to the full list (section 28.2). Exit: feature-complete v1.

**Phase 6 (optional):** sync backend; plant-ID hook; community catalog updates.

---

## 30. Decisions left to the builder (be explicit when you choose)

1. Grid renderer: Konva/Pixi (recommended) vs SVG/DOM. State your choice and why.
2. Stage pacing default: calendar-days vs GDD-when-available (recommended hybrid). Confirm the fallback behavior.
3. Whether to ship a sync backend now or stub it (default: stub).
4. Frost-date percentile conventions (which percentile = "safe"). Document the choice in-app.
5. Sprite source: bundled sprite sheet vs per-asset; how category fallbacks resolve.
6. Sun-model sample dates and time-step granularity (tradeoff: accuracy vs compute). Default: two sample dates (summer solstice + an equinox), 30-min steps.
7. Notification strategy given platform limits (never depend on iOS web push).
8. Catalog source-of-truth values where horticultural references disagree; keep them internally consistent and cite the convention in a data README.

---

### Appendix A — Mapping your original requests to sections
- Weather analysis + planting instructions per plant → §9, §11, §10.
- Huge plant list + crucial planting data → §7.3, §28.
- Chart of best planting windows → §11.2.
- 2D Minecraft-style garden, elevation, orientation → §12, §12.5, §12.8.
- Plant icons + saved gardens → §7.9, §12.4, §23.
- Stage tracking from planting onward, per-stage graphics, auto-update → §13.
- Click to roll back a stage + diagnose delay → §13.4, §14.
- "Plant next" + schedules for fast crops, piped into plot → §15.
- Variety + recipe deep-dives → §10, §18.
- Suggest plants that fit the location → §16.
- PWA, scales to any device → §22, §21.5.
- Watering + fertilizing parameters → §17.
- Non-plant tiles (rocks, paths, grass) → §12.4.
- Water and planting components (trellises, mounds) → §12.4.
- Satellite planting locations → §7.9, §12.2.

### Appendix B — What was added beyond your brief (and why)
- Frost dates, GDD, soil-temp gating, hardiness/heat zones: turn vague "best times" into site-true windows.
- Sun/shade modeling via shadow casting: makes orientation and elevation actually mean something for placement.
- Companion planting and crop rotation: cheap to model, real effect on yield and disease.
- Hydrozones and deficit-aware watering: prevents nonsense reminders in wet climates, groups watering sensibly.
- Tasks/reminders layer, photo journal, dual units, hemisphere support, export/import: the connective tissue that makes the rest usable and portable.

---

## 31. v1.1 Extensions

These extend the core spec. Each subsystem lists its data model, the engine/algorithm changes, the UI tie-ins, and where it lands in the roadmap. Inline field additions were already threaded into Section 7.

### 31.1 Seed and inventory management

**Intent:** track what the user actually owns, so "Plant Next" and "Suggest" know whether a crop is sowable today without a trip to the store, and so the germination diagnostic can account for old seed.

**Model (user data, store `seedPackets`):**
```ts
interface SeedPacket {
  id: string;
  plantId: string;
  varietalId?: string;            // optional; seed may be generic/unlabeled or self-saved
  source?: string;                // brand or "saved 2024"
  packedForYear?: number;         // PRIMARY viability anchor (printed on packet)
  purchaseYear?: number;          // fallback anchor
  viabilityYearsOverride?: number;// else use plant.seedViabilityYears
  quantity: "high" | "low" | "empty";   // coarse default
  quantityCount?: number;         // optional exact count/grams
  storage?: "cool_dry" | "fridge" | "ambient";
  notes?: string;
  addedAt: string;
}
```

**Derived `viabilityScore` (pure fn):**
```
function viabilityScore(packet, plant):
  anchor = packet.packedForYear ?? packet.purchaseYear ?? year(packet.addedAt)
  age = currentYear - anchor
  span = packet.viabilityYearsOverride ?? plant.seedViabilityYears ?? 3
  if age <= 0: return "fresh"
  if age <  span: return "good"
  if age == span: return "aging"
  return "expired"   // still plantable, expect poor germination
```

**Tie-ins:**
- **Stash badge** in Encyclopedia, Suggest, and Plant Next: "In stash", "In stash (aging)", "Out of stash". Driven by presence of a non-empty packet and its `viabilityScore`.
- **RecommendationEngine (§16):** add a small `inventoryBonus` term for plants with a viable packet; Plant Next groups/sorts "you have seed for these" first.
- **Diagnostics (§14):** the germination-delay tree's "old/low-viability seed" node gains `autoCheck: "seed_past_viability"`, pre-answered from the linked packet's `viabilityScore`.
- **Shopping list (optional):** generate a list from planned/ghost plantings whose packets are `empty` or `expired`.
- **Catalog requirement:** populate `seedViabilityYears` per plant (e.g., onion/parsnip ~1, leek/pepper ~2, tomato/brassicas ~4, cucumber/squash ~5, bean ~3, lettuce ~3).

**Roadmap:** Phase 4 (alongside Plant Next / Suggest). The diagnostic `autoCheck` lands with Phase 3 diagnostics if packets exist, else degrades to a manual question.

### 31.2 Soil drainage and extreme-weather (waterlogging) modeling

**Intent:** in wet climates, prolonged saturation drowns roots as surely as frost kills tops. Make the watering and diagnostics engines aware of too-much-water, reusing the existing elevation model rather than adding a parallel spatial system.

**Model additions (already inline in §7):**
- `GardenArea.soilDrainage: "fast" | "moderate" | "poor"` (default `moderate`).
- `Plant.waterloggingSensitivity: "low" | "medium" | "high"`.

**Reuse of elevation:** the frost-pocket detector (§12.5) already finds tiles that sit in depressions relative to neighbors. Local pooling risk per tile is that same depression depth scaled by area drainage. No new spatial model.

**Algorithm 27.10 — waterlogging risk:**
```
function waterloggingRisk(tile, area, climate, forecast):
  // drainage capacity as a rough mm/day the soil can shed
  capacityMmDay = { fast: 40, moderate: 20, poor: 8 }[area.soilDrainage]
  recentRain = sum(precipMm over trailing 3 days) + expectedRainNext2Days(forecast)
  load = recentRain - capacityMmDay * 5             // net mm the soil is carrying
  poolingFactor = depressionDepthFactor(tile, area) // 1.0 flat .. >1 for low spots
  risk = max(0, load) * poolingFactor
  return bucket(risk)                               // "none" | "elevated" | "high"
```

**Engine/UX behavior:**
- **WateringEngine (§17):** when risk is `elevated`/`high`, suppress any water task (reinforces deficit logic) and, for instances whose `plant.waterloggingSensitivity` is `high`, raise a **"root rot / waterlogging risk"** alert with a remedy task (improve drainage, mound up, divert runoff, hold watering, add a cold frame/cover). Lower-sensitivity crops get a quieter note.
- **Diagnostics (§14):** add a **waterlogging/root-rot branch** to the stunted-growth, yellowing-leaves, and wilting trees, with `autoCheck: "soil_saturated_recent"`. Encode the counterintuitive tell: **wilting in wet soil = dying roots, not thirst**; do not water.
- **Auto-advance (optional, default OFF):** a setting `pauseAdvanceOnWaterloggingStress`. Honest caveat to keep in the doc and the UI: auto-advance is a projection, not a measurement, so pausing it is a soft signal, not a model of plant physiology. The warning path is the real feature; the pause is a convenience for users who want the timeline to visibly flag stressed plants.

**Catalog requirement:** set `waterloggingSensitivity` per plant (high: lavender, rosemary, thyme, tomato, most Mediterranean herbs and root crops in heavy soil; medium: many annual veg; low/tolerant: celery, mint, taro, watercress, some brassicas).

**Roadmap:** model + risk algorithm in Phase 1 (with the climate engine); diagnostics branches and alerts in Phase 3.

### 31.3 Relational pests and diseases

**Intent:** model pests and diseases as first-class catalog entities with host relationships and a contagion scope, mirroring `CompanionRelationship`. This powers cross-warnings ("aphids logged on the tomato, watch the neighboring peppers") and lets diagnoses pull real control options.

**Model (catalog, stores `pests` / `diseases`; user sightings in `pestSightings`):**
```ts
interface HostLink { plantId?: string; familyId?: string; susceptibility: "low" | "medium" | "high"; }

interface Pest {
  id: string;
  commonName: string;
  scientificName?: string;
  description: string;
  signs: string[];                 // "stippled leaves","sticky honeydew","skeletonized foliage"
  hosts: HostLink[];
  controls: { cultural: string[]; mechanical: string[]; biological: string[]; chemical?: string[] };
  spreadsTo?: "neighbors" | "family" | "wide";   // contagion scope for cross-warnings
  favoredConditions?: string[];
}

interface Disease {
  id: string;
  commonName: string;
  pathogenType: "fungal" | "bacterial" | "viral" | "abiotic";
  description: string;
  signs: string[];
  hosts: HostLink[];
  favoredConditions: string[];     // "warm wet foliage","poor drainage","high humidity"
  controls: { cultural: string[]; mechanical: string[]; biological: string[]; chemical?: string[] };
  spreadsTo?: "neighbors" | "family" | "wide";
}

interface PestSighting {           // user observation on a specific plant
  id: string;
  instanceId: string;
  pestId?: string;
  diseaseId?: string;
  observedOn: string;
  severity: "low" | "medium" | "high";
  note?: string;
  photoEntryId?: string;
}
```

**Cross-warning algorithm:**
```
function onSighting(sighting, garden, catalog):
  agent = catalog.pests[sighting.pestId] ?? catalog.diseases[sighting.diseaseId]
  scope = agent.spreadsTo ?? "neighbors"
  source = instance(sighting.instanceId)
  for each active instance I in garden (I != source):
    hostMatch = agent.hosts.find(h => h.plantId == I.plantId || h.familyId == I.plant.familyId)
    if not hostMatch or hostMatch.susceptibility == "low": continue
    inScope =
      scope == "wide" ? true :
      scope == "family" ? sameFamily(I, source) :
      adjacentOrSameArea(I, source)            // "neighbors"
    if inScope:
      raiseWatchAlert(I, agent)                // "watch for {agent} spreading from {source.plant}"
      optionally createTask({ kind: "custom", title: "Scout {I.plant} for {agent.commonName}" })
```

**Tie-ins:**
- **Encyclopedia:** a plant's pests/diseases derive from `hosts` (the `commonPests`/`commonDiseases` arrays remain only as a quick denormalized cache).
- **Diagnostics (§14):** terminal `diagnosis` nodes may carry a `pestId`/`diseaseId`; the UI pulls that entity's `controls` and offers "log this sighting," which writes a `PestSighting` and fires the cross-warning.
- **Designer (§12 / §20):** watch alerts surface as badges on at-risk neighboring tiles.
- **Waterlogging link:** diseases with `favoredConditions` including poor drainage (e.g., damping-off, Phytophthora root rot) get a higher prior when §31.2 risk is high.

**Roadmap:** Phase 5 (depth). Ship a modest curated set (aphid, flea beetle, cabbage moth/looper, hornworm, slug, spider mite; early/late blight, powdery/downy mildew, damping-off, blossom-end rot as abiotic, clubroot) and expand later.

### 31.4 Harvest logging and analytics export

**Intent:** the original spec tracked stages and a yield *estimate*, but logged no *actual* harvest quantities, so there was nothing to analyze. This adds the dependent variable and a tidy export so the data is usable in Python/R/Excel.

**Model (user data, store `harvestEvents`):**
```ts
interface HarvestEvent {
  id: string;
  instanceId: string;
  date: string;
  quantity?: number;
  unit?: "g" | "kg" | "count" | "bunch" | "L";
  qualityNote?: string;
  photoEntryId?: string;
}
```

**Tie-ins:**
- A **"Log harvest"** action appears on instances at or past the `harvest` stage; a running total accrues per instance and per garden/season. Surfaces alongside the harvest-ready recipe nudge (§18).
- Feeds the recommendation/notes loop over time (e.g., "this bed produced X last season").

**Flat/tidy CSV export (add to §23 alongside JSON backup):**
Emit long-format, one-observation-per-row, ISO dates, stable column order:
- `instances.csv`: id, gardenName, areaName, plantId, varietalId, plantingMethod, plantedOn, currentStage, status, tileCount, lat, lon.
- `stage_events.csv`: instanceId, plantId, stage, enteredOn, source, daysInPreviousStage.
- `harvests.csv`: instanceId, plantId, date, quantity, unit, qualityNote.
- `instance_daily.csv` (**the marquee, regression-ready table**): instanceId, plantId, date, stageOnDate, cumulativeGDD, tMinC, tMaxC, precipMm, waterDeficitMm. One row per instance per day from `plantedOn` to terminal status; GDD from §27.2, weather from the cached climate/forecast records.
- Optional: `tasks.csv`, `sightings.csv`.

This is what lets the user regress yield (from `harvests.csv`) against accumulated heat and water (from `instance_daily.csv`) without reshaping JSON by hand.

**Roadmap:** `HarvestEvent` + logging in Phase 3 (so data accrues from first use); CSV export in Phase 5.

### 31.5 Aerial / reference-image underlay (Designer)

**Intent:** let the user trace real beds over a top-down photo (drone orthomosaic, satellite capture, hand sketch) instead of laying out on a blank grid.

**Model (on `Garden`, image blob in `blobs` store):**
```ts
interface GardenBackground {
  blobId: string;            // image stored in IndexedDB
  opacity: number;           // 0..1
  rotationDeg: number;
  offset: { x: number; y: number };
  locked: boolean;           // prevents accidental drag while placing tiles
  calibration?: {            // two-point real-world scale
    p1: { x: number; y: number };   // image-space point
    p2: { x: number; y: number };
    realDistanceCm: number;          // known distance between p1 and p2
  };
}
```

**Two-point calibration flow (the detail that makes tracing accurate):**
1. User imports an image; it renders as the bottom Konva layer at low opacity.
2. User taps two points a known distance apart (a bed edge, fence run, driveway width) and enters that distance.
3. App computes pixels-per-cm from the two points and `realDistanceCm`, then derives the grid's `cellSizeCm` (or scales the image) so one tile equals a true real-world square. The user then traces beds tile by tile.

**Tech:** bottom layer in the Konva stage below terrain; opacity slider, rotate, lock toggle; image persists as a Blob. No network. Honest limitation noted in-app: accuracy is only as good as the calibration and a roughly orthorectified image.

**Roadmap:** Phase 2 (Designer core).

### 31.6 Hardware / maker references (lowest priority, tightly scoped)

**Intent:** bridge the digital plan to physical execution for custom structures, without becoming an e-commerce or CAD product.

**Model (optional, on a small `StructureDefinition` catalog keyed by `StructureKind`):**
```ts
interface StructureDefinition {
  kind: StructureKind;
  label: string;
  defaultHeightCm: number;
  hardwareRefs?: Array<{ label: string; url: string; kind: "stl" | "parts_list" | "guide" }>;
}
```

**Tie-in:** when a structure is selected on the grid, its inspector shows any `hardwareRefs` as outbound links (printable STL for a custom trellis joint or row-cover clip, a parts list, a build guide).

**Hard scope cap (restate as non-goals):** no parametric or generated geometry, no on-device CAD, no purchasing/checkout. Just curated links. Build this last; it must never pull effort from the core.

**Roadmap:** Phase 6 (optional).

### 31.7 Roadmap deltas summary
- **Phase 1:** + soil-drainage/waterlogging model and risk algorithm (§31.2).
- **Phase 2:** + aerial underlay with two-point calibration (§31.5).
- **Phase 3:** + `HarvestEvent` and harvest logging (§31.4); + waterlogging diagnostic branches and alerts (§31.2); seed-viability `autoCheck` if packets exist (§31.1).
- **Phase 4:** + seed inventory and stash badges, inventory-aware recommendations (§31.1).
- **Phase 5:** + relational pests/diseases, sightings, cross-warnings (§31.3); + tidy CSV/analytics export (§31.4).
- **Phase 6:** + hardware references (§31.6).

### 31.8 Decisions added for the builder (extends §30)
9. Waterlogging auto-advance pause: default OFF; confirm the warning-and-diagnostic path is the primary mechanism.
10. Pest/disease cross-warning radius for `spreadsTo: "neighbors"`: define "adjacent" precisely (8-neighborhood tiles vs same-area vs a cm radius). Default: same area plus directly adjacent tiles across areas within ~1 m.
11. Drainage capacity constants in §31.2 are rough; expose them as tunable and document the assumption.
12. Calibration vs grid: decide whether two-point calibration adjusts `cellSizeCm` or scales the image to a fixed `cellSizeCm`. Default: scale the image, keep `cellSizeCm` user-set.

---

## 32. v1.2 Extensions (field UX, visualization, and feel)

All of Section 32 is back-half work. None of it may be built before the Phase 0 to 3 core runs, and none of it may regress the §25 performance budget or the §24 reduced-motion commitment. Corrections to the original feature framing are baked in as design notes rather than left implicit.

### 32.1 Field "dirty hands" mode

**Intent:** make the app usable in situ with muddy hands, gloves, or wet fingers.

**Field UI (`Settings.fieldMode`):** a toggle that swaps the normal chrome for a stripped layout: a few large, high-contrast cards (today's tasks, the active garden's instances), oversized hit targets (minimum ~64 px), heavier type, no dense menus. The grid canvas is read-mostly in this mode (tap a tile to act; panning de-emphasized) because precise placement is not a field task.

**Swipe-to-log:** a broad, forgiving horizontal swipe on a **task card or instance card** marks today's care (water/fertilize) complete and writes the relevant `Task`/instance update. *Design note:* swipe-to-log lives on cards, not on the grid canvas, where a broad swipe would fight pan/zoom. Swipes are forgiving (large threshold, undo toast).

**Voice memo (split into two layers):**
- *Capture (works offline, required):* a giant microphone button records audio via `MediaRecorder` and stores it as a `JournalEntry` with `photoBlobId` reused for the audio blob (or add `audioBlobId`). Tag target is the **currently selected/last-viewed instance**, or a one-tap instance picker if none is selected.
- *Transcription (progressive enhancement, optional):* if the Web Speech API (`SpeechRecognition`) is available, offer to transcribe into `JournalEntry.text`. *Design note:* this API is effectively Chrome-only, frequently routes audio to a remote service, and is absent/poor on iOS Safari, so it must never be a dependency. Always keep the audio; transcription is a bonus when present.

*Dropped from the original ask (not web capabilities):* knuckle-tap detection and proximity wake (the proximity sensor API is removed from browsers), and "auto-tag to the nearest physical plant" (the grid is not geolocated per-plant, so the app cannot know which real plant the user stands near; use selected-instance or a picker instead).

**Roadmap:** Phase 5. Field mode's layout can land earlier (Phase 4) cheaply if desired.

### 32.2 Embedded 3D hardware viewer

**Intent:** preview a 3D-printable part (custom trellis joint, row-cover clip, irrigation manifold) inside the app before exporting to a slicer. Extends §31.6.

**Spec:** in a structure's inspector, render an embedded 3D preview the user can orbit/zoom.
*Design note (correction):* `<model-viewer>` renders glTF/GLB, not STL. Either (a) ship GLB previews and keep STL only as the export link, or (b) render STL directly with three.js + `STLLoader`. Prefer GLB for preview + STL for download. The 3D lib adds bundle weight, so lazy-load it only when a viewer opens; cache any remote model in IndexedDB so the offline-first guarantee holds.

**Hardware-snap feedback:** dropping a structure on the grid plays a brief snap animation (and a sound only if `feel.soundEnabled`). Grid snapping itself already exists (§12.2); this only adds the animation, gated by `feel.placementJuice` and `reducedMotion`.

**Roadmap:** Phase 6, optional. Lowest priority in the entire spec.

### 32.3 Time Machine scrubber (flagship)

**Intent:** drag a timeline and watch the season play out: plants morph through growth stages, shadows stretch and shift, and ghost/succession plantings appear on their future dates. Validates succession and layout visually in seconds.

**Spec:** a scrubbable horizontal timeline anchored at the bottom of the Designer. The scrub date is a single input to pure render selectors that already exist:
- **Stages:** resolve each `PlantInstance`'s stage at the scrub date from `projectedStageDates` (and GDD pacing where available); swap the sprite accordingly.
- **Shadows/sun:** render the sun overlay (§12.8) for the scrub date.
- **Ghosts:** show planned/succession instances whose `plantedOn` is on or before the scrub date, faded until "today" reaches them.

*Design note (performance):* do not recompute the sun model per frame. Precompute sun maps for the chosen sample dates and **interpolate** between them during scrubbing; throttle redraws; memoize stage-on-date lookups. Honors the §25 guardrail (pauses when hidden, throttles on low tier, respects reduced-motion by snapping to discrete steps instead of animating).

**Roadmap:** Phase 5. Depends on Designer (Phase 2), tracking (Phase 3), and the sun overlay. Treat as a differentiator, not filler.

### 32.4 In-app analytics and yield dashboard

**Intent:** surface trends in the UI without forcing a CSV export. Complements, does not replace, §31.4.

**Views:**
- **Activity heatmaps (calendar / GitHub-style):** per-day intensity grids, one per metric (harvest yield, watering events, sowings), driven by `harvestEvents`, `tasks`, and `stageEvents`.
- **GDD-vs-yield scatter:** plot accumulated GDD (from `instance_daily`) against harvested `quantity` per instance, faceted by area/bed so the user can spot which microclimate produced more. *Design note (correction + expectation):* call it a scatter with an **optional simple trend line** (linear or LOESS), not a "regression spline." It only becomes meaningful after one to two seasons of harvest logs; early on the sample is a few points. Label this in the UI so the chart is not over-read.
- Optional: days-in-stage distributions, water/precip balance over time.

*Design note:* compute over IndexedDB-backed queries with memoized selectors; virtualize/aggregate so large histories stay within the perf budget. The full tidy CSVs remain for users who want real statistics in R/Python.

**Roadmap:** Phase 5.

### 32.5 Environmental feedback overlays (water)

**Intent:** make waterlogging risk (§31.2) visible the way the sun overlay makes light visible, instead of relying on text alone.

**Dynamic grid textures:** when `waterloggingRisk(tile)` is `elevated`/`high`, swap/augment the tile sprite: darker saturated soil, visible puddles on low-elevation tiles, an optional subtle ripple animation (gated by `feel`/`reducedMotion`/tier). Driven entirely by the existing risk algorithm (precip + drainage + depression depth), no new model.

**Soil-saturation overlay toggle:** a heat overlay parallel to the sun/shade overlay, coloring tiles dry-tan to flooded-blue by saturation/risk. Same toggle UX as the sun map; both can be shown, with clear legends and non-color cues (§24).

*Design note:* weather-driven, so when offline the overlay falls back to the last cached risk and the ambient puddle animation simply does not appear.

**Roadmap:** Phase 5 (the saturation overlay can land with the waterlogging diagnostics in Phase 3 if convenient, since the risk math is already there).

### 32.6 Micro-interactions ("juice")

**Intent:** make the cozy pixel aesthetic feel tactile, without violating the motion/perf/sound commitments.

**Effects (all gated, see §32.7):**
- Planting: a pixel-dirt puff animation and a haptic tick on placement.
- Harvesting/removal: a "pop" animation, optional jingle, optional drop of a pixel veg into a UI basket/tally.
- Ambient weather: subtle, low-opacity rain/snow particles across the Designer when the `WeatherAdapter` reports active precipitation.

**Hard design notes:**
- **Haptics** use the WebVibration API, which is Android-only; `navigator.vibrate` is unsupported on iOS Safari, so it must no-op cleanly there.
- **Sound** defaults OFF and only plays after a user gesture (browsers block audio autoplay regardless). Never auto-play on load.
- **Ambient particles** must be GPU-cheap, capped in count, paused when the tab is hidden, disabled in Field mode and `performanceTier: "low"`, and absent when offline.
- All motion respects `reducedMotion` (when on, effects are removed or reduced to instant state changes).

**Roadmap:** Phase 5 (folds in with the features it decorates).

### 32.7 Presentation, feel, and performance settings (connective tissue)

**Intent:** one coherent surface governing everything in Section 32 so the additions cooperate instead of fighting. Without it, ambient animation, autoplay sound, and constant juice would each violate the §24 reduced-motion rule and the §25 perf budget. Fields are defined in the extended `Settings` interface (§7.12).

**Behavior:**
- `fieldMode`: chunky field UI (§32.1); forces `ambientWeather` off and biases toward `performanceTier: "low"`.
- `reducedMotion` (`system`/`on`/`off`, default `system`): the master gate for all animation in §32; when effectively on, Time Machine snaps to steps, overlays stop animating, juice becomes instant.
- `performanceTier` (`auto`/`high`/`low`): `low` disables ambient FX, throttles the sun/saturation/Time Machine recompute, and reduces sprite animation. `auto` may derive from device hints and frame timing.
- `feel.soundEnabled` (default false), `feel.hapticsEnabled` (default true, no-op where unsupported), `feel.ambientWeather` (default true on high tier), `feel.placementJuice` (default true).

**Global rule (mirrored in §25):** any animated or compute-heavy feature pauses on `document.hidden`, throttles under low tier, respects `reducedMotion`, degrades gracefully offline, and holds the 60fps grid target.

**Roadmap:** the settings surface lands in Phase 4 (so later phases have it to gate against); individual effects attach in Phase 5.

### 32.8 Roadmap deltas summary
- **Phase 3 (optional pull-forward):** soil-saturation overlay (§32.5) since the risk math exists.
- **Phase 4:** presentation/feel/performance settings surface (§32.7); Field UI layout (§32.1) optional here.
- **Phase 5:** Field mode behaviors + voice memo (§32.1), Time Machine scrubber (§32.3), in-app analytics (§32.4), environmental textures and overlay (§32.5), juice (§32.6).
- **Phase 6:** embedded 3D hardware viewer (§32.2).

### 32.9 Decisions added for the builder (extends §30 and §31.8)
13. Voice transcription: confirm it is a progressive enhancement with audio-only fallback; never block the field workflow on it.
14. 3D preview: GLB-preview-plus-STL-download vs direct STL via three.js. Default: GLB preview, STL download, lazy-loaded, cached.
15. Trend line for the GDD-vs-yield scatter: linear vs LOESS vs none until N is sufficient. Default: none until at least ~8 harvest points, then linear.
16. `performanceTier: "auto"` heuristic: define the device/frame-timing signals used, or ship `high`/`low` manual only for v1.2.
17. Ambient particle budget: cap and frame-time ceiling at which particles auto-disable.
