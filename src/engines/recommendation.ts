/**
 * RecommendationEngine (§16, §27.9): score every catalog plant for this
 * site and moment; return ranked results with the top contributing reasons.
 * §31.1 adds an inventory bonus for plants with viable seed in the stash.
 */

import type {
  ClimateProfile,
  CompanionRelationship,
  Garden,
  Hemisphere,
  Plant,
  PlantInstance,
  SeedPacket,
} from "../types/models";
import { zoneNumeric } from "./climate";
import { daysUntilOpen, openNow, windowsFor } from "./plantingWindows";
import { stashBadge } from "./inventory";
import { diffDays, todayISO, yearOf, type ISODate } from "../lib/dates";

export interface RecommendationPrefs {
  easyOnly?: boolean;
  fastOnly?: boolean;
  pollinatorFriendly?: boolean;
  experience?: "beginner" | "intermediate" | "advanced";
}

export interface Recommendation {
  plant: Plant;
  score: number;
  reasons: string[];
  stash: ReturnType<typeof stashBadge>;
  opensInDays: number | null; // negative = already open
}

const W = {
  zone: 2.5,
  season: 3,
  sun: 1.5,
  space: 1,
  water: 1,
  companion: 0.8,
  rotation: 2,
  difficulty: 1,
  inventory: 1.2,
} as const;

export interface SiteContext {
  climate: ClimateProfile;
  hemisphere: Hemisphere;
  garden?: Garden | null;
  instances?: PlantInstance[];
  packets?: SeedPacket[];
  companions?: CompanionRelationship[];
  plantsById?: Map<string, Plant>;
  /** best tile sun-hours available, when a sun map has been computed */
  maxTileSunHours?: number;
  today?: ISODate;
}

