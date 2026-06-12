/**
 * DiagnosticsEngine (§14): tree resolution by symptom + scope, and auto-check
 * evaluation against the app's own data — the user always sees the evidence
 * and can override (§14).
 */

import type {
  AutoCheck,
  DiagnosticBranch,
  DiagnosticNode,
  DiagnosticTree,
  ViabilityScore,
  WaterloggingRisk,
} from "../types/models";
import { diffDays, type ISODate } from "../lib/dates";

/** Most specific tree wins: plant scope → family scope → unscoped. */
export function findTree(
  trees: DiagnosticTree[],
  symptom: string,
  plantId: string,
  familyId: string,
): DiagnosticTree | undefined {
  const candidates = trees.filter((t) => t.symptom === symptom);
  return (
    candidates.find((t) => t.scope?.plantId === plantId) ??
    candidates.find((t) => t.scope?.familyId === familyId) ??
    candidates.find((t) => !t.scope)
  );
}

export interface AutoCheckContext {
  today: ISODate;
  soilTempC?: number;
  minSoilTempC?: number;
  daysInStage?: number;
  typicalStageDays?: number;
  lastWateredOn?: ISODate;
  waterloggingRisk?: WaterloggingRisk;
  sunHours?: number;
  sunHoursMin?: number;
  seedViability?: ViabilityScore;
}

export interface AutoCheckResult {
  /** null = the app lacks the data; the user must answer */
  answer: boolean | null;
  evidence: string;
}

export function evaluateAutoCheck(
  check: AutoCheck,
  ctx: AutoCheckContext,
): AutoCheckResult {
  switch (check) {
    case "soil_temp_below_min": {
      if (ctx.soilTempC === undefined || ctx.minSoilTempC === undefined)
        return { answer: null, evidence: "No soil-temperature estimate available." };
      const below = ctx.soilTempC < ctx.minSoilTempC;
      return {
        answer: below,
        evidence: `Estimated soil ~${ctx.soilTempC.toFixed(1)}°C vs the plant's ${ctx.minSoilTempC}°C minimum (climate-normals estimate).`,
      };
    }
    case "days_exceeded_expected": {
      if (ctx.daysInStage === undefined || ctx.typicalStageDays === undefined)
        return { answer: null, evidence: "No stage timing on file." };
      return {
        answer: ctx.daysInStage > ctx.typicalStageDays,
        evidence: `${ctx.daysInStage} days in stage vs ~${ctx.typicalStageDays} typical.`,
      };
    }
    case "no_recent_water": {
      // phrased in trees as "has it been watered/kept moist?" — answer TRUE
      // means "yes, watered recently".
      if (!ctx.lastWateredOn)
        return { answer: null, evidence: "No watering log for this plant." };
      const days = diffDays(ctx.lastWateredOn, ctx.today);
      return {
        answer: days <= 4,
        evidence: `Last logged watering ${days} day${days === 1 ? "" : "s"} ago.`,
      };
    }
    case "low_light": {
      if (ctx.sunHours === undefined || ctx.sunHoursMin === undefined)
        return { answer: null, evidence: "No sun estimate for this tile (toggle the sun map in the Designer)." };
      return {
        answer: ctx.sunHours < ctx.sunHoursMin,
        evidence: `Sun model estimates ${ctx.sunHours.toFixed(1)}h direct sun vs ${ctx.sunHoursMin}h needed.`,
      };
    }
    case "seed_past_viability": {
      if (!ctx.seedViability)
        return { answer: null, evidence: "No seed packet on file for this plant (§31.1)." };
      return {
        answer: ctx.seedViability === "aging" || ctx.seedViability === "expired",
        evidence: `Linked seed packet rates "${ctx.seedViability}".`,
      };
    }
    case "soil_saturated_recent": {
      if (!ctx.waterloggingRisk)
        return { answer: null, evidence: "No recent precipitation data cached." };
      return {
        answer: ctx.waterloggingRisk !== "none",
        evidence: `Waterlogging risk is "${ctx.waterloggingRisk}" from recent rain, drainage, and tile elevation (§31.2).`,
      };
    }
    default:
      return { answer: null, evidence: "" };
  }
}

/** Follow a branch; type-narrowing helper for the UI walk. */
export function branchTarget(
  node: DiagnosticNode,
  answer: boolean,
): DiagnosticBranch {
  return answer ? node.yes : node.no;
}

/** Depth of a tree (for tests / progress hints). */
export function treeDepth(branch: DiagnosticBranch): number {
  if (branch.kind === "diagnosis") return 0;
  return 1 + Math.max(treeDepth(branch.node.yes), treeDepth(branch.node.no));
}
