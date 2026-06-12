/**
 * PLOT — data model contracts.
 *
 * Every interface in spec §7 (core models) and §31 (v1.1 extensions), types
 * only, no logic (per the implementation protocol, §0.1 step 2). Section
 * references in the comments point into docs/SPEC.md.
 *
 * Conventions:
 * - All measurements are metric internally (§0); rendering converts.
 * - All dates are ISO-8601 strings.
 * - All entity ids are UUID v4 unless the catalog uses a semantic slug
 *   (e.g. plant "tomato").
 */

// ---------------------------------------------------------------------------
// §7.2 PlantFamily — crop rotation and shared pest/disease grouping
// ---------------------------------------------------------------------------

export interface PlantFamily {
  id: string; // "solanaceae"
  commonName: string; // "Nightshade family"
  rotationGroup: string; // "fruiting" | "leafy" | "root" | "legume" | "brassica" | ...
  notes?: string;
}

// ---------------------------------------------------------------------------
// §7.3 Plant — the central catalog entity
// ---------------------------------------------------------------------------

export type PlantCategory =
  | "vegetable"
  | "herb"
  | "fruit"
  | "flower"
  | "cover_crop"
  | "shrub"
  | "tree";

export type Lifecycle = "annual" | "biennial" | "perennial";
export type Level = "low" | "medium" | "high";
export type FrostTolerance = "tender" | "half_hardy" | "hardy";
export type SunRequirement = "full" | "partial" | "shade"; // full >= 6h, partial 3-6h, shade < 3h
export type Photoperiod = "day_neutral" | "short_day" | "long_day";
export type PlantingMethod = "direct_sow" | "indoor_start" | "transplant";
export type Difficulty = "easy" | "moderate" | "hard";

export interface Plant {
  id: string; // "tomato"
  commonName: string;
  scientificName: string;
  familyId: string; // -> PlantFamily
  category: PlantCategory;
  lifecycle: Lifecycle;
  // --- Climate gating ---
  hardinessZones: { min: number; max: number }; // USDA numeric; annuals: tolerance band
  heatTolerance: Level;
  frostTolerance: FrostTolerance; // gates relation to frost dates
  waterloggingSensitivity: Level; // §31.2; high = lavender/rosemary/tomato
  seedViabilityYears?: number; // typical seed longevity; default for SeedPacket (§31.1)
  minSoilTempC: number; // germination floor, e.g. tomato ~15.5
  optSoilTempC?: { min: number; max: number };
  gddBaseTempC?: number; // for GDD maturity, e.g. 10
  gddToMaturity?: number; // optional alternative to DTM
  daysToMaturity: { min: number; max: number; from: "sow" | "transplant" };
  photoperiod?: Photoperiod;
  // --- Placement / site ---
  sun: SunRequirement;
  sunHoursMin: number; // numeric for sun-map comparison, e.g. 6
  waterNeed: Level;
  waterMmPerWeek?: { min: number; max: number }; // for watering engine
  soilPh: { min: number; max: number };
  soilPreference?: string[]; // ["well-drained","loamy"]
  matureHeightCm: { min: number; max: number }; // drives shadow casting
  matureSpreadCm: { min: number; max: number };
  // --- Spacing ---
  spacing: {
    inRowCm: number;
    betweenRowCm: number;
    squareFootCount?: number; // plants per 1 ft square if using SFG
  };
  // --- Planting method/timing rules (relative to frost dates) ---
  plantingMethods: PlantingMethod[];
  sowRules: {
    // weeks relative to last spring frost (negative = before). Absent if not applicable.
    indoorStartWeeksFromLastFrost?: { min: number; max: number }; // e.g. -8..-6
    directSowWeeksFromLastFrost?: { min: number; max: number }; // e.g. 1..3
    transplantWeeksFromLastFrost?: { min: number; max: number }; // e.g. 1..2
    fallWeeksFromFirstFrost?: { min: number; max: number }; // fall/cool crops, before first frost
    plantingDepthCm: number;
    germinationDays: { min: number; max: number };
  };
  // --- Lifecycle modeling ---
  stageTemplateId: string; // -> GrowthStageTemplate
  // --- Care ---
  fertilization: {
    schedule: Array<{
      atStage: StageKey; // when to feed
      type: string; // "balanced 10-10-10" | "nitrogen" | "compost top-dress"
      intervalDays?: number; // repeat cadence if ongoing
      notes?: string;
    }>;
  };
  supportStructures?: Array<
    "trellis" | "cage" | "stake" | "mound" | "row_cover"
  >; // hints for grid structures
  // --- Pests / disease / companions ---
  commonPests: string[]; // denormalized convenience; cross-warnings derive from Pest.hosts (§31.3)
  commonDiseases: string[]; // denormalized convenience; see Disease.hosts (§31.3)
  // companions handled via CompanionRelationship to keep it relational
  // --- Outputs ---
  harvest: {
    windowDays?: { min: number; max: number }; // how long harvest lasts once it starts
    yieldPerPlant?: string; // "3-5 kg" (human-readable ok)
    indicators: string[]; // "fruit fully colored, slight give"
    method?: string;
  };
  // --- Content ---
  varietalIds: string[]; // -> Varietal[]
  recipeIds: string[]; // -> Recipe[]
  difficulty: Difficulty;
  description: string;
  iconKey: string; // base sprite key; stages resolve to iconKey + stage
  tags: string[]; // "container-friendly","pollinator","fast","shade-tolerant"
}