export function recommend(plants: Plant[], site: SiteContext, prefs: RecommendationPrefs = {}): Recommendation[] {
  const today = site.today ?? todayISO();
  const year = yearOf(today);
  const zone = zoneNumeric(site.climate.hardinessZone);
  const out: Recommendation[] = [];

  const freeTiles = site.garden ? countFreeTiles(site.garden) : undefined;
  const placedPlantIds = new Set((site.instances ?? []).map((i) => i.plantId));
  const recentFamilies = new Set(
    (site.instances ?? [])
      .filter((i) => Number(i.plantedOn.slice(0, 4)) >= year - 2)
      .map((i) => site.plantsById?.get(i.plantId)?.familyId)
      .filter(Boolean),
  );

  for (const plant of plants) {
    if (prefs.easyOnly && plant.difficulty !== "easy") continue;
    if (prefs.fastOnly && plant.daysToMaturity.max > 50) continue;
    if (prefs.pollinatorFriendly && !plant.tags.includes("pollinator")) continue;

    let score = 0;
    const reasons: string[] = [];

    // zone fit (annuals nearly always pass; perennials gate hard)
    if (zone !== undefined) {
      const fits = zone >= plant.hardinessZones.min && zone <= plant.hardinessZones.max;
      score += W.zone * (fits ? 1 : -1);
      if (!fits) reasons.push(`outside zone ${plant.hardinessZones.min}–${plant.hardinessZones.max}`);
    }

    // season proximity (§27.9): open now > opening soon > far away
    const bands = windowsFor(plant, site.climate, year, site.hemisphere).filter((b) => b.kind !== "indoor");
    let opensIn: number | null = null;
    if (bands.length > 0) {
      const open = openNow(bands, today);
      if (open.length > 0) {
        opensIn = -1;
        score += W.season;
        reasons.push(`plantable now (${open[0].kind.replace("_", " ")})`);
      } else {
        const future = bands.map((b) => daysUntilOpen(b, today)).filter((d) => d > 0).sort((a, b) => a - b);
        if (future.length > 0) {
          opensIn = future[0];
          const proximity = Math.max(0, 1 - future[0] / 60);
          score += W.season * proximity;
          if (future[0] <= 30) reasons.push(`window opens in ${future[0]} days`);
          else reasons.push(`window opens in ~${Math.round(future[0] / 7)} weeks`);
        } else {
          score -= W.season * 0.5;
          reasons.push("window closed for this year");
        }
      }
    }

    // sun fit
    if (site.maxTileSunHours !== undefined) {
      const ok = site.maxTileSunHours >= plant.sunHoursMin;
      score += W.sun * (ok ? 1 : -0.5);
      if (ok) reasons.push("a sunny-enough tile exists");
      else reasons.push(`needs ${plant.sunHoursMin}h sun; best tile ~${site.maxTileSunHours.toFixed(0)}h`);
    }

    // space fit
    if (freeTiles !== undefined) {
      const ok = freeTiles >= 1;
      score += W.space * (ok ? 1 : -0.5);
      if (!ok) reasons.push("no free tiles");
    }

    // water alignment: thirsty crops penalized in dry-summer climates and v.v.
    const summerPrecip = summerMonthlyPrecip(site.climate);
    if (summerPrecip !== undefined) {
      const dry = summerPrecip < 40;
      const aligned = dry ? plant.waterNeed !== "high" : true;
      score += W.water * (aligned ? 0.5 : -0.5);
      if (!aligned) reasons.push("thirsty crop for a dry summer (plan irrigation)");
    }

    // companion bonus: a beneficial partner already in the ground
    if (site.companions && placedPlantIds.size > 0) {
      const friend = site.companions.find(
        (c) =>
          c.type === "beneficial" &&
          ((c.aPlantId === plant.id && placedPlantIds.has(c.bPlantId)) ||
            (c.bPlantId === plant.id && placedPlantIds.has(c.aPlantId))),
      );
      if (friend) {
        score += W.companion;
        const partner = friend.aPlantId === plant.id ? friend.bPlantId : friend.aPlantId;
        reasons.push(`good companion already planted (${site.plantsById?.get(partner)?.commonName ?? partner})`);
      }
    }

    // rotation penalty: same family grown in the last two seasons
    if (recentFamilies.has(plant.familyId)) {
      score -= W.rotation * 0.5;
      reasons.push("family grown here recently — rotate beds");
    }

    // difficulty vs experience
    const exp = prefs.experience ?? "beginner";
    const diffPenalty = { easy: 0, moderate: exp === "beginner" ? 0.5 : 0.2, hard: exp === "advanced" ? 0.3 : 1 }[plant.difficulty];
    score -= W.difficulty * diffPenalty;
    if (plant.difficulty === "easy") reasons.push("easy to grow");

    // §31.1 inventory bonus
    const stash = stashBadge(site.packets ?? [], plant);
    if (stash === "in_stash") {
      score += W.inventory;
      reasons.push("seed in your stash");
    } else if (stash === "in_stash_aging") {
      score += W.inventory * 0.4;
      reasons.push("seed in stash (aging — test viability)");
    }

    out.push({ plant, score, reasons: reasons.slice(0, 4), stash, opensInDays: opensIn });
  }

  return out.sort((a, b) => b.score - a.score);
}

function countFreeTiles(garden: Garden): number {
  let free = 0;
  for (const area of garden.areas) {
    const occupied = new Set(
      area.tiles.filter((t) => t.content.type !== "empty").map((t) => `${t.col},${t.row}`),
    );
    free += area.grid.cols * area.grid.rows - occupied.size;
  }
  return free;
}

function summerMonthlyPrecip(climate: ClimateProfile): number | undefined {
  const n = climate.monthlyNormals;
  if (!n || n.length !== 12) return undefined;
  return (n[5].precipMm + n[6].precipMm + n[7].precipMm) / 3; // Jun–Aug
}

/** §15 bed-aware handoff: instances finishing soon + what could follow. */
export interface BedHandoff {
  instance: PlantInstance;
  finishingOn: ISODate;
  daysAway: number;
}

export function finishingSoon(
  instances: PlantInstance[],
  today: ISODate,
  withinDays = 28,
): BedHandoff[] {
  const out: BedHandoff[] = [];
  for (const i of instances) {
    if (i.status !== "active") continue;
    const end = i.projectedStageDates.senescence ?? i.projectedStageDates.harvest;
    if (!end) continue;
    const days = diffDays(today, end);
    if (days >= 0 && days <= withinDays) {
      out.push({ instance: i, finishingOn: end, daysAway: days });
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}