// ---------------------------------------------------------------------------
// §7.4 Varietal
// ---------------------------------------------------------------------------

export interface Varietal {
  id: string;
  plantId: string;
  name: string; // "Sungold"
  description: string;
  daysToMaturity?: { min: number; max: number }; // overrides plant if present
  traits: string[]; // "cherry","indeterminate","disease-resistant VFN","heat-tolerant"
  colorHex?: string; // tints the sprite if desired
  flavorNotes?: string;
  bestFor?: string[]; // "containers","short-season","fresh eating"
}

// ---------------------------------------------------------------------------
// §7.5 Recipe
// ---------------------------------------------------------------------------

export interface Recipe {
  id: string;
  title: string;
  plantIds: string[]; // featured ingredients linking back to plants
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: Array<{
    item: string;
    quantity: number;
    unit?: string;
    plantId?: string;
  }>;
  steps: string[];
  usesStage?: StageKey; // e.g. uses "harvest" produce; or thinnings for microgreens
  tags: string[]; // "preserving","quick","vegetarian"
}

// ---------------------------------------------------------------------------
// §7.6 GrowthStageTemplate and stages — the spine of tracking
// ---------------------------------------------------------------------------

export type StageKey =
  | "planted" // seed in ground / transplant set
  | "germination" // (seed only) emergence underway
  | "sprout" // cotyledons / first emergence above soil
  | "seedling" // true leaves
  | "vegetative" // active leafy growth
  | "budding" // flower buds / heading
  | "flowering" // (or "heading" for brassicas/lettuce)
  | "fruiting" // fruit/pod/root sizing
  | "harvest" // ready / harvesting
  | "senescence" // spent / end of life
  | "dormant"; // perennials overwintering

export interface GrowthStageTemplate {
  id: string;
  appliesTo: string; // plant id or family, for reuse
  // Ordered stages this plant actually passes through (subset of StageKey, in order)
  sequence: StageKey[];
  // Typical days each stage lasts under good conditions. Modeled on calendar days,
  // optionally scaled by GDD when climate data is present (§13.3).
  stageDurations: Partial<
    Record<StageKey, { min: number; typical: number; max: number }>
  >;
  // Optional per-stage care prompts shown in the tracker
  stageCareHints?: Partial<Record<StageKey, string[]>>;
}

// ---------------------------------------------------------------------------
// §7.7 CompanionRelationship
// ---------------------------------------------------------------------------

export interface CompanionRelationship {
  aPlantId: string;
  bPlantId: string;
  type: "beneficial" | "antagonistic";
  reason: string; // "deters aphids" | "competes for nitrogen" | "allelopathic"
  strength: "weak" | "moderate" | "strong";
}

// ---------------------------------------------------------------------------
// §7.8 Location and ClimateProfile
// ---------------------------------------------------------------------------

export interface Location {
  id: string;
  label: string; // "Home — Pacific City"
  lat: number;
  lon: number;
  elevationM?: number;
  source: "geolocation" | "geocode" | "manual";
}

export interface ClimateProfile {
  id: string;
  locationId: string;
  hardinessZone?: string; // "9a"
  lastSpringFrost: { p50: string; p10: string }; // ISO month-day or date; probabilistic
  firstFallFrost: { p50: string; p10: string };
  frostFreeDays?: number;
  // Monthly climate normals (for windows, GDD estimation, watering deficit)
  monthlyNormals?: Array<{
    month: number; // 1..12
    tMinC: number;
    tMaxC: number;
    precipMm: number;
    etoMm?: number; // reference evapotranspiration if available
  }>;
  microclimateNotes?: string; // "coastal, mild summers, frequent fog, frost rare"
  derivedFrom: "api" | "manual" | "zone_default";
  fetchedAt?: string;
}

// ---------------------------------------------------------------------------
// §7.9 Garden, GardenArea, Tile — the grid model (plus §31.5 background)
// ---------------------------------------------------------------------------

export interface Garden {
  id: string;
  name: string; // "Backyard 2026"
  locationId: string;
  unitSystem: UnitSystem;
  // Whole-garden orientation: bearing in degrees that "up/north on screen" maps to.
  // 0 = screen-up is true north. Lets the user rotate the plot to reality.
  northBearingDeg: number;
  areas: GardenArea[];
  background?: GardenBackground; // §31.5 aerial/reference underlay
  createdAt: string;
  updatedAt: string;
}

export type SoilDrainage = "fast" | "moderate" | "poor";

export interface GardenArea {
  id: string;
  name: string; // "Raised bed A", "Patio containers"
  kind: "in_ground" | "raised_bed" | "container_group" | "field";
  soilDrainage: SoilDrainage; // §31.2; combines with tile elevation for waterlogging risk
  // Position of this area's origin within the garden canvas (for satellite layout)
  origin: { x: number; y: number }; // in garden canvas units
  rotationDeg: number; // area can be rotated independently of garden north
  grid: {
    cols: number;
    rows: number;
    cellSizeCm: number; // real-world size of one tile edge (e.g. 30.48 = 1 ft)
  };
  tiles: Tile[]; // sparse: only non-empty tiles stored
}

export type StructureKind =
  | "trellis"
  | "cage"
  | "stake"
  | "mound"
  | "raised_edge"
  | "fence"
  | "arch"
  | "cold_frame"
  | "row_cover";

export type HardscapeKind =
  | "path"
  | "rock"
  | "grass"
  | "mulch"
  | "paver"
  | "soil"
  | "gravel";

export type WaterFeatureKind =
  | "drip_line"
  | "soaker_hose"
  | "sprinkler_head"
  | "rain_barrel"
  | "pond"
  | "spigot";

export type TileContent =
  | { type: "empty" }
  | { type: "plant"; instanceId: string } // -> PlantInstance
  | { type: "structure"; structure: StructureKind; heightCm: number }
  | { type: "hardscape"; hardscape: HardscapeKind }
  | { type: "water"; water: WaterFeatureKind };

export interface Tile {
  col: number;
  row: number;
  elevationCm: number; // relative elevation for slope/frost-pocket modeling
  content: TileContent;
  // Derived (not stored, computed by SunModel): sunHoursEstimate, isFrostPocket
}

// ---------------------------------------------------------------------------
// §7.10 PlantInstance and StageEvent — a real planted thing
// ---------------------------------------------------------------------------

/**
 * Note: §7.10 listed "active | harvested | removed | failed", but §12.6 and
 * §15 require a pre-planting ghost state ("planned") for placements without a
 * logged planting date and for future succession placements. Added here;
 * flagged as a spec reconciliation in the build log (per §0.1 rule 7).
 */
export type InstanceStatus =
  | "planned" // ghost placement; becomes active when plantedOn is logged (§12.6, §15)
  | "active"
  | "harvested"
  | "removed"
  | "failed";

export interface PlantInstance {
  id: string;
  gardenId: string;
  areaId: string;
  plantId: string;
  varietalId?: string;
  // placement: one or more tiles (a tomato is one tile; a row of carrots may span tiles)
  tiles: Array<{ col: number; row: number }>;
  plantingMethod: "direct_sow" | "transplant";
  plantedOn: string; // ISO date the user logged (planned ghosts: the intended date)
  // Stage state machine:
  currentStage: StageKey;
  // The schedule of expected stage-entry dates, computed at planting and on edits.
  projectedStageDates: Partial<Record<StageKey, string>>;
  // History of stage transitions (auto and manual); also stored relationally in stageEvents
  events: StageEvent[];
  status: InstanceStatus;
  watering: {
    mode: "auto" | "manual";
    lastWateredOn?: string;
    customMmPerWeek?: number; // override plant default
  };
  fertilizing: {
    lastFedOn?: string;
    nextDueOn?: string;
  };
  notes?: string;
  photoEntryIds: string[]; // -> JournalEntry
}

export interface StageEvent {
  id: string;
  instanceId: string;
  stage: StageKey;
  enteredOn: string; // ISO date
  source: "auto" | "manual_advance" | "manual_rollback";
  diagnosticId?: string; // if a rollback triggered a diagnostic session
  note?: string;
}

// ---------------------------------------------------------------------------
// §7.11 DiagnosticTree — rollback diagnosis decision trees
// ---------------------------------------------------------------------------

/**
 * AutoCheck values the app can pre-answer from its own data. Base set from
 * §7.11; "seed_past_viability" added by §31.1, "soil_saturated_recent" by §31.2.
 */
export type AutoCheck =
  | "soil_temp_below_min"
  | "days_exceeded_expected"
  | "no_recent_water"
  | "low_light"
  | "seed_past_viability"
  | "soil_saturated_recent"
  | null;

export interface DiagnosticTree {
  id: string;
  // What triggers it: a stage where delay/rollback commonly happens, plus optional scope
  symptom: string; // "germination_delay" | "stunted_growth" | "yellowing_leaves" | "bolting" | "no_fruit" | ...
  appliesToStage?: StageKey;
  scope?: { plantId?: string; familyId?: string };
  root: DiagnosticNode;
}

export interface DiagnosticNode {
  id: string;
  question: string; // "Has soil temperature stayed below the plant's minimum?"
  // Which data the app can check itself (soil temp, days elapsed, water log, ...)
  autoCheck?: AutoCheck;
  yes: DiagnosticBranch;
  no: DiagnosticBranch;
}

export type DiagnosticBranch =
  | { kind: "node"; node: DiagnosticNode }
  | {
      kind: "diagnosis";
      cause: string;
      remedy: string;
      createsTask?: Partial<Task>;
      // §31.3: a diagnosis may point at a catalog pest/disease so the UI can
      // pull its controls and offer "log this sighting".
      pestId?: string;
      diseaseId?: string;
    };

// ---------------------------------------------------------------------------
// §7.12 Task / Reminder, JournalEntry, Settings
// ---------------------------------------------------------------------------

export type TaskKind =
  | "water"
  | "fertilize"
  | "sow"
  | "transplant"
  | "harvest"
  | "harden_off"
  | "succession"
  | "custom"
  | "remedy";

export interface Task {
  id: string;
  gardenId?: string;
  instanceId?: string;
  kind: TaskKind;
  title: string;
  dueOn: string;
  recurrence?: { everyDays: number; until?: string };
  done: boolean;
  source: "auto" | "user";
}

export interface JournalEntry {
  id: string;
  instanceId?: string;
  gardenId?: string;
  date: string;
  text?: string;
  photoBlobId?: string; // image stored in IndexedDB as Blob
  audioBlobId?: string; // §32.1 field-mode voice memo (audio Blob)
  stageAtEntry?: StageKey;
}

export type UnitSystem = "metric" | "imperial";
export type Hemisphere = "northern" | "southern";

export interface Settings {
  unitSystem: UnitSystem;
  hemisphere: Hemisphere; // flips seasonal logic
  notificationsEnabled: boolean;
  theme: "light" | "dark" | "system";
  defaultLocationId?: string;
  // §31.2: pause auto-advance under waterlogging stress (default OFF; the
  // warning/diagnostic path is the primary mechanism)
  pauseAdvanceOnWaterloggingStress?: boolean;
  // --- v1.2 presentation, field, and performance (§32.7) ---
  fieldMode: boolean; // chunky "dirty hands" UI
  reducedMotion: "system" | "on" | "off"; // default "system"; gates all animation
  performanceTier: "auto" | "high" | "low"; // "low" disables ambient FX, throttles recompute
  feel: {
    soundEnabled: boolean; // default FALSE (autoplay is blocked anyway)
    hapticsEnabled: boolean; // default true; no-ops where unsupported (iOS)
    ambientWeather: boolean; // default true on high tier, off on low/field
    placementJuice: boolean; // dirt puff / snap / pop animations; default true
  };
}

// ---------------------------------------------------------------------------
// §31.1 Seed and inventory management
// ---------------------------------------------------------------------------

export interface SeedPacket {
  id: string;
  plantId: string;
  varietalId?: string; // optional; seed may be generic/unlabeled or self-saved
  source?: string; // brand or "saved 2024"
  packedForYear?: number; // PRIMARY viability anchor (printed on packet)
  purchaseYear?: number; // fallback anchor
  viabilityYearsOverride?: number; // else use plant.seedViabilityYears
  quantity: "high" | "low" | "empty"; // coarse default
  quantityCount?: number; // optional exact count/grams
  storage?: "cool_dry" | "fridge" | "ambient";
  notes?: string;
  addedAt: string;
}

/** Derived by the pure viabilityScore() fn (§31.1); never stored. */
export type ViabilityScore = "fresh" | "good" | "aging" | "expired";

// ---------------------------------------------------------------------------
// §31.2 Waterlogging risk (model fields live on Plant/GardenArea above)
// ---------------------------------------------------------------------------

/** Bucketed output of waterloggingRisk() (§27.10 / §31.2); never stored. */
export type WaterloggingRisk = "none" | "elevated" | "high";

// ---------------------------------------------------------------------------
// §31.3 Relational pests and diseases
// ---------------------------------------------------------------------------

export interface HostLink {
  plantId?: string;
  familyId?: string;
  susceptibility: Level;
}

export type ContagionScope = "neighbors" | "family" | "wide";

export interface Pest {
  id: string;
  commonName: string;
  scientificName?: string;
  description: string;
  signs: string[]; // "stippled leaves","sticky honeydew","skeletonized foliage"
  hosts: HostLink[];
  controls: {
    cultural: string[];
    mechanical: string[];
    biological: string[];
    chemical?: string[];
  };
  spreadsTo?: ContagionScope; // contagion scope for cross-warnings
  favoredConditions?: string[];
}

export interface Disease {
  id: string;
  commonName: string;
  pathogenType: "fungal" | "bacterial" | "viral" | "abiotic";
  description: string;
  signs: string[];
  hosts: HostLink[];
  favoredConditions: string[]; // "warm wet foliage","poor drainage","high humidity"
  controls: {
    cultural: string[];
    mechanical: string[];
    biological: string[];
    chemical?: string[];
  };
  spreadsTo?: ContagionScope;
}

export interface PestSighting {
  // user observation on a specific plant
  id: string;
  instanceId: string;
  pestId?: string;
  diseaseId?: string;
  observedOn: string;
  severity: Level;
  note?: string;
  photoEntryId?: string;
}

// ---------------------------------------------------------------------------
// §31.4 Harvest logging
// ---------------------------------------------------------------------------

export interface HarvestEvent {
  id: string;
  instanceId: string;
  date: string;
  quantity?: number;
  unit?: "g" | "kg" | "count" | "bunch" | "L";
  qualityNote?: string;
  photoEntryId?: string;
}

// ---------------------------------------------------------------------------
// §31.5 Aerial / reference-image underlay (lives on Garden.background)
// ---------------------------------------------------------------------------

export interface GardenBackground {
  blobId: string; // image stored in IndexedDB
  opacity: number; // 0..1
  rotationDeg: number;
  offset: { x: number; y: number };
  locked: boolean; // prevents accidental drag while placing tiles
  calibration?: {
    // two-point real-world scale
    p1: { x: number; y: number }; // image-space point
    p2: { x: number; y: number };
    realDistanceCm: number; // known distance between p1 and p2
  };
}

// ---------------------------------------------------------------------------
// §31.6 Hardware / maker references
// ---------------------------------------------------------------------------

export interface StructureDefinition {
  kind: StructureKind;
  label: string;
  defaultHeightCm: number;
  hardwareRefs?: Array<{
    label: string;
    url: string;
    kind: "stl" | "parts_list" | "guide";
  }>;
}
